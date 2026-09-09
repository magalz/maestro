#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
repo_root=$PWD
coverage_dir="$repo_root/coverage"
coverage_tmp=$(mktemp -d "${TMPDIR:-/tmp}/maestro-coverage.XXXXXX")
profile_dir="$coverage_tmp/profiles"
typescript_report_dir="$coverage_tmp/typescript-report"
mkdir -p "$coverage_dir" "$profile_dir"

cleanup() {
  rm -rf -- "$coverage_tmp"
}
trap cleanup EXIT

rm -f -- "$coverage_dir/rust.lcov" "$coverage_dir/typescript.lcov"

export RUSTUP_TOOLCHAIN="${RUSTUP_TOOLCHAIN:-1.98.1}"
export RUSTFLAGS='-C instrument-coverage'
unset CARGO_ENCODED_RUSTFLAGS
export CARGO_TARGET_DIR="$repo_root/target"
export LLVM_PROFILE_FILE="$profile_dir/rust-%p-%m.profraw"

cargo build --workspace --locked

instrumented_debug="$repo_root/target/debug"
for name in contract-probe maestro-launcher maestro-controller maestro-dev-smoke; do
  test -x "$instrumented_debug/$name"
done

smoke_binary="$instrumented_debug/maestro-dev-smoke"
smoke_output=$("$smoke_binary")
test "$smoke_output" = 'Maestro development smoke probe passed.'

# Coverage-only compiler flags keep source maps out of ordinary release output.
npx --no-install tsc -p tsconfig.json --sourceMap --inlineSources

npx --no-install c8 \
  --all \
  --src dist \
  --include '**/dist/packages/**/*.js' \
  --exclude '**/dist/packages/**/generated.js' \
  --exclude '**/dist/packages/**/schema.js' \
  --reporter lcov \
  --report-dir "$typescript_report_dir" \
  npm test

test -s "$typescript_report_dir/lcov.info"
cp -- "$typescript_report_dir/lcov.info" "$coverage_dir/typescript.lcov"

llvm_tools="$(rustc --print sysroot)/lib/rustlib/x86_64-unknown-linux-gnu/bin"
llvm_profdata="$llvm_tools/llvm-profdata"
llvm_cov="$llvm_tools/llvm-cov"
test -x "$llvm_profdata"
test -x "$llvm_cov"

profraw_files=()
while IFS= read -r -d '' profile; do
  profraw_files+=("$profile")
done < <(find "$profile_dir" -type f -name '*.profraw' -print0)
test "${#profraw_files[@]}" -gt 0

rust_profdata="$coverage_tmp/rust.profdata"
"$llvm_profdata" merge -sparse "${profraw_files[@]}" -o "$rust_profdata"
"$llvm_cov" export \
  --format=lcov \
  --instr-profile="$rust_profdata" \
  --ignore-filename-regex='(^|/)(generated\.rs|target|\.cargo|\.rustup|registry|rustc)(/|$)' \
  "$smoke_binary" \
  -object="$instrumented_debug/contract-probe" \
  -object="$instrumented_debug/maestro-launcher" \
  -object="$instrumented_debug/maestro-controller" \
  > "$coverage_dir/rust.lcov"

test -s "$coverage_dir/rust.lcov"
rust_sources=(
  tools/dev-smoke/src/main.rs
  crates/maestro-contracts/src/lib.rs
  crates/maestro-release/src/lib.rs
  crates/launcher/src/main.rs
  crates/controller/src/main.rs
)
typescript_sources=(
  packages/contracts/src/dsh.ts
  packages/contracts/src/index.ts
  packages/contracts/src/io.ts
  packages/contracts/src/release.ts
  packages/contracts/src/report.ts
  packages/gateway/src/main.ts
  packages/gateway/src/managed-runtime.ts
)

for source in "${typescript_sources[@]}"; do
  grep -Eq "^SF:.*${source//\//\\/}$" "$coverage_dir/typescript.lcov"
done
node tools/validate-coverage.mjs \
  "$coverage_dir/rust.lcov" \
  "$coverage_dir/typescript.lcov" \
  "${rust_sources[@]}" -- "${typescript_sources[@]}"

printf 'Foundation coverage: %s and %s.\n' \
  coverage/rust.lcov coverage/typescript.lcov
