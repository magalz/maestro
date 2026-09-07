# Local development

Supported baseline: Ubuntu 24.04 on Linux x86_64. This is development setup,
not platform certification. Rust, Cargo, rustfmt and Clippy come from Rust
1.98.1; Node is 24.20.0 and npm is 11.19.0. There are no third-party project
dependencies, JavaScript application sources or product tests yet. The binary
under `tools/dev-smoke` only proves that the native compiler, linker and
runtime can build and execute a program.

## Install prerequisites and exact tools

Run these commands in Bash. Installation needs outbound HTTPS, `sudo` access
for Ubuntu packages and a writable home directory. Do not run npm as root.
Keep any existing system Node installed; the version below is local to your
user account and selected through PATH in your development shell.

```bash
sudo apt-get update
sudo apt-get install -y build-essential make curl ca-certificates xz-utils git
```

Install rustup if it is missing, then the exact toolchain. No change to your
global default Rust toolchain is required: `rust-toolchain.toml` selects it
inside this repository. Clear an existing `RUSTUP_TOOLCHAIN` override first.

```bash
set -eu
export PATH="$HOME/.cargo/bin:$PATH"
unset RUSTUP_TOOLCHAIN
if ! command -v rustup >/dev/null; then
  rustup_installer=$(mktemp)
  curl --fail --show-error --silent --proto '=https' --tlsv1.2 \
    https://sh.rustup.rs -o "$rustup_installer"
  sh "$rustup_installer" -y --no-modify-path --default-toolchain none
  rm "$rustup_installer"
fi
rustup toolchain install 1.98.1 --profile minimal --component rustfmt --component clippy
rustup target add --toolchain 1.98.1 x86_64-unknown-linux-gnu
```

Download Node from its official distribution and verify the archive checksum
before extracting it. This archive includes the pinned npm version.

```bash
set -eu
node_download=$(mktemp -d)
(
  cd "$node_download"
  curl --fail --show-error --silent --proto '=https' --tlsv1.2 -O \
    https://nodejs.org/dist/v24.20.0/node-v24.20.0-linux-x64.tar.xz
  curl --fail --show-error --silent --proto '=https' --tlsv1.2 -O \
    https://nodejs.org/dist/v24.20.0/SHASUMS256.txt
  sha256sum --check --ignore-missing SHASUMS256.txt
  mkdir -p "$HOME/.local/share/maestro-toolchains"
  tar -xJf node-v24.20.0-linux-x64.tar.xz -C "$HOME/.local/share/maestro-toolchains"
)
rm -r "$node_download"
export PATH="$HOME/.local/share/maestro-toolchains/node-v24.20.0-linux-x64/bin:$PATH"
test "$(npm --version)" = 11.19.0 || { echo "Expected bundled npm 11.19.0; check the archive and PATH above." >&2; exit 1; }
```

In each new development shell, activate the tools and enter your primary
development checkout (never build in the linked `main` reference):

```bash
export PATH="$HOME/.cargo/bin:$HOME/.local/share/maestro-toolchains/node-v24.20.0-linux-x64/bin:$PATH"
unset RUSTUP_TOOLCHAIN
# cd /path/to/your/maestro-dev
make check-tools
```

`make check-tools` rejects missing tools, incorrect Rust/Cargo/Node/npm pins
and unsupported operating systems/architectures, with installation guidance.
It also prints rustfmt and Clippy versions from the selected Rust toolchain.
If `make` itself is missing, rerun the Ubuntu prerequisite installation above.
An unavailable pinned download is a setup failure; do not substitute versions.

## Install and check

From the repository root, these are the entry points for local use and later
CI. Each target stops with a nonzero exit code on failure:

```bash
make install  # cargo fetch --locked; npm ci --ignore-scripts --no-audit --no-fund
make build    # cargo build --workspace --locked
make format   # cargo fmt --all -- --check (does not rewrite source)
make lint     # cargo clippy --workspace --all-targets --locked -- -D warnings
make test     # tooling error checks; cargo run --locked --package maestro-dev-smoke
make check    # build, format, lint and smoke execution
```

`make test` explicitly reports that **no product tests exist**. It checks that
missing tools and incorrect Rust, Cargo, Node and npm versions fail with actionable guidance,
then executes the smoke binary. This is setup evidence, not product coverage. No JavaScript build,
format, lint or test suite exists yet; npm only verifies the package/lock
baseline. To fix Rust formatting, run `cargo fmt --all`, then `make format`.

Confirm frozen installs leave manifests and lockfiles unchanged, twice:

```bash
set -eu
manifest_hashes=$(mktemp)
sha256sum Cargo.toml tools/dev-smoke/Cargo.toml Cargo.lock package.json package-lock.json > "$manifest_hashes"
make install
sha256sum --check "$manifest_hashes"
make install
sha256sum --check "$manifest_hashes"
rm "$manifest_hashes"
make check
```

Build output stays under ignored `target/`; npm output, if any, stays under
ignored `node_modules/`. Commit manifests and both lockfiles, never downloaded
tools or generated output.

## Verify a separate clean checkout

After the changes are committed, use Git to copy only committed source. This
requires the same tools and PATH as above, with no private planning or untracked
source copied into the new directory:

```bash
set -eu
clean_checkout=$(mktemp -d)
git clone --no-local --branch "$(git branch --show-current)" . "$clean_checkout"
(
  cd "$clean_checkout"
  make check-tools
  manifest_hashes=$(mktemp)
  sha256sum Cargo.toml tools/dev-smoke/Cargo.toml Cargo.lock package.json package-lock.json > "$manifest_hashes"
  make install
  sha256sum --check "$manifest_hashes"
  make install
  sha256sum --check "$manifest_hashes"
  rm "$manifest_hashes"
  make check
  test -z "$(git status --porcelain)"
)
echo "Verified checkout: $clean_checkout"
```

CI and remote branch protections are pending separate setup; these local
checks do not establish either. Follow [the contribution policy](../CONTRIBUTING.md)
for development PRs and explicit human acceptance before promotion to `main`.
