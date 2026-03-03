import re
from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator

K8S_DNS_LABEL_RE = re.compile(r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$")


class GitConfig(BaseModel):
    provider: str = Field(default="github")
    owner: str
    repo: str
    defaultBranch: str = Field(default="main")


class ClusterConfig(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_cluster_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be blank")
        if not K8S_DNS_LABEL_RE.match(normalized):
            raise ValueError("must match Kubernetes DNS label format")
        return normalized


class KubernetesEnvironment(BaseModel):
    name: str
    description: str = ""

    @model_validator(mode="before")
    @classmethod
    def from_string(cls, value: Any) -> Any:
        if isinstance(value, str):
            return {"name": value}
        return value

    @field_validator("name")
    @classmethod
    def validate_environment_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be blank")
        if not K8S_DNS_LABEL_RE.match(normalized):
            raise ValueError("must match Kubernetes DNS label format")
        return normalized


class EnvironmentCatalog(BaseModel):
    kubernetes: list[KubernetesEnvironment] = Field(default_factory=list)


class NamespaceConfig(BaseModel):
    name: str
    description: str = ""

    @model_validator(mode="before")
    @classmethod
    def from_string(cls, value: Any) -> Any:
        if isinstance(value, str):
            return {"name": value}
        return value

    @field_validator("name")
    @classmethod
    def validate_namespace_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be blank")
        if not K8S_DNS_LABEL_RE.match(normalized):
            raise ValueError("must match Kubernetes DNS label format")
        return normalized


class RuntimeConfig(BaseModel):
    git: GitConfig
    activeCluster: str | None = None
    clusters: dict[str, ClusterConfig] = Field(default_factory=dict)
    environments: EnvironmentCatalog = Field(default_factory=EnvironmentCatalog)
    namespace: list[NamespaceConfig] = Field(
        default_factory=list,
        validation_alias=AliasChoices("namespace", "namespaces"),
    )
    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_cluster_aliases(self) -> "RuntimeConfig":
        if not self.clusters and self.environments.kubernetes:
            self.clusters = {
                environment.name: ClusterConfig(name=environment.name)
                for environment in self.environments.kubernetes
            }

        if not self.environments.kubernetes and self.clusters:
            self.environments = EnvironmentCatalog(
                kubernetes=[KubernetesEnvironment(name=alias) for alias in self.clusters]
            )

        if not self.clusters:
            raise ValueError(
                "config must include at least one Kubernetes environment "
                "(config.environments.kubernetes or config.clusters)"
            )

        for alias in self.clusters:
            if not K8S_DNS_LABEL_RE.match(alias):
                raise ValueError(f"cluster alias '{alias}' must match Kubernetes DNS label format")

        if not self.activeCluster:
            self.activeCluster = next(iter(self.clusters.keys()))

        if self.activeCluster not in self.clusters:
            raise ValueError(
                f"activeCluster '{self.activeCluster}' is missing in config.clusters"
            )

        if not self.namespace:
            self.namespace = [NamespaceConfig(name="default")]
        return self


class TemplateRef(BaseModel):
    name: str = Field(min_length=1)
    type: str = Field(default="")
    description: str = ""
    path: str = Field(min_length=1)

    @field_validator("name", "path")
    @classmethod
    def must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value


class TemplateCatalog(BaseModel):
    extends: list[TemplateRef] = Field(default_factory=list)
    service: list[TemplateRef] = Field(default_factory=list)
    gitops: list[TemplateRef] = Field(default_factory=list)


class IDPConfig(BaseModel):
    projectName: str
    owners: list[str] = Field(default_factory=list)
    config: RuntimeConfig
    templates: TemplateCatalog

    @field_validator("projectName")
    @classmethod
    def validate_project_name(cls, value: str) -> str:
        if len(value) > 48:
            raise ValueError("must be <= 48 characters")
        if not K8S_DNS_LABEL_RE.match(value):
            raise ValueError("must match Kubernetes DNS label format")
        return value


class TemplateSelector(BaseModel):
    template: str = Field(min_length=1)


class ServiceGenerator(BaseModel):
    service: TemplateSelector
    gitops: TemplateSelector


class ResourcePair(BaseModel):
    cpu: str = Field(min_length=1)
    memory: str = Field(min_length=1)


class ResourceConfig(BaseModel):
    requests: ResourcePair
    limits: ResourcePair


class GatewayConfig(BaseModel):
    enabled: bool = True


class ServiceOverrides(BaseModel):
    model_config = ConfigDict(extra="ignore")
    image: str | None = None
    port: int = Field(default=8080, ge=1, le=65535)
    env: dict[str, str] = Field(default_factory=dict)
    resources: ResourceConfig | None = None
    gateway: GatewayConfig = Field(default_factory=GatewayConfig)

    @model_validator(mode="before")
    @classmethod
    def migrate_ingress_to_gateway(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        raw = dict(value)
        if "gateway" not in raw and isinstance(raw.get("ingress"), dict):
            ingress_enabled = raw["ingress"].get("enabled")
            raw["gateway"] = {"enabled": bool(ingress_enabled) if ingress_enabled is not None else True}
        return raw

    @field_validator("image")
    @classmethod
    def validate_image(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if value.endswith(":latest"):
            raise ValueError("image tag 'latest' is not allowed")
        return value


class ServiceEntry(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str
    namespace: str
    environments: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("environments", "deployTo"),
        serialization_alias="environments",
    )
    generator: ServiceGenerator
    overrides: ServiceOverrides = Field(default_factory=ServiceOverrides)

    @field_validator("name")
    @classmethod
    def validate_service_name(cls, value: str) -> str:
        if len(value) > 48:
            raise ValueError("must be <= 48 characters")
        if not K8S_DNS_LABEL_RE.match(value):
            raise ValueError("must match Kubernetes DNS label format")
        return value

    @field_validator("namespace")
    @classmethod
    def validate_namespace(cls, value: str) -> str:
        if len(value) > 63:
            raise ValueError("must be <= 63 characters")
        if not K8S_DNS_LABEL_RE.match(value):
            raise ValueError("must match Kubernetes DNS label format")
        return value

    @field_validator("environments")
    @classmethod
    def validate_deploy_targets(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("must include at least one environment")
        for environment in value:
            if not environment.strip():
                raise ValueError("environment values must not be blank")
        return value

    @property
    def deployTo(self) -> list[str]:
        return self.environments



class ServicesConfig(BaseModel):
    services: list[ServiceEntry] = Field(default_factory=list)
