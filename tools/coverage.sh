#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export RUSTUP_TOOLCHAIN=1.98.1
export RUSTFLAGS='-C instrument-coverage'
export CARGO_TARGET_DIR
CARGO_TARGET_DIR=$(mktemp -d "${TMPDIR:-/tmp}/maestro-coverage.XXXXXX")
trap 'rm -rf "$CARGO_TARGET_DIR"' EXIT
export LLVM_PROFILE_FILE="$CARGO_TARGET_DIR/smoke-%p-%m.profraw"

cargo build --locked -p maestro-dev-smoke --target x86_64-unknown-linux-gnu
binary="$CARGO_TARGET_DIR/x86_64-unknown-linux-gnu/debug/maestro-dev-smoke"
smoke_output=$("$binary")
test "$smoke_output" = 'Maestro development smoke probe passed.'
llvm_tools="$(rustc --print sysroot)/lib/rustlib/x86_64-unknown-linux-gnu/bin"
"$llvm_tools/llvm-profdata" merge -sparse "$CARGO_TARGET_DIR"/*.profraw -o "$CARGO_TARGET_DIR/smoke.profdata"
"$llvm_tools/llvm-cov" export --format=lcov --instr-profile="$CARGO_TARGET_DIR/smoke.profdata" "$binary" tools/dev-smoke/src/main.rs > "$CARGO_TARGET_DIR/setup-smoke.lcov"
test -s "$CARGO_TARGET_DIR/setup-smoke.lcov"
mkdir -p coverage
cp "$CARGO_TARGET_DIR/setup-smoke.lcov" coverage/setup-smoke.lcov
printf 'Setup-only development smoke coverage: coverage/setup-smoke.lcov. No product tests or coverage.\n'
