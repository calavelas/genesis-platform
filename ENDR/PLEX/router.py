from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from pathlib import Path

from TARS.scaffold.service import CreateServiceRequest, CreateServiceResponse, create_service
from PLEX.plex import PlexUniverse, build_plex_universe, load_plex_configs

router = APIRouter()


class CreateTemplateOption(BaseModel):
    name: str
    description: str = ""
    path: str = ""
    previewFiles: list[str] = Field(default_factory=list)
    previewNote: str = ""


class CreateOptionsResponse(BaseModel):
    serviceTemplates: list[CreateTemplateOption]
    gitopsTemplates: list[CreateTemplateOption]
    namespaces: list[CreateTemplateOption]
    kubernetesEnvironments: list[CreateTemplateOption]
    existingServices: list[str]


class CreateServiceFromPortalRequest(BaseModel):
    serviceName: str = Field(min_length=1, max_length=48)
    namespace: str = Field(min_length=1)
    environment: str = Field(min_length=1)
    serviceTemplate: str = Field(min_length=1)
    gitopsTemplate: str = Field(min_length=1)
    gatewayEnabled: bool = True
    branchName: str | None = None
    dryRun: bool = False


class TemplateFileResponse(BaseModel):
    templateType: str
    templateName: str
    filePath: str
    size: int
    content: str
    contentEncoding: str = "utf-8"
    truncated: bool = False


_TEMPLATE_FILE_PREVIEW_MAX_BYTES = 128 * 1024


def _build_template_preview(repo_root: Path, template_path: str, limit: int = 12) -> tuple[list[str], str]:
    path = template_path.strip()
    if not path:
        return [], "template path is empty"

    if path.startswith(("http://", "https://", "git@", "ssh://")) or path.endswith(".git"):
        return [], "remote template preview is unavailable"

    resolved = (repo_root / path).resolve()
    if not resolved.exists():
        return [], "template path not found in repository"

    files_root = resolved / "files"
    if not files_root.exists():
        return [], "template files/ directory is missing"

    preview_files = [
        candidate.relative_to(files_root).as_posix()
        for candidate in sorted(files_root.rglob("*"))
        if candidate.is_file()
    ]
    if not preview_files:
        return [], "template has no files"

    if len(preview_files) > limit:
        return preview_files[:limit], f"showing first {limit} of {len(preview_files)} files"
    return preview_files, ""


def _build_template_option(template: object, repo_root: Path) -> CreateTemplateOption:
    name = str(getattr(template, "name", "")).strip()
    description = str(getattr(template, "description", "")).strip()
    path = str(getattr(template, "path", "")).strip()
    preview_files, preview_note = _build_template_preview(repo_root, path)
    return CreateTemplateOption(
        name=name,
        description=description,
        path=path,
        previewFiles=preview_files,
        previewNote=preview_note,
    )


def _resolve_local_template_root(repo_root: Path, template_path: str) -> Path:
    path = template_path.strip()
    if not path:
        raise ValueError("template path is empty")

    if path.startswith(("http://", "https://", "git@", "ssh://")) or path.endswith(".git"):
        raise ValueError("remote templates are not supported for file preview")

    resolved = (repo_root / path).resolve()
    if not resolved.exists():
        raise ValueError("template path not found in repository")

    files_root = (resolved / "files").resolve()
    if not files_root.exists() or not files_root.is_dir():
        raise ValueError("template files/ directory is missing")

    return files_root


def _read_template_file(files_root: Path, file_path: str) -> tuple[int, str, bool]:
    normalized = file_path.strip().lstrip("/")
    if not normalized:
        raise ValueError("filePath is required")

    target = (files_root / normalized).resolve()
    try:
        target.relative_to(files_root)
    except ValueError as exc:
        raise ValueError("filePath escapes template files root") from exc

    if not target.exists() or not target.is_file():
        raise ValueError("template file not found")

    raw = target.read_bytes()
    preview = raw[:_TEMPLATE_FILE_PREVIEW_MAX_BYTES]
    text = preview.decode("utf-8", errors="replace")
    truncated = len(raw) > _TEMPLATE_FILE_PREVIEW_MAX_BYTES
    return len(raw), text, truncated


@router.get("/api/plex", response_model=PlexUniverse)
def get_plex_universe() -> PlexUniverse:
    try:
        return build_plex_universe()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"unable to build PLEX universe: {exc}") from exc


@router.get("/api/plex/templates", response_model=CreateOptionsResponse)
def get_create_options() -> CreateOptionsResponse:
    try:
        idp_config, services_config, _paths, _svcs_url = load_plex_configs()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"unable to load PLEX create options: {exc}") from exc

    repo_root = Path(_paths.repoRoot).resolve()
    service_templates = [_build_template_option(template, repo_root) for template in idp_config.templates.service]
    gitops_templates = [_build_template_option(template, repo_root) for template in idp_config.templates.gitops]
    namespace_options = [
        CreateTemplateOption(name=namespace.name, description=namespace.description)
        for namespace in idp_config.config.namespace
    ]
    environment_options = [
        CreateTemplateOption(name=environment.name, description=environment.description)
        for environment in idp_config.config.environments.kubernetes
    ]
    if not namespace_options:
        namespace_options = [CreateTemplateOption(name="default", description="Default namespace")]
    if not environment_options:
        environment_options = [
            CreateTemplateOption(name=alias, description="")
            for alias in sorted(idp_config.config.clusters.keys())
        ]
    existing_services = sorted(service.name for service in services_config.services)

    return CreateOptionsResponse(
        serviceTemplates=service_templates,
        gitopsTemplates=gitops_templates,
        namespaces=namespace_options,
        kubernetesEnvironments=environment_options,
        existingServices=existing_services,
    )


@router.get("/api/plex/template-file", response_model=TemplateFileResponse)
def get_template_file(templateType: str, templateName: str, filePath: str) -> TemplateFileResponse:
    requested_type = templateType.strip().lower()
    requested_name = templateName.strip()
    requested_path = filePath.strip()
    if requested_type not in {"service", "gitops"}:
        raise HTTPException(status_code=400, detail="templateType must be one of: service, gitops")
    if not requested_name:
        raise HTTPException(status_code=400, detail="templateName is required")
    if not requested_path:
        raise HTTPException(status_code=400, detail="filePath is required")

    try:
        idp_config, _services_config, paths, _svcs_url = load_plex_configs()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"unable to load template file options: {exc}") from exc

    catalog = idp_config.templates.service if requested_type == "service" else idp_config.templates.gitops
    template_path = ""
    for template in catalog:
        name = str(getattr(template, "name", "")).strip()
        if name == requested_name:
            template_path = str(getattr(template, "path", "")).strip()
            break
    if not template_path:
        raise HTTPException(status_code=404, detail=f"template not found: {requested_name}")

    repo_root = Path(paths.repoRoot).resolve()
    try:
        files_root = _resolve_local_template_root(repo_root, template_path)
        size, content, truncated = _read_template_file(files_root, requested_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"unable to read template file: {exc}") from exc

    return TemplateFileResponse(
        templateType=requested_type,
        templateName=requested_name,
        filePath=requested_path,
        size=size,
        content=content,
        contentEncoding="utf-8",
        truncated=truncated,
    )


@router.post("/api/plex/services", response_model=CreateServiceResponse)
def create_service_from_portal(payload: CreateServiceFromPortalRequest) -> CreateServiceResponse:
    request = CreateServiceRequest(
        name=payload.serviceName.strip(),
        namespace=payload.namespace.strip(),
        environments=[payload.environment.strip()],
        serviceTemplate=payload.serviceTemplate.strip(),
        gitopsTemplate=payload.gitopsTemplate.strip(),
        gatewayEnabled=payload.gatewayEnabled,
        dryRun=payload.dryRun,
        branchName=payload.branchName.strip() if payload.branchName and payload.branchName.strip() else None,
    )
    try:
        return create_service(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
