# Release and artifact contracts

`contracts/schemas/contract-set-v2.schema.json` is the current authoritative closed schema; the original schema-set file remains immutable.
`npm run generate` emits pinned Typify and json-schema-to-typescript bindings;
`npm run check-generated` compares exact bytes without changing trusted inputs.
Both runtimes compile the same schema locally without remote reference resolution.
The staged registry must contain the exact compiled schema and both generated
bindings. Signed replacement of a schema or binding still fails this independent
build identity check.

Admission rejects duplicate decoded keys, malformed UTF-8/Unicode, BOMs, comments,
unsafe or noncanonical numeric spellings, unknown fields and identities, and
bounded-resource overflow. Immutable records require exact JCS bytes. Generic
structured digests frame schema ASCII, NUL and JCS; raw asset and manifest hashes
hash exact bytes. Signatures frame the purpose, NUL and exact canonical record.
Ed25519 requires canonical prime-order nonidentity A/R, canonical scalar and strict
verification. Independent root enrollment requires explicit authenticated fingerprint
acceptance; a candidate's public key is never an enrollment authority.

`maestro-launcher ENROLLED_ROOT STAGED_DIRECTORY` and the TypeScript gateway
perform release admission. They report verification and do not activate an
uncertified route. The library captures verified file bytes, checks unique safe
relative paths, regular files and single-link native file identity, rejects extra
files, and returns captured bytes rather than reopening pathnames. External
acceptance must uniquely cover the exact entry, release, policy, route and required
case/evidence set. Empty, conflicting and incomplete evidence cannot authorize
capabilities. Migration and prospective adoption remain unimplemented.

`maestro-controller DRAFT PROFILE EXPECTED_BINDING` runs the bounded JSON fixture
checker. The caller must obtain profile and expected binding from independently
verified runtime inputs. Reports bind project, scope, subject, revision, exact
input/dependencies, family/stage, profile, schema, validator, configuration,
executor and environment. Missing/duplicate required checks, wrong aggregate,
stale binding, inconsistent truncation and reuse claims are denied. This story
defines reuse provenance on the wire but does not implement receipt caching.

Run `make install && make check` on pinned Linux, or `tools/native-check.ps1` on
authorized native Windows. The shared test groups execute the actual Rust
probe and TypeScript consumer on hostile JSON, exact canonical bytes, schema and
immutable-record rejection, strict signature vectors, bound reports, every
inventoried file-role mutation, hard links/traversal, and external acceptance
conflicts. These are bounded development tests, not exhaustive cryptographic
conformance, platform certification or full Runtime acceptance. The existing
coverage job still measures only the setup smoke executable.

## Reviewable assembly and remaining work

After the focused DSH client probe and notice collection, build exact native and
TypeScript inputs with `node tools/release/build-candidate.mjs`, then pass its
retained record and SHA256 to `node tools/release/assemble.mjs RECORD SHA256`.
See [release verification](release-verification.md) for prerequisites and the
explicit dirty review-snapshot option. A clean tree alone does not authenticate
old build outputs; the controlled collector builds fresh and assembly rejects
changed source or output inventories.

The flat native development candidate includes the complete pinned DSH closure,
exact GNU LLVM DLL and notices, and captured managed-bootstrap activation. The
accepted scoped inventory limits below resolve the earlier production-file-count
conflict. Historical opaque archives remain review artifacts only. Actual staged
launcher/controller and guarded DSH execution passed in an isolated system-PATH
process; the client check uses Node VM, not a rendered GUI.

First-channel authenticated enrollment and offline signing custody remain human
prerequisites before usable distribution. A reviewed committed source/build seal
is still required; local dirty snapshot evidence does not supply it. Fixture keys,
empty compatibility catalogs and signatures do not grant supported capabilities.
Full GUI, installer extraction and later lifecycle work remain outside this story.
# Versioned DSH inventory admission

Schema set `maestro.contract-set/2` adds the separately selected
`maestro.release.manifest.dsh/1`, `maestro.dsh.closure/1` and
`maestro.release.inventory.dsh/1` families. The original schema file and all
existing family definitions retain their bytes and semantics. Generated bindings
now come from `contracts/schemas/contract-set-v2.schema.json`.

Only the explicit trusted DSH parser profile raises collection entries to 262,144;
release inventory admits at most 32,768 files, including every component, and
at most 4,096 outside its exact independently verified locked DSH closure. Unknown
profiles and selecting this profile for unrelated families fail closed. Larger
allowances are never inferred from record fields. Both validators retain the
16 MiB input, depth 64 and 1 MiB decoded-string bounds.
