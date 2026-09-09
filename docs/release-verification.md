# Development release verification

Run `tools/native-check.ps1` on the authorized native GNU LLVM toolchain, or
`make install && make check` on pinned Linux. Checks include the two independent
Rust/TypeScript consumers, generated binding comparison and notice integrity.
The latest native audit passed 32 test groups, including managed-module cache/
cleanup and controlled-build regressions; the saved command result identifies
the tested inputs. Linux
execution and production route acceptance are separate evidence.

`node tools/release/assemble.mjs --verify-fixture` runs the small staged-admission
fixture suite. It covers every signed role, missing/extra files, hard links,
traversal, conflicting/incomplete acceptance, wrong route/evidence/signer and a
freshly re-signed binding replacement that disagrees with compiled trusted bytes.
Fixture keys are ephemeral and have no production authority.

The broader shared suite also covers raw invalid UTF-8, escaped duplicates,
surrogates and numeric spellings, exact input/depth/string/collection limits,
Unicode canonical key ordering, digest purpose separation, unsupported schema
references, low-order/mixed-torsion/noncanonical A/R and noncanonical S/S+L,
independent enrollment, dual signatures, trust replay/skips/revocation and
transition-set conflicts. Reports reject unknown identities, omitted/duplicated
coverage, bad aggregate/disclosure, changed bindings, concurrent edits and
unverified reuse. A bounded 256 KiB workload exercises the 1 ms timeout disposition;
tiny wire/diagnostic limits fail closed. Accepted fixture bytes cannot be silently
canonicalized to repair admission.

The initial JSON fixture has a flat declared dependency set, not a workflow graph:
workflow dependency-cycle and Markdown-section cases belong to their owning
families. Receipt caching/executor subprocesses are not implemented here; a reuse
wire record or required error does not become authority. Full GUI integration and
installer extraction remain outside this story.

To collect a review candidate, first build and run the focused DSH client probe,
then run
`node tools/release/build-candidate.mjs` from a reviewed clean tree, then
`node tools/release/assemble.mjs BUILD_RECORD EXPECTED_BUILD_RECORD_SHA256`, using
the record path and digest retained from that build. `--review-snapshot` explicitly
permits a dirty development source snapshot and cannot produce clean-source evidence.
The build uses a fresh source/output directory, pinned locked tools, no inherited
compiler injection, rejected ancestor/home Cargo configs and empty npm user/global
configuration. It is a trusted local build, not a hermetic host sandbox. Assembly
compares current source inputs and complete output identities, captures matching
bytes, and rejects stale or substituted outputs instead of copying arbitrary
root `target/debug` or `dist` files. The script requires the checked notice inventories
and verifies their exact lock and text hashes. See [notice evidence](notices.md)
for their collection commands and origins.

The accepted DSH profile is `maestro.release.inventory.dsh/1`: 32,768 total files,
262,144 collection entries, and at most 4,096 files outside the exact reviewed
DSH closure. Byte, depth and string bounds are unchanged. Small artifact families
retain their original 4,096/65,536 bounds. Assembly preserves the complete locked
production layout as ordinary per-file inventory entries. Historical opaque
archives remain review evidence only.

The new `maestro.release.manifest.dsh/1` family is generated from schema set 2;
the original schema-set file is retained unchanged. Signatures still use the
adopted exact `maestro.release.manifest/1` plus NUL framing. The manifest cannot
grant itself the larger admission budget: launcher/gateway require three extra
trusted arguments, `REVIEWED_CLOSURE EXPECTED_CLOSURE_SHA256 EXPECTED_LOCK_SHA256`,
alongside the enrolled root and stage. Obtain those identities independently
from reviewed bootstrap policy, never by copying candidate claims. The closure
digest is checked before parsing. Both consumers require the exact reviewed
lock, path, role, size, hash and classification, with one physical owner per file.
Relabeling or assigning a file to two components does not change its allowance.

Development assembly writes its closure and ephemeral root beside the stage for
review; this self-generated fixture policy does not establish production trust.
`tools/release/measure-admission.ps1 -Candidate PATH` measures native admission
with the dev probe and the selected GNU LLVM DLL path. Its memory metric is the
child process's own OS peak working set before exit, not a periodic sample.
Use `-BuildMode release` after building the optimized probe to distinguish
release and debug timings. `node tools/release/measure-node-admission.mjs PATH`
records dedicated Node admission with process-lifetime peak RSS. Assembly also
records Node peak RSS including assembly; those values are labeled separately.
No private production key, enrollment, acceptance statement, installer, remote
write or public redistribution is produced by these commands.

The staged foundation additionally carries `libunwind.dll`, its exact archive
provenance and shipped notices. `node tools/release/isolated-runtime.mjs CANDIDATE`
runs the actual staged launcher and controller with a system-only Windows PATH
and fresh home/current directory, then uses staged Node for the guarded DSH
activation check. The trusted development harness supplies verification; it is
not a first-channel installer or production enrollment ceremony.

The managed bootstrap loads captured, admitted Cordis/Loader/cosmokit and plugin
bytes through an explicit module map. It does not use package or filesystem
resolution fallback. The immutable host/client graph is checked before activation;
unexpected home inputs, root/profile rewrites, CLI overlays and unreviewed modules
fail closed. Selection rechecks regular-file identity and bytes before activation;
subsequent imports use captured bytes. Client execution evidence is a Node VM
fixture, not rendered GUI certification. No provider, workflow dispatch or package
management service is activated.

Review corrections enforce complete notice-role ownership in both inventory
profiles, bounded regular CLI input and staged descriptor reads, and exact
capability implementation references. Report parse and structural outcomes are
separate. Timeout errors retain actual elapsed duration; observations beyond the
historical 1,000 ms report wire range are rejected as REPORT_DURATION instead of
being clamped. The full 16 MiB input boundary remains independently tested.

The controlled build now freshly compiles the retained host/client source using
pinned TypeScript and freshly installs both production runtimes from captured
repository locks. Assembly uses their captured bytes. Reseal compares retained
runtime bytes with that fresh record, replaces the complete controlled module
set and reconciles DLL/notices in the new stage. Import hooks deterministically
reject overlapping activations process-wide; client registration and factory
execution both use the bounded VM evaluator, with guaranteed cleanup on failure.
The shipped gateway.js is a relative wrapper into its actual compiled layout;
isolated checks invoke that exact CLI for valid, tampered, wrong-trust and
wrong-closure inputs. Failed assembly admission retains evidence and exits nonzero.