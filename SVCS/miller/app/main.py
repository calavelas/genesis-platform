from fastapi import FastAPI

app = FastAPI(title="miller")

print("Hello from miller!")

@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}

