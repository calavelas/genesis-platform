from fastapi import FastAPI

app = FastAPI(title="edmund")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
