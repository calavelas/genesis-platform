.PHONY: bootstrap up down port-forward port-forward-argocd port-forward-grafana port-forward-prometheus api web validate-config smoke-test smoke-test-api smoke-test-platform genesis genesis-write

CLUSTER_NAME ?= genesis-local

bootstrap:
	CLUSTER_NAME=$(CLUSTER_NAME) bash scripts/bootstrap.sh

up:
	@echo "Starting local dev processes..."
	@echo "Run API: make api"
	@echo "Run Web: make web"

api:
	cd apps/idp-api && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

web:
	cd apps/idp-web && npm run dev

down:
	CLUSTER_NAME=$(CLUSTER_NAME) bash scripts/down.sh

port-forward:
	bash scripts/port-forward.sh all

port-forward-argocd:
	bash scripts/port-forward.sh argocd

port-forward-grafana:
	bash scripts/port-forward.sh grafana

port-forward-prometheus:
	bash scripts/port-forward.sh prometheus

validate-config:
	bash scripts/validate-config.sh

smoke-test:
	CLUSTER_NAME=$(CLUSTER_NAME) bash scripts/smoke-test.sh all

smoke-test-api:
	bash scripts/smoke-test.sh api

smoke-test-platform:
	CLUSTER_NAME=$(CLUSTER_NAME) bash scripts/smoke-test.sh platform

genesis:
	@echo "Running genesis reconcile (dry-run, no PR)..."
	apps/idp-api/.venv/bin/python scripts/ci/genesis.py --repo-root .

genesis-write:
	@echo "Running genesis reconcile and writing generated files to working tree..."
	apps/idp-api/.venv/bin/python scripts/ci/genesis.py --repo-root . --write-worktree
