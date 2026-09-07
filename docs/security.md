# Repository security integrations

## Native configuration

The CodeQL matrix in `.github/workflows/checks.yml` scans actual Rust sources and GitHub Actions on
pull requests and pushes to `main`/`dev`, and weekly on Monday at 06:23 UTC.
There is no JavaScript product source to scan. Rust currently consists of the
development smoke crate; analysis is not product test coverage.

Each language runs on an ephemeral GitHub-hosted Ubuntu runner with a 30-minute
timeout. Checkout does not persist credentials. The workflow uses no deployment
or external-service secrets and no privileged pull-request trigger. Its token
has only `contents: read` and the analysis job's `security-events: write` needed
for result upload; fork and Dependabot PR token restrictions still apply.

Both languages use `build-mode: none`. For Rust this avoids a full build, but
**does not prevent execution of Cargo build scripts or procedural macros**:
GitHub's extractor uses rust-analyzer. No supported switch disabling these was
found in the extractor's declared options. Treat Rust PR extraction as untrusted
code execution even without an explicit Cargo build step.

`.github/dependabot.yml` checks GitHub Actions, the root Cargo workspace and the
root npm manifest weekly, with at most three open version-update PRs per
ecosystem targeting `dev`. This includes immutable action-pin updates. There
are currently no third-party Cargo/npm dependencies; configuration is not proof
that an update PR exists. No auto-merge is configured.

Dependabot reads its configuration from the repository's default branch. Its
security alerts and security-update PRs follow default-branch semantics;
`target-branch: dev` controls version updates only. The scheduled CodeQL event
also requires the workflow on the default branch and scans that branch. Landing
these files only on `dev` does not activate default-branch automation.

## Evidence and activation

Verified settings on 2026-09-07: secret scanning and push protection enabled;
Dependabot alerts enabled (API HTTP204), security updates enabled and not paused;
private vulnerability reporting enabled. Report vulnerabilities privately at
the repository's Security tab. Non-provider secret patterns and validity checks
remain disabled; an API request did not enable those optional controls.

Local configuration verification is recorded in the implementation report.
Hosted Rust/Actions analysis and SARIF uploads passed in
[run 34161931658](https://github.com/magalz/maestro/actions/runs/34161931658),
for head `a786fe3679b6c7129eb4aacbecf1f38257eee41c`, tested merge
`10fa4ed23feccef4a0c0980c658963c640c1d88f`. The analyses API recorded both
languages with no errors and zero results; no open code-scanning alerts were
observed. This is setup-source scanning, not product security certification.
Both `CodeQL (rust)` and `CodeQL (actions)` are now required status checks,
bound to GitHub Actions app15368 on main/dev. These gates require completed
scans; maintainers must still review security alerts. A passing analysis is not
a guarantee that source is vulnerability-free. Default-branch activation needs verification
after landing. Do not require a service check in branch policy before observing
its successful run. Repository plan/visibility must support CodeQL; account or
paid-plan changes require owner authorization.

## External services pending

Codecov activated through GitHub OIDC and processed the
[setup-only coverage report](coverage.md). It contains only the existing smoke
source; no product-coverage claim or required coverage threshold is made.

Sonar's API returned project `magalz_maestro`, organization `magalz`, display
name `maestro-old`, with existing August 31 analyses. Reusing it requires the
owner's explicit decision. Preserve that history; project identity and account
authorization must be resolved before integration. No Sonar analysis or quality
gate is claimed for the current revision.

Enter any required service secrets directly in GitHub settings, never in chat
or tracked files. Service tokens must not be exposed to untrusted PR execution.

## Official sources and action review

Reviewed on 2026-09-07:

- [CodeQL v4.37.9 release](https://github.com/github/codeql-action/releases/tag/v4.37.9):
  annotated release tag resolves to `cdf488f595d80d6e07e03d4674febd5ab45fa938`;
  release notes select CodeQL bundle 2.26.4. The action's
  [init descriptor](https://github.com/github/codeql-action/blob/cdf488f595d80d6e07e03d4674febd5ab45fa938/init/action.yml)
  declares Node 24 and supports `build-mode: none` for interpreted languages.
- Checkout reuses the baseline's verified v7.0.1 pin:
  `3d3c42e5aac5ba805825da76410c181273ba90b1`.
- [Rust build behavior](https://docs.github.com/en/code-security/reference/code-scanning/codeql/build-options-for-compiled-languages#building-rust)
  and [extractor options](https://github.com/github/codeql/blob/main/rust/codeql-extractor.yml).
- [Supported languages](https://codeql.github.com/docs/codeql-overview/supported-languages-and-frameworks/).
- [Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#target-branch)
  and [configuration location](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference).
- [Scheduled workflow semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
