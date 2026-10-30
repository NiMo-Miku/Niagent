# 本地运行链补充验收证据

日期：2026-10-11。本文件记录 **headless 本地补充验证**，不表示 Electron 有头点击通过，也不替代 [186 项有头清单](headed-qa-checklist.md) 中真实 QQ、外部模型、搜索、社区及长期周期的验收。

运行的是实际 `createKernel`、loader、默认 bundled providers、SDK、registry、OneBot WebSocket/HTTP、发送队列、会话与每日用量仓。对端是明确标注的合成本地 OneBot、LLM、媒体、搜索网页服务器。模型 token 是夹具返回的合成数值；没有真实模型账单、真实 QQ 账号或真实社区发布。

独立目录为 `.qa-local/runtime-94-<pid>-<time>/`，测试结束释放内核锁、关闭服务与 timers，并只删除该独立目录。没有操作根代理正在验收的 `.qa-local/headed-20261011/data`、Electron 窗口、系统自启或安装包。

## 复跑与原始证据

```powershell
node test/94-headed-qa-runtime-evidence-test.mjs
node test/98-message-contract-repair-test.mjs
```

- [94 实际行为夹具](../test/94-headed-qa-runtime-evidence-test.mjs)：逐工具调用与运行/API/安全边界；输出 `.qa-local/runtime-evidence-94.json`，包含每项 detail、工具 owner/参数/响应、OneBot actions、模型请求角色与状态、真实 HTTP 请求、清理结果。该文件会被下一次复跑覆盖。
- [修复前记录](../.qa-local/runtime-evidence-94-before-repair.json)：2026-10-11T12:34:08Z 一轮，39 个证据项中 35 项本地通过、4 项部分通过；Node 显示 40/40 只代表采集与断言完成，不能把 4 项偏差改称功能通过。
- [98 契约与网页安全回归](../test/98-message-contract-repair-test.mjs)：真实默认 OneBot 和实际加载的工具；8/8 通过，包含未注入默认内核的网页 SSRF 拒绝。另已通过旧测试 13（32/32）、16（36/36）、24（22/22）、25（73/73）、31（57/57）、77（13/13）。
- [安全辅助夹具](../scripts/qa-fixtures/runtime/security-evidence.mjs)：12 个实际连接/拒绝/取消条件；最后一项明示注入 DNS/HTTP，不冒充真实公网连接。

最新综合 94 于 **2026-10-11T12:45:09Z** 完成：Node **40/40 通过**，JSON 中 **39/39 证据项通过所列本地断言**；48 次真实 registry 调用覆盖 28 个唯一工具，20 个 OneBot actions、10 个模型请求、12 个安全条件。内核锁已释放、scheduler timers=0。五项已复现偏差都修复后重验；下表精确描述执行条件和边界，不据此宣布完整规格符合。

## 实际注册的 28 个工具

当前默认业务工具为 **27 个**；另外显式启用了 `hello_say` SDK 样例，因此实际 registry 共 28 个，测试逐一调用并核对唯一 ID 集合等于注册集合。按用户后续决策，不恢复已删除的 `sticker_note`；这里的“28”不等同旧规格中含该工具的 28 项。

| 清单 ID / 实际工具（owner） | 实际执行与本地证据 | 尚未证明的外部或完整边界 |
|---|---|---|
| B01 `send_message`（core-tools） | 数组两条 + 旧 `texts` 一条到真实本地 OneBot；空串拒绝。修复后 98 验引用/@只首条，长消息硬切三段、重复前缀跳过后的首个实际消息仍正确引用。 | 真实 QQ 文本呈现、所有格式/编码情况。 |
| B02 `send_to`（core-tools） | 关闭时 availability 拒绝；非白名单及同聊天业务拒绝；启用后私聊目标 `user_id=20001`。 | 真实跨 QQ 会话到达与完整授权交互。 |
| B03 `send_sticker`（sticker-tools） | 先实际收藏再发送；OneBot 只有一张 image 段，使用次数变 1。 | QQ 平台实际收藏库、全部三级回退路径。 |
| B04 `send_poke`（core-tools） | 群缺参拒绝、群目标 20001 正确；修复后 98 验私聊省目标拍当前好友 20001，群目标仍不变。 | 真实 QQ 系统提示和不支持该 action 的平台。 |
| B05 `list_stickers`（sticker-tools） | 真 sticker store 查询 `QA`、limit=1，返回已有 ID。 | QQ 账号真实收藏与备注同步。 |
| B06 `get_sticker_image`（sticker-tools） | 真实本地 PNG 获取，返回独立 mediaParts；未知 ID 拒绝。 | 外部图床故障、全部视觉模型权限组合。 |
| B08 `get_recent_messages`（query-tools） | 实际 store 的 limit/offset/pastStateCount 与 beforeId 边界核对。 | 全部历史容量/归档迁移组合。 |
| B09 `read_forward`（query-tools） | 真 `get_forward_msg` 一次，转发内容入档；第二次使用缓存，无第二次 action。 | 真实多层嵌套、媒体与所有平台资源 ID 形式。 |
| B10 `get_active_members`（query-tools） | 实际历史按次数排序，limit=2，QQ 是真实夹具发言者号码。 | 超长历史和全部时间边界。 |
| B11 `get_chats`（query-tools） | 三个真实本地聊天仓含群与私聊。 | 全部准入配置组合下的泄露检查。 |
| B12 `get_message_detail`（query-tools） | 本地消息定位到实际 image 媒体；不存在 mid 明确失败。 | 撤回/引用全部组合。 |
| B13 `get_message_images`（query-tools） | 真 reader 从本地 HTTP 读 PNG，base64 在 mediaParts 而非业务 JSON。 | 多图、外部缓存及每项故障组合。 |
| B14 `read_video`（query-tools） | 真 MP4 HTTP URL，native 路径返回 videoParts，记录 metadata。 | ffmpeg 截帧、视觉模型实际接受视频与真实 QQ 文件。 |
| B15 `memory_append`（memory-tools） | 真实 QQ 号印象写仓/文件，重复去重，非法 QQ 拒绝。 | 全部字数与容量边界。 |
| B16 `memory_query`（memory-tools） | 当前群按精确 QQ 过滤，返回真实既有印象。 | 完整跨聊天访问矩阵。 |
| B17 `memory_remove`（memory-tools） | 精确原文实删并保留另外两条。修复后 98 验返回 `removed=1`、重开 store 仍正确；整成员两条返回 2，同名另一 QQ 与另一群不受影响。 | 文件系统写失败的所有删除分支。 |
| B18 `web_search`（web-tools） | 真默认 Bing HTML parser 读取本地受控页面，返回标题、URL、摘要一条。 | 实际 Bing 与五个收费 Key 源；本地配置明确允许私网。 |
| B19 `web_fetch`（web-tools） | 实际 registry/默认 provider/SDK；转换正例采用明示公网 DNS+本地 socket 路由注入，script 删除、正文限 20000、图片提取；私网页面在图床例外开/关时均请求前拒绝。98 用未注入内核再次验证开图床例外仍无 HTTP 请求。 | 没有真实公网抓取；不能宣称所有站点格式/全部 SSRF 组合已通过。 |
| B20 `search_images`（web-tools） | 默认实现解析本地受控 `murl` HTML，返回真实可读 PNG URL，不擅自发送。 | 实际百度优先/Bing 回退与外网失效图。 |
| B21 `send_image`（media-tools） | 未预览拒绝；真 PNG preview mediaParts 后发送 image；实际单 run previews/sent 数核对。 | 全部大小/类型/数目边界、QQ file/base64 回退实机。 |
| B24 `set_reminder`（system-tools） | 真仓写相对未来提醒；0 delay 拒绝；后续真实调度发送。 | 全部绝对时间/去重/跨目标组合。 |
| B25 `list_reminders`（system-tools） | 当前聊天包含刚写入的真实 ID。 | 所有已发、取消与跨聊天排列组合。 |
| B26 `cancel_reminder`（system-tools） | 删除成功且 reminders.json 无该 ID；再次取消失败。 | 重启后跨到期时间的长期确认。 |
| B27 `check_holiday`（system-tools） | 实际本地日期函数返回可序列化对象。 | 没有据此验证年表与国务院官方节假日/补班全部相符。 |
| B28 `report_feedback`（core-tools） | 本地 bus 收到 message；真实 session 保存 warning。 | 没有发送作者/社区意见。 |
| B23 `finish`（core-tools） | 真 session 保存 reason/activeTopic；实际 HTTP LLM 只调用 finish 后一轮结束、0 发送。 | 同响应有其它工具时的全部排列组合。 |
| `hello_say`（hello） | 真 loader/schema/storage；返回“你好，QA94”，命名空间 uses=1。 | 不属于产品旧 28 工具清单；只是 SDK 样例。 |

## 没有 UI 入口的发送段检查

B22 通过实际 `kernel.send.sendSegments` 而不是新增工具调用：同一消息的两张图片真实映射为两个 OneBot image 段。修复前 video 段被默认 OneBot 映射删除，发出的 `message=[]`，队列却报告成功。协议代理修复后，综合 94 真发送包含一个 video 段，`data.file` 等于可读的本地 MP4 URL。没有把 read_video 返回 videoParts 当视频发送通过；QQ 实机接收仍未验证。

## 运行、用量与代际边界

| 清单关联 / 证据项 | 实际行为与断言 | 范围限制 |
|---|---|---|
| R03/R05 | 非白名单群真实 WS 入站不留档；at 别人即使文本同名也 `atMe=false`，已读且不请求模型；等待中第二条入站不改 waitUntil，两条均在原会话 triggerEntryIds，只一次 HTTP 模型请求。 | 不代表屏蔽/豁免所有组合与四档全部组合都已通过。 |
| R05-DICE | 实际 WS 三档普通消息，受控随机 0.9 不命中并标已读，0.1 命中；每条各调用 Math.random 一次。 | 随机值注入明确，未冒充概率分布统计。 |
| R01/R08 | 拍机器人跨一档唤醒（isPoke+atMe，因此 reason 为 @我）；私聊普通文本恒四档；暂停时入库未读不请求模型，恢复后 drain 原消息。 | 无原生托盘点击；没有验证全量并发/禁言查询。 |
| S07 | 真 HTTP 400 使会话 error；改回正常本地模型后经真实 retry API 重试原 ID/原触发批，累计 calls=3、tokens=300，已经发送的会话再 retry 返回 409。 | 400 失败尝试无 token 返回，calls 仍记录；合成模型账单。 |
| S08/R12 | 实际慢模型请求用 abort API 中止，对端观察 clientDisconnected，迟到无发送；实际 503 后在 1 秒退避中中止，等待 1250ms，只有 1 个请求且 calls=1。 | 未验证重试配置显式 0 的合同；不冒充所有工具/权限中止边界。 |
| U05/U06 | 真 usage HTTP：running 15→同 ID retry 累计 25，只计差额；终态不翻倍；零 token 会话不增 runs；改价格后历史 cost 保留；删除完整 session 文件仍保留归档身份与 25 tokens。 | 该项用仓 API 明示构造合成 usage；真实 HTTP LLM 累计另由 S07 证明。未覆盖所有时间范围/六维 UI。 |
| R16 | 不改时钟，不直接调用 tick；真实默认提醒服务首查/20 秒周期处理已到期提醒，本地 OneBot 真发送一次，待协议响应后 fired 持久化。 | 本轮实际等待由 JSON elapsedMs 记录，首查可能不足 20 秒；无长期运行/全部失败恢复证明。 |
| E14/E15 | 真磁盘 transport 插件：未授权不启动；授权 v1；热更 v2 需新指纹授权；旧代 callback 不入档；新代入档；保存的 send facade 转到 v2；停用回默认 OneBot，迟到 callback 不入档。 | 只替换指定协议链，不能代表每种 managed capability 的全部边界。 |

## SSRF 与取消的 12 项补充

`SSRF.detail.rows` 精确保存每项错误、请求数量、字节与时长：

1. 默认 localhost 在 HTTP 前拒绝，实际请求数 0。
2. 显式 allowPrivate=true 后真实本地 HTTP 200。
3. 真父夹具 HTML 页面超过 20000 字符成功抓取。
4. URL 含用户名/密码、file 协议，均连接前拒绝。
5. 真实 302 的下一跳 localhost 不在 browse-lock 白名单，目标请求数 0。
6. 实际流 maxBytes=8192 截断，服务端写入少于完整 65536 并观察断连。
7. 实际流 onChunk 累计最多 5000 字节。
8. 500ms 服务使用 timeout=80ms 取消，并观察服务端断连。
9. 已开始的真实响应流收到调用者 AbortSignal 后中止。
10. 提前取消的 signal 不产生 HTTP 请求。
11. 真实跨端口 redirect 移除 8 个敏感请求头、保留普通头。
12. 明示 injected DNS/HTTP 的公网→私网 redirect，私网下一跳不执行；没有真实外网访问。

**已修复的调用者策略问题**：原 `bundled/web-tools/service.js` 将 `security.allowPrivateImageHosts` 同时传给网页请求，允许 `web_fetch` 读私网 HTML。SPEC 第 704 行仅允许图片下载例外，第 1362 行要求网页禁内网。现在 `fetchPage` 强制 `allowPrivate:false`，保留 browse-lock 逐跳校验。98 的未注入生产内核+真实 registry 断言图床例外打开仍拒绝、HTTP 请求数为 0；94 的转换正例另用明示注入的 DNS/socket 路由，服务端仍是实际本地 HTTP。没有放宽真实出站边界来满足夹具。

## 修复的规格依据与前后事实

| 修复 | 修复前真实记录 | 修复行为与依据 |
|---|---|---|
| B01 引用重复 | quoteCounts=[1,1]，atCounts=[1,0]。 | SendQueue 只给第一条实际成功消息传 replyToMessageId，兼容硬切与 dedupe。SPEC 第 994 行“引用/at只挂第一条”。 |
| B04 私聊默认目标 | friend_poke user_id=0。 | 省 target 时取 private chatKey 的好友 QQ；群缺参仍业务拒绝。SPEC 第 1212 行“私聊可省=拍对方”。 |
| B17 删除数量 | 原文实删 1 条，工具 `removed=0`。 | MemoryStore 返回实际删印象数，工具原样转发。SPEC 第 1344 行返回 `{removed:N}`。 |
| B19 网页私网例外 | 图床例外打开时，实际 registry 读 localhost HTML 返回 200。 | `fetchPage` 独立禁止私网；SPEC 第 704 行图床例外、1362 行网页禁内网。 |
| B22 视频空发 | OneBot `message=[]`，队列报告成功。 | 协议代理补实际 video 段映射及空/未知段失败；94 核对最终 OneBot 段与文件 URL。对应 F-093、清单 B22。 |

98 的 7 个真实行为子项逐一验证数组/长文/dedupe引用、私聊和群拍一拍、单印象持久化、整成员数量与同名/跨群隔离、网页私网拒绝；没有为测试恢复旧固定 provider 或引入新用户功能。
