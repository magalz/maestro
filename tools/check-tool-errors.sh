#!/bin/sh
# Run from the repository root; verify prerequisite failures stay actionable.
set -eu
make_bin=$(command -v make)
scratch=$(mktemp -d)
trap 'rm -f "$scratch/output" "$scratch/node" "$scratch/rustc" "$scratch/cargo" "$scratch/npm"; rmdir "$scratch"' EXIT

if PATH="$scratch" "$make_bin" check-tools >"$scratch/output" 2>&1; then
    echo 'Missing tooling unexpectedly passed.' >&2
    exit 1
fi
grep -q 'Missing rustup: follow docs/development.md' "$scratch/output" || { cat "$scratch/output" >&2; exit 1; }

while read -r tool diagnostic; do
    printf '#!/bin/sh\necho v0.0.0\n' >"$scratch/$tool"
    chmod +x "$scratch/$tool"
    if PATH="$scratch:$PATH" "$make_bin" check-tools >"$scratch/output" 2>&1; then
        echo "Incorrect $tool version unexpectedly passed." >&2
        exit 1
    fi
    grep -Fq "$diagnostic" "$scratch/output" || { cat "$scratch/output" >&2; exit 1; }
    rm "$scratch/$tool"
done <<'CASES'
rustc Expected Rust 1.98.1
cargo Expected Cargo 1.98.1
node Expected Node 24.20.0
npm Expected npm 11.19.0
CASES
echo 'Tooling error checks passed.'
