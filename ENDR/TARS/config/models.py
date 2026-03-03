import re

from pydantic import BaseModel, Field, field_validator, model_validator

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


class RuntimeConfig(BaseModel):
    git: GitConfig
    activeCluster: str
    clusters: dict[str, ClusterConfig] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_cluster_aliases(self) -> "RuntimeConfig":
        if not self.clusters:
            raise ValueError("config.clusters must include at least one cluster")

        for alias in self.clusters:
            if not K8S_DNS_LABEL_RE.match(alias):
                raise ValueError(f"cluster alias '{alias}' must match Kubernetes DNS label format")

        if self.activeCluster not in self.clusters:
            raise ValueError(
                f"activeCluster '{self.activeCluster}' is missing in config.clusters"
            )
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


class IngressConfig(BaseModel):
    enabled: bool = False
    host: str | None = None

    @model_validator(mode="after")
    def check_host_when_enabled(self) -> "IngressConfig":
        if self.enabled and not self.host:
            raise ValueError("host is required when ingress.enabled=true")
        return self


class ServiceOverrides(BaseModel):
    image: str | None = None
    port: int = Field(default=8080, ge=1, le=65535)
    env: dict[str, str] = Field(default_factory=dict)
    resources: ResourceConfig | None = None
    ingress: IngressConfig = Field(default_factory=IngressConfig)

    @field_validator("image")
    @classmethod
    def validate_image(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if value.endswith(":latest"):
            raise ValueError("image tag 'latest' is not allowed")
        return value


class ServiceEntry(BaseModel):
    name: str
    namespace: str
    deployTo: list[str] = Field(default_factory=list)
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

    @field_validator("deployTo")
    @classmethod
    def validate_deploy_targets(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("must include at least one cluster alias")
        for environment in value:
            if not environment.strip():
                raise ValueError("cluster alias values must not be blank")
        return value



class ServicesConfig(BaseModel):
    services: list[ServiceEntry] = Field(default_factory=list)
