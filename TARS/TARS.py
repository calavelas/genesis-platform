#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import yaml

# Allow direct execution: `python3 TARS/TARS.py ...`
REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from TARS.cli.svcs_check import main as svcs_check_main


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
    if len(parts) < 3 or parts[0] != "SVCS":
        return None

    service_name = parts[1]
    if not service_name or service_name == "examples":
        return None

    source_roots = {"app", "src", "cmd", "internal", "pkg", "lib"}
    source_files = {
        "Dockerfile",
        "requirements.txt",
        "pyproject.toml",
        "package.json",
        "package-lock.json",
        "go.mod",
        "go.sum",
        "Cargo.toml",
        "Cargo.lock",
    }
    marker = parts[2]
    if marker in source_roots or marker in source_files:
        return service_name
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
        service_dir = repo_root / "SVCS" / service
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
                "context": f"SVCS/{service}",
                "dockerfile": f"SVCS/{service}/Dockerfile",
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
    services_dir = repo_root / "SVCS"
    if not services_dir.exists():
        return []

    result: list[str] = []
    for item in sorted(services_dir.iterdir()):
        if not item.is_dir():
            continue
        result.append(item.name)
    return result


def write_github_output(matrix: list[dict[str, str]], skipped: list[str]) -> None:
    output_path = os.getenv("GITHUB_OUTPUT")
    if not output_path:
        return

    payload = json.dumps({"include": matrix}, separators=(",", ":"))
    with Path(output_path).open("a", encoding="utf-8") as handle:
        handle.write(f"matrix={payload}\n")
        handle.write(f"has_services={'true' if len(matrix) > 0 else 'false'}\n")
        handle.write(f"count={len(matrix)}\n")
        if skipped:
            handle.write("skipped<<EOF\n")
            handle.write("\n".join(skipped))
            handle.write("\nEOF\n")


def discover_changed_services_main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Discover changed services and produce GH Actions matrix")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--before", default="")
    parser.add_argument("--after", default="")
    parser.add_argument("--registry", choices=["ghcr", "dockerhub"], default="ghcr")
    parser.add_argument("--image-owner", default="")
    parser.add_argument("--repository-owner", default="")
    parser.add_argument("--all-services", action="store_true")
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root).resolve()
    image_owner = args.image_owner or args.repository_owner
    if not image_owner:
        parser.error("--image-owner is required (or --repository-owner for backward compatibility)")

    if args.all_services:
        changed_services = list_all_services(repo_root)
    else:
        changed_files = get_changed_files(repo_root, args.before, args.after)
        changed_services = [service for file_path in changed_files if (service := service_name_from_path(file_path))]

    matrix, skipped = build_matrix(repo_root, changed_services, image_owner, args.registry)
    write_github_output(matrix, skipped)

    print(json.dumps({"include": matrix, "skipped": skipped}, indent=2))
    return 0


def _split_image(value: str) -> tuple[str, str]:
    if ":" in value and value.rfind(":") > value.rfind("/"):
        repository, tag = value.rsplit(":", 1)
        return repository, tag
    return value, ""


def _write_key_value_output(values: dict[str, str]) -> None:
    output_path = os.getenv("GITHUB_OUTPUT")
    if not output_path:
        return

    with Path(output_path).open("a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write(f"{key}={value}\n")


def update_image_tags_main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Update image tags in SVCS.yaml for selected services")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--services", default="")
    parser.add_argument("--tag", required=True)
    parser.add_argument("--allow-missing", action="store_true")
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root).resolve()
    services = sorted({item.strip() for item in args.services.split(",") if item.strip()})

    if not services:
        payload = {
            "tag": args.tag,
            "services": [],
            "updated_services": [],
            "unchanged_services": [],
            "missing_services": [],
            "changed": False,
        }
        _write_key_value_output(
            {
                "tag": args.tag,
                "services": "",
                "service_count": "0",
                "updated_services": "",
                "updated_service_count": "0",
                "unchanged_services": "",
                "unchanged_service_count": "0",
                "missing_services": "",
                "missing_service_count": "0",
                "changed": "false",
            }
        )
        print(json.dumps(payload, indent=2))
        return 0

    idp_path = repo_root / "ENDR.yaml"
    svcs_path = repo_root / "SVCS.yaml"

    idp_raw = yaml.safe_load(idp_path.read_text(encoding="utf-8")) or {}
    if not isinstance(idp_raw, dict):
        raise ValueError("ENDR.yaml root must be a mapping")
    owner = str(idp_raw.get("config", {}).get("git", {}).get("owner", "")).strip()
    if not owner:
        raise ValueError("ENDR.yaml config.git.owner is required")

    svcs_raw = yaml.safe_load(svcs_path.read_text(encoding="utf-8")) or {}
    if not isinstance(svcs_raw, dict):
        raise ValueError("SVCS.yaml root must be a mapping")
    entries = svcs_raw.get("services", [])
    if not isinstance(entries, list):
        raise ValueError("SVCS.yaml services must be a list")

    by_name: dict[str, dict[str, Any]] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        if isinstance(name, str) and name.strip():
            by_name[name] = entry

    updated: list[str] = []
    unchanged: list[str] = []
    missing: list[str] = []

    for service_name in services:
        service_entry = by_name.get(service_name)
        if not service_entry:
            missing.append(service_name)
            continue

        overrides = service_entry.setdefault("overrides", {})
        if not isinstance(overrides, dict):
            raise ValueError(f"SVCS.yaml overrides for service '{service_name}' must be mapping")

        current_image = overrides.get("image")
        if isinstance(current_image, str) and current_image.strip():
            repository, _ = _split_image(current_image.strip())
        else:
            repository = f"{owner}/{service_name}"

        new_image = f"{repository}:{args.tag}"
        if current_image != new_image:
            overrides["image"] = new_image
            updated.append(service_name)
        else:
            unchanged.append(service_name)

    changed = len(updated) > 0
    if changed:
        svcs_path.write_text(yaml.safe_dump(svcs_raw, sort_keys=False, allow_unicode=False), encoding="utf-8")

    payload = {
        "tag": args.tag,
        "services": services,
        "updated_services": updated,
        "unchanged_services": unchanged,
        "missing_services": missing,
        "changed": changed,
    }
    _write_key_value_output(
        {
            "tag": args.tag,
            "services": ",".join(services),
            "service_count": str(len(services)),
            "updated_services": ",".join(updated),
            "updated_service_count": str(len(updated)),
            "unchanged_services": ",".join(unchanged),
            "unchanged_service_count": str(len(unchanged)),
            "missing_services": ",".join(missing),
            "missing_service_count": str(len(missing)),
            "changed": "true" if changed else "false",
        }
    )
    print(json.dumps(payload, indent=2))

    if missing and not args.allow_missing:
        return 1
    return 0


def print_help() -> None:
    print(
        "Usage:\n"
        "  python3 TARS/TARS.py svcs-check [SVCS_CHECK_ARGS...]\n"
        "  python3 TARS/TARS.py discover-changed-services [DISCOVER_ARGS...]\n"
        "  python3 TARS/TARS.py update-image-tags [TAG_ARGS...]\n\n"
        "Examples:\n"
        "  python3 TARS/TARS.py svcs-check --repo-root . --open-pr\n"
        "  python3 TARS/TARS.py discover-changed-services --repo-root . --before <sha> --after <sha> --registry dockerhub --image-owner <owner>\n"
        "  python3 TARS/TARS.py update-image-tags --repo-root . --services svc-a,svc-b --tag git-abcdef1\n"
    )


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args:
        return svcs_check_main([])

    subcommand = args[0]
    sub_args = args[1:]

    if subcommand in {"-h", "--help", "help"}:
        print_help()
        return 0

    if subcommand in {"svcs-check", "check"}:
        return svcs_check_main(sub_args)

    if subcommand in {"discover-changed-services", "discover"}:
        return discover_changed_services_main(sub_args)

    if subcommand in {"update-image-tags", "tag-services"}:
        return update_image_tags_main(sub_args)

    # Allow calling with only svcs-check flags.
    if subcommand.startswith("-"):
        return svcs_check_main(args)

    print(f"unknown subcommand: {subcommand}", file=sys.stderr)
    print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
