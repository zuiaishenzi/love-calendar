# Android 应用更新

显示版本保持 V1.8.0，首份带更新功能的客户端内部构建号为 10801。后续原生更新只需递增 Android versionCode，并保持应用 ID 和签名一致。首次手动安装此 APK；之后在主界面右上角下拉菜单点击“版本更新”，或启动时收到更新提示。下载时显示进度，校验 SHA-256、安装包标识、内部构建号和签名，通过后打开系统安装界面。首次允许朝夕安装应用；无需卸载旧版，覆盖升级保留数据。用户仍需确认安装。

## 安装包与发布目录

本机安装包：`E:\codex\love-app\OurDays-1.8.0-Android-build10801.apk`。

本机发布目录：`E:\codex\love-app\server-release`，包含最新清单和以构建号、哈希命名的 APK。所有 APK、客户端构建产物和发布目录均在仓库外，不提交 GitHub、不放入 Docker 镜像。GitHub 只保存客户端源码、服务端接口及发布工具。

服务器默认发布目录：`/opt/love-calendar/shared/data/app-updates`，使用现有 data 持久挂载，无需更改 Compose。接口 `GET /api/app/update` 返回最新清单；`GET /api/app/download/<filename>` 提供当前版本下载，均无需账号登录。未发布安装包时返回 `available:false`。APK 为公开下载内容，不要在安装包内包含密钥。发布工具拒绝降低或重复构建号，保留旧安装包并原子替换最新清单。

## 首次上线

1. 将源码提交 GitHub，服务器运行现有 `update.sh` 部署新代码。
2. 用 SCP 或服务器文件管理器将 APK 上传到服务器临时目录，例如 `/tmp/OurDays-10801.apk`。安装包单独上传，不上传 GitHub。
3. 从已部署源码目录运行发布脚本（或单独上传此脚本）：

```bash
sudo bash deploy/publish-app.sh /tmp/OurDays-10801.apk 10801 1.8.0 '新增应用内检查更新；修复录音授权和图片选择'
```

脚本只使用已有 Docker 镜像中的 Node.js，不要求服务器另装 Node.js。必须先部署包含发布工具的新镜像。发布目录位于现有数据目录，会包含在服务器数据备份内。若自定义 APP_UPDATE_DIR，请自行挂载并修改发布目标目录。

4. 验证：

```bash
curl -f https://love.11215739.xyz:11961/api/app/update
```

5. 在手机手动安装构建 10801，后续通过应用内升级。源码更新不自动发布 APK；发布新 APK 才会改变客户端升级提示。

## 后续构建

修改 `apps/android/app/build.gradle` 的 versionCode 为更高数字，显示 versionName 可不变。用本机固定签名构建，安装包命名时加构建号，不覆盖同名旧包。

本地创建发布文件：

```powershell
node scripts/publish-app.mjs E:\codex\love-app\新版.apk E:\codex\love-app\server-release 10802 1.8.0 '更新说明'
```

当前包沿用本机调试签名，已验证与此前本机 APK 相同。保留本机调试密钥，不能用其他机器或 CI 随机生成的调试密钥替代；正式发布签名变更需要另行迁移。当前环境未连接 Android 真机，安装界面和权限跳转仍需真机验收。

## 私有安装包仓库

公开源码仓库为 zuiaishenzi/love-calendar，安装包和 latest.json 放在独立私有仓库 zuiaishenzi/love-app。本地私有仓库使用 E:\codex\love-app\server-release，只追踪发布清单和版本化 APK，不追踪调试密钥、构建缓存或源码。公开仓库 CI 仅验证构建，不上传安装包 Artifact。App 不访问 GitHub、不持有 GitHub 密钥，服务器使用只读 SSH Deploy key 拉取私有仓库，再校验哈希并复制到网站下载目录。

服务器配置一次：

1. 在服务器生成用于私有仓库的只读 SSH 部署密钥，将公钥添加到 love-app → Settings → Deploy keys，不勾选写权限。私钥存 /opt/love-calendar/shared/app-repository-key，权限600。提前验证 github.com 主机密钥。
2. 写入仓库地址：

```bash
printf '%s\n' 'git@github.com:zuiaishenzi/love-app.git' | sudo tee /opt/love-calendar/app-repository
```

3. 安装更新后的 deploy/update.sh 和 deploy/sync-app-updates.sh 到 /opt/love-calendar/bin（按 deploy/README 的 timer 停止及安装步骤）。部署新镜像后运行：

```bash
sudo bash /opt/love-calendar/bin/sync-app-updates.sh
```

之后现有 update.sh 每次检查都会同步私有安装包仓库，即使公开源码没有新提交也会检查 APK。网站部署成功后才同步 APK，安装包同步失败不会回滚网站或覆盖现有 APK。现有 systemd timer 如已启用，将沿用原更新频率；不额外开启新定时任务。
