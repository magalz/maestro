# Development checks in CI

[The workflow](../.github/workflows/checks.yml) schedules one job named
`development-checks` for pull requests targeting `main` or `dev` and pushes to
either branch. It has no path filters or conditional job skips and has a
30-minute timeout.

It installs Rust 1.98.1 with rustfmt, Clippy and the
`x86_64-unknown-linux-gnu` target through rustup, then Node 24.20.0 from
`.node-version`, including npm 11.19.0. The existing `make check-tools` guard
rejects incorrect versions. CI runs the same `make install` and `make check`
commands as [local development](development.md): frozen Cargo/npm installs,
Rust build, formatting, Clippy, tooling error checks and the smoke probe.
After each command, `git diff --exit-code HEAD --` rejects tracked changes,
including manifest or lockfile rewrites. No product tests exist yet.

## Identify what ran

The hosted `ubuntu-24.04` runner is Linux x64. Its preinstalled software and
image change over time; the label does not identify an immutable machine.
The `Record source and runner identity` log records `ImageOS`, `ImageVersion`,
`RUNNER_OS`, `RUNNER_ARCH`, event/ref/SHA, the actual `git rev-parse HEAD`,
PR number and head/base SHAs and base branch, and run ID, attempt and URL.

For a pull request, checkout evaluates GitHub's synthetic merge commit, which
combines the recorded head and base. The tested commit therefore differs from
the contributor's head SHA. For a push, checkout evaluates the pushed commit;
PR identity fields are empty. Keep the full tested/head/base SHAs and run URL
with any validation claim. A result from another revision or an older base
does not establish that the current proposed merge passes.

Only a completed `development-checks` job with conclusion `success` counts as
passing for that evaluated revision. Missing, pending, failed, skipped,
timed-out or cancelled checks do not. Open the job's logs for the failing
command and its diagnostics; formatting failures come from `cargo fmt`.

## Permissions and validation status

Official checkout and setup-node actions are pinned to reviewed full commit
IDs. The workflow grants only `contents: read`, does not persist checkout
credentials, disables package-manager caching, and uses no repository secrets
or deployment environments. It uses `pull_request`, never a privileged
`pull_request_target` or `workflow_run` trigger to execute contribution code.
GitHub's read-only workflow token is used by the official actions; the Make
commands receive no explicitly supplied credentials.

The workflow is configured; observed remote validation is pending. Acceptance
requires a deliberately malformed Rust formatting revision to fail remotely,
then a corrected new revision to succeed, with both full SHAs, run URLs, job
conclusions, tested merge/head/base identities and runner image versions
recorded. Local success alone does not establish CI success. Branch protection
and required-check enforcement remain a separate, unverified setup step.
