# TARS API Module

API-layer logic consumed by the FastAPI wrapper in `ENDR`.

Responsibilities:
- request/response shaping for scaffold actions
- wiring config loader and scaffold services for HTTP endpoints
- include external domain routers (for example `PLEX`) into the shared FastAPI app
