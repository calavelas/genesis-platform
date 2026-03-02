#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
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


def write_github_output(values: dict[str, str]) -> None:
    output_path = os.getenv("GITHUB_OUTPUT")
    if not output_path:
        return

    with Path(output_path).open("a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write(f"{key}={value}\n")


def classify_component(service_name: str, repo_path: str) -> str:
    if repo_path == f"platform/clusters/local/apps/{service_name}.yaml":
        return "app"
    if repo_path.startswith(f"services/{service_name}/chart/"):
        return "gitops"
    return "service"


def load_api_modules(repo_root: Path) -> tuple[Any, Any, Any, Any]:
    api_root = repo_root / "apps" / "idp-api"
    if str(api_root) not in sys.path:
        sys.path.insert(0, str(api_root))

    from app.config.loader import load_all_configs
    from app.scaffold.github_client import GitHubAPIError, GitHubClient
    from app.scaffold.service import render_scaffold_for_service

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


def apply_to_worktree(repo_root: Path, files: dict[str, bytes]) -> None:
    for relative_path, content in sorted(files.items()):
        target = repo_root / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)


def write_state_file(state_file: Path, project_name: str, state_map: dict[str, bool]) -> None:
    data = {
        "projectName": project_name,
        "type": "services-reconcile",
        "state": state_map,
    }
    rendered = yaml.safe_dump(data, sort_keys=False, allow_unicode=False)
    state_file.write_text(rendered, encoding="utf-8")


def reconcile(repo_root: Path, runtime_dir: Path) -> tuple[Any, list[ServiceReconcileResult], dict[str, bytes]]:
    load_all_configs, render_scaffold_for_service, _, _ = load_api_modules(repo_root)
    idp_config, services_config, _ = load_all_configs()

    reconcile_root = runtime_dir / "staging" / "genesis"
    reconcile_root.mkdir(parents=True, exist_ok=True)

    results: list[ServiceReconcileResult] = []
    commit_files: dict[str, bytes] = {}

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
                commit_files[relative_path] = expected_content
                continue

            current_content = target.read_bytes()
            if current_content != expected_content:
                component_synced[component] = False
                changed_files.append(relative_path)
                commit_files[relative_path] = expected_content

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

    return idp_config, results, commit_files


def open_reconcile_pr(
    *,
    repo_root: Path,
    idp_config: Any,
    files: dict[str, bytes],
    changed_services: list[str],
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

        for file_path, content in sorted(files.items()):
            github_client.create_or_update_file(
                branch=branch_name,
                file_path=file_path,
                content_bytes=content,
                commit_message=f"feat(genesis): reconcile generated assets ({file_path})",
            )

        pr = github_client.create_pull_request(
            title="feat(genesis): reconcile generated service and GitOps assets",
            body=(
                "Automated reconcile from `idp-config.yaml` and `services-config.yaml`.\n\n"
                f"Changed services ({len(changed_services)}): {', '.join(changed_services)}"
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
    changed_files: dict[str, bytes],
    pr_branch: str | None = None,
    pr_number: int | None = None,
    pr_url: str | None = None,
) -> dict[str, Any]:
    changed_services = [result.name for result in results if result.needs_reconcile]
    return {
        "projectName": project_name,
        "stateFile": str(state_file),
        "serviceCount": len(results),
        "changedServiceCount": len(changed_services),
        "changedServices": changed_services,
        "changedFileCount": len(changed_files),
        "files": sorted(changed_files.keys()),
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
        "pullRequest": {
            "branch": pr_branch,
            "number": pr_number,
            "url": pr_url,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Genesis Phase 1 reconcile: read config files, render expected assets, and open PR for drift"
    )
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--runtime-dir", default=".idp/runtime")
    parser.add_argument("--state-file", default=".idp/runtime/genesis-services-state.yaml")
    parser.add_argument("--idp-config", default="")
    parser.add_argument("--services-config", default="")
    parser.add_argument("--open-pr", action="store_true")
    parser.add_argument("--write-worktree", action="store_true")
    parser.add_argument("--github-token", default="")
    parser.add_argument("--base-branch", default="")
    parser.add_argument("--branch-prefix", default="idp/genesis-reconcile")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    runtime_dir = Path(args.runtime_dir)
    if not runtime_dir.is_absolute():
        runtime_dir = (repo_root / runtime_dir).resolve()

    state_file = Path(args.state_file)
    if not state_file.is_absolute():
        state_file = (repo_root / state_file).resolve()

    ensure_runtime_paths(runtime_dir, state_file)

    os.environ["IDP_REPO_ROOT"] = str(repo_root)
    if args.idp_config:
        os.environ["IDP_CONFIG_PATH"] = args.idp_config
    if args.services_config:
        os.environ["SERVICES_CONFIG_PATH"] = args.services_config

    idp_config, results, commit_files = reconcile(repo_root, runtime_dir)

    state_map = {result.name: (not result.needs_reconcile) for result in results}
    write_state_file(state_file, idp_config.projectName, state_map)

    if args.write_worktree and commit_files:
        apply_to_worktree(repo_root, commit_files)

    changed_services = [result.name for result in results if result.needs_reconcile]

    pr_branch: str | None = None
    pr_number: int | None = None
    pr_url: str | None = None

    if args.open_pr and commit_files:
        token = args.github_token or os.getenv("GITHUB_TOKEN", "")
        pr_branch, pr_number, pr_url = open_reconcile_pr(
            repo_root=repo_root,
            idp_config=idp_config,
            files=commit_files,
            changed_services=changed_services,
            github_token=token,
            branch_prefix=args.branch_prefix,
            base_branch_override=args.base_branch or None,
        )

    summary = build_summary(
        state_file=state_file,
        project_name=idp_config.projectName,
        results=results,
        changed_files=commit_files,
        pr_branch=pr_branch,
        pr_number=pr_number,
        pr_url=pr_url,
    )

    print(json.dumps(summary, indent=2))

    write_github_output(
        {
            "has_changes": "true" if commit_files else "false",
            "changed_services": ",".join(changed_services),
            "changed_service_count": str(len(changed_services)),
            "changed_file_count": str(len(commit_files)),
            "state_file": str(state_file),
            "pr_branch": pr_branch or "",
            "pr_number": str(pr_number or ""),
            "pr_url": pr_url or "",
        }
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
