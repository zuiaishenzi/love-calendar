# 安装包按需同步与断点续传

新版同步只读取 GitHub 私库当前提交的 latest.json、windows.json，比较服务器已发布构建号。版本不变或服务器版本更高时，仅检查清单，不下载安装包。发生同构建号、不同 SHA256 时拒绝发布。

需要更新时仅获取当前清单指向的 APK，或 Windows EXE/分片；不 fetch 整个安装包 Git 仓库，也不下载目录中的旧包。固定私库提交 SHA，避免下载中途分支更新造成混合版本。

## 第一次切换服务器脚本

先自行把本次源码上传到 GitHub。服务器以前安装的 update.sh 不会自动获得新的同步逻辑，首次需替换这个小脚本。以下命令仅下载公开源码中的 update.sh，检查 Bash 语法后安装，然后执行原更新流程：

```bash
sudo curl --fail --location --retry 3 \
  -H 'Accept: application/vnd.github.raw+json' \
  'https://api.github.com/repos/zuiaishenzi/love-calendar/contents/deploy/update.sh?ref=main' \
  -o /opt/love-calendar/bin/update.sh.new &&
sudo bash -n /opt/love-calendar/bin/update.sh.new &&
sudo install -m 700 /opt/love-calendar/bin/update.sh.new /opt/love-calendar/bin/update.sh &&
sudo bash /opt/love-calendar/bin/update.sh --retry
```

之后仍使用：

```bash
sudo bash /opt/love-calendar/bin/update.sh --retry
```

新版 update.sh 在部署成功后或源码无变化时，原子刷新两个更新脚本；下载器代码从当前网站镜像运行。第一次切换会正常构建新网站镜像，安装包同步则直接采用新流程。

## 凭据与缓存

沿用 /opt/love-calendar/shared/app-repository-token，要求 root 所有、权限 600 或 400，私库 Contents read 权限即可。HTTPS 或 SSH 仓库地址都可识别，但 API 同步需要 token，单独 SSH 私钥不能用于 API 鉴权。token 经 Docker stdin 传入，不进入命令行参数、环境变量或日志；签发的下载地址只保存在内存。

/opt/love-calendar/shared/app-download-cache 保存以 SHA256 命名的 .partial、.complete 文件。任务中断或服务器重启后，下次更新继续读取断点。清单标识改变时使用新的缓存文件，不把不同版本拼在一起。已经校验的 Windows 分片会复用。

优先使用 GitHub Contents API 签发的临时下载地址进行 Range 续传，每次尝试重新获取地址。每个文件最多尝试 3 次；下载域名不可达且尚未收到数据时，最后一次使用 API 原始文件响应作为备用。若下载端忽略 Range，则从头写入而不是拼接；如果 206 响应范围不符合清单则拒绝。慢速传输不会按总时长中止，仅连续 60 秒无数据会中止本次尝试。

下载完成后逐文件校验长度和 SHA256，Windows 合并后再次检查整包 SHA256，再原子更新发布清单。失败保留此前已发布版本及可续传缓存。历史安装包不删除，旧 app-source.git 不再用于同步，也不自动清理。

日志会显示“检查最新清单”“未变化，跳过下载”“继续下载 … 字节”“SHA256 校验通过”。这减少不必要的传输，不会改变线路本身的带宽。

GitHub API 参考：https://docs.github.com/en/rest/repos/contents 与 https://docs.github.com/en/rest/git/refs
