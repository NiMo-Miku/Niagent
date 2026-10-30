# 会话详情滚动的择优迁移

旧 `develop/ui/app/02-sse-sessions.js:523-525,712-715` 区分首次打开、运行时贴底跟随和离底阅读。原默认会话页每次刷新仅恢复绝对 `scrollTop`，真实合成会话从 42 条增至 62 条消息时，原先贴底的 top 535 保持不变，距底变为 429px。此次迁入旧版有用的条件跟随，并加强阅读锚点。

| 原子行为 | 默认策略 |
| --- | --- |
| 首次打开 / 换会话 | 显示详情底部的最新流水；不继承上一会话的滚动坐标。 |
| 同一运行会话 | 重绘前距底不超过 48px 时随新内容贴底；大于 48px 时保留阅读。 |
| 离底阅读 | 优先保留当前可见流水卡片 `data-key` 及相对视口偏移，新增错误 / 结束说明等上方内容也不会挤走阅读位置；卡片不存在时退回原绝对 top。 |
| 终态刷新 | 使用阅读锚点 / 原位置，不因为旧状态曾运行或曾贴底而强制追底。首次打开终态仍按首次规则处理。 |
| JSON 阅读 | 不改变模式，保留同会话原始 JSON 内层滚动面的 top / left；换会话不继承。 |
| 选择 / 离页代际 | 仍先通过既有详情版本和选中 ID 检查，恢复时再次调用同代检查。迟到旧详情不渲染或滚动新选择。 |

默认模块为 `panels/sessions/scroll-policy.js`，导出 `createSessionDetailScrollPolicy()`。实例提供同步 `capture(detail,{id,renderedId,status})` 与 `restore(detail,snapshot,{isCurrent})`；真实 `sessions/panel.js` 在已接受的详情响应重绘前后调用。模块不持有会话正文、DOM 引用或全局状态，不注册监听、observer、timer 或异步任务。它不决定选择哪个会话，也不改变 follow 勾选、权威读取、事件合批、折叠目标或导航状态。

可通过 `ui.assets["panels/sessions/scroll-policy.js"]` 独立追加替换，或随 `ui.panels` 替换完整 sessions 页。247 使用正常启动组合追加策略后，真实默认页的 capture / restore 被所选模块接管，滚动结果为指定的 73px；没有新增 RPC、面板权限或另一条硬编码默认实现。

`test/247-session-detail-scroll-parity-test.mjs --pure` 不启动 kernel、监听器或浏览器，覆盖首次、0/48/49px、终态、上方布局变化与浏览器锚定调整、卡片消失、JSON 和失效代际。正常入口使用真实默认页、生产会话仓和本机随机端口的合成数据，覆盖首次 / 追加、阅读锚点、终态诊断插入、JSON、旧详情迟到、空闲 timer 和实际追加替换。`QA247_BASELINE_PANEL` 可指定留存的修前默认页以复现旧行为；不会改写产品源。

修前 / 修后和既有相关回归的独立原始日志、定位散列与执行结果保存于 `.qa-local/v04-parity-20261016/sessions247/`。初次 Chromium 启动遇到 sandbox `spawn EPERM` 的记录单独保留；正常进程权限下的真实运行另存。定向证据不代替此批新源码后续冻结完整回归，也不代表所有会话 / 聊天 UI 原子项已完成。
