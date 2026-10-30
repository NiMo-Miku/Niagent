# 文生图：生成、当前聊天和发送确认

完整原生 v0.5 技能，ID `example-image-generate`，工具 `example-image-generate__draw`。默认禁用，声明并在工具上请求 `net.outbound`、`qq.send`。宿主会在执行工具前检查这两个权限；发送权限未获准时不会先触发图片生成请求。

## 配置和接口合同

| 字段 | 默认值 | 用途 |
| --- | --- | --- |
| `endpoint` | 空 | 完整 HTTPS 图片生成地址，如 `https://your-service.example/v1/images/generations` |
| `apiKey` | 空 | 自己的图片服务密钥，`secret: true` |
| `model` | 空 | 该服务支持的模型 ID |
| `timeoutMs` | `20000` | 1000 到 20000 的整数毫秒；生成及发送共用这个取消期限 |

调用参数为 `{ "prompt": "一只在窗边晒太阳的猫" }`，非空、最多 2000 字。请求通过 `ctx.http.fetch` 发送：

```http
POST /v1/images/generations
Content-Type: application/json
Authorization: Bearer <用户配置的 apiKey>

{"model":"用户配置的模型 ID","prompt":"一只在窗边晒太阳的猫","response_format":"b64_json"}
```

本例明确支持 HTTP 成功状态、JSON `data[0].b64_json`，内容为 PNG base64。读取响应上限 8 MiB，解码后的图片上限 5 MiB；检查 base64 完整编码、长度和 PNG 文件签名，不实现 PNG 全量解码器。仅返回 URL、JPEG/WebP、异步任务或需要更长生成时间的服务不满足这个教学合同，需按真实服务协议调整实现。当前宿主工具管线的执行上限为 30 秒；将技能配置写成 120 秒不会扩大该上限。

## 受控发送及回执

图片生成后，用 `execution.chatKey` 作为唯一目标，调用：

```js
const receipt = await execution.send.sendImage(
  execution.chatKey,
  { dataUrl: 'data:image/png;base64,...' },
  { signal: operation.signal },
);
```

`execution.send` 来自公共 `core.send` facade，每次调用检查 `qq.send`、插件身份和取消状态。工具不访问 OneBot 客户端、不读取其它账号的凭据、不自行猜测当前聊天。运行时聊天键例为 `group:20001`，与控制台 URL 的 `group_20001` 不是同一种格式。

只有宿主回执 `ok: true` 且 `sent` 非空才返回 `sent: true`。确认来自当前发送队列及传输回执，不代表对方客户端已经显示或用户已经阅读。`ok: true, deduped: true, sent: []` 明确返回本次没有新增发送。失败或空成功回执不会假报已发送；发送阶段取消或超时提示先检查聊天记录，不自动重发，以免第一张实际上已经发出。

成功结果是 `{ "sent": true, "messageIds": [...], "text": "...请勿重复发送说明。" }`。它不含 base64 或密钥。清单提示和工具描述均说明图片已经直接发送，Agent 不应另发“图片已发送”等文案。HTTP 错误仅返回状态和可操作说明，不回显原始服务正文或密钥。

## 离线自检与打包

从项目根目录执行：

```powershell
node scripts/extension-dev.mjs check examples/extensions/image-generate
node scripts/extension-dev.mjs test examples/extensions/image-generate --case examples/extensions/image-generate/extension.check.json
node scripts/extension-dev.mjs pack examples/extensions/image-generate --out .qa-local/example-image-generate.zip
```

11 个用例覆盖成功生成及仅一次图片发送、POST model/prompt 和 Authorization 合同、缺失当前聊天、缺失密钥、拒绝发送权限、401、仅 URL 响应、非 PNG、失败回执、去重回执、空回执和取消。发送次数指本地替身接到的调用次数；没有启动 QQ、请求付费图片服务或访问真实社区。

`test-image-key`、`test-image-model` 为公开合成值，1×1 PNG 为离线固定输入。实际安装配置、授权和社区发布步骤见 [范例总说明](../README.md)。保留清单密钥为空，不把自己服务的真实响应、图片或密钥放入发布目录。
