from fastapi import FastAPI

app = FastAPI(title="demo-pr-0302172827")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
