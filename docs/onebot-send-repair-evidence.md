# OneBot 消息段发送修复

日期：2026-10-11。生产改动仅在 `bundled/transport-onebot/provider.js`；`src/transports/onebot/provider.js` 仍是该实现的兼容导出。未改核心发送队列、客户端、UI、routes、设置或已有 QA fixture，也没有打包。

## 契约与原问题

- DSH-ARCH.md:244–251 明确归一化消息含 video、json、reply 等，提供者负责双向段映射；:262 要求 send 返回已确认的 `[{msgId}]`。
- SPEC.md:984–998 的发送契约及 :993/:1701 要求成功后才记账，失败必须允许重试。
- notes/11-external.md:58–59 规定发送 action 接收段数组，并取返回的 data.message_id；:76–79 规定发送侧 CQ 清洗和负数引用 ID；:98–100 规定 HTTP/协议失败应抛错。

修复前，真实 provider/client 发 video 时生成 `message:[]`，本机协议替身即便返回成功，队列也会报告成功并留档。JSON、forward、file 同样被默认分支丢弃；原生 OneBot 段的字段也无法正确读取。新 96 在修改前对这些行为真实失败，修改后 7/7 通过。

## 最终接口语义

`toPlatformSegments(segments)` 支持归一化扁平段及原生 `{type,data}`，保留输入顺序，不修改调用方对象。

| 类型 | 发送字段 |
| --- | --- |
| text | data.text；保留发送侧 CQ 清洗。 |
| at、face | data.qq / data.id；校验 ID 并保留为字符串。 |
| image、record、video | data.file；支持已有 file 或 URL，保留相应 cache/proxy/timeout、summary、magic、thumb 等发送选项。 |
| json | data.data；JSON 字符串保持，对象序列化，损坏 JSON 明确失败。 |
| reply | data.id；接受扁平 id/msgId 或原生 id，负数及大整数文本不会经 Number 丢精度。 |
| forward | data.id，表示已有转发资源；不把它转换为自定义节点。 |
| file | data.file，保留可选 name。 |

video 的支持标记改为 true，file 标记补齐。forward/file 发送是 QQ 协议实现的扩展：OneBot 标准的 forward 段只定义接收，而 NapCat 官方实现提供直接发送 forward/file 的处理。这里转交完整扩展段，协议端拒绝时明确失败，不新增上传或自定义合并转发 action。[OneBot 官方消息段规范](https://github.com/botuniverse/onebot-11/blob/master/message/segment.md)、[NapCat 官方段转换实现](https://github.com/NapNeko/NapCatQQ/blob/main/packages/napcat-onebot/api/msg.ts)。

未知段、缺必需字段、非法目标会话、空内容及只有引用的内容，在请求前整次拒绝；混合消息中有非法段时也拒绝，避免只发出其中一部分。未实现的其它消息段不会静默通过。

`send(chatKey,segments,{replyToMessageId})` 成功形状仍为 `[{msgId}]`。支持 group/private 两段式及 qq 前缀，目标 QQ ID 必须是合法可安全表示的数字。空引用选项不生成 reply。明确失败/异步未确认的协议状态、非零 retcode 或缺少有效非零 signed message_id 均抛错；负数消息 ID 与大整数文本返回值保持原值。

## 验证

`node test/96-onebot-send-segments-test.mjs`：7/7，通过正式 provider、正式 OneBotClient、本机 HTTP、正式 SendQueue 与正式 ChatStore，验证：

- video 真正进入 HTTP 消息数组，并仅在确认后存档。
- 扁平与原生十种消息段、发送选项、JSON 内容与输入不变性。
- 非法/未知/空消息和非法目标在 HTTP 前失败。
- 缺失或非法 message_id 不留档、不占额度、不污染去重；随后同内容可成功重试。
- HTTP 503、协议拒绝及矛盾的成功状态/错误 retcode 都失败。
- 负数及大整数引用 ID、空引用选项。

关联回归：10（31/31）、19（18/18）、49（90/90）、75（全部）、77（13/13），均通过。没有改旧测试断言。96 未自行注册 runner，由主代理整合。

这些是本机受控协议行为回归，没有对真实 QQ/NapCat 账号发送媒体，也没有执行真实有头 UI 验收；不能据此声称所有第三方协议实现的媒体编码/上传行为均已验收。
