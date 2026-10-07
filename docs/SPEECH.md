# 腾讯云语音转文字（V1.7.3）

自己和对方已发送的语音消息均支持电脑右键、手机长按 → 转文字。识别中、识别结果或错误提示直接显示在对应语音消息下方，聊天界面和历史记录同步展示，不弹出编辑框、不填入聊天输入框、不发送新消息。文字仅在当前账号下保存，重新打开聊天或刷新页面仍可查看；撤回语音会删除相关转写结果。支持 2 分钟以内的语音。

## 服务器配置

在腾讯云控制台开通语音识别，并给专用 CAM 凭证授予 `asr:SentenceRecognition`、`asr:CreateRecTask` 与 `asr:DescribeTaskStatus` 权限。将下列项写入服务器 `/opt/love-calendar/shared/.env`，不要写入网页、应用或 Git：

```dotenv
TENCENT_ASR_SECRET_ID=你的SecretId
TENCENT_ASR_SECRET_KEY=你的SecretKey
TENCENT_ASR_REGION=ap-shanghai
TENCENT_ASR_ENGINE=16k_zh
```

使用临时凭证时还需设置 `TENCENT_ASR_TOKEN`，并在凭证过期前更新。识别服务会消耗腾讯云额度，费用以腾讯云账号的配置为准。

源码上传 GitHub 后执行现有 `update.sh` 部署。如果代码已经是最新版本，仅修改 `.env` 不会触发 updater 重新创建容器；需要在服务器执行：

```bash
cd /opt/love-calendar
CALENDAR_IMAGE="love-calendar:$(cat current)" docker compose -p love-calendar -f compose.yaml up -d --force-recreate
```

## 数据与限制

### 鉴权失败排查

凭证必须是腾讯云「云 API 密钥」的 SecretId/SecretKey，不是语音应用的 AppId。两项必须来自同一对有效凭证，CAM 权限需包含 `asr:SentenceRecognition`、`asr:CreateRecTask` 与 `asr:DescribeTaskStatus`。长期密钥请清空 `TENCENT_ASR_TOKEN`；临时凭证必须完整更新 SecretId、SecretKey、Token 三项。

错误提示会区分 `SecretIdNotFound`、`SignatureFailure`、`SignatureExpire`、`TokenFailure`、`UnauthorizedOperation`。分别检查有效密钥、匹配的密钥对、服务器时间、临时 Token 和 CAM 权限。不要提供密钥内容，只需提供错误码即可继续定位。

修改 `/opt/love-calendar/shared/.env` 后使用上面的 `up -d --force-recreate` 命令加载配置，`docker restart` 不会加载新的环境变量。

浏览器将 WebM/Ogg/M4A 等录音解码为 16kHz 单声道 WAV，然后由服务器签名提交音频数据，无需公开聊天附件地址或配置 COS。已有语音只能从当前账本读取；识别结果和任务仅供发起账号查询。识别任务暂存在服务器内存，15 分钟过期；已完成的消息转写按账号保存到加密数据库，重启后仍可查看。相同音频在有效期内复用任务，避免重复创建；每账号最多保留 10 个任务。

识别结果直接附在原语音消息下方，不改写原语音或产生新消息。未配置密钥、额度不足、格式不支持或无人声会显示明确提示。密钥、原始腾讯云错误信息不返回客户端。

## 应用是否需要同步升级

Windows 和 Android 当前加载服务器网页。更新服务器后，重新打开应用即可获取网页新功能；V1.6.1 客户端可以使用 V1.7.0 语音转文字，无需强制重装。本次没有增加原生权限。

修改服务器地址、原生能力、权限、图标或更新应用内部版本号时，需重新打包安装；当前客户端尚无自动下载安装更新。网页显示版本与安装包内部版本可不同。所有安装包继续保存在仓库同级 `love-app`，保留旧版本。

接口依据：[录音文件识别 CreateRecTask](https://cloud.tencent.com/document/product/1093/37823)、[识别结果查询 DescribeTaskStatus](https://cloud.tencent.com/document/product/1093/37822)、[腾讯云 TC3 签名](https://cloud.tencent.cn/document/product/213/30654)。

60 秒以内优先调用 SentenceRecognition 同步返回，超过 60 秒使用异步任务；新接口权限不足或服务未开通会回退到异步流程。使用 QcloudASRFullAccess 已包含新接口权限；自定义策略请增加 asr:SentenceRecognition。网页和服务器更新即可生效，无需重新安装客户端。
