param([Parameter(Mandatory=$true)][string]$Candidate,[ValidateSet('debug','release')][string]$BuildMode='debug')
$ErrorActionPreference='Stop'
$taskCandidate=(Resolve-Path -LiteralPath $Candidate).Path
$taskResult=Get-Content -LiteralPath (Join-Path $taskCandidate 'assembly-result.json') -Raw | ConvertFrom-Json
$env:PATH="$env:USERPROFILE/.cargo/bin;$env:LOCALAPPDATA/maestro-toolchains/node-v24.20.0-win-x64;$env:PATH"
$env:RUSTUP_TOOLCHAIN='1.98.1-x86_64-pc-windows-gnullvm'
$taskSysroot=(& rustc --print sysroot)
$env:PATH="$taskSysroot/bin;$env:PATH"
$taskRequest=@{op='release_dsh';stage=(Join-Path $taskCandidate 'staged');root=(Get-Content -LiteralPath (Join-Path $taskCandidate 'DEVELOPMENT-ONLY-root.json') -Raw);closure_path=(Join-Path $taskCandidate 'REVIEWED-DSH-CLOSURE.json');digest=$taskResult.closure_sha256;lock=$taskResult.lock_sha256} | ConvertTo-Json -Compress
$taskStart=New-Object System.Diagnostics.ProcessStartInfo
$taskStart.FileName=(Resolve-Path -LiteralPath "target/$BuildMode/contract-probe.exe").Path
$taskStart.UseShellExecute=$false
$taskStart.CreateNoWindow=$true
$taskStart.RedirectStandardInput=$true
$taskStart.RedirectStandardOutput=$true
$taskStart.RedirectStandardError=$true
$taskProcess=New-Object System.Diagnostics.Process
$taskProcess.StartInfo=$taskStart
$taskTimer=[Diagnostics.Stopwatch]::StartNew()
[void]$taskProcess.Start()
$taskProcess.StandardInput.WriteLine($taskRequest)
$taskProcess.StandardInput.Close()
$taskOutput=$taskProcess.StandardOutput.ReadToEnd()
$taskError=$taskProcess.StandardError.ReadToEnd()
$taskProcess.WaitForExit()
$taskTimer.Stop()
$taskMeasurement=@{consumer='native-rust-gnullvm';build_mode=$BuildMode;child_elapsed_ms=$taskTimer.Elapsed.TotalMilliseconds;exit_code=$taskProcess.ExitCode;result=($taskOutput|ConvertFrom-Json);stderr=$taskError;manifest_sha256=$taskResult.manifest}
$taskMeasurement|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $taskCandidate "native-$BuildMode-admission-metrics.json")
$taskMeasurement|ConvertTo-Json -Depth 6
if($taskProcess.ExitCode -ne 0 -or !$taskMeasurement.result.ok){throw 'Native flat admission rejected'}
