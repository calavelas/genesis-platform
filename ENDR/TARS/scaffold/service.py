from __future__ import annotations

import shutil
from datetime import UTC, datetime
import os
from pathlib import Path

from jinja2 import Environment, StrictUndefined
from pydantic import AliasChoices, BaseModel, Field

from TARS.config.loader import load_all_configs
from TARS.config.paths import (
    DEFAULT_ARGOCD_NAMESPACE,
    DEFAULT_SERVICE_NAMESPACE,
    active_cluster_alias,
    service_app_manifest_repo_path,
)
from TARS.config.models import (
    IDPConfig,
    GatewayConfig,
    ResourceConfig,
    ServiceEntry,
    ServiceOverrides,
    TemplateRef,
)
from TARS.scaffold.github_client import GitHubAPIError, GitHubClient


class CreateServiceRequest(BaseModel):
    name: str
    image: str | None = None
    port: int = Field(default=8080, ge=1, le=65535)
    namespace: str | None = None
    environments: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("environments", "deployTo"),
    )
    env: dict[str, str] = Field(default_factory=dict)
    resources: ResourceConfig | None = None
    gatewayEnabled: bool = Field(
        default=True,
        validation_alias=AliasChoices("gatewayEnabled", "ingressEnabled"),
    )
    serviceTemplate: str | None = None
    gitopsTemplate: str | None = None
    dryRun: bool = True
    branchName: str | None = None


class GeneratedFile(BaseModel):
    path: str
    size: int


class CreateServiceResponse(BaseModel):
    serviceName: str
    dryRun: bool
    stagingPath: str
    generatedFiles: list[GeneratedFile]
    branchName: str | None = None
    pullRequestUrl: str | None = None
    pullRequestNumber: int | None = None


def _find_template(template_catalog: list[TemplateRef], template_name: str) -> TemplateRef:
    for template in template_catalog:
        if template.name == template_name:
            return template
    raise ValueError(f"template not found: {template_name}")


def _resolve_local_template_path(repo_root: Path, template: TemplateRef) -> Path:
    template_path = template.path
    if template_path.startswith(("http://", "https://", "git@", "ssh://")) or template_path.endswith(".git"):
        raise ValueError(
            f"remote template path is not supported yet for V1 local demo: {template.path}"
        )
    abs_path = (repo_root / template_path).resolve()
    if not abs_path.exists():
        raise ValueError(f"template path does not exist: {template.path}")
    return abs_path


def _build_overrides(request: CreateServiceRequest) -> ServiceOverrides:
    gateway = GatewayConfig(enabled=request.gatewayEnabled)
    return ServiceOverrides(
        image=request.image,
        port=request.port,
        env=request.env,
        resources=request.resources,
        gateway=gateway,
    )


def _build_service_entry(
    request: CreateServiceRequest,
    namespace: str,
    environments: list[str],
    service_template_name: str,
    gitops_template_name: str,
) -> ServiceEntry:
    return ServiceEntry(
        name=request.name,
        namespace=namespace,
        environments=environments,
        generator={
            "service": {"template": service_template_name},
            "gitops": {"template": gitops_template_name},
        },
        overrides=_build_overrides(request),
    )


def _split_image(image: str) -> tuple[str, str]:
    if ":" in image and image.rfind(":") > image.rfind("/"):
        repository, tag = image.rsplit(":", 1)
        return repository, tag
    return image, "0.1.0"


def _build_template_context(
    service: ServiceEntry,
    github_owner: str,
    github_repo: str,
    argocd_namespace: str,
) -> dict[str, object]:
    image = service.overrides.image or f"{github_owner}/{service.name}:0.1.0"
    image_repository, image_tag = _split_image(image)

    requests_cpu = "100m"
    requests_memory = "128Mi"
    limits_cpu = "250m"
    limits_memory = "256Mi"
    if service.overrides.resources:
        requests_cpu = service.overrides.resources.requests.cpu
        requests_memory = service.overrides.resources.requests.memory
        limits_cpu = service.overrides.resources.limits.cpu
        limits_memory = service.overrides.resources.limits.memory

    gateway_enabled = "true" if service.overrides.gateway.enabled else "false"
    gateway_hostname = f"{service.name}.svcs.calavelas.net"

    return {
        "service_name": service.name,
        "namespace": service.namespace,
        "port": service.overrides.port,
        "github_owner": github_owner,
        "github_repo": github_repo,
        "argocd_namespace": argocd_namespace,
        "image_repository": image_repository,
        "image_tag": image_tag,
        "requests_cpu": requests_cpu,
        "requests_memory": requests_memory,
        "limits_cpu": limits_cpu,
        "limits_memory": limits_memory,
        "gateway_enabled": gateway_enabled,
        "gateway_hostname": gateway_hostname,
        "env": service.overrides.env,
    }


def _render_template_tree(template_root: Path, out_dir: Path, context: dict[str, object]) -> None:
    files_root = template_root / "files"
    if not files_root.exists():
        raise ValueError(f"template missing files/ directory: {template_root}")

    env = Environment(undefined=StrictUndefined, autoescape=False, keep_trailing_newline=True)

    for source in sorted(files_root.rglob("*")):
        relative = source.relative_to(files_root)
        target_relative = Path(*relative.parts)

        if source.is_dir():
            (out_dir / target_relative).mkdir(parents=True, exist_ok=True)
            continue

        target_file = out_dir / target_relative
        if target_file.name.endswith(".j2"):
            target_file = target_file.with_name(target_file.name[:-3])

        target_file.parent.mkdir(parents=True, exist_ok=True)

        if source.name.endswith(".j2"):
            template_text = source.read_text(encoding="utf-8")
            rendered = env.from_string(template_text).render(**context)
            target_file.write_text(rendered, encoding="utf-8")
        else:
            target_file.write_bytes(source.read_bytes())


def _service_entry_dict(service: ServiceEntry) -> dict[str, object]:
    overrides: dict[str, object] = {
        "gateway": {
            "enabled": service.overrides.gateway.enabled,
        }
    }
    if service.overrides.image:
        overrides["image"] = service.overrides.image
    if service.overrides.port != 8080:
        overrides["port"] = service.overrides.port
    if service.overrides.env:
        overrides["env"] = service.overrides.env
    if service.overrides.resources:
        overrides["resources"] = {
            "requests": {
                "cpu": service.overrides.resources.requests.cpu,
                "memory": service.overrides.resources.requests.memory,
            },
            "limits": {
                "cpu": service.overrides.resources.limits.cpu,
                "memory": service.overrides.resources.limits.memory,
            },
        }

    entry: dict[str, object] = {
        "name": service.name,
        "namespace": service.namespace,
        "environments": service.environments,
        "generator": {
            "service": {"template": service.generator.service.template},
            "gitops": {"template": service.generator.gitops.template},
        },
        "overrides": overrides,
    }
    return entry


def _render_updated_services_config_bytes(raw_services_config: bytes, service: ServiceEntry) -> bytes:
    try:
        import yaml
    except ModuleNotFoundError as exc:
        raise RuntimeError("PyYAML is required for services config updates") from exc

    raw_data = yaml.safe_load(raw_services_config.decode("utf-8")) or {}
    if not isinstance(raw_data, dict):
        raise ValueError("SVCS.yaml root must be a mapping")

    existing_services = raw_data.get("services", [])
    if not isinstance(existing_services, list):
        raise ValueError("SVCS.yaml services must be a list")

    for existing in existing_services:
        if isinstance(existing, dict) and existing.get("name") == service.name:
            raise ValueError(f"service already exists in SVCS.yaml: {service.name}")

    existing_services.append(_service_entry_dict(service))
    raw_data["services"] = existing_services
    rendered = yaml.safe_dump(raw_data, sort_keys=False, allow_unicode=False)
    return rendered.encode("utf-8")


def _render_updated_services_config(services_config_path: Path, service: ServiceEntry) -> bytes:
    return _render_updated_services_config_bytes(
        services_config_path.read_bytes(),
        service,
    )


def _collect_commit_files(
    stage_service_dir: Path,
    stage_gitops_dir: Path,
    idp_config: IDPConfig,
    service: ServiceEntry,
) -> dict[str, bytes]:
    files: dict[str, bytes] = {}

    for file_path in sorted(stage_service_dir.rglob("*")):
        if not file_path.is_file():
            continue
        relative = file_path.relative_to(stage_service_dir).as_posix()
        repo_path = f"SVCS/{service.name}/{relative}"
        files[repo_path] = file_path.read_bytes()

    for file_path in sorted(stage_gitops_dir.rglob("*")):
        if not file_path.is_file():
            continue
        relative = file_path.relative_to(stage_gitops_dir).as_posix()
        if relative == "argocd-application.yaml":
            repo_path = service_app_manifest_repo_path(
                idp_config,
                service.name,
                service.environments[0] if service.environments else None,
            )
        else:
            repo_path = f"SVCS/{service.name}/chart/{relative}"
        files[repo_path] = file_path.read_bytes()

    return files


def render_scaffold_for_service(
    service: ServiceEntry,
    idp_config: IDPConfig,
    repo_root: Path,
    staging_root: Path,
) -> dict[str, bytes]:
    service_template_name = service.generator.service.template
    gitops_template_name = service.generator.gitops.template
    service_template = _find_template(idp_config.templates.service, service_template_name)
    gitops_template = _find_template(idp_config.templates.gitops, gitops_template_name)
    service_template_path = _resolve_local_template_path(repo_root, service_template)
    gitops_template_path = _resolve_local_template_path(repo_root, gitops_template)

    context = _build_template_context(
        service,
        idp_config.config.git.owner,
        idp_config.config.git.repo,
        DEFAULT_ARGOCD_NAMESPACE,
    )

    stage_service_dir = staging_root / "service"
    stage_gitops_dir = staging_root / "gitops"
    if staging_root.exists():
        shutil.rmtree(staging_root, ignore_errors=True)
    stage_service_dir.mkdir(parents=True, exist_ok=True)
    stage_gitops_dir.mkdir(parents=True, exist_ok=True)

    _render_template_tree(service_template_path, stage_service_dir, context)
    _render_template_tree(gitops_template_path, stage_gitops_dir, context)
    return _collect_commit_files(stage_service_dir, stage_gitops_dir, idp_config, service)


def _build_branch_name(service_name: str) -> str:
    timestamp = datetime.now(tz=UTC).strftime("%Y%m%d%H%M%S")
    return f"case/{service_name}-{timestamp}"


def _validate_template_selection(
    idp_config: IDPConfig,
    repo_root: Path,
    service_template_name: str,
    gitops_template_name: str,
) -> None:
    service_template = _find_template(idp_config.templates.service, service_template_name)
    gitops_template = _find_template(idp_config.templates.gitops, gitops_template_name)
    _resolve_local_template_path(repo_root, service_template)
    _resolve_local_template_path(repo_root, gitops_template)


def create_service(request: CreateServiceRequest) -> CreateServiceResponse:
    idp_config, services_config, paths = load_all_configs()
    repo_root = Path(paths.repoRoot)
    services_config_path = Path(paths.servicesConfigPath).resolve()

    service_template_name = request.serviceTemplate or (
        idp_config.templates.service[0].name if idp_config.templates.service else ""
    )
    gitops_template_name = request.gitopsTemplate or (
        idp_config.templates.gitops[0].name if idp_config.templates.gitops else ""
    )
    if not service_template_name or not gitops_template_name:
        raise ValueError("service and gitops templates must be configured in ENDR.yaml")
    _validate_template_selection(
        idp_config=idp_config,
        repo_root=repo_root,
        service_template_name=service_template_name,
        gitops_template_name=gitops_template_name,
    )

    for existing in services_config.services:
        if existing.name == request.name:
            raise ValueError(f"service already exists in SVCS.yaml: {request.name}")

    namespace = request.namespace or DEFAULT_SERVICE_NAMESPACE
    environments = request.environments if request.environments else [active_cluster_alias(idp_config)]
    service = _build_service_entry(
        request,
        namespace,
        environments,
        service_template_name,
        gitops_template_name,
    )

    known_clusters = set(idp_config.config.clusters.keys())
    unknown_clusters = [cluster for cluster in service.environments if cluster not in known_clusters]
    if unknown_clusters:
        raise ValueError(
            f"unknown environments: {', '.join(sorted(set(unknown_clusters)))}"
        )

    staging_root = repo_root / ".idp" / "staging" / service.name
    if request.dryRun:
        commit_files = render_scaffold_for_service(
            service=service,
            idp_config=idp_config,
            repo_root=repo_root,
            staging_root=staging_root,
        )
    else:
        if staging_root.exists():
            shutil.rmtree(staging_root, ignore_errors=True)
        staging_root.mkdir(parents=True, exist_ok=True)
        commit_files: dict[str, bytes] = {}

    try:
        relative_services_config = services_config_path.relative_to(repo_root).as_posix()
    except ValueError as exc:
        raise ValueError("SVCS.yaml must be inside repository root for PR workflow") from exc

    github_token = os.environ.get("GITHUB_TOKEN")
    if not request.dryRun and not github_token:
        raise ValueError("GITHUB_TOKEN is required when dryRun=false")

    if request.dryRun:
        commit_files[relative_services_config] = _render_updated_services_config(services_config_path, service)
    else:
        github_client = GitHubClient(
            token=github_token or "",
            owner=idp_config.config.git.owner,
            repo=idp_config.config.git.repo,
        )
        base_branch = idp_config.config.git.defaultBranch
        remote_services_config = github_client.get_file_content(base_branch, relative_services_config)
        if remote_services_config is not None:
            commit_files[relative_services_config] = _render_updated_services_config_bytes(remote_services_config, service)
        else:
            commit_files[relative_services_config] = _render_updated_services_config(services_config_path, service)

    preview_config_file = staging_root / "SVCS.yaml"
    preview_config_file.write_bytes(commit_files[relative_services_config])

    response = CreateServiceResponse(
        serviceName=service.name,
        dryRun=request.dryRun,
        stagingPath=str(staging_root),
        generatedFiles=[
            GeneratedFile(path=path, size=len(content))
            for path, content in sorted(commit_files.items(), key=lambda item: item[0])
        ],
    )

    if request.dryRun:
        return response

    branch_name = request.branchName or _build_branch_name(service.name)
    github_client = GitHubClient(
        token=github_token or "",
        owner=idp_config.config.git.owner,
        repo=idp_config.config.git.repo,
    )
    base_branch = idp_config.config.git.defaultBranch
    try:
        base_sha = github_client.get_ref_sha(base_branch)
        github_client.create_branch(branch_name, base_sha)

        for file_path, content in sorted(commit_files.items(), key=lambda item: item[0]):
            if file_path == relative_services_config:
                commit_message = f"feat(idp): register service {service.name} in SVCS.yaml"
            else:
                commit_message = f"feat(idp): scaffold {service.name} ({file_path})"
            github_client.create_or_update_file(
                branch=branch_name,
                file_path=file_path,
                content_bytes=content,
                commit_message=commit_message,
            )

        pr = github_client.create_pull_request(
            title=f"CASE - Adding service : {service.name}",
            body=(
                f"Registered by IDP API.\n\n"
                f"- service: `{service.name}`\n"
                f"- namespace: `{service.namespace}`\n"
                f"- changed files in PR: `SVCS.yaml` only\n"
                f"- post-merge generation: handled by TARS GitHub workflow"
            ),
            head=branch_name,
            base=base_branch,
        )
    except GitHubAPIError as exc:
        raise ValueError(
            f"github api failure during branch/commit/pr flow for '{branch_name}': {exc}"
        ) from exc

    response.branchName = branch_name
    response.pullRequestUrl = pr.html_url
    response.pullRequestNumber = pr.number
    return response
