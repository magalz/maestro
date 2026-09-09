# Notice evidence checkpoint

Maestro's approved PRD FR-45 and public V1 addendum specify MPL-2.0.
`LICENSE` contains the unmodified [canonical Mozilla text](https://www.mozilla.org/media/MPL/2.0/index.txt),
SHA-256 `3f3d9e0024b1921b067d6f7f88deb4a60cbe7a78e76c64e3f1d7fc3b779b9d04`.
This implements an existing product decision; no new first-party license was chosen.

The initial DSH scan found eight packages without a top-level standalone license
file. That is an inspection finding, not proof that required notices are absent.
Follow-up inspected their READMEs and own source headers, excluding nested
dependencies from package-specific attribution:

| Exact package | Metadata | Additional shipped evidence |
| --- | --- | --- |
| `@aws-sdk/credential-provider-http@3.972.72` | Apache-2.0 | README has no license text; nested Smithy dependency has its own Apache license, which is not package-specific attribution for this AWS package. |
| `@aws-sdk/credential-provider-login@3.972.77` | Apache-2.0 | README/own source scan found no license or copyright notice. |
| `@aws-sdk/nested-clients@3.997.44` | Apache-2.0 | README has no license text; nested Smithy license belongs to that dependency. |
| `@earendil-works/pi-ai@0.84.4` | MIT | README License section states MIT, without the permission/copyright text. |
| `@earendil-works/pi-telemetry@0.84.4` | MIT | README License section states MIT, without the permission/copyright text. |
| `@koromix/koffi-win32-x64@3.2.1` | MIT | README explicitly identifies companion `koffi`; installed `koffi@3.2.1/LICENSE.txt` is included and associated by the assembler. |
| `@xterm/headless@6.0.0` | MIT | `typings/xterm-headless.d.ts` contains `@license MIT`; README lacks full text. |
| `data-uri-to-buffer@4.0.1` | MIT | README contains complete MIT permission/warranty text and Nathan Rajlich's 2014 copyright. The assembler now includes it. |

Registry version metadata associated both Earendil packages with commit
`b79e4cc834970cca69daebffab7df1da7d1e52c4`, and xterm with
`f447274f430fd22513f6adbf9862d19524471c04`. Their complete root LICENSE texts are
now retained under `tools/release/notices/`, with registry integrity, immutable
origin and SHA-256 in `sources.json`. The assembler checks exact package/version/
integrity and notice digest before inclusion. Run `node tools/release/resolve-notices.mjs`
to reproduce this evidence.

The three exact locked AWS packages declare Apache-2.0. The assembler now includes
the [canonical Apache-2.0 text](https://www.apache.org/licenses/LICENSE-2.0.txt)
with origin/digest, preserving all shipped files and attribution in the closure.
This resolves the mechanical license-copy gap without inventing a copyright or
separate NOTICE requirement. Their absent gitHead/source attestation remains a
separate provenance uncertainty; no notice text was inferred from current main.
The source index distinguishes a declared standard-license association from an
immutable upstream commit association. Neither is a public redistribution clearance.
The aggregate includes available license/notice files for the locked DSH closure.
`runtime-inventory.json` records all **88** Rust crates reachable through normal/build
edges from the native launcher/controller; `runtime-inventory-linux.json` records
**87** crates for the Linux target. Both include the **9** gateway npm production
dependencies. Each entry records its locked source-archive checksum/integrity,
dependency rationale or chain, features where applicable, and complete notice
texts with exact origin/member/digest. The four crates without shipped license
files use immutable VCS commits from their checksum-verified source archives.
All inventory entries have retained license texts; none is marked unresolved.

`node tools/release/verify-notices.mjs` verifies both indexes, locks and every
retained notice byte. This is part of native and Linux development checks.
To reproduce collection, run `cargo metadata --locked --format-version 1
--filter-platform TARGET` into a scratch JSON file, then use Python 3.11+:

```sh
python tools/release/inventory-notices.py --metadata .cache/cargo-metadata.json --target x86_64-pc-windows-gnullvm
python tools/release/inventory-notices.py --metadata .cache/cargo-metadata-linux.json --target x86_64-unknown-linux-gnu --output runtime-inventory-linux.json
```

The collection helper inspects upstream source archives without filesystem
extraction. Python is an optional development collection tool, not part of the
managed runtime or normal Node/Rust verification path. Gateway assembly consumes
an isolated `npm ci --omit=dev --ignore-scripts` installation under
`.cache/gateway-production`, excluding the compiler/build-only npm dependencies.
These implementation/review tasks are distinct from the production file-count
architecture checkpoint and from human signing custody. No candidate is cleared
for redistribution by this document.

The native Windows development binaries import `libunwind.dll`. The dependency
collector verifies that exact DLL against the pinned rustc 1.98.1 compiler archive,
retains its origin/member/hash, and copies all 14 copyright/license documents
shipped in that archive. DLL SHA-256 is
`13bf4e99b0193634ebdeb0bbdeff9753b39f1d04799183f664111014aabf4c2c`
(90,624 bytes). `tools/release/notices/native-runtime/inventory.json` is the source
index; normal notice checks verify the retained text. The DLL cache is excluded
from source and is recreated with:

```sh
python tools/release/inventory-native-runtime.py --sysroot PATH_TO_SELECTED_GNULLVM_TOOLCHAIN
```

This helper reads selected archive members without running an installer or
extracting a filesystem tree. `tools/release/pe-imports.mjs` records normal and
delay-load imports using the [Microsoft PE format](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format).
The observed Rust executable and DLL graph contains Windows/UCRT APIs plus this
one redistributed DLL; Windows system components remain OS prerequisites.
The full Rust toolchain copyright material is preserved without choosing a new
license or asserting public redistribution clearance.
