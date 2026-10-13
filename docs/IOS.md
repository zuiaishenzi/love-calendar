# iOS 客户端与安装包发布

客户端源码在 apps/ios，显示版本 1.8.0、内部构建号 10801；使用 WKWebView 加载同一 HTTPS 网站。包含移动导航设置、WebKit 录音权限、文件选择与下载分享、聊天复制和左边缘返回手势。网页功能与 Android / Windows 共用服务器，不启用系统通知。

当前 Windows 工作区没有 Xcode，也没有配置 Apple 签名，尚未编译或进行 iPhone 真机测试，不会生成或上传不可安装的假 IPA。没有开发者账号时可先在 macOS 的 iOS 模拟器验证；个人免费 Apple 账号可用 Xcode 直接安装到自己的设备，不能据此发布通用可下载安装包。

## macOS 构建

安装 Xcode 并打开一次完成组件安装，安装 Node.js、Python 3、XcodeGen（brew install xcodegen）。

```bash
bash apps/ios/build.sh --simulator
```

项目、DerivedData、模拟器 app、归档及 IPA 均输出到仓库同级 ../love-app，不放公开源码仓库。每次构建使用独立目录，避免覆盖历史包。将输出目录内的 OurDays.xcodeproj 在 Xcode 打开即可选择模拟器或使用个人账号进行设备开发测试。

以后有 Apple Developer Program 账号时，注册设备 UDID 并配置签名。使用 Xcode 导出向导生成适合当前 Xcode 版本的 ExportOptions.plist；模板 apps/ios/ExportOptions.example.plist 仅供参考。实际配置放在 ../love-app/ios-signing，证书私钥、描述文件不提交 Git。

```bash
export IOS_TEAM_ID=你的开发团队ID
export IOS_EXPORT_OPTIONS="$(cd .. && pwd)/love-app/ios-signing/ExportOptions.plist"
bash apps/ios/build.sh
```

脚本验证 codesign、包身份和签名材料，然后保存在 ../love-app/OurDays-1.8.0-iOS-build10801.ipa。同名不同内容拒绝覆盖；更新原生客户端时增加 apps/ios/client-build.json 中的 build，显示版本按正式发布节奏同步。生成的 Xcode 工程版本号由构建脚本覆盖为配置中的值。

## 私有仓库与服务器

签名 IPA 拷贝到 Windows 的 E:\codex\love-app 后，双击现有上传 BAT 的选项 1，将自动检测并发布该 IPA；也可使用 -IosPath 指定同级 love-app 内的 IPA。没有 IPA 时自动跳过，保留已有私库 iOS 发布。

安装包仅允许提交私库 zuiaishenzi/love-app；独立 ios.json 清单记录包版本、大小、SHA256，大包自动分片。公开仓库仅包含源码与打包脚本。服务器运行现有 update.sh --retry 即可同步三端安装包，iOS 缺失时不影响 Android 和 Windows。

系统设置 → 客户端下载分别读取 /api/app/update?platform=android、windows、ios，从自有服务器 /api/app/download/... 下载。iOS 未发布时显示“暂未发布”。下载 IPA 本身不等于完成安装，Ad Hoc 仅能安装到描述文件授权设备，证书与描述文件到期需重新签名。

Apple 参考：https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices
