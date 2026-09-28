# Linux 部署与 GitHub 自动更新

仓库：`https://github.com/zuiaishenzi/love-calendar.git`，分支：`main`。
适用于使用 systemd 的 Linux；需要 Docker Engine、支持 `up --wait` 的 Docker Compose v2+、Git、tar、flock。安装参考 [Docker 官方文档](https://docs.docker.com/engine/install/) 和 [Compose 官方文档](https://docs.docker.com/compose/install/linux/)。

## 1. 将本次文件提交到 GitHub

服务器自动更新只能看到 GitHub 已提交的文件。本次新增的 `deploy/`、`.gitattributes` 和 Dockerfile 修改需要先提交；`.env.example`、`.dockerignore`、`.gitignore` 也必须纳入版本控制。不要提交 `.env`、数据库、备份或 SMTP 授权码。

## 2. 在服务器下载与安装

```bash
git clone https://github.com/zuiaishenzi/love-calendar.git
cd love-calendar
sudo bash deploy/install.sh
sudo nano /opt/love-calendar/shared/.env
```

配置文件填写：

```env
QQ_SMTP_USER=你的发件邮箱@qq.com
QQ_SMTP_AUTH_CODE=你的SMTP授权码
PORT=3000
APP_ORIGIN=https://你的域名
COOKIE_SECURE=true
```

不要在命令参数或 Git URL 中填写授权码。`APP_ORIGIN` 必须与最终网页地址一致且不带末尾斜杠。

## 3. 首次部署

```bash
sudo bash /opt/love-calendar/bin/update.sh
```

脚本拉取 main 的最新提交，在隔离镜像中运行测试，通过后构建正式镜像，备份数据并启动服务，等待健康检查成功。首次部署失败不会启用定时更新。

应用仅监听服务器本机 `127.0.0.1:3000`。配置 Caddy 或现有 Nginx 反向代理后，通过域名访问。Caddy 示例（替换域名）：

```caddyfile
love.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

DNS 指向服务器，防火墙放行80/443，允许出站连接 GitHub、镜像仓库、npm及QQ邮件465端口。安装和验证反向代理后再开启定时更新。如果暂时没有域名，可以使用 SSH 本地转发测试，APP_ORIGIN 设置为 `http://localhost:3000`，COOKIE_SECURE 设置为 false；不要用该配置直接公开HTTP服务。

```bash
ssh -L 3000:127.0.0.1:3000 用户@服务器
```

## 4. 开启自动检查

```bash
sudo systemctl enable --now love-calendar-update.timer
sudo systemctl list-timers love-calendar-update.timer
```

开机约2分钟后检查一次，此后每次检查完成后约5分钟再检查。仅部署 main 新提交；没有更新时不会重启服务。测试/构建失败不影响在线版本，启动失败会恢复升级前数据库及旧镜像。切换期间会短暂不可用。

失败提交不会每5分钟重复部署。修复后推送新提交可自动重试；网络等临时错误已排除而提交未变时运行：

```bash
sudo bash /opt/love-calendar/bin/update.sh --retry
```

GitHub拉取在构建前失败时，下一次检查会重新拉取。没有公网 webhook，无需开放额外入站端口。

## 5. 查看与停止

```bash
# 更新任务日志（构建失败、回滚等）
sudo journalctl -u love-calendar-update.service -n 100 --no-pager
# 已部署的Git提交
sudo cat /opt/love-calendar/current
# 容器健康状态
sudo docker ps --filter label=com.docker.compose.project=love-calendar
# 停止后续自动更新，不停止网页
sudo systemctl disable --now love-calendar-update.timer
```

定时器不会主动发消息，失败记录在 systemd 日志中。

## 数据、升级与恢复边界

- `.env`：`/opt/love-calendar/shared/.env`，仅root读取。
- 数据库及图片：`/opt/love-calendar/shared/data`，归属容器node用户 UID/GID 1000。
- 升级前备份：`/opt/love-calendar/backups/`，自动保留，不自动删除；需要定期查看磁盘空间并异机备份。
- 构建源码：`/opt/love-calendar/releases/`；正式镜像标签使用Git提交SHA。
- 回滚保留失败数据库为 `shared/failed-data-*`，同时恢复停服后生成的完整备份。
- 如需迁移本机已有回忆，应在首次部署前停止本机服务，将原数据目录的完整内容复制到服务器 `shared/data`，设置归属1000:1000。仓库克隆本身不包含个人数据。
- 生产 Compose 和更新脚本由安装脚本复制到固定目录，避免每次更新隐式修改部署控制逻辑。后续修改这些部署文件时，需要停止timer、等待当前任务结束，重新运行 `deploy/install.sh`，验证后重启timer。
- 自动回滚只针对检测到的启动/健康检查失败，不能检测所有功能错误。断电、磁盘故障或外部服务异常可能需要人工恢复。健康检查成功前已发出的邮件无法撤回。
- 私有仓库可在服务器配置只读SSH部署密钥，再将 `/opt/love-calendar/repository` 改为 `git@github.com:zuiaishenzi/love-calendar.git`。预先验证GitHub主机密钥，不关闭SSH主机验证；不要在URL中嵌入令牌。

本安装器不会安装系统依赖、改防火墙或覆盖已有反向代理配置。若服务器已有同项目容器或3000端口被占用，请先确认迁移方案再执行首次部署。
