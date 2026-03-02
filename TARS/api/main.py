from fastapi import FastAPI, HTTPException

from TARS.config.loader import build_validation_report, load_all_configs
from TARS.scaffold.service import CreateServiceRequest, CreateServiceResponse, create_service

app = FastAPI(title="IDP API", version="0.1.0")


@app.get("/api/health")
def health() -> dict[str, object]:
    report = build_validation_report()
    return {
        "status": "ok" if report.valid else "degraded",
        "configValid": report.valid,
        "errorCount": len(report.errors),
    }


@app.get("/api/config/validate")
def validate_config() -> dict[str, object]:
    report = build_validation_report()
    if not report.valid:
        raise HTTPException(status_code=422, detail=report.model_dump())
    return report.model_dump()


@app.get("/api/config")
def get_config() -> dict[str, object]:
    report = build_validation_report()
    if not report.valid:
        raise HTTPException(status_code=422, detail=report.model_dump())

    idp_config, services_config, paths = load_all_configs()
    return {
        "paths": paths.model_dump(),
        "idpConfig": idp_config.model_dump(),
        "servicesConfig": services_config.model_dump(),
    }


@app.post("/api/services", response_model=CreateServiceResponse)
def create_service_endpoint(payload: CreateServiceRequest) -> CreateServiceResponse:
    try:
        return create_service(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
