.PHONY: bootstrap up down port-forward port-forward-argocd port-forward-grafana port-forward-prometheus api web validate-config smoke-test smoke-test-api smoke-test-platform svcs-check svcs-sync dev-start dev-stop dev-restart dev-status dev-logs

CLUSTER_NAME ?= mac-lab
MAKEFILE_DIR := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
REPO_ROOT := $(abspath $(MAKEFILE_DIR)/../..)

bootstrap:
	CLUSTER_NAME=$(CLUSTER_NAME) bash $(MAKEFILE_DIR)/bootstrap.sh

up:
	@echo "Starting local dev processes..."
	@echo "Run stack: make -f ENDR/SCPT/Makefile dev-start"
	@echo "Stop stack: make -f ENDR/SCPT/Makefile dev-stop"
	@echo "Status: make -f ENDR/SCPT/Makefile dev-status"

api:
	cd $(REPO_ROOT)/ENDR && uvicorn TARS.api.main:app --reload --host 0.0.0.0 --port 8000

web:
	cd $(REPO_ROOT)/ENDR/CASE && npm run dev

dev-start:
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
