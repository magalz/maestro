# Development artifacts

The `development-artifact` job in `.github/workflows/checks.yml` runs only after
`development-checks` and both required CodeQL language scans succeed in the same run. It checks out the same evaluated
`github.sha` (the merge revision for pull requests), installs Rust/Cargo 1.98.1,
and builds `cargo build --release --locked --package maestro-dev-smoke` on
Ubuntu 24.04 x64. It needs no Node/npm installation; the upstream development
checks enforce Node 24.20.0 and npm 11.19.0. Actions use immutable commit pins.

This binary is setup evidence only. In particular, an ephemeral PR build is
not an approved release, product certification, or promotion to main. No
delivery target, deploy job, environment credentials, or release publication
is configured.

## Contents and identity

The artifact name is
`development-smoke-<full-source-sha>-<run-id>-<run-attempt>`. GitHub retains its
archive for seven days. It contains exactly one tar file with the same name
and `.tar` suffix. The tar has this exact member allowlist:

- `maestro-dev-smoke`: the actual release executable, mode 0755.
- `BUILD.txt`: setup-only purpose, repository, event/ref, actual source SHA,
  PR number/head/base SHA and base ref when present, workflow name/ref/SHA,
  run ID/attempt/URL, runner image OS/version and OS/architecture, verbose
  rustc identity and Cargo version.
- `SHA256SUMS`: SHA256 of the executable and `BUILD.txt`.

Packaging uses a fresh runner-temporary directory and explicit file names.
Repository directories, private files, caches, runtime data, and secrets are
not package inputs. `BUILD.txt` uses a fixed metadata allowlist, not an
environment dump. The tar preserves executable mode through GitHub's wrapper.

The successful upload step exposes its artifact ID, authenticated download URL,
and GitHub archive SHA256 in the job summary. This digest identifies the outer
GitHub archive; it differs from the checksums inside the tar, which cover only
the binary and metadata. Neither checksum is a signature or release approval.

## Download and verify

Choose a reviewed workflow run whose development check and artifact job both
passed. Record its full evaluated source SHA, PR head/base SHAs if applicable,
run ID, attempt, artifact ID, and summary digest. For a PR, compare the source
against the evaluated merge revision, not merely the PR head.

Download the artifact using the summary link, or the authenticated GitHub
artifact API. Compare the downloaded outer archive's `sha256sum` with the
summary/API digest before unpacking it. Confirm the outer archive contains only
the expected named tar. Unpack that tar into a new temporary directory only
after inspecting its member names and types:

```bash
set -euo pipefail
# Set this to the downloaded, unpacked tar from the reviewed run.
archive=/absolute/path/development-smoke-SOURCE-RUN-ATTEMPT.tar
test "$(tar -tf "$archive")" = "$(printf '%s\n' maestro-dev-smoke BUILD.txt SHA256SUMS)"
test "$(tar -tvf "$archive" | cut -c 1)" = "$(printf '%s\n' - - -)"
verification_dir=$(mktemp -d)
tar --no-same-owner -xf "$archive" -C "$verification_dir"
cd "$verification_dir"
test "$(wc -l < SHA256SUMS)" -eq 2
test "$(cut -c 67- SHA256SUMS)" = "$(printf '%s\n' maestro-dev-smoke BUILD.txt)"
sha256sum --check SHA256SUMS
test "$(stat -c %a maestro-dev-smoke)" = 755
cat BUILD.txt
```

Match `BUILD.txt` against the recorded source, PR, run/attempt, tools and runner
identity in the job logs. Only execute a binary whose source/run you have
reviewed and trust, on the verified Ubuntu 24.04 x64 baseline (other distributions
are unverified):

```bash
smoke_output=$(./maestro-dev-smoke)
test "$smoke_output" = 'Maestro development smoke probe passed.'
```

Inspect `GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}` using an
existing read-authorized GitHub session. Record `workflow_run.head_sha`,
`workflow_run.id`, `digest`, `created_at`, `expires_at`, and `expired`; compare
the run's evaluated SHA and metadata, and verify expiry is seven days after
creation (service timestamps can differ by one second). For PR runs,
`workflow_run.head_sha` matches `pr_head_sha`; `BUILD.txt`'s `source_sha` matches
the tested merge revision in the job log. The API's outer archive digest and the two internal file checksums
must all be retained with acceptance evidence. No new credential is required
by the workflow; downloading private artifacts requires the reader's own
authorized access.

## Failures, retries, and future delivery

- A failed or cancelled upstream check skips the artifact job; there is no
  `always()` or `continue-on-error` bypass.
- Tool installation/build failures stop before packaging. Missing executable,
  metadata, or checksum/tar errors fail packaging and stop before upload.
- Upload fails on missing output or a duplicate name; overwrite is disabled.
  Only a successful upload can produce the retained-artifact summary. If the
  summary step fails, inspect the upload step/API for a potentially retained
  artifact; a failed job is not a successful delivery.
- Rerun the workflow after addressing the failing stage. Run attempts use
  distinct names and never replace prior packages. For acceptance of a retry,
  rerun all jobs so the check and build evidence includes that attempt.
- Expired/deleted artifacts cannot be recovered from the link. Run checks and
  build again for the intended revision, then verify the new identity and
  digests. A rebuild can differ with a changed hosted runner image; it does not
  restore the original bytes or extend the original retention.
  If the old synthetic merge revision is no longer fetchable, use a newly
  evaluated PR revision and label it with its new SHA; never claim the old
  artifact has been recreated.

Future publication or deployment requires explicit authorization identifying
the particular artifact and target, plus a named owner for isolated,
target-scoped delivery credentials. Configure those only in the separately
authorized delivery work. Retaining this development package grants no such
authorization.
