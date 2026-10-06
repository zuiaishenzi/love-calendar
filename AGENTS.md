# 客户端构建产物约定

- Windows 安装包、Android APK/AAB 及客户端构建产物统一放在仓库同级的 `../love-app/`（本机为 `E:\codex\love-app`）。后续继续沿用，不在 `love/` 下保存安装包副本。
- 客户端源码与打包配置保留在本仓库；安装包不提交 Git，不作为服务器部署文件。
- Windows electron-builder 输出目录已经配置为 `../../../love-app`（相对于 `apps/windows`）；Android Gradle 输出目录为同级 `love-app/android-build`。
- 操作仓库外目录时按工具权限要求执行，保留已有安装包；相同名称但不同内容的文件不可直接覆盖。
