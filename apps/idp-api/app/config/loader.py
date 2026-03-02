from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from app.config.models import IDPConfig, ServicesConfig, TemplateRef

REPO_CONFIG_FILE = "idp-config.yaml"
SERVICES_CONFIG_FILE = "services-config.yaml"


class ConfigPaths(BaseModel):
    repoRoot: str
    idpConfigPath: str
    servicesConfigPath: str


class ConfigValidationReport(BaseModel):
    valid: bool
    paths: ConfigPaths
    serviceCount: int = 0
    errors: list[str] = Field(default_factory=list)


def _search_up(start: Path, filename: str) -> Path | None:
    for candidate in [start, *start.parents]:
        if (candidate / filename).exists():
            return candidate
    return None


def resolve_repo_root() -> Path:
    env_root = os.getenv("IDP_REPO_ROOT")
    if env_root:
        repo_root = Path(env_root).expanduser().resolve()
        if (repo_root / REPO_CONFIG_FILE).exists():
            return repo_root
        raise FileNotFoundError(
            f"IDP_REPO_ROOT points to '{repo_root}', but '{REPO_CONFIG_FILE}' was not found there"
        )

    cwd_root = _search_up(Path.cwd().resolve(), REPO_CONFIG_FILE)
    if cwd_root:
        return cwd_root

    file_root = _search_up(Path(__file__).resolve(), REPO_CONFIG_FILE)
    if file_root:
        return file_root

    raise FileNotFoundError(f"could not locate repository root containing '{REPO_CONFIG_FILE}'")


def _resolve_config_path(raw_path: str | None, default_path: Path, repo_root: Path) -> Path:
    if not raw_path:
        return default_path

    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        candidate = repo_root / candidate
    return candidate.resolve()


def resolve_config_paths() -> ConfigPaths:
    repo_root = resolve_repo_root()
    idp_config = _resolve_config_path(
        os.getenv("IDP_CONFIG_PATH"),
        repo_root / REPO_CONFIG_FILE,
        repo_root,
    )
    services_config = _resolve_config_path(
        os.getenv("SERVICES_CONFIG_PATH"),
        repo_root / SERVICES_CONFIG_FILE,
        repo_root,
    )
    return ConfigPaths(
        repoRoot=str(repo_root),
        idpConfigPath=str(idp_config),
        servicesConfigPath=str(services_config),
    )


def _read_yaml_dict(path: str) -> dict[str, Any]:
    try:
        import yaml
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "PyYAML is required for config loading. Install dependencies in apps/idp-api first."
        ) from exc

    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"file not found: {path}")

    with file_path.open("r", encoding="utf-8") as handle:
        parsed = yaml.safe_load(handle) or {}

    if not isinstance(parsed, dict):
        raise ValueError(f"yaml root must be a mapping: {path}")

    return parsed


def load_idp_config(path: str) -> IDPConfig:
    return IDPConfig(**_read_yaml_dict(path))


def load_services_config(path: str) -> ServicesConfig:
    return ServicesConfig(**_read_yaml_dict(path))


def _is_remote_template(path: str) -> bool:
    return path.startswith(("http://", "https://", "git@", "ssh://")) or path.endswith(".git")


def _validate_template_catalog(
    templates: list[TemplateRef],
    category: str,
    repo_root: Path,
    expected_type: str | None = None,
) -> tuple[list[str], set[str]]:
    errors: list[str] = []
    names: set[str] = set()

    for template in templates:
        if template.name in names:
            errors.append(f"duplicate '{category}' template name: {template.name}")
        else:
            names.add(template.name)

        if expected_type and template.type and template.type != expected_type:
            errors.append(
                f"template '{template.name}' in '{category}' has type='{template.type}', expected '{expected_type}'"
            )

        if not _is_remote_template(template.path):
            abs_path = repo_root / template.path
            if not abs_path.exists():
                errors.append(
                    f"template path not found for '{template.name}' in '{category}': {template.path}"
                )

    return errors, names


def validate_consistency(
    idp_config: IDPConfig, services_config: ServicesConfig, repo_root: Path
) -> list[str]:
    errors: list[str] = []

    service_template_errors, service_template_names = _validate_template_catalog(
        idp_config.templates.service, "service", repo_root, "service"
    )
    gitops_template_errors, gitops_template_names = _validate_template_catalog(
        idp_config.templates.gitops, "gitops", repo_root, "gitops"
    )
    errors.extend(service_template_errors)
    errors.extend(gitops_template_errors)

    environments = set(idp_config.config.environments)
    service_names: set[str] = set()

    for service in services_config.services:
        if service.name in service_names:
            errors.append(f"duplicate service name: {service.name}")
        else:
            service_names.add(service.name)

        for environment in service.deployTo:
            if environment not in environments:
                errors.append(
                    f"service '{service.name}' deployTo contains unknown environment '{environment}'"
                )

        if service.generator.service.template not in service_template_names:
            errors.append(
                f"service '{service.name}' references unknown service template "
                f"'{service.generator.service.template}'"
            )

        if service.generator.gitops.template not in gitops_template_names:
            errors.append(
                f"service '{service.name}' references unknown gitops template "
                f"'{service.generator.gitops.template}'"
            )

    return errors


def _format_pydantic_error(prefix: str, exc: ValidationError) -> list[str]:
    formatted: list[str] = []
    for error in exc.errors():
        location = ".".join(str(part) for part in error.get("loc", ()))
        formatted.append(f"{prefix}.{location}: {error.get('msg', 'validation error')}")
    return formatted


def build_validation_report() -> ConfigValidationReport:
    paths = resolve_config_paths()
    errors: list[str] = []
    idp_config: IDPConfig | None = None
    services_config: ServicesConfig | None = None

    try:
        idp_config = load_idp_config(paths.idpConfigPath)
    except ValidationError as exc:
        errors.extend(_format_pydantic_error("idp-config", exc))
    except Exception as exc:  # noqa: BLE001
        errors.append(f"idp-config: {exc}")

    try:
        services_config = load_services_config(paths.servicesConfigPath)
    except ValidationError as exc:
        errors.extend(_format_pydantic_error("services-config", exc))
    except Exception as exc:  # noqa: BLE001
        errors.append(f"services-config: {exc}")

    if idp_config and services_config:
        errors.extend(validate_consistency(idp_config, services_config, Path(paths.repoRoot)))

    return ConfigValidationReport(
        valid=len(errors) == 0,
        paths=paths,
        serviceCount=len(services_config.services) if services_config else 0,
        errors=errors,
    )


def load_all_configs() -> tuple[IDPConfig, ServicesConfig, ConfigPaths]:
    report = build_validation_report()
    if not report.valid:
        raise ValueError("\n".join(report.errors))

    idp_config = load_idp_config(report.paths.idpConfigPath)
    services_config = load_services_config(report.paths.servicesConfigPath)
    return idp_config, services_config, report.paths


def _main() -> int:
    report = build_validation_report()
    print(json.dumps(report.model_dump(), indent=2))
    return 0 if report.valid else 1


if __name__ == "__main__":
    raise SystemExit(_main())
