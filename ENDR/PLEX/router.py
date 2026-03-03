from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from TARS.config.loader import load_all_configs
from TARS.scaffold.service import CreateServiceRequest, CreateServiceResponse, create_service
from PLEX.universe import PlexUniverse, build_plex_universe

router = APIRouter()


class CreateTemplateOption(BaseModel):
    name: str
    description: str = ""


class CreateOptionsResponse(BaseModel):
    serviceTemplates: list[CreateTemplateOption]
    gitopsTemplates: list[CreateTemplateOption]
    namespaces: list[CreateTemplateOption]
    kubernetesEnvironments: list[CreateTemplateOption]
    existingServices: list[str]


class CreateServiceFromPortalRequest(BaseModel):
    serviceName: str = Field(min_length=1, max_length=48)
    namespace: str = Field(min_length=1)
    environment: str = Field(min_length=1)
    serviceTemplate: str = Field(min_length=1)
    gitopsTemplate: str = Field(min_length=1)
    branchName: str | None = None
    dryRun: bool = False


@router.get("/api/plex/universe", response_model=PlexUniverse)
def get_plex_universe() -> PlexUniverse:
    try:
        return build_plex_universe()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/api/plex/templates", response_model=CreateOptionsResponse)
def get_create_options() -> CreateOptionsResponse:
    try:
        idp_config, services_config, _paths = load_all_configs()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    service_templates = [
        CreateTemplateOption(name=template.name, description=template.description)
        for template in idp_config.templates.service
    ]
    gitops_templates = [
        CreateTemplateOption(name=template.name, description=template.description)
        for template in idp_config.templates.gitops
    ]
    namespace_options = [
        CreateTemplateOption(name=namespace.name, description=namespace.description)
        for namespace in idp_config.config.namespace
    ]
    environment_options = [
        CreateTemplateOption(name=environment.name, description=environment.description)
        for environment in idp_config.config.environments.kubernetes
    ]
    if not namespace_options:
        namespace_options = [CreateTemplateOption(name="default", description="Default namespace")]
    if not environment_options:
        environment_options = [
            CreateTemplateOption(name=alias, description="")
            for alias in sorted(idp_config.config.clusters.keys())
        ]
    existing_services = sorted(service.name for service in services_config.services)

    return CreateOptionsResponse(
        serviceTemplates=service_templates,
        gitopsTemplates=gitops_templates,
        namespaces=namespace_options,
        kubernetesEnvironments=environment_options,
        existingServices=existing_services,
    )


@router.post("/api/plex/services", response_model=CreateServiceResponse)
def create_service_from_portal(payload: CreateServiceFromPortalRequest) -> CreateServiceResponse:
    request = CreateServiceRequest(
        name=payload.serviceName.strip(),
        namespace=payload.namespace.strip(),
        environments=[payload.environment.strip()],
        serviceTemplate=payload.serviceTemplate.strip(),
        gitopsTemplate=payload.gitopsTemplate.strip(),
        dryRun=payload.dryRun,
        branchName=payload.branchName.strip() if payload.branchName and payload.branchName.strip() else None,
    )
    try:
        return create_service(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
