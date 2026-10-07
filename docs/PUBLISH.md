# 上传与服务器更新

## 本机上传

在 PowerShell 中执行：

```powershell
cd E:\codex\love
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\upload-github.ps1 -Message "修复与更新服务"
```

脚本使用 Git Credential Manager 的现有 GitHub 登录，检查公开源码仓库与私有包仓库的可见性，运行测试，核对 APK 的应用 ID、构建号、版本，再分别提交推送。源码仓库必须为 main，安装包仓库必须干净。不会构建 APK、递增版本或自动合并分支；不保存或打印凭据。提交描述由 Message 指定。

默认 APK 取自 `../love-app/OurDays-<versionName>-Android-build<versionCode>.apk`。本次自动找到构建 10801；APK 与已发布文件一致时只推送待上传的源码，不重复发布安装包。同构建号不同内容时会停止，需提高 versionCode 并重新构建。

仅更新网页或服务器代码：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\upload-github.ps1 -CodeOnly -Message "修复网页功能"
```

发布新的 APK：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\upload-github.ps1 -ApkPath E:\codex\love-app\新版.apk -Notes "修复说明" -Message "更新客户端"
```

只检查不提交：添加 `-CheckOnly`。脚本要求 Git、Node.js/npm，以及校验 APK 所需的 Android SDK Build Tools 35.0.0；本机已存在。其他电脑设置 ANDROID_HOME，并将私有仓库 clone 到 `../love-app/server-release`。

公开仓库为 `https://github.com/zuiaishenzi/love-calendar.git`，私有仓库为 `https://github.com/zuiaishenzi/love-app.git`。源码会先推送，APK 后推送；若中途失败，保留已完成的推送，解决问题后可重新运行。APK、数据库、环境配置、签名密钥等禁止进入公开仓库。

## 服务器首次接入私有安装包

先运行上面的本机上传命令，让新服务器代码和脚本到达 GitHub。服务器只需要配置一次：

```bash
# 暂停已有定时更新
sudo systemctl stop love-calendar-update.timer

# 下载新脚本到临时目录
work=$(mktemp -d)
git clone --depth 1 https://github.com/zuiaishenzi/love-calendar.git "$work/source"

# 锁定升级流程，仅替换脚本，保留你当前的 Compose/端口配置
sudo flock /opt/love-calendar/update.lock install -m 700 \
  "$work/source/deploy/sync-app-updates.sh" /opt/love-calendar/bin/sync-app-updates.sh
sudo flock /opt/love-calendar/update.lock install -m 700 \
  "$work/source/deploy/update.sh" /opt/love-calendar/bin/update.sh

# 创建只读仓库部署密钥；已存在则保留
sudo test -f /opt/love-calendar/shared/app-repository-key || \
  sudo ssh-keygen -t ed25519 -N '' \
  -f /opt/love-calendar/shared/app-repository-key -C love-app-readonly
sudo chmod 600 /opt/love-calendar/shared/app-repository-key
sudo cat /opt/love-calendar/shared/app-repository-key.pub
```

复制最后显示的 **公钥**，到私有 love-app 仓库 → Settings → Deploy keys → Add deploy key，粘贴并保存，**不勾选 Allow write access**。

继续在服务器运行：

```bash
# 首次连接核对 GitHub 主机指纹并保存主机记录
sudo ssh -i /opt/love-calendar/shared/app-repository-key \
  -o IdentitiesOnly=yes -T git@github.com

printf '%s\n' 'git@github.com:zuiaishenzi/love-app.git' | \
  sudo tee /opt/love-calendar/app-repository

# 部署代码，并同步私有仓库安装包
sudo bash /opt/love-calendar/bin/update.sh

# 查看网站是否已发布安装包
curl -f https://love.11215739.xyz:11961/api/app/update

# 如果此前使用定时更新，恢复运行
sudo systemctl start love-calendar-update.timer
```

SSH 成功会显示已认证但 GitHub 不提供 shell，退出码 1 是正常行为。主机指纹请对照 [GitHub 官方文档](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints)，不禁用主机验证。服务器需要能连接 GitHub SSH；若 22 端口受限，需按 GitHub 文档配置 ssh.github.com:443。

接口应显示 `available:true`、`versionCode:10801`。用户先手动安装带更新功能的 APK 一次，以后通过 App 右上角下拉菜单 → 版本更新进行覆盖升级。

## 后续更新

本机运行上传脚本后，服务器只需：

```bash
sudo bash /opt/love-calendar/bin/update.sh
```

它先更新公开源码，再同步私有 APK；没有源码更新时仍会检查 APK。只同步安装包可执行：

```bash
sudo bash /opt/love-calendar/bin/sync-app-updates.sh
```

源码测试失败不会切换网站；APK 拉取或校验失败保留上一安装包并记录错误，不回滚已成功更新的网站。安装包保存在服务器现有数据挂载下，不需要更改 Compose。显示版本按正式发布节奏更新，原生新包只需递增 versionCode。
