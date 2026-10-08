[CmdletBinding()]
param(
    [string]$Message = 'Update website and app release',
    [string]$ApkPath,
    [string]$WindowsPath,
    [string]$Notes = '客户端修复与体验优化',
    [switch]$CodeOnly,
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$packageRoot = [IO.Path]::GetFullPath((Join-Path $sourceRoot '../love-app/server-release'))
function Invoke-RepoGit([string]$Root, [string[]]$Arguments) {
    $result = & git -C $Root @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Git 操作失败：$($Arguments[0])" }
    return $result
}
function Get-RepositoryInfo([string]$Name, $Headers) {
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try { return Invoke-RestMethod ("https://api.github.com/repos/" + $Name) -Headers $Headers -TimeoutSec 15 }
        catch {
            $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
            if ($status -eq 401) { throw 'GitHub 登录已失效，请重新登录 Git Credential Manager 后重试。' }
            if ($status -eq 403) { throw "GitHub 拒绝访问 $Name（HTTP 403），请检查账号权限或 API 限流。" }
            if ($status -eq 404) { throw "无法访问 $Name（HTTP 404），请确认当前登录账号有此仓库权限。" }
            if ($attempt -eq 3) { throw "连接 GitHub API 失败：$Name（HTTP $status）。请检查网络或代理；未推送。" }
            Write-Host "GitHub 网络连接失败，正在重试（$attempt/3）…"
        }
    }
}
function VerifyRepositories {
    $previousPrompt = $env:GIT_TERMINAL_PROMPT
    $previousInteractive = $env:GCM_INTERACTIVE
    $previousTls = [Net.ServicePointManager]::SecurityProtocol
    try {
        [Net.ServicePointManager]::SecurityProtocol = $previousTls -bor [Net.SecurityProtocolType]::Tls12
        $env:GIT_TERMINAL_PROMPT = '0'; $env:GCM_INTERACTIVE = 'Auto'
        # Node supplies exact UTF-8 protocol bytes consistently across Windows PowerShell versions.
        $lines = & node (Join-Path $PSScriptRoot 'github-credential.mjs')
        $credentialExit = $LASTEXITCODE
        if ($credentialExit -ne 0) { throw 'GitHub 未登录。请运行 git credential-manager github login，然后重试。' }
        $passwordLine = $lines | Where-Object { $_.StartsWith('password=') } | Select-Object -First 1
        if (-not $passwordLine) { throw 'GitHub 凭据不可用。请运行 git credential-manager github login，然后重试。' }
        $headers = @{ Authorization = 'Bearer ' + $passwordLine.Substring(9); Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28' }
        $public = Get-RepositoryInfo 'zuiaishenzi/love-calendar' $headers
        $private = Get-RepositoryInfo 'zuiaishenzi/love-app' $headers
        if ($public.private -or -not $private.private) { throw '仓库可见性不符合公开源码、私有安装包的约定；未推送。' }
        Write-Host '仓库校验通过：love-calendar 公开，love-app 私有。'
    }
    finally { $headers = $null; $passwordLine = $null; $lines = $null; $env:GIT_TERMINAL_PROMPT = $previousPrompt; $env:GCM_INTERACTIVE = $previousInteractive; [Net.ServicePointManager]::SecurityProtocol = $previousTls }
}
function CommitAndPush([string]$Root, [string]$CommitMessage) {
    & git -C $Root diff --cached --quiet
    if ($LASTEXITCODE -eq 1) { Invoke-RepoGit $Root @('commit', '-m', $CommitMessage) | Out-Host }
    elseif ($LASTEXITCODE -ne 0) { throw '无法检查暂存区。' }
    Invoke-RepoGit $Root @('push', 'origin', 'main') | Out-Host
}
if ($CodeOnly -and ($ApkPath -or $WindowsPath)) { throw 'CodeOnly 与 ApkPath 不可同时使用。' }
if ((Invoke-RepoGit $sourceRoot @('remote', 'get-url', 'origin')) -ne 'https://github.com/zuiaishenzi/love-calendar.git') { throw '源码 origin 地址不符合约定。' }
if ((Invoke-RepoGit $sourceRoot @('branch', '--show-current')) -ne 'main') { throw '请先切换到源码仓库的 main 分支；脚本不会自动切换或合并。' }
if (-not $CodeOnly) {
    if (-not (Test-Path (Join-Path $packageRoot '.git'))) { throw '缺少 ../love-app/server-release 私有仓库，请先 clone 私有仓库到该目录。' }
    if ((Invoke-RepoGit $packageRoot @('remote', 'get-url', 'origin')) -ne 'https://github.com/zuiaishenzi/love-app.git') { throw '安装包 origin 地址不符合私有仓库约定。' }
    if ((Invoke-RepoGit $packageRoot @('branch', '--show-current')) -ne 'main') { throw '安装包仓库必须使用 main 分支。' }
    if (Invoke-RepoGit $packageRoot @('status', '--porcelain')) { throw '私有安装包仓库存在未提交修改，请先处理后再运行。' }
}
VerifyRepositories
Push-Location $sourceRoot
try { & npm.cmd test; if ($LASTEXITCODE -ne 0) { throw '测试失败，未推送。' } } finally { Pop-Location }
$gradle = Get-Content (Join-Path $sourceRoot 'apps/android/app/build.gradle') -Raw -Encoding UTF8
$build = [long][regex]::Match($gradle, 'versionCode\s+(\d+)').Groups[1].Value
$version = [regex]::Match($gradle, "versionName\s+'([^']+)'").Groups[1].Value
if (-not $CodeOnly) {
    if (-not $ApkPath) { $ApkPath = Join-Path $sourceRoot "../love-app/OurDays-$version-Android-build$build.apk" }
    $ApkPath = (Resolve-Path -LiteralPath $ApkPath).Path
    $allowedRoot = [IO.Path]::GetFullPath((Join-Path $sourceRoot '../love-app')) + [IO.Path]::DirectorySeparatorChar
    if (-not $ApkPath.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw '安装包必须位于仓库同级 love-app 目录。' }
    $aapt = Join-Path $sourceRoot 'local-preview-data/android-tools/sdk/build-tools/35.0.0/aapt.exe'
    if ($env:ANDROID_HOME) { $aapt = Join-Path $env:ANDROID_HOME 'build-tools/35.0.0/aapt.exe' }
    if (-not (Test-Path $aapt)) { throw '需要 Android SDK Build Tools 35.0.0 校验 APK，请设置 ANDROID_HOME。' }
    $badging = & $aapt dump badging $ApkPath
    if ($LASTEXITCODE -ne 0 -or -not ($badging -match "package: name='xyz.ourdays.mobile' versionCode='$build' versionName='$([regex]::Escape($version))'")) { throw 'APK 应用 ID、构建号或显示版本与源码不一致，请先重新构建。' }
}
$windowsBuild = (Get-Content (Join-Path $sourceRoot 'apps/windows/client-build.json') -Raw -Encoding UTF8 | ConvertFrom-Json).build
if (-not $CodeOnly) {
    if (-not $WindowsPath) { $WindowsPath = Join-Path $sourceRoot "../love-app/OurDays-$version-Windows-build$windowsBuild-x64.exe" }
    $WindowsPath = (Resolve-Path -LiteralPath $WindowsPath).Path
    if (-not $WindowsPath.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Windows 安装包必须位于同级 love-app 目录。' }
    $windowsVersion = (Get-Item -LiteralPath $WindowsPath).VersionInfo.FileVersion
    if ($windowsVersion -ne "$version.$windowsBuild") { throw "Windows 安装包构建版本不符，预期 $version.$windowsBuild，实际 $windowsVersion，请重新构建。" }
}
if ($CheckOnly) { Write-Host '检查通过：源码目标公开、安装包目标私有；未提交、未推送。'; return }
if (-not $CodeOnly) {
    Invoke-RepoGit $packageRoot @('pull', '--ff-only', 'origin', 'main') | Out-Host
    $manifest = Join-Path $packageRoot 'latest.json'
    $latest = if (Test-Path $manifest) { Get-Content $manifest -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
    if ($latest -and $latest.versionCode -eq $build) {
        if ($latest.sha256 -ne (Get-FileHash -LiteralPath $ApkPath -Algorithm SHA256).Hash.ToLowerInvariant()) { throw '相同构建号对应不同安装包，请增加 versionCode。' }
        Write-Host '安装包已发布，本次不重复生成清单。'
    } else {
        & node (Join-Path $PSScriptRoot 'publish-app.mjs') $ApkPath $packageRoot $build $version $Notes
        if ($LASTEXITCODE -ne 0) { throw '安装包清单生成失败，未推送。' }
    }
}
if (-not $CodeOnly) {
    $windowsManifest = Join-Path $packageRoot 'windows.json'
    $windowsLatest = if (Test-Path $windowsManifest) { Get-Content $windowsManifest -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
    if ($windowsLatest -and $windowsLatest.versionCode -eq $windowsBuild) {
        if ($windowsLatest.sha256 -ne (Get-FileHash -LiteralPath $WindowsPath -Algorithm SHA256).Hash.ToLowerInvariant()) { throw '同一 Windows 构建号的安装包内容不同，请递增 client-build.json。' }
    } else {
        & node (Join-Path $PSScriptRoot 'publish-app.mjs') $WindowsPath $packageRoot $windowsBuild $version $Notes windows private
        if ($LASTEXITCODE -ne 0) { throw 'Windows 发布清单生成失败，未推送。' }
    }
}
if (-not $CodeOnly) {
    Invoke-RepoGit $packageRoot @('add', '-A') | Out-Null
    $privateFiles = @(Invoke-RepoGit $packageRoot @('ls-files'))
    if ($privateFiles | Where-Object { $_ -notmatch '^(latest\.json|windows\.json|README\.md|\.gitignore|OurDays-[A-Za-z0-9._-]+\.(apk|exe)(\.part\d{3})?)$' }) { throw '私有包仓库含非发布文件，停止推送。未执行推送。' }
}
Invoke-RepoGit $sourceRoot @('add', '-A') | Out-Null
$tracked = @(Invoke-RepoGit $sourceRoot @('ls-files'))
$unsafe = $tracked | Where-Object { $_ -match '(?i)(\.(apk|aab|exe|jks|keystore|sqlite|sqlite-wal|sqlite-shm|pem|key)$|(^|/)\.env($|\.)|(^|/)(data|local-preview-data|node_modules)/|(^|/)\.database-key$)' -and $_ -ne '.env.example' }
if ($unsafe) { throw ('公开仓库检测到禁止上传的文件，未提交或推送：' + ($unsafe -join ', ')) }
CommitAndPush $sourceRoot $Message
if (-not $CodeOnly) {
    CommitAndPush $packageRoot "Publish Android $build and Windows $windowsBuild"
}
Write-Host '上传完成：源码在公开 love-calendar，安装包在私有 love-app。服务器执行 update.sh 获取更新。'
