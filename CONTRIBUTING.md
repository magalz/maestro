# Contributing to Maestro

## Development changes

Install Git (2.43 or later is the verified baseline) and the GitHub CLI (`gh`).
Maintainers need repository push access; authenticate with `gh auth login` and
verify with `gh auth status`. Never paste credentials into commits or issues.
Before your first commit, set your own repository-local identity:

```sh
git config --local user.name "Your Name"
git config --local user.email "YOUR_GITHUB_NOREPLY_ADDRESS"
```

Use the primary `maestro-dev` worktree. Start a short-lived branch from current
`dev` and open its pull request against `dev`:

```sh
git status --porcelain
# Continue only if empty; otherwise preserve and finish your existing work.
git switch dev
git pull --ff-only origin dev
git switch -c feature/describe-change
# Edit and review the intended public files.
git add path/to/reviewed-file
git diff --cached
git commit -m "Describe the change"
git push -u origin feature/describe-change
gh pr create --base dev
```

Use `fix/*` for fixes. Stage explicit reviewed paths. Never commit credentials,
private planning, installed agent tooling, uncleared branding or generated
state. Configure your own author identity locally (`git config --local
user.name` and `git config --local user.email`), using your GitHub noreply email
when you want to keep your address private.

After completing the PR, return the primary worktree to `dev` and update with
`git pull --ff-only origin dev`. Stop if local changes or divergence prevent a
safe update; preserve the work and resolve it explicitly.

## Promotion and reference refresh

Promote `dev` by opening a PR with base `main` and head `dev`. A human must
explicitly accept promotion before merging. Use a **merge commit**, preserving
the ancestry of both long-lived branches. Reconcile `main` into development
through a merge-commit PR when needed. Record the maintainer's acceptance in
the promotion PR. Do not force-push, delete long-lived branches or
bypass merge rules. A merge does not authorize a release or deployment.

Keep the linked `maestro` worktree on `main`, clean and free of feature edits,
builds or commits. Refresh it only when explicitly requested, after promotion
has been accepted:

```sh
git -C ../maestro status --porcelain
git -C ../maestro branch --show-current
# Continue only if status is empty and the branch is main.
git -C ../maestro fetch origin
git -C ../maestro merge --ff-only origin/main
```

Dirty or diverged state stops the refresh; never reset it to make the command
pass. A linked worktree is not an operating-system read-only boundary.

## Checks and merge policy

Install the pinned tools and run `make install` and `make check` following
[the development guide](docs/development.md). The repository includes shared
Rust/TypeScript contract, release-admission and artifact-report tests; these
foundation fixtures do not certify a supported distribution. The
[coverage integrations](docs/coverage.md) report Rust/TypeScript foundation execution.
The [CI workflow](docs/ci.md) schedules
`development-checks` for PRs into and pushes to `dev` and `main`. Inspect its
evaluated commit, PR head/base and run identity before treating a result as
evidence. See [merge policy and verification status](docs/ci.md#merge-policy)
for the exact configuration and the operations exercised so far.
The initial empty-repository bootstrap contains only reviewed setup files and
does not grant ongoing permission for direct pushes or bypasses.

The [protection payload](docs/branch-protection.json) is identical for `dev`
and `main`: PRs, strict up-to-date checks from GitHub Actions (`development-checks`,
`CodeQL (rust)` and `CodeQL (actions)`, app ID `15368`), resolved conversations
and administrator enforcement, with no classic-protection
bypass users, teams or apps, force pushes or branch deletion. Push restrictions
are null; required PRs still gate changes. Linear history is not required, so
promotion and reconciliation can preserve ancestry with merge commits.

The separate [update-only ruleset](docs/pr-only-update-rule.json), active as
[rule 22490835](https://github.com/magalz/maestro/rules/22490835), prevents direct
branch updates. Its sole owner-approved exception allows administrator
`RepositoryRole` `5` to bypass that update rule only through a pull request
(`bypass_mode: pull_request`). It does not bypass the independent classic
protections or required checks. No other bypass is approved.
Only administrators can merge through this rule; bots and writers may propose
PRs but cannot merge them.

Magal is the sole human maintainer. Required third-party approvals are zero;
stale review dismissal is enabled, while code-owner and last-push approvals are
disabled. Explicit human review and acceptance are still required before every
successful merge, including setup PRs; GitHub's zero-approval count cannot
enforce that human decision. AI review does not supply it. Record acceptance in
the PR and merge only the reviewed, currently passing revision. Missing,
pending, failing, skipped or cancelled checks are not success. PR checks receive
no publication or deployment secrets; never enable automatic successful merges.
