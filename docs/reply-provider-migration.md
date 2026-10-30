# 可选回复提供者的择优迁移

旧入口为`develop/src/orchestrator.js`的无工具正文处理、`reply.inline-calls`及`reply.loose-send`/`reply.salvage-lines`/`reply.salvage`/`reply.grounded-select`消费者。新默认实现是`src/kernel/reply-rescue.js`，由实际agent-runner消费，可通过追加`core.reply.rescue`替换；提供者仍可用普通插件能力注册、停用和热更新。

| 原子行为 | 当前裁决及真实消费 |
| --- | --- |
| 没有可选提供者时的纯正文 | 保留0.5沉默；不自动把模型内部正文发给聊天 |
| 旧inline对象`{calls:[{name,args}]}` | 迁入并与所选内置解析合并、按name/实参去重；现代数组包括空数组仍保留原合同 |
| 规划文字否决 | 迁入；规划判断失败也不自动发送 |
| loose失败后裁判降级 | 迁入lines→salvage；裁判使用真实本轮模型的无密钥引用 |
| grounded reset/remember/picked | 迁入独立run状态；不能把trace改写正文当作原始模型的发送依据 |
| 候选文本完整性 | 只接受原始正文中确切原句，去重复、排除已经确认发送的短句 |
| 实际发送 | 普通send_message工具链；带正常tool-call ID、结果和归档，不在rescue直接调用transport |
| 超时和取消 | 整理有界超时；来源owner/provider/version失效及caller取消覆盖工具授权等待和发送排队 |
| 旧local-policy批后payload/时机 | 尚未完成迁移裁决；当前轮前策略不同，不能称整体reply合同已完全对等 |
| inline选择变化时的晚到结果 | 既有边界继续独立核对；不以本次rescue代际检查宣称已覆盖所有inline行为 |

默认rescue返回`{calls,valid,signal,dispose}`。其来源lease持续到正常工具settle；runner使用独立execContext合并signal，不改变其它工具的共享上下文。dispose同时取消尚未执行的残留队列项，防止工具超时后晚发；不能撤销已开始的外部发送。真实SendQueue成功receipt为`{index,text,msgId,at}`，不要求存在type或非空msgId；兼容旧typed text、排除显式非文本记录。

## 已验证范围

`node test/230-reply-provider-parity-test.mjs`当前真实21/21，覆盖纯消费者与实际createApplication/loader/core-tools/SDK/SendQueue/archive。追加层实际替换rescue，禁用后恢复默认；没有HTTP监听、浏览器、真实模型、QQ或原生子进程，外发门尝试为0。78与59相关回归亦exit0。

独立审查曾复现两项错误：超过默认8000ms队列去重窗口后忽略真实无type receipt而复发；proposal已排队但未到transport，停用来源后仍发。原失败源码、物理记录、散列及日志保存在`.qa-local/v04-parity-20261016/reply230-readonly-review/`，其中probe exit0表示确认缺陷，不能解读为产品通过。修复后正式230改为断言零晚发及一次已确认发送，并覆盖同一provider对象重新注册和caller取消。最终定向日志见`batch11-targets-2026-10-17T06-08-02-900Z`。

本文件不是全项目完成声明；新完整M3/M4须另以冻结源码终态为准。
