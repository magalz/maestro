param([Parameter(Mandatory)][string]$Source,[Parameter(Mandatory)][string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($Source,$Destination,[System.IO.Compression.CompressionLevel]::Fastest,$false)
