param(
    [string]$DevEcoHome = $env:DEVECO_HOME,
    [string]$ProjectPath,
    [string]$SigningProfilePath,
    [ValidateSet('debug','release')][string]$BuildMode = 'debug',
    [switch]$PrepareOnly,
    [switch]$AllowUnsigned
)
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$artifactRoot = [IO.Path]::GetFullPath((Join-Path $sourceRoot '../love-app'))
$stageRoot = Join-Path $artifactRoot 'harmony-build'
$source = Join-Path $sourceRoot 'apps/harmony'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Assert-StagePath([string]$candidate) {
    $absolute = [IO.Path]::GetFullPath($candidate)
    $prefix = [IO.Path]::GetFullPath($stageRoot) + [IO.Path]::DirectorySeparatorChar
    if (-not $absolute.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'ProjectPath must be inside ../love-app/harmony-build/.' }
    # Prevent junctions from redirecting build writes back into the source repo.
    $cursor = $absolute
    while ($cursor -and $cursor.Length -ge $artifactRoot.Length) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Build paths must not contain junctions or symbolic links.' }
        }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    return $absolute
}

if ($ProjectPath) {
    $project = Assert-StagePath $ProjectPath
    if (-not (Test-Path -LiteralPath (Join-Path $project 'AppScope/app.json5'))) { throw 'Prepared Harmony project not found.' }
} else {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $project = Assert-StagePath (Join-Path $stageRoot ($stamp + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)))
    New-Item -ItemType Directory -Path $project | Out-Null
    # Only copy project sources; caches, signing material and build outputs stay out.
    $files = & git -C $sourceRoot ls-files --cached --others --exclude-standard -- apps/harmony
    if ($LASTEXITCODE -ne 0) { throw 'Unable to enumerate Harmony sources.' }
    foreach ($file in $files) {
        if ($file -notlike 'apps/harmony/*') { throw 'Unexpected source path.' }
        $relative = $file.Substring('apps/harmony/'.Length)
        if ($relative -match '(^|/)(build|oh_modules|\.hvigor|\.idea)/|\.(hap|hsp|app|p12|p7b|cer)$') { continue }
        $target = Join-Path $project $relative
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
        [IO.File]::Copy((Join-Path $sourceRoot $file), $target, $false)
    }
}

$config = Get-Content -LiteralPath (Join-Path $project 'AppScope/app.json5') -Raw -Encoding UTF8 | ConvertFrom-Json
$website = Get-Content -LiteralPath (Join-Path $sourceRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($config.app.bundleName -ne 'xyz.ourdays.harmony' -or $config.app.versionName -ne $website.version) { throw 'Harmony identity/version differs from website.' }
$clientConfig = Get-Content -LiteralPath (Join-Path $project 'entry/src/main/ets/common/ClientConfig.ets') -Raw -Encoding UTF8
if ($clientConfig -notmatch "VERSION_CODE: number = $($config.app.versionCode);" -or $clientConfig -notmatch "VERSION_NAME: string = '$([regex]::Escape($config.app.versionName))';") { throw 'Harmony native version differs from AppScope.' }
if ($SigningProfilePath) {
    # Supply the complete signed build profile from a private local file. Never
    # copy certificates or print signing configuration to the console.
    [IO.File]::Copy((Resolve-Path -LiteralPath $SigningProfilePath).Path, (Join-Path $project 'build-profile.json5'), $true)
}
$profilePath = Join-Path $project 'build-profile.json5'
$profile = Get-Content -LiteralPath $profilePath -Raw -Encoding UTF8 | ConvertFrom-Json
$signatures = @($profile.app.signingConfigs)
$product = @($profile.app.products | Where-Object { $_.name -eq 'default' })
if ($product.Count -ne 1) { throw 'Expected exactly one default product in prepared build profile.' }
# DevEco may generate signing material without linking it to a product. Keep
# private signing values in the prepared project and only fill the missing link.
if (-not $product[0].signingConfig -and $signatures.Count -eq 1) {
    $product[0] | Add-Member -NotePropertyName signingConfig -NotePropertyValue $signatures[0].name -Force
    [IO.File]::WriteAllText($profilePath, ($profile | ConvertTo-Json -Depth 40), $utf8)
}
if (-not $PrepareOnly -and -not $AllowUnsigned -and (-not $product[0].signingConfig -or $product[0].signingConfig -notin @($signatures.name))) {
    throw 'Link the default product to its Signing Configs before building a signed HAP.'
}
Write-Host "Prepared project: $project"
if ($PrepareOnly) { Write-Host 'Open this prepared project in DevEco Studio to configure SDK/signing.'; return }

if (-not $DevEcoHome) {
    $candidates = @('C:\Program Files\Huawei\DevEco Studio','D:\Program Files\Huawei\DevEco Studio')
    $DevEcoHome = $candidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'tools/hvigor/bin/hvigorw.bat') } | Select-Object -First 1
}
if (-not $DevEcoHome) { throw 'DevEco Studio not found. Install it with HarmonyOS SDK, then pass -DevEcoHome.' }
$hvigor = Join-Path $DevEcoHome 'tools/hvigor/bin/hvigorw.bat'
$ohpm = Join-Path $DevEcoHome 'tools/ohpm/bin/ohpm.bat'
if (-not (Test-Path -LiteralPath $hvigor) -or -not (Test-Path -LiteralPath $ohpm)) { throw 'DevEco hvigor/ohpm tools not found.' }
$oldPath = $env:Path
$oldJava = $env:JAVA_HOME
$oldNode = $env:NODE_HOME
$oldSdk = $env:DEVECO_SDK_HOME
try {
    $env:JAVA_HOME = Join-Path $DevEcoHome 'jbr'
    $env:NODE_HOME = Join-Path $DevEcoHome 'tools/node'
    $env:DEVECO_SDK_HOME = Join-Path $DevEcoHome 'sdk'
    $env:Path = "$env:JAVA_HOME\bin;$env:NODE_HOME;$oldPath"
    Push-Location $project
    try {
        & $ohpm install
        if ($LASTEXITCODE -ne 0) { throw 'Harmony dependency installation failed.' }
        & $hvigor --mode module -p module=entry@default -p product=default -p "buildMode=$BuildMode" assembleHap --no-daemon
        if ($LASTEXITCODE -ne 0) { throw 'Harmony compilation failed. Prepared sources and diagnostics remain in love-app.' }
    } finally { Pop-Location }
    $outputs = @(Get-ChildItem -LiteralPath (Join-Path $project 'entry/build/default/outputs/default') -Filter '*-signed.hap' -File)
    $suffix = ''
    if (-not $outputs.Count -and $AllowUnsigned) {
        $outputs = @(Get-ChildItem -LiteralPath (Join-Path $project 'entry/build/default/outputs/default') -Filter '*-unsigned.hap' -File)
        $suffix = '-unsigned'
    }
    if ($outputs.Count -ne 1) { throw 'No unique signed HAP found. Configure device signing in the prepared project; unsigned packages cannot be treated as a device release.' }
    $name = "OurDays-$($config.app.versionName)-Harmony-build$($config.app.versionCode)$suffix.hap"
    $destination = Join-Path $artifactRoot $name
    if (Test-Path -LiteralPath $destination) {
        if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $outputs[0].FullName -Algorithm SHA256).Hash) { throw 'Same name contains different bytes. Keep the old package and increment Harmony versionCode before rebuilding.' }
    } else { [IO.File]::Copy($outputs[0].FullName, $destination, $false) }
    Write-Host "HAP: $destination"
    if ($AllowUnsigned -and $suffix) { Write-Host 'UNSIGNED: compiler check only; device signing is still required.' }
} finally {
    $env:Path = $oldPath
    $env:JAVA_HOME = $oldJava
    $env:NODE_HOME = $oldNode
    $env:DEVECO_SDK_HOME = $oldSdk
}
