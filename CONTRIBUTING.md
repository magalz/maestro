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

This is the setup-only repository. Toolchain setup, executable checks, CI and
branch protections are forthcoming; none is currently claimed as verified.
The initial empty-repository bootstrap contains only reviewed setup files and
does not grant ongoing permission for direct pushes or bypasses.

The intended policy for both `dev` and `main` requires pull requests, current
successful required checks against an up-to-date base, resolved conversations
and explicit human review and merge. No routine bypass actors, force pushes or
branch deletion are intended. Required check names and actual enforcement will
be documented after execution. Missing, skipped or cancelled checks are not
successful checks. With one human maintainer, the initial policy requires no
third-party approval review; AI review does not count as independent human
approval. PR checks receive no publication or deployment secrets.
