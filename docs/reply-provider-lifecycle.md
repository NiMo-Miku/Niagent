# Reply provider 阶段与生命周期迁移

本批补齐旧批后策略与 inline provider 的真实消费边界。没有选中可选 provider 时不增加自动发送或提前结束；默认解析器仍通过 `core.tools.parseInline` 消费，232 的独立模块及导入、重导出保持。

## 原子裁决

| 原子 | 旧实际消费者 | 新实现与裁决 |
| --- | --- | --- |
| 批后判定 | `develop/src/orchestrator.js:1231` 在工具批执行后调用 `reply.local-policy` | 新增 `reply.after-tool-batch`；与现代 `reply.local-policy` preflight 分开，避免同名能力无区分地调用两次。 |
| 现代 preflight | 0.5 在每轮模型请求前判定，允许零请求收尾 | 保留时点、次数与 reason；增加 `phase:'preflight'`。每轮重新选择当前 provider。 |
| 旧声明适配 | 旧声明的 `providers['reply.local-policy']` 接收 `{api,entries,batch}` | 仅 compat-04 声明映射到新批后能力；不改变现代直接注册的同名 preflight。旧 setup/activate/deactivate/dispose 合同不改。 |
| 交付事实 | 旧消费者使用本批工具 calls/results 和新增成功发送记录 | 从真实普通工具结果与回执构造批后 DTO，部分发送成功仍保留回执，失败行 `isError:true`。不依据工具意图推断已发送。 |
| 搜索标记 | 旧 `webSearchCount` 在尝试 `web_search/web_fetch` 时累加 | 保留“尝试过”含义，包括随后被 hook 否决或执行失败；不假称搜索成功。 |
| inline 选择 | 旧消费者每次模型回复重新选中 provider | 新版每次无 native tool calls 的文字回复重新选择；不继续持有运行开始时的旧 provider。 |
| inline 格式 | 旧对象 `{calls:[{name,args}]}` 与新版数组格式 | 保留对象与所选核心解析器合并、语义去重，以及现代 `[]` 显式否决解析器的合同。 |
| 异步与排队 | 旧同步调用没有相应 await 窗口 | 保留新版 async；增加 owner/provider/registration version 租约，覆盖 await、before-tool 与真实发送队列等待。 |
| pin ABA | 注册版本本身不表示配置 pin 的变化 | registry 接收可选 `subscribeSelection(callback)`；默认 kernel 将 config 的同步通知接入既有 `onChange`。首次 A→B 使原租约中止，随后 B→A 不复活。无关配置变化只触发重新比较，不无条件取消。 |
| loader 守卫 | 0.5 已有 owner/指纹/卸载与入参信号守卫 | 保留；本批补消费端选中实例的证明，不把已有卸载保护表述为原先缺失。 |

## 公开能力合同

现代扩展直接注册 `reply.local-policy` 继续获得 `{phase:'preflight',session,messages,round,remaining,signal}`。`round` 从 0 开始，`remaining` 包含即将执行的本轮。返回 `{shouldEnd:true,reason?}` 可在模型请求前收尾；没有 provider 或异常则继续默认循环。

新能力 `reply.after-tool-batch` 接收：

```js
{
  phase: 'after-tool-batch',
  api: { baseUrl?, model?, provider?, timeoutMs? },
  entries: [ /* 本次实际 trigger 的复制 DTO */ ],
  batch: {
    calls: [ /* 实际 OpenAI tool_calls，含 function.name / arguments */ ],
    results: [ { role: 'tool', tool_call_id, name, content, isError } ],
    newSent: [ /* 本批新增的成功回执 */ ],
    allSent: [ /* 当前运行已有的累计成功回执 */ ],
    searched: false // 本次运行是否已尝试 web_search / web_fetch
  },
  session, round, remaining, signal
}
```

批后 `remaining` 不包含已执行的本轮。实际 orchestrator 显式传入该批 `triggerEntries`；不会用提示词文字、全部历史或猜测的条目代替。模型引用来自实际 `_usedApi`，缺少时回退本轮配置；不传 API key、授权头或整个配置对象。SDK 将新能力加入核心函数能力集合，沿用复制、脱敏、owner/指纹和信号保护。

触发 DTO 最多包含前 200 条；标量字段为 `id,mid,ts,senderId,senderName,text,self,isPoke,atMe`，text 最多 8000 字符，其余字符串最多 200 字符。每条最多 20 个媒体，仅提供 `type`（最多 40 字符），不提供媒体 URL、路径或宿主对象。此限额是可选策略的入参合同，不改变模型上下文/触发批本身；扩展不能将媒体类型提示解释成已发图的证明。calls/results/回执保留实际批的数量，并经 SDK 值脱敏复制。

返回 `{shouldEnd:true,reason?}` 在已完成的工具批后结束；默认 reason 为 `local_policy_batch`。成功的 `finish`、调用方取消或没有工具的正常正文结束不会额外调用批后策略。没有任何默认收尾启发式被启用；是否还存在待办由明确选择的扩展判断。异常、过时返回或超时继续原循环，已确认发送不回滚。

## 选择、替换与取消

inline 与两个策略阶段都在各自边界重新查询能力表。租约保留选中的 owner、函数和注册版本，并订阅选中变化。provider 变更、禁用、相同对象重新注册或配置 pin A→B→A 都使原租约永久失效。过时提案被丢弃，不自动调用新 provider 重试同一次决策。

inline 提案进入普通工具 bundle、参数/权限/hook 与 SendQueue；租约信号合并进新的工具上下文，不改写共享原上下文。排队期间撤销会阻止尚未开始的物理发送；已经确认的物理发送、回执和归档仍保留。最终清理释放通知订阅并中止尚未完成的工作。provider 自身必须配合 signal 停止其内部异步操作；消费者不接受晚到结果。

能力调用超时使用 `api.timeoutMs`，非法/非正值默认 30 秒，上限 180 秒；这里只限定可选 provider 的等待。外部自定义 capability registry 若要提供同样的注册/选择 ABA 保护，需要提供 `version` 和同步 `onChange` 语义。`subscribeSelection` 是宿主 factory 参数，没有向扩展暴露 raw registry。

扩展可以追加注册/选择新能力，也可用 `overrides/<layer>/composition.json` 的 `core.agentRunner` 完整替换或包装。238 验证了 version 2 包装层及禁用层后恢复默认。内部租约/DTO 模块没有宣称为新的独立 composition key。旧插件仅有声明映射；未读取或验证任何已安装/市场 reply-safety 实现的私有设置和启发式。

## 实际证据与范围

`node test/238-reply-provider-lifecycle-test.mjs` 最终实际 **exit 0，29/29**。它使用真实默认 loader、SDK、工具 bundle、SendQueue、消息仓和会话归档；默认 ingest→orchestrator→runner 也验证了实际触发条目、批后结束与物理发送。覆盖替换、禁用恢复、注册 ABA、配置 pin ABA、调用方取消、超时、部分发送失败、无关配置变化、订阅清理和追加包装/禁用恢复。

本轮旧定向实际终态：08（41 断言）、18（26 断言）、204（12/12）、209（18/18）、210（9/9）、230（21/21）、232（19/19）、85、89，全部 exit 0。运行前已核对临时 appRoot / 依赖范围，私有 wrapper 拒绝真实 fetch、DNS、socket/listener 和 native process；没有浏览器、QQ、真实模型、15967 或外网。

证据在 `.qa-local/v04-parity-20261016/reply238-implementation-core/`。首轮夹具失败（Windows loader 将根级控制模块复制，造成测试控制对象身份不同）和第二轮不合法的 composition `wrap` 清单失败日志保留；修正的是本次新夹具。最终绿不能抹除这些失败。原只读审计 `reply-contract-atoms-review` 的 5 个 expected failures 保持原样。此次没有启动完整 M3/M4，不代表完成新的源码冻结全量验收。
