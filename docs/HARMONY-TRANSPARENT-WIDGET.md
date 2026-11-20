# 鸿蒙透明桌面卡片：能力申请

目前本应用没有开通该能力，当前 HAP 继续提供普通卡片；设置中的透明选项会说明原因，不会假装已经透明。安卓透明背景不需要华为审批。

## 开通步骤

1. 登录 [AppGallery Connect](https://developer.huawei.com/consumer/cn/service/josp/agc/index.html)，进入“开发与服务”，选择朝夕所在项目和鸿蒙应用。
2. 打开该应用的“开放能力管理”，找到“背板透明卡片”，点击申请。若账号下没有此入口，按官方文档核对应用类型和账号权限。
3. 填写应用介绍、使用场景和申请用途，按页面要求上传卡片 UI 设计说明材料。可填写：

   > 朝夕是一款双人日历与留言应用。拟提供2×2透明桌面卡片，展示用户设置的倒计时及对方留言，保留可辨识的正文、刷新与已读操作；不隐藏功能，不覆盖其他应用，字体随桌面提供的背景反色信息调整，保证清晰可读。

4. 审批通过后，打开“背板透明卡片”的能力开关并保存。
5. 重新申请包含该能力的调试或发布 Profile，并在 DevEco Studio 中更新对应签名配置。不要只更换证书，也不要沿用未包含该能力的旧 Profile；无需发送私钥或密码。
6. 获批后再启用透明卡片配置及宿主反色回调，重新编译安装并添加卡片，验证壁纸切换和卡片位置变化。当前普通 HAP 未开启 `transparencyEnabled`，避免未获授权时影响已有卡片。

入口、材料和签名要求以[华为透明背板卡片开发说明](https://developer.huawei.com/consumer/cn/doc/harmonyOS-guides/arkts-ui-transparent-backplate-form-development/)为准。审核与账号权限由华为决定。

## 安卓适配边界

透明模式移除图片、底色和柔光遮罩。安卓10及以上向桌面提供深浅两套文字布局，由支持的桌面根据卡片位置选择；安卓8.1/9使用壁纸整体颜色作退化判断。是否在拖动卡片时自动切换，由桌面宿主决定；本应用不读取壁纸原图、不索要全盘文件权限。无法支持的位置变化可使用自选文字颜色。

参考：[Android RemoteViews 浅背景布局](https://developer.android.com/reference/android/widget/RemoteViews#setLightBackgroundLayoutId(int))。
