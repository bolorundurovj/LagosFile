.PHONY: setup dev lint lint-fix build test sync-version help

# Default goal
help:
	@echo "LagosFile Development Makefile"
	@echo ""
	@echo "Usage:"
	@echo "  make setup          Install all dependencies (npm & rust)"
	@echo "  make dev            Run Angular and Tauri in development mode"
	@echo "  make lint           Run all linters (Angular & Rust)"
	@echo "  make fix            Run all auto-fixers and formatters"
	@echo "  make build          Build Angular app and extensions"
	@echo "  make build-tauri    Build the Tauri desktop application"
	@echo "  make sync-version   Sync version from VERSION.ini to all manifests"
	@echo ""

setup:
	npm install
	cd src-tauri && cargo fetch

dev:
	npm run tauri:dev

lint:
	npm run lint
	npm run lint:rust

fix:
	npm run format:all

build:
	npm run build
	npm run pack:ext

build-tauri:
	npm run tauri:build

sync-version:
	npm run sync:version

test:
	npm run test
