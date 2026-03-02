.PHONY: bootstrap up down port-forward port-forward-argocd port-forward-grafana port-forward-prometheus api web validate-config smoke-test smoke-test-api smoke-test-platform genesis genesis-write

CLUSTER_NAME ?= genesis-local
MAKEFILE_DIR := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
REPO_ROOT := $(abspath $(MAKEFILE_DIR)/..)

bootstrap:
	CLUSTER_NAME=$(CLUSTER_NAME) bash $(MAKEFILE_DIR)/bootstrap.sh

up:
	@echo "Starting local dev processes..."
	@echo "Run API: make -f SCPT/Makefile api"
	@echo "Run Web: make -f SCPT/Makefile web"

api:
	cd $(REPO_ROOT)/ENDR && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

web:
	cd $(REPO_ROOT)/CASE && npm run dev

down:
	CLUSTER_NAME=$(CLUSTER_NAME) bash $(MAKEFILE_DIR)/down.sh

port-forward:
	bash $(MAKEFILE_DIR)/port-forward.sh all

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

genesis:
	@echo "Running genesis reconcile (dry-run, no PR)..."
	$(REPO_ROOT)/ENDR/.venv/bin/python $(REPO_ROOT)/TARS/TARS.py genesis --repo-root $(REPO_ROOT)

genesis-write:
	@echo "Running genesis reconcile and writing generated files to working tree..."
	$(REPO_ROOT)/ENDR/.venv/bin/python $(REPO_ROOT)/TARS/TARS.py genesis --repo-root $(REPO_ROOT) --write-worktree
