from fastapi import FastAPI

app = FastAPI(title="mann")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
