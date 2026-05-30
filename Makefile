.PHONY: setup dev lint lint-fix build test test-fe test-be test-coverage sync-version help

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
	@echo "  make test           Run all unit tests (Frontend & Backend)"
	@echo "  make test-fe        Run frontend unit tests"
	@echo "  make test-be        Run backend unit tests"
	@echo "  make test-coverage  Run tests with code coverage reports"
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

test: test-fe test-be

test-fe:
	npm run test:ci

test-be:
	npm run test:rust

test-coverage:
	npm run test:coverage
	npm run test:rust:coverage
