# HTTP 查询：自己的服务、自己的令牌

完整原生 v0.5 技能，ID `example-http-query`，工具 `example-http-query__query`。默认禁用，需授权 `net.outbound`；无消息发送权限。调用自己配置的服务，返回 `answer` 文本，由 Agent 继续回复。

## 服务合同

| 配置字段 | 默认值 | 用途 |
| --- | --- | --- |
| `endpoint` | 空 | 完整 HTTPS 查询地址；例 `https://your-service.example/query` |
| `token` | 空 | 可选的自己服务的 Bearer 令牌；`secret: true` |
| `timeoutMs` | `15000` | 1000 到 20000 的整数毫秒，低于宿主工具调用的 30 秒上限 |

工具参数为 `{ "query": "待查询的问题" }`。非空文本最多 1000 字。代码发送：

```http
POST /query
Content-Type: application/json
Authorization: Bearer <用户配置的 token；为空时不发此头>

{"query":"待查询的问题"}
```

服务必须返回 HTTP 成功状态和 JSON，例如 `{ "answer": "查询结果" }`。`answer` 须为非空文本，最长 4000 字；其他字段不交给模型。工具本身直接返回字符串，不会调用 `send_message`、`ctx.send` 或发送 facade。

请求通过 `ctx.http.fetch`，受网络权限、当前插件身份、代码指纹和宿主网络策略控制；本例只接受 HTTPS，不接受 URL 内用户名密码和片段，不跟随重定向。请求把运行时取消信号、插件停止信号及超时合并传入 `fetch`；所有监听器和计时器在 `finally` 回收。响应上限 64 KiB，不自动重试。

失败通过抛出安全的文字错误交给宿主归一。HTTP 401 会说明检查地址、令牌和服务状态；不把上游原始响应正文、请求头或底层异常中的密钥回显。取消不会继续把迟到响应当成成功。`secret: true` 帮助宿主在配置界面脱敏，自身技能依然能读到用户给自己的令牌，所以不要把它打印或写入工具结果。

## 离线自检与打包

```powershell
node scripts/extension-dev.mjs check examples/extensions/http-query
node scripts/extension-dev.mjs test examples/extensions/http-query --case examples/extensions/http-query/extension.check.json
node scripts/extension-dev.mjs pack examples/extensions/http-query --out .qa-local/example-http-query.zip
```

从项目根目录运行。八个用例覆盖请求 JSON/Authorization 与成功输出，以及缺失配置、拒绝权限、401、错误结构、非 JSON、取消和空白输入。`test-token` 为公开合成值，不是真实令牌；所有请求由离线替身处理，没有访问服务或 QQ。

用户实际安装后，先填写自己的地址和令牌，再启用和授权。不要修改清单把真实配置写进源码后上传。复制、安装和社区发布步骤见 [范例总说明](../README.md)。
