# Story 1.1 feasibility probes

These isolated development probes do not implement or certify the release verifier.
They deliberately remain outside the product workspaces until both feasibility
gates have complete evidence. Their dependencies are development inputs, not a
distribution inventory. No signing key, provider credential or private planning
material is included.

Use Rust/Cargo 1.98.1, Node 24.20.0 and npm 11.19.0. Native Windows development
is authorized for these probes; the repository's Ubuntu CI gate is unchanged.
The MSVC host needs the Microsoft C++ linker and Windows SDK.

For the authorized user-local alternative, Rust 1.98.1 GNU LLVM can run these
pure Rust probes with its bundled MinGW runtime and LLVM linker. In a dedicated
PowerShell session, select it only for that session:

```powershell
rustup toolchain install 1.98.1-x86_64-pc-windows-gnullvm --profile minimal --component rust-mingw
$env:RUSTUP_TOOLCHAIN = '1.98.1-x86_64-pc-windows-gnullvm'
$probeRustRoot = (& rustc --print sysroot).Trim()
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNULLVM_LINKER = Join-Path $probeRustRoot 'lib/rustlib/x86_64-pc-windows-gnullvm/bin/rust-lld.exe'
```

Use the pinned Node/npm and Rust executables on the session PATH. This does not
change the rustup default or project toolchain file. Dependencies containing C/C++
may require additional tools. The complete generator probe passed under this host;
MSVC reproduction is tracked in [issue #10](https://github.com/magalz/maestro/issues/10).

From the repository root, install the isolated, locked dependencies:

```sh
npm ci --prefix tools/contracts/probe --ignore-scripts --no-audit --no-fund
cargo fetch --locked --manifest-path tools/contracts/probe/Cargo.toml
cargo fetch --locked --manifest-path tools/contracts/probe/roundtrip/Cargo.toml
npm ci --prefix tools/release/probe --ignore-scripts --no-audit --no-fund
```

Run the probes:

```sh
node tools/contracts/probe.mjs
node tools/release/probe-dsh.mjs
```

The generator probe checks one schema containing the selected S1 vocabulary,
positive and negative Ajv vectors, reproducible TypeScript output, generated-type
admission and JSON round trips. It then invokes Typify and builds a generated Rust
round-trip consumer. The Rust consumer and the generator pair are unverified until
that final stage executes. Results appear in
`tools/contracts/probe/target/feasibility/result.json`.

The DSH probe characterizes stock profile/root/home/CLI composition with harmless
sentinels. Stock overlays restoring a row confirm known upstream behavior; they
do not reject the adopted guarded composition. An external bootstrap then verifies
fixture profile bytes against a separately supplied prior digest, captures its
allowed modules in memory and activates actual Cordis host/client sentinels.
It tests CLI and profile substitution denial and refuses bare, relative and include
module fallback. Each run uses a new private test home under
`tools/release/target/dsh-home-*` and writes its result there.

The separate external TypeScript client fixture is built, discovered through the
actual DSH `ClientModuleRegistry` using `dsh.client` and `exports["./client"]`,
served by its registry handler, and materialized by the actual browser module
runtime inside Node's VM. Unknown browser modules are denied. The actual slot core
admits a replacement at the documented conversation seam and leaves it empty after
the replacement fails, with no stock raw composer available as a fallback.

This is Node VM and slot-core evidence, not real-browser or rendered-GUI evidence.
Rendered GUI conformance belongs to later integration. The staged foundation now
has guarded captured activation, selection-substitution checks and exact dependency
rationale/notices; see the current release verification guide. The current DSH
focused probe now exits zero with `pass` after the controlled capture/activation
race check. Its explicitly listed broader limits remain unproved.
It does not start the stock runtime, providers, shell tools or package management.

On the initial Windows execution, Node/npm and Rust/Cargo pins were installed and
verified. TypeScript checks passed. Rust compilation could not run because
`link.exe` was absent; automatic execution policy rejected the attempted Microsoft
C++ Build Tools installation. This is an environment prerequisite failure, not
evidence that Typify failed. A later GNU LLVM execution passed the full generator
probe. This supplies local feasibility evidence; the production identities and
broader acceptance obligations still require implementation and verification.

Release schemas/consumers, strict ingress/signatures, trust transitions, artifact
reports and synthetic staged inventory/cross-language tests are now implemented.
See [current contract scope](contracts.md) for test commands, review-only assembly
and the accepted versioned DSH inventory profile. No production release,
supported route, usable distribution or story readiness is claimed.
