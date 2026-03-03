from __future__ import annotations

from pathlib import Path

from TARS.config.models import IDPConfig

DEFAULT_ARGOCD_NAMESPACE = "argocd"
DEFAULT_SERVICE_NAMESPACE = "default"
GITOPS_SERVICES_DIR = "services"
GITOPS_CORE_DIR = "core"


def _cluster_dir_from_name(cluster_name: str) -> str:
    return cluster_name.replace("-", "/")


def active_cluster_alias(idp_config: IDPConfig) -> str:
    return idp_config.config.activeCluster


def active_cluster_name(idp_config: IDPConfig) -> str:
    alias = active_cluster_alias(idp_config)
    return idp_config.config.clusters[alias].name


def cluster_apps_repo_dir(idp_config: IDPConfig, environment_alias: str | None = None) -> str:
    alias = environment_alias or active_cluster_alias(idp_config)
    if alias not in idp_config.config.clusters:
        raise ValueError(f"unknown environment alias '{alias}'")
    cluster_name = idp_config.config.clusters[alias].name
    cluster_dir = _cluster_dir_from_name(cluster_name)
    return f"KUBE/clusters/{cluster_dir}/{GITOPS_SERVICES_DIR}"


def cluster_root_app_repo_dir(idp_config: IDPConfig, environment_alias: str | None = None) -> str:
    alias = environment_alias or active_cluster_alias(idp_config)
    if alias not in idp_config.config.clusters:
        raise ValueError(f"unknown environment alias '{alias}'")
    cluster_name = idp_config.config.clusters[alias].name
    cluster_dir = _cluster_dir_from_name(cluster_name)
    return f"KUBE/clusters/{cluster_dir}/{GITOPS_CORE_DIR}"


def service_app_manifest_repo_path(
    idp_config: IDPConfig,
    service_name: str,
    environment_alias: str | None = None,
) -> str:
    alias = environment_alias or active_cluster_alias(idp_config)
    if alias not in idp_config.config.clusters:
        raise ValueError(f"unknown environment alias '{alias}'")
    return f"{cluster_apps_repo_dir(idp_config, alias)}/{service_name}.yaml"


def cluster_apps_abs_dir(
    repo_root: Path,
    idp_config: IDPConfig,
    environment_alias: str | None = None,
) -> Path:
    return repo_root / Path(cluster_apps_repo_dir(idp_config, environment_alias))
