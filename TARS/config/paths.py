from __future__ import annotations

from pathlib import Path

from TARS.config.models import IDPConfig


def cluster_apps_repo_dir(idp_config: IDPConfig) -> str:
    cluster = idp_config.config.cluster
    return f"KUBE/clusters/{cluster.gitopsClusterDir}/{cluster.gitopsAppsDir}"


def cluster_root_app_repo_dir(idp_config: IDPConfig) -> str:
    cluster = idp_config.config.cluster
    return f"KUBE/clusters/{cluster.gitopsClusterDir}/{cluster.gitopsRootAppDir}"


def service_app_manifest_repo_path(idp_config: IDPConfig, service_name: str) -> str:
    return f"{cluster_apps_repo_dir(idp_config)}/{service_name}.yaml"


def cluster_apps_abs_dir(repo_root: Path, idp_config: IDPConfig) -> Path:
    return repo_root / Path(cluster_apps_repo_dir(idp_config))
