$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
Write-Host ''
Write-Host '========================================'
Write-Host '      朝夕 - 上传更新到 GitHub'
Write-Host '========================================'
Write-Host '1. 上传源码和已有 Android 安装包'
Write-Host '2. 只上传网页及服务器源码'
Write-Host '3. 只检查，不提交或上传'
Write-Host '4. 退出'
$selection = Read-Host '请选择 [1-4]'
if ($selection -eq '4') { exit 0 }
$uploadScript = Join-Path $PSScriptRoot 'upload-github.ps1'
try {
    switch ($selection) {
        '1' { & $uploadScript }
        '2' { & $uploadScript -CodeOnly }
        '3' { & $uploadScript -CheckOnly }
        default { throw '请选择 1、2、3 或 4。' }
    }
    if ($selection -eq '3') { Write-Host '检查通过，未执行上传。' -ForegroundColor Green }
    else { Write-Host '上传完成，服务器接下来执行 sudo bash /opt/love-calendar/bin/update.sh' -ForegroundColor Green }
    exit 0
} catch { Write-Host ('操作失败：' + $_.Exception.Message) -ForegroundColor Red; exit 1 }
