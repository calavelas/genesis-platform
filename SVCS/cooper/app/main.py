from fastapi import FastAPI

app = FastAPI(title="cooper")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
