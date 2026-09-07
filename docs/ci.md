# Development checks in CI

[The workflow](../.github/workflows/checks.yml) runs `development-checks`, a Rust/Actions CodeQL matrix, and a dependent
[artifact job](artifacts.md) for PRs targeting main/dev, pushes to either branch,
and a weekly schedule. Artifacts wait for all three required check results. It has no path filters or conditional job skips and has a
30-minute timeout.

It installs Node 24.20.0 from `.node-version`, including npm 11.19.0,
then Rust 1.98.1 with rustfmt, Clippy and the
`x86_64-unknown-linux-gnu` target through rustup. The existing `make check-tools` guard
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

Retargeting a PR schedules another check. If its base advances, update your
feature branch from that base and push to test the new merge. Resolve merge
conflicts before expecting a `pull_request` run. Fork contributions may await
maintainer approval to run; approval to execute CI is not merge approval.
Keep this job name unique across workflows.

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

Remote CI failure and recovery were observed on 2026-09-07:

| Result | PR head | Run |
| --- | --- | --- |
| Failure: deliberately malformed Rust formatting | `806e65f6cd1b9b0cf8d9e54704a5f7afde378baf` | [34161179569](https://github.com/magalz/maestro/actions/runs/34161179569) |
| Success: corrected revision | `79a99f060d28f2788522de7d7ccb3080892e9a1e` | [34161225626](https://github.com/magalz/maestro/actions/runs/34161225626) |

The successful run tested merge `ade4c819e60a98996b557ec118936558a2d0be8a`
against base `fc467c1b6b4d6fae9362bc597627e09bd3a365f7`, using runner image
`20260831.293.1`. The reporting app was GitHub Actions, ID `15368`.
These results establish CI behavior for those revisions; they do not prove
protection enforcement or admit a newer revision.

## Merge policy

[branch-protection.json](branch-protection.json) records the exact API payload
for both `main` and `dev`. It requires PRs, strict up-to-date status checks for
`development-checks`, `CodeQL (rust)` and `CodeQL (actions)` from GitHub
Actions app `15368`, resolved conversations,
and administrator enforcement. This classic protection layer permits no bypass users, teams or apps,
force pushes or branch deletion. Push restrictions are null. Linear history is
disabled as a requirement to preserve merge commits for `dev` → `main` and
reconciliation PRs.

The separate [update-only ruleset payload](pr-only-update-rule.json) is active
as [rule 22490835](https://github.com/magalz/maestro/rules/22490835) on both
branches. Its sole owner-approved exception is administrator `RepositoryRole`
`5` with `bypass_mode: pull_request`: administrators can update through PRs,
but cannot directly push an eligible PR head. This exception applies only to
the update-only ruleset; the independent classic protections and required
checks still apply to administrator PR merges.
Only administrators can merge through this update rule; bots and writers may
propose PRs but cannot merge them.

Magal is the sole human maintainer: required approving reviews are zero,
stale reviews are dismissed, and code-owner and last-push approvals are false.
Zero approvals cannot mechanically enforce explicit human acceptance. The
maintainer must review and explicitly accept every successful merge; AI review,
CI success and approval to run CI do not supply that acceptance. A promotion
needs its own accepted PR. Never use an automatic successful merge as a probe.
See [the contribution policy](../CONTRIBUTING.md#checks-and-merge-policy).

### Verify configuration and revision

An authenticated maintainer can read both policy layers without changing them:

```sh
gh api repos/magalz/maestro/branches/main/protection
gh api repos/magalz/maestro/branches/dev/protection
gh api repos/magalz/maestro/rulesets
gh api repos/magalz/maestro/rulesets/22490835
gh api repos/magalz/maestro --jq '{visibility, permissions, allow_merge_commit}'
gh pr view PR_NUMBER --repo magalz/maestro \
  --json headRefOid,mergeable,mergeStateStatus,statusCheckRollup
gh api repos/magalz/maestro/pulls/PR_NUMBER --jq '{head: .head.sha, base: .base.sha}'
gh pr checks PR_NUMBER --repo magalz/maestro --required
gh api repos/magalz/maestro/commits/PR_HEAD_SHA/check-runs \
  --jq '.check_runs[] | {name, status, conclusion, head_sha, app: {id: .app.id, slug: .app.slug}, html_url}'
```

Substitute the PR number and full head SHA; obtain the tested merge SHA from the workflow log.
Compare every policy field to the payload: the API wraps booleans such as
`enforce_admins` and `allow_force_pushes` in `enabled`, and can add URLs and a
derived `contexts` list. Confirm the app ID and absent or empty bypass lists in
classic protection. For the ruleset, compare active enforcement, exact main/dev
scope, the sole update rule and its PR-only administrator exception to the
separate payload. Check current head/base identities, not just the check name.
Only a completed successful job
for the current evaluated revision qualifies. Old success cannot qualify new
commits or changed base source. GitHub may retain results when only ancestry
changes and the source tree stays identical, as observed below.
CLI check summaries alone do not establish
the reporting app or tested merge identity.

### Enforcement evidence and account limits

| Acceptance item | Observed status |
| --- | --- |
| Exact protection payload for both branches | Classic protections and active update-only rule 22490835 applied and read back on 2026-09-07 |
| Missing/pending and failing check merge rejection | PR #2 merge API returned HTTP405 before new checks completed; then explicitly rejected failing development-checks on 66d62b7c4eef517aaec9e37af53c6c85e0915e34 |
| Old success cannot admit a new revision or changed-source stale base | Previous success on a786fe3679b6c7129eb4aacbecf1f38257eee41c did not admit new failing 66d62b7c4eef517aaec9e37af53c6c85e0915e34; PR #8 administrator merge rejected HTTP405 after a base source change, with its ref unchanged |
| Direct push, API update, force push and deletion rejection; unchanged refs | Identical disposable policy fixture rejected all four after the approved update-only rule was added |
| Required checks survive the PR-only administrator exception | PR #7 merge rejected HTTP405 with missing checks |
| Eligible PR merged after explicit human acceptance; resulting commit verified | Accepted fixture PR #6 proves the final policy admits an administrator PR merge; accepted PRs #2, #4 and #5 predate the update rule |

The positive [PR #6 fixture](https://github.com/magalz/maestro/pull/6) merged
identical source trees through the administrator PR operation as
`5bc5eb0a8211c63c820b32352f60f6493e5a965d`, with parents
`2eac75dff59fc355a218bd667b765ef94f07abb2` and
`16d3da5749de9d0a0384e7846d21d95b80b87095`. These fixture operations did not
change `main` or `dev`.

The disposable fixture copied the exact classic protection and update rule,
targeting `feature/epic0-policy-verification`; production scope remained
`main`/`dev`. From base `2eac75dff59fc355a218bd667b765ef94f07abb2`, direct Git
and API updates targeted the already-successful accepted head
`16d3da5749de9d0a0384e7846d21d95b80b87095`. GitHub rejected them with GH013
and HTTP422, respectively, leaving the ref unchanged.

For [PR #8](https://github.com/magalz/maestro/pull/8), base
`81c61b568f22fcca788e7da828ca0ac6331754ef` added a harmless fixture file while
the previously passing head `16d3da5749de9d0a0384e7846d21d95b80b87095` stayed
unchanged. GitHub reported the PR behind and rejected administrator merge with
HTTP405: “3 of 3 required status checks are expected”; the ref did not change.
An earlier empty-commit base advance with the same source tree was admitted,
so this proves changed-source stale-base rejection, not that ancestry-only
changes always invalidate results.

This personal repository rejects `bypass_pull_request_allowances` with explicit
empty user/team lists: GitHub returned HTTP 422, “Only organization repositories
can have users and team restrictions.” The payload therefore omits that object;
readback must confirm no classic-protection bypass allowances and administrator
enforcement. The separately approved ruleset exception uses a repository role.
Record API errors or unavailable controls as limitations; do not change
visibility or add further exceptions to work around them.
Administrator enforcement covers protected
operations, but administrators able to edit repository policy can still change
that policy. The zero-approval arrangement also cannot prove independent human
review; propose one independent approval when another human reviewer is available.

The dev direct-push probe advanced it from
`fc467c1b6b4d6fae9362bc597627e09bd3a365f7` to the already-tested
`79a99f060d28f2788522de7d7ccb3080892e9a1e`. GitHub marked
[PR #1](https://github.com/magalz/maestro/pull/1) merged because that push matched
its eligible contents. This was an unexpected enforcement result, not explicit
human merge acceptance. No history was rewritten and main was unchanged.
The owner-approved update-only rule now remedies this gap, as exercised on the
identical disposable fixture. Changed-source stale-base rejection is also
verified as described above.

Before rejection probes, read back both policy layers and record original remote
refs. Use an actor with no bypass for the operation under test; stop immediately
if a forbidden mutation succeeds.
Preserve API/Git rejection responses, unchanged refs and full revision/run
identities in ignored local evidence. A missing, pending or skipped check is
never recorded as success. Every future successful merge still requires human
acceptance of the complete reviewable PR and verification of the resulting
merge commit. Merging does not authorize deployment,
publication or a refresh of the linked `main` reference.
