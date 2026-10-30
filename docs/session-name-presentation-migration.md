# 会话已知群名展示迁移

旧版会话列表与详情通过已加载的 chats 名称显示已知群名，未知时保留号码。第十六批后的 v0.5 仅聊天页读取名称，会话 DTO 与默认页只显示 key/id；[真实装配基线](../.qa-local/v04-parity-20261016/session-names248/baseline-result.json)在具备合成群名动作时确认 list/detail 均没有名称，动作调用数为0。

本次迁入名称展示，保留 v0.5 的触发消息标题、内部会话 id、原始 chatKey、筛选值和选中语义。只新增 DTO 的 `chatName` 字符串，不把名称落入会话档案或设置，不增加会话页访问聊天正文的权限。2026-10-18 按新标注精简可见标题：详情、筛选与上下文只显示名称，隐藏技术 ID 和群号/QQ号；未知名称显示群聊/私聊，原始 JSON 仍可检查内部键。

## 所选默认实现

- `console.sessionNames` 默认同步构造 `createSessionNameController(options)`，返回 `{getNames(chatKeys,{signal}?):Promise<Map<chatKey,string>>,dispose()}`。正式 list/detail 路由真实消费此所选对象；名称故障回退空串，原历史读取仍可用。
- 默认选择当前实际 transport，而非缓存其 facade；来源包括 service token、账号 id 与可选同步 `actions.getAccountIdentity()` 的 opaque 账号/配置代。opaque 值只参与宿主比较，不进入 DTO。
- 每次读取持有真实 `runtime.serviceLease`；所选 owner/注册/pin、授权 receipt、生命周期变化都能作废旧操作。权限例行 audit 不被误判成授权变更；管理员决定及实际 resolution 才清缓存。在途结果在提交时再次核对原来源和代际，A→B→A 不复活旧操作。
- 默认 transport 支持 `listGroups({signal})`，同代并发 list/detail 共用一次目录查询，按请求的群 key 读取名称，目录失败不再扇出逐群查询。默认 OneBot 的目录和单群动作现在把 signal 传给实际 client.call。
- 私聊通过当前协议的 `listFriends({signal})` 读取备注/昵称/名称（依次取非空值）；没有此能力时不查询群成员或模型。好友与群目录分别合并并发、缓存和失败退避，共用原权限/账号/注册代际约束，取消与停止清理全部在途操作。群/好友混合批次合并前再次检查来源，避免好友查询等待期间发生账号变更后泄漏先返回的旧群名。
- 正常名称缓存30秒，最多4096个条目；目录确认不存在的名字同样缓存，避免每轮会话更新重复查询。名称最多512个 Unicode code points，前端按文本展示。
- 协议明确断开时只使用仍有效的缓存，不启动名称请求；支持opaque身份但明确返回null时等待账号就绪。目录失败退避5秒，新来源立即清退避。单次目录超时1.5秒，取消、停止与来源变更可提前结束，忽略 abort 的提供者迟到结果仍丢弃。

兼容只提供旧 `getGroupName(chatKey,{signal})` 的协议扩展：每个未缓存的不同群仍需一次动作，默认最多8个并发，整批共享1.5秒时限，同一群的并发读取合并。**8是并发上限，不是总动作数上限**；快速成功的25个不同群会有25次动作。此处不以任意总量截断冒充完整名称能力，也不声称旧接口能批量查询；若扩展提供目录动作，默认会优先使用目录。取消一个调用者不会取消其他调用者正在共用的来源操作。

## 前端与追加替换

默认 `panels/sessions/chat-title.js` 导出 `formatSessionChat(session)`，只显示名称或无号码的未知类型提示。触发消息与内部会话 id 保留，名称更新不串群、不改变搜索或选择，也不会切换 JSON 模式。展示使用 `textContent`、`Option` 与原安全 row 构造，不解释名称中的 HTML。

可信追加层可以 replace/wrap `console.sessionNames`，或仅以 `ui.assets["panels/sessions/chat-title.js"]` 替换显示策略；删除/禁用层后新实例恢复默认。默认 controller 的清理沿当前组合生命周期，普通市场插件不会得到宿主对象、控制台凭据或新写权限。自定义名称组件仍须遵守返回 Map/字符串的接口；全替换实现自行承担其名称策略。

## 验证边界

`test/248-session-name-presentation-test.mjs` 当前17组纯/真实HTTP检查及1组真实浏览器场景，包含：非kernel真实权限审计、目录单飞与过期、无私聊查询、未知账号等待、legacy全量/并发/同key单飞、目录失败零fanout、超时迟到、单消费者取消、注册/账号/权限ABA、真实OneBot HTTP配置代、停止清理、坏元数据回退、三代实际 createApplication 默认/wrap/禁层恢复、鉴权及档案不变。浏览器检查中文/HTML形状名称、未知回退、变更/详情选择，以及真实追加标题资产。

独立审查发现并修复了开发中两处问题：例行权限 audit 导致名称操作自失效，以及遗漏同账号下的HTTP配置代。正式用例覆盖真实权限 receipt 和实际 OneBot opaque identity；[受控反向变体验证](../.qa-local/v04-parity-20261016/session-names248/review-races-result.json)仅回退这两个分支来确认失败与修复差异，明确不是完整历史源码快照。新增离线守卫后，第一次纯测试的 OneBot 夹具未标为 connected，导致15/16；仅补其合成连接状态，原身份断言保留，16/16通过。

所有实例使用临时合成数据和随机本地端口；没有访问15967、真实QQ、安装扩展或远端模型。专项与有头结果须分别读取QA记录，不能代替后续源冻结完整回归。
