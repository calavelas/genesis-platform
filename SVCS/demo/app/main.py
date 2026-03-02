from fastapi import FastAPI

app = FastAPI(title="demo")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
