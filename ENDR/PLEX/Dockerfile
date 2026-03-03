FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /workspace

COPY ENDR ./ENDR
COPY ENDR.yaml SVCS.yaml ./
COPY KUBE ./KUBE
COPY SVCS ./SVCS

RUN pip install --upgrade pip \
    && pip install \
      fastapi \
      "uvicorn[standard]" \
      pydantic \
      pyyaml \
      jinja2 \
      certifi

ENV IDP_REPO_ROOT=/workspace

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir", "ENDR"]
