from fastapi import FastAPI, HTTPException

from app.config.loader import build_validation_report, load_all_configs

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
