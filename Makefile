.PHONY: check-tools install build format lint test check

check-tools:
	@set -eu; \
	for tool in rustup rustc cargo node npm cc; do \
		command -v "$$tool" >/dev/null || { echo "Missing $$tool: follow docs/development.md installation steps." >&2; exit 1; }; \
	done; \
	test "$$(uname -s)-$$(uname -m)" = Linux-x86_64 || { echo "Only Linux x86_64 development is supported." >&2; exit 1; }; \
	case "$$(rustc --version)" in 'rustc 1.98.1 '*) ;; *) echo "Expected Rust 1.98.1; see docs/development.md." >&2; exit 1;; esac; \
	case "$$(cargo --version)" in 'cargo 1.98.1 '*) ;; *) echo "Expected Cargo 1.98.1; see docs/development.md." >&2; exit 1;; esac; \
	test "$$(node --version)" = v24.20.0 || { echo "Expected Node 24.20.0; activate the PATH in docs/development.md." >&2; exit 1; }; \
	test "$$(npm --version)" = 11.19.0 || { echo "Expected npm 11.19.0; see docs/development.md." >&2; exit 1; }; \
	rustc --version; cargo --version; node --version; npm --version; \
	cargo fmt --version || { echo "Install rustfmt: rustup component add --toolchain 1.98.1 rustfmt" >&2; exit 1; }; \
	cargo clippy --version || { echo "Install Clippy: rustup component add --toolchain 1.98.1 clippy" >&2; exit 1; }

install: check-tools
	cargo fetch --locked
	npm ci --ignore-scripts --no-audit --no-fund

build: check-tools
	cargo build --workspace --locked
	npm run build
	npm run check-generated
	node tools/release/verify-notices.mjs

format: check-tools
	cargo fmt --all -- --check

lint: check-tools
	cargo clippy --workspace --all-targets --locked -- -D warnings

test: check-tools
	@echo "Running shared contract and synthetic release-admission vectors; this does not certify a distribution route."
	sh tools/check-tool-errors.sh
	cargo run --locked --package maestro-dev-smoke
	npm test

check: build format lint test
