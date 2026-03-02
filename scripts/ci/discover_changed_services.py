#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path
from typing import Any

import yaml


def run(cmd: list[str], cwd: Path) -> str:
    completed = subprocess.run(  # noqa: S603
        cmd,
        cwd=str(cwd),
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def get_changed_files(repo_root: Path, before: str, after: str) -> list[str]:
    before = (before or "").strip()
    after = (after or "").strip()

    if not after:
        after = run(["git", "rev-parse", "HEAD"], repo_root)

    is_null_before = before == "" or set(before) == {"0"}
    if is_null_before:
        return run(["git", "diff-tree", "--no-commit-id", "--name-only", "-r", after], repo_root).splitlines()

    return run(["git", "diff", "--name-only", before, after], repo_root).splitlines()


def service_name_from_path(file_path: str) -> str | None:
    parts = Path(file_path).parts
    if len(parts) >= 3 and parts[0] == "services":
        return parts[1]
    return None


def load_values_yaml(path: Path) -> dict[str, Any]:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise ValueError(f"values file root must be mapping: {path}")
    return raw


def build_matrix(
    repo_root: Path,
    services: list[str],
    image_owner: str,
    registry: str,
) -> tuple[list[dict[str, str]], list[str]]:
    matrix: list[dict[str, str]] = []
    skipped: list[str] = []

    for service in sorted(set(services)):
        service_dir = repo_root / "services" / service
        dockerfile = service_dir / "Dockerfile"
        values_file = service_dir / "chart" / "values.yaml"

        if not service_dir.exists() or not dockerfile.exists() or not values_file.exists():
            skipped.append(f"{service}: missing Dockerfile or chart/values.yaml")
            continue

        values = load_values_yaml(values_file)
        image_cfg = values.get("image", {})
        if not isinstance(image_cfg, dict):
            skipped.append(f"{service}: image config in values.yaml must be mapping")
            continue

        image_repository = image_cfg.get("repository")
        image_tag = image_cfg.get("tag")
        if registry == "dockerhub":
            repo_name = service
            if not image_repository:
                repo_name = service
            else:
                repo = str(image_repository).strip().rstrip("/")
                if repo.startswith("docker.io/"):
                    repo = repo[len("docker.io/") :]
                else:
                    first_segment = repo.split("/", 1)[0]
                    # Docker Hub short form like "user/repo" is allowed.
                    if "." in first_segment or ":" in first_segment or first_segment == "localhost":
                        skipped.append(
                            f"{service}: image.repository '{repo}' is not Docker Hub (expected docker.io/* or user/repo)"
                        )
                        continue
                parts = [part for part in repo.split("/") if part]
                if not parts:
                    skipped.append(f"{service}: image.repository is empty after normalization")
                    continue
                repo_name = parts[-1]
                if len(parts) >= 2:
                    namespace = parts[-2]
                    if namespace != image_owner:
                        skipped.append(
                            f"{service}: image.repository namespace '{namespace}' does not match configured Docker Hub owner '{image_owner}'"
                        )
                        continue
        else:
            if not image_repository:
                image_repository = f"ghcr.io/{image_owner}/{service}"
            if not str(image_repository).startswith("ghcr.io/"):
                skipped.append(
                    f"{service}: image.repository '{image_repository}' is not GHCR (ghcr.io/*), skipping publish"
                )
                continue

        if not image_tag:
            image_tag = "0.1.0"

        matrix.append(
            {
                "service": service,
                "context": f"services/{service}",
                "dockerfile": f"services/{service}/Dockerfile",
                "image_tag": str(image_tag),
                **(
                    {"repo_name": repo_name}
                    if registry == "dockerhub"
                    else {"image": f"{image_repository}:{image_tag}"}
                ),
            }
        )

    return matrix, skipped


def list_all_services(repo_root: Path) -> list[str]:
    services_dir = repo_root / "services"
    if not services_dir.exists():
        return []

    result: list[str] = []
    for item in sorted(services_dir.iterdir()):
        if not item.is_dir():
            continue
        result.append(item.name)
    return result


def write_github_output(matrix: list[dict[str, str]], skipped: list[str]) -> None:
    out = os.getenv("GITHUB_OUTPUT")
    if not out:
        return

    payload = json.dumps({"include": matrix}, separators=(",", ":"))
    with open(out, "a", encoding="utf-8") as handle:
        handle.write(f"matrix={payload}\n")
        handle.write(f"has_services={'true' if len(matrix) > 0 else 'false'}\n")
        handle.write(f"count={len(matrix)}\n")
        if skipped:
            handle.write("skipped<<EOF\n")
            handle.write("\n".join(skipped))
            handle.write("\nEOF\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Discover changed services and produce GH Actions matrix")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--before", default="")
    parser.add_argument("--after", default="")
    parser.add_argument("--registry", choices=["ghcr", "dockerhub"], default="ghcr")
    parser.add_argument("--image-owner", default="")
    parser.add_argument("--repository-owner", default="")
    parser.add_argument("--all-services", action="store_true")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    image_owner = args.image_owner or args.repository_owner
    if not image_owner:
        parser.error("--image-owner is required (or --repository-owner for backward compatibility)")

    if args.all_services:
        changed_services = list_all_services(repo_root)
    else:
        changed_files = get_changed_files(repo_root, args.before, args.after)
        changed_services = [s for f in changed_files if (s := service_name_from_path(f))]

    matrix, skipped = build_matrix(repo_root, changed_services, image_owner, args.registry)
    write_github_output(matrix, skipped)

    print(json.dumps({"include": matrix, "skipped": skipped}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
