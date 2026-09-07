#!/bin/sh
# Run from the repository root; verify prerequisite failures stay actionable.
set -eu
make_bin=$(command -v make)
scratch=$(mktemp -d)
trap 'rm -f "$scratch/output" "$scratch/node"; rmdir "$scratch"' EXIT

if PATH="$scratch" "$make_bin" check-tools >"$scratch/output" 2>&1; then
    echo 'Missing tooling unexpectedly passed.' >&2
    exit 1
fi
grep -q 'Missing rustup: follow docs/development.md' "$scratch/output" || { cat "$scratch/output" >&2; exit 1; }

cat >"$scratch/node" <<'STUB'
#!/bin/sh
echo v0.0.0
STUB
chmod +x "$scratch/node"
if PATH="$scratch:$PATH" "$make_bin" check-tools >"$scratch/output" 2>&1; then
    echo 'Incorrect Node version unexpectedly passed.' >&2
    exit 1
fi
grep -q 'Expected Node 24.20.0' "$scratch/output" || { cat "$scratch/output" >&2; exit 1; }
echo 'Tooling error checks passed.'
