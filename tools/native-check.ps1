param([string]$NodeDirectory = "$env:LOCALAPPDATA/maestro-toolchains/node-v24.20.0-win-x64")
$ErrorActionPreference = 'Stop'
$env:PATH = "$env:USERPROFILE/.cargo/bin;$NodeDirectory;C:/Program Files/Git/bin;$env:PATH"
$env:RUSTUP_TOOLCHAIN = '1.98.1-x86_64-pc-windows-gnullvm'
$taskRustSysroot = (& rustc --print sysroot)
if ($LASTEXITCODE -ne 0) { throw 'Selected GNU LLVM Rust toolchain unavailable' }
# Direct executables need the GNU LLVM runtime DLLs. This affects this process only.
$env:PATH = "$taskRustSysroot/bin;$env:PATH"
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNULLVM_LINKER = "$taskRustSysroot/lib/rustlib/x86_64-pc-windows-gnullvm/bin/rust-lld.exe"
& cargo build --workspace --locked
if ($LASTEXITCODE -ne 0) { throw 'Rust build failed' }
& npm run build
if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed' }
& npm test
if ($LASTEXITCODE -ne 0) { throw 'Shared contract tests failed' }
& npm run check-generated
if ($LASTEXITCODE -ne 0) { throw 'Generated bindings differ' }
& node tools/release/verify-notices.mjs
if ($LASTEXITCODE -ne 0) { throw 'Dependency notice integrity failed' }
& cargo fmt --all -- --check
if ($LASTEXITCODE -ne 0) { throw 'Rust format failed' }
& cargo clippy --workspace --all-targets --locked -- -D warnings
if ($LASTEXITCODE -ne 0) { throw 'Clippy failed' }
