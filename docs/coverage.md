# Foundation coverage and SonarCloud

The foundation suite measures Rust and TypeScript consumers exercised by the
existing cross-language tests, including the development smoke probe, contracts,
release admission, controller, launcher and gateway. Generated bindings and
embedded schema text are excluded from analysis metrics; dependencies and
private planning are outside source scope. These reports do not certify a
production release or rendered GUI.

With the pinned Linux x86_64 toolchain and Node/npm installed:

```sh
rustup component add --toolchain 1.98.1 llvm-tools-preview
npm ci --ignore-scripts --no-audit --no-fund
bash tools/coverage.sh
```

The script writes `coverage/rust.lcov` and `coverage/typescript.lcov`. Rust
instrumentation includes binaries invoked by the shared suite. TypeScript
coverage maps compiled execution back to original source files. Fresh profiles
prevent stale executions from inflating later reports.

## Codecov

`.github/workflows/coverage.yml` runs on main/dev pushes and same-repository PRs
into those branches. Fork and Dependabot runs are skipped because upload
permissions differ. GitHub OIDC authenticates the upload without a stored Codecov
token. Only the two named LCOV reports are sent, with the foundation flag.

The configured destination is **Codecov Cloud**, using the action's default
endpoint. No self-hosted endpoint or Cloudflare Tunnel URL is configured.
The earlier PR #11 upload reached Codecov Cloud in
[run 34410289350](https://github.com/magalz/maestro/actions/runs/34410289350),
for evaluated merge SHA `cfbbcddf44c8f1a2ccb77d9a75cfeadb0cdb5b42`. That historical
report measured only setup smoke, not foundation coverage. Upload success alone
does not prove server-side processing completed.

Uploads identify the evaluated github.sha (PR merge revision or push commit).
Before uploading, the workflow retains both reports as uniquely named Actions
artifacts for seven days. After fixing a service/network error, rerun that
coverage job; it regenerates the reports. Verify the evaluated SHA and execution
identity. Upload-only recovery from retained reports must use their original
SHA, not the latest branch head. An unrelated offline self-hosted service does
not itself require this Cloud upload to be repeated.

The pinned Codecov action/CLI validates upstream downloads. Reporting has no
repository-defined coverage threshold and is not a required merge check;
service-provided statuses may still be advisory.

## SonarCloud

`.github/workflows/sonar.yml` uses the existing project `magalz_maestro` in
organization `magalz`. It runs on main/dev pushes, same-repository PRs into those
branches and explicit workflow dispatch restricted to main/dev. Fork and Dependabot analysis is skipped;
there is no pull_request_target execution. Only the scanner receives the existing
SONAR_TOKEN. A presence check fails explicitly if it is missing, and the scanner
waits for the actual quality gate.

`sonar-project.properties` defines Rust/TypeScript source and test scope, and
imports both reports using `sonar.rust.lcov.reportPaths` and
`sonar.javascript.lcov.reportPaths`. Full-history checkout uses the PR head for
PR analysis; the scanner infers the number, branch and base from Actions metadata.
Push/manual analysis uses its actual checked-out ref. Default Clippy analysis is
retained. Reports are saved as Actions artifacts before scanning, independently
of Codecov availability.

The organization plan must allow the requested branch/PR analysis. SonarCloud's
Free plan restricts PR analysis to the main branch; OSS provides unlimited branch
and PR analysis. A plan, token or missing-baseline rejection is an integration
failure, not a successful quality gate. Existing main analysis does not prove
dev/current-PR analysis. Do not relabel feature revisions as main, change the
subscription or weaken the quality gate to conceal failure. Human review and
established merge policy remain in force.

Sources: [Rust instrumentation](https://doc.rust-lang.org/rustc/instrument-coverage.html),
[LLVM export](https://llvm.org/docs/CommandGuide/llvm-cov.html#llvm-cov-export),
[Codecov action](https://github.com/codecov/codecov-action),
[Sonar coverage parameters](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/test-coverage/test-coverage-parameters),
[Sonar PR analysis](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/pull-request-analysis),
[Sonar plans](https://docs.sonarsource.com/sonarqube-cloud/administering-sonarcloud/managing-subscription/subscription-plans).
