from fastapi import FastAPI

app = FastAPI(title="endr-svc-demo")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
