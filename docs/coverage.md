# Setup-only coverage

The coverage report measures genuine execution of the existing development
smoke binary and its expected output. Only `tools/dev-smoke/src/main.rs` is
included. Contract, release-admission and artifact-report tests now run separately
through `npm test`, including both language consumers. They are not included in
this coverage percentage. There are no repository-configured coverage thresholds
or required coverage merge gates; Codecov defaults may produce advisory statuses.
A high percentage for this three-line probe says nothing about
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
in this initial integration; fork and Dependabot jobs are explicitly skipped
because their token permissions differ. No stored Codecov or deployment secrets are used.
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

OIDC authentication supports uploads without a stored service token. Repository activation and report processing succeeded in
[run 34162385388](https://github.com/magalz/maestro/actions/runs/34162385388).
The [processed report](https://app.codecov.io/github/magalz/maestro/commit/f66ebed1a3f9c50784309be420b31748a58ceb7b)
identifies tested merge `f66ebed1a3f9c50784309be420b31748a58ceb7b`,
PR head `68cd9522d22c5450de8e6ca517249a89605dbbda`, base
`79a99f060d28f2788522de7d7ccb3080892e9a1e`, and only
`tools/dev-smoke/src/main.rs` (three executed lines). The API reports complete
processing and an active repository. Do not infer
activation from local coverage or only an uploader exit code. If the service
requires account/app authorization, resolve that requirement with the owner.
This workflow reports upload errors but is not a required merge check.

For failures, inspect the upload step and the linked Codecov commit's processing
state. Fix the reported authentication/report issue, then rerun that intended
workflow revision. Verify both a successful job and a processed report with its
exact uploaded SHA; if the service remains queued or errored, acceptance is pending.

Sonar targets the approved `maestro` project (`magalz_maestro`, organization
`magalz`) on its `main` branch. `.github/workflows/sonar.yml` reuses this script
and imports the same setup-only report through `sonar.rust.lcov.reportPaths`.
Only `tools/dev-smoke/src` is analyzed; private planning files are outside the
source scope. The scanner retains its default Clippy analysis.

Sonar runs only on pushes to `main` or manual dispatch on `main`; the job skips
all other refs and has no PR trigger. The existing `SONAR_TOKEN` repository
secret is passed only to the scan step. A preceding check tests only its
presence and fails explicitly if missing, without printing the token.

The workflow waits for the quality gate with `sonar.qualitygate.wait=true`.
The first hosted analysis, processed report, and actual quality gate remain
pending until human-accepted promotion to `main`; local coverage generation
does not complete this integration. No Sonar check is required in branch policy.

Sources: [Rust instrumentation](https://doc.rust-lang.org/rustc/instrument-coverage.html),
[LLVM export](https://llvm.org/docs/CommandGuide/llvm-cov.html#llvm-cov-export),
[Codecov OIDC](https://github.com/codecov/codecov-action/blob/fb8b3582c8e4def4969c97caa2f19720cb33a72f/README.md#using-oidc),
[Codecov action release](https://github.com/codecov/codecov-action/releases/tag/v7.0.0),
[Codecov CLI release](https://github.com/codecov/codecov-cli/releases/tag/v11.3.1),
[Sonar Rust coverage parameters](https://docs.sonarsource.com/sonarqube-cloud/enriching/test-coverage/test-coverage-parameters),
[Sonar Rust analysis](https://docs.sonarsource.com/sonarqube-cloud/advanced-setup/languages/rust).
