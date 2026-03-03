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


def cluster_apps_repo_dir(idp_config: IDPConfig) -> str:
    cluster_dir = _cluster_dir_from_name(active_cluster_name(idp_config))
    return f"KUBE/clusters/{cluster_dir}/{GITOPS_SERVICES_DIR}"


def cluster_root_app_repo_dir(idp_config: IDPConfig) -> str:
    cluster_dir = _cluster_dir_from_name(active_cluster_name(idp_config))
    return f"KUBE/clusters/{cluster_dir}/{GITOPS_CORE_DIR}"


def service_app_manifest_repo_path(idp_config: IDPConfig, service_name: str) -> str:
    return f"{cluster_apps_repo_dir(idp_config)}/{service_name}.yaml"


def cluster_apps_abs_dir(repo_root: Path, idp_config: IDPConfig) -> Path:
    return repo_root / Path(cluster_apps_repo_dir(idp_config))
