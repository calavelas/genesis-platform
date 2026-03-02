from fastapi import FastAPI

app = FastAPI(title="hello-service")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
