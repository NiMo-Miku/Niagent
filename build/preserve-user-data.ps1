# Installer-only helper. Windows PowerShell 5.1; no application/plugin dependency.
# Keep this selection shared by Prepare and Remove: unknown paths belong to the user.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('Prepare', 'Restore', 'Remove')][string]$Mode,
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [string]$OldRoot = '',
    [string]$AdditionalOldRoot = '',
    [string]$BackupBase = '',
    [string]$Receipt = ''
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

# Exact shipped names only; wildcard deletion would also remove user components.
$RootFiles = @('QQ Agent.exe', 'Uninstall QQ Agent.exe',
    'chrome_100_percent.pak', 'chrome_200_percent.pak', 'd3dcompiler_47.dll',
    'ffmpeg.dll', 'icudtl.dat', 'libEGL.dll', 'libGLESv2.dll', 'resources.pak',
    'snapshot_blob.bin', 'v8_context_snapshot.bin', 'vk_swiftshader.dll',
    'vk_swiftshader_icd.json', 'vulkan-1.dll', 'LICENSE', 'LICENSE.electron.txt', 'LICENSES.chromium.html',
    'uninstallerIcon.ico')
$RootDirectories = @('locales', 'swiftshader')
$ResourceFiles = @('elevate.exe', 'app-update.yml', 'default_app.asar')
$AppFiles = @('package.json', 'package-lock.json')
$AppDirectories = @('electron', 'src', 'bundled', 'ui', 'assets', 'scripts', 'docs', 'node_modules')

function Get-AbsolutePath([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -match '[\x00-\x1f"<>|?*]' -or
        -not [IO.Path]::IsPathRooted($Value) -or $Value.StartsWith('\\?\') -or $Value.StartsWith('\\.\')) {
        throw 'An ordinary absolute filesystem path is required.'
    }
    $full = [IO.Path]::GetFullPath($Value).TrimEnd('\', '/')
    if ($full.TrimEnd('\') -eq [IO.Path]::GetPathRoot($full).TrimEnd('\')) {
        throw 'A drive or share root is not an installation/backup directory.'
    }
    return $full
}

function Test-Within([string]$Child, [string]$Parent) {
    return $Child.Equals($Parent, [StringComparison]::OrdinalIgnoreCase) -or
        $Child.StartsWith($Parent + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Assert-NoReparse([string]$Path) {
    $current = $Path
    while (-not [string]::IsNullOrEmpty($current)) {
        if (Test-Path -LiteralPath $current) {
            if (([IO.File]::GetAttributes($current) -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Refusing to traverse a filesystem link: $current"
            }
        }
        $parent = [IO.Path]::GetDirectoryName($current)
        if ($parent -eq $current) { break }
        $current = $parent
    }
}

function Get-ChildPath([string]$Root, [string]$Relative) {
    if ([string]::IsNullOrEmpty($Relative) -or [IO.Path]::IsPathRooted($Relative) -or
        $Relative -match '(^|[\\/])\.\.?([\\/]|$)|[\x00-\x1f:<>"|?*]') {
        throw 'Invalid relative path in preservation manifest.'
    }
    $full = Get-AbsolutePath ([IO.Path]::Combine($Root, $Relative))
    if (-not (Test-Within $full $Root) -or $full -eq $Root) { throw 'Path escaped its expected directory.' }
    return $full
}

function Get-Hash([string]$Path) {
    Assert-NoReparse $Path
    $stream = [IO.File]::OpenRead($Path)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose(); $stream.Dispose() }
}

function Get-Policy([string]$Relative, [bool]$IsDirectory) {
    $key = $Relative.Replace('\', '/').ToLowerInvariant()
    if ($IsDirectory) {
        if ($key -eq 'resources' -or $key -eq 'resources/app') { return 'Container' }
        if ($RootDirectories -contains $key) { return 'Program' }
        if ($key.StartsWith('resources/app/') -and $AppDirectories -contains $key.Substring(14)) { return 'Program' }
    } else {
        if ($RootFiles -contains $key) { return 'Program' }
        if ($key.StartsWith('resources/') -and $ResourceFiles -contains $key.Substring(10)) { return 'Program' }
        if ($key.StartsWith('resources/app/') -and $AppFiles -contains $key.Substring(14)) { return 'Program' }
    }
    return 'Retain'
}

function Get-Selection([string]$Root) {
    # Only containers are traversed here. A retained subtree is copied in full;
    # a program subtree is removed in full, without mixing the two policies.
    $selected = New-Object 'System.Collections.Generic.List[object]'
    function Visit-Container([string]$Directory, [string]$Prefix) {
        Assert-NoReparse $Directory
        foreach ($item in @(Get-ChildItem -LiteralPath $Directory -Force)) {
            $relative = if ($Prefix) { $Prefix + '\' + $item.Name } else { $item.Name }
            $policy = Get-Policy $relative $item.PSIsContainer
            if ($policy -eq 'Container') {
                Visit-Container $item.FullName $relative
            } else {
                [void]$selected.Add([pscustomobject]@{ Relative = $relative; Path = $item.FullName; Kind = if ($item.PSIsContainer) { 'Directory' } else { 'File' }; Policy = $policy })
            }
        }
    }
    Assert-NoReparse $Root
    if (Test-Path -LiteralPath $Root) {
        if (-not [IO.Directory]::Exists($Root)) { throw "Installation root is not a directory: $Root" }
        Visit-Container $Root ''
    }
    return $selected.ToArray()
}

function Get-RetainedEntries([string]$Root) {
    $entries = New-Object 'System.Collections.Generic.List[object]'
    function Visit-Retained([string]$Path, [string]$Relative) {
        Assert-NoReparse $Path
        $item = Get-Item -LiteralPath $Path -Force
        $entry = [pscustomobject]@{
            Relative = $Relative; Kind = if ($item.PSIsContainer) { 'Directory' } else { 'File' }
            Source = $Path; Length = 0; Sha256 = ''; Attributes = [int]$item.Attributes
        }
        if (-not $item.PSIsContainer) { $entry.Length = $item.Length; $entry.Sha256 = Get-Hash $Path }
        [void]$entries.Add($entry)
        if ($item.PSIsContainer) {
            foreach ($child in @(Get-ChildItem -LiteralPath $Path -Force)) { Visit-Retained $child.FullName ($Relative + '\' + $child.Name) }
        }
    }
    foreach ($selection in @(Get-Selection $Root)) {
        if ($selection.Policy -eq 'Retain') { Visit-Retained $selection.Path $selection.Relative }
    }
    return $entries.ToArray()
}

function Write-Receipt([string]$Path, [string]$Snapshot) {
    Assert-NoReparse $Path
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Path))
    [IO.File]::WriteAllText($Path, "[Preservation]`r`nBackupPath=$Snapshot`r`n", [Text.Encoding]::Unicode)
}

function Prepare-Data {
    $backup = Get-AbsolutePath $BackupBase
    $receiptFile = Get-AbsolutePath $Receipt
    $roots = New-Object 'System.Collections.Generic.List[string]'
    foreach ($value in @($OldRoot, $AdditionalOldRoot, $InstallRoot)) {
        if ([string]::IsNullOrWhiteSpace($value)) { continue }
        $root = Get-AbsolutePath $value
        Assert-NoReparse $root
        if (-not $roots.Contains($root)) { [void]$roots.Add($root) }
        if ((Test-Within $backup $root) -or (Test-Within $receiptFile $root)) {
            throw 'The recovery copy and receipt must be outside every installation directory.'
        }
    }
    Assert-NoReparse $backup
    Assert-NoReparse $receiptFile
    [void][IO.Directory]::CreateDirectory($backup)
    $snapshot = Join-Path $backup ([Guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($snapshot)
    Write-Receipt $receiptFile $snapshot
    $payload = Join-Path $snapshot 'payload'
    [void][IO.Directory]::CreateDirectory($payload)
    $merged = @{}
    $sourceEntries = New-Object 'System.Collections.Generic.List[object]'
    foreach ($root in $roots) {
        foreach ($entry in @(Get-RetainedEntries $root)) {
            [void]$sourceEntries.Add($entry)
            if ($merged.ContainsKey($entry.Relative)) {
                $other = $merged[$entry.Relative]
                if ($other.Kind -ne $entry.Kind -or ($entry.Kind -eq 'File' -and ($other.Sha256 -ne $entry.Sha256 -or $other.Length -ne $entry.Length))) {
                    throw "Old and new installation data conflict: $($entry.Relative)"
                }
            } else { $merged[$entry.Relative] = $entry }
        }
    }
    $entries = @($merged.Values | Sort-Object { $_.Relative.Length }, Relative)
    foreach ($entry in $entries) {
        $destination = Get-ChildPath $payload $entry.Relative
        if ($entry.Kind -eq 'Directory') {
            [void][IO.Directory]::CreateDirectory($destination)
        } else {
            [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination))
            [IO.File]::Copy($entry.Source, $destination, $false)
            if ((Get-Hash $destination) -ne $entry.Sha256) { throw "Backup verification failed: $($entry.Relative)" }
        }
    }
    # Re-scan after copying: a writer, disappearing file, or newly created file
    # must not be mistaken for a complete snapshot before an old uninstaller runs.
    $before = @{}
    foreach ($entry in $sourceEntries) { $before[$entry.Source] = $entry }
    $afterCount = 0
    foreach ($root in $roots) {
        foreach ($entry in @(Get-RetainedEntries $root)) {
            $afterCount++
            if (-not $before.ContainsKey($entry.Source)) { throw 'User data changed during backup. Close the app and retry.' }
            $original = $before[$entry.Source]
            if ($original.Kind -ne $entry.Kind -or $original.Sha256 -ne $entry.Sha256 -or $original.Length -ne $entry.Length) {
                throw 'User data changed during backup. Close the app and retry.'
            }
        }
    }
    if ($afterCount -ne $sourceEntries.Count) { throw 'User data changed during backup. Close the app and retry.' }
    $manifest = [ordered]@{ Version = 1; InstallRoot = $InstallRoot; SourceRoots = @($roots.ToArray()); Entries = @($entries); PreparedUtc = [DateTime]::UtcNow.ToString('o') }
    $temporary = Join-Path $snapshot 'manifest.pending'
    [IO.File]::WriteAllText($temporary, (ConvertTo-Json -InputObject $manifest -Depth 8), (New-Object Text.UTF8Encoding($false)))
    [IO.File]::Move($temporary, (Join-Path $snapshot 'manifest.json'))
    Write-Output "User data saved to: $snapshot"
}

function Restore-Data {
    $receiptFile = Get-AbsolutePath $Receipt
    Assert-NoReparse $receiptFile
    $matches = @([IO.File]::ReadAllLines($receiptFile) | Where-Object { $_.StartsWith('BackupPath=') })
    if ($matches.Count -ne 1) { throw 'Missing or invalid recovery receipt.' }
    $snapshot = Get-AbsolutePath $matches[0].Substring(11)
    if (Test-Within $snapshot $InstallRoot) { throw 'Recovery copy cannot be inside the installation.' }
    Assert-NoReparse $snapshot
    $manifestFile = Join-Path $snapshot 'manifest.json'
    Assert-NoReparse $manifestFile
    $manifest = [IO.File]::ReadAllText($manifestFile) | ConvertFrom-Json
    if ($manifest.Version -ne 1 -or (Get-AbsolutePath $manifest.InstallRoot) -ne $InstallRoot) { throw 'Recovery manifest belongs to a different installation.' }
    $payload = Join-Path $snapshot 'payload'
    Assert-NoReparse $payload
    if (-not [IO.Directory]::Exists($payload)) { throw 'Recovery payload directory is missing.' }
    $seen = @{}
    $entries = @($manifest.Entries)
    # Check every backup and target before restoring anything. Differing target
    # data is never overwritten, even after an interrupted earlier attempt.
    foreach ($entry in $entries) {
        $source = Get-ChildPath $payload $entry.Relative
        $target = Get-ChildPath $InstallRoot $entry.Relative
        if ($seen.ContainsKey($entry.Relative) -or $entry.Kind -notin @('File', 'Directory')) { throw 'Invalid manifest entry.' }
        $seen[$entry.Relative] = $true
        Assert-NoReparse $source
        Assert-NoReparse $target
        if ($entry.Kind -eq 'Directory') {
            if (-not [IO.Directory]::Exists($source) -or [IO.File]::Exists($target)) { throw "Recovery directory missing or conflicts: $($entry.Relative)" }
        } else {
            if ($entry.Sha256 -notmatch '^[a-f0-9]{64}$' -or -not [IO.File]::Exists($source) -or
                (Get-Item -LiteralPath $source -Force).Length -ne $entry.Length -or (Get-Hash $source) -ne $entry.Sha256) {
                throw "Recovery file failed verification: $($entry.Relative)"
            }
            if ([IO.Directory]::Exists($target) -or ([IO.File]::Exists($target) -and (Get-Hash $target) -ne $entry.Sha256)) {
                throw "Recovery would overwrite different user data: $($entry.Relative)"
            }
        }
    }
    foreach ($entry in $entries) {
        $source = Get-ChildPath $payload $entry.Relative
        $target = Get-ChildPath $InstallRoot $entry.Relative
        Assert-NoReparse $target
        if ($entry.Kind -eq 'Directory') {
            [void][IO.Directory]::CreateDirectory($target)
        } elseif (-not [IO.File]::Exists($target)) {
            [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
            [IO.File]::Copy($source, $target, $false)
        }
        if ($entry.Kind -eq 'File' -and (Get-Hash $target) -ne $entry.Sha256) { throw "Restored data failed verification: $($entry.Relative)" }
    }
    # Retain independent snapshots, including successful ones, for recovery.
    Write-Output "User data verified and restored. Recovery copy: $snapshot"
}

function Remove-Program {
    $program = @(Get-Selection $InstallRoot | Where-Object { $_.Policy -eq 'Program' })
    function Assert-ProgramTree([string]$Path) {
        if (-not (Test-Within $Path $InstallRoot) -or $Path -eq $InstallRoot) { throw 'Removal escaped the installation directory.' }
        Assert-NoReparse $Path
        if ([IO.Directory]::Exists($Path)) {
            foreach ($child in @(Get-ChildItem -LiteralPath $Path -Force)) { Assert-ProgramTree $child.FullName }
        }
    }
    function Remove-ProgramTree([string]$Path) {
        # Validate the resolved absolute target before each individual removal;
        # never use recursive deletion across a junction or unknown directory.
        if (-not (Test-Within $Path $InstallRoot) -or $Path -eq $InstallRoot) { throw 'Removal escaped the installation directory.' }
        Assert-NoReparse $Path
        if ([IO.Directory]::Exists($Path)) {
            foreach ($child in @(Get-ChildItem -LiteralPath $Path -Force)) { Remove-ProgramTree $child.FullName }
            [IO.File]::SetAttributes($Path, [IO.FileAttributes]::Directory)
            [IO.Directory]::Delete($Path, $false)
        } else {
            [IO.File]::SetAttributes($Path, [IO.FileAttributes]::Normal)
            [IO.File]::Delete($Path)
        }
    }
    foreach ($entry in $program) { Assert-ProgramTree $entry.Path }
    foreach ($entry in $program) { Remove-ProgramTree $entry.Path }
    foreach ($relative in @('resources\app', 'resources')) {
        $directory = Get-ChildPath $InstallRoot $relative
        Assert-NoReparse $directory
        if ([IO.Directory]::Exists($directory) -and @(Get-ChildItem -LiteralPath $directory -Force).Count -eq 0) { [IO.Directory]::Delete($directory, $false) }
    }
    if ([IO.Directory]::Exists($InstallRoot) -and @(Get-ChildItem -LiteralPath $InstallRoot -Force).Count -eq 0) { [IO.Directory]::Delete($InstallRoot, $false) }
    Write-Output 'Program files removed; retained directories were not traversed or deleted.'
}

try {
    $InstallRoot = Get-AbsolutePath $InstallRoot
    Assert-NoReparse $InstallRoot
    switch ($Mode) {
        'Prepare' { Prepare-Data }
        'Restore' { Restore-Data }
        'Remove' { Remove-Program }
    }
    exit 0
} catch {
    [Console]::Error.WriteLine('QQ Agent data preservation failed: ' + $_.Exception.Message)
    exit 1
}
