.PHONY: bootstrap up down port-forward port-forward-argocd port-forward-grafana port-forward-prometheus api web plex case validate-config smoke-test smoke-test-api smoke-test-platform svcs-check svcs-sync dev-start dev-stop dev-restart dev-status dev-logs tunnel-login tunnel-create tunnel-route tunnel-setup tunnel-start tunnel-stop tunnel-restart tunnel-status tunnel-logs tunnel-render-config

CLUSTER_NAME ?= mac-lab
MAKEFILE_DIR := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
REPO_ROOT := $(abspath $(MAKEFILE_DIR)/../..)

bootstrap:
	CLUSTER_NAME=$(CLUSTER_NAME) bash $(MAKEFILE_DIR)/bootstrap.sh

up:
	@echo "Starting local CASE + PLEX dev processes..."
	@echo "Run stack: make -f ENDR/SCPT/Makefile dev-start"
	@echo "Stop stack: make -f ENDR/SCPT/Makefile dev-stop"
	@echo "Status: make -f ENDR/SCPT/Makefile dev-status"

api: plex

web: case

plex:
	cd $(REPO_ROOT)/ENDR && uvicorn TARS.api.main:app --reload --host 0.0.0.0 --port 8000

case:
	cd $(REPO_ROOT)/ENDR/CASE && ENDR_API_URL=http://127.0.0.1:8000 npm run dev

dev-start:
	@echo "[dev-start] launching local PLEX (API) + CASE (UI)..."
	bash $(MAKEFILE_DIR)/dev-stack.sh start

dev-stop:
	bash $(MAKEFILE_DIR)/dev-stack.sh stop

dev-restart:
	bash $(MAKEFILE_DIR)/dev-stack.sh restart

dev-status:
	bash $(MAKEFILE_DIR)/dev-stack.sh status

dev-logs:
	bash $(MAKEFILE_DIR)/dev-stack.sh logs all

down:
	CLUSTER_NAME=$(CLUSTER_NAME) bash $(MAKEFILE_DIR)/down.sh

port-forward:
	bash $(MAKEFILE_DIR)/port-forward.sh argocd

port-forward-argocd:
	bash $(MAKEFILE_DIR)/port-forward.sh argocd

port-forward-grafana:
	bash $(MAKEFILE_DIR)/port-forward.sh grafana

port-forward-prometheus:
	bash $(MAKEFILE_DIR)/port-forward.sh prometheus

validate-config:
	bash $(MAKEFILE_DIR)/validate-config.sh

smoke-test:
	CLUSTER_NAME=$(CLUSTER_NAME) bash $(MAKEFILE_DIR)/smoke-test.sh all

smoke-test-api:
	bash $(MAKEFILE_DIR)/smoke-test.sh api

smoke-test-platform:
	CLUSTER_NAME=$(CLUSTER_NAME) bash $(MAKEFILE_DIR)/smoke-test.sh platform

svcs-check:
	@echo "Running SVCS check (dry-run, no PR)..."
	$(REPO_ROOT)/ENDR/.venv/bin/python $(REPO_ROOT)/ENDR/TARS/TARS.py svcs-check --repo-root $(REPO_ROOT)

svcs-sync:
	@echo "Running SVCS check and writing generated files to working tree..."
	$(REPO_ROOT)/ENDR/.venv/bin/python $(REPO_ROOT)/ENDR/TARS/TARS.py svcs-check --repo-root $(REPO_ROOT) --write-worktree

tunnel-login:
	bash $(MAKEFILE_DIR)/cloudflare-tunnel.sh login

tunnel-create:
	bash $(MAKEFILE_DIR)/cloudflare-tunnel.sh create

tunnel-route:
	bash $(MAKEFILE_DIR)/cloudflare-tunnel.sh route

tunnel-setup:
	bash $(MAKEFILE_DIR)/cloudflare-tunnel.sh setup

tunnel-start:
	bash $(MAKEFILE_DIR)/cloudflare-tunnel.sh start

tunnel-stop:
	bash $(MAKEFILE_DIR)/cloudflare-tunnel.sh stop

tunnel-restart:
	bash $(MAKEFILE_DIR)/cloudflare-tunnel.sh restart

tunnel-status:
	bash $(MAKEFILE_DIR)/cloudflare-tunnel.sh status

tunnel-logs:
	bash $(MAKEFILE_DIR)/cloudflare-tunnel.sh logs

tunnel-render-config:
	bash $(MAKEFILE_DIR)/cloudflare-tunnel.sh render-config
