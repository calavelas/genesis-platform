from __future__ import annotations

import json
import os
import ssl
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib import error, request

from pydantic import BaseModel

from TARS.config.loader import load_all_configs
from TARS.config.paths import cluster_apps_repo_dir, cluster_root_app_repo_dir

DEFAULT_ARGOCD_SERVER = "https://argocd.k8s.local"


class PlexNode(BaseModel):
    name: str
    kind: str
    namespace: str
    syncStatus: str
    healthStatus: str
    sourcePath: str
    revision: str
    deployedAt: str | None
    imageTag: str | None
    orbitBand: int


class PlexUniverse(BaseModel):
    generatedAt: str
    dataSource: str
    galaxyName: str
    clusterPath: str
    servicesPath: str
    warnings: list[str]
    coreApps: list[PlexNode]
    services: list[PlexNode]


def _safe_tag(image: str | None) -> str | None:
    if not image:
        return None
    value = image.strip()
    if not value:
        return None
    if ":" not in value:
        return None
    return value.rsplit(":", 1)[1]


def _read_application_name(manifest_path: Path) -> str | None:
    try:
        import yaml
    except ModuleNotFoundError:
        return None

    try:
        with manifest_path.open("r", encoding="utf-8") as handle:
            parsed = yaml.safe_load(handle)
    except Exception:  # noqa: BLE001
        return None

    if not isinstance(parsed, dict):
        return None
    if parsed.get("kind") != "Application":
        return None

    metadata = parsed.get("metadata")
    if not isinstance(metadata, dict):
        return None

    name = metadata.get("name")
    if not isinstance(name, str):
        return None

    normalized = name.strip()
    return normalized or None


def _discover_core_app_names(repo_root: str, root_repo_dir: str) -> list[str]:
    root_abs = Path(repo_root) / Path(root_repo_dir)
    cluster_abs = root_abs.parent

    discovered: list[str] = []
    bootstrap_manifest = cluster_abs / "space.yaml"
    if bootstrap_manifest.exists():
        bootstrap_name = _read_application_name(bootstrap_manifest)
        if bootstrap_name:
            discovered.append(bootstrap_name)

    if root_abs.exists():
        manifest_files = sorted(root_abs.glob("*.yaml")) + sorted(root_abs.glob("*.yml"))
        for manifest_file in manifest_files:
            app_name = _read_application_name(manifest_file)
            if app_name:
                discovered.append(app_name)

    if "gargantua" not in discovered:
        discovered.append("gargantua")

    unique: list[str] = []
    seen: set[str] = set()
    for name in discovered:
        if name in seen:
            continue
        seen.add(name)
        unique.append(name)
    return unique


def _core_source_path(name: str, root_repo_dir: str) -> str:
    cluster_dir = Path(root_repo_dir).parent.as_posix()
    if name == "space":
        return f"{cluster_dir}/space.yaml"
    return root_repo_dir


def _build_config_universe() -> PlexUniverse:
    idp_config, services_config, paths = load_all_configs()
    apps_repo_dir = cluster_apps_repo_dir(idp_config)
    root_repo_dir = cluster_root_app_repo_dir(idp_config)
    core_names = _discover_core_app_names(paths.repoRoot, root_repo_dir)

    core_apps: list[PlexNode] = []
    for index, name in enumerate(core_names, start=1):
        core_apps.append(
            PlexNode(
                name=name,
                kind="core",
                namespace=idp_config.config.cluster.argocdNamespace,
                syncStatus="Unknown",
                healthStatus="Unknown",
                sourcePath=_core_source_path(name, root_repo_dir),
                revision="main",
                deployedAt=None,
                imageTag=None,
                orbitBand=index,
            )
        )

    services: list[PlexNode] = []
    for index, service in enumerate(sorted(services_config.services, key=lambda item: item.name), start=1):
        services.append(
            PlexNode(
                name=service.name,
                kind="service",
                namespace=service.namespace,
                syncStatus="Unknown",
                healthStatus="Unknown",
                sourcePath=f"SVCS/{service.name}/chart",
                revision="main",
                deployedAt=None,
                imageTag=_safe_tag(service.overrides.image),
                orbitBand=(index % 4) + 1,
            )
        )

    return PlexUniverse(
        generatedAt=datetime.now(tz=UTC).isoformat(),
        dataSource="config",
        galaxyName="gargantua",
        clusterPath=root_repo_dir,
        servicesPath=apps_repo_dir,
        warnings=[
            "ArgoCD credentials are not configured; showing config-derived universe snapshot.",
        ],
        coreApps=core_apps,
        services=services,
    )


def _fetch_argocd_apps(argocd_server: str, argocd_token: str, verify_tls: bool) -> dict[str, Any]:
    endpoint = f"{argocd_server.rstrip('/')}/api/v1/applications"
    req = request.Request(endpoint, method="GET")
    if argocd_token:
        req.add_header("Authorization", f"Bearer {argocd_token}")
    req.add_header("Accept", "application/json")

    context: ssl.SSLContext | None = None
    if endpoint.startswith("https://"):
        context = ssl.create_default_context()
        if not verify_tls:
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE

    with request.urlopen(req, timeout=15, context=context) as response:  # noqa: S310
        raw = response.read().decode("utf-8")
    data = json.loads(raw) if raw else {}
    if not isinstance(data, dict):
        raise ValueError("invalid ArgoCD response payload")
    return data


def _node_from_argocd_app(
    app: dict[str, Any],
    *,
    kind: str,
    orbit_band: int,
    fallback_namespace: str,
) -> PlexNode:
    metadata = app.get("metadata", {}) if isinstance(app, dict) else {}
    spec = app.get("spec", {}) if isinstance(app, dict) else {}
    status = app.get("status", {}) if isinstance(app, dict) else {}
    source = spec.get("source", {}) if isinstance(spec, dict) else {}
    sync = status.get("sync", {}) if isinstance(status, dict) else {}
    health = status.get("health", {}) if isinstance(status, dict) else {}
    operation_state = status.get("operationState", {}) if isinstance(status, dict) else {}

    namespace = fallback_namespace
    destination = spec.get("destination", {}) if isinstance(spec, dict) else {}
    if isinstance(destination, dict):
        namespace = str(destination.get("namespace") or fallback_namespace)

    image_tag = None
    images = status.get("summary", {}).get("images", []) if isinstance(status, dict) else []
    if isinstance(images, list) and images:
        image_tag = _safe_tag(str(images[0]))

    return PlexNode(
        name=str(metadata.get("name", "unknown")),
        kind=kind,
        namespace=namespace,
        syncStatus=str(sync.get("status", "Unknown")),
        healthStatus=str(health.get("status", "Unknown")),
        sourcePath=str(source.get("path", "")),
        revision=str(sync.get("revision", "main")),
        deployedAt=operation_state.get("finishedAt"),
        imageTag=image_tag,
        orbitBand=orbit_band,
    )


def build_plex_universe() -> PlexUniverse:
    idp_config, services_config, paths = load_all_configs()
    apps_repo_dir = cluster_apps_repo_dir(idp_config)
    root_repo_dir = cluster_root_app_repo_dir(idp_config)
    core_names = _discover_core_app_names(paths.repoRoot, root_repo_dir)
    warnings: list[str] = []

    argocd_server = os.getenv("PLEX_ARGOCD_SERVER", DEFAULT_ARGOCD_SERVER).strip()
    argocd_token = os.getenv("PLEX_ARGOCD_TOKEN", "").strip()
    verify_tls = os.getenv("PLEX_ARGOCD_VERIFY_TLS", "true").strip().lower() not in {"0", "false", "no"}

    if not argocd_server:
        return _build_config_universe()

    try:
        payload = _fetch_argocd_apps(argocd_server, argocd_token, verify_tls)
    except (error.URLError, error.HTTPError, TimeoutError, ValueError) as exc:
        fallback = _build_config_universe()
        fallback.warnings.append(f"ArgoCD API request failed: {exc}")
        return fallback

    app_items = payload.get("items", [])
    if not isinstance(app_items, list):
        app_items = []

    app_by_name: dict[str, dict[str, Any]] = {}
    for app in app_items:
        if not isinstance(app, dict):
            continue
        metadata = app.get("metadata", {})
        if not isinstance(metadata, dict):
            continue
        app_name = str(metadata.get("name", "")).strip()
        if app_name:
            app_by_name[app_name] = app

    core_apps: list[PlexNode] = []
    for name in core_names:
        app = app_by_name.get(name)
        if app:
            core_apps.append(
                _node_from_argocd_app(
                    app,
                    kind="core",
                    orbit_band=0,
                    fallback_namespace=idp_config.config.cluster.argocdNamespace,
                )
            )
        else:
            warnings.append(f"Core app '{name}' not found in ArgoCD response.")
            core_apps.append(
                PlexNode(
                    name=name,
                    kind="core",
                    namespace=idp_config.config.cluster.argocdNamespace,
                    syncStatus="Missing",
                    healthStatus="Missing",
                    sourcePath=_core_source_path(name, root_repo_dir),
                    revision="main",
                    deployedAt=None,
                    imageTag=None,
                    orbitBand=0,
                )
            )

    services: list[PlexNode] = []
    for index, service in enumerate(sorted(services_config.services, key=lambda item: item.name), start=1):
        app = app_by_name.get(service.name)
        if app:
            node = _node_from_argocd_app(
                app,
                kind="service",
                orbit_band=(index % 4) + 1,
                fallback_namespace=service.namespace,
            )
            if not node.imageTag:
                node.imageTag = _safe_tag(service.overrides.image)
            services.append(node)
            continue

        warnings.append(f"Service app '{service.name}' not found in ArgoCD response.")
        services.append(
            PlexNode(
                name=service.name,
                kind="service",
                namespace=service.namespace,
                syncStatus="Missing",
                healthStatus="Missing",
                sourcePath=f"SVCS/{service.name}/chart",
                revision="main",
                deployedAt=None,
                imageTag=_safe_tag(service.overrides.image),
                orbitBand=(index % 4) + 1,
            )
        )

    return PlexUniverse(
        generatedAt=datetime.now(tz=UTC).isoformat(),
        dataSource="argocd",
        galaxyName="gargantua",
        clusterPath=root_repo_dir,
        servicesPath=apps_repo_dir,
        warnings=warnings,
        coreApps=core_apps,
        services=services,
    )
