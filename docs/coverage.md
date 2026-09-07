# Setup-only coverage

The coverage report measures genuine execution of the existing development
smoke binary and its expected output. Only `tools/dev-smoke/src/main.rs` is
included. There are no product tests, coverage thresholds or required coverage
merge gates. A high percentage for this three-line probe says nothing about
Maestro product coverage.

On the supported Linux x86_64 development environment, with Rust tools on PATH:

```sh
rustup component add --toolchain 1.98.1 llvm-tools-preview
bash tools/coverage.sh
```

The script uses Rust 1.98.1 instrumentation and its matching native LLVM tools,
checks the smoke output, and writes ignored `coverage/setup-smoke.lcov`. Each
run creates and removes fresh temporary build/profile output so stale profiles
are not merged. No cargo-llvm-cov dependency or fabricated test is needed.

`.github/workflows/coverage.yml` runs on pushes to `main`/`dev` and same-repository
pull requests targeting those branches. Fork coverage reporting is unavailable
in this initial integration; the job is skipped. Dependabot's restricted token
may also prevent OIDC uploads. No stored Codecov or deployment secrets are used.
The job has `contents: read` and `id-token: write` for GitHub OIDC authentication,
uses an ephemeral hosted runner, and does not persist checkout credentials.

Uploads are labeled `setup-only` / `development-smoke-setup-only`. The explicit
upload commit is the revision checked out by Actions (`github.sha`): the push
commit or the PR merge revision, rather than silently labeling merge-revision
coverage as PR-head coverage. Only the named LCOV file is uploaded; automatic
report search and coverage plugins are disabled.

Codecov action v7.0.0 is pinned to
`fb8b3582c8e4def4969c97caa2f19720cb33a72f`, with CLI `v11.3.1` and upstream
signature/checksum verification enabled. The CLI and verification key are still
downloaded from the vendor at runtime. Checkout reuses verified v7.0.1 commit
`3d3c42e5aac5ba805825da76410c181273ba90b1`.

OIDC authentication supports uploads without a stored service token. Successful
repository activation and report processing remain pending an observed hosted
run and a processed Codecov report matching the uploaded revision. Do not infer
activation from local coverage or only an uploader exit code. If the service
requires account/app authorization, resolve that requirement with the owner.
This workflow reports upload errors but is not a required merge check.

Sonar remains untouched pending the owner's project decision; no Sonar analysis
or quality gate is claimed.

Sources: [Rust instrumentation](https://doc.rust-lang.org/rustc/instrument-coverage.html),
[LLVM export](https://llvm.org/docs/CommandGuide/llvm-cov.html#llvm-cov-export),
[Codecov OIDC](https://github.com/codecov/codecov-action/blob/fb8b3582c8e4def4969c97caa2f19720cb33a72f/README.md#using-oidc),
[Codecov action release](https://github.com/codecov/codecov-action/releases/tag/v7.0.0),
[Codecov CLI release](https://github.com/codecov/codecov-cli/releases/tag/v11.3.1).
