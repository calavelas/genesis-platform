from fastapi import FastAPI
from fastapi.responses import HTMLResponse

SERVICE_NAME = "sample"
app = FastAPI(title=SERVICE_NAME)


@app.get("/", response_class=HTMLResponse)
def landing() -> str:
    return """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>sample</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f6f8fb;
        color: #111827;
      }
      .card {
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 24px;
        width: min(560px, calc(100% - 32px));
        box-shadow: 0 10px 30px rgba(17, 24, 39, 0.08);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 28px;
      }
      p {
        margin: 6px 0;
      }
      code {
        background: #f3f4f6;
        padding: 2px 6px;
        border-radius: 6px;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>sample</h1>
      <p>Service is up.</p>
      <p>Health endpoint: <code>/healthz</code></p>
    </main>
  </body>
</html>"""


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
