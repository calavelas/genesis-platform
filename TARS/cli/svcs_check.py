#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml


@dataclass(slots=True)
class ServiceReconcileResult:
    name: str
    expected_file_count: int
    needs_reconcile: bool
    service_synced: bool
    gitops_synced: bool
    app_synced: bool
    changed_files: list[str]
    missing_files: list[str]


@dataclass(slots=True)
class RemovedServiceResult:
    name: str
    deleted_files: list[str]


README_SVCS_START = "<!-- TARS:SVCS_TABLE_START -->"
README_SVCS_END = "<!-- TARS:SVCS_TABLE_END -->"


def write_github_output(values: dict[str, str]) -> None:
    output_path = os.getenv("GITHUB_OUTPUT")
    if not output_path:
        return

    with Path(output_path).open("a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write(f"{key}={value}\n")


def classify_component(service_name: str, repo_path: str) -> str:
    if repo_path == f"KUBE/clusters/local/apps/{service_name}.yaml":
        return "app"
    if repo_path.startswith(f"SVCS/{service_name}/chart/"):
        return "gitops"
    return "service"


def load_api_modules(repo_root: Path) -> tuple[Any, Any, Any, Any]:
    from TARS.config.loader import load_all_configs
    from TARS.scaffold.github_client import GitHubAPIError, GitHubClient
    from TARS.scaffold.service import render_scaffold_for_service

    return load_all_configs, render_scaffold_for_service, GitHubClient, GitHubAPIError


def ensure_runtime_paths(runtime_dir: Path, state_file: Path) -> None:
    runtime_dir.mkdir(parents=True, exist_ok=True)
    state_file.parent.mkdir(parents=True, exist_ok=True)


def build_branch_name(prefix: str) -> str:
    normalized = prefix.rstrip("-")
    ts = datetime.now(tz=UTC).strftime("%Y%m%d%H%M%S")
    return f"{normalized}-{ts}"


def pick_branch_name(client: Any, requested_branch: str) -> str:
    if not client.branch_exists(requested_branch):
        return requested_branch

    for i in range(1, 20):
        candidate = f"{requested_branch}-{i}"
        if not client.branch_exists(candidate):
            return candidate

    raise RuntimeError(f"unable to pick unique branch name from prefix: {requested_branch}")


def _cleanup_empty_dirs(path: Path, stop_at: Path) -> None:
    current = path.parent
    while current != stop_at and current.exists():
        try:
            current.rmdir()
        except OSError:
            break
        current = current.parent


def apply_to_worktree(repo_root: Path, files: dict[str, bytes], delete_files: list[str]) -> None:
    for relative_path, content in sorted(files.items()):
        target = repo_root / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)

    for relative_path in sorted(set(delete_files), reverse=True):
        target = repo_root / relative_path
        if target.exists() and target.is_file():
            target.unlink()
            _cleanup_empty_dirs(target, repo_root)


def write_state_file(state_file: Path, project_name: str, state_map: dict[str, bool]) -> None:
    data = {
        "projectName": project_name,
        "type": "services-reconcile",
        "state": state_map,
    }
    rendered = yaml.safe_dump(data, sort_keys=False, allow_unicode=False)
    state_file.write_text(rendered, encoding="utf-8")


def discover_managed_services(repo_root: Path) -> set[str]:
    managed: set[str] = set()
    services_root = repo_root / "SVCS"
    if services_root.exists():
        for entry in services_root.iterdir():
            if not entry.is_dir():
                continue
            if entry.name in {"examples"} or entry.name.startswith("."):
                continue
            if (entry / "chart" / "values.yaml").exists() or (entry / "Dockerfile").exists():
                managed.add(entry.name)

    apps_root = repo_root / "KUBE" / "clusters" / "local" / "apps"
    if apps_root.exists():
        for file_path in apps_root.glob("*.y*ml"):
            if not file_path.is_file():
                continue
            if file_path.name.upper().startswith("README"):
                continue
            managed.add(file_path.stem)
    return managed


def collect_service_files_for_delete(repo_root: Path, service_name: str) -> list[str]:
    files: set[str] = set()
    app_file = repo_root / "KUBE" / "clusters" / "local" / "apps" / f"{service_name}.yaml"
    if app_file.exists() and app_file.is_file():
        files.add(app_file.relative_to(repo_root).as_posix())

    service_root = repo_root / "SVCS" / service_name
    if service_root.exists() and service_root.is_dir():
        for file_path in service_root.rglob("*"):
            if file_path.is_file():
                files.add(file_path.relative_to(repo_root).as_posix())

    return sorted(files)


def _git_first_commit_date(repo_root: Path, service_name: str) -> str | None:
    cmd = [
        "git",
        "log",
        "--diff-filter=A",
        "--follow",
        "--reverse",
        "--format=%as",
        "--",
        f"SVCS/{service_name}",
    ]
    completed = subprocess.run(  # noqa: S603
        cmd,
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        return None

    for line in completed.stdout.splitlines():
        value = line.strip()
        if value:
            return value
    return None


def service_create_date(repo_root: Path, service: Any) -> str:
    if getattr(service, "createdAt", None):
        return str(service.createdAt)

    history_date = _git_first_commit_date(repo_root, service.name)
    if history_date:
        return history_date
    return datetime.now(tz=UTC).date().isoformat()


def build_service_table_section(repo_root: Path, services: list[Any]) -> str:
    lines = [
        README_SVCS_START,
        f"Total Services Running: {len(services)}",
        "",
        "| Service Name | Template | Create Date |",
        "| --- | --- | --- |",
    ]

    for service in sorted(services, key=lambda item: item.name):
        template_name = service.generator.service.template
        create_date = service_create_date(repo_root, service)
        lines.append(f"| {service.name} | {template_name} | {create_date} |")

    if not services:
        lines.append("| - | - | - |")

    lines.append(README_SVCS_END)
    return "\n".join(lines)


def update_readme_service_table(repo_root: Path, services: list[Any]) -> bytes | None:
    readme_path = repo_root / "README.md"
    if not readme_path.exists():
        return None

    current = readme_path.read_text(encoding="utf-8")
    section = build_service_table_section(repo_root, services)

    if README_SVCS_START in current and README_SVCS_END in current:
        start = current.index(README_SVCS_START)
        end = current.index(README_SVCS_END) + len(README_SVCS_END)
        updated = f"{current[:start].rstrip()}\n\n{section}\n{current[end:].lstrip()}"
    else:
        suffix = "\n" if current.endswith("\n") else "\n\n"
        updated = f"{current}{suffix}{section}\n"

    if updated == current:
        return None
    return updated.encode("utf-8")


def classify_service_changes(
    results: list[ServiceReconcileResult],
    removed_results: list[RemovedServiceResult],
) -> tuple[list[str], list[str], list[str]]:
    added_services: list[str] = []
    updated_services: list[str] = []

    for result in results:
        if not result.needs_reconcile:
            continue
        if len(result.missing_files) == result.expected_file_count and len(result.changed_files) == 0:
            added_services.append(result.name)
        else:
            updated_services.append(result.name)

    removed_services = sorted(removed.name for removed in removed_results)
    return sorted(added_services), sorted(updated_services), removed_services


def build_pr_title(
    *,
    added_services: list[str],
    updated_services: list[str],
    removed_services: list[str],
) -> str:
    parts: list[str] = []
    if updated_services:
        parts.append(f"Updating {len(updated_services)}")
    if added_services:
        parts.append(f"Adding {len(added_services)}")
    if removed_services:
        parts.append(f"Removing {len(removed_services)}")
    if not parts:
        parts.append("Updating 0")

    total = len(set([*added_services, *updated_services, *removed_services]))
    total_label = "Service" if total == 1 else "Services"
    return f"TARS : {' / '.join(parts)} ({total} {total_label})"


def build_pr_body(
    *,
    added_services: list[str],
    updated_services: list[str],
    removed_services: list[str],
    upsert_files: dict[str, bytes],
    delete_files: list[str],
) -> str:
    def format_list(values: list[str]) -> str:
        return ", ".join(values) if values else "none"

    total = len(set([*added_services, *updated_services, *removed_services]))
    lines = [
        "Automated reconcile from `ENDR.yaml` and `SVCS.yaml`.",
        "",
        "Summary:",
        f"- Total changed services: {total}",
        f"- Added services ({len(added_services)}): {format_list(added_services)}",
        f"- Updated services ({len(updated_services)}): {format_list(updated_services)}",
        f"- Removed services ({len(removed_services)}): {format_list(removed_services)}",
        f"- Upsert files: {len(upsert_files)}",
        f"- Delete files: {len(delete_files)}",
    ]
    return "\n".join(lines)


def reconcile(
    repo_root: Path, runtime_dir: Path
) -> tuple[Any, list[ServiceReconcileResult], dict[str, bytes], list[str], list[RemovedServiceResult]]:
    load_all_configs, render_scaffold_for_service, _, _ = load_api_modules(repo_root)
    idp_config, services_config, _ = load_all_configs()

    reconcile_root = runtime_dir / "staging" / "tars"
    reconcile_root.mkdir(parents=True, exist_ok=True)

    results: list[ServiceReconcileResult] = []
    upsert_files: dict[str, bytes] = {}

    for service in services_config.services:
        staging_root = reconcile_root / service.name
        expected_files = render_scaffold_for_service(
            service=service,
            idp_config=idp_config,
            repo_root=repo_root,
            staging_root=staging_root,
        )

        component_synced = {"service": True, "gitops": True, "app": True}
        changed_files: list[str] = []
        missing_files: list[str] = []

        for relative_path, expected_content in sorted(expected_files.items()):
            target = repo_root / relative_path
            component = classify_component(service.name, relative_path)
            if not target.exists():
                component_synced[component] = False
                missing_files.append(relative_path)
                upsert_files[relative_path] = expected_content
                continue

            current_content = target.read_bytes()
            if current_content != expected_content:
                component_synced[component] = False
                changed_files.append(relative_path)
                upsert_files[relative_path] = expected_content

        needs_reconcile = len(changed_files) > 0 or len(missing_files) > 0
        results.append(
            ServiceReconcileResult(
                name=service.name,
                expected_file_count=len(expected_files),
                needs_reconcile=needs_reconcile,
                service_synced=component_synced["service"],
                gitops_synced=component_synced["gitops"],
                app_synced=component_synced["app"],
                changed_files=changed_files,
                missing_files=missing_files,
            )
        )

    desired_services = {service.name for service in services_config.services}
    managed_services = discover_managed_services(repo_root)
    removed_services = sorted(managed_services - desired_services)

    removed_results: list[RemovedServiceResult] = []
    delete_files: list[str] = []
    for removed_service in removed_services:
        deleted_files = collect_service_files_for_delete(repo_root, removed_service)
        if not deleted_files:
            continue
        delete_files.extend(deleted_files)
        removed_results.append(
            RemovedServiceResult(name=removed_service, deleted_files=deleted_files)
        )

    readme_content = update_readme_service_table(repo_root, services_config.services)
    if readme_content is not None:
        upsert_files["README.md"] = readme_content

    return idp_config, results, upsert_files, sorted(set(delete_files)), removed_results


def open_reconcile_pr(
    *,
    repo_root: Path,
    idp_config: Any,
    upsert_files: dict[str, bytes],
    delete_files: list[str],
    added_services: list[str],
    updated_services: list[str],
    removed_services: list[str],
    github_token: str,
    branch_prefix: str,
    base_branch_override: str | None,
) -> tuple[str, int, str]:
    _, _, GitHubClient, GitHubAPIError = load_api_modules(repo_root)

    if not github_token:
        raise ValueError("GITHUB_TOKEN is required when --open-pr is used")

    github_client = GitHubClient(
        token=github_token,
        owner=idp_config.config.git.owner,
        repo=idp_config.config.git.repo,
    )

    requested_branch = build_branch_name(branch_prefix)
    branch_name = pick_branch_name(github_client, requested_branch)
    base_branch = base_branch_override or idp_config.config.git.defaultBranch

    try:
        base_sha = github_client.get_ref_sha(base_branch)
        github_client.create_branch(branch_name, base_sha)

        for file_path, content in sorted(upsert_files.items()):
            github_client.create_or_update_file(
                branch=branch_name,
                file_path=file_path,
                content_bytes=content,
                commit_message=f"feat(tars): reconcile generated assets ({file_path})",
            )
        for file_path in sorted(set(delete_files), reverse=True):
            github_client.delete_file(
                branch=branch_name,
                file_path=file_path,
                commit_message=f"feat(tars): remove decommissioned service asset ({file_path})",
            )

        pr = github_client.create_pull_request(
            title=build_pr_title(
                added_services=added_services,
                updated_services=updated_services,
                removed_services=removed_services,
            ),
            body=build_pr_body(
                added_services=added_services,
                updated_services=updated_services,
                removed_services=removed_services,
                upsert_files=upsert_files,
                delete_files=delete_files,
            ),
            head=branch_name,
            base=base_branch,
        )
        return branch_name, pr.number, pr.html_url
    except GitHubAPIError as exc:
        raise RuntimeError(f"github api failure during reconcile PR flow: {exc}") from exc


def build_summary(
    *,
    state_file: Path,
    project_name: str,
    results: list[ServiceReconcileResult],
    removed_results: list[RemovedServiceResult],
    upsert_files: dict[str, bytes],
    delete_files: list[str],
    changed_services: list[str],
    added_services: list[str],
    updated_services: list[str],
    removed_services: list[str],
    pr_branch: str | None = None,
    pr_number: int | None = None,
    pr_url: str | None = None,
) -> dict[str, Any]:
    return {
        "projectName": project_name,
        "stateFile": str(state_file),
        "serviceCount": len(results),
        "removedServiceCount": len(removed_results),
        "changedServiceCount": len(changed_services),
        "changedServices": changed_services,
        "addedServiceCount": len(added_services),
        "addedServices": added_services,
        "updatedServiceCount": len(updated_services),
        "updatedServices": updated_services,
        "removedServiceNames": removed_services,
        "changedFileCount": len(upsert_files) + len(delete_files),
        "upsertFileCount": len(upsert_files),
        "deleteFileCount": len(delete_files),
        "files": sorted(upsert_files.keys()),
        "deletedFiles": sorted(delete_files),
        "results": [
            {
                "name": result.name,
                "needsReconcile": result.needs_reconcile,
                "expectedFileCount": result.expected_file_count,
                "serviceSynced": result.service_synced,
                "gitopsSynced": result.gitops_synced,
                "appSynced": result.app_synced,
                "changedFiles": result.changed_files,
                "missingFiles": result.missing_files,
            }
            for result in results
        ],
        "removedServices": [
            {"name": removed.name, "deletedFiles": removed.deleted_files}
            for removed in removed_results
        ],
        "pullRequest": {
            "branch": pr_branch,
            "number": pr_number,
            "url": pr_url,
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="TARS SVCS check: read config files, render expected assets, and open PR for drift"
    )
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--runtime-dir", default=".idp/runtime")
    parser.add_argument("--state-file", default=".idp/runtime/tars-svcs-state.yaml")
    parser.add_argument("--endr-config", dest="endr_config", default="")
    parser.add_argument("--svcs-config", dest="svcs_config", default="")
    parser.add_argument("--idp-config", dest="endr_config", default="")
    parser.add_argument("--services-config", dest="svcs_config", default="")
    parser.add_argument("--open-pr", action="store_true")
    parser.add_argument("--write-worktree", action="store_true")
    parser.add_argument("--github-token", default="")
    parser.add_argument("--base-branch", default="")
    parser.add_argument("--branch-prefix", default="idp/tars-svcs-check")
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root).resolve()
    runtime_dir = Path(args.runtime_dir)
    if not runtime_dir.is_absolute():
        runtime_dir = (repo_root / runtime_dir).resolve()

    state_file = Path(args.state_file)
    if not state_file.is_absolute():
        state_file = (repo_root / state_file).resolve()

    ensure_runtime_paths(runtime_dir, state_file)

    os.environ["IDP_REPO_ROOT"] = str(repo_root)
    if args.endr_config:
        os.environ["IDP_CONFIG_PATH"] = args.endr_config
    if args.svcs_config:
        os.environ["SERVICES_CONFIG_PATH"] = args.svcs_config

    idp_config, results, upsert_files, delete_files, removed_results = reconcile(repo_root, runtime_dir)

    state_map = {result.name: (not result.needs_reconcile) for result in results}
    write_state_file(state_file, idp_config.projectName, state_map)

    if args.write_worktree and (upsert_files or delete_files):
        apply_to_worktree(repo_root, upsert_files, delete_files)

    changed_services = sorted(
        {
            *[result.name for result in results if result.needs_reconcile],
            *[removed.name for removed in removed_results],
        }
    )
    added_services, updated_services, removed_services = classify_service_changes(results, removed_results)

    pr_branch: str | None = None
    pr_number: int | None = None
    pr_url: str | None = None

    if args.open_pr and (upsert_files or delete_files):
        token = args.github_token or os.getenv("GITHUB_TOKEN", "")
        pr_branch, pr_number, pr_url = open_reconcile_pr(
            repo_root=repo_root,
            idp_config=idp_config,
            upsert_files=upsert_files,
            delete_files=delete_files,
            added_services=added_services,
            updated_services=updated_services,
            removed_services=removed_services,
            github_token=token,
            branch_prefix=args.branch_prefix,
            base_branch_override=args.base_branch or None,
        )

    summary = build_summary(
        state_file=state_file,
        project_name=idp_config.projectName,
        results=results,
        removed_results=removed_results,
        upsert_files=upsert_files,
        delete_files=delete_files,
        changed_services=changed_services,
        added_services=added_services,
        updated_services=updated_services,
        removed_services=removed_services,
        pr_branch=pr_branch,
        pr_number=pr_number,
        pr_url=pr_url,
    )

    print(json.dumps(summary, indent=2))

    write_github_output(
        {
            "has_changes": "true" if (upsert_files or delete_files) else "false",
            "changed_services": ",".join(changed_services),
            "changed_service_count": str(len(changed_services)),
            "added_services": ",".join(added_services),
            "added_service_count": str(len(added_services)),
            "updated_services": ",".join(updated_services),
            "updated_service_count": str(len(updated_services)),
            "removed_services": ",".join(removed_services),
            "removed_service_count": str(len(removed_services)),
            "changed_file_count": str(len(upsert_files) + len(delete_files)),
            "upsert_file_count": str(len(upsert_files)),
            "delete_file_count": str(len(delete_files)),
            "state_file": str(state_file),
            "pr_branch": pr_branch or "",
            "pr_number": str(pr_number or ""),
            "pr_url": pr_url or "",
        }
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
