# progress.md — 会话日志

> 范围更新（2026-10-23）：专属协议端与便携客户端的安装、启动和登录态迁移已从项目范围移除。本文保留其余历史记录；旧编号、测试数量与结果只对应当时范围，不代表当前版本已经完成验收。当前外部协议端由用户自行管理。

## 2026-09-30（路线 B 第二次开工会话）
- M0 内核底座完成：提交 6906b00，9 文件 231 断言 + 12 冒烟全绿。
- 用户终极指令：完成整个 0.5 至可日常长跑；插件化一切（追加文件 = 换平台/翻 UI/换协议端/改核心）。
- 杀掉 3210 残留进程（上版孤儿 node.exe PID 12444）。
- M1 开工：先精读 SPEC §6（843-999）+ notes/06b-prompt / 06c-llm。
- **M1 完成（提交 3ad2a02）**：transport/store/wake/ingest/llm/send/prompt/sessions/memory/agent-runner/
  orchestrator/onebot-provider 全链落地；e2e（真 WS mock 协议端 + mock LLM）跑通 @→唤醒→回复→留档→done。
  修复 M0 遗留 bug：send.js cfg 函数/对象混用（hardSplitAt/限频/去重全失效）、chatKey 统一两段式（0.4 兼容）。
- **M2 完成（提交 0bb3fb1）**：reminders/stickers/migrator/safe-fetch/web-search/holidays 六个内核模块
  + 28 工具落 7 个捆绑插件（core/query/memory/sticker/web/media/system-tools）。
  **累计 796 断言 + 12 冒烟全绿**。
- **M3 控制台最终验收完成并已提交（a34790c；R52 安全补丁 0686b60）**：R01-R91 路由/事件/安全矩阵已收口；完整 `run-m3.mjs` 为 22/22 文件通过，真实 Chromium 为 27/27，headless smoke 为 12/12，定向 R01/R04/R05、价格与 R52 ZIP 安全回归通过，`git diff --check` 通过。状态 DTO 已脱敏，价格 resolver 遵守 custom → official cache/feed → manual/none；规格目录没有完整官方价格数值表，未凭空编造。

## 2026-10-01 M4 增量
- 已提交 `182233c` Electron 壳修订、`cf5c096` active/anchor/memory、`8d8faf2` MCP/compat、`e861cc5` MCP stop/权限修复。
- M4 专项已通过：Electron 壳 mock 1/1，进程适配器、active-memory、MCP/compat 及 `run-m4` 均通过；真实 Electron（electron 依赖未安装）、真实 QQ、Windows 托盘/注册表/双实例仍 BLOCKED。
- M4 实现门已闭合：Electron `27fbb56`/`6ae7274`；MCP 正式装配/显式 adapter/legacy compat `e81aa53` + `16b242d`；loader/compat 事务 `c8994be`；MCP timeout/crash `2a7f879`；permission Ask broker/UI `2875ef6` + 生命周期/并发/脱敏修复 `25ff14b`/`5fcf9ad`/`671b788`/`2fbd330`/`7e1c4c2`/`8550437`。M4 runner 7/7 文件通过，MCP/compat/loader/permission专项全绿；M3 runner 22/22、headless smoke 12/12；用正确 bash export + managed Playwright/Chromium1228 实跑 test34 27/27。真实 Electron（依赖未安装）、QQ/Windows GUI/注册表/双实例仍 BLOCKED；captcha诊断IPC、memory consolidate provider、proactive实际tick/anchor端到端、权限卡真实点击仍未完成，不能宣称真实运行时验收完成。

## 环境与坑（本次）
- 3210 端口：用户 0.4 实例/孤儿进程占用，沙箱无权杀（taskkill 拒绝访问）；测试统一用 3987/3988。
- Windows 子进程收不到真 SIGINT：优雅退出走同进程 stop() 验证。
- ESM 动态 import 必须 pathToFileURL（`c:` scheme 会报 ERR_UNSUPPORTED_ESM_URL_SCHEME）。
- 热重载同路径需 `?v=<mtime>` 绕 ESM 模块缓存。

## 2026-10-01 M4/M5 收口增量
- `240ea74` 修复 Electron 主窗口 token query 泄露：loadURL 永不携带 server token，改由 `preload.cjs` 窄 IPC `qq-agent:get-console-token` 对主窗口 WebContents 一次性取 token；`preload.js` API 同步；Electron shell test 断言 URL 无 token。
- `6e1cee1` 补齐验证码诊断 IPC：`qqa-captcha-net-probe`、`qqa-captcha-interceptor-status`、sender 校验、脱敏 DTO、探针错误分类和拦截统计；M4 runner 仍为 9/9。真实 Electron/公网反代仍 BLOCKED。
- `a73da81` 增加 M5 前置桌面配置：electron/electron-builder devDependencies、NSIS build 配置、覆盖升级 `installer.nsh`、启动 bat；`f1ad06b` 同步 package-lock，`db9d50f`/`c04f990` 记录前置门禁。`assets/icon.png` 已在 `ababb12` 补齐；真实 electron-builder/NSIS 构建首次运行受 WorkBuddy safe-delete shim 的 `genie-trash.exe ETIMEDOUT` 阻塞，Windows 安装/升级验收仍 BLOCKED。
- 最新回归证据：M4 9/9、M3 22/22、headless smoke 12/12、正确 managed Chromium 环境下 test34 27/27；图标静态配置检查通过；构建受 safe-delete shim 阻塞。
- 真实服务只读探活（2026-10-01）：`o.alicdn.com` HEAD 401、`captcha.cn-shanghai.aliyuncs.com` HEAD 200、`www.aliyun.com` HEAD 200、`https://kondius.cn/qq-agent/captcha-api/` HEAD 200（根路径 HTML）；四目标由 `probeCaptchaNetwork()` 均判定可达。`version.json` 返回 JSON 200，但线上仍为 `0.4.0`，未做发布修改。实际本机未发现 3001 OneBot 监听；普通 `QQ.exe` 进程不等于 OneBot/NapCat。隔离 Electron 启动命令可执行但当前 WorkBuddy GUI 沙箱未形成 boot-diag/3987 HTTP/窗口证据，故真实 Electron GUI 门继续 BLOCKED；未发送 QQ 消息、未修改第三方服务或账号数据。
- 隔离 headless 真实服务验收（临时 `<user-home>/AppData/Local/Temp/qqa-real-headless`，端口 3997）：`createKernel` 实际启动完整 loader/HTTP/OneBot reconnect loop；带 token `/api/status`=200 且 DTO 脱敏，缺 token=401，错误 Origin=403，SSE hello=200；`kernel.stop()` 后 HTTP 关闭、lock 删除、临时数据保留。OneBot 3001 连接拒绝属于外部服务缺失，未触发任何副作用 action。
- 2026-10-02 沙箱外授权尝试有头 Electron：清除 `ELECTRON_RUN_AS_NODE`、临时目录、3998 端口、`electron.exe --disable-gpu .` 启动约 6 分钟仍无 stdout/stderr、boot-diag、electron-user-data 或 3998 监听，随后停止；隔离目录为空，仓库工作树 clean。即使沙箱外命令也未形成窗口/HTTP证据，当前有头初始化仍 BLOCKED，下一步需普通可见 Windows 桌面会话直接运行并观察窗口/日志。
- 隔离真实 Agent + OneBot 验收（端口4020、临时数据目录）：等待候选 token 轮换后 WS connected=true/selfId=<已移除账号>，groups 200 共13个群且目标群1102382705存在，friends 200 共12个好友；按用户授权通过 `/api/chats/group_1102382705/test-send` 发送一条低频测试消息，返回 messageId=-668117058。未刷屏、未调用管理/上传/撤回动作。`4c2e671` 修复健康 WS 被轮询反复重连，`66448e9` 修复 HTTP action token 候选轮换；M3/M4 回归继续全绿。
- 用户点击启动后无窗口的修复：`915e2ac` 让 Electron 主进程按 `process.versions.electron + process.type === 'browser'` 自动启动，不再依赖 `process.argv[1]` 恰好等于 `main.js`；ASCII 启动 bat 清除 `ELECTRON_RUN_AS_NODE`、固定 `ROOT`、`cd /d` 后传绝对项目目录，避免 Explorer cwd/宿主环境导致 Electron 空转；无 runtime 时 boot diag 回退写项目根 `boot-diag.log`。修复后真实隔离 Electron 已达到 `main.js loaded → app-ready → kernel-started 4000 → window-created`，3998/4000 HTTP 与 Renderer 仍因当前 GUI/Chromium 崩溃环境未持续，日志记录 `render-process-gone reason=crashed exitCode=143`。`npm test` M3 22/22、M4 9/9 通过。

## 2026-10-04 目标修订：删除「换平台」
- **决策**：从终极指令与插件化总纲中删除「换平台（微信）」目标，**保留「换协议端（NapCat）」**。
- **理由**（经grep 代码核实，非推测）：适配层仅占约 20% 成本，平台语义渗进三层非适配器模块——
  1. 人格层：`prompt.js` 308 行含 19 处「群」，且「群友无管理权限/ 不要当群管家 / Markdown 在 QQ 上显示乱码」等规则依赖 QQ 群管理员体系与 QQ 渲染行为；
  2. 数据层：`store.js` 的 `findByMid`/`markRecalled`/`updateByMid` 全靠 QQ mid 匹配（v0.4 有 `message-id-test.mjs` 专测负数 id），`memory.js:13` 用 `/^\d+$/` 判 QQ 号；
  3. 语义层：`ingest.js:90` 读 `sender.card`（群名片，QQ 独有），`orchestrator:172` 拿 QQ 禁言状态，语义与微信不对应。
- **最致命一项**：`wake.js` 四档概率、`send.js` 限频参数、`prompt.js` 上下文档位是 2,256 安装实例 / 47 亿 token 调出来的，换平台需从头调参且无先验。v0.4 核心卖点「无状态会话 → 成本恒定可控」的护城河归零。
- **保留 transport 解耦的价值**：为「换协议端」服务（不同 OneBot 实现之间的差异需逐项核对），不承诺跨平台。
- 详见 `docs/gap-closure-design.md`「换平台的真实成本」一节（含逐行证据与成本拆解）。

## 2026-10-05 宿主权限与面板使用链路收口
- 不再接受插件清单 legacyTrusted 自动授权；宿主持久化明确决定，绑定插件全部文件结构化摘要。setup 网络请求也进权限门；撤销/更新/卸载/关机不放行旧请求。
- 面板资产只服务专用 ui/，每请求核验 active、ui.panel、代际与 realpath；ctx.call/getConfig 接通，最终 owner 从宿主注册表取得，自身schema配置递归脱敏，不把 token 或全局SSE传入用户iframe。
- 插件启停、授权撤销、重载刷新壳导航并销毁旧iframe；技能/插件页新增宿主授权按钮、显式确认和非沙箱警示。
- 端口探测停机竞态由 started+generation 双闸修复，49号84断言；额外修指纹NUL结构碰撞/.git漏扫、异步hook后撤销授权、ESM子模块缓存与owner点号规则不一致。
- 子模块/依赖资产变更需要重启进程，不假装入口query能刷新ESM依赖图；更新后需重新授权。未改 develop/using、未发送真实QQ消息、未修改生产data。
- 隔离验收：run-m3 25/25（含M0/M1/M2与34真实Chromium27/27、53真实授权/工具/配置/禁用链路）、run-m4 10/10、smoke 12/12；symlink真实创建因环境不允许而明确跳过，realpath拒绝逻辑仍测试。


## 2026-10-05 捆绑域工具 id 冲突可观测性（补 SPEC §7.4 薄环）
- **问题**：SPEC §7.4「重复 id 覆盖」在捆绑域是裸 id 静默`Map.set()` 覆盖（注释标SUSPECT 复刻 0.4 无告警）。两个 bundled 插件撞 id 时工具会莫名少一个，日志与UI 全无痕迹，与项目「每条规则可解释」的基调不符。用户插件不受影响——走 `<skillId>__<toolId>` 前缀物理隔离（`plugin-loader.js: toolIdFor`）。
- **改动（只补可观测性，不动仲裁行为；仍是后注册者生效，行为等价线不变）**：
  - `src/kernel/tools.js`：`register()` 增加跨owner 撞车检测 → `log.warn` + `bus.emit('tool.conflict')` + `collisions` Map 留痕；新增 `collisionsInfo()`（对照 `capability.explain()`）；`unregister()` 在覆盖者整体卸载时清留痕。同 owner 重复注册（热重载路径）不误报。
  - `src/console/routes.js`：新增 `GET /api/tools/conflicts` 诊断端点。
  - `ui/panels/common.css`：新增 `.conflict-note` 提示条样式（用既有 `--warn` token）。
  - `ui/panels/skills/{index.html,panel.js}`：技能页顶部渲染冲突提示块；`loadConflicts()` 用 try/catch 降级，端点挂了不影响技能列表。
  - `ui/panels/manifest.json`：skills 面板 api 白名单补 `GET /api/tools/conflicts` —— **必须补**，因为 `ui/shell/rpc-bridge.js:16 allowed()` 只放行 manifest 声明过的路径，未声明会直接 FORBIDDEN。
- **测试**：新增 `test/54-tool-conflict-test.mjs`（6 组断言：跨owner 撞车/同owner 热重载不误报/无冲突空数组/内核工具被顶标'(内核)'/卸载后清理/多次撞车累积成链）与 `test/55-panel-conflict-notice-test.mjs`（107 断言，覆盖路由注册、manifest 白名单、面板真调、无冲突清空、失败降级、全面板 api 安全形状），均已挂进 `run-m3.mjs`。
- **回归**：run-m3 **27/27 通过**（原25 +54+55）、run-m4 10/10、smoke 12/12；`node --check` panel.js 通过。
- 改动均为未提交工作树状态；未发送真实 QQ 消息、未改生产 data、未动 develop/。

## 2026-10-06 唤醒四档重写（用户钦定权威口径，修正前次误判）
- **前次误判自我纠正**：01:20 审计把「建立会话时重掷骰子」上报为地基缺陷，**该结论错误**。0.4
  `orchestrator.js:511` 与 `notes/06b-prompt.md:389` 明写「随机档不传 roll、重掷一次是刻意设计」。
  我当时误读了 SPEC:889「不重掷」的作用域（它指**一次运行内提示词渲染**的骰子要固定，
  不是判定与建会话之间不许重掷）。基于该错误结论写的 56 号测试已删除重写。
- **真实缺陷（用户指出）**：旧 `resolveContextTier` 用 `for (const t of [4,3,2,1])` 下探循环，
  与 0.4 的独立短路语义不等价，且拍一拍被塞在 `t===1` 分支 → **3 档下拍一拍不响应**
  （0.4 是任何档位都触发）；档位钳位写成 `Number(x) || 4`，负数会整个回落 4 档。
- **用户钦定权威口径（写入 SPEC §6.4，标注取代此前所有「累积生效」描述）**：
  ```
  1 档：被 @ 才响应。
  2 档：被 @ 或命中关键词 → 响应。
  3 档：被 @ 或命中关键词 → 响应；否则**骰一次**，落在 randomPercent 内 → 响应；
        没命中 → 这条消息置为已读，看后续群友发言。
  4 档：有消息就回。
  ```
  **一条消息在整条判定链上最多只骰一次**（3 档掷完即定，不重掷不追问）。
- **改动**：
  - `src/kernel/wake.js`：`resolveContextTier` 判定段整体重写为四档独立短路；档位钳位
    改为 `Number.isFinite ? Math.min(4, Math.max(1, Math.round(x))) : 4`（与 0.4
    `prompt.js:465`逐值对齐，0→1、-5→1、99→4、2.6→3、NaN→4）；拍一拍提到与 @ 同级
    不分档位；3 档未命中直接 return 未触发（不再 continue 下探）；命中确定性信号时不掷骰。
  - `src/kernel/orchestrator.js`：机械批补判定把结果写进 `m._tier/_reason`；第 6 步档位固定
    改为优先复用 `batch[0]._tier/_reason`，仅在无既定结果时兜底调 `resolveContextTier` ——
    同一条消息从首次判定到建会话固定全程不再掷第二次。
  - `dsh-spec/SPEC.md`：§6.4 写入权威口径代码块（标注取代旧描述）、四档细则、拍一拍不分档位、
    钳位坑位说明；同步修 §2.1:171-172 词汇表、§6.4:882 调用签名（0.5 是 `{entry}` 而非
    0.4 的 `{triggerEntries:[entry]}`）、:1685 扩展表。
- **测试**：`test/12-wake-test.mjs` 全量重写（66 断言，按四档分节 + 只骰一次 + 钳位逐值对齐
  0.4 + 拍一拍不分档位 + 禁言降档 + 私聊恒响应）；新增 `test/56-wake-roll-once-test.mjs`
  （源码事实 + 行为实验 + 反证，锁死「判定链只骰一次」不变量），挂入 `test/run-m1.mjs`。
  旧的 56-wake-tier-freeze-audit.mjs（基于误判）已删除。
- **回归（全部实跑）**：run-m1 **13/13**、run-m2 **7/7**、run-m3 **27/27**、run-m4 **10/10**、
  headless 冒烟 **12/12**，全绿。
- 写测试时踩的两个坑（已修）：① mock `Math.random` 要返回 0.2 这种[0,1) 值而非 20（代码内部会
  ×100）；② 断言源码顺序时要先剥掉注释行，否则注释里出现的函数名会干扰 `indexOf`。

## 2026-10-06 插件增删与热更新
- **技能/插件页签增删**
  - 删除 `POST /api/skills/:id/delete`：**三重闸**——拒删 bundled（随程序分发，升级会打回）、
    拒删 active（运行中插件直接删目录会留幽灵定时器）、realpath 复核目标必须在用户域目录内
    （防路径穿越）。同时清配置里的孤儿设置。
  - 新增 `POST /api/skills/install`（ZIP→ base64）：复用**市场同一套** `extractZipSafely`
    （R52 受限解压 + 声明/本地头一致性 + CRC 校验，已导出），不自造解压逻辑；skillId 格式校验；
    解压失败**清干净半成品目录**；目标已存在返回 409。
  - 前端：技能页加「安装插件」按钮 +每行「删除」（danger 样式，仅用户域插件显示）。
- **热更新** `POST /api/skills/:id/hot-reload`
  - **核心难点**：ESM 子模块缓存——入口能靠 `?v=fingerprint` 破缓存，但插件内部
    `import './helper.js'` 不带 query 会复用旧实例。loader 原本直接抛错要求重启。
  - 方案：`loadDir(rootKind, dir, { hot })`。**保守默认不变**（依赖图变了仍要求重启，避免半新半旧）；
    `hot=true` 时用 `?v=...&ns=<uuid>` 给整个依赖图换新import 命名空间，真正加载新代码。
  - 安全：指纹变化 = 换了代码 → `permissions.unbindPlugin()` **作废旧授权**，响应带
    `needsReauthorize`，前端弹确认并引导重新授权。
  - 前端：仅 active 插件显示「热更新」按钮。
- **回归（全部实跑，全绿）**：run-m1 **13/13**、run-m2 **8/8**、run-m3 **27/27**、run-m4 **10/10**、
  headless 冒烟 **12/12**。

## 2026-10-06 Preview 完整交付启动
- 用户要求：开始按规格书完整实现所有功能，产出功能完整可用的 0.5 Preview；本轮先建立完整审计与缺口矩阵，暂不把既有 complete 标记当验收事实。
- 已创建 planning-with-files 的阶段任务：规格逐条审计、核心功能补齐、控制台/插件完善、交付门验证。
- 并行审计首批回传：UI P0 是 sessions 空 body 首次加载；运行时 P0 是 memory.consolidate 无 production provider；这些先列为功能完整交付的 P0 缺口，不以 mock 绿灯掩盖。
- SPEC 能力审计补充：owner-check、media.download、reply.grounded-select/local-policy、reply.inline-calls 仅声明未生产消费；media.transcribe/chat.ban-state 已接线。已先补 owner-check 生产消费、memory.consolidate production provider、send_to/工具 DTO/list_stickers/check_holiday/loader fs.watch；media/reply 能力与外部后台循环仍待补。
- 规格审计新增后台循环缺口：blocklist 5min、price feed 24h/失败3h、telemetry 90s/6h、vision scan 2s flush、plugin fs.watch 500ms、UI 15s polling 尚未形成完整生产循环；已写入 findings.md，后续按核心循环优先补。
- 新审计缺口：T-28 check_holiday DTO 不符合 SPEC；F-104 搜索 provider 统一请求不符合各家方言，已列为 P0 工具契约修复。
- P0/P1 功能补齐阶段进展：
  - 已关闭：owner-check 生产消费、memory.consolidate production provider、send_to 默认拒绝+同会话闸、send/memory/query/image DTO 对齐、list_stickers query、check_holiday today/upcoming DTO、loader fs.watch 500ms、sessions GET 空 body、Shell refreshMs 状态轮询、stale lock 自动回收、media.download 核心 claim+SendQueue 消费点、price feed 启动/24h/失败3h循环。
  - 已同步 SPEC：sticker_note 删除与 QQ 侧收藏/备注失败语义。
  - 回归：M1 13/13、M2 8/8、M3 27/27、M4 10/10、smoke 12/12。
  - 仍未闭合：真实 B站/抖音 media-download provider、reply rescue 三能力、blocklist 5min、telemetry 90s/6h、vision scan 2s flush、社区/反馈/金句/验证码默认 UI、真实 Windows runtime。
- 第二轮 P0/P1 收口：
  - media-tools：备注真正随图片消息发送；返回结构化 sent/failed/note；浏览锁 host 改为 URL hostname 精确匹配。
  - query-tools：get_recent_messages/get_active_members 返回结构化 DTO；list_stickers query/items；memory 三工具结构化 DTO；check_holiday today/upcoming/greeting/type 对齐 SPEC。
  - loader：fs.watch 500ms 默认监听；Shell refreshMs 真实轮询 `/api/status`+`/api/config`；stale lock 回收；price feed 24h/失败3h循环；media.download 核心 claim 消费点。
  - 新增 58 号运行时契约测试并纳入 M3；M3 28/28，M1 13/13，M2 8/8，M4 10/10，smoke 12/12。
- 第三轮运行时/交付收口：kernel.start 失败现在释放 lock；新增 `scripts/verify-preview-build.mjs` + `npm run verify:preview`。
- 运行时契约测试 58 已纳入 M3；全量回归继续全绿。
- 第四轮契约收口完成：system-tools T-25/T-26/T-27 对齐（日期严格校验/结构化提醒 DTO/格式化 list）；SPEC T-06/T-08/T-09 同步 QQ 表情库新语义；M3 28/28、M1 13/13、M2 8/8、M4 10/10、smoke 12/12 全绿。
- 当前仍不能交付“所有功能完整可用 Preview”：真实 Windows GUI/NSIS 升级门未关闭；真实 media-download/reply-safety/telemetry/blocklist/vision flush/社区 UI 等仍是后续缺口。
- 第五轮：新增匿名遥测核心模块 `src/kernel/telemetry.js`（复用/生成 telemetry.json installId，聚合 telemetry-totals，90s 首报/6h 周期，失败静默，工具名≤50），kernel 启停接线；`report_feedback` 改 `{reported:true}`。
- 第五轮回归：M1 13/13、M2 8/8、M3 28/28、M4 10/10 全绿；smoke 12/12。
- 目前 Preview 交付仍未宣称完成：settings 全量 UI、社区/金句/意见入口、搜索供应商逐家方言、vision flush、reply rescue、真实 media-download provider、Windows 外部资源/runtime 与真实 GUI/NSIS 升级仍待后续阶段。
- 第六轮 UI/交付补齐：settings 面板改为核心配置路径编辑器（api/persona/store/proactive/chatActive/tools/webSearch/security/ui），密钥路径跳过；Shell 顶栏补意见/金句/Skill市场/插件市场/人设广场/官网系统浏览器入口；memory 面板整理状态与 impression 对象显示修复；Shell refreshMs 轮询已覆盖启动立即 poll。
- 第六轮 M3 回归：28/28 全绿。
- 中断回退后严格复核：重建丢失的 ui/extension-manager.js（修复技能/插件管理页白屏）、重写遥测增量子系统（修复累计恒为0）、补 price-update/blocklist-sync 事件注册、修正 3 处过时测试断言。
- 回归：M1 14/14、M2 8/8、M3 33/33、M4 10/10、smoke 12/12、diff-check 通过。
- 复核第二轮：全局扫描（80 文件语法 / 101 条import / 命名导入比对）发现我自己引入的重复实现 ui/extension-manager.js，已删除并保留更完整的 ui/panels/extension-manager.js；补price-update/blocklist-sync 事件注册。
- 回归：M1 14/14、M2 8/8、M3 33/33、M4 10/10、smoke 12/12。
- 端到端验证：真实 headless 启动（端口 3993），四个关键端点全部 200，OneBot 退避重连正常。
- 方向纠正：回退后代码库比预期成熟，7 个能力消费点与settings 40+ 配置项均已就位，此前"缺失"判断有误。
- UI 设计系统：重写 panels/common.css（13 章节令牌+组件类）、8 个面板样式收敛为纯增量、shell 与面板视觉同源、浅色改为显式 .theme-light 并按 WCAG AA 校准、修工具栏换行错位（CDP 实测）。
- 新增 62（静态契约）/63（浏览器实效：追加组件零 CSS 即合规）两条测试，均入 M3。
- 回归：M1 14/14、M2 8/8、M3 35/35、M4 10/10、smoke 12/12、diff-check 通过。
- 新增社区面板（第9 个页签）：口令安装 / 发布账号 / 全局屏蔽名单三块 UI，8 条 api 白名单，零自定义样式。
- 修正 normalize 拒绝字符串数组 api 的注册格式问题；修正 3 处硬编码面板数量的测试（30/34/55）改为跟随 manifest。
- 回归：M1 14/14、M2 8/8、M3 36/36、M4 10/10、smoke 12/12。
- 修复记忆整理 prompt 的字面 \n bug（静默劣化，代码不报错但 prompt 被压成一行），新增 65 号按源码反斜杠个数锁死。
- 新增 bundled/voice-to-text（语音转文字 provider，走 OpenAI 兼容 ASR，默认关闭），66 号端到端实测 20+ 断言。
- 回归：M1 14/14、M2 8/8、M3 38/38、M4 10/10、smoke 12/12。
- 修复 P0：设置页空白（manifest 漏声明 3 端点 → Promise.all 全炸），补声明并截图验证恢复。
- 新增 67 号（面板请求⊆声明 ⊆ 后端路由 + 格式 + 文件齐备），挂入 M3，字符级解析 99 条路由。
- 澄清两次误判：动态路由（16 条正则）与权限端点（panel-adapters.js）一直存在。
- 回归：M1 14/14、M2 8/8、M3 39/39、M4 10/10、smoke 12/12。
- 字体：全站等宽 → 系统 UI 字体（中文正常），代码/日志保留 --font-mono。
- 新增「组件库」设置分区：5 预设 + 14 色 + 圆角/密度/侧栏/按钮排布/渐变，存 ui.uikit.*。
- 新建 ui/panels/theme.js 主题引擎；分发改走 config → shell → RPC（localStorage 在 opaque origin 不可用）。
- 新增 68 号测试挂入 M3；修 Node import 路径与无 DOM 防御。
- 回归：M1 14/14、M2 8/8、M3 40/40、M4 10/10、smoke 12/12。
- 组件库 v2：ui.theme 失效 → 改为「界面预设」(ui.uikit.mode)；亮/暗为出厂基准，改动可另存为独立自定义方案（多个）。
- 新增背景图：上传（魔数校验+白名单文件名）+ URL，可调不透明度/模糊/铺法；地址消毒防 CSS 注入。
- 回归：M1 14/14、M2 8/8、M3 40/40、M4 10/10、smoke 12/12。
- 修复"主题设置消失"：custom 改映射后遗留的 .map 调用抛错使 desktop 分区渲染失败。
- 设置页改版：13 分区归 5 大类，侧边栏二级菜单 + 顶部下拉框；分区仍全部在 DOM（切 hidden），不影响表单收集。
- 回归：M1 14/14、M2 8/8、M3 40/40、M4 10/10、smoke 12/12。

## 2026-10-07 设置页与控制台 UI 彻底重置（Signal Console）
用户要求「调用前端设计技能，把设置页签的展现形式和整个界面 UI 彻底重置」。

### 设计方向：信号控制台（Signal Console）
立意：这是"机器人不在眼前时替你盯着群"的工具，界面按**仪表控制台**做——
机加工面板的刻线与内嵌边、通道条式分区导航、调音台式标签/控件对齐、状态灯与量程刻度。
冷蓝底 + 青色信号，强调色只在"当前/激活/有变更"这类真实信号上出现，不作装饰。

### 设计系统重建（common.css 475→约 620 行）
- 新增机加工质感令牌 `--bevel`（上沿内高光）/ `--press`（凹陷投影），卡片/按钮/输入框/色片共用。
- 新增仪表台构件：`.led` 状态灯、`.channel-no` 通道编号、`.ticks` 量程刻度、`.readout` 读数窗、
  `.module-head` 分区抬头、`.field-group` 字段组、`.zone-danger` 危险区、`.hint-bar` 提示条。
- 滑条重做：轨道压进面板 + 圆形刻度旋钮（webkit + moz 双写）。
- 排版分工明确：`--font`（中文正文）/ `--font-mono`（读数、ID、刻度）/ `--font-display`（仪表数字）。
- 浅色主题下`--bevel: none`，避免内高光在白底发灰。

### 设置页重构（信息架构）
- 左侧从"文字链接列表"改为**通道条**：状态灯 + 通道竖条 + 编号 + 标题 + 说明摘要（两行截断）。
- **新增分区筛选框**：按标题/说明/id 匹配，只改通道条显隐，**不碰任何字段 DOM**（防抖保存语义不受影响）。
- 右侧分区抬头带两位通道编号（01–13，稳定分配，与 id 无关）。
- 13 个分区共 **172 个字段 / 16 个字段组**：models 4、wake 4、access 3、send 3、memory 2。
- **响应档位做成仪表**：刻度尺（标出四档分界 0/10/20/90）+ 滑条 + 读数窗「N / 4」+ 档位说明，
  实测拖动滑条读数联动（4/4 → 1/4），不是静态装饰。
- **危险区**：安全分区的「放开限制」2 项（内网图片来源、浏览域名白名单）收进红框 `.zone-danger`。

### 顺手修掉的既有缺陷
1. **P0渲染 bug**：`send` 分区误用 `const store = group(...)` 后又写 `store.fields`，导致 render() 中途抛
   `Cannot read properties ofundefined (reading 'append')`，**整个侧栏通道条空白**。静态扫描同类误用已清零。
2. **Google Fonts 被 CSP 拦截**：shell 引 fonts.googleapis.com，但控制台 CSP 是 `style-src 'self'`，
   每次加载都报 CSP 违规（离线场景也不该依赖外网）。已移除，字体栈全走系统字体，并在 69 号固化成断言。
3. **53 号测试硬编码 `=== 8` 个面板**：manifest 早已是 9 个（加社区面板那次遗留），断言静默失效成超时。
   已改为跟随 `manifest.panels.length`；同时把授权链的等待改为显式 `waitFor` + 20s 余量
   （单跑通过、M3 连跑偶发超时，属测试脆弱而非产品缺陷）。

### 新增测试
- `test/69-settings-presentation-test.mjs`（已挂进 run-m3）：真实内核 + 真实 Chromium遍历验收，
  覆盖通道条完整性、13 分区逐个可渲染、字段分组、危险区、仪表联动、筛选不毁 DOM、分区切换不丢输入、
  零未捕获异常、零外部字体。9 组断言全部通过。
- `scripts/shot-ui.mjs` + `npm run shot:ui`：真实浏览器截外壳与设置页各分区，用于视觉验收。

###踩过的坑（重要，下次直接绕）
- **sandbox iframe 在 CDP 层面不可见**：`sandbox='allow-scripts'` 的 opaque-origin iframe，
  既读不到 `contentDocument`，`Runtime.executionContextCreated` 与 `Page.getFrameTree` 也不收录它。
  用普通对象伪造 `window.parent` 会让 `MessageEvent` 构造抛
  `Failed to convert value to 'EventTarget'`，握手被**静默拒绝**（表现为永远停在"加载中"）。
  **正解与 34 号一致：Playwright 的 `frameLocator` 能穿透。**
- **Playwright 不在项目 node_modules**：在 managed workspace
  （`<user-home>/.workbuddy/binaries/node/workspace/node_modules`），需 export `NODE_PATH`。
  这解释了 progress.md 里"34号 27/27"的记录方式。不设 NODE_PATH 时 34/53/69 会静默跳过浏览器断言。
- **通道条是 sticky 侧栏，靠后的分区落在视口外**，`locator.click()` 会重试到超时。
  测试里用 `.evaluate((a) => a.click())` 触发，别用可点击性检查。

### 回归
M1 14/14、M2 8/8、M3 **41/41**（新增 69号）、M4 10/10、headless smoke 12/12、`git diff --check` 通过。

### 追加修复：设置页在窄窗口溢出（用户实机截图发现）
用户实机（Electron 窗口约 1080×700）截图显示设置项溢出窗口。**1560×940 的截图看不出来**——
必须按真实尺寸复现。诊断脚本量化后定位三个叠加原因：

1. **`.settings-aside` 的 `max-height: 88vh` 是主凶**：窄窗口下把 1100px 的通道条内容
   压进 ~700px 盒子，而 grid 子项没有独立滚动上下文 → 内容直接溢出并把右侧分区挤出视口。
   修法：**删掉 max-height**，让整页自然滚动；`position: sticky` 只做跟随。
2. **`.settings-sidebar` 的 `overflow-y: auto` 产生第二个滚动上下文**，与 sticky 打架。已移除。
3. **响应式断点定在 900px 但根本没触发**：Electron 最小窗口 960（electron/main.js:301-304），
   减去 shell 侧栏 232 后内容区只有 728 < 900。断点上调到 1080。

另外发现**断点重叠陷阱**：848px 这类宽度同时命中 `max-width:1080` 与 `max-width:900`，
后声明的 `repeat(2,...)` 覆盖了 3 列（`matchMedia` 实测确认）。最终统一为 3 列——
实测 2 列会排 7 行、maxBottom 734 > 视口 642，第 12/13 项掉出首屏。

窄屏布局改为**三列紧凑网格**（`repeat(3, minmax(0,1fr))` + `.settings-group{display:contents}`
让分组标题跨列），13 个分区从"一屏高竖排"压到 5 行：侧栏高度 818px → **423px**（省 48%）。
窄屏隐藏说明摘要、隐藏通道竖条、状态灯放大到 9px 保持可辨。

### 新增测试
`test/70-layout-overflow-test.mjs`（挂进 run-m3）：三档真实尺寸（960×640 / 1080×700 / 1360×860）
实测断言——横向不溢出、无元素越过右边界、13 个分区全在首屏、状态灯 13/13 可见、
**侧栏未被 max-height 截断**（`scrollHeight - clientHeight ≤ 2`）、内容区在视口内。

### 回归
M1 14/14、M2 8/8、**M3 42/42**（新增 70号）、M4 10/10、smoke 12/12、`git diff --check` 通过。

### 追加：背景图三项修复 + 编辑器（用户反馈）
用户指出三个问题：① 背景图叠加两次 ② 应铺满整个页面大小 ③ 应用前应提供编辑（旋转 + 范围选定，16:9）。

#### 1. 叠加两次 → 只由 shell 画一层
根因：`body::before` 在 `shell/style.css` 和 `panels/common.css` **各定义一次**，而面板是 iframe
→ shell 1 层 + 9 个面板 9 层，同一张图叠成两层（透明度与模糊叠乘、颜色发闷）。
修法：面板侧 `body[data-bg-owner="shell"]::before/::after { display: none }`（theme.js 写该标记），
背景图只由 shell 绘制一次。

#### 2. 尺寸= 整个页面
改用嵌套伪元素：外层 `::before` 只承载不透明度，内层 `::after` 是真正的图片层，
`position: fixed; inset: 0` 铺满视口。**为什么不用 background-image：它无法旋转**，
而旋转是明确需求。

⚠️ 层级陷阱：`.app-shell` 原本没有 z-index，同一 stacking context 里伪元素（z-index:0）
会盖住它——实测整个界面被背景糊死。修法：`.app-shell { position: relative; z-index: 1 }`。

#### 3. 背景图编辑器（新建 ui/panels/settings/bg-editor.js）
预览台上：16:9 取景框 + 四角把手 + 右上旋钮；右侧 4 条参数滑条 + 8 个快捷角度。
新增 4 个配置项：`bgRotate` / `bgZoom` / `bgOffsetX` / `bgOffsetY`（已纳入 theme.js 的 SCHEMA_KEYS
与设置页 ALL_KEYS 白名单——**漏了白名单会导致编辑器永远读到空值**，选框量不到尺寸）。

#### 过程中修掉的 5 个真bug
1. **图片 401 裂图**：背景图走 `/api/*` 要 token，而 `<img src>` 无法带 header。
   修法：kernel 用 `extraStaticRoots` 把 `data/ui/backgrounds` 挂到 `/ui/backgrounds/`（免鉴权静态），
   上传路由返回新路径；`safeBgUrl` 自动迁移历史 `/api/uikit/background/*`。
2. **选框比例跑成 3.17**：手算 `style.height` 的百分比参照系是**父元素高度**，不是宽度。
   修法：高度改由 `aspect-ratio` 锁 16:9，不手算。
3. **垂直定位偏移**：`top` 百分比同样参照父高度，而 hPct 是"父宽当量"，两者混用导致把手跑到框外 25px。
   修法：纵向一律用像素（`calc(50% - Npx)`）。
4. **拖角完全点不到**：参数栏把预览台挤窄后，角把手伸出舞台被右侧按钮盖住
   （`elementFromPoint` 命中 BUTTON）。修法：编辑器 ≤1180px 改单列 + 把手 `z-index:2`。
5. **配置永不落盘**：编辑器 `onChange` 直接 `form.set()`，不走 `queue()` → 不标脏、不触发防抖保存。
   修法：改走 `queue()`。

另外把拖动实现从 `setPointerCapture` 改为"stage 级监听 + window 兜底收尾"
（sandbox iframe 下 pointer capture 不可靠，实测拖角无响应），并去掉 `pointerleave`
中断（会让垂直方向只动一点点）。

#### 关键 CSS 参照系教训
`width:%` 参照父**宽度**，`height:%` / `top:%` 参照父**高度**。混算必然错位。
要精确 16:9，用 `aspect-ratio`；要精确定位，用 `calc(百分比 + 像素)`。

#### 新增测试
- `test/71-background-editor-test.mjs`（挂进 run-m3）：真实上传 → 预览图加载、选框 16:9（1.778）、
  缩放锁定 16:9、只画一层、铺满视口、内容层级不被遮挡、旋转生效、真实拖拽+拖角、四参数落盘。
- 68 号主题引擎更新：路径迁移断言 + 编辑器四参数 CSS 变量断言 + 越界收敛 + `bgOwner` 单层归属。

#### 回归
M1 14/14、M2 8/8、**M3 43/43**、M4 10/10、smoke 12/12、`git diff --check` 通过。

## 2026-10-11 插件化整改验收

本轮按用户要求专注插件化，其余已确认的业务 bugs 留待后续。默认协议、媒体、记忆整理、搜索、市场、社区、遥测、提醒、模型方言和 MCP 经公共 SDK 注册；核心装配能力与服务生命周期。删除 ctx.kernel 和旧任意 bundledDepsFor 注入，hook、动态提示词、具名能力输入及事件出口使用复制、脱敏和权限约束。

实际磁盘传输插件可在授权后接管真实发送队列，停用回退；缓存 facade 跟随当前提供者，撤权、热更及旧结果不能复活已停止实例。控制台可选择单提供者或恢复自动，多提供者保持协作顺序，并显示实际启动/授权状态。MCP 首次配置和撤权后重新授权的工具/连接生命周期已验证。

最终 `npm test` 返回 0：M3 61/61 个测试文件（嵌套 M0–M2 回归），M4 10/10。80 实际 Chromium 通过；86 服务/HTTP 18/18、87 实际 kernel 8/8、88 回调边界 5/5、84/85/89 全过。最终 `npm run smoke` 12/12，`git diff --check` 返回 0。原始日志在系统临时目录 `qq-agent-pluginization-acceptance-final.log` 和 `qq-agent-pluginization-acceptance-smoke.log`。

改动保留在原工作区，未整体重置已有改动；安装包尚未重建。真实 QQ 登录收发、外部服务与十个真实市场插件仍需实机验收。公共 API 权限闸不构成原生 Node 沙箱。说明见 `docs/plugin-sdk.md`；其它未关闭的规格缺口见 `docs/gap-closure-design.md`。

### 追加：按钮重复 + 垂直位置非滑条 + 背景图不显示（用户实机截图）

#### 1.「恢复当前预设出厂」按钮叠出 5 个
根因：`renderKit()` 开头只`replaceChildren()` 了 **`kit.fields`**，但「恢复出厂」按钮是
`kit.card.append(actions)` —— 卡片本身从不清空，于是每渲染一次就多挂一个。
修法：改append 到 `kit.fields`（与其它区块一致）。
通用教训：**渲染函数里凡是 append 到"不会被清空的容器"，就会随重渲染累积。**

#### 2. 垂直位置没渲染成滑条
`offsetYInput` 漏了 `type = 'range'`（另外三个都有）→ 渲染成默认文本框显示 "0"。
修法：补上，并在 71 号加断言「四个参数 type 必须都是 range」锁死。

#### 3. 背景图完全不显示（最严重）
按用户实机状态复现（`mode=light` + light 槽存旧路径背景图）后定位：
CSS 变量、路径迁移、图片 200 加载（1920×1080）**全都正常**，但看不见。
根因是**四层不透明底色把背景伪元素盖死了**：
- `.workspace { background: var(--canvas) }`
- `.rail { background: var(--rail) }`
- `#panel-host iframe { background: var(--canvas) }`
- 面板 `body { background: ... var(--bg) }`

之前深色测试用的是纯色测试图，肉眼看不出被盖；换真图才暴露。
修法：全部改成掺透明 —— workspace/rail 用 `color-mix(... 88%/90%, transparent)`，
iframe 与面板 body 用 `transparent`。无背景图时透出 shell 的 `--canvas`，观感不变。

⚠️ **63 号断言是帮凶**：它断言「页面底色为深色 `rgb(16,27,39)`」，把不透明当成了正确。
已改为断言「面板 body 背景透明」。

#### 断言解析器踩坑
`color-mix()` 的计算值是 `color(srgb r g b / a)` **新语法**，不是 `rgba()`。
我第一版断言只认 `rgba()` →把半透明（`/ 0.88`）误判成不透明，误报了修复失败。
已改为两种语法都认。以后断言颜色透明度，别只写 `rgba?` 正则。

#### 新增/更新断言
- 71 号：四个滑条 type 必须都是 range；「恢复出厂」按钮唯一；
  **外壳与面板各层背景必须掺透明**（含面板 body）。
- 63 号：面板 body 背景透明（取代原「底色为深色」）。

#### 回归
M1 14/14、M2 8/8、**M3 43/43**、M4 10/10、smoke 12/12、`git diff --check` 通过。

## 2026-10-13 验收暂停，开始基础 UI 重置

用户要求先记住当前测试进度，暂停原逐项验收，将 UI 彻底简化到接近浏览器默认样式。此次只改变界面表现，既有业务/插件化/公共 SDK/RPC 边界和数据保持；不生成安装包。

- 最近完整自动回归是 UI 重置前第九批：M3 104/104、M4 10/10，均 exit0。日志 `.qa-local/full-regression-20261012-ninth.log`，结果 `.qa-local/full-regression-20261012-ninth-result.json`。这是历史基线，不自动证明修改后的 UI 通过。
- 有头清单 186 项：4 完整通过、90 部分通过、1 失败（C10）、89 条件不足、1 待测（E17）、1 延期。94 项有至少部分实测，覆盖率约 50.5%；不能当整体功能实现或完整规格验收完成率。
- 135/136 重置修复：完整备份、暂停业务、200 仅 accepted/completed=false；原生确认后旧 PID 83232 正常退出，下一 PID 80504 启动时清空旧业务数据和 Electron profile。原生默认设置/空会话、可见浏览器聊天/记忆/全部历史用量空态都已完成；备份与初始快照保存。主 QA 54 业务文件 hash 全部未变。
- 证据目录 `.qa-local/destructive-headed-20261012062252328-8b5b758d`；完整结果 `approved-cleanup-results.json`。最后收尾被用户中断，停在该副本 File > Exit 菜单，未点击最后退出，不把 leaf 进程/fixture 当成已关闭。此前 leaf PID80504/fixture73756、主 QA44396/36000 仅是历史身份，恢复时必须重新核实。
- 待续：E17 MCP 用户扩展权限/子进程代际实操、其余本地未覆盖分支、真实 QQ/模型/市场/公开投稿等外部验收；C09 图片投稿写入合同与 C10 登录验证码合同缺口保留。安装/卸载扩展、公开动作需要具体范围；不把旧清理副本授权扩展至其他数据。
- 既有权威记录：`docs/headed-qa-checklist.md`、`docs/headed-qa-results.md`、`docs/headed-qa-regression-evidence.md`，此次验收暂停前的内容已另行备份。
- UI 重置前快照：`.qa-local/ui-before-minimal-20261013-034226-946f41c1`，54 个 UI 文件的 SHA256 在 `manifest.json`，并有三份验收报告与第九批结果 JSON。没有 Git reset/回滚/清空工作区。

本轮 UI 目标：原生按钮/输入/选择框、白底黑字、自然文档流，去掉主题背景、装饰标签、动画、阴影、彩色卡片和多余排版；只保留维持操作的必要几何、隐藏与可滚动规则。验收工作等 UI 稳定后再接续，旧外观断言将按新要求评估。
## 2026-10-13 基础 UI 重置完成（局部验证）

- 14 个 UI 文件与快照不同：共享 common.css、9 个面板私有 style.css、主窗口 style.css/index.html、设置 index.html/说明文案。JS 只更改一条外观说明，业务/RPC/SDK/后台代码未在此轮变更。CSS 从 115611 字节降至 10558 字节，约移除 90.9%。
- 使用白底黑字、浏览器原生控件和普通文档流；去掉主题背景、阴影、装饰标题/编号/状态灯、特殊字体和动效。外观配置继续保存，配色、背景、圆角、密度暂不参与渲染；设置页已明确提示。
- 保留 closed dialog/[hidden]/hidden/is-hidden、iframe 尺寸、消息独立滚动、长日志/表格滚动、裁剪舞台/选框/把手/旋钮的定位。裁剪局部恢复 border-box，避免坐标比例因边框偏移。
- 在新独立合成副本 `.qa-local/minimal-ui-preview-20261013-raw` 用正常权限实际打开 Electron：会话、聊天、记忆、用量、技能、插件、设置、社区 9 页均已观察；实操聊天外层与消息容器滚动、设置筛选和切换记忆分区、社区页签显示/隐藏、记忆新增弹窗打开/取消。未提交数据删除、重置、真实消息、权限、安装或公开动作。
- 本轮针对性检查 `node test/61-ui-module-integrity-test.mjs` 通过。完整自动回归和 186 项有头验收未续跑；不能把重置前 M3 104/104 标为新 UI 已全绿。
- 旧外观断言被此次用户要求替代，仍需后续拆分/适配：62/63/72/109、68 的 CSS 字符串、70 首屏三列与固定字号/LED、71/111/115 宿主背景绘制、108 强制两行动作布局。保留分区/字段、配置迁移/落盘、裁剪 ROI/交互、控件不裁切、导航恢复/键盘等功能断言，不通过改回旧皮肤取悦测试。本轮未删除或修改这些测试。
- 预览首次受限启动报 Chromium IPC 拒绝访问/0x80000003，已核实并结束本轮失败进程 67340，关闭遗留错误提示，以正常权限启动 87820 成功。fixture PID58348，端口17667/17668；仅是记录时身份，之后仍需重新核实。
- 独立预览仍打开，保留作用户查看；数据与服务均为 loopback 合成环境。截图和 `ui-changes.json` 位于该副本目录。原有测试数据/验收权威文档、UI 前快照保持。未打包安装包。

## 2026-10-13 暖黑黄绿 主题重做与本地验收

用户要求先备份简约 UI，再研究 暖黑黄绿主题 的设计理念/语言，重做全部 UI 与组件库，加入完整动效、原创且可换色的图标，并保留插件化边界。原 186 项逐功能验收继续保留上述暂停进度；本节记录此次界面重做，不把新外观验收当成原规格全部完成。

- 改动前完成 `.qa-local/backups/minimal-ui-20261013-043341-5e701811` 源码快照：344 文件，其中 54 UI 文件，含 package-lock 与原验收文档，排除业务数据/依赖/构建产物。2026-10-13 逐项 SHA256 与长度复核全部一致。没有 reset 工作区。
- 实际搜索并查看官方首页、2026-01-17 发布开发沟通与其装备 UI 图片，转译为灰阶分层、索引、薄线、切角主操作、小圆角及受控强调色。颜色与尺寸是本项目设计值，未冒称官方规范。研究/接入说明见 `docs/theme-color-design.md` 和 `docs/plugin-sdk.md`。
- 重做共享 `design-system.css/common.css`、外壳和九页私有布局；增加 `icons.js`、`motion.js` 与设置组件预览。原业务控件 ID 保留。恢复实时亮/暗、自定义主题、圆角、密度、侧栏、按钮排布和单宿主背景绘制；背景仍使用 16:9 参考平面，几何与像素回归保留。
- 用内置 image_gen 生成两款原创透明图标并进行质量迭代；原生成文件保留，选用结果在 `ui/panels/assets/endfield`，提示词及选择记录在同目录 `generation-prompts.json`。实际浏览器比较 180px 与 32px 蒙版；PNG alpha 蒙版及 SVG currentColor 均实操验证随暗色、浅色、蓝紫方案换色，无 emoji 导航。
- 用户面板在 ready 后只收到经过白名单过滤的视觉 DTO；背景路径/私有方案名/宿主配置/密钥不出宿主。用户 RPC 仍为 ctx.call/getConfig/notify，保留 opaque iframe、source/origin/nonce/面板 ID/代际检查。未知插件自愿接入共享样式与动效，没有全局注入。
- 动效覆盖入口、悬停/按压、追加、详情、页签、details 与原生弹窗。无常驻 rAF、定时循环或永久 will-change；轮询替换不让整张列表反复入场，减少动效偏好/后台/移除/卸载会取消。137 新增六组真实模块/桥边界回归。
- 独立合成副本 `.qa-local/endfield-headed-20261013` 实际打开 Electron；会话、聊天、记忆、用量、技能五页及详情已实操。随后 Windows 工具激活失败（failed to activate captured window），重新识别/一次恢复仍失败，停止原生输入；改用可见浏览器操作同一副本，完成插件/设置/社区、组件示例、弹窗取消、页签、浅色保存、自定义方案另存与换色、恢复暗色并重载。全部九页均有实际有头观察；未操作真实 QQ、外部发布、扩展安装/授权、业务删除或重置。
- 帧探针仅放在 QA 副本，生产源没有探针。该阶段换色优化前的局部详情/记忆弹窗样本 active P95/max 约6.2ms、约164–165fps、0个 >33.34ms 间隔；首次外壳 active max 30.2ms，早期设置样本包含97ms间隔。这是历史记录，不是后来优化后的帧率证据；后续混样及测量限制在下文更正。原始 `frame-samples.jsonl` 与 `browser-frame-samples.json` 全部保留，不能据局部样本保证满帧。
- 61/137、52/67/89/129、62/68，以及63/69/70/71/72/108/109/110/111/115针对性检查已通过，其中包含浏览器的检查实际执行；137是实际模块在Node DOM/RPC夹具下验证，并非Chromium。63/72保留形状/换色断言，修正减少动效极短过渡中的测量方式；71/111/115仍检查真实像素、裁切ROI、旋转、拖动与保存。测试适配没有改回旧视觉语言或删掉功能断言。
- 首次全量 `npm test`：M3 103/105、M4 10/10，失败为55缺少技能冲突提示样式、120金句流程末尾文档横向溢出1px。55补黄色语义冲突提示与长工具ID换行后250/250通过；120当时进入独立本地诊断，后续修复与全量结果见下节，不降低0溢出断言。首次日志保留 `full-regression.log`。未打包安装包。

### 窄屏收尾与最终回归

- 120 已定位并修复：窄屏聊天 `position: static` 覆盖共享卡片定位，绝对定位角标失去自己的包含块，在视口外多出1px。会话页同类覆盖一起修为 relative；公共角标 top/right 设0以避免独立滚动卡片内部多1px。不是原生 dialog 的缓存根因；前期所有无效 A/B 保留在诊断日志。未改取消处理、根滚动策略或原0断言。
- 修复后120、70五尺寸、121实际通过；会话额外在736px iframe内选择详情并保留123完整跟随流程，文档/卡片内部宽度均一致、所有控件 fit。在可见浏览器960×640再次实操聊天/会话详情，内部消息滚动保留、根溢出0，随后撤销临时视口覆盖。该阶段完整回归使用独立 `full-regression-final.log`，结果105/105记录于下文，不覆盖首次失败记录。
- 独立只读审查确认插件主题DTO/opaque iframe/用户RPC/动态导航安全文字与图标白名单/组件示例本地交互均与文档一致。生产源未混入QA探针，备份再次344/344复核通过，`git diff --check` 返回0。
- 性能汇总保存 `performance-summary.json`。其约6.2ms浏览器活动样本与首次外壳12.1ms来自优化前历史；后来文件混入新的低频回调样本，不能读为优化后性能提升。原生记录仍有515.1ms非动画间隔及72.8ms活动间隔，不将未知后续原生输入归因于本轮指定动作，也不以局部流畅样本声称绝对满帧。
- 窄屏与提示修复后的完整 `npm test` 已完成并exit0：M3 105/105、M4 10/10，M3内嵌M0 9/9、M1 14/14、M2 8/8，所有文件执行。日志 `full-regression-final.log` 与 `full-regression-final-result.json` 保留。该时点主题颜色过渡fan-out仍在独立副本评估、尚未改生产源；后续采纳结果另列，不能拿这轮日志代替修改后的检查。
- 跳过口径更正：文件跳过0、Node skipped 0，但50号实际文件symlink建链子用例1项受Windows权限限制跳过，两轮均有该行；首次摘要仅按runner口径漏记了它。首次原记录保持，最新摘要和设计文档如实补入；不能声称该子用例已实测。
- 换色性能优化已采纳：theme.js内联有限两帧颜色过渡门控；新增theme-preview.js合并同帧预览；设置仅替换预览调用并change/onLeave/pagehide收尾，离开不等待预览RPC；4处CSS使用颜色时长令牌。原hover/press/transform/opacity不变，没有遮罩/整页淡入，bridge/FormState/保存queue未改。
- 独立合成组件A/B与生产快照复验：3次切色967条颜色transition→0；61次input的preview RPC 61→1，每个promise成功、最终保存色#123abc正确，hover/press仍有颜色与transform，0 pageerror。该数字不是实际页面FPS结论。生命周期检查通过，137现8组；61/63/68/69/72/73/109/110/137定向9/9通过。日志与生产复验结果在 `.qa-local/theme-perf-ab-20261013-sdk`。
- 更新后的可见浏览器再次实操方案切换/保存/恢复原自定义方案，蒙版与SVG同步换色，门控最终为空，文档溢出0。该阶段UI为62文件，备份344/344复核有效。换色优化后的第三份完整回归已结束：M3 104/105、M4 10/10，唯一失败122为idle configUpdated重建后高级DETAILS关闭；单次原测试重跑通过，但不能抹掉完整回归失败。独立 `full-regression-performance-final.log` 及结果JSON保留；后续确定性修复见下节。

## 2026-10-13 性能优化与图标焦点动效（本轮记录）

用户继续要求性能优化，以及图标在焦点时按含义运动、失去交互后静止。本轮未恢复原186项逐功能验收：仍为4完整通过、90部分通过、1失败C10、89条件不足、1待测E17、1延期，94项有至少部分实测（约50.5%）。C09/C10、真实QQ/模型/市场及公开动作等缺口仍保留；界面回归通过不表示规格或所有功能完成，未统一打包安装程序。

- 动态图标：新增 `icon-motion.js/icon-motion.css`，`createIcon` 在当前文档懒安装一次委托，复用原创SVG/currentColor和两款原PNG alpha蒙版。会话流水、聊天文字、记忆扫描、用量柱图、技能组装、插件接通、设置齿轮、社区轨道及徽记能量为短时一次动作；hover或键盘可见焦点触发，aria-current选中不循环。每控件最多4图标、每图标最多3效果，420–560ms有限错开；无悬停/可见焦点、后台、窗口失焦、减少动效、隐藏/禁用、移除/卸载会取消。每文档1图标observer，无每图标observer或常驻rAF。
- 138真实Chromium验证12种语义/回退场景、鼠标与键盘触发/退出、选中不循环、回收、换色和opaque隔离；132个glyph共用1个observer、disconnect1次、图标模块rAF0。SVG与蒙版同为rgb(68,153,255)，pageerror0。visibility后台策略通过浏览器受控标志验证，窗口失焦/pagehide通过事件策略验证，不冒称已测OS调度或全流程帧率。61与137八组同时通过。原始结果 `icon-focus-2026-10-12T23-09-39-308Z-0261879f.json`、`verification-20261012T231253750.json`。
- 设置122确定性修复：6个高级DETAILS采用稳定组键，必须重建时保留打开/关闭状态及当前分区。真实改动权威配置并确认节点替换，打开与关闭状态均保留、新配置可见；禁用状态恢复的基线确定性失败。122永久加入此检查且原映射替换/保存/坏形状/旧回执断言保留，69/73/117通过。旧104/105失败和原单次重跑日志均不覆盖。
- 设置后台复用：仅权威数据相同、FormState版本不变且无invalid输入时复用现有DOM；所有GET仍执行，显式reload及变化数据仍重建，手动render会作废复用快照。6次相同后台事件的render6→0、重建元素8676→0、同步render总约70.1ms→0；每次仍8次读取，变化配置重建1次且新值可见，未发配置POST。未修改保存queue/API/RPC合同。`settings-validation-result.json` 与 `settings-reuse-before/after.log` 保留证据。
- 宿主去重：复用相同定义、已ready且未关闭的连接中面板，导航/状态控件仅写变化值；刷新通知合并仍读取新清单，丢弃过期快照并保留最终更新，定义/代际变化和失效桥仍重建。3轮合成事件中同页挂载5→0、清单读取40→1、未变状态DOM写入1760→0；52/53/95/109/110/116/139通过。工作量减少有直接证据，但启动中位数307.5→418.3ms，普通导航多页也变慢；负结果保留在 `shell-final-summary.json`，不能宣称整体启动/导航已提速，headless计时不是GPU呈现帧率。
- 旧帧采样口径更正：浏览器混合59条中，相对早期40条新增的19条包含优化前10条；真正换色优化后9条，8条最大间隔>900ms，混样最大1006.2ms。旧165fps是优化前局部历史，97ms也不是后来混样最高值。旧原生103条未增加，57条含活动间隔（P95最高24.3ms、最大72.8ms），无动画最大515.1ms。探针缺少焦点/遮挡/调度上下文，不能把约1Hz回调归因于系统节流或主题模块，也不以旧样本冒称优化后满帧；门控自身无1000ms定时器，只等待两次实际rAF。
- GPU对照：1360×900可见Electron，原生点击用量/设置，同一冻结UI与synthetic loopback服务，各模式4个约1500ms rAF样本，副本hash保留。GPU compositing/rasterization从disabled_software→enabled；整段P95范围18.1–24.2→6.2–6.3ms，但最大间隔84.9→109.1ms，crash/loadfail/blocked requests均0。每页每模式仅1次采样、CPU负载未固定、GPU阶段全量刚开始，冻结UI早于最后设置/宿主优化；不是呈现追踪或统计控制benchmark，不能保证绝对满帧或测出完整启动收益。生产Electron默认自动GPU，`QQ_AGENT_DISABLE_GPU=1`保留显式软件回退；131正常/回退的就绪前时序验证通过。
- 本轮证据统一保存在 `.qa-local/performance-icons-20261013`，包括 `gpu-comparison-result.json`。此阶段UI清单65文件是历史，后来加入dialog-lifecycle后为66文件；根任务已再次复核简约版344/344及native67份。用户面板仍仅消费脱敏视觉DTO，opaque iframe及ctx.call/getConfig/notify边界不变；未新增插件权限。
- 此阶段之后前两完整回归分别106/107唯一124/120，第三107/108唯一62夹具缺依赖，第四107/108唯一109保存ACK前断言，历史与修复见下节。旧105/105与104/105仅表示各自阶段；50号Windows symlink子项skip1保留，不以runner skipped0冒称全部子项实测。设置旧读取保护及六项定向冻结、本地副本核验后，正式第五全量已通过108/108及M4 10/10，完整证据见末节。

## 2026-10-13 本轮前两份完整回归与收尾（历史阶段）

- 本轮第一份完整 `npm test` 已结束，exit1：`.qa-local/performance-icons-20261013/final-regression-20261013-072303478.log`及同名`-result.json`。M3 106/107、M4 10/10；内嵌M0 9/9、M1 14/14、M2 8/8不能相加。所有文件执行至结束，Node skipped0，但50号Windows建链限制的1个实际symlink子用例skip仍保留。原失败和历史各轮日志均不覆盖。
- 第一份唯一失败124：首次本地预览取消后即时`dialog.count()`为1，原期望0；失败当次未测open/可见状态，不据此称为弹窗仍打开。随后同步幂等cleanup与同栈取消/断开/重开/旧close保护已红→绿，忙态cancel1、成功新增cancel0，原0及全部发布安全断言保留。证据`feedback-sync-cleanup-result.json`。不能以单项修复覆盖该完整失败记录。
- 138关闭DETAILS回归已红→绿：可见父控件仍有键盘焦点时，关闭折叠区的内容图标未cancel；现以无几何读取的祖先判断立即取消隐藏内容，第一个直属SUMMARY子树仍可动，重开后新键盘焦点再次触发。134个glyph共用1个图标observer、disconnect1次、图标模块rAF0、pageerror0，原12语义场景保留。证据`icon-focus-2026-10-12T23-28-32-416Z-4cfe987b.json`；最终源hash为icon-motion `54BCA911C65E1E4DAC703C053CCA8D026BC236B5920996A3E939AAA3E414BFB7`，138 `99549176A70D9EF862E30FF836E0FC1A347BFDBF43EF4FEDCE842AD8DB2FA6A6`。
- 源快照限制：第一份快照于本地07:27:16采集，晚于全量进程启动，当时138已含新增红断言，启动前原测试hash未采集；icon-motion于07:28:40修复，早于全量运行到138，结束快照记录其变化。这份106/107不能称为整轮使用一个不变源码树。第二轮启动前/结束后runtime/tests/docs的hash一致；其结果仍失败，不将冻结与通过混为一谈。
- 第二份完整回归已结束，exit1：`final-regression-after-feedback-20261013-074027002.log`及对应结果JSON，M3 106/107、M4 10/10、50号1个Windows symlink子项skip；124和122green，唯一失败120成功状态出现后即时dialog.count=1。随后金句同步cleanup修复，同栈取消和实际成功completion微任务中的断开/退出/重开/旧close防护通过，忙态cancel1、成功新增cancel0。旧发布finally只在当前dialog身份匹配时恢复busy；迟到media结果拒绝更新闭合预览，清空fields和图像src。quote模块没有裁图/FileReader，不冒称取消底层媒体RPC网络读取。120/121/137八组/124均exit0，原即时0、guard/CAPTCHA/localpublish/图片断言保留，证据`quote-sync-cleanup-result.json`。
- 新120探针曾误把locator.evaluate的首参DOM当消息ID，造成挂起/诊断失败；这是独立test driver错误，第二参数修正后完整通过，日志记在driverDiagnostics，不算源码bug。124仅授权修同类 `(body,binary)` 参数，使真实PNG bytes进入FileReader，abort1复验通过；反馈生产源保持原冻结hash。
- 根任务已再次核对简约版344文件快照，344/344一致；第一轮65个UI（54+11）为历史，加入通用dialog模块后66个UI（54+12）。备份/副本核对不替代完整回归或原逐功能验收，不以历史105/105标为最终通过。
- 正式原生入口补验使用`headed-native-main`独立合成副本及QA wrapper。旧UI65+main1共66份是历史；根任务在第三轮收尾真实执行verify-native-main，当时结果UI66+main1共67份逐hash一致，GPU compositing/rasterization enabled、crash0/externalOpened0，旧结果保留before-final；OS autostart只record，该阶段外网price/version被QA阻止2次。不把此集成验证当全部功能完成，后续settings fence同步结果见末节。
- 系统为其他Nmap程序弹出的防火墙提示遮挡了当时原生截图，提示未操作；随后可见IAB连接同一个实际内核完成`final-ui-observations.json`：组件按钮交互1次、开关最终未选中、文字为本地组件预览；反馈localPreview可见、cancel后0、重开空白、ESC后0，未公开发布，浏览器错误0。开关名称变化造成工具后置匹配失败，随后DOM确认状态，没有重复切换/源码修正。独立图标交互demo在QA目录用原icons.js、无API/存储，不算UI源文件。此前GPU A/B/九入口和所有测量限制保留。

## 2026-10-13 临时弹窗统一清理与第三全量（历史阶段）

- 新增纯DOM `dialog-lifecycle.js`，每实例安装一次，只包装实例close，不修改原生prototype或导入RPC/存储/宿主API。显式close/ESC同步移除，保留returnValue与已preventDefault的cancel；native close回退、重复dispose/旧事件清理幂等。9处通用临时dialog接入，host令牌管理/诊断再注册各自onClosed；静态appconfirm/public-captcha、业务发送/保存/授权合同不改。
- host令牌两个输入同步清零，忙态close/ESC/cancel保护保留，旧事件不释放新实例；诊断关闭立即abort3个renderer signals，旧桌面结果不更新新实例。140实际文件名`140-disposable-dialog-lifecycle-test.mjs`已入M3 runner，140/125/127真实Chromium全部green。`dialog-integration-result.json`记录61、62-ui-design-system、69/73/80/117单项通过，六个生产文件仅生命周期接入，业务请求/保存/权限映射不改；这个62设计系统文件与后来失败的62-plugin-management-behavior夹具不同。原日志与生命周期JSON保留。
- 原186项逐功能清单继续paused，4完整/90部分/1失败C10/89条件不足/1待测E17/1延期不变；C09/C10及外部条件未关闭。原symlink1skip、全部长帧、启动307.5→418.3ms与GPU最大84.9→109.1ms等负结果、FPS采样限制继续保留，不能宣称规格/所有功能完成或全程满帧，未统一打包安装包。

## 2026-10-13 第三全量夹具失败（历史阶段）

- 第三完整 `npm test` exit1，M3 107/108、M4 10/10，总时长463102.1464ms；日志`final-regression-unified-dialogs-20261013-080812411.log`与同名-result.json保留。runtime186/tests154/docs17逐文件前后diff0，所有文件继续执行，Node skipped0且50号Windows symlink子项skip1。120/124/140完整通过，唯一失败62-plugin-management-behavior：Node DOM夹具移除生产imports后注入旧依赖列表，漏installDisposableDialog导致ReferenceError。生产正确相对import仍在，产品断言不放宽，不能把本轮107/108写成green或混为已通过的62设计系统检查。
- 62夹具最小修复已冻结：接入真实helper及removeEventListener，旧断言逐字保留，仅追加保存后关闭/移除/重复旧关闭检查；runtime186份未变。两组61、两组62、80、140共6/6green，证据`62-harness-fixture-fix-result.json`和`62-harness-validation-20261013-0821-result.json`。测试hash `A37F3F6A29C92EBC0A5B2091A8DC355524F9E0904285607E8460004E2A7069CB`。不把此定向结果改写成第三完整已通过。
- 最终可见证据`final-ui-after-dialogs-observations.json`：记忆cancel0/reopen1/ESC0，未保存。IAB明确重载401，用原已知合成token引导恢复九面板，未读session storage；时间超过30分钟与源码TTL30分钟一致，没有检查具体会话记录，不作确定因果归因。
- `final-visible-preview-evidence.json`错误列表[]；`final-usage-unified-dialogs.png`为实际最终用量页，`final-icon-demo-endfield.png`为QA-only页面真实keyboard focus的会话流水图标，使用原共享icons.js、无server RPC/存储、不计UI源文件。截图静态帧不能证明FPS，138实际有限动画验证及原采样/所有负结果仍保留。

## 2026-10-13 第四全量保存ACK竞争与独立旧读取回退

- 第四全量仍exit1，M3 107/108、M4 10/10、458424.3526ms；`final-regression-fourth-after-harness-20261013-082338227.log`与-result.json、runtime/tests/docs前后diff0及50号symlink子项skip1保留。62/120/124/140通过，唯一109第102行在Save click后立即读backend ui.uikit.mode，bright≠dark；前面的视觉色值正确。这不是select断言。QA监视器曾漏AssertionError格式而误报109通过，已按真实失败及M3计数中文纠正、更新监视器，历史full不能写green。
- 延迟dark POST 3/3稳定复现原断言红：select dark/未保存而backend bright，真实200回执/已保存后backend dark，errors[]。109仅加提前注册matching POST、成功response与已保存三处等待，原mode/paint/remount断言逐字保留，runtime186不改；受控完整流程3/3及109/69/117/122/137定向5/5通过，证据`109-save-ack-delayed-post-result.json`/`109-save-ack-fix-result.json`。137八组是真实模块在Node DOM/RPC夹具下验证，138/140/GPU/IAB另有实际browser证据。
- 独立旧GET诊断确认另一个真实产品UI回退，与第四ACK竞争不能混同：持有bright旧响应，实际dark保存200、dirtyfalse/version1/backendDark后释放，select/base回bright并换节点，paint/backend仍dark、accentTarget回bright槽。`109-old-config-read-diagnostic-result.json`/final.log保留errors[]及生产/原测试hash不变，exit0只是诊断结束、uiReverted=true是产品红。此前driver的隐藏color附加步骤超时不算源码问题；后续误保存未实际执行。
- 额外真实Chromium强制reload/在途ACK交错证明版本单查不足：挂住dark POST，reload确认discardPending后version仍1；GET获取bright200后挂住，POST释放200/accept后base/effectiveDark、dirtyfalse/backendDark，旧GET释放又使base/effectiveBright、backend仍Dark，版本仍1。`109-force-reload-save-ack-diagnostic-result.json`/native.log保留sameVersionBaseReverted=true、轨迹、errors[]及源hash不变。reload本身已重建bright DOM，不能误称释放前selector dark。最初EPERM/自动审批超时独立归环境，单次重试获准后才取得产品红。

## 2026-10-13 设置旧读取保护与第五轮前冻结（历史阶段）

- 设置load记录起始输入version与成功accept回执revision，在merge/discard前拒绝跨新编辑/保存的旧配置。只有已确认force reload跨回执时，在旧读取结束后发起一次受原dirty/focus/reset保护的正常新读取；FormState、保存队列及RPC未变。117保留全部旧代码/断言，两个实际交错红→绿：主旧GET不换当前节点，dark控件/颜色槽/backend/disk正确，后续新权威配置仍进入UI；force同版本最终UI/backend/disk一致，严格darkPOST1/configGET2。
- 117初次新增fresh后置检查超时是driver首参BODY被当期望文字，完整trace证明新reply/base更新与load完成，不能归source loading丢事件。只修新增回调第二参数签名，保留严格fresh条件、全部原断言；无额外pendingflag。`117-stale-read-green.log`、`117-fresh-trace-complete-3.log`及早期QA trace包装错误独立保存。
- `settings-read-fence-final-result.json`记录01:10:09.2195692Z冻结；109/69/117/122/136/137六项exit0，137是Node DOM/RPC夹具。runtime186仅settings/panel.js变化，tests154仅109 ACK等待/117新增回归变化。设置SHA256 `29C5AC4C9D79B06EFFDA259D44007A1301D90C67BE18CD21AF5A195ABB74AB9E`，117 `1745365A341C770BFE1671C82F351F8A2125C0FAE2DB113B4F5534996F545900`。定向6/6不替代第五完整结果。

- 设置修复后的UI66份已同步，verify-native-main确认UI66+main1共67份生产hash精确一致（settings29C5…），GPU compositing/rasterization enabled、crash0/externalOpened0，旧结果另存before-read-fence。简约备份再次344/344；当前UI66=54+12，快照差异文件61份。不以此本地集成核验替代全量/FPS证据。
- `final-read-fence-visible-evidence.json`记录同一实际内核的有头IAB普通操作：light保存“已保存09:12:22”→dark保存“已保存09:12:32”→重新读取dark/配置已读取→用量，browser errors[]；截图`final-settings-read-fence-light.png`/`final-usage-read-fence.png`。受控延迟仍由117独立验证，Nmap防火墙提示未触碰，不混同原生被遮挡截图与IAB证据，不推导帧率。

## 2026-10-13 第五完整回归通过（此前性能阶段冻结源码）

- `final-regression-fifth-20261013-091933478.log`与同名-result.json记录exit0、M3 108/108、M4 10/10，468585.3002ms；北京时间09:19:33.9692004至09:27:22.5545006。M0 9/9、M1 14/14、M2 8/8为嵌套，不能相加。151条实际子进程退出记录含嵌套runner，全部status0、signal/error为空，与每组runner和原始摘要互核；109/117/120/124/138/140实际子退出全部通过。未捕获异常/超时0、文件/Node skip0，50号Windows symlink子项skip1仍保留。
- runtime186/tests154/docs17运行前/后逐文件diff[]、树hash一致；log SHA256 `24D8AD9BA76310F645FE541DAC431FCD547EFBB41C512FDF174FEA939DB26EA4`，child trace `813041598DD95847F05CD41F4973392ECFECB5D0099553C031F567D83714BE0C`。正式全量期间源码/测试/文档未改，本节三docs补写发生在全量结束后，不是运行中修改被测源码。
- 首次第五启动尝试091750903的QA preload Windows路径解析失败，testedFiles0/runnerStartedfalse；仅改QA路径为正斜杠并通过独立preflight后开始上述正式完整执行。首次失败日志/快照仍保存，不能混为产品完整回归；前四轮106/107、106/107、107/108、107/108的真实失败全部保留。
- 全量后再次核验简约备份344/344、UI66=54+12/差异61份、native67逐hash一致，GPU/rasterization enabled、crash0/externalOpened0；有头IAB普通保存/读取和独立controlled117证据保留。原186逐功能验收仍paused、C09/C10/外部条件未关闭，全部负bench/FPS限制不变；本地全量通过不等于所有规格/功能实机完成，不承诺全程满帧，未统一打包安装包。

## 2026-10-13 可收纳侧栏、复杂持续图标与插件增长设计

- 左侧导航新增展开/收起按钮，收起为62px仅图标栏；本地记忆选择，首次<=640px自动紧凑且可手动展开，title/aria-label保留名称。独立于left/right/hidden主题与插件定义，不调用mount、重挂iframe或写全局配置；隐藏主题临时导航仍完整且支持Esc/focus恢复，减少动效时关闭布局过渡。
- 用户明确追加“图标更复杂，聚焦期间持续而非只播放一次”，现共享图标改分层语义细节与浏览器原生循环：会话扫描、聊天信号、记忆数据、柱图、模块、接通、齿轮、社区节点、徽记/存档。原PNG保持不变，仅小SVG细节运动并跟随currentColor；owner4/glyph3/doc8效果24上限、单委托observer、图标rAF0。离开与失焦、后台/hidden/DETAILS/reduced/禁用/移除/pagehide取消；窗口恢复有效可见键盘焦点时续播，CSS隐藏子glyph/wrapper/detail按事件回收。
- 61前端模块、70五尺寸、72实际换色、110隐藏恢复、139刷新合并均通过；136实际独立UI/kernel与137八组Node DOM/RPC夹具、138真实Chromium也通过。138严格检查长hover/keyboard跨周期持续、12语义、8/24上限、去重、主题与CSS隐藏、生命周期、currentColor/opaque、observer1/disconnect1/rAF0/errors[]。证据`icon-continuous-focus-result.json`与`icon-focus-2026-10-13T08-03-21-300Z-0f323f27.json`在原performance-icons目录；本轮未重跑完整108文件，旧full仅为此前冻结源码记录。
- 同一原生合成副本的IAB实际验证收纳/键盘、搜索保留、刷新记忆、360/520窄窗、right预览与hidden完整peek/ESC，再恢复left未保存；窄视口已reset。新最终图标栏62px、用量选中、outer overflow0，图标demo长focus不同transform且失焦none/.72；errors均[]，两个预览保留。实际源UI66+main1共67份hash一致；本轮测试中旧native实例已关闭并在同一合成副本恢复，未使用真实业务数据。新截图/观察在`.qa-local/collapsible-navigation-20261013`。
- 插件增长设计已记录在`docs/theme-color-design.md`：固定常用+有限最近+全部目录的分类/搜索，新页面默认不自动固定；按插件集中设置、高级字段折叠；启用/设置常驻，热更/权限/卸载进更多；后续兼容增可选分类/关键词。纯工具插件目前不长导航。这些是建议，尚未实现，不改变原授权/RPC/opaque iframe和旧插件可用性。
- 原186功能验收继续paused、安装包未打包；原minimal快照及历史失败/negative bench/FPS限制保留。

## 2026-10-13 用户澄清选中页签：简洁放大图标重做

- “焦点”现明确为对应页签被选中，覆盖上一节hover持续/复杂图形要求。恢复最初简洁SVG路径/stroke1.6及两PNG单层alpha蒙版，取消细节叠层；主导航20→28px，图标列28px，vertical padding8后普通按钮仍46px、收纳栏62px。不会因图标变大增加菜单行高；QA-only预览改为真实单选tab，图标56px。
- 当前动画仅DOM选择aria-current=page/aria-selected=true/data-icon-active=true驱动。hover/普通keyboard focus静止，无window blur门控，进入iframe输入仍播当前页；切页停旧播新。hidden/reduced/禁用/CSS/DETAILS/后台暂停，恢复从最新DOM selection续播；移除/pagehide/disposer释放，disposer不改ARIA。owner4/glyph3/doc8效果24、单同时observer/no图标逐帧JS保留，currentColor/opaque/plugin边界不扩。
- 六个定向文件通过：61模块、70五尺寸、72实际换色、110hidden恢复、137八组Node DOM/RPC、重写138真实Chromium。138真实wait3100ms后会话selected原effect仍running、iteration1/currentTime约3134.768；hover其它项/输入焦点/window blur不丢loop，改选后旧idle。12语义/三种信号/嵌套普通动作静止/最新selected可见恢复/24effects与8glyph/CSS子元素/DETAILS/禁用/移除/重装均严格验证，累计observer2/disconnect2（显式dispose重装）、peak1/final0、iconRaf0/errors[]。证据`icon-selection-2026-10-13T08-44-05-819Z-5f7045df.json`、`icon-selected-138-first.log`、`icon-selected-137.log`在performance-icons目录；三源自root同步后未变。
- 实际有头IAB同合成native内核也完成：activeElement=IFRAME搜索输入时sessions matrix/未选memory none；非选skills键盘focus仍none，Sessions继续；切Usage时Sessionsnone/Usage matrix。展开保留搜索值，收纳保持Usage选中，全部nav28×28/button46/rail62/outeroverflow0。demo选Usage再点配色（焦点移开）仍动、未选Sessions静止；SVG/原mask同blue，再恢复暖黑黄绿，附加SVG0。两页errors[]，67源hash一致，预览保留。`visible-evidence.json`及`app-selected-simple.png`、`gallery-selected-simple.png`位于`.qa-local/selected-icons-20261013`。
- 现SDK/设计文档已改选中契约；旧finite/hover记录保留历史。插件增长方案仍只为设计建议。原186清单继续暂停，未全量重跑/打包/FPS承诺，原备份与全部历史失败/测量限制保留。

## 2026-10-13 加强选中图标动作

- 用户反馈不明显，调整plans的幅度/节奏：普通2.2s、峰值35%/归位85%/短休15%，文字2–2.5px、记忆核心.75/opacity.45、三柱.25/.45/.2错开200ms、插针2px，技能/波形/两PNG增强；齿圈3.2s完整转一圈，社区轨道2.4s。图形简洁/导航28/当前选中触发/currentColor/预算/单observer及无图标逐帧JS合同保持。
- 首版137/138通过；试加记忆外壳第二效果后，138第132隐藏内部目标的waitStill超时：仍可见外壳继续运行。原失败final-138.log与source快照/SHA保留在.qa-local/stronger-icons-20261013。恢复单核心效果并加大幅度，原隐藏检查不改；verified-138.log和verified-137.log最终exit0。只适配原周期断言为2000–3400ms，无新增无意义样式测试或全量。
- 有头同合成native内核重载最新源，恢复Memory/收纳；演示页重载并选Settings，点配色移开焦点后仍旋转矩阵，未选Memory静止。Cua不提供document.getAnimations，DOM样式有归位快照，不据此声称实时effect计数；实际持续/清理由138验证。UI66+main1共67源hash一致，截图memory-active.png/settings-rotation-preview.png及元数据在上述目录。SDK/设计说明更新，原186继续paused，未打包/帧率保证。

## 2026-10-13 全套图标用途与暖黑黄绿视觉重设计

- 重画31款共享图标（九入口、操作、品牌、存档和扩展回退），统一24画布/1.65描边/切角/断轨/实心锚点；当前全SVG currentColor，旧PNG无生产消费但保留历史资产。会话执行路线、记忆人物印象、技能精密工具、插件插接模块、设置滑轨、社区扩展发布接收，各轮廓按实际职责区分。16px插件两半静态间隔扩大1单位，导航仍28px。
- 动效改按data-icon-role定位，持续选择规则、数量预算、后台/减少动效/隐藏/卸载清理不改；品牌仅15°小幅转动，无描边越界，没有新增逐帧JS或重滤镜。SDK/createIcon/名称别名/未知回退和插件opaque/RPC/授权边界兼容。原最简备份不改，本轮前图形4文件备份在 `.qa-local/endfield-icon-reset-20261013/before`。
- 61/62/72/137/138五项定向检查exit0；137八组Node夹具，72真实浏览器换色，138完整31+恶意fallback共32场景、169glyph，严格跨周期/隐藏/停止/重装/预算与主题检查保留。补回已删除插件glyph后完整31的stroke/solid fill均blue；24effects/8glyph、observerpeak1/final0、rAF0/errors[]，heldIteration1/currentTime约3140.856ms。72/138前后7源hash不变；result/logs/native68源校验均归本轮QA目录。不复用旧全量通过为本轮全量。
- 同独立实际Electron内核的有头IAB重载，九SVG28、记忆选中、展开最终184/outeroverflow0；图库31项含48/28/16样本，实操焦点移到配色仍selected、blue描边/填充/品牌同步、未选Memorynone、浅/深配色与方向键单选。`.qa-local/endfield-icon-reset-20261013/all-icons-final.png` 为全套最终图。收纳两次几何值捕获在过渡中，记录为瞬时值；一个错误#rail测量选择器和九项批次timeout是QA驱动诊断，不算产品bug/九项选择验收。图库透明顶层画布只在QA生成器修正，旧图保留。
- UI67+main1共68源与原生副本逐hash一致。收尾外部中断后IAB tabs0，原Electron PID98460也不存在；没有为补日志重新启动应用/打开页签。预览静态文件、成功测试与截图保留，当前源hash仍与通过时一致。原186仍paused、未全量重跑或打包、帧率限制及所有历史失败继续保留。

## 2026-10-14 紧凑UI收尾，重新接续有头功能测试

- 普通桌面顶部44px，压缩内置页重复标题；四项就绪状态移到footer，新增成功/未成功8款动态图标，现行白名单39款，currentColor/选择循环/减少动效/预算及插件边界保持。模型已配置不冒称已连通。删除“工作面板 09”，固定徽记、导航46px及footer几何；短屏导航自身滚动、rail clip、收起隐藏滚动条仍允许键盘/滚轮。原生状态dialog支持Enter/Esc与焦点返回，旧close不清除重开的详情。用户插件保留注册title，common紧凑规则只对内置或显式data-layout="compact"生效。
- 首次定向9/10（110失败），最后12项批次11/12、exit1（95轮询未观察到）、sourceStable=true，分别见[首次结果](./.qa-local/compact-workspace-20261013/focused-result.json)和[12项原批次](./.qa-local/compact-workspace-20261013/final-focused-result.json)。110驱动改为目标滚动/fonts.ready/两真实rAF，A/B3/3、1411/1通过，保留原动画，没有pointer门控或移除iframe动效。95改固定测试拦截与真实轮询提交屏障，5×1秒+2×15秒共7/7，独立副本删revision保护仍精准红；[证据](./.qa-local/compact-workspace-20261013/95-final-repair/result.json)。runtime与12项冻结相同，12项有效定向检查已完成，不把原失败批次改写12/12全绿，不与旧108文件全量或186逐功能混计。
- 新建headed-resume-20261014独立合成副本并实际有头复核：展开/收起顶部44、徽记同坐标36px、导航同46、footer同675、无外层横向溢出；[几何](./.qa-local/headed-resume-20261014/evidence/ui-geometry.json)、[四项键盘详情及Esc焦点返回](./.qa-local/headed-resume-20261014/evidence/status-keyboard.json)、[设置分组和筛选恢复](./.qa-local/headed-resume-20261014/evidence/G02-setting-sections.json)与UI jpg已保存。本地副本不触真实数据，未统一打包安装程序，不新增满FPS承诺，历史失败与测量限制均保留。
- 用户明确要求UI修复后继续原测试，2026-10-14重新接续186项有头功能清单。接续基线仍为4完整通过、90部分通过、1失败C10、89条件不足、1待测E17、1延期；94项至少部分实测约50.5%。此处不以UI回归增加功能通过数，后续由新实际操作证据逐项更新。

## 2026-10-14 首批实际有头续测与渠道刷新修复

- 新独立合成副本15667的可见IAB已实际继续原功能清单，30文件初始快照保存在data外侧，真实数据与安装包未动。G02逐个13分区/筛选恢复；G03通过界面新增13981/13982独立Proxy A/B，切换同步qa-chat/qa-vision、合成磁盘元数据一致，本地模型测试成功；G04渠道编辑取消重开保持原值。这些是已有partial行的新子项，真实QQ/商业模型/无模型清空/删渠道等余项不由此完成。
- G04实际发现保存新名后列表与下拉仍旧名，手动读取才更新；真实API/磁盘已正确。诊断稳定复现回复提交时操作按钮焦点被误当作编辑保护，生产仅settings/panel.js三处焦点判断限定真实INPUT/SELECT/TEXTAREA/contenteditable，保留草稿/保存/version/revision/reset合同。117原动作/断言保留，新增真实回复场景先红后绿且真实输入节点/焦点/值不丢；中间新增驱动#field-api-model错误仅改为已有#model。关联69/122/137退出0，137是Node夹具。root同步后实际改名“QA Resume Proxy A 已复测”，无需手动刷新自动出现。诊断/原红/最终绿/截图在 `.qa-local/headed-resume-20261014`；settings哈希BFBCC5C9A6DF1B3F71B9BA75316445CAF74119A712B8F4A51D60D7B5ABD7669F，117为69EDC424820B310B10DCD1CE7E4F27BDBF630E9FAA2AEB81C9011E6D576D01ED。
- E03用户schema实际取消、integer2.5拒绝、非法JSON拒绝、string/number/integer/boolean/enum/object/array保存重开并自有工具读回；secret仅核hasApiKey=true，清除重输/dirty-only未验。E02实际用户信任取消→启用确认→宿主ui.panel允许及确认→自有面板→停用，工具0/面板0；任务/订阅余项未关闭。E09本批仅正向自有脱敏配置，不称本轮攻击验收。完整链接与限定范围见[续测记录](docs/headed-qa-results.md)和[回归证据](docs/headed-qa-regression-evidence.md)。
- 同服务鉴权独立只读诊断bootstrap与两次普通Chromiumreload200/SSE在线，过期/fresh tab/sessionStorage不可用可复现401，源码未改。实际IAB初次至修后跨31分51秒超过30分钟TTL，但无reload前缓存时间，不断言具体IAB失效原因或新产品bug。前述UI原12项批次11/12/exit1及独立补验后12项有效验证是G04修复前源码阶段，之后仅117/69/122/137及实际有头复验，没有新全量结果。
- 186清单状态不改：4通过、90部分通过、1失败C10、89条件不足、1待测E17、1延期。E17两scope撤权重授/旧listing/旧闭包、C09图片发布与C10登录验证码合同、真实外部前提继续保留；不把新子项数换算为整行全部通过。原最简备份、历史负结果和帧率限制保持，未打包。
- 同批后续实际N05既有备注编辑/重读及20002原印象保持，N04印象编辑取消重开原值（证据文件仍沿用误标N06前缀，本批不新增N06群成员列表结论），G11新建/使用模板/删除确认取消后重读角色与模板仍在；均只补子项。新真实合成会话mv75ygm9-7bab64c5从running到finish未回复/0发送，关闭跟随和用户提示词展开保持、当前ID不变，prompt含实际QA_ROLE_RESUME；scrollTop0不当作非零位置证据。首次S12草稿晚于终态，invalid记录保留不计通过。新mv760adm-8f3cbfa6在21:00:54Z尚running的JSON top469/followfalse/有效草稿已记录；60000ms触发超时/多层重试，root21:04:26Z只缩短未来请求至250ms、既有等待仍60秒/模式及工具不变，恢复记录保留。随后真实finish自然于21:05:24.490Z成为noreply，21:05:34Z有头同ID/JSON模式/top469/followfalse保持，弹窗仍开、VALID草稿及勾选完全保持，draftSends0/session sent0。S05/S12指定保留子项通过，不称原60秒单次成功或完整超时用尽验收，整行仍partial。详情与before/after/恢复证据链接见上述两文档，186统计不变。

## 2026-10-14 G07 / G08合成请求子项及统计更新

- G07实际GUI新增两候选/上移排序保存/移除B保存，JSON匹配；主B/qa-fail经真实合成@入站，HTTP三次503后A/qa-chat200，真实会话mv769bak-b882c834为A/calls4/sent0，有头详情与截图已归档。GUI恢复主B/qa-vision/fallback[]。本地故障后降级链实际通过，全部候选耗尽/错误类别/商业模型不扩大关闭。
- G08六参数实际GUI保存0.35/2/5000/on/low/128后合成入站，真实neutral qa-vision请求temperature0.35/HTTP200，mv76bp80-adf15b87实际finish/noreply/0发送；未实证供应商thinking方言和优先级，maxRounds/timeout全部边界未关闭。GUI已恢复原0.8/6/60000/auto/空/0，原值/请求/恢复/有头截图均在本轮evidence。
- root将G07/G08条件不足补部分通过，现186行**4通过、92部分通过、1失败C10、87条件不足、1待测E17、1延期**，已有覆盖/尝试97行=4+92+1，不是97行全通过。上节90部分/89条件是较早冻结点，历史保留；本地合成请求不能替代真实外部前提。详细证据见[续测记录](docs/headed-qa-results.md)、[回归证据](docs/headed-qa-regression-evidence.md)。未改生产/测试、未新全量、未打包，清单由root更新。

## 2026-10-14 G12双向同步修复及实际复验

- G12真实键盘六边界发现档位摘要正确但概率框停旧值（50摘要43%/框0，90/100已4档/框43）。最小生产修复在概率框非聚焦编辑时同步派生值，换算/唯一写入/自动保存/dirty与版本、G04输入helper保持。69原断言保留，新增精准红后完整绿；真实SSE保留概率64草稿/节点，117+137绿/sourceStable，137为Node夹具。settings最新哈希AF88C16847F1D5DA51CB5B6964062E9BA47F461141599F6AABDE98F3319C5111，69为D85A6A8FD6B0BD0DD2F7060B169F38D6A0B383CA5C36BD0DB787E2C299EF0377，117未改。
- root同步/重载后有头六边界：0/10→1档、20→2档/UI概率0，后端低档仍旧合同randomPercent10；50→3档43%、90/100→4档100%。不称所有UI概率等于后端。反向初次fill/Tab未提交change记录保留不计绿/bug；真实数字ArrowUp/ArrowDown再Save后概率50→slider55/3档50%、backend一致。GUI已恢复原100/4档100%，原红/绿/恢复和自动回归证据均在本轮G12目录，未声称新全量或12项又跑。
- G11实际出厂全文应用6225字符与canonical trimEnd逐字一致、管理员rules保留，随后GUI恢复QA模板/rules；只补未截断子项，删除仍取消。E17严格代际测试proposal仅prepared、未applied/未granted/未执行/MCP启动0，四脚本语法及静态边界审计完成；准备材料不算生命周期通过。
- root将G12条件不足→部分通过，当前186行**4通过、93部分通过、1失败C10、86条件不足、1待测E17、1延期**，98行已覆盖/尝试=4+93+1，不是98全部通过。旧92/87及90/89保留各自历史时点，真实外部与余项不扩大关闭；详证见两份有头文档。未打包、真实数据未动。

## 2026-10-14 E16全新配置首次非空保存

- root实际保存前qa-resume-mcp配置节点不存在/无servers；GUI直接填写一个固定本地Echo条目的数组保存，从未先保存[]，重开expected/readback完整一致、长度1，有头截图归档。保存后storedServerCount1，但enabled/loaded/active均false、toolIds[]；未enable/未授proc.exec-mcp.connect/未spawn。只补E16首次非空保存/重读指定子项，不称本批initialize/Echo或E17代际生命周期完成，原proposal仍prepared/未applied/未granted。
- E16原已partial，186统计仍4通过/93部分通过/1失败C10/86条件不足/1待测E17/1延期，98为覆盖/尝试而非98全部通过。新before/readback/inactive证据在本轮evidence，详链见有头两文档；清单说明由root更新，未新全量/打包/真实数据操作。

## 2026-10-14 本轮交接状态

- 实际会话选中/侧栏收起截图ui-final-headed-session.jpg已保存，浏览器Handoff已标记。模型pending0后合成控制恢复normal/delay15000/toolCallnull；主fixture helper41324/Electron22756交接时仍活，控制台15667可接续。
- 原代理helper35532退出、两端口曾连接拒绝，原因未证不算产品bug，旧helper/描述保留。root启动fixed loopback恢复helper50436/session91077，继续13981/13982只转固定15666；最后两代理models200各4，30文件初始快照sha全不变。这里只运行QAhelper，不是MCPgrant；E17 proposal仍prepared/未active。恢复控制/代理描述/最终健康证据在本轮evidence，两有头文档有完整链接。186计数4/93/1/86/1/1不变，末尾未新UI业务修改/全量/打包。

## 2026-10-14 当前合成副本授权后的删除与配置补测

- 用户已答“允许，仅在该合成副本”，当前headed-resume-20261014/fixture/data内渠道、人设、记忆、合成Key删除/清空及固定本地Echo扩展proc.exec/mcp.connect授予、撤销、恢复已获授权；不扩真实数据/公开投稿，原待答状态保留为历史。root先存approved-run-20261014/pre-approved-snapshot.json及业务快照，不重新seed/不覆盖外侧初始30文件。受限Electron FATAL pipe失败后正式权限启动helper50136/Electron48012/session62490，代理54516/session94218保持固定两端口；环境启动约束不计产品断言失败。
- G05实际清B Key→同旧弹窗改名保存后Key不恢复、其它两Key hash与before相同，再实际delete当前B使provider/base/model三个控件空；GUI后选qa-local恢复基线。清后磁盘hash与删后UI/截图已存，删后其它Key独立hash仍待root补，不拿清Key阶段证据代替。G11实际删当前自定义模板、reload后仅factory，当前QA_ROLE_RESUME/rules保留，区别于旧取消；先前factory全文6225核对保持。
- E03清secret后own tool hasApiKeyfalse；主旧modalratio.6仅改greeting与新secret，第二可见tab经GUI只保存ratio.7，再主旧modal保存，toolratio.7/newgreeting/hastrue，证明真实并发下dirty-only未覆盖未改字段，不声称捕获全部HTTP请求体。number-.1 underflow/invalid、labels{}类型拒绝，最后schema停用；secret不输出明文。新增JSON/txt/jpg在approved-run目录，两有头文档完整链接。
- E17 reviewed七文件已只应用inactive clone插件，旧源外侧备份、应用hash记录明确未grant/activate；上一批未applied为旧时点，当前已applied仍无实际MCP阶段/PID/oldlisting/oldclosure结论。记忆slow/error/draft及删除待后续root证据，不将准备/授权记通过。清单统计暂保持186=4通过/93部分/1失败C10/86条件/1待测E17/1延期，98是覆盖/尝试而非98通过；文档代理未动清单/生产/测试/fixtures或GUI/API/服务，未新全量/打包。
- 后续G05独立删后磁盘现已核B对象/Key不存在、其它两Key hash不变、qa-local/qa-chat/15666已恢复；E03磁盘新secretExact/其它字段保持true、ratio.7/newgreeting持久化，均只输出脱敏结果。此前待补为较早时点，不当作当前缺口。
- N07实际单成员group10001/20001整理成功，只该档hash变化/其它五档包括跨聊同QQ不变。N08同一次slow尚整理中1时弹窗输入未提交草稿，完成0后仍同草稿/1dialog，disk marker absent；指定弹窗/草稿保留子项通过，跨聊目前只有before、错误/批量/实际删除待后证，不提前记完成。JSON/txt/jpg与hash delta在approved-run目录，两有头文档已链；统计暂不改，待root行判定。
- N08跨聊补验后已确认before选group10002/整理中1→旧group10001任务完成0，实际正文仍group10002两成员三原事实，没有抢走详情。N07/N08受控单成员503结束显示目标/503明细、计数0/按钮恢复，六档hash全部不变；只是单成员全失败，不扩大多成员部分失败或真实掉线。N05有效disk核20001备注空/20002不变、排除错误解析尝试；显示名不能代替note字段。N04实际两条印象保存刷新→单条保存刷新，marker均读回/旁侧原事实保持；删除待下一批实证，仍不改计数。两有头文档已补上述独立before/after与限定范围。
- N04后续实际delete group10001/20001、整group10002两档清空，刷新及disk证据三目标档不存在/剩三档hash完全保持；UI仍4目录、group10002为0成员0印象，是正常索引不当作未清空。approved-memory-deletions.jpg和before/after/UI JSON已链两文档。N05大小写JSON parser失败独立为invalid-parser原记录，不采其两个null投影；有效核对备注空/旁成员不变。统计待root，未自行改清单。
- N04两个正确确认范围补以root实际CUA AX观察文字归档，非确认框截图；一次跨frame定位无匹配未执行，随后当前列表定位成功。取消历史/单多编辑/实际删除隔离齐全，行判定等root最后统一更新。

## 2026-10-14 E17候选实际四阶段撤权与旧代保护

- 用户已批准范围内，经真实授权UI三scope allow并启用clone候选，真实Node stdio initialize/initialized/tools-list，当前Echo走最终动态ID→ctx.call/宿主registry；原生产factory/helpers提取逐字不改。候选register:false/每代newfactory、DTO门控在真实stdio读后，未覆盖bundled默认setup稳定mcp.tools门面，root最终只判E17 partial，不升整行通过；不是死PID的新回复或外站MCP验收。
- A：proc单独deny使gen1/PID49356停/工具撤回，原工具闭包reject/所有tools-call delta0；重授gen2/serial2/PID7984 Echo成功，旧gen1仍拒且不串新代。B：mcp单独deny使gen2停，重授gen3/serial3/PID24528 Echo成功，旧gen2拒且所有delta0。OS均核旧停/新活。
- C：gen4/PID33996真实listing读后held，撤proc旧停，重授gen5/serial4/PID55796 Echo先成功，再resolve旧DTO，旧connect拒、current/工具serial保持，释放后新Echo仍成功/OS新活旧停。D：gen6/PID38784真实读后held，撤mcp旧停，重授gen7/serial5/PID55076 Echo先成功，再reject旧DTO仅旧代错误，新current/serial/lastError空保持，释放后新Echo仍成功/OS新活旧停。
- 最后UI停用候选/未加载/不可用，OS七Echo PID49356/7984/24528/33996/55796/38784/55076全停，应用Electron48012仍活；没有强杀制造生命周期成功。A首次异步快照抓到旧status，invalid-stale-output独立保留不计绿，最终旧调用文件是真正reject结果；string工具ID相同不作为代际证据，用generation/definitionSerial/PID。静态description“未执行E17候选”是预置文案，不是当前运行状态。全部结果/授权journal/OS/截图在approved-run目录，两有头文档已链接；新统计等root统一提交，未新全量/生产改动/打包。

## 2026-10-14 设置草稿/离页flush、六源下钻与主题子项续测

- G02非法personaByChat JSON阻止自动保存、高级systemPromptOverride草稿在切区/筛选/折叠后保持，disk两marker absent，证明真正未提交状态。G01首轮902ms只能证保存不证防抖前flush；第二次两个真实UI动作整体566ms<700、无Save，disk及回页皆QA_G01_FAST_LEAVE_2，指定离页flush子项通过；旧不足时序记录保留不扩所有保存竞态。
- U03实际日期/模型/聊天/渠道/会话/小时六源各一行，下钻后六by共36次切换及关闭，每组总摘要保持。date早期count=0对隐藏节点误判closedfalse，后isVisiblefalse/关闭按钮不可见有效补核，旧值保留不记bug；峰谷/全部行/真实模型仍余项。E01 ID/name/description三搜索及rescan保持inputValue及单候选结果，另filternull投影不作输入丢失证据，根目录/全部错误未全验。
- K02四styleMode实际宿主/iframe都切换后采样，endfield primary radius0/切7px，前三样本radius4/clipnone；center/right/left预览center/flex-end/normal、gradient on/off两层CSS及真实button背景图同步，最后endfield/left/off。两份invalid跨origin/早读原样排除不记产品失败，checkbox默认valueon不等于checked，当前checkedfalse/gradientoff；截图不证明FPS、15颜色及全部角度/布局仍余项。全部JSON与jpg在approved-run，两文档完整链接；最后统计等root，未新生产改动/全量/打包。

## 2026-10-14 授权续测清单冻结：101项已有覆盖或尝试

- root已实际提交七行状态并严格计数，[原始计数](.qa-local/headed-resume-20261014/evidence/approved-run-20261014/checklist-approved-batch-statuses.json)为186=8通过/92部分通过/1失败C10/84条件不足/0待测/1延期。N04/E03/G11/G02由partial升限定本地through；G05/N08由conditional、E17由pending补partial；其它八行仅补说明。101=8+92+1、54.3%是覆盖/尝试，不是101全部通过或项目完成率，旧冻结历史保留。
- E17只覆盖原factory候选/真实stdio/DTO门控，bundled稳定mcp.tools/同factory替换未闭；N08混合多成员部分失败、真实模型和G05商业M前提、C10既有认证验证码合同失败保持，84条件和安装包延期不被合成通过消除。本授权批没有新生产修复/全量/打包，root正在做最终源/快照/授权/进程交接核对，等待最后证据。
- 两有头文档标题日期现扩至10-14，开头最新冻结摘要与历史批次分开；原生窗口、可见IAB和自动化层级明确，未将Electron PID当原生窗口证据。文档代理只三文档/静态核对，未动清单/生产/测试/fixtures或GUI/API/服务。

## 2026-10-14 授权批最终交接只读核对

- [最终核对](.qa-local/headed-resume-20261014/evidence/approved-run-20261014/final-approved-verification.json)已完成：原30/批准前37外侧备份hash全部不变，生产UI67与clone逐hash一致，另electron/main独立同hash，共68入口/UI一致；settings/69/117保持上轮冻结，reviewed候选七文件全同。第一仅UI版单独保留，不把后来补核内容伪写进旧记录。
- QA schema/MCP全disabled/unloaded/inactive/unavailable/toolIds[]，MCP三scope恢复allow且同审核指纹fc082…，七Echo子PID独立OS核全退出。GUI恢复QA小鲸鱼/qa-local/qa-chat/空高级覆盖，fake normal/15000/null；专属helper50136/Electron48012/proxy54516/session62490/94218/console15667保留接续，不称全部临时进程已退。
- [最终收展开对齐](.qa-local/headed-resume-20261014/evidence/approved-run-20261014/final-shell-collapse-expand-alignment.json)九nav46高/y逐项全同，brand36×36/x12.5/y22两态与再展开一致；final-shell-expanded/collapsed.jpg和可见tab保留。最新186=8通过/92partial/1失败C10/84条件/0待测/1延期，101覆盖/尝试54.3%保持；静态截图不证明FPS，未新全量/生产修复/打包/公开操作，所有历史负结果保留。
- [当前handoff](.qa-local/headed-resume-20261014/handoff.json)已同步用户本轮授权receivedtrue/approvalPendingnull、101覆盖/8完整通过、两QA停用/allow恢复/正常fixture/PID及session，实际IAB tab1/browser2会话/展开侧栏已标Deliverable。旧pending handoff另存approved-run/handoff-before-approved-batch.json，user-authorization-received.json独立记录确切scope；不扩真实数据/公开投稿或当前clone会话与聊天删除，旧pending不再作为重复批准原因。

## 2026-10-14 用户“修复吧”：认证、记忆备注与合同解释修正

- 本轮新增本地源码修复；上一批186=8通过/92部分/1失败C10/84条件/0待测/1延期是此前冻结，不先改新判定。继续合成测试，无打包/公开投稿/真实登录注册或验证码作答；metadata143、完整runner及可见复验由root推进，不把条件不足全部当bug。
- 142[原诊断](.qa-local/142-auth-before-with-counts.log)authPosts1/hostCaptchaStarts0后超时；[修后](.qa-local/142-auth-after.log)headless真实shell/opaque iframe/kernel与离线SDK通过取消/迟到回调、失败/空proof不认证、一次成功、密码新草稿保留、注册确认取消、离页及跨面板/直接POST拒绝。144客户端红16/31 exit1→绿47/0 exit0，合法token/account才保存、非法输入/异常响应失败不改凭据、错误密码/token脱敏；38的27/0、85/127相关绿，127初次环境spawn EPERM保留：[验证与hash](.qa-local/repair-market-auth-20261014/repair-validation.json)。不据离线proof关闭C10整行。
- N05真实记忆段忽略即时memberNotes已修：memory.js每次取当前备注；consolidator只用displayName给模型/错误显示，持久name保留，新建取真实senderName，不猜测还原历史已丢失原名。145红17/9 exit1→绿26/0 exit0；[验证与hash](.qa-local/repair-memory-notes-20261014/verification.json)含13的32/0、35的12/0、82的34/0、65/M4相关通过。未操作liveclone，root后续可见复验。
- 官方市场[只读GET](.qa-local/repair-market-auth-20261014/official-contract.json)04:01:49Z/200/未认证未提交确认doAuth仅loginId/password、注册加displayName、CAPTCHA用于doUpload；宿主本地门控不新增远端proof字段。金句[只读GET](.qa-local/repair-market-auth-20261014/official-holyshits-get.json)04:03:34Z/200/未认证未提交，原HTML仍476显示media[].url、683投稿media:[]、704仅nickname/messages/captchaVerifyParam，无可信图片写合同。C09含图/引用来自QA增强，SPEC F221/notes10无图片写schema明文；保留功能缺口并纠正历史较强解释。K02渐变角度也是QA/主题增强，原规格无明文，不把固定90度独立记作原spec失败。
- 三文档仅汇总已执行自动/只读证据及限制，不动checklist或真实数据；新可见操作、metadata143和完整runner等root后证，不提前写通过或完成率。

## 2026-10-14 修复批可见离线复验与首批完整回归

- root已在原批准dataDir、新生产kernel/可见IAB补验，[live](.qa-local/headed-resume-20261014/evidence/repair-run-20261014/live.json)helper42564/console15667/未seed、明确无Electron-IPC实测；仅root HTML离线SDK、缺entry manifest候选和市场合成响应三偏差。E01实际错误1、absent.js原因、未加载/启用/不可用、version1.0.0与真实dir，rescan后details仍开/正文保持；JSON/jpg存repair-run。
- C10可见离线SDK实际cancel/fail/invalid零请求；延迟10秒认证期间输入新密码，成功后仍非空，CUA隐藏敏感值，精确新草稿等值仅142自动断言。invalid-secret-inspection独立保留排除，不记产品密码丢失。受控错误密码/token[已隐藏]、异常token拒且account hash保持；实际register cancel/confirm完成本地合成注册。offline-auth-state仅三次loginId/password与一次加displayName，没有proof字段，全部端点离线；本地消费者已补，不证明官方auth服务器验证proof或真实阿里成功，C10不升整行through，状态等root。
- N05新20003原名/备注A→实际编辑B，[真实模型记忆段](.qa-local/headed-resume-20261014/evidence/repair-run-20261014/N05-actual-note-B-model-prompt.json)用B/oldA absent/name原名；实际指定整理2→1且name原名，清备注UI回退原名，[另一实际请求](.qa-local/headed-resume-20261014/evidence/repair-run-20261014/N05-actual-cleared-note-model-prompt.json)原名/oldNotesAbsent/nameOriginal全true。模型是本地qa-chat/HTTP200，不扩真实商业M或旧丢失原名猜测恢复。两文档已链接各阶段JSON/jpg。
- 首批[完整runner](.qa-local/repair-suite-20261014.log)M3 111/113、M4 10/10、exit1，142–145在内通过；143真实loader→HTTP两kind目录/description、重扫/activation、settings掩码，以及共享renderer/两面板合成DOM诊断/状态/展开。80目录误用ID语义源问题已分离，driver完成新增离线CAPTCHA后再原账号断言，独立绿且原断言保持；109旧readiness-heading选择器TypeError仅driver修真实readiness-name/rail，对比度4.5、其它paint/icon/root/body/真实POSTack全部保持/主题源不改，[manifest](.qa-local/repair-market-auth-20261014/109-validation.json)保留原诊断及独立绿。
- 第二完整runner session67075/repair-suite-second运行中，最终状态/新186统计等root，不提前写全量绿；E01本地明列条件已补齐，C10真实阿里/auth-server验证仍余项，无打包/公开操作/FPS结论，三文档未改checklist。

## 2026-10-14 第二完整回归完成：113/113与10/10

- [第二执行记录](.qa-local/repair-suite-second-20261014-result.json)start04:29:37.9342884Z/end04:37:59.8591725Z、session67075、exit0；[原日志](.qa-local/repair-suite-second-20261014.log#L3565)实际3565行M3 113/113、3603行M4 10/10。上节running是旧时点，现已结束。首批111/113+10/10 exit1原日志保留，不聚合抹掉失败。
- 80是真实extension-id/路径语义源修+认证driver先完成新离线CAPTCHA再原断言；109仅旧readiness-heading选择器driver改真实readiness-name/rail，主题生产源不变、对比度4.5/其它paint/icon/root/body/真实POSTack均保持。两个故障性质与原红/独立绿分别保留。
- 113+10自动文件不能替代186功能；E01限定L/X通过、C10 partial及目标统计以root实际提交为准，当前等待最后audit/清单记录。无真实验证码作答/外站发布/打包/FPS结论，三文档不改checklist。

## 2026-10-14 本轮修复最终冻结与交接

- root实际[严格计数](.qa-local/headed-resume-20261014/evidence/repair-run-20261014/repair-checklist-counts.json)已提交186=9通过/92部分/0失败/84条件不足/0待测/1延期；E01限定本地L/X通过，C10本地登录消费者修复后转partial，真实阿里/认证场景/server proof验证/原生Electron仍余项。N05只补可靠新原名回退/实际模型请求子项，未额外升级。101=9+92/54.3%是覆盖或尝试，9限定完整通过；113+10自动文件不替代186功能。上一批8/92/1C10/84/0/1与首批111/113+10/10 exit1历史保留。
- [最终核对](.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-repair-verification.json)04:44:49Z全assert绿：30/37/38三快照hash均不变，src56/bundled50/electron3全同；UI68中67同、唯一index.html显式离线SDK注入+额外shim，allUiCloneMatchesfalse明确保留，不称全UI相同或Electron实测。既有3成员档案/20002全局备注保持，新20003原名/1印象/清备注；accountCount0，market/Schema/MCP停用工具0，MCP三scopeallow同审核指纹、7Echo全退出。
- 诊断manifest移副本外侧保留，最终12插件/加载7/错误0，Schema停用且目录可见：[健康目录](.qa-local/headed-resume-20261014/evidence/repair-run-20261014/E01-final-healthy-plugin-directory.jpg)、[最终画面](.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-repair-visible.jpg)/[正文](.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-repair-visible.txt)。helper42564/proxy54516及session87811/94218保留，旧50136/48012已退出/currentElectronPidnull；对端normal/15000/null、authok/0，恢复QA小鲸鱼/qa-local/qa-chat/空高级覆盖，不称全部辅助进程清理。
- [独立readonly review](.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-readonly-review.json)核113唯一各一次heading/完整exit0及所审认证/80/109无阻断；143/145确认来自完整log，不扩大为全项目独立源码审计。[当前handoff](.qa-local/headed-resume-20261014/handoff.json)已更新，旧修复前版另归档，明确合成范围/无当前Electron。旧失败、CUA无效敏感投影、C09图片写合同及真实外部条件保留，无真实验证码作答/公开发布/安装包/FPS结论。
- [metadata追加独立只读review](.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-extension-readonly-review.json)核loader→DTO→renderer、身份/目录语义、错误汇总/已测诊断规则和未知iframe/RPC边界，无阻断，无新行为测试或源码/现场修改；[最终文档/冻结源audit](.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-repair-doc-links-audit.json)保存引用全存在、25源码测试hash稳定、限定scope diff-check绿与清单9/92/0/84/0/1，root在最终三文档落盘后重核doc hash。沙盒Git受限、正常权限只读复验exit0分开，不计产品失败。

## 2026-10-14 develop源码授权后的新一批补缺：定向已收，整批待复验

- 用户明确允许参考旧develop必要源码，覆盖此前禁读旧源约束；价格/安装/迁移/金句源只读，没有读取develop/data、community.key、debug.log、真实登录配置/账号/令牌，未执行旧安装器。上一冻结点186=9通过/92部分/0失败/84条件/0待测/1延期、101覆盖54.3%，M3 113/113+M4 10/10及首批111/113+10/10 exit1保留。新四文件定向绿不能提前写成新117+10全量或186整体验收。
- 价格[146验证](.qa-local/develop-gap-closure-20261014/price/validation.json)初红14/25、外源缓存红43/1→最终46/0 exit0；[140条快照](.qa-local/develop-gap-closure-20261014/price/builtin-source.json)版本develop-v0.4-20261014-f605221cca8b，明确历史，不冒充当前报价。custom/cache-remote/builtin/manual优先级与统一匹配、非法和外源缓存、明确零价及全局cache未设置零修复；合成历史成本29不重算，新调用281/HTTP总310。33/39/36/106及83最终均绿，83初全局零语义失败/原断言保留，不记真实账单或供应商验收。
- 图片本地写参考由已授权develop/ui/app/10-feedback.js:778–840的media[].dataUrl补齐，保留此前官方GET仅能见url的历史不足。[149原红](.qa-local/develop-gap-closure-20261014/quote-before.log)拒图片→[149最终绿](.qa-local/develop-gap-closure-20261014/quote-final-limits-after.log)，[120正常权限headless绿](.qa-local/develop-gap-closure-20261014/quote-browser-normal-permissions.log)精确像素/坏图显式移除/proof与媒体边界/取消清理；初120浏览器spawn EPERM单留不计产品bug。原ID/URL/file隔离，50消息/9图/累计1MiB/body2MiB；官网投稿、真实阿里和远端保存未验。
- 宿主preflight[原探针](.qa-local/develop-gap-closure-20261014/quote-preflight-readonly-probe.json)确证取消未传GET signal、controllerheld/retry409；[新helper最终探针](.qa-local/develop-gap-closure-20261014/quote-preflight-final-readonly-probe.json)旧GET未回即允许retry并真实新链路GET/POST、starts1。[只读review](.qa-local/develop-gap-closure-20261014/quote-readonly-review.json)无所审阻断，120早于最后helper提取，由149/探针补该层，不冒充最新全浏览器绿/新slow-media有头case。root新完整117+10及可见独立副本尚待实际结果；本代理此阶段只三文档/只读核证，不改checklist/源码/test、不操作GUI/API/服务，无公开发布/验证码作答/安装包。

## 2026-10-14 新完整117+10与独立可见图片/价格补验完成

- 前节“待完整/可见”现为历史。[执行记录](.qa-local/develop-gap-closure-20261014/full-regression-result.json)06:06:09.9283745Z→06:14:56.7891271Z、exit0；[完整日志](.qa-local/develop-gap-closure-20261014/full-regression.log#L3662)实际3662行M3 117/117、3700行M4 10/10，14646/0、148155/0、147严格版/149最后helper均通过。旧113+10、首111/113+10/10 exit1及新批各原红/EPERM保留，不把自动文件数算186功能全部通过。
- root[新独立副本](.qa-local/develop-gap-closure-20261014/headed-evidence/live.json)PROFILE99/headed/app/data、helper48600/console15867，production kernel+可见IAB；HTML显式离线SDK/固定投稿合成accept、无Electron wrapper。实际选图片15预览288×144checker，[截图](.qa-local/develop-gap-closure-20261014/headed-evidence/quote-image-preview.jpg)→离线模拟通过→[已提交](.qa-local/develop-gap-closure-20261014/headed-evidence/quote-image-accepted.jpg)。[形状/hash核对](.qa-local/develop-gap-closure-20261014/headed-evidence/quote-image-accepted-shape-and-hash.json)仅1请求、753bytes/SHA ed482f…72a6ef与预览一致、url/file空、noSourceCoordinatestrue；[合成记录](.qa-local/develop-gap-closure-20261014/headed-evidence/synthetic-publications.json)只1条，没有真实外网POST/官网存储接受或真实阿里。
- 坏图16实际decode失败，[blocked截图](.qa-local/develop-gap-closure-20261014/headed-evidence/quote-corrupt-blocked.jpg)提交disabled；实际显式[移除后正文](.qa-local/develop-gap-closure-20261014/headed-evidence/quote-corrupt-explicitly-removed.txt)文字保持/素材已移除/0图/提交可用，然后取消，无新增POST；不把未发布的第二正文记成功。价格[可见投影](.qa-local/develop-gap-closure-20261014/headed-evidence/price-visible-projection.json)/[截图](.qa-local/develop-gap-closure-20261014/headed-evidence/price-visible.jpg)current qa-chat custom1/2/.1、142=140builtin+2custom，历史来源/版本/未核当前提示；remote sourcebuiltin/fetchedAt0，非当前官网价或实际账单。
- 上一清单冻结186=9/92/0/84/0/1、101覆盖54.3%继续保留历史；root将提交最后源/快照audit、清单说明及批次设计记录，待落盘再链。真实QQ安装/免扫码、真实验证码/商业模型/社区服务器存储尚未测，无新Electron/IPC/安装包/公开发布/FPS结论；本代理只三文档/只读证据，未改生产或操作GUI/API/现场。
- 141就绪栏真实浏览器[原红](.qa-local/develop-gap-closure-20261014/readiness-lock-before.log)为running但版本失败仍显示成功，failure state/Timeout保留；消费者修后[绿](.qa-local/develop-gap-closure-20261014/readiness-lock-after.log)原geometry/readiness/details/小视口断言均在，未真启动不合格QQ。它是headless层，完整117在[06:06:09source-freeze](.qa-local/develop-gap-closure-20261014/source-freeze.json)后也已覆盖；不把真实语义红改写为环境异常。

## 2026-10-14 develop参考补缺批最终冻结与交接

- [最终核对](.qa-local/develop-gap-closure-20261014/final-verification.json)06:24:40Z核198生产/测试冻结指纹全部不变，5主要旧源审核指纹不变（不是只读源总数5）；clone src58/bundled51/electron3/scriptslib3全匹配，UI69/68唯一index离线SDK注入+额外shim，不称全UI相同/Electron实测。旧30/37/38快照文件及元数据hash全部保持、旧源未改/真实凭据未读，117+10完整日志/exit0/hash与原记录一致。
- 合成POST最终只1条、753bytes/hash匹配，无源坐标/url/file，坏图阻止/显式移除/取消无新增。fresh fixture省略toolCall、account文件不存在是正确缺省状态，先前沿用旧fixture字段/文件假设的审核失败已修正投影，无产品或tests修改；normal/15000/未设tool、market/telemetry停用/accountCount0/qa-local/qa-chat。不假称官网存储接受或真实验证码验证。
- [最终统计](.qa-local/develop-gap-closure-20261014/checklist-counts.json)仍186=9通过/92部分/0失败/84条件不足/0待测/1延期，101覆盖/尝试54.3%，不是101通过；本批补实现/说明不抬真实环境通过。旧9/92冻结、113+10及先111/113+10/10 exit1和各定向红/EPERM保留。117/117与10/10自动文件分别记录，不替代186功能；真实安装/免扫码/QQ与商业模型长跑/阿里/官网存储仍余项，无新Electron/IPC/公开发布/安装包/FPS结论。
- [当前handoff](.qa-local/develop-gap-closure-20261014/handoff.json)helper48600/session8539/PROFILE99/console15867保留审阅，旧42564/proxy54516仍运行，前一headed-resume handoff保留，不称所有helper退出。[批次设计与边界](docs/develop-reference-gap-closure.md)已落盘；三文档最终引用由本代理只读核验，未改清单/源码/test或操作现场。
- [最终独立source只读review](.qa-local/develop-gap-closure-20261014/final-source-readonly-audit.json)198/198+5/5指纹、184应同clone含setup逐字一致，已知HTML/shim和QA工具省略分别记录；117M3 headings每个恰1次、117/117+10/10真实全绿。四补缺没有新增插件旁路，只审该范围，不扩大整个插件规格或全仓库198文件；[两次审核假设修正](.qa-local/develop-gap-closure-20261014/final-audit-harness-corrections.json)toolCall缺省/account不存在独立保留，无生产/test改动。root最终回合成群聊天、选0/金句模式关/无验证弹窗，[最终画面](.qa-local/develop-gap-closure-20261014/headed-evidence/final-visible-chat.jpg)已归档供审阅。


## 2026-10-15 全功能续批当前进度

186行逐行重数：**10通过、96部分通过、2失败、77条件不足、0待测、1延期**。通过或部分通过106行（57.0%）；连同两失败行，已实际尝试108行（58.1%）。10行只表示各自明示范围全部完成，不代表106或108行全通过。P01/P06对应同一个真实QQ隔离缺口的两条规格。

E06按已认可的本地合成类别升级通过，11包实际安装/拒绝证据已齐；范围限合法flat/wrapped与已列七类异常，不代表任意插件、权限、口令市场安全通过。H07/G16/G24/P08/E07补部分，P01/P06因同一真实QQ子进程隔离缺口记两失败行；已安装QQ文件/版本/签名不等于可安全独立登录，guard只阻止再启动，

修后可见IAB已实测A16 cancel/Escape返回TEXTAREA焦点且保草稿未import、工具false→true保存同页reason更新，以及S04双工具和OLD→FRESH同ID标题与实际batch一致。新S04 2HTTP200、echo/error/finish及usage458/Oct15 ledger/telemetry匹配；只有OLDwaiting和终态实拍，不冒充单独running截图。原BODY focus红、旧S04整体false、重复错误前缀与所有observer修正保留。当前72188以原PROFILE99/合成data正常restart-only、stale锁仅备份由kernel回收；正常第二实例73664拒绝后消失并恢复现有可见桌面窗口，未手删锁/改OS安全/sandbox。

第7完整自动回归 **M3 122/122＋M4 10/10，两exit0**，366全源码/测试/package/lock指纹稳定。第6轮真实121/122/exit1保留，唯一test83跨午夜fixture只改测试后重跑，不称生产计账故障修复。完整自动文件数不代替186功能。[最新结果](docs/headed-qa-results.md)、[逐项清单](docs/headed-qa-checklist.md)、[回归及冻结](docs/headed-qa-regression-evidence.md)已更新。

新真实六小时在2026-10-14T17:16:41.904Z约337min仍running/complete=false/passed=null，预计北京时间01:39:41结束；运行已跨午夜，最终计账/收尾和退出锁释放待审。其冻结copy未加载之后全部QQguard/UI/标题/settings修复，不代表最新全UI长跑或满帧率。背景选择/格式/取消引用本轮补验仍未记通过，真实QQ/商业模型/社区与验证码条件仍余项；安装包继续延期，未打包。

[本轮四文档完整备份](.qa-local/all-acceptance-20261014/evidence/formal-doc-integration/2026-10-14T17-08-23-180Z-e8cd291b/backup-manifest.json)保存更新前全字节及186行旧9/92/0/84/0/1；本次只写四份文档和外侧证据，不改产品/测试/QA配置或操作UI/网络。


## 2026-10-15 背景子项与新通知缺陷（2026-10-14T17:26:36.857Z补记）

此前背景“尚待补”及R7源稳定说明属于前一执行时点。root随后已实际选文件完成[PNG](.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-native-png-after-20261014T165631598911Z.json)、[JPEG](.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-independent-jpeg-after-20261014T170421154631Z.json)、[GIF](.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-independent-gif-after-20261014T170851703084Z.json)、[WebP](.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-native-webp-after-20261014T171337234463Z.json)四格式；原生AX操作记录与独立磁盘投影联合支持真实上传，均精确匹配合成fixture字节/格式、生成本地引用、每次只有一新文件且已有背景文件保持。projection本身是disk-only，不单独当GUI或HTTP MIME验收。JPEG阶段缺其他scheme独立before，不扩称每个scheme都逐字未变。

干净可见IAB的[GIF九帧独立像素证据](.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/K03-gif-playback-independent-pixel-verification-20261014T171646397696Z.json)观察4.413秒、六次左右转换、三个往返完整循环，证采样时预览确实循环。采样manifest没有逐帧DOM src，关联来自已保存GIF与root当时未输入的上下文；分析时已换WebP，所以不是当前仍显示GIF。没有FPS、宿主背景播放、所有GIF解码或无限循环保证。[非法图不保存](.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-native-invalid-after-20261014T171455795692Z.json)实际错误瞬间由root看到，独立磁盘引用/库存保持；稍后settled AX已被错误清空，不能当原错误截图。[超8MB AX](.qa-local/all-acceptance-20261014/evidence/K03-native-oversize-feedback-ax.txt)有“图片不能超过8MB”，最终磁盘after由root另核，当前不扩大拒绝全流程写入结论。

这次实际测试发现新的性能/反馈缺陷：[通知状态分析](.qa-local/all-acceptance-20261014/evidence/two-tool-headed-independent-effective-day/K03-status-feedback-sticky-notification-analysis.json)显示真正configUpdated SSE把flag持久缓存进runtimeStatus，之后默认15秒普通status poll重新播出历史flag，使设置面板反复读取7端点并用“配置已读取（脱敏）”清掉上传失败反馈。source流与root现场支持缺陷；缺少对那次稍后精确event的trace，settled AX只证后来清空，初始覆盖私人桌面的屏幕没有作为本地截图归档。root已授权对 **ui/shell/app.js 与 test/95-shell-runtime-controls-test.mjs** 作最小修复/有意义红绿回归，同final95旧源红→修后绿已完成，但关联定向、完整R8与修后现场验收尚未完成，不提前写整批通过。

R7 122/122＋10/10及完整366冻结仍是修此新问题之前的真实历史绿，R6失败和R7冻结原artifact保留。当前新95/app源码改动必须作为另一个版本比较，不能继续说当前源码等同R7或R7已覆盖此次新修；最终整合audit只容许root已明确授权的这两个source差异，其余源仍核指纹。K03整行保持部分，四角裁剪/旋转/modes还在实操、K04取消引用尚未完成；本段不预填通过。六小时同样仍按其独立final处理，本轮不打包。

新增定向结果（17:25:55Z完成）：[95同final旧源红](.qa-local/all-acceptance-20261014/evidence/status-notification-repair-round8-2026-10-14T17-21-35-123Z-83a7fb2d/red-95-final-driver-result.json)exit1、[修后绿](.qa-local/all-acceptance-20261014/evidence/status-notification-repair-round8-2026-10-14T17-21-35-123Z-83a7fb2d/green-95-result.json)exit0，测试SHA393ffc4619d1b749883cecce4e300507d436cc3eac4f89208d54862d5b6c72e2两次相同；生产app仅注释与delete next.configUpdated，保留真实SSE通知刷新，普通poll不重播历史flag。两真实configPOST各触发一次refresh、普通两poll配置读增量0、上传错误保留，以及原pause/latepoll断言通过。初次red在readiness装饰动画定位超时、未到新分支，原日志留存；driver按既有141惯例设reducedMotion后才得到上述samefinal产品红/绿，不修改readiness生产源。修后app SHA1378bd6750397584dead3fd85741161b60e7f6c462980acc6fdf7d80b97cc687。关联定向和完整R8仍待，当前运行QA尚未据此证明修后有头通过；R7保持历史绿，当前source只允许这两个已知授权差异。


## 2026-10-15 背景、真实六小时和第8轮最新实际结果

本节为本次已执行增量。第8轮真实失败与所有历史red保留；正常重启和第9轮完整结果尚待后续实际证据，不提前记通过。

[第8轮原final](.qa-local/all-acceptance-20261014/evidence/full-regression-round8-2026-10-14T17-35-05-058Z-6fcff3e1/final-verification.json)实际17:35:05.340Z→17:49:22.436Z，M3 **121/122 exit1**、M4 **10/10 exit0**、overallfalse。366 source before/after tree同f271dd00c7eefbbbfc50befd0c117a8836dd989787e5d7a382d63eb3fede796b，0changed/added/removed，94/R6/R7 history guards保持。唯一80旧指定清除按钮预期0实际1发生在后端pin已undefined而前端await PUT后再GET capabilities/提交DOM之前，属于正在核查的UI完成等待竞态；只补测试等待最终detached、保留全部strict断言是另一个版本，不改生产也不覆盖本次false。不能将定向green、136本轮full各casegreen或R9启动当完整green。[通知修复定向](.qa-local/all-acceptance-20261014/evidence/status-notification-repair-round8-2026-10-14T17-21-35-123Z-83a7fb2d/targeted-final-verification.json)95与7相关最终绿，136首一次真实失败与同源/同test hash重跑green并存、原因未证明。

### K03/K04 背景实操与边界

[PNG](.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-native-png-after-20261014T165631598911Z.json)、[JPEG](.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-independent-jpeg-after-20261014T170421154631Z.json)、[GIF](.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-independent-gif-after-20261014T170851703084Z.json)、[WebP](.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-native-webp-after-20261014T171337234463Z.json)四次实际原生选择上传配合各阶段AX和disk-only投影，生成本地引用及精确fixture字节/解码格式，已有文件保持。[GIF九帧](.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/K03-gif-playback-independent-pixel-verification-20261014T171646397696Z.json)干净IAB像素4.413秒/六转换/三完整往返，只证采样预览，不证FPS/宿主无限动画/所有GIF。

四角NW→NE→SW→SE，初100%依次83→67→55→45，[NW](.qa-local/all-acceptance-20261014/evidence/K03-crop-nw-settled-ax.txt)、[NE](.qa-local/all-acceptance-20261014/evidence/K03-crop-ne-settled-ax.txt)、[SW](.qa-local/all-acceptance-20261014/evidence/K03-crop-sw-settled-ax.txt)、[SE](.qa-local/all-acceptance-20261014/evidence/K03-crop-se-settled-ax.txt)settled AX每段都有16:9文字和正确bg-zoom；root实际拖动四角，文字声明不代替独立像素aspect不变量测试。[move](.qa-local/all-acceptance-20261014/evidence/K03-crop-move-settled-ax.txt)显示x7/y6，[knob](.qa-local/all-acceptance-20261014/evidence/K03-crop-rotate-settled-ax.txt)显示137°；[磁盘存盘](.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-native-crop-saved-20261014T172440895912Z.json)为137/zoom0.44510035419126326/offset6.90672963400236、5.9184611344537785，[IAB reload controls](.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/K03-crop-browser-after-reload.json)137/45/7/6精确对应rounded展示，截图同时有预览和宿主背景。后续slider改rotate45、opacity.24/blur6/fitrepeat由[清除前已存盘](.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K04-before-clear-20261014T173435746804Z.json)和[可见controls](.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/K04-clear-ui.txt)支持；range-input-proof只证min/max，不单独当用户动作。

[非法图磁盘保持](.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-native-invalid-after-20261014T171455795692Z.json)原root瞬间错误随后被sticky通知覆盖，settled AX不是初始error。[oversize错误](.qa-local/all-acceptance-20261014/evidence/K03-native-oversize-feedback-ax.txt)确有“图片不能超过8MB”；[延迟after](.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-native-after-oversize-delayed-20261014T172654468125Z.json)与before同bgImage及四文件库存/hash，但期间有crop/旋转，不能说全部bg参数或配置字节未变，也不推无HTTP。修后[原生错误持久](.qa-local/all-acceptance-20261014/evidence/K03-fixed-invalid-feedback-persistence.json)17:58:15.979→17:59:02.946Z **46.967秒**同上传失败文本保留，无中间save/reload；网络两poll由95单独证明，不推原生每poll count。[修后5磁盘checks](.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-fixed-native-after-invalid-20261014T175911430853Z.json)bgImage仍空/参数与其他scheme/四文件保持。首次文件名漏前缀弹Windows找不到文件属于定位无效尝试，随后正确79Bfixture进入程序的拒绝才计该case。

K04 [after清引用](.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K04-after-clear-20261014T173635268190Z.json)证明**bgImage=''已存盘**，rotate45/zoom0.4451/offset6.9067、5.9184/fitrepeat/opacity.24/blur6保留、其他scheme及四文件SHA/库存全保持，清的是引用，不删除磁盘图。[IAB空态](.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/K04-clear-ui.txt)尚未选择背景图；K04-clear-browser.jpg头栏仍有未保存改动，单图只证即时空态/controls，保存以较后disk独立证据为准。[native Ctrl+r后AX](.qa-local/all-acceptance-20261014/evidence/K04-native-clear-after-refresh-ax.txt)与[refresh后7磁盘checks](.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K04-native-clear-after-refresh-20261014T180135808401Z.json)现已补齐：AX是会话页11/SSE连接，不是设置空态文字，root另观察宿主背景为空；空引用/其余参数/四文件及其他scheme由磁盘证明。没有归档覆盖无关桌面内容的原生截图，不把IAB图当native。正常close/restart尚待，不预填重启保持。

### Z05 真实六小时：子场景已完成

[final](.qa-local/all-acceptance-20261014/soak-restart-20261014/final.json)11:39:41.378Z→17:39:50.017Z，北京10/14 19:39→10/15 01:39真实跨午夜，monotonic21600396.515ms、362采样、actualSixHours/complete/passed=true，13driver checks true/errors0。[独立最终10checks](.qa-local/all-acceptance-20261014/soak-restart-20261014/independent-final-verification-20261014T174422Z.json)owner63776消失、16166/67/68释放、lock自然消失、lifecycleexit0，四收尾<20s、timer/handles0；[工具clock独立补证](.qa-local/all-acceptance-20261014/soak-restart-20261014/independent-final-clock-link-20261014T174549Z.json)记录17:44:21实际工具时钟，先前null记录保持原样。189源clone全hash保持，较新15份生产差异未被此长跑加载；不含hotReload、真实Q/M/C、nativeGUI/FPS或最新全修复。

[额外提醒及发送一一核对](.qa-local/all-acceptance-20261014/soak-restart-20261014/independent-seeded-reminder-send-accounting-20261014T175017Z.json)9checks全true：360注入唯一marker对应360同目标唯一回复、missing/repeat/unexpected/wrongTarget各0；另一次未带输入marker发送准确为seed后1h预置提醒，due12:39:36.982/实际12:39:47.964、24ms后fired、唯一内容/目标/SHA匹配，361全部解释。只证明mock action capture，不是QQ送达；原保守“one send unresolved/perInput notverified”的独立投影保留，由新增审计补齐不覆盖。RSS71→205MB、heap20→107MB包含helper证据积存与360session分配，没有自动内存泄漏判定，“重复timer6保持”等检查不能替代无泄漏证明。

本次Z05由条件不足更新为部分通过，真实6h/跨日/重连/一次503恢复/暂停积压/去重/收尾子项已执行；缺最新热更/真实QMC/GUI/内存证明，不升整行通过。root已同意K03明列有限本地合成条件通过、K04部分、Z05部分。本次已实际逐行重数186为11通过/96部分/2失败/76条件不足/0待测/1延期；107通过或部分/109含失败尝试，不能叫全项目完成率。K03不额外要求遍历全部组合，也不扩大GIF/FPS结论；K04正常重启与其余组合仍缺。

### 两项文案精度更正

1. settings.load普通无reset分支先额外GET status，再批量7项config/providers/templates/tools/availability/search/vision；因此源码路径是**状态读取后再读7项设置数据，8个额外GET**，不把“7项批量”称所有额外请求总数。
2. 首95readiness关闭未隐藏Timeout是事实；reducedMotion后进入新branch支持稳定定位，但装饰动画为因果推断且无独立eventtrace，不把精确原因写死为动画bug。原失败及同final95产品红绿保留。

ZIP重复前缀修后[实际native traversal17checks](.qa-local/all-acceptance-20261014/evidence/zip-headed-independent/ZIP-round7-prefix-after-traversal.verification.json)也已通过，exact安装失败：安装包含不安全路径，old双前缀原证保留、管理/extension/bundled/runtime/catalog/namespace/config/testtools前后diff空；仍只该本地包子项。[S04最终等待/渠道恢复](.qa-local/all-acceptance-20261014/evidence/two-tool-headed-independent-effective-day/S04-final-wait-channel-complete-verification.json)15966/v1、qa-local/qa-chat、wake200、two-tools已安装但停用/注册0；原override缺省→显式true语义恢复而非结构原样，storage5/Oct15ledger458保留。proxy15986仍活，不说全部helper退出或所有背景/价格配置字节恢复。

最新重做的oversize不是只靠旧延迟snapshot：[修后实际超限AX](.qa-local/all-acceptance-20261014/evidence/K03-fixed-oversize-feedback-ax.txt)明确图片不能超过8MB；[修后完整5 unchanged checks](.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-fixed-native-after-oversize-20261014T180055150879Z.json)与175911 before同bgImage=''、所有背景参数/四文件/其他scheme保持，现已关闭这一有界拒绝子项。旧期间crop变化的snapshot仍保留，不改写成全配置字节不变。

当前第9轮[独立run-plan](.qa-local/all-acceptance-20261014/evidence/full-regression-round9-2026-10-14T18-09-18-420Z-de28b27b/run-plan.json)18:09:18.508Z实际启动，完整366/tree eaccc49d697ea7ad2ed7c1e02d6ea2b45dcc2e823ca72ae9b656dd8b37401e97；相对R8生产0变更、95同，唯一test80加等待旧clear按钮detached，所有原strict断言保持。当前final pending，不能将启动/before冻结写成完整green。R8唯一80等待竞态是观察器修正版本，原121/122/overallfalse继续原样。

当前186条：**11通过、96部分通过、2失败、76条件不足、0待测、1延期**。K03仅本行有限本地合成条件通过，K04部分，Z05旧189copy真实6h部分；107通过或部分，109含失败尝试，仅是范围明确的覆盖/尝试数量，不是全项目完成率。P01/P06仍同一真实QQ隔离缺口的两失败行。安装包继续延期，无打包。

[本次四文档完整备份](.qa-local/all-acceptance-20261014/evidence/formal-doc-integration/2026-10-14T18-15-32-485Z-b86a04e7/backup-manifest.json)保存增量前全字节；本次仅文档和外侧证据，没有源码/测试/配置/GUI/网络修改。


## 2026-10-15 最终完成态补充

此前“R9运行中”“正常重启待测”均为历史时点，以下为最新结论。[R9完整回归](.qa-local/all-acceptance-20261014/evidence/full-regression-round9-2026-10-14T18-09-18-420Z-de28b27b/final-verification.json)已于18:18:46.942Z完成：M3 **122/122 exit0**、M4 **10/10 exit0**，[独立14checks](.qa-local/all-acceptance-20261014/evidence/test80-dom-settlement-repair-round9-2026-10-14T17-55-46-111Z-6f24f8a8/full-round9-independent-verification.json)全部通过；366文件before/after/live冻结tree eaccc49d697ea7ad2ed7c1e02d6ea2b45dcc2e823ca72ae9b656dd8b37401e97不变，本次文档写入前后也未变化。相对R8仅test80增加等待旧清除按钮detached，原strict断言和生产源码保持；R8真实121/122失败及R6失败、R7通过等原始历史仍保留。当前清单逐行重数仍为 **186＝11通过／96部分通过／2失败／76条件不足／0待测／1延期**；P01/P06是同一QQ隔离缺口对应的两行失败。132个自动回归文件通过不代表186项全部完成；旧189源副本的真实六小时证据仍只用于Z05部分覆盖，不冒充最新源码、真实QQ/商业模型/社区、热更新或满帧率验收。

正常原生关窗18:02:17.931Z后，[关闭独立9checks](.qa-local/all-acceptance-20261014/evidence/final-native-restart-readonly/closed-20261014T180527Z.json)确认72188消失、15967真实refused、锁自然释放；18:15:18.877Z以相同data/profile99正常启动82300，[重启独立9checks](.qa-local/all-acceptance-20261014/evidence/final-native-restart-readonly/restarted-20261014T181737Z.json)和[七次健康采样](.qa-local/all-acceptance-20261014/evidence/final-native-restart-readonly/existing-82300-health-20261014T181720697Z.json)通过（核验过程22.173秒）。raw config SHA598bd48d31dda427694c80830861eee0b85671bd635bd54ca8cff5b5d0ba1ee8在关窗前、关闭后、重启后完全一致：空背景引用、当前裁切/显示参数、四图文件、11会话、KV5及6成员8印象保持；旧native exit code未知仍null，不宣称exit0。[新native会话AX](.qa-local/all-acceptance-20261014/evidence/K04-native-after-normal-restart-sessions-ax.txt)确认11会话/SSE连接；[新native UIKit AX](.qa-local/all-acceptance-20261014/evidence/K04-native-after-normal-restart-uikit-ax.txt)和[同服务器可见IAB DOM](.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/K04-after-normal-restart-browser-ui.txt)确认“尚未选择背景图”及45°／45%／X7／Y6／24%／6px／平铺。[干净IAB截图](.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/K04-after-normal-restart-browser.jpg)仅证明画面中的参数，空背景标题在其viewport上方，不以截图声称该标题可见。K04清引用→保存→刷新→正常关闭/重启子链已齐，整行仍部分；K03仅有限本地合成条件通过，GIF只认采样循环而不扩称FPS。15966 peer和三个闲置proxy按root决定保留，本次未停止它们；安装包继续延期。首次浏览器自动审批超时的原记录和唯一成功重试均保留，无绕过。此增量只修改四份文档，[完整写前备份](.qa-local/all-acceptance-20261014/evidence/formal-doc-integration/2026-10-14T18-35-24-206Z-4393b439/backup-manifest.json)已保存。


## 2026-10-15 第11轮完成与本地修复增补

此前“R10/R11待完成”是历史时点。[R10](.qa-local/all-acceptance-20261014/evidence/full-regression-round10-2026-10-14T19-50-27-246Z-dd3da4b2/final-verification.json)与最新[R11完整回归](.qa-local/all-acceptance-20261014/evidence/full-regression-round11-2026-10-14T20-22-08-951Z-2531dd10/final-verification.json)均实际 **M3 125/125 exit0、M4 10/10 exit0**。R11于20:33:51.957Z结束，369文件（含171测试文件）before/after tree **2fa7cf892f5c8ae130a42352b8d4f761f63a0d1f3c7d5b6a712ab47aee67557d**一致，0 changed/added/removed，原94及R6–R10全目录历史保持。R10的b4955d旧树仍是其时点的完整绿；R6/R8真实失败、R7/R9/R10通过及各观察器更正保留，不用后来的绿覆盖原红。完整自动回归的135个通过文件不等于186项规格全部验收；本次逐行重数仍 **186＝11通过／96部分通过／2失败／76条件不足／0待测／1延期**。P01/P06是同一真实QQ隔离缺口对应的两失败行。旧189源码副本的真实六小时仍只覆盖其有限本地mock范围，不证明当前新增源码、真实QQ/商业模型/社区、全部热更或FPS。

主题上传已按逻辑方案、模式和请求版本归属，普通同槽重命名、配色、另一窗口普通设置保存引发重建可继续合法请求；换槽/基准自定义/ABA、清图、整方案恢复、离页/销毁和新选择使旧请求失效，成功刷新当前预览，旧catch/finally不误处理新选择。[同一最终155驱动](.qa-local/all-acceptance-20261014/evidence/theme-upload-lifecycle-repair-20261015/round2/final-verification.json)对原始3e81客户端不可变字节红13/18、修后18/18，另实际当前预览src/解码的同槽4组全绿，73/115/117/122均exit0；[第二作者13项](.qa-local/fix-all-20261015/theme-upload-second-author-review-2026-10-14T19-36-32-348Z-a822e920/independent-theme-upload-review.json)通过。旧源对照仅替换客户端模块，其他依赖为当前版，不能称旧全树回归。较新的真正有头同槽案例：native A上传20:38:17.086Z产生HTTP200，另一可见IAB客户端20:38:27[保存普通customRules](.qa-local/fix-all-20261015/headed-probe/evidence/valid-origin-2026-10-14T19-46-33-435Z-c24a49f0/theme-actual-rebuild-settings-save-dom.txt)，20:38:31.234Z释放回包，等待14.148秒低于15秒预算；root核实磁盘A由bg-399c19e8e7e2变为bg-30be2f477be4.png，B引用空、mode保持A。[native结果](.qa-local/fix-all-20261015/headed-probe/evidence/valid-origin-2026-10-14T19-46-33-435Z-c24a49f0/theme-actual-rebuild-native-result.json)确认同槽且不再空图；[同服务器IAB预览结果](.qa-local/fix-all-20261015/headed-probe/evidence/valid-origin-2026-10-14T19-46-33-435Z-c24a49f0/theme-actual-rebuild-preview-result.json)实际src为bg-30be2f477be4.png、complete=true、960×540，[可见预览](.qa-local/fix-all-20261015/headed-probe/evidence/valid-origin-2026-10-14T19-46-33-435Z-c24a49f0/theme-actual-rebuild-preview.png)另存干净截图。较后保存覆盖上传反馈，结果中feedback为空，不据此虚报捕获了成功toast；也未保存含无关覆盖层的原生截图。

有头试验边界已纠正：[只读超时诊断](.qa-local/fix-all-20261015/headed-probe/evidence/valid-origin-2026-10-14T19-46-33-435Z-c24a49f0/readonly-timeout-diagnosis-20261014T203459906Z-01258744/readonly-timeout-diagnosis.json)确认首跨槽112.492秒、首同槽61.930秒均超过上传三层15秒预算；proxy即使响应已断开仍记upload-delivered，因此这些旧HTTP200日志只证明上游备好回包，不能证明客户端收到成功回包并由生命周期逻辑拒绝。旧跨槽只限引用无串写/配置保持，首次Origin403为无效上传尝试。20:34:33快成功在普通保存已完成后才开始，仅验证正常上传；20:36:19尝试没有新upload-held，未计通过。上述原记录全部保留，不削弱155已有严格回包/当前预览断言。随后[正常预算跨槽实际重做](.qa-local/fix-all-20261015/headed-probe/evidence/valid-origin-2026-10-14T19-46-33-435Z-c24a49f0/theme-cross-slot-within-budget-final-result.json)已完成6项检查：held HTTP200为20:40:48.313Z，另一可见客户端20:41:00保存B后，20:41:00.533Z释放，12.220秒低于15秒；native当前B仍空图，磁盘A保留bg-30be2f477be4.png/B引用空、queue0、panel69dc。[保存DOM](.qa-local/fix-all-20261015/headed-probe/evidence/valid-origin-2026-10-14T19-46-33-435Z-c24a49f0/theme-cross-slot-within-budget-save-dom.txt)与[native结果](.qa-local/fix-all-20261015/headed-probe/evidence/valid-origin-2026-10-14T19-46-33-435Z-c24a49f0/theme-cross-slot-within-budget-native-result.json)另存，不能将本次结果回填到旧超时试验。**主QA五文件同步尚待root，不因源码完整绿或临时有头服务通过而声明主QA已加载最新版本。**

插件监听修复扩展根替换后的自动重绑、owned watcher error/close处理、500ms debounce及有界退避、hotReload即时开关与补停用期间修改、manual stop撤订阅且不复活。[156最终4/4](.qa-local/fix-all-20261015/watch-root-recovery/green-result.json)和[独立窄审/10项原生canary](.qa-local/fix-all-20261015/watch-root-recovery/independent-readonly-review.json)通过，旧最终1通过/3失败保留。挂起setup期间Off→On、旧ctx幽灵注册被拒、恰一工具/四watchers与最终资源归零为有限合成证据；stable parent本身被毁及全部有头热更组合不由此推定。R11包含这些修复，但E04整行仍部分。


Stage2此前V1的low-label-build87/exit20、七项native exact false和最小LABEL-only首program API成功但exactfalse/控制flags改变的记录保留；原V1完整native before未保存，不能重建或声称原metadata/future inheritance已精确恢复。V2修正ML字符串、owned Job kill-on-close与失败有界drain、token失败先于任何IO、属性列表清理、后代potential dirty及full raw Control严格比较，[r2独立代码审查](.qa-local/all-acceptance-20261014/fixtures/appcontainer-stage2-20261015-aa26d70c/evidence/revised-v2-prepared/independent-r2-code-review-20261014T200511087Z-3fbdae66/independent-stage2-v2-r2-source-review.json)14项及20+7pins通过。随后在用户批准的原固定七对象/同moniker/SID/0caps/自身Echo/no vendor/no network范围[实际V2执行](.qa-local/all-acceptance-20261014/fixtures/appcontainer-stage2-20261015-aa26d70c/evidence/root-v2-run-20261014T200650774Z-7df1ed76/root-verified-result.json)exit0、9项通过：三个实际token均AppContainer/预期SID/Low4096/caps0，allowed读写成功、blocked拒绝error5，owned Job实际0、自己创建profile删除且不存在。七项native DACL/label/control对**实际V2执行前基线**精确恢复；[独立后验11项](.qa-local/all-acceptance-20261014/fixtures/appcontainer-stage2-20261015-aa26d70c/evidence/independent-post-v2-20261014T201355300Z-34601ed9/independent-post-v2-verification.json)再核before/rollback/current一致、ML0、profile目录/映射/native absence、selfprocess0及V1软件/失败记录保持。合成write-probe/inherited-output按授权发生写入，恢复声明只限权限基线，不称所有合成文件字节还原。**V2成功不抹V1失败，不重建丢失before，更不证明真实QQ GUI、登录、网络、IPC或user-data-dir隔离；P01/P06评级保持。** 本次只追加四份文档，原历史原样；安装包继续延期。



## 2026-10-15 第11轮主QA同步与重启收尾

上段“五文件同步尚待”是历史时点，现已完成。[独立实际同步13项](.qa-local/all-acceptance-20261014/evidence/independent-actual-five-sync-round11-2026-10-14T20-47-39-642Z-cdc323aa/independent-actual-five-source-sync-verification.json)确认只更新五个目标、五个原文件备份精确、187个已复制core源码匹配当前生产及R11、其余182个未变，完整138文件静止数据before/snapshot/after逐路径逐字节一致；开发用途的11个未复制文件仍明确省略，不称完整369文件都部署到QA。首次sandbox启动47676发生FATAL且已退出，原失败日志保留；以原启动器和相同data/profile99重试85660正常启动，再由既有single-instance refocus恢复native1443924。[最终独立24项](.qa-local/all-acceptance-20261014/evidence/independent-restart-round11-20261014T205112478Z/independent-final-restart-verification-corrected-observer.json)核实旧82300/失败47676均消失、实际85660拥有15967、profile99/固定QA路径/原launcher8c17及五源码指纹保持；[native必要AX结果](.qa-local/all-acceptance-20261014/evidence/final-five-source-sync-round11-2026-10-14T20-44-25-801Z-420b62fa/restarted-native-summary.json)由root实际观察导航/SSE内容，无sandbox降级、ACL更改或kill，也未保存含无关private overlay的全桌面截图。重启后32个非日账业务文件字节保持；六份日账仅正常会话重放产生savedAt变化，records/usage/价格/aggregate深等，不能称全部live缓存/锁/日志/派生索引或原始日账字节都不变。实际保留11会话（0running/0waiting）、6成员8印象、3聊天55消息、1渠道、KV5、6日账、当日1run/458tokens、4背景资产；tools.overrides是primitive true，原首次观察器schema/日账误判的false报告已保留并另纠正，没有为过测改产品或数据。

真实QQ/登录/网络/IPC未提升为通过，现有peer与proxy也未声明全部停止。Stage3此时仅为独立QA候选准备，未执行vendor/Profile/ACL新流程；该准备不代表已有新scope批准或已Run。最新完整回归仍为R11的125+10全绿/369冻结树2fa7cf，186条评级仍 **11通过／96部分通过／2失败／76条件不足／0待测／1延期**，P01/P06同一QQ缺口两失败行保持；旧V1metadata失败和旧189源码六小时范围继续保留。此收尾只增补四份正式文档及外侧证据，历史prefix完整，未改源码/测试/配置/数据或操作UI，安装包继续延期。



## R15完整回归通过，主程序已部署，余项验收待完成

[R15完整真实回归](.qa-local/all-acceptance-20261014/evidence/full-regression-round15-2026-10-15T00-14-11-600Z-f5793ba0/final-verification.json)实际M3 128/128exit0、M4 10/10exit0，00:14:11–00:23:55 UTC；374文件前后树`8cca7f576cedff95f08a91b3572f855b47f619f7cbee9adf97b4ec40a1ae03f7`不变，含`.gitignore`。相对R14仅108测试同步变更，生产字节未改；[108真实延迟POST红绿](.qa-local/fix-all-20261015/test108-save-synchronization-2026-10-15T00-03-44-808Z-755e781d/final-test108-synchronization-verification.json)以同一真实1200ms POST延迟复现旧测试提前GET失败，修后等待200/请求finished/界面已保存再保留原13条assert与新增磁盘断言，三个尺寸、普通108及73都通过。[R14实际127/128失败](.qa-local/all-acceptance-20261014/evidence/full-regression-round14-2026-10-14T23-49-33-475Z-846d4f1d/final-verification.json)、[R13中断无最终汇总](.qa-local/fix-all-20261015/round14-lock-http-repair/r13-interrupted-primary.json)、[R12实际125/126失败](.qa-local/all-acceptance-20261014/evidence/full-regression-round12-2026-10-14T22-56-34-560Z-6de970ee/final-verification.json)及更早完整批次原证继续保留。

本批已修恢复锁竞争、背景8MB规格与HTTP2MB限制不一致、备份目录遗漏ignore。[启动恢复锁主证](.qa-local/fix-all-20261015/round14-lock-http-repair/lock-repair-targeted-primary-corrected-observer.json)与[背景HTTP与备份忽略12项证明](.qa-local/fix-all-20261015/background-upload-limit-repair-2026-10-14T23-37-35-028Z-ec62bfba/final-upload-limit-and-backup-ignore-verification.json)给出实际定向范围。

Root正常关闭旧主R11 PID85660，同一held句柄exit0、进程gone/锁释放/claims0/10秒预算实际ConnectionRefused，首2秒timeoutfalse保留。[R15实际八源复制](.qa-local/all-acceptance-20261014/evidence/final-eight-source-sync-round15-2026-10-15T00-37-39-858Z-56ae1dee/sync-result.json)已完成7修改+1新增，188core与固定8目标一致，139份关闭状态数据before/snapshot/copy-after字节完全相同；随后正常启动PID84308/profile99/15967，原启动器8c17未改，[重启独立19项语义补证](.qa-local/all-acceptance-20261014/evidence/main-restart-r15-20261015T003804651Z-5f282fa8/independent-main-r15-semantic-supplement-1792025205520.json)全部通过，精确创建身份/端口owner/锁/claims0/boot-ready已核。业务11会话、7份记忆文件、3份消息文件、KV calls5、4背景和配置保持；六份日账仅savedAt因正常重放更新，其余记录/价格/聚合/JSON逐键一致，不能说重启后全部raw bytes相同。原17/19false及Root两次CIM/日期parse false、childCIM不可用报告原样留，用新补证追加更正。当前没有main页面/DOM/AX/HTTP读取，15967保存的browser拒绝仍待实际解除及用户回复，不以源码部署替代页面交互。OneBot15966当前未连接/30秒WS重连，独立本地替身只准备未启动，不写恢复成功。[F011新实际31项限定补证](.qa-local/fix-all-20261015/f011-r15-native-presence-author-audit-2026-10-15T00-43-35-068Z-43c445d9/independent-f011-native-presence-limited-verification.json)支持真实native popup出现和预期held exit1，但正文AX未成功读取/谁关闭unknown，Root未click/key，不作人工确认或A10整行通过；[F012新原生限定15项补证](.qa-local/native-renderer-fixed-r14-9226b1a5/f012/evidence/independent-f012-fixed-actual-1792024520807.json)实证held PID89204 exit0/31952ms、真实renderer crash日志与30秒观察，旧exit1/EBADF QA记录器失败保留，未改生产处理逻辑。 当前186行仍为通过11、部分通过96、失败2、条件不足76、待执行0、延期1；P01/P06是同一未完成QQ隔离缺口的两失败行，局部单测、token、清理或自制进程不能替代真实完整验收。不打包。 自动回归通过是已完成阶段，全部剩余有头/外部条件与自我修复目标继续进行；本段在Root授权后追加到正式四文件，主页面交互/真实外部条件继续待验。


本轮当前状态（2026-10-15T00:53:35.660Z）以上述R15终态与实际部署/重启为准，覆盖此前历史段落中的“R12/R13/R14尚运行”“主QA仍加载R11/同步待办”等旧时点表述，原历史前缀及所有red/false/incomplete证据不删不改。[Root原始时间字符串的精确身份补证](.qa-local/all-acceptance-20261014/evidence/main-restart-r15-20261015T003804651Z-5f282fa8/root-exact-start-time-original-json-string-supplement.json)保存tickdelta0/CIM六位精度匹配，未把损失精度的旧false抹掉；[F011精确owned进程消失与锁释放补证](.qa-local/fix-all-20261015/f011-r15-native-presence-author-audit-2026-10-15T00-43-35-068Z-43c445d9/additional-root-owned-process-absence-verification.json)只认本测试PID，无全部helper退出声明。F012只观察自有Sky窗口元数据，无DOM/AX/page/截图；F011只观察native presence/委托marker/预期exit1，正文与关闭者仍未知。A10仍部分通过，P01/P06仍失败、实际市场/商业模型前提未齐，186等级11/96/2/76/0/1不变，安装包延期。

[更新后正常第二实例的实际主证](.qa-local/all-acceptance-20261014/evidence/single-instance-r15-20261015T005102309Z-da573a66/root-actual-single-instance.json)进一步确认同profile99/原wrapper的duplicate29144由原held句柄exit0、production日志single-instance-denied，primary84308同原StartTime保持alive；未读取页面、未观察refocus，不推广全部单实例组合或运行中数据全raw bytes不变。


本地连接恢复补记（2026-10-15T01:03:11.483Z）：此前断连/“只准备未启动”保留为原取证时点；Root现已实际一次启动独立合成peer38868，loopback15966约232ms ready，自己状态client1/connectionTotal1/self900001，主84308的00:55:50日志实际WS已连接并出现合成900001。[作者实际只读25项核验](.qa-local/standalone-peer15966-r15-1eb90c4a/evidence/author-readonly-passive-reconnection-2026-10-15T01-00-13-905Z/independent-passive-reconnection-actual-verification.json)支持有限passive mock恢复，只有3次get_login_info探测，model/audio/chatEvents均0、无主动emit/真实QQ/外网/配置更新；配置保持仅引用Root对139关闭副本基线中配置hash的投影，不称全部运行中139文件raw bytes相同。[Root按存在至少一次的正确补证](.qa-local/standalone-peer15966-r15-1eb90c4a/evidence/root-passive-reconnection-presence-supplement.json)保留真实3条匹配，[首“恰一条login”observer误判false](.qa-local/standalone-peer15966-r15-1eb90c4a/evidence/root-passive-reconnection-proof.json)不覆盖。主84308与peer38868保留运行，不宣称所有helper已停；主15967保存的browser拒绝仍待用户实际解除/回复，无page/AX/HTTP绕读，本地重连不等于真实QQ/模型/媒体/UI验收。P01/P06失败、A10部分及186评级11/96/2/76/0/1保持，安装包延期。


服务恢复补记（2026-10-15T01:53:10.749Z）：[主恢复15/15](.qa-local/all-acceptance-20261014/evidence/main-recovery-stale-r15-20261015T014656114Z-14151edd/independent-main-recovery-jsonlog-supplement-1792028972412.json)与[独立测试连接端恢复17/17](.qa-local/standalone-peer15966-restore-5fa0bf57/evidence/author-restoration-actual-20261015T014913764Z-1a8355b2/independent-fresh-peer-restoration-verification.json)确认主57808/peer92928恢复，141快照与旧锁留存、业务保持，六日账仅savedAt变化，原14/15日志观察器false保留；[此前data协议错误观测](.qa-local/all-acceptance-20261014/evidence/main-recovery-stale-r15-20261015T014656114Z-14151edd/root-browser-recovery-status.json)与[用户手动重开后的普通访问](.qa-local/all-acceptance-20261014/evidence/main-recovery-stale-r15-20261015T014656114Z-14151edd/root-browser-after-user-reopen.json)分别保留，用户称看见控制台后工具仍因保存的用户权限拒绝15967，未读取页面/AX/DOM/截图/主HTTP，未完成本轮有头用例。仅本地合成被动连接成立，peer审计未独立把socket归到主PID；既有128+10回归、186评级11/96/2/76/0/1及真实QQ失败/外部前提判定不变，服务留运行、未打包。


权限阻塞核对（2026-10-15 08:25 UTC）：用户已确认个人空间及该地址“始终允许”，本地精确站点配置亦为 allow；文档所列两份本地管理策略文件不存在，但新工具会话仍在访问原地址前拒绝网络授权，具体拒绝层未明。已保存[权限不一致证据](.qa-local/all-acceptance-20261014/evidence/browser-permission-allow-denied-20261015T082524Z.json)，不再记作用户尚未设置允许。当前374份源码无增删改，既有128＋10项自动回归结论保持；本轮未执行新的有头用例、未重启测试程序或打包，整体目标未完成。


权限诊断续记（2026-10-15 16:57，北京时间）：用户已重建精确站点记录、改为询问并完整退出重开 Codex；同一浏览器访问同一地址仍在页面访问前被授权层拒绝，具体拒绝来源未明。见[重启后诊断记录](.qa-local/browser-permission-repair-20261015T083308251Z-edc94190/after-full-restart-denial-20261015.json)和[待用户提交的诊断说明](.qa-local/browser-permission-repair-20261015T083308251Z-edc94190/browser-permission-feedback-20261015.txt)。本轮曾实际启动独立主测试程序81216并确认拥有15967监听；Codex重启后16:55核对原进程及监听均不存在，未取得原句柄退出记录，退出原因未知，当前未再次启动。本轮无新增有头通过，既有R15自动回归128＋10及186项评级11/96/2/76/0/1保持，未打包、未向外部提交诊断。


有头测试恢复补记（2026-10-15T09:47:24.705Z，UTC）：此前权限拒绝及服务停机记录保留为历史时点。独立主测试版已恢复，用户手动重新打开后，浏览器工具现已实际成功访问15967；按程序现有合成 token 登录后 URL 清除 token，刷新仍可认证且 SSE 已连接。本轮实际加载全部九个页签，确认单个沙箱 iframe；侧栏收放前后九行均46px且纵坐标一致，品牌图标中心不变，“工作面板09”已移除。MCP 空配置设置打开后取消，并实际热更新三次，三条后台激活日志与界面12插件/7加载/0错误相符；未启动 MCP 子进程或授予权限。社区选中图标在焦点离开导航后4.38秒内持续变化，会话未选中图标保持静止；只证明这对图标，不代表全部图标或满帧率验收。QQ“隔离未验证”诊断可开关，启动保护保持，未启动真实QQ。见[本轮实际证据](.qa-local/all-acceptance-20261014/evidence/main-recovery-stale-r15-20261015T090954978Z-317a79e1/headed-resume-smoke.json)，原生测试版局部截图亦保存在同目录。本轮未发现需修改源码的新缺陷；R15自动回归128＋10结论保持，186条评级11/96/2/76/0/1不变，真实QQ/市场/商业模型及剩余完整生命周期用例仍待验，未打包。


状态入口与页内市场更新（2026-10-15T10:19:25.769Z，UTC）：按用户四条页面批注，模型状态直达设置“模型与渠道”；真实IAB四次点击均到正确目标且不再弹状态对话框，95/141覆盖键盘及同一设置iframe草稿保持。技能/插件页新增“已安装／在线市场”切换，目录通过可替换market.client.listCatalog能力和窄API提供；搜索/分类在本地进行，状态SSE不触发反复联网。实际只读有头预览显示200技能/277插件，语音搜索10项、媒体分类57项（仅为取证时数量）；没有真实扩展下载、安装、账号或公开发布。161有头合成回归覆盖两类市场的加载/空态/失败重试/确认取消/安装失败与惰性请求，焦点回到原安装按钮；151的真实RPC虚拟时间检查覆盖市场专用180秒预算而普通请求额度不变。附带修复HTTP退出等待空闲TCP连接：1秒完成已有响应后关闭残留连接，162旧红新绿且Node24/Electron Node20均通过。16份集成测试全绿，新161/162已纳入M3；本轮没有重跑完整M3/M4，不能把历史R15128+10当作这次新源码的全量结果。独立主QA已备份139份静止数据、同步190份core源码并正常重启，原离线wrapper未改；另开空数据只读15987预览供查看真实目录，禁止安装/账号/发布。见[本次证据](.qa-local/market-panel-20261015/final-verification.json)与[真实目录截图](.qa-local/market-panel-20261015/public-plugin-market.png)。186项评级11/96/2/76/0/1保持，剩余完整生命周期验收继续待办，未打包、未改远程服务器。


用量页 0.4 交互迁移（2026-10-15T10:51:55.471Z，UTC）：已读取 develop 中的旧版实现，将五指标卡、可悬停/键盘查看的柱图、时间范围切换、按天/会话/模型的整宽表格、模型展开和工具/分组明细弹窗迁入 0.5 沙箱面板。保留主题继承与声明 API；运行次数和实际模型调用分别统计，同模型按渠道拆分，历史未记渠道的总量明确未分渠道，不能据此钻取其它渠道。增量刷新保持行节点、焦点和滚动，旧异步响应与新明细失败不显示前一范围数值。163、106、80及5份相关测试通过，164最终有头回归 exit0；新163/164纳入M3，本轮未重跑完整M3/M4。主合成QA备份142份静止数据后同步191份core源码并以原离线wrapper启动100528/15967；原空数据只读15987预览也已更新并实际点击复验，未种入模拟用量。主旧进程退出已观察，退出码和最终关闭者未知；预览被exec中断exit1，旧锁由生产内核正常识别恢复，未手工删锁。配置字节保持，静止复制时数据字节一致不代表运行后所有缓存/日账原字节均不变。详见[本轮证据](.qa-local/usage-v04-20261015/final-verification.json)。不提升真实QQ、账号或外部模型验收结论，186项11/96/2/76/0/1保持；没有打包或远程部署。


用量弹窗遮罩关闭修复（2026-10-15T11:00:04.184Z，UTC）：用量明细及工具调用弹窗已启用点击遮罩关闭；内容/内边距点击和内容拖至遮罩不误关，仍保留清理、焦点回返、Escape及晚响应防护。共享生命周期选项默认关闭，仅这两个只读弹窗启用。164有头、140、61、67通过；已同步主合成QA及15987空预览的两份静态JS，未重启或改配置/数据。IAB实际点击2026-10-11明细外部后open dialogs为0，独立有头取证见[本轮结果](.qa-local/usage-backdrop-20261015/final-verification.json)。未打包，整体186项评级保持。


市场旧清单安装兼容修复（2026-10-15T11:21:33.549Z，UTC）：公开只读核对的8个已审核包均缺kind，包含当前生图搜索下的image-generate与ai-image；按唯一根skill.json/plugin.json仅补缺失kind并在暂存清单持久化，保留原嵌套字段，继续拒绝显式非法值、类型冲突与APIversion2。ZIP解包仅剥离所有文件共有的连续包装目录，兼容waifu_draw双层包装，不从多扩展混包中任意选一个。新增165真实kernel/HTTP/ZIP/loader与受控市场verify/download闭环：7个停用安装、17个拒绝、2次HTTP重扫通过，顶层代码及真实外网请求均0；38/62/86/161全绿，165已加入M3，本轮未重跑完整M3/M4。旧main100528/preview79972与两端口均已观察不在，退出码及原因未知；备份main146文件与preview3文件静止数据后只更新两份后端源码，191core匹配，原wrapper/配置/只读预览限制保持，main89800/15967与preview41708/15987恢复，IAB SSE连接且文生图搜索恢复200目录/3结果。静止复制数据一致不宣称运行后所有缓存字节不变。公共包尚有旧函数式api.config/独立providers导出的静态兼容风险，未导入/执行第三方代码，不将安装兼容等同于生图运行验证。见[修复与验证记录](.qa-local/market-manifest-20261015/final-verification.json)。未打包/远程部署，整体186项评级保持。



### 2026-10-16 本地面板空导航的认证与加载恢复

用户确认15967左侧全部页签消失并显示“暂无已注册面板”。只读核对源与独立副本的内置清单：9项齐备且均可由服务端和客户端接受，文件未丢失；当前工具因先前浏览器权限拒绝未读取该页实际HTTP响应，不能把认证失效当作已确认的实时根因。已独立证实并修复初始`/api/panels`的401/网络/无效响应统一降为`[]`、随后没有恢复入口的前端缺陷。

宿主新增认证恢复与普通加载重试卡；候选令牌只经真实面板GET成功及结构校验后采用，不写服务端配置，不改变30分钟session策略，不传给插件iframe，不写URL/localStorage；密码在恢复/清理/销毁时清空。候选请求受组件生命周期和共享凭据代际约束，旧成功或值ABA不能覆盖新凭据。成功恢复挂载首面板并重接SSE；有效hello/status可重试首次瞬时失败，合法空清单仍按空面板显示。

[独立有头证据](.qa-local/panel-recovery-20261016/headed/result.json)使用随机端口、临时UI副本、空扩展目录和惰性传输，验证缺失/过期/错误凭据、真实九页签/iframe/SSE恢复、503重试、畸形200拒绝、旧凭据代际隔离及520px布局，未启动QQ或访问15967。167以及116/125/95/139/61/67共7个不同测试通过；本轮不是完整M3/M4或186项验收。UI三文件已有备份并静态同步到主QA与预览副本，主QA193项核心文件与源一致，配置散列保持，服务未重启、未打包。用户当前页仍待其刷新，未声称已读取或复验该窗口；[最终验证记录](.qa-local/panel-recovery-20261016/final-verification.json)。186项评级保持。

### 2026-10-16 删除/清空/重置的渐进点击交互

按用户新规格新增共享`destructive-action`组件，既有删除确认改为累积点击：普通2次、清密钥/较重设置3次、整档清空/卸载等4次，设置“重置全部数据”6次；500ms未点击后按每1500ms满格的恒定速率线性回退，实际progress到100%才执行。对应内容框按`--bad`逐渐染色，按钮有进度条，附近显示不阻塞点击的影响说明，不再弹删除确认dialog。键盘Enter/Space独立按压计次，held repeat不计；pending防重；换对象、Escape、离页、隐藏或真正脱离DOM取消未完成进度。列表/成员/扩展按钮按实体复用以避免SSE刷新打断，目标重绘同步补染色，共享目标定位引用计数在最后一项清除时恢复。

全窗重置染色通过既有nonce/source/origin桥的`ui.destructiveProgress`通知，只接受bundled settings且具有reset API声明的面板。宿主覆盖壳层和opaque iframe，不跨插件访问DOM；flush/close清零并拒绝离页后迟到的正进度。原备份、下次启动清理、真实响应确认、保存竞态及接受后锁定保持。设置→组件库的危险按钮提供只更新计数的安全预览，插件SDK文档增加显式接入方式。

[最终验证](.qa-local/destructive-ui-20261016/final-verification.json)：30个不同相关测试文件通过，包括168的13组精确时间/生命周期/无障碍/主题/窄屏有头检查、169真实壳层opaque iframe有头测试。169的9项破坏请求为mock且真实reset调用0；136另只在临时合成数据中实际验证六击重置、备份与重启。73/83/155的持久化和全部18上传生命周期断言、53/80/90/120/124等业务/隐私检查保留。旧确认/单击预期失败及根的测试适配观察器错误记录保留，141只修正autosave与真实HTTP/虚拟时钟同步门，原发现/失败/恢复断言不变。这不是完整M3/M4或186项验收，既有评级保持。

20个UI文件已备份并静态同步到主QA与预览副本，主QA196项核心文件与源一致，配置散列保持；未重启服务、未打包、未启动QQ或删除真实数据。因此前浏览器访问限制仍未对15967使用浏览器/HTTP替代读取，当前用户页待手动刷新；全部本轮GUI证据来自独立合成实例。

### 2026-10-16 误重置后的重启与示例数据重建

用户说明误执行全部重置并请求重启、补充大量示例。已核对原prepared标记PID117100与独立data范围，普通进程树退出未完成后，仅强制结束核对过的QA117100及其子进程；原生completePendingDataReset严格验证receipt/digest后完成清理，保留外侧data.backup-2026-10-15T20-38-28-693Z-90ef7116，pending标记已消失，再离线装入新合成数据。未恢复旧凭据或改变真实资料。

本轮重建10聊天（6群+4私聊）、280中文消息、44终态会话（24done/8noreply/8error/4aborted），6份记忆含27成员93印象，5天用量/4模型/2渠道，3自定义示例人设与8已完成提醒；未读/活动会话/待触发提醒均0。staging连续重建与原生仓库校验通过，Windows短暂EPERM仅在种子脚本对幂等原生写入重试，未改产品。4个既有默认启用测试扩展显式停用，未重新授予宿主权限。

本地被动合成peer在127.0.0.1:15966/PID120748，提供示例联系人目录与固定模型响应，无出站连接或主动消息。现有离线QA adapter未修改，独立console 15967/PID128240/profile99已启动、锁归属正确、OneBot连接合成账号9900。两渠道原生适配器测试及固定pong模型请求均通过；未对受限15967页面使用浏览器或HTTP读取，也未声称当前IAB已刷新。196项核心文件与上一UI版本一致，QQ未启动、未打包。新种子/操作记录与最终验证见`.qa-local/reseed-demo-20261016/final-verification.json`；主数据目录固定为`.qa-local/all-acceptance-20261014/desktop/data`。

## 2026-10-16 追加式组合 v2 完成

按用户“绝大多数实现都是默认项，前端/后端/核心业务靠追加文件替换”的裁决，实现统一 createApplication 启动组合、52 个默认组件、可信 UI/后端控制器替换、生命周期与撤销回退；修复桌面预处理/提示词预览/费用统计的固定实现旁路，并同步相邻架构与行为规格。

最终验证：node test/run-all.mjs 退出 0，M3 143/143 个测试文件、M4 10/10；最终冒烟 12/12；独立有头 Edge 通过。源码摘要与规格同步散列已核对。详细范围、初轮修复、原始日志和既有用户图像技能兼容问题见 docs/composition-regression-evidence.md。无安装包打包或部署。

## 2026-10-16 追加层部分重叠与组合稳定性

按用户对成熟社区与插件市场的补充要求，冲突改为逐目标裁决：A的X/Y与B的X/Z只在X发生替换或包装，Y/Z保留；replace遮蔽旧链，wrap显式合作保留独立方法。新增安全的wrapMethods接收者辅助、启动清单v2包装声明、确定性排序及受鉴权的来源/冲突诊断；旧v1替换仍兼容，普通市场SDK版本没有统一升级。

修复旧层单文件越过较新整页/外壳边界，以及路由撤销/失败后资源仍挂父生命周期的问题；每个注册器现在独立取消和清理，父级撤销登记也释放闭包。176–179实际验证48种排列/启用子集、9代UI、六种路由移除顺序、6代真实核心入站/仓库/HTTP及失败回滚；不兼容的完整页面或函数不会自动合并。

最终node test/run-all.mjs退出0：M3 147/147文件、M4 10/10文件；最终冒烟12/12，最终源码177有头九代通过。前两次完整运行各146/147，分别暴露136无界同步等待/实时时钟六击和90后台刷新后的旧DOM句柄竞态；仅修订测试同步与定位，HTTP、备份、数据保留和删除次数断言均保留，两项已在最终完整回归通过。相邻规格书v2.1和源码摘要已核对，git diff --check通过。

详见[规则及验收](docs/composition-overlap-evidence.md)和[最终记录](.qa-local/overlap-20261016/final-verification.json)。本轮使用独立合成实例与被动传输，没有读取受限15967控制台、启动真实QQ、调用商业模型、打包或部署。既有image-generate旧API兼容错误单列，不能由本轮结果推断其已修复；既有186项真实运行验收评级保持。

### 2026-10-16 控制台重启供后续微调

用户要求重启现有15967控制台。已核对旧控制台128240及合成peer120748均退出、两端口释放；备份175份静止数据及待替换源码后，同步29份变更/新增文件，216份源码与主项目一致。原离线wrapper与profile99保持，恢复合成peer140360/15966及Electron控制台138608/15967；两端口实际监听归属、窗口创建、新代boot记录及合成OneBot连接均已确认。84份配置/聊天/会话/记忆/提醒等文件字节一致，五份日用量数值保持，只有原生启动刷新savedAt；未将运行缓存和日志声称为字节不变。未访问受限15967页面、启动真实QQ、调用外部模型或打包。备份和核对记录见[本轮结果](.qa-local/restart-console-20261016/2026-10-16T02-45-14-291Z/final-verification.json)，当前浏览器页待用户刷新。

### 2026-10-16 侧栏与渐进删除的视觉微调

侧栏以320ms缓动伸缩，复用固定图标槽、行高和底部区域；文字渐隐裁切，左/右/窄屏与快速反向操作逐帧图标偏移0px，不重挂iframe或丢草稿。删除进度增加改为150ms平滑填充，移除可见的剩余点击/0.5秒回退句子，改用分段刻度；原2至6次阈值、500ms等待及线性回退保持，影响说明与无障碍状态仍在。危险色上叠随进度增强的几何故障块，成功后约160ms故障淡出，后续条目240ms缓入缓出补位，减少动效时直接更新。

共享组件在执行前捕获有界列表，兼容SSE先移除行而HTTP后返回；视觉副本无交互/脚本/资源/ID/自定义元素执行。失败不主动移除对象，切页/后台/输入/滚动/取消等清理。新增取消回归实际发现原按钮脱离DOM后全局reset找不到pending layout的问题，已给提交中的装饰事务独立生命周期登记，dispose和global reset后逐帧无副本、运行/暂停动画或残留样式，业务回执迟到也不复活。全窗重置沿用原受限桥及重启回执，不让应用整体消失。

最终定向批次22/22文件通过，79份UI运行前后源码散列相同；新增180有头/无头各14/14，合计23个不同测试文件，含168原13组行为与精确回退、169九项mock破坏请求、136临时合成数据真实备份/重置、172/177实际Chromium追加UI/沙箱验证。夹具仅补新模块或等待新的150ms色彩绘制，旧业务断言保留。既有第三方image-generate旧API错误单列，本轮不是新完整M3/M4或186项真实功能验收，不作满帧承诺。

备份后仅将9个UI文件同步到当前独立控制台138608/15967，217份运行源码逐散列一致，配置/离线wrapper保持；无数据目录写入、服务重启、真实QQ启动、打包或部署。未绕过当前15967浏览器权限限制读取页面，用户刷新即可加载新文件。[最终记录](.qa-local/visual-interactions180/final-verification.json)，视觉与SDK细节见[设计记录](docs/theme-color-design.md)及[插件SDK](docs/plugin-sdk.md)。

### 2026-10-16 本机自动认证与连接恢复

按用户要求，本机根控制台每次加载通过宿主专用入口自动领取当前令牌，桌面仍走受限IPC；旧30分钟缓存只作兼容回退。共享REST/SSE在宿主鉴权失败后合并恢复，令牌轮换和短断可重连并保留iframe/草稿；业务401不重放写入，错误候选不自动变为正确凭据，取消/超时/旧代际不得重放或覆盖新身份。后台逐请求令牌与来源校验保留；bootstrap另核对真实loopback socket、精确Host/端口、Origin/Referer及Fetch Metadata，插件RPC禁止代理。用户HTML/SVG直接打开也受响应CSP sandbox约束，History路径可改但安全origin保持null。

最终冻结全量退出0：M3 151/151、M4 10/10，416份源码和测试散列未变；冒烟12/12。182三次独立有头与一次无头均10/10，181守卫6组、183取消/代际19组通过。前两次完整150/151的141旧布局和90动作间隔/保存重载竞态只修测试同步，原断言及产品阈值保持；90两次实际运行和受控延迟实测4可信点击/1DELETE。原始失败与182一次被掩盖的未知触发原因均保留，不从复跑推断旧失败具体原因。详见[认证合同与证据说明](docs/local-console-auth.md)、[最终记录](.qa-local/local-auto-auth-20261016/final-verification.json)。

完成后核对旧控制台身份，普通退出失败后仅强制结束该QA进程树；备份146份静止数据、替换6个生产文件，217份运行源码逐散列一致。新控制台151380/15967/profile99和原合成peer140360/15966监听正常，实例锁/窗口/连接已确认；含配置在内的31份业务文件字节一致，5份用量值一致。用户刷新当前页一次加载新版；没有通过浏览器或HTTP读取受限15967页面，没有操作真实QQ、外部模型、打包或部署。数据备份在`.qa-local/restart-console-20261016/2026-10-16T05-15-41-822Z/data-before`。既有第三方image-generate旧API兼容问题及186项验收评级未因本轮改变。

### 2026-10-16 0.4择优迁移启动：模型目录与可逆折叠

新活动目标保持全部0.4原子功能复查，不局限于本批。只读develop源码并生成72文件/895候选锚点散列索引，标为待语义核对而非等价完成；完整领域范围、判定标准及明确未完成项见[迁移计划](docs/v04-parity-plan.md)。

新增可追加文件替换的默认model-catalog模块：手动添加、显示名、筛选、重命名及逐项移出；编辑渠道保留现有模型对象及能力元数据。修复视觉option刷新覆盖显示名、删除目录条目遗留别名。目录与实际调用配置分离，不擅自清主/专用模型或密钥。184实际合成kernel+UI验证保存、磁盘重读、浏览器重载、纯文本标签和两击删除，无外部请求。

参考旧toggleCollapsibleAnim迁入可中断反向的220ms原生details高度动画，保留嵌套控件与键盘语义，加入临时inert/减少动态效果/离页及节点移除清理。与原motion明确互斥；设置快照通过逻辑展开状态避免误读关闭过程的临时open。185使用真实WAAPI控制时间与几何验证连续性，另实际鼠标/键盘检查；184/185均有头、无头通过。119/90/133/61/69/168/172/177通过；137原测试DOM缺hasAttribute接口失败，补夹具接口并新增互斥断言后原断言全部通过。历史失败与后续通过区别见计划，不包装为完整回归。

首批完整M3/M4从422份冻结源码/测试启动，证据目录`.qa-local/v04-parity-20261016`，终态尚待读取。没有使用当前受限15967的浏览器/HTTP通道，没有同步运行副本、操作真实QQ、打包或部署。目标仍active；下一步先检查这轮活任务，再做远端勾选导入、分渠道模型选择/专用配置及其他领域语义复查。

### 2026-10-16 0.4择优迁移第二批：选择、实际路由与凭据身份

首批完整回归已真实结束：M3 153/153、M4 10/10，422份源码/测试散列一致，固定记录`.qa-local/v04-parity-20261016/batch1-final-evidence.json`。该结果不覆盖下述第二批。

远端模型改为只读获取→勾选确认写入；独立选择集合跨筛选/厂商保留、每次最多100项；onlyMissing保护并发新建，expectedBaseUrl防止旧结果写入改址渠道。主/记忆/图片/视频/备选复用分渠道选择器，失败只回滚自身仍在当前代的字段；取消等待中的提交前读取不会迟到保存。专用模型保存显式渠道身份，默认llm.target实际解析地址与Key、优先视频，保留旧ID-only和显式overrides/备选隔离；异步解析可及时取消。187真实追加选择器文件后默认导入独立工作，188真实追加异步目标模块改变HTTP请求并停用回退。

纠正当前主Key控件实际编辑全局Key的歧义：选渠道时使用专用凭据组件；写入/显示/三击清除均按当前ID，切换清空输入/明文，迟到明文不复现。真实调用、探针、发现不借用其它渠道或全局直连Key；账号池跨来源无自有Key不继承原Key。SDK只改model时继承当前渠道，明确不存在的渠道拒绝。有效旧数据只有渠道Key、端点在主配置的情况保留。旧R27“任意来源借全局Key”不迁入，33改为同来源正例+跨来源不外发反例，44通过；41保留旧14项通过。初次41兼容错误/33旧不安全预期失败及189测试未等待异步完成的失败日志保留，未冒充产品全量绿。

186/187/189最终有头和无头均通过，188目标/凭据/生产组合测试通过；15原54项、129原10个SDK边界场景、171原10组组合场景通过。第二批完整M3/M4已从431份冻结源码/测试启动，exec34018及`full-2026-10-16T06-49-59-598Z`，未得终态不得称全量通过。**模型子系统仍有未闭合项**：既有编辑渠道仍整数组写入且Key另一次请求，下一步处理并发与失败原子性；其余0.4领域也未完成。未更新15967、未操作真实账号/QQ、未打包部署。

### 2026-10-16 0.4择优迁移第三批：渠道编辑单次事务

第二批exec34018已结束，M3 156/157、M4 10/10，431份源码/测试散列一致。89的mock调用未配baseUrl，被新来源守卫拒绝；补显式合成端点后原全部SDK隔离/脱敏断言通过，不放宽来源边界。

新增默认`settings/provider-editor.js`及POST/providers/update，按ID提交实际变化字段；不同字段并发合并、相同字段冲突409、未改动模型/其它渠道保留服务器当前值。目录显式修改保留同ID最新元数据/别名；名称、端点、主绑定和新Key仅一次config.update。Key比较用随机进程密钥HMAC生成不透明credentialRevision，不公开已有密钥/普通散列。原独立三击清Key保持并回传新比较标记；关闭等待中的编辑清空输入并阻止迟到提交。默认UI仍可单文件追加替换，模型管理独立。

190真实临时kernel+浏览器+磁盘故障/重试/并发验证有头、无头通过；13不同文件14次定向全过，`batch3-2026-10-16T07-07-24-178Z/result.json`。初次190因测试硬编码面板URL失败，改为document.baseURI后通过；预期EISDIR是故障注入，不是忽略错误。第三批首轮完整exec35025已结束：M3 157/158、M4 10/10，434份散列一致；唯一117仍等旧POST/config/providers数组，改为新接口providerId+changes谓词后原全部草稿/焦点/保存/迟到读取断言通过（exec70483 exit0）。该失败完整日志仍保留，不把重跑绿倒写到旧结果。

再次启动434份冻结完整回归，见`.qa-local/v04-parity-20261016/full-latest.json`；修改生产/测试前必须先核对这一轮真实终态，不重复起跑。完整目标仍active，不以模型阶段收口。新源码对账见计划：旧三页列表调宽/双击恢复/持久化确认缺口；新版聊天历史分页优于旧3000硬截断，保留；聊天扫选多次重建会累积匿名window pointerup且缺cancel，记忆ticker无任务也每秒唤醒，均留下一批改进。记忆任务权威状态恢复/失败原档/草稿保持已有100覆盖，逐子项记录，不推断整领域完成。当前15967仍未同步，没有访问受限页面、真实QQ/模型、打包部署。

### 2026-10-16 0.4择优迁移第四批：列表宽度与前端生命周期

11902已真实终止exit0：第三批最终完整M3 158/158、M4 10/10，434份源码/测试散列一致，`full-2026-10-16T07-24-46-804Z/result.json`。第四批草稿在该回归期间只存QA目录，确认终态后才接入生产与测试。

三页实际调用默认list-layout.js/CSS，共享ui.listWidth，范围180–520、默认288。真实拖动按帧更新，结束一次保存；键盘200ms合并、方向键/Shift/Home/End、双击恢复、Escape/cancel恢复。保留至少320px详情，窄屏改上下布局；迟到读取不覆盖手势，写入失败提示并可重试。GET/POST/ui/list-layout只读写一个验证过的整数，三bundled面板仅添加精确API，没为会话/聊天新增POST/config权限。191有头和无头覆盖真实UI/磁盘/失败/越权/单文件追加替换三页。

默认message-sweep.js改为详情容器一次委托，不再每切聊天增加window pointerup；补cancel/blur/hidden、模式/聊天切换和卸载清理。192真实鼠标扫选、八次切换监听器数不增、输入/checkbox独立及dispose有头/无头通过。记忆按默认active-task-ticker在有任务且可见时调度，恢复立即查后端、慢请求单飞、销毁防复活；193独立时序与192真实空闲无一秒timer通过，100原真实任务/掉线/失败/草稿回归保持。会话自己的空闲ticker尚待后续处理，不泛称全程序空闲无计时器。

第四批11不同文件13次定向全过，`batch4-2026-10-16T07-39-01-395Z/result.json`，包含70/100/121/123/169/180。git diff --check通过。新完整从441份冻结源码/测试启动：**exec35943**，`full-2026-10-16T07-42-09-959Z`；尚未读取终态，不沿用158/158证明新版本。目标仍active，完整领域未结束；当前15967未同步，没有操作真实账号、外部模型、QQ、打包部署。迁移合同见docs/list-layout-migration.md。

### 2026-10-16 0.4择优迁移第五批：创作引导及按需样式修复

35943现已真实终止：第四批完整M3 159/161、M4 10/10，441份散列一致。111/115背景编辑器因common.css新增全局list-layout.css请求失败；不忽略错误、不改旧像素/网络断言，产品改为仅会话/聊天/记忆三个使用者导入CSS，111/115及191定向恢复通过。

复读旧09-community.js创作引导，迁入默认extension-authoring.js/prompt.js/CSS，技能/插件/社区三入口共用，UI资产可独立追加替换。只读GET/extensions/authoring-context按实际appRoot提供版本及文档路径，不返回配置或Key，仅三bundled消费者有声明。提示词按当前SDK明确kind/apiVersion/目录、启用与权限、普通市场包和受信任启动组合边界，核心绑定须完整重启；不宣称落盘必生效。读取失败/重试不丢需求，复制受限全选文本，关闭清空并拒绝迟到UI更新；不安装/执行/启用/投稿。194有头/无头真实界面、受控复制桩、认证及单文件追加替换三入口通过；没有更改系统剪贴板。

9不同文件10次定向全部通过，`batch5-2026-10-16T07-57-11-799Z/result.json`，包括原111/115、在线市场161及新194。初次194把宿主认证bootstrap POST计入业务写入而失败；只排除该只读启动请求后，所有其它写请求仍必须为零。开发文档及只读inspect-composition脚本纳入未来打包声明，194检查实际文件与声明；追加脚本声明后再跑194 exit0，未打包/安装。

新完整回归**exec25796**，目录`full-2026-10-16T08-01-23-199Z`，445份冻结源码/测试，预计M3 162文件须以终态为准。期间不编辑生产/测试，先核对同一活句柄。当前15967仍未同步，没有读受限页面/旧data/凭据或操作真实账号/QQ/外部服务。目标仍active，不能按这些子项宣布全部完成。

下一步优先社区多口令交互：已纠正早期线索，旧openInstallCodeModal是分享口令，不是源码执行。0.4有多行/失焦校验/自动空行/混合类型逐项安装与部分失败汇总，0.5当前只有单项验证安装，确有UI缺口。需要稳定行ID与版本、去重、失败重试、关闭/取消和迟到回复处理，不照搬旧行下标竞态，不信任客户端旧entry作安装依据；保持安装默认停用。其它全部领域仍保留，见总计划。

### 2026-10-16 0.4择优迁移第六批：多口令与真实安装闭环

25796已真实终止exit1：M3 160/162、M4 10/10，445份源码/测试散列一致。143/154手动剥离全部imports后未注入新增bindAuthoringGuide；补独立桩并断言正确入口方向，143原元数据/HTTP断言和154原84项ZIP反馈全部保持通过，不禁用真实产品入口。194继续验证实际向导。

新增默认community/code-install-state.js和view.js，稳定行ID/revision、A-B-A与删除/取消迟到回复隔离、规范化去重、30行上限、失焦与批量校验、成功留空行、增量节点、显式顺序安装、部分失败重新校验后重试。改输入立即废除旧verified，按服务器type/_serverType显示正确类型；客户端只发code/kind，宿主再次验证并由包清单确定身份，不信任旧entry。取消/换社区页签/离页只停止未发送后缀，当前项可能完成；断连/超时/不完整响应标待核对并停止后续，不自动重放。退出禁用旧控件并移除监听；不持久化口令草稿。

195用真实默认market服务/客户端、显式上游与DNS桩、真实HTTP和生产ZIP安装器，混合类型落盘/强制停用/顶层代码未执行、部分失败只重试失败项、取消/换页停止下载后缀、后端再次校验均通过；实际追加状态机文件改变界面，原社区导航保持。196原子时序/快照不可变/容量/去重/取消与dispose通过。195初次夹具错误注入未消费依赖、随后缺bundled服务导致0 ready/503，已通过只在临时夹具复制实际market和依赖源码纠正，没有新增生产测试旁路；失败工具输出与后续通过区别记录在迁移文档。

第六批10不同文件11次定向全过，`batch6-2026-10-16T08-52-09-304Z/result.json`，含原38/161、143/154、194及195有头/无头。git diff --check过。新完整从449份冻结源码/测试启动：**exec90799**，`full-2026-10-16T08-55-04-865Z`，预计M3 164文件以终态为准。生产/测试冻结期间继续只读审查及文档，先核对同一handle，不因观察超时另启。完整目标未结束，不按几批增量收口。

当前15967仍未同步，未操作真实账号/QQ/外部服务或打包部署；本轮测试包仅在新临时副本安装且强制停用，清理均限对应fixture目录。新模块以生产文件为准，QA drafts已较旧不要再次提升。后续继续会话空闲/后台ticker、设置折叠后台/重绘、启动/更新通知及全部领域对账。详见docs/batch-code-install-migration.md。

### 2026-10-16 第七批：会话活动与后台折叠已进入完整回归

90799已终止exit0，M3 164/164、M4 10/10，449份源码/测试散列一致。新增默认session-activity模块已经接入会话生产面板：可见未来期限100ms倒计时，无节点/空闲/后台停止对应timer，活跃15秒权威GET，宿主心跳发现漏事件的新任务、hello和前台立即读，单飞与离页/选择代际隔离。倒计时结束只说等待调度，不谎称业务已开始；运行阶段纯文本及轮次/搜索数补齐。renderTrace改用逻辑折叠目标，关闭动画中刷新不再恢复为展开。

197设置真实WAAPI关闭中重读/展开状态/减弱动态和198会话实际计时器、丢session SSE、列表与选中详情终态、空闲漏新任务、HTML形状阶段文本、嵌套详情重绘、单文件追加替换均有头/无头通过。真实后台最初受Playwright强制focus覆盖，最后仅连接本轮新建独占浏览器临时profile所给端点，以默认context noDefaults让页签真实变hidden；缺enable-automation的命令行查询失败已保留工具输出，补测试参数后通过，未改产品可见性或伪造事件。9次定向全部通过，batch7-2026-10-16T09-42-46-419Z/result.json，含193/123/185/100/70。另一次错误引用不存在的123文件仅为命令路径错误，随后用实际123-session-follow-readiness-test通过，不当作产品失败。git diff --check exit0。

新完整冻结453份源码/测试：**exec57574**，full-2026-10-16T09-44-11-988Z；先读同一handle真实终态，期间不编辑源码/测试，不因观察超时重启。预计M3 166须以实际结果为准。当前完整目标active，不能以本批结束全目标。

继续复读旧启动/版本更新得出下一批缺口：浏览器宿主无自动检查，Electron硬编码另有定时；默认后端已有可替换runtime.priceUpdates/updateCheck，设置只输出JSON，shell只有桌面事件短暂纯文本toast，缺可操作入口、关闭抑制和设置持久提醒。旧ui.refreshMs动态调度与新会话固定15秒需明确对账；不在冻结运行中改代码。具体原子矩阵见总计划/会话迁移文档。当前15967未同步，未读旧data/凭据，未操作真实业务或打包。

第七批续记：57574已真实exit0，M3 166/166、M4 10/10，453份源码/测试散列一致，日志SHA256为37e865ede147ddf27483d1d11ce2cb4841fb85f907f543f05602b28ff7a57509。冻结期间独立补查证实详情等待时钟停留，QA草稿在临时副本有头/无头通过后，等此终态才正式修改activity接受detail、观察双根，并增强198同步/过滤断言。第二轮9次定向全部通过，`batch7-2026-10-16T09-56-25-384Z/result.json`，git diff --check exit0。首轮全量不能证明补查修复，故另起新冻结完整**exec13147**：`full-2026-10-16T09-58-03-831Z`，453份源码/测试；本段记录时运行中，尚无终态，后续先核对同一handle/result再编辑源码。旧QA修复草稿已落实，不要再次提升覆盖。当前15967仍未同步，完整目标未结束。

### 2026-10-16 第八批：更新提示默认模块与真实当前版本

13147已真实exit0：M3 166/166、M4 10/10、453份源码/测试散列一致，log SHA256为26ae15d5438fa9bceb5626ccb999686b85727346cd8726b24d9e1d30c3ac3a3a。随后复读旧11-init/10-feedback及F-014/R-62，实现默认shell/update-notice与settings/update-status：统一启动/小时/手动检查、同文档单飞、关闭后自动抑制但手动可再开、导航标记及重建恢复、版本说明纯文本、HTTPS无凭据下载入口、最近成功与失败分离、revision防迟到覆盖/忙态提前解锁、dispose清timer/DOM。新console.update只允许bundled settings，精确status/check/reveal三动作，不接收URL/令牌/安装。Electron独立硬编码直接fetch及timer移除，宿主统一走所选runtime.priceUpdates后端；默认工厂补version:VERSION，修复真实默认接口当前0.0.0问题。

199有头/无头、200权限与URL负例、201实际追加后台工厂/真实认证HTTP通过；199真实单文件追加宿主策略改变原settings消费者，未重写后端来伪造替换。16次定向全部通过，batch8-2026-10-16T11-01-41-388Z/result.json，含33/173/175/131/125/116/182/184/69/83/95/194；随后增强199有头/无头及34/72隔离后的原断言通过。199最初超时只是驱动还在models分区而等隐藏desktop widget，实际切分区后全部断言保持。一次自动审批处理超时未启动用例，按允许重试一次后成功，不是权限拒绝或测试失败。

旧33首次默认appRoot扫描了工作目录扩展并尝试回环默认协议，被拒绝；不得称首次完全离线。随后改为空临时appRoot/被动协议/离线价格且原37项过。其它浏览器夹具补齐updateCheck合成源；34/72也复制UI到临时appRoot，不再扫描安装扩展或默认连协议。72去掉固定9454和默认Chrome profile，改为本轮临时profile生成的随机端口+UUID浏览器端点，在同一个已绑定会话上选目标，原换色/导航/异常断言保持。没有访问当前15967。QA一批离线依赖完成索引见update-fixture-completion.json，不代表产品真实源被测试桩替换。

完整合同见docs/update-notice-migration.md及architecture-composition §8。git diff --check exit0。新完整**exec44328**，full-2026-10-16T11-21-39-880Z，458份冻结源码/测试，预计M3 169+M4 10须以终态为准；期间不改生产/正式测试，不因观察超时重启。所有wire/complete-fixture QA脚本已执行，不要重跑覆盖。下一批继续ui.refreshMs各消费者、SSE高频合批、启动引导及其余全部领域，目标active；当前控制台未同步，未打包部署或操作真实账号/QQ。


### 2026-10-16 第九批续行：动态刷新、事件合批与未关闭事项

44328已终态exit0（M3 169/169、M4 10/10、458散列一致）。随后接入可追加替换的共享refresh-policy、动态active-task-ticker与session-activity；面板握手补发当前刷新策略。会话SSE合并80ms批次、列表单飞与尾读、隐藏缓冲、详情独立读取，101事件实测由101列表+101详情降为2列表+1详情，单飞最大1。17次定向通过，见batch9-2026-10-16T13-02-48-209Z/result.json。

最近完整exec62297已经真实exit1，full-2026-10-16T13-16-21-637Z/result.json：M3 169/171、M4 10/10、462份源码/测试未变。169暂停假时钟未推进新增80ms队列；180首次点击动画采样存在GPU长帧，原始失败证据保留。169已修夹具交付同步及总500ms时序，尚待定向复验；180由motion180_diagnosis继续独立诊断，不能降低阈值或重跑挑绿。当前无完整回归冻结。

终态后已合入：同startedAt会话按实际事件followId跟随；configUpdated仅进入单飞config读取队列，不再顺带查询status/QQ进程；旧config读取用代际拦截。63690已真实exit0，203纯时序和增强202真实浏览器全部通过（包括followId与追加共享策略同时替换宿主/会话消费者）。QA promote-follow-config-fix.mjs已执行，不得重复提升旧草稿。117与169及相关定向尚待，后续新的冻结全量才可证明最终版本。

另外两位代理只读复读核心业务、启动和记忆，已提出须核验的原子差异：活跃开关/统一峰谷、运行期未触发消息重复判定、记忆标题/选中/成员备注呈现及备注整表覆盖并发；未因发现候选就宣称已修。完整旧版择优迁移目标保持active。最新认证要求已复核：正常本机自动认证既有实现和历史证据在docs/local-console-auth.md，正在补初次认证失败时的自动恢复路径，后台守卫保留；当前15967未访问或同步。


第十批核心实现已完成定向核证：默认编排器的机械前缀一次判定、活跃关闭、统一峰谷及主动禁言闸已修，捆绑提醒时间边界已修。204 12/12、205 3/3及18/21/56/82/47/m4-active-memory退出0，证据.qa-local/204-core-parity/result.json；源仍可由真实core.orchestrator追加包装替换。上下文0/500另行只读复现，尚未修。
记忆排序206已通过，207及旧100/145/169浏览器仍由同一代理顺序验证；180已用私有served-only轻绘制候选改善首点中间帧，正在落CSS并等待最终14项/有头/无头验证，不能提前声称已关闭。当前无完整冻结，agents仍会写其各自负责文件。
独立notes-before-repair.json真实复现两项后续必修：两个UID各自修改但整表POST使另一UID变更丢失；成员+备注PUT在配置rename失败后返回500但成员已改变。该报告是缺陷基线，不是通过验收；没有改生产路由或真实数据。后续应做按UID乐观并发事务并明确跨文件失败，不照搬旧版深合并无法删除的写法。


第十批继续（当前无完整冻结）：记忆206排序及207视图有头/无头已通过，原100/145/169原断言通过。其后root真实复现备注问题并新增独立member-notes控制器/GET+PUT单UID精确API；208真实HTTP并发、冲突、清空/重读、故障与追加控制器回退通过。最初208误用字符串动态路由和未声明internal事件订阅导致夹具失败，已按真实合同纠正，原负例/并发断言保持，失败输出保留；不是放宽路由守卫。面板独立备注/create分支接新API，增强207两次有头/无头均终态过；部分成功503重试已用自身回执基线避免自冲突、核对GET不采纳外部值，真正冲突仍保留草稿。手工成员+备注跨文件问题仍未修。
root已将100/125改为临时appRoot，100只复制memory-service/memory-tools实际默认源码并阻断外域，125不再扫描已安装扩展；新夹具待定向验证。不要用旧100绿掩盖其曾扫描installed skills的事实。
核心上下文实际基线0→80、600→499已留档；同一代理已修默认orchestrator/prompt并以209实际runner/LLM/磁盘、1/3/4档和anchor正交验证15项通过，正在整理最终证据。复用既有全量有效投影，不新增第二次全档读取，0/80实际prompt保持0/80。
180轻绘制CSS实际有头/无头各14/14；168观察固定真实sleep结束后CSS动画仍running，正以原生ready/finished替代固定sleep并保持虚拟时钟/原阈值，待最终双模式回归。run-m3已纳入204至209，预计下一完整177文件+M4 10，须以终态为准。各代理尚未全部停止改动，不能提前启动冻结或宣称全绿。


**最新冻结指针（覆盖前述未冻结状态）**：当前唯一完整回归活句柄exec15510，目录full-2026-10-16T14-47-01-210Z，startedAt=2026-10-16T14:47:06.601Z，469份生产/测试文件冻结，预计M3 177、M4 10须以终态为准。所有代理已明确停止生产/正式测试修改，仅只读审计后续领域。不得因观察超时重启或在该轮期间编辑源码/测试。
180最终有头/无头各14项与额外一次无头全过；168用原生动画生命周期门后双模式各13项过且虚拟时钟不进、取消可结束。test180字节未改。最新206/207及208/209和核心旧回归均已通过各自定向，日志见motion180-diagnosis/diagnosis-summary.json及204-core-parity/context-implementation/result.json。root10-2026-10-16T14-41-54-979Z原始结果5/6，唯一100隔离夹具缺方言依赖；补完整llm-dialects实际扩展并按真实active检查后，100完整原工作流exec3278已真实exit0。125隔离后原全部断言也exit0。不能把root10旧5/6覆盖成6/6；最终覆盖由此新full提供。
当前15967仍未访问或更新，未打包/部署；用户完整择优迁移目标仍active。已知待办至少含首启引导、记忆跨页选择、手工成员+备注跨文件事务、人设模板/分会话交互及所有其它领域，不能据这批终态提前完成目标。


冻结15510运行中已确认74旧断言与新目标冲突：test/74-runtime-repair-test.mjs:142要求机械不触发前缀old.read=false，新204所证实并迁入的语义为立即标读沉历史/不重判。该文件其余26项过；源/测试仍未修改。必须等待本轮终态后修74为已读，并增强实际prompt已读区包含前缀、触发区不混入及磁盘重读断言。此失败原log/result必须保留，不改写成通过。


冻结15510的第二项旧测试不匹配为80：真实记忆列表已显示“测试群”，而test/80-ui-spec-completion-test.mjs:119仍用strong文本group:100定位。终态后应改用稳定data-memory-chat=group:100定位，并显式验证展示标题及title原ID，保留后续全部编辑/备注/群成员/整理/用量/社区断言。冻结中不修改。
只读媒体对账确认：0.4 GIF/video转码和图片压缩使用min(max,iw/ih)避免放大；0.5 bundled/media-service/reader.js:158/169/177/260/281使用固定scale盒，较小输入也会放大，下一批需真实尺寸/字节/子进程/清理测试。GIF拒收降首帧不能仅凭旧注释判断已是默认完整路径，须追image-compat/retry-advisor实际提供者后再裁决。保留新版回环/本地路径控制、200MB流式上限、输出上限、AbortSignal/close清子进程及服务能力可替换。native模式无URL转meta与旧resolveVideoRoute一致，不作为缺口；新来源校验更强不放宽。


**第十批最终接续指针，覆盖旧活任务**：15510已真实exit1，full-2026-10-16T14-47-01-210Z/result.json：M3 175/177、M4 10/10、469份散列一致，log SHA=97b11349b55719f5f1bc87747d708cd49c9215786131f6fb3dcf49515e6d1787。169/180与204–209在该完整中全部通过，失败仅74旧old.read=false与80按raw群ID文本定位。终态之后只改这两个测试：74新增已读区/未读区及磁盘重读断言，27/27过；80改稳定data-memory-chat并验证群名+title原ID，全部后续八面板/RPC/落盘断言原样通过。post-full10-test-alignment.json逐469文件核对，生产源码一字未变。原175/177记录保留，不能覆盖成177/177。

**当前唯一完整活句柄exec46696**，full-2026-10-16T15-07-58-429Z，startedAt=2026-10-16T15:07:58.495Z，469份冻结源码/测试，预计M3 177、M4 10仍须读真实终态。先核对同一handle/result，运行中不得改生产或正式测试，不因观察超时重启。所有代理均已停止源/测试修改，只读审计报告已归档或整合进v04-parity-plan。

本轮正式范围：自动认证首次暂态故障恢复（正常路径原已具备、后台守卫保留）；共享动态刷新和事件合批/实际followID；轻绘制删除CSS与168双时钟同步；核心机械前缀/活跃/统一峰谷/主动禁言/提醒边界；历史0/80/600及anchor；记忆名称/高亮/折叠/排序/身份搜索；独立备注及create前按UID事务/冲突/部分成功重试。新增204–209六份测试已进M3。100现隔离三项实际依赖closure，125临时空扩展根，均通过；早期漏依赖/active状态误读及root10旧5/6失败不抹去。

后续仍按完整目标推进：先读46696终态；若绿则继续真实复现并修旧工具compat04 schema/execute/context及setup+providers/hooks、搜索真实消费model/业务错误/双源；人设模板稳定ID/所选personaText/规则重置、分会话继承及表单字段事务；首启可替换策略、记忆跨页状态、手动成员与备注跨文件失败；媒体避免放大与其它全部未对账领域。原子索引72/895不是完成度。详见docs/v04-parity-plan.md、core-behavior-parity.md、memory-view-migration.md、refresh-policy-migration.md；工具只读报告在204-core-parity/tools-skills-audit.md。不要把当前几批测试绿当全目标完成。当前15967未访问/同步，未打包或部署。

## 2026-10-16 第十批完整终态与下一批（当前无完整冻结）

exec46696 已真实终止 exit0：`full-2026-10-16T15-07-58-429Z/result.json`，M3 **177/177**、M4 **10/10**，469份源码/测试散列未变。startedAt=2026-10-16T15:07:58.495Z，finishedAt=2026-10-16T15:22:21.097Z；log SHA256=567ad825a778712040b4e13766272324230820d3d09495532736a3084079079d。此终态覆盖第十批实际实现；早前175/177等失败产物保留。完整旧版迁移目标仍active，不以本批结束总目标。

源码冻结已解除。当前三位代理分别负责：compat04 adapter/loader/runner及210、人设模板controller/独立persona策略/settings及211、手工成员+备注诚实分步保存及212。root负责公共路由/默认工厂/manifest精确接线、37稳定ID断言和媒体避免放大213。测试编号210–213已分配；模块存在后才接线，避免中间缺失import。root曾提前import尚不存在member-editor导致37及私有210加载失败，已撤回该接线且37实际10/10；失败不归因为产品测试已执行。

自动认证只读复核通过主要链路：初次5xx自动恢复、认证401有界重放和去重、显式错误令牌不自动换身份、插件取不到bootstrap；当前完整覆盖182的监听器关闭重开和令牌轮换，未直接模拟整个新进程重启。403/404/405停止恢复卡定时，后续共享API的401仍可再尝试bootstrap；持续拒绝不可能取得新令牌。当前15967仍未访问或同步，没有打包或部署。

## 2026-10-16 第十一批已收敛，完整冻结执行中

210旧技能兼容实际9项、211人设模板/继承有头及无头、212成员分步保存有头/无头各13项、213真实原生媒体尺寸/取消/清理、214搜索实际9项均已通过。root额外15份和9份定向链分别全exit0（exec25167/24056）；37/31稳定ID合同更新后原DTO与路由链保留。git diff --check独立exit0。QA真实不同PID服务重启认证无头/有头均通过：同owned随机端口、新令牌、恰一次bootstrap恢复API/SSE、原iframe及草稿保留、无令牌表单/插件泄露，现有15967未被访问。

完整冻结唯一活句柄 **exec11807**，`full-2026-10-16T15-49-17-375Z`，startedAt=2026-10-16T15:49:17.444Z，**478**份生产/测试文件，预计M3 **182**文件及M4 **10**，必须以终态为准。所有代理正式源/测试已停止，后续仅QA私有草稿/文档；不得改src/bundled/ui/electron/assets/scripts/package.json/test/*.mjs，不因观察超时重启。先轮询同一handle并读result，不能提前称全绿。

第十一批实际合同见docs/core-behavior-parity.md、persona-template-migration.md、memory-view-migration.md、media-processing-parity.md、local-console-auth.md。成员+备注是诚实分阶段回执，**不是**两文件原子事务；旧无expected客户端明确concurrency.checked=false，新UI双CAS并只重试未保存部分。首个成员写失败不碰备注，后续配置失败207让已保存成员与草稿可核对。

213首次夹具1800修改前的2000×1000真实PNG超过默认5MB，正确被拒；已改为原限额内1800×900，不放宽上限。媒体基线probe首次相对模块路径多退一级，未进入产品调用；修正后五条原放大均真实复现，正式修复后15组输出/36子进程/16临时目录通过。所有基线与失败工具输出保留。

后续完整范围仍active：215分会话表单+字段事务(含bareID来源)、216图搜双源恢复、217跨页选择宿主窄状态、218首启默认导航均仅QA设计/候选阶段，未正式实现。新全量运行中不提升草稿；当前15967仍未同步，没有打包、部署或真实QQ/账号测试。

## 第十一批完整终态（覆盖exec11807活指针）

exec11807 已真实exit0：full-2026-10-16T15-49-17-375Z/result.json，M3 **182/182**、M4 **10/10**、**478**文件前后哈希一致。finishedAt=2026-10-16T16:04:34.487Z，log SHA256=b44f73760a30a23324a2d152a3d55a1fd02d3f66821476ddb02e5669f59b8635。此轮覆盖正式210–214，不覆盖后续候选。源码冻结已解除，当前没有完整运行。

下一批正式工作开始：215分会话人设UI/字段事务；216图搜双来源与独立能力；217宿主临时快照及可信选中UI元数据；root218首启策略和219思考参数。此前215–218 QA证据均明确productionIntegrated:false或私有候选，不冒充已实现。root新219-audit真实LLM序列化基线确认thinkingEffort=off仍发enabled(DeepSeek)或off(OpenAI)；auto默认也被强行启用。该基线是缺陷复现，未改生产。

各代理不碰公共root集成文件，模块创建后root才接线；root与persona代理需仅在settings-section事件/初始化一小块协调同文件。当前15967未访问/同步，完整旧版择优迁移目标active；未打包或部署。

## 第十二批已实施，当前完整冻结49580

215分会话人设正式有头/无头各16组；216实际双源图搜11组；217宿主窄状态HTTP6组、有头/无头各10组；218首启真实有头/无头各21组；219思考意图实际请求10组均通过。217包含172/177实际9代UI更换/撤销，218只追加一个自包含策略文件及停用回退；配置迟到、runtime代际失效、销毁后不复挂/不重开SSE均有独立用例。具体合同见docs/persona-template-migration、memory-view-migration、startup-navigation、thinking-policy-migration及各QA正式报告。

122已改空扩展根隔离，原地图/密钥/草稿/并发断言保持并exit0；85双源真实调用数更新5→6且核对所配Bing地址，86旧thinking-off温度断言按实际关闭语义修正后全文件过。新首启引导使未配置夹具自然进入设置，因此仅为原本专测sessions的116/123/134/167/169/182补明确合成ready配置，六文件顺序exec48946真实6/6，旧全部业务断言保留。首次定向命令猜错116文件名而停止，86当次已exit0；没有把命令失败改写成整链通过。

**当前唯一完整活句柄exec49580**，full-2026-10-16T16-48-28-917Z，startedAt=2026-10-16T16:48:28.998Z，490份生产/测试文件冻结，预计M3 187、M4 10，须等待真实终态。所有代理正式源码/测试停止，仅独占QA/只读/文档；不要因观察超时重启或在本轮修改冻结文件。当前15967仍未访问/同步，没有打包、部署或真实QQ/账号/远端模型。

完整迁移目标仍active。冻结期间进一步真实离线基线已确认方言主机/型号、拒收判断和Qwen预算剥离五组后续缺口，13场景记录在thinking-next-audit-core，不能说219已修这些分支。关键词按空格误拆和空名单选择仍由同一代理核对；媒体注释承诺的GIF扩展在旧空plugins根没有实现，需区分默认行为与可选扩展合同，不凭缺名判回归。反馈草稿旧localStorage保存而新关闭即丢也在继续对账，尚未修复。

## 第十二批真实终态及第十三批（当前无完整冻结）

exec49580 已真实exit1：full-2026-10-16T16-48-28-917Z/result.json，M3 **185/187**、M4 **10/10**、**490**文件哈希一致，结束2026-10-16T17:05:26.623Z；log SHA256=50e0051fc276b94e1477ea61139650088b05a18c33f64ba7eb08daa984c5a7f6。215–219在该全量均过，失败80与211，不能改写为全绿。

80失败实际复现为renderCapabilityProviders在await GET之前快照旧选择/展开状态：用户等待期间改选会被响应覆盖，按钮再次禁用。root仅把两份DOM快照移到响应提交前；223新真实合成插件/HTTP/浏览器6组有头和无头均exit0，包括旧源选择失效、保存失败重试、单文件追加与停用恢复。原80完整工作流及143/154顺序exec77022三文件exit0。新223夹具最初DTO用错entry.manifest.id、误等折叠行visible、role查询排除hidden、换代前未卸载旧页面造成严格origin门抓到旧owned请求，均已精确修正夹具，全部原业务断言和外发门保持，失败工具输出保留。

211原样加QA观察在有头/无头各exit0，未复现全量DELETE超时；两组原生click间隔均小于500ms，不能据此宣称查明原失败。root把两处要求“连续两击”的测试动作改为native dblclick(delay70ms)，并断言data-danger-clicks=2，避免独立locator.click的actionability等待没有间隔上界；原真实200/409/CAS/草稿/角色/磁盘断言全保持，产品500ms、衰减和删除次数一字未改。新版本211仍待browser窗口交还后复验。

正式220思考方言/错误回退10/10与六份相关旧回归通过；222URI/实际发送队列27/27及10/16/77/171通过；221关键词/名单/分群离线候选HTTP3组、有头/无头各10组通过，源均已停止。root负责M3新220–225接线（224/225尚实施中，文件出现后才加入）。224反馈草稿已真实复现旧UI取消/切页丢失，typed controller与routes/default factory/community三项API声明已接，UI/state由motion继续验证；不扩大通用宿主RAM状态或传入令牌。225遥测已按DSH-ARCH§10.4明确旧7字段/200工具上限核验缺陷，由core代理正式修，未声称线上拒收。

夹具安全另单独收口：83曾默认扫描已装扩展，不能把那次exit0称隔离；现只隔离83并复核117/125，后两者已有临时appRoot。只读已确认69/90/106/108/110/102也会默认loader扫描，root授权专门隔离、原业务断言不变，102必须真实记忆服务依赖closure，不能用空扩展冒充consolidate。124已仅隔离真实community/market两默认依赖并显式清合成草稿分场景，原cancel后全空期望按新保留语义调整，其余CAPTCHA/Reader/字段/隐私断言保持，仍待复验。任何未复核夹具不再为凑绿直接运行。

当前没有完整活句柄/冻结；motion持browser做224，startup只做夹具及等交接，core225纯/服务回归，root不并行开browser。现15967仍未访问/同步，不打包/部署，不运行真实QQ、账号或远端模型。完整旧版择优迁移目标active，峰谷时间/预设、价格参考、可选reply consumer及其它剩余领域仍未全对账。

## 第十三批定向收敛，待新冻结

224正式最终有头/无头各14/14、10个start/stop snapshots每模式均entries=[]，全部outbound/blocked/errors空；root已接console.feedbackDraft及固定三API/manifest，31/35/50/52/222回归过。225正式实际默认loader/SDK/service9/9，60累计/wire34断言、61、89及86遥测3项过，6份源/测试停止；60/86更正错误wire断言，61/86有待取消请求的夹具补明确非零合成用量。root220–225实际6份文件已纳入M3，预期193+10必须新完整终态。

root顺序exec91199：隔离后的124完整投稿替身/CAPTCHA/Reader/隐私链、211新连续两击、122原字段地图事务三文件exit0；211有头另一次exit0，原完整业务断言保持。新反馈语义要求取消保留，124仅把原cancel后空值改为保留并在独立场景明确UI双击清草稿，全部公开字段/不泄露/验证码/取消计数保留。root30/31及35/36/37/173四文件新路由/组合定向均exit0；首次命令猜错35文件名在30/31已过后中断，该失败保留，不冒充整链绿。

夹具隔离正式第一批83/69/90/102/106/108/110顺序7/7，第二批101 plainNode及133/134/164/166/136顺序6/6，全真实exit0；13文件原业务assert保留。133保留真实本地模型origin，134保留真实OneBot provider/LocalActionClient；102保留真实三默认依赖consolidate；101只mockElectron窗口/外壳，136主程序与真worker共享reset数据外的appRoot、真实备份/故障/新进程重启。Node fetch/DNS和browser owned-origin门实际生效，136worker终态也回报entries[]/outbound0/DNS0，不只是构造参数。所有浏览器/worker/kernel已退出，见fixture-isolation-batch报告/逐项result。

当前正式生产及已交付测试均停止，startup尚补最后只读余项清单后root再开全量，不能把旧49580失败覆盖。core仅QA复现后续峰谷非法时段，motion仅QA审Markdown/表情剩余路径，二者无生产授权；15967依旧未同步/访问、无打包部署。完整目标active，仍有未裁决原子范围。

## 2026-10-17 测试启动边界补全与认证再核验

此前13份隔离后，startup补70/71/73/95/99共18份真实exit0；core补25/49/75/130四份，25原77断言、49原92断言、75实际媒体取消排队、130完整7/7通过。130最初Chromium spawn EPERM原失败保留，按正式审批重跑同一隔离源码才完整通过。motion补114/118/120/127/142/149/161七份，实际可信依赖、CAPTCHA/公开字段/隐私断言保持且逐份exit0。root109/119/121/141/155五份原业务链真实5/5；最后63由默认工作区CLI/固定端口/调试端口改为真实kernel+临时空扩展根+随机端口+Playwright自有浏览器，保留全部设计系统/换色/宽窄布局业务断言，实际exit0；仅删除不再使用的CDP调试目标断言，资源可读断言仍真实HTTP验证。此阶段35份新隔离文件，不是项目功能完成计数。

root新增测试专用console-fixture-isolation helper，被63及上述root五份、motion七份使用。原通过产物使用当时helper哈希；后续仅补callback DNS与promise DNS双门、literal回环合成响应与ESM导出同步，guard-probe六项负例真实exit0，没有外网连接或OS DNS。63在最终helper下实际通过，其余将由新冻结完整回归验证，不能把早期helper通过当最终字节通过。

自动认证本轮又实际复核181/183均exit0，182真实Chromium完整exit0，生产认证模块未改变；此前不同PID真实重启的有头/无头证据仍见docs/local-console-auth.md。15967仍未访问或同步。当前源码未冻结，下一步只开一次完整回归，所有代理正式源/test停止，仅私有只读或纯离线QA；完整旧版择优迁移目标active。

**当前唯一完整冻结活句柄exec86353**：`full-2026-10-16T18-06-32-191Z`，startedAt=2026-10-16T18:06:32.257Z，**501**份生产/测试文件，预计M3 **193**、M4 **10**须以实际终态为准。所有代理已收到停写生产/正式测试指令，root也不再改冻结文件；不因观察超时另启完整运行。先查此result/同一exec终态，完整迁移目标不因本批绿而完成。

## 2026-10-17 第十三批终态与下一批

中断后重新轮询同一86353，已真实exit1：M3 **191/193**、M4 **10/10**、501文件前后哈希不变，finishedAt=2026-10-16T18:23:33.500Z，log SHA256=4c0f6fee38a4fbfea49a95cb8fe01224dba853b85a330c0c4d0a8d9ab419fbb7。当前501文件又逐项核对无漂移；本轮35隔离文件除119导航外全部通过，认证与220–225正式测试也通过；不能把本轮改写为193/193。

64旧静态测试漏PUT，生产真实normalizer已实际接受14条社区声明。终态后只对齐64方法集合，并增加实际createPanelAdapters规范化后全部api精确保留断言，完整64已exit0。119受控私有浏览器诊断真实复现：启动引导先入access，再点已选settings仍access、provider-name确实隐藏；用实际models分区链接后完整原渠道/metadata/密钥/磁盘链exit0。正式119仅增加该分区选择/可见等待，保留所有原业务断言，定向待当前句柄终态。没有改产品导航/认证/访问限制来适配测试。

源码冻结已解除，正式下一批：core226局部峰谷时段；motion227共享文本/Unicode与所选converter消费/提醒一次准备；startup228价格参考与窄事务、229峰谷预设/custom不激活及窄事务。root负责所有公共默认工厂/routes/manifest/M3接线，并继续可选reply消费者230的实际缺陷核证；模块不存在前不import。代理分文件，orchestrator先由core只改上部时段，再释放给motion提醒段，禁止旧整份副本覆盖。当前无新完整运行，不访问/更新15967，不打包部署，完整目标保持active。

## 第十四批实际接线与当前未冻结范围

64/119正式顺序定向已真实2/2 exit0，完整原业务断言保留；119强制等待实际access启动的私有诊断也完整exit0。226正式49/49及18/204/205/209通过；227正式15/15及16/18/96/205/213/222通过，213真实36子进程/16临时目录收束。已新增send-text默认模块与core.text.split真实消费，提醒保存prepared物理计划，未成功后缀不重复转换；226后orchestrator写权已正常交接，没有旧整副本覆盖。

228/229已落独立默认UI/窄控制器，root接console.modelPrices/console.peakSchedule、四GET/PUT及settings RAM keys与五bootScripts，实际所选价格resolver消费保留。228有头/无头各7组、229各8组，83/33/146/173均过；但root发现8个脏模型/2目标把缓存容量变成了业务编辑上限，现已重新授权startup改良大草稿：当前页面允许继续批量编辑，跨页缓存超限时诚实提示并防止陈旧子集恢复；此前边界通过不代表这一改良已完成。

root230新增默认可选reply rescue与core.reply.rescue，接受旧inline对象calls/args并保留现代数组合同，原句/规划/裁判/grounding/取消/超时/代际与正常tool/queue/archive已正式15/15；首轮两子例失败后修allSent纳入session.sent与空原文不执行替换rescue，又补grounded trace不能伪造来源原句。78/59先过。当前motion只读审查230，正核真实sent shape及权限/队列迟到边界，尚不能称230已完整收口，root暂不改其三源/test文件。

core231表情同步与收藏在实施：真实list及prompt await sync，kernel facet/协议动作及lazy prompt在构造后安装，实例构造自身不联网。root注入providerLease捕获实际权限receipt/loader代，提供者单独撤权或deny→allow也不能用新授权复活旧结果；caller/账号/owner/version/lifecycle仍由manager核对。231首轮41组通过但仍增强三闸/故障等，未停源。M3只纳入已经存在的226–230五文件，231文件完成后再接。

root共享集成顺序8/8 exit0：30/两31/78/59/89/226/227，覆盖实际路由声明、SDK保护和两共享源业务。当前没有完整冻结/活全量，不把旧86353的191/193改成全绿。15967仍未访问/同步，无打包部署，整个旧版择优迁移目标active。

## 第十四批独立复核后的真实修复

230只读probe在真实loader→core.tools.bundle→registry→SDK→core-tools→SendQueue复现：①真实session.sent没有type，超过默认8秒去重窗后同句复发；②来源已停用但尚未到transport的排队proposal仍发送。原始坏源码与probe保留在reply230-readonly-review，probe exit0表示确认两个坏行为。root修为统一真实/typed文本acknowledged，并返回signal/dispose来源lease直到runner工具finally；新execContext合并run/context/lease取消，dispose也abort残留queue。正式230现在21/21，含同一provider重注册、caller cancel、真实慢模型无type receipt、监听释放。230/78/59顺序3/3 exit0（batch11-targets-2026-10-17T06-08-02-900Z）；独立代理已只读确认修点与真实路径吻合，未发现这两改动新增可执行缺陷。

231最后56/56真实exit0，三阶段image/add/note×register/account/cancel/stop及权限receipt、远端ack后错误、配额/序列、实际prompt/list/追加禁用覆盖。root又真实顺序231/89/96三文件3/3 exit0（batch11-targets-2026-10-17T06-09-35-496Z）。core停源，仅整理文档。M3已补231，下一完整预期199+10。

228/229当前无头大草稿8组/9组真实exit0，有头仍在进行；暂未冻结。旧local-policy/inline另批10case合同基线确认5项expected failures，原始IO门[]，不把基线exit0叫产品修复。根计划及架构合同已补本批真实可替换策略/控制器，完整目标仍active。

冻结期默认配置补查：旧152叶/新164叶不存在缺名，但17个值差异全部webSearch，不能据键名对等。root实际新bundled搜索5个内置渠道仅选+syntheticKey均在baseUrl空时失败，手填旧/现UI共同声明的endpoint则各成功1次；5expected failures+5正控制，无网络、源不变。证据community-contract-audit-root/search-defaults-*；214原自定义搜索测试不覆盖零地址默认。后续需恢复可替换默认策略和实际consumer，型号/线上接口有效性本轮未校验，不把内存Response称远端通过。

## 第十四批完整终态（覆盖69360活指针）

同一exec69360已真实exit1，finishedAt=2026-10-17T06:26:08.739Z：M3 **197/199**、M4 **10/10**、**516**份生产/测试文件前后散列一致；log SHA256=7cbcc17ae954bd1986bed211382f118e75f625055cd0e4ea8410ab8c789f09d8，目录full-2026-10-17T06-10-57-628Z。新226–231、认证181–183及此前64/119均在本轮通过，不能改写两项失败为全绿。

只有70与91失败：70在第三视口已过几何assert后，导航access click出现browser/context/page closed，因果未知；91实际成功发送并保存QA_LOCAL_SYNTHETIC，旧断言仍期望QALOCALSYNTHETIC，需按227字面标识符合同对齐并补physical/receipt/archive一致性。现无完整活句柄/冻结，但为70预备诊断保留其247相关文件不变；motion独占浏览器执行原业务断言+生命周期事件的QA副本，root暂不改91/相关生产，其他代理只读/QA。待此终态再开展下一批正式修复，不能重启旧full或拿部分绿完成总目标。

完整后续目标仍active：reply五原子、默认搜索五渠道及精确自定义endpoint/结果总上限、群成员屏蔽便利/窄事务、社区有效豁免/兜底、暂停恢复跳过积压、会话/存档跨页选择、OneBot身份/群名片/原因链/重连候选及其它未裁决领域。独立QA原始失败全部保留，无真实15967/账号/QQ/外网/打包部署。

第十五批目前状态与写权详见task_plan最后一节：70唯一带事件原样诊断真实exit0但原关闭原因未知；91修旧期望并增强protocol/receipt/archive实际exit0；root232新独立默认parser真实19/19，232/230/78三文件3/3，M3仅补232（当前预计200）。新234、235、236、237仍实施/验证中，有头窗口motion独占，暂不再full。root已接blocklistMembers窄controller/API/manifest、sessions/chats导航RAM声明、market factory传signal；这些共享接线未被旧69360终态覆盖。root233默认搜索和inline来源/local-policy剩余原子尚待，不得提前宣称完整迁移或新全量绿。

最新覆盖：三代理234–237已全部正式停源交付，报告及边界见task_plan最新节；root当前仍无新full冻结。最新本机自动认证复核7专项文件全部actual exit0，含182有头11项；真实退出/新PID新令牌恢复5项也actual exit0，外网和页面错误均0。旧重启QA因未配置模型而进入设置、搜索框超时的首轮失败保留，仅补惰性合成seed，不放宽产品或断言。详见docs/local-console-auth.md最后节及`auth-recheck-20261017/README.md`。现有15967未访问、同步或重启；总迁移目标仍active，不用专项通过代称新全量通过。

**当前最新完整活句柄exec65084**：full-2026-10-17T07-29-43-497Z，07:29:43.556Z启动，537源码/测试冻结，M3实际注册209、M4预计10，未终态。233 29项、238 29项、239 9组、240 3组、241 26项及相应旧定向均真实exit0后纳入；具体新合同见search-defaults-migration/reply-provider-lifecycle/pause-navigation及QA239。静态预检原regex漏算run-m2，已仅修QA并核对209；这不修改冻结源码或重启full。下一步先同一handle实际终态，再处理高级名单整字段CAS、discovery有效集合、关闭窗口最后保存及剩余领域；不以当前批次完成总目标。


## 当前状态覆盖：65084已中断，未完成

full-2026-10-17T07-29-43-497Z 原句柄65084恢复返回 Unknown process id；只读进程检查匹配完整runner和165进程为0，未生成 result/source-after。partial log停在165，记录59、64、91、141四份失败。没有实际终态exit或完整M3/M4数字，不宣称537hash运行后一致。独占中断审计见该目录 interruption-audit.json。当前没有完整活回归/冻结，242高级原始名单CAS、243有效名单记忆发现及244设置最后保存已继续授权实施；原完整迁移目标仍active，认证专项既有通过不能代称全部回归完成。


## 第十六批与自动认证最新状态

当前无完整活回归/冻结。242高级原始三字段CAS完成，HTTP/有头/无头及122/83/234/239/38真实通过；243有效社区名单贯穿发现、模型DTO和落档，35/35与旧82 34/34通过。root已接三个可替换默认控制器/服务租约、SDK非秘密绑定、原始字段writer及发现epoch/单飞。244生命周期仍在最终lease fence和浏览器验证，不能提前称完成。

认证独立复核实际发现旧bootstrap迟到403/404/405或200可污染新代支持状态，现已按同一请求票据提交，183由20扩为26全过，181 6组全过；root真实182有头和无头各11项通过，externalRequests/pageErrors=0且productionConsoleAccessed=false。141实际状态fixture及新保存入口观察已对齐并exit0。15967未访问/同步/重启，源代码认证完成不等于现有进程已加载本批代码。全量前须等244停源并新冻结；旧65084没有终态，不得改写为通过。root详细记录在batch16-root-progress.json。


## 当前唯一完整冻结：后台PID 110876

full-2026-10-17T08-29-00-723Z，startedAt=2026-10-17T08:29:01.236Z，548份生产/测试文件已冻结；预期212 M3与10 M4。启动记录full-launch-batch16-20261017T082900623Z/launch.json，源前快照及持续日志在full目录。此进程独立于对话句柄存续，禁止再启动另一份full或在终态前改冻结源/test；当前只是已启动，不是通过。最终只认同目录result.json、实际runner状态与source-after，不以观察时长判停。

root整合21份首次20/21，唯一136在backup失败后新保存被guard/已取消unit两层拦；分别补failed态固定POST配置保存与开票、宿主专用canRecoverDraft，准备/accepted/关闭仍拒。新增raw writer并入kernel配置封锁；135实际通过。136与244最终独立两文件均actual exit0，244此轮同脚本23组；原409/503失败日志保留。认证1816组/18326项与182双浏览器11项、现有116/125/167/97兼容均过。原始名单242、记忆243、生命周期244及旧观察适配全部停源。15967未访问、同步或重启，未打包部署。整个0.4逐原子迁移目标仍active。


## 第十六批完整终态：204/212，夹具对齐中

full-2026-10-17T08-29-00-723Z 于 2026-10-17T08:44:43.548Z 实际exit1：M3 **204/212**、M4 **10/10**、548份生产/测试文件前后散列一致；日志SHA256 4a28611a74b08ba9fbb1b5f9f09ba9832dad9254092c5e8b2cd5fbdebb9adc7c。此前PID110876活指针已由此终态覆盖，没有另一份full在运行。原始8项失败全部保留：114/118/124/127/194/197把仅RAM保存租约开票POST误算业务写入；131/175临时Electron副本漏复制新增真实renderer-leave依赖，在启动断言前即模块解析失败。只授权test-only观察/依赖对齐，不改生产、阈值或删除原业务断言；补精确origin/method/path边界及配置不变证明。须先8项实际通过再新冻结full，本轮不能改称全绿。认证专项与本轮181–183通过，15967仍未访问、同步或重启，整体原子迁移目标仍active。


## 第十六批唯一新完整冻结：PID113108

8项test-only对齐实际顺序8/8 exit0（batch11-targets-2026-10-17T08-47-25-062Z）；root与前次source-after逐一核对仅8test+helper改变，生产完全不变，helper1正/12负/3保存识别均过。独立只读审查无可执行问题，原业务与外部请求/发布/权限负断言保留，6处完整配置不变断言新增，Electron真实依赖bytes相等。原204/212+10/10完整失败记录保留。

唯一活完整进程后台PID **113108**：full-2026-10-17T08-48-59-678Z，startedAt=2026-10-17T08:48:59.727Z，**548**份生产/测试文件冻结，预期M3 **212**+M4 **10**。full-launch-batch16-rerun-20261017T084859587Z/launch.json及source-before/log为证；未终态，不称通过。禁止另起full、browser或改source/test/scripts/assets，最终只认同目录result.json、实际退出及source-after。15967未访问、同步或重启，完整原子迁移目标仍active。


## 第十六批完整终态：212/212 + 10/10

唯一PID113108的full-2026-10-17T08-48-59-678Z于2026-10-17T09:06:40.456Z真实exit0：M3 **212/212**、M4 **10/10**，548份生产/测试文件运行前后散列一致，终态后当前文件又逐一核对一致。日志SHA256 47e83140f21daa6e35da58e6cd292a9fc6a0166743ba20070011c37dbe0d6ded；逐项结果及快照在同目录，汇总full-verification-batch16.json。旧204/212+10/10失败原记录保留；对齐只有8test+helper，八项已先实际8/8且独立审查无发现。认证专项1816组/18326项/182有头无头各11项和实际两PID重启5项另有证据，不能以这份全量声称访问了现有控制台。

15967本轮未访问、同步或重启，未打包部署，真实QQ/模型/账号未操作。全部0.4原子逐项择优迁移目标仍active且尚未穷尽；后续6项只读候选未实施，见v04-parity-plan最后表。完整终态后解除源码冻结，继续工作须从已记录下一批开始，不重写旧失败或把本批绿称全项目规格已闭合。


## 第十七批：六原子已迁入，唯一完整冻结PID167484

上一轮full113108真实212/212+10/10终态已验，属于progress。当前245配置诚实诊断10组+原03 50/50；246日志3原子最终9组含真实BOM失败/修复、第9组、6类隔离IO及实际SDK/GET/SSE/追加policy/default恢复；247纯10项及修前修后双浏览器、0idle与实际追加；248最终17纯HTTP+1真实UI在有头无头各exit0，原始缺名与受控权限/identity反向变体区分保存。根整合8文件8/8，随后名称未知账号守卫后最终两浏览器2文件各2/2。全部所选components/asset真实consumer、禁层恢复已覆盖，原source/test未删断言。216注册预检存在且唯一。

**唯一完整进程后台PID167484**，full-2026-10-17T09-28-21-970Z，startedAt=2026-10-17T09:28:22.038Z，**556**份源码/测试已冻结，预期**216 M3+10 M4**。full-launch-batch17-20261017T092821857Z/launch.json、source-before和run-all.log为证；目前未终态，不能称全绿。禁止新full/browser/验证或修改src/ui/bundled/electron/scripts/test/assets/package；仅只读后续模块inventory与独占QA/docs。最终只认本目录result、实际退出及source-after，不因观察超时重启。

新默认键runtime.log.policy/console.sessionNames、独立scroll-policy/chat-title叶子及诊断合同见architecture-composition§17和v04-parity-plan第十七批。15967未访问、同步或重启，不打包部署、不操作真实QQ/模型/外网。完整每原子目标仍active，不把此批六项当全域穷尽；后续三代理只读做logger/profile 全模块矩阵（不是只找缺陷）。


## 第十七批完整终态：全部通过

唯一PID167484的full-2026-10-17T09-28-21-970Z于2026-10-17T09:45:54.881Z真实status=0、signal=null：M3 **216/216**、M4 **10/10**、556份运行前后散列一致=true，终态后当前一致=true。log SHA256 a0c3de34d50241d1c72a8d0a5384ee80d7c7c1d7878b90b08dbb314eba58fef7，汇总full-verification-batch17.json；失败清单[]。此前212/212+10/10对应第十六批548文件，不覆盖本批。当前没有另一份活full；只有实际本终态才解除冻结。

245诚实备份诊断、246日志三原子/BOM字节一致性、247贴底阅读、248账号/授权来源群名展示的最终定向与双浏览器证据分别保留，完整结果按上面实际状态判定。15967未访问、同步或重启，未打包部署，不操作真实QQ/远端模型/账号。目标仍active：全部旧版原子inventory尚未穷尽，三个模块完整对账的证据缺口不可用测试总量掩盖。

## 当前目标切换：只重组设置页

按用户新目标，本轮仅修改0.5设置页，采用0.4九个主要分区、按钮模态框和可逆折叠；继续使用0.5所选UI资产与保存/权限控制器。生产范围仅settings/panel.js、style.css及新structure.js，旧源码未改。实际160条配置控件路径完整保留；旧宽泛0.4逐原子迁移不再作为当前执行范围。

进度与所有原始失败、实际通过、未完成验证详见`.qa-local/settings-structure-20261017/STATUS.md`，合同见`docs/settings-structure-migration.md`。上一批216+10不覆盖本轮；249已注册。此处旧14521活指针已由下列实际终态和新冻结覆盖。

## 设置页最终验证与唯一完整冻结

最终布局定向12/12已实际退出0；249/197有头2/2、244有头23组通过；160字段清单完整，真实保存/冲突/无效草稿/背景上传18场景保持。visual-final12张新截图已检查宽窄界面。生产改动仅设置panel/style/structure，旧参考文件未改。详见设置专用completion-audit.md和STATUS.md。

2026-10-17T12:30:29Z 唯一完整冻结PID166656，目录 `.qa-local/settings-structure-20261017/full-2026-10-17T12-30-29-822Z`，560份生产/测试文件，预计217 M3+10 M4。尚未终态，不改冻结源/测试，不另起full或浏览器。首次PID194428仅QA预检漏算run-m2，在测试执行前已退出，原stderr和failure记录保留；只改QA正则后启动本次真实full。最终只认同一目录实际result/退出和前后源散列，不以定向或旧216+10完成本目标。15967仍未访问/同步/重启，无打包部署。

## 设置页首轮终态、密钥标签修复与最终冻结

上述166656已于12:49:36.968Z真实exit0，217/217+10/10，560份前后及终态后hash一致，first-full-verification.json保留。冻结解除后的真实UI补查复现弹窗密钥已落盘而标签仍未配置；只修panel/updateSecretStates查询范围，并在249增加仍开窗写入/三击清除标签与磁盘断言，修前status1/修后status0均留档。与首轮比较仅panel和249两文件改变，post-fix-scope.json通过。

修后相关无头4/4、249/197有头2/2、244有头23组、12张新截图与9分区160字段0异常/外网/导航写入全部完成。当前唯一完整冻结PID117684，`full-2026-10-17T12-53-30-791Z`，560份，预期217+10，尚未终态；不改源/test、不另开full/browser。首次全绿不覆盖标签修复后的源，最终只认此新轮实际终态及verify-final.mjs的当前hash。范围仍仅设置页，不继续全域迁移/15967/打包部署。

## 设置页目标最终完成验证

PID117684于2026-10-17T13:12:34.426Z真实exit0：M3 **217/217**、M4 **10/10**，560份生产/测试文件运行前后及终态后当前hash一致；无失败，stderr空，进程已退出。最终日志SHA256 `2c721da26e5a3fe4e80afff0d3b621ccfe922b1a4be4048f6d1ec87ab7008c25`，终态与综合核验在settings-structure-20261017/final-verification.json。逐要求completion-audit.md全部已证实，结构/160字段/保存/草稿/并发上传/有头/窄屏/追加替换和禁用恢复均有当前证据；最后密钥标签实际写入/三击清除断言也在本轮完整日志通过。

仅本设置页目标完成，不宣称整个0.4迁移穷尽。生产范围仅settings/panel.js、style.css、新structure.js；文档settings-structure-migration.md同步。15967未访问/同步/重启，未打包或部署，不操作真实QQ/模型/账号。

## 2026-10-18 删除与重置动态撕裂接入完成

用户批准的加强版预览已进入统一 `destructive-motion.js` 默认视觉层：确认等待到100%仍持续运动，成功后独立条带错位消散，旧内容快照与列表补位协同；失败、取消、页面释放和减少动态效果均保留原业务合同。确认层、视觉层、快照与布局分离，内置页和独立插件共用；通过 `ui.assets` 只追加动效文件即可替换，未开放跨iframe DOM或后台权限。口令草稿移除与白名单清空也接入同一组件，仍不把普通勾选清除当数据删除。

最终唯一验收目录 `.qa-local/destructive-gsap-20261018/acceptance-final` 于2026-10-17T20:59:36.353Z真实结束：M3 **218/218**、M4 **10/10**，561份生产/测试代码前后hash一致；终态后当前文件与控制台15份静态资产再核对。新增250覆盖11项关键场景并另有有头通过；普通插件真实CSP/不透明iframe动态效果及受限RPC补验通过。早期候选与其失败原因保留，不能替代最终该轮结果。初始代码同步前后159份合成数据hash一致；后续仅同步UI文件，未执行真实账号或当前控制台的数据删除。测试控制台15967继续使用独立离线副本，未打安装包。接口与复现见 `docs/destructive-motion.md`。

## 2026-10-18 会话与聊天存档五处标注完成

只读对照 develop 的 `renderSessionDetail` / `chatMsgRowHtml`，默认会话详情改为工具、思考、已发送与收尾流程；移除列表装饰序号，指定聊天过滤时在首条会话上方统一显示名称/稳定键，并移除列表重复名称。存档消息使用紧凑的时间/发送者/正文列，保留详情、媒体、转发、选择、窄屏与原历史顺序。新增可由 `ui.assets` 单独替换的 `sessions/trace-view.js`，实际消费路径已用追加文件验证。

修复第一次选中删除后按钮永久 disabled：选择改变时由控制器 `refresh()` 重新计算可用性，请求/退场期间仍锁定。立即勾选下一批还复现了补位取消时机问题：pointerdown 清除暂停的 FLIP 使目标在松开前移走，现改为目标已确定的捕获 click 时清理。新251使用真实隔离应用与不透明 iframe，在不换页的同一按钮上连续删除、待响应期间再勾选、受控失败重试均通过；有头10项场景、窄屏、XSS文本与追加视图通过，外部请求0，未访问15967。198折叠回归适配正文默认展开，但仍严格验证关闭动画中刷新不得重开。180保留全部中间帧断言，将540ms+240ms动效的800ms采样终点留至1100ms，避免有头截图异步帧刚好未收尾。

本次相关回归文件61、121、168、169、180、198、247、248、250、251通过；180最终有头14/14，248 18/18，168 13/13。未重跑整套M3/M4，不把上次完整结果当本次全量结论。证据 `.qa-local/session-archive-refine-20261018/result.json`、`motion-final/result.json`、截图及 `console-ui-sync.json`。仅同步当前独立控制台8份前端文件，55份相关合成数据哈希前后一致，无需服务重启，刷新生效。说明 `docs/session-archive-presentation.md`，未打包。

## 2026-10-18 存档删除缺少动效的实际回归修复

用户实测发现存档删除直接消失。新252在真实隔离存档页以实际鼠标点击复现，修前帧记录确认：删除后的原生 scrollTop 夹紧触发 `scroll` 取消，第一帧消息已消失、ghost和shard均为0。上一轮251只验证了连续删除的行为，没有约束这个页面的实际退场帧。

共享布局叶模块现在保留自身滚动容器及祖先的自动锚点恢复，明确以滚轮、触摸、滚动键、滚动条和其他点击识别用户取消；生命周期清理不变。另将120行上限应用于保留的可见行，而非最前面的120个DOM消息，以覆盖长存档尾部。新增252有头通过底部夹紧、中段两行批量、碎片持续变化、相邻补位、真实滚轮取消及200条长存档尾部；帧记录与中间截图在 `.qa-local/archive-motion252-20261018/final-all`。共享180因两组有头窗口相互遮挡有一次进度采样失败，原证据保留；单独重跑 `shared-motion-final` 有头14/14，零异常/外部请求。61、169、250、251相关回归也通过，未重跑全套M3/M4。

仅备份并同步15967独立测试副本的 `ui/panels/destructive-layout.js`，源码与部署副本哈希一致，55份相关合成数据同步前后不变；未重启或操作真实账号。最终核对 `.qa-local/archive-motion252-20261018/final-verification.json`，刷新生效，继续支持ui.assets追加替换。

## 2026-10-18 会话卡片状态描边

会话列表以 `data-status` 消费现有状态：error 使用 --bad，waiting/aborted 使用 --warn，done 使用 --good；仅附加1px描边和轻量内发光，noreply与running保留默认样式。选中背景继续显示选择，状态边框不被选中/悬停覆盖；颜色跟随主题变量，未改业务与后端，仍为可追加替换的默认面板资产。

61前端完整性通过。独立合成应用有头核对默认/各状态、选中、主题换色、浅色和running→error即时更新，零异常和外部请求；截图与结果位于 `.qa-local/session-status-20261018`。本次为低影响样式调整，未新增正式测试或重跑全套；只备份同步会话panel.js/style.css，数据保留，无需服务重启。

## 2026-10-18 会话实时增量渲染与重复闪现修复

修前253反例在真实隔离会话页确认：选择会话会清空列表，全部卡片身份改变。现在列表按ID复用卡片、操作按钮和聊天筛选项，重复选择当前项不再读取详情；默认详情区域退出通用整块入场重播，独立折叠和删除动效保留。trace-view按稳定key更新已有节点、文本和属性，相同快照不写内容DOM，保留fold、嵌套阅读位置、焦点及关闭动画的运行时状态；仍可追加替换原公开视图函数。198的手动暂停关闭动画用例改为先核对逻辑关闭目标，再释放测试暂停、断言真实关闭，避免把保留原节点误判成未重建失败。

真实SSE事件仍由合批单飞和鉴权快照驱动，正常更新无需等待后台周期；恢复校验继续静默比对，不重建未改变内容。新253有头验证跨会话与重复选择、连续周期校验、原位文本增长、工具/发送/终态事件以及稳定节点和展开/阅读状态；本轮SSE界面延迟样本123ms，不是性能保证。已有202验证101事件仅2列表读/1详情读、无并发，198验证漏事件恢复，247验证滚动/JSON与迟到响应，123/237验证初次跟随和选择恢复，248/251验证名称和追加叶模块。61、123、169、198、202、237、247、248、251、253相关文件通过，未重跑整套M3/M4。

证据 `.qa-local/session-live-20261018/final/result.json`、有头截图和 `final-verification.json`。仅备份同步当前独立控制台的sessions/panel.js与trace-view.js，55份相关合成数据哈希前后一致，无需重启；刷新生效，未访问真实QQ/模型/社区服务。

## 2026-10-18 聊天存档实时原位更新

修前254反例确认：原消息正文变化会替换整条消息及复选框。现将消息渲染拆为可通过ui.assets独立追加替换的chats/message-view.js，按聊天键/本地ID复用消息、时间文本、发送者、正文、勾选、诊断详情和已加载媒体/转发；相同快照不改写消息内容DOM。聊天列表、空态、标题、操作栏和消息滚动容器均复用，切换退出整块通用入场，独立折叠及删除撕裂/补位保持。重复点击当前聊天不增加详情读取；原SSE合批和鉴权快照不变，周期恢复仅静默对账。

同一存档面板内最近八个聊天分别保留锚点、已加载历史窗口、勾选/金句模式、展开和草稿，切回以只读分页重新校验；缓存不包含消息正文，不写入宿主导航或磁盘。切换等待读取时旧详情inert，快速A→B→A及迟到B响应不会覆盖A或跨聊天复用相同本地ID的勾选。金句恢复不会解除删除互斥。空列表/空消息在后台校验中也保持原节点。

254最终有头通过真实SSE（本轮样本108ms）、连续周期校验消息内容写入0、620条历史窗口返回、各聊天独立勾选/滚动/草稿、图片和转发复用/重新展开读取、撤回/正文/发送者变化、空态、迟到响应及真实追加消息叶模块消费。252有头检查实际底部夹紧、中部批量退场、移动碎片、相邻补位、滚轮取消和长存档尾部通过。39、61、120、121、149、169、192、237、251、252、254相关文件均通过；未重跑整套M3/M4。

120最初失败在退出金句且无任何勾选时仍期待删除按钮可用；保存的修前panel运行同一断言也失败，证据quote-120-before.log。校正为无选择禁用，并补实际重新勾选启用/取消选择再次禁用，完整本地模拟文本/图片投稿、验证码取消、错误和权限边界通过，quote-120-final.log保留。254早期重选请求计数与1秒恢复周期重叠，已固定在一个恢复周期结束后采样，原失败目录保留。

最终证据 `.qa-local/chat-live-20261018/final/result.json`、可见截图、deletion-headed/result.json和final-verification.json。仅备份同步当前15967独立副本四份前端文件：panel、history、quote-mode、新message-view；部署哈希与源码相同，55份相关合成数据哈希不变，无需重启。未访问受限的15967页面，不操作真实QQ、账号或公开投稿，未打安装包。默认叶模块接口及八聊天内存缓存范围见docs/session-archive-presentation.md。

## 2026-10-18 会话六处指标标注完成

详情将结束时间替换为真实用时，补充输入缓存命中率；工具卡成功/失败分别使用主题成功/危险色，调用名称后显示用时。列表首行先显示状态，保留群名与触发内容，摘要移除群号并显示缓存命中率。≥90、85–90、80–85、70–80、<70五档依次为成功、浅成功、浅警告、警告、危险，阈值按未舍入值且下界包含。缓存标签不拆成两行。筛选、搜索、详情仍保留稳定键辨识，安全文本显示不变。

新增可追加替换的默认metrics.js，列表和trace-view共同消费；agent-runner只增加单调时钟工具耗时，toolCall.durationMs进入归档/SSE元数据，不进入下一次模型请求的标准tool消息。包含before-tool检查及执行/拒绝至结果形成，排除after-tool。旧记录缺少耗时显示—，不伪造、回写历史。trace-view增量patch合同保持，工具和缓存率更新仍复用原节点及展开状态。

新255覆盖全部分档边界、零/异常输入、实际本地成功/失败/抛错/插件否决计时、无模型载荷泄漏、默认页状态顺序、无群号、主题换色、历史未知耗时、缓存SSE变化、展开/节点保持、窄屏及真实追加metrics模块双视图消费。最终有头通过，证据 `.qa-local/session-metrics-20261018/final-verified/result.json` 与截图。首次最终窄屏即时测量碰到宿主重排未完成，保留失败；测试现等待实际布局满足同一溢出断言，无放宽尺寸。6、61、78、169、198、232、247、248、251、253、255相关文件通过，未重跑完整M3/M4。248/251展示断言随用户新要求调整，但群名安全、稳定键在筛选/详情的存在、追加标题真实消费和删除/折叠检查继续保留。

仅备份同步当前独立副本五份代码：sessions/panel.js、trace-view.js、style.css、新metrics.js及src/kernel/agent-runner.js。同步前50份相关数据哈希一致。为载入真实计时，核实旧PID47432、15967端口/锁/可执行文件/固定离线wrapper、没有运行中会话后，仅重启此合成控制台；模拟服务PID43892保持。新PID55156、15967和实例锁身份已核对，latest.json已更新。未移除锁或修改配置，未启动真实QQ，未读取受限网页。

重启脚本的“全部数据字节不变”末尾断言因正常启动重记终态会话而失败，原证据保留，未重复重启。只读审计确认49份配置/会话/聊天等文件不变，唯一变化为usage-days/2026-10-18.json；Sessions.reconcileInBackground经UsageDayStore.record正常重写该统计快照，已逐项验证16个终态会话的calls及输入/输出/缓存/总tokens与原会话文件一致。不把统计快照重写伪报成所有字节不变。最终核对 `.qa-local/session-metrics-20261018/final-verification.json`、restart-data-delta.json、sync-verification.json及重启日志，五份部署代码与当前源码哈希一致，未打包。

## 2026-10-18 思考用时与中高命中率示例

默认agent-runner增加每轮模型调用的generationDurationMs，单调时钟从调用前计至返回，包含网络和重试，排除after-response hook、工具及回复加工。metadata只进入会话归档和SSE，后续标准assistant请求不带该字段。“思考”名称后复用已有时长样式/metrics叶模块显示用时，tooltip说明计时口径，历史缺失为—；不是供应方内部纯推理时间。两份生产文件为agent-runner和trace-view，现有组件及ui.assets替换入口不变。

255扩充实际延迟模型的两轮计时、无请求载荷泄漏、SSE元数据和历史思考缺失显示；可见浏览器通过。18、61、78、82、230、251、253、255相关回归通过，未重跑整套。本次扩充既有255，保留原工具、阈值、主题、窄屏与追加模块断言。证据 `.qa-local/thinking-examples-20261018/acceptance/result.json`。

8条新合成会话命中率72%、78%、82%、86%、89%、90%、95%、98%，均带两轮思考/工具调用及完整用时、发送展示与结束原因；正文与systemPrompt明确说明命中率/耗时为示例，没有实际模型请求或QQ发送。相同examples.json先在独立合成应用有头验证各比例及思考用时，截图/结果在preview/。未修改原16条会话。

核对原PID55156的离线wrapper、实例锁和15967端口、无活动会话后，备份相关数据，仅停止该测试控制台；复制两份代码，使用原会话/日账仓追加8条并合并索引，再重启为PID40416，模拟服务PID43892保留。42份原会话/聊天/配置等文件哈希不变，受授权影响的今日/日档/遥测汇总增加示例计数；逐字段验证8条仅记账一次，正常启动未重复增加。总会话24条，原数据和备份保留，未移除锁、改设置、访问受限15967网页、启动QQ或请求真实模型。最终证据final-verification.json、seed-result.json、restart/result.json及data-before/；源码与独立副本两份部署文件哈希一致，刷新载入新UI。

## 2026-10-18 进行中的思考与工具用时原位增长

默认运行器增加可选activeStep开始/完成/失败/中止生命周期，只进入会话归档与SSE，不污染标准模型消息。编排器对历史轮次同步偏移消息索引；trace-view将进行中占位与实际结果映射到相同消息key，保持卡片、用时节点、展开状态和阅读位置。思考、工具与会话总用时共用session-activity已有100ms可见数字刷新，不增加计时轮询请求、不重播入场；隐藏、离开与释放清理，返回后继续原计时。单调时钟确定最终耗时，中止立即冻结，迟到结果不重启或延长。叶模块和core.agentRunner组合替换合同保留。

新增256使用真实runner→orchestrator→SessionRegistry→鉴权SSE/读取→不透明面板，覆盖原位增长和固定、历史索引、节点与展开状态、后台/换页恢复、失败、中止、忽略取消的迟到结果、单一定时器和模型载荷清洁。最终有头通过，证据 `.qa-local/live-step-clock-20261018/acceptance-final/result.json` 及思考/工具进行中截图；已人工查看工具截图。18、61、78、82、198、230、247、251、253、255、256相关回归通过，未重跑整套M3/M4。测试夹具仅增加可选components注入，正式测试已加入M3清单。

只备份同步五份生产文件：agent-runner、orchestrator、sessions/trace-view、session-activity、style。确认原PID40416的离线wrapper、15967端口/锁/可执行文件身份、无活动会话后，仅重启该独立控制台为PID56772，模拟服务PID43892保留。57份会话/聊天/配置等数据字节不变；唯一重写日账文件已与备份去除savedAt后逐结构深比较，所有统计值不变。未移除锁、修改设置、访问受限15967页面、启动QQ或请求真实模型。五份部署文件与源码哈希相同，最终核对 `.qa-local/live-step-clock-20261018/final-verification.json`，备份及重启证据保留；刷新现有页签载入新UI，未打包。

## 2026-10-18 独立窗口反馈的会话状态与发送顺序修复

实际中止running时写aborted及finishReason=用户中止，error为空；详情将旧中止error兼容显示于结束原因。请求抵达前会话已经自然完成时返回alreadyFinished与真实终态，不再往列表追加巨大“该会话已结束”错误；不把已经完成的noreply伪改为aborted。中止后默认面板刷新并显示该会话详情，迟到模型结果不能改变中止结果。

三处启动前无未读/机械判定未触发/重试批为空改为sessions.discard，真正移除未运行的等待记录；discarded仅保留为摘除控制事件。默认列表排除历史内部标记及background任务，后台任务仍供API和用量统计读取。记忆整理器在create参数即声明background，首个事件与首次落盘已有标记，避免新建群友印象短暂混入会话页；不根据触发文字猜测，不删历史记录。

运行器以每次工具调用前后的真实回执差值记录仅展示的toolCall.sent，成功及部分失败的已送达记录都紧跟对应工具，先于下一轮思考且不重复；新字段不进入模型消息。旧归档优先匹配工具结果回执，仅一个旧发送工具时可关联剩余；多调用无法判断归属时保留独立记录。数字发送时间戳格式化，增量节点和展开合同保持。全部仍由可替换的默认运行器、会话仓、记忆服务及ui.assets实现。

新257使用真实运行器/编排器/仓库/鉴权API及不透明默认面板，实际点击中止并验证迟到响应、控制自然结束与中止请求竞态、后台创建/落盘/记账、三种discard分支、旧标记过滤、多次发送/部分失败的准确关联、旧存档兼容和节点复用。headless及最终有头均通过，已查看中止和发送顺序截图，证据 `.qa-local/session-outcomes-20261018/acceptance-final`。13、18、56、61、74、78、82、130、198、204、206、230、232、243、247、251、253、255、256、257相关回归通过，未重跑整套M3/M4。204旧断言从持久discarded修正为内存和文件均不存在，保留真实触发/掷骰与追加实现验证。首次257、130浏览器启动被进程沙箱EPERM拦截，正常获批后原断言通过，非业务失败。

已备份并同步六份生产文件：agent-runner、orchestrator、sessions、memory-service/consolidator、sessions/panel与trace-view，部署旧版本先与本轮before副本逐份散列核对。原PID56772已自行退出，首次重启身份闸门停止且未执行Stop-Process；随后只读确认进程、端口和锁均不存在，使用start-idle.ps1在相同路径/散列/离线配置/无活动任务闸门后启动为PID26380。未停止任何其他进程、移除锁或改设置，模拟peer未操作。57份会话/聊天/配置等文件字节一致，唯一日账变化仅savedAt，去除此字段后深比较所有值不变。最终核对final-verification.json与restart/startup-state.json；未访问受限15967页面、启动QQ、请求真实模型或打包。刷新现有测试页载入修复，外部独立程序需重新启动以消费后端源码。

## 2026-10-18 会话页四处紧凑布局标注

详情标题移除会话ID与群号/QQ号，只显示群名/昵称；默认chat-title叶模块、聊天筛选和列表上下文共用此展示策略，缺名显示群聊/私聊，内部筛选值、搜索、导航与JSON仍保留稳定键。会话卡状态移到摘要百分比左侧，两者inline-flex同排，不再占标题一行；移除列表“命中”二字，保留语义色、tooltip和无障碍名称。只压缩sessions自己的标题栏至35px最低高度及上方/下方留白，按钮继续30px，列表/详情可用高度随之增加约30px，窄屏保留换行。相同快照不重复写新增属性，卡片、展开与时钟节点原位更新合同保持。

原名称控制器仅查群名，现通过所选transport.listFriends补私聊备注/昵称，使用与群名相同的服务租约、权限、账号/配置代际、超时和生命周期。两个目录独立single-flight/缓存/失败退避，混合批次返回前再次核对来源，拒绝旧账号先返回的另一类名称。空白备注回退昵称，确认缺名也缓存，归一化的纯号码兜底不作为名称显示。默认OneBot好友动作把signal传给真实client.call；不查询成员正文、模型或新增权限，仍可通过console.sessionNames或ui.assets追加替换。

248全21项通过，含好友并发、权限撤销、跨账号迟到结果、独立退避、真实适配器signal及纯号码兜底、安全昵称展示和追加名称叶模块。255最终有头验证状态/百分比相邻、无ID详情、标题栏≤40px、主题阈值、窄屏和原位节点，已查看截图；证据 `.qa-local/session-compact-20261018/acceptance-verified`。61、123、169、198、202、237、247、248、251、253、255、256、257相关文件通过，未重跑完整M3/M4。旧选择测试由可见ID改为内部data-session-id和仍挂载的详情验证，保留原跟随、迟到响应、删除、导航与滚动断言。169一处遗留整块文本ID断言先失败，已同步新显示要求；202初次因旧用时功能增加100ms本地刷新而失败，修改前面板复验也有[100,60000]，baseline-timers.json保留反证，现精确断言这两个定时器，未放宽请求合并/终态清理检查。临时诊断脚本的首次相对导入错误已修正，未触及生产文件。

备份并同步五份生产文件：session-names、transport-onebot/provider、sessions/chat-title、panel、style。按固定离线wrapper/可执行文件散列、路径、PID/端口/锁身份、无活动会话，仅重启本独立控制台26380→57288，peer未操作。同步前58份数据字节一致；启动后57份配置/会话/聊天等仍一致，唯一日账变更仅savedAt，去除此字段后深比较全部值不变，未移除锁或改设置。部署文件与当前源码hash相同，final-verification.json及restart证据保留。未访问受限15967页面、启动QQ、请求真实模型或打包；刷新现有页签载入改版。

## 2026-10-18 聊天页五处操作与共享标题区精修

列表摘要移除未读数量，仅保留总条数和最新消息；真实未读过滤、标读与忽略动作保留。删除独立全选/取消按钮，选择消息使用同一稳定按钮切换为取消选择，再次点击退出并清空勾选。未处于普通或金句选择状态时隐藏上传金句、删除和计数；删除仍要求普通选择、非金句模式及至少一条勾选，保持原多击确认与动态退场。左侧为选择/上传/删除，右侧为测试输入与发送，窄屏可换行。

普通选择可以直接打开已有公开内容预览，取消预览保留勾选；原金句模式仍保留独立选择和删除互斥，选择按钮也能退出。quote-mode增加可选selectionActive回调，沿用原预览、验证码、图片、安全载荷、取消和权限合同，不在进入选择时投稿。同步只写变化的文字/属性。消息叶模块移除JSON详情入口及其网格列，引用、媒体、转发与展开状态继续复用原节点，公开createMessageView合同和ui.assets替换不变。

会话页原35px标题样式迁入common.css，九个内置页签和主动使用compact布局的文档共用8px顶部内边距、35px最低标题、4px下内边距和6px下间距，按钮仍30px且窄屏可换行；不向独立插件文档注入样式。会话页重复覆盖移除，聊天列表/内容视口相应增加30px可用高度。

254扩充实际开关、隐藏/显示、普通选择预览且不切专属模式、左右几何、无详情入口和九页实际computed style断言；保留620条历史、实时SSE、周期校验内容写入0、各聊天勾选/草稿/滚动、图片和合并转发复用、迟到读取、空态与真实追加消息视图。用户移除原详情后，原展开检查转向仍存在的合并转发，未放宽正文/媒体/滚动约束。最终有头通过，已查看普通和选择两态截图，证据 `.qa-local/chat-controls-20261018/acceptance-final`。120完整本地合成公开载荷、图片/坐标边界、验证码取消/重复、配额与提供者退出通过；仅退出选择后的断言同步为隐藏且禁用。252最终单独有头通过实际移动碎片、底部夹紧、中部批量退场、相邻补位、用户滚轮取消和长存档尾部，证据deletion-final。61、120、121、141、169、237、251、252、254、255相关回归全部通过，未重跑整套M3/M4。

只备份同步common.css、sessions/style和chats的panel/message-view/quote-mode/style六份前端资源，部署旧版先与before逐份核对，源码与部署hash一致。58份配置/会话/聊天/记忆/用量等相关数据同步前后字节完全不变；未重启服务、改设置、访问受限15967网页、启动QQ、请求真实模型或公开投稿。证据final-verification.json、console-before及两轮有头截图保留，刷新现有控制台即可，未打包。

## 2026-10-18 聊天选择高光与操作栏六处精修

删除聊天页顶部金句模式和刷新按钮；统一从消息选择进入上传预览，保留详情刷新并同时重新读取聊天列表。原quote-mode可选trigger及enter/exit合同继续兼容替换视图，新增预览状态回调使删除在公开内容预览期间不可用，取消预览保留勾选，投稿完成退出选择。已选条数跟随删除按钮同排，输入框填满按钮以外空间；较窄布局允许换行。

上传和删除按钮仅在由隐藏变可见时从左侧弹出，240ms且删除延后30ms，不在SSE或静默校验时重播。已勾选消息使用主题警告色左边线、原生勾选色及从左至右渐隐的细内发光，CSS直接跟随checked，支持拖扫和阅读状态恢复，不重建节点。减少动态效果偏好关闭新增动画和过渡，原删除碎片/补位管线不变。

254有头验证按钮实际位移与透明度、计数相邻、输入填满、选中/未选中高光及静默更新不重播，保留实时SSE、各聊天滚动/勾选/草稿、图片与转发复用、迟到读取和追加替换视图验证；已查看两态截图。252独立有头通过实际碎片、批量退场、滚轮取消及长存档补位。61、80、120、121、149、169、252、254通过，未重跑全套M3/M4。121初次因一处遗留quote-toggle定位失败，已迁至统一选择；80旧工具raw折叠和可见会话ID断言也已迁至实际参数折叠及内部选择标识，保留原折叠/迟到响应约束后完整通过，未改生产会话视图。

证据在 `.qa-local/chat-selection-polish-20261018/`。核对部署旧文件与before一致后，只备份同步聊天index、panel、quote-mode和style四份资源，源码/部署散列一致。58份配置、会话、聊天、记忆与用量相关数据字节不变；未重启服务、改配置、访问受限15967页面、启动真实传输或请求外部服务。现有页面刷新后载入改版。

## 2026-10-18 全页签静默更新与技能/插件目录整理

技能/插件不再clear重建目录，按扩展ID复用卡片、启停/设置/热更新/授权/卸载按钮及根目录折叠；事件与动作回调使用最新快照，已知卡片顺序不随loader返回顺序变化。默认bundled项目统一放进初始折叠的“默认能力”，用户安装项直接显示；筛选和更新保留分组及路径展开，渲染以当前可见卡片锚点保持滚动。卸载按钮沿用原多击控制器与实际目标，安装反馈和清理残留按钮保持独立且不反复摘挂。

能力提供者分组及未变行继续使用原节点；按语义快照判断变化，保持当前未提交选择、错误反馈、焦点及旧来源草稿作废规则。两个面板的状态/扩展事件以80ms合批，较旧请求不提交，离开时清理；失败保留卡片，用独立提示区报告，不清空列表。共享motion将九个默认页的数据追加和异步详情变化视为阅读更新，首次入场、主动展开/弹窗及显式data-motion追加保留；第三方导入行为不变。记忆名称/印象内容只改变化的文字，保留条目节点；用量静默刷新不反复变暗/写加载提示，未变工具和峰谷详情保持。

用量天数与标题同排；技能和插件“创作扩展”紧邻安装ZIP之前，在宽屏同排，窄屏仍可换行。启用确认与宿主授权采用普通语言说明本机运行、文件/联网及权限开关的实际范围，代码版本标识和授权验证不变。

258最终有头在随机本地端口、20个全新空扩展上验证真实启停与热更新保留卡片/按钮/顺序/滚动/折叠、默认收纳、普通语言、紧凑标题和读取失败保留；九个内置页签连续鉴权状态事件及正常后台校验期间，根节点/阅读块保留且入场重播均为0，无横向溢出。证据 `.qa-local/panel-stability-20261018/acceptance-final/`；已查看技能、插件及用量截图。61、75、80、105、137、139、143、154、164、169、194、217、223、253、254、258相关回归通过，未重跑全套M3/M4。143的简化DOM模拟改为真实浏览器，保留原loader/HTTP脱敏、诊断与两页统计覆盖，并加强节点身份；154模拟器补齐原位DOM操作、离开回调与80ms合批等待，84项安装反馈通过。223的旧“刷新必摘除选择器”断言改为未变时保留原选择器；已有保存失败、来源改变和追加UI覆盖仍完整验证。258首两轮仅是默认折叠内容可见性和嵌套summary定位问题，已修正后有头通过，初始失败证据保留。

仅备份同步11份前端资源，部署旧版逐份与before核对；58份会话、聊天、记忆、配置和用量等相关数据字节保持不变，未重启服务或改配置。未访问受限15967页面、启动QQ或请求真实模型/外部服务。代码仍通过现有ui.assets和整页面板追加替换，刷新现有页面即可载入改版。末次来源变化审查补齐bundled回退时摘除旧卸载按钮，恢复用户安装来源时只保留一个控制器；143新增此项真实DOM验证。

来源边界补丁首次本地检查发现installed变量重名，未同步该版本；改为installedIds后语法、143真实DOM来源切换及154全部84项重验通过，再以已部署hash为前置条件单独备份同步manager。最终11份部署资源与源码散列一致，58份相关数据从首次到补丁同步均保持字节一致；first-sync-verification、final-verification及console-before-source-check保留完整核对结果，61再次通过。

## 2026-10-18 设置详情四处标注对齐 0.4

实际对照旧版 08-modals、06-settings-render 和 09-community。模型配置按模型目录/测试、当前接入点、图片与视频开关/专用模型、视频方式集中呈现，低频原始项保留高级入口。模型管理改为左侧渠道导航及添加/删除，右侧地址、掩码密钥和模型单选目录；常用添加、拉取、删除直接可用，渠道编辑/试聊/目录命名/批量管理保留。浏览渠道不切换主模型，嵌套添加关闭后返回，管理页明文密钥在关闭/切换/离页清理，迟到读取核对原弹窗和当前渠道。

分会话人设改为稳定名称按钮网格及 ● 标记，搜索、旧共享/遮蔽存档及原有事务编辑保留；空白名单策略直接显示开关。活跃设置将峰谷时段/开关、档位参数和统一设置放到卡头，以横向四段单/双滑条及内联群按钮呈现，原始字段保留高级区。新 activity-view 默认叶模块只读写现有 FormState，群映射从当前草稿合并且只恢复所选群的继承；原160配置控件、保存路径、权限和后台业务保持。

61、169、184、185、186、187、189、190、215、221、229、244、249、259 共14个相关文件退出0，244完整23组保存生命周期、249实际结构追加/停用和160字段清单通过。259最终有头实际验证四处布局、手动模型添加/两击删除、三击清除密钥及迟到响应、普通/分群/双滑条保存和恢复继承、嵌套弹窗、关闭清明文及560px窄屏，无页面异常或外网请求；已查看最终六类截图。旧回归定位迁到新的公开入口，保留原并发、冲突、失败重试、凭据隔离及实际消费者断言。初次验收遇到卡头变量重名导致模块不加载，语法检查定位后改名，未同步失败版本；后续失败均为旧选择器，迁移后完整通过。证据 `.qa-local/settings-parity-detail-20261018/`，未重跑整套M3/M4。

部署旧版先与本轮before逐份核对，备份五份旧资源并同步六份默认前端文件（含新增activity-view）；58份会话、聊天、记忆、配置及用量相关数据字节不变，部署/源码散列一致，final-verification.json保留核验。未访问受限15967页面、改配置、重启服务、启动QQ或请求外部服务；未打包，刷新现有页面即可载入。

## 2026-10-18 渠道管理六处直接编辑标注

添加渠道改为左侧列表末尾的虚线按钮，删除渠道置于该渠道标题右侧；删除设为当前渠道/模型试聊/编辑渠道/管理模型及旧主模型快捷单选。标题名称、Base URL和API Key可直接修改，失焦、换渠道或正常离页通过现有字段事务保存，原模型配置目录选择器继续控制主模型。保留模型行内改名/筛选，模型移除改为每行末尾独立两击按钮；渠道四击、密钥三击原阈值不变。成功添加/更新渠道关闭子弹窗并选中该渠道，保留父窗口及既有输入节点。

有效地址且有已保存或新填写密钥时，拉取按钮出现在模型标题右侧。连接字段失焦先保存后读取，同一地址/密钥版本自动去重；无密钥公共接口也支持有地址时的失焦读取，缺少地址不请求。输入移向另一连接字段时合并，避免使用半填密钥。自动读取在当前渠道内联使用既有目录筛选/分类/有界分页和跨筛选选择，只有明确勾选加入才写目录。来源变化、换渠道和离页作废旧读取，迟到结果不能重现或写入新来源。独立provider-manager默认叶模块由设置页实际消费，沿用ui.assets替换，后台路由/权限/默认值未改。

按渠道ID和模型ID复用节点；提交只包含变化字段并携带原值和密钥版本，不覆盖并发目录元数据、其他渠道或请求期间输入。失败保留草稿，提供重试及显式重新读取；密钥明文在关闭/换渠道/离页清理。补齐渠道刷新与普通表单版本检查，迟到配置不能覆盖更新的保存基线；刷新渠道选项同时兼容原生select和记忆的文本渠道字段。真实184回归发现将文本字段当作select的呈现错误，已在同步前修正并完整通过。

33、61、90、117、119、169、184、186、187、189、190、244、249、259、260共15个文件退出0；244完整23组保存生命周期和249的160配置控件清单、实际追加/停用通过。260最终有头覆盖六处几何/隐藏状态、匿名公共目录、自动获取去重/显式导入、逐行两击删除、三击清密钥、实际写盘失败/同字段冲突/后续输入、迟到来源、焦点草稿离页保存、活动端点实际绑定、560px窄屏及新叶子实际替换/停用；页面异常与外部请求0，已查看最终宽窄屏和内联目录截图。旧测试迁到新入口与逐行操作，保留原权限/元数据/磁盘/竞态断言；190独立保留旧公开编辑器兼容API测试，不再声称默认页使用已移除入口。119目录连续删除在减少动态效果下验证，布局动态由原删除验收覆盖。未重跑整套M3/M4。

证据 `.qa-local/provider-manager-inline-20261018/`。部署旧版先与before逐份核对，备份四份旧资源并同步五份默认前端文件（新增provider-manager）；58份配置/会话/聊天/记忆/用量相关数据字节不变，源码与部署散列一致。未访问受限15967页面、改动现有配置、重启服务、启动真实QQ或请求外部服务；未打包，刷新当前页即可载入。

延后最终复核发现config.json于21:51:34有后续写入；同步前后58份一致是同步瞬间检查点，此后配置已变化，不再声称全程58份一致。任务没有写该配置，未判断这次后续写入的来源，已保留其新内容；另外57份数据与五份部署/源码仍一致。post-sync-verification.json记录新旧散列、时间与保留决定，不输出配置或密钥，也未覆盖或回滚配置。

## 2026-10-18 模型逐行操作六处标注

移除模型管理底部批量管理、YAML导入、全部测试和汇总视觉图例，以及独立的渠道统一测试按钮。视觉标识紧跟模型名称，每行提供真实模型连接测试和原两击删除；结果包含耗时及失败原因，关闭/切换/来源变化后迟到结果作废。点击名称可同时改显示名称与ID，新模型编辑事务一次提交目录和同渠道主模型/图片视频/记忆/备选引用，校验来源、旧名称、ID存在性与碰撞，保留顺序、并发元数据、其它渠道和凭据。新增精确面板接口白名单项，默认业务仍由可替换的console.routes消费独立编辑策略，界面仍沿用ui.assets管理叶子替换。

手动和自动失焦读取成功后打开额外模态选择窗口，失败显示于当前渠道，不再内联目录。首次开窗不重复读取，只有显式加入写目录；搜索、分类、有界分页、跨筛选选择、并发只增缺项和取消语义保留，来源变化、关闭和迟到读取不能误弹或提交。

16个相关回归文件33/61/90/117/119/169/184/186/187/189/190/244/249/259/260/261通过；244完整23组，249保持160字段。261最终有头覆盖实际逐模型请求/渠道密钥/成功失败、迟到隔离、视觉几何、双字段编辑/碰撞/写盘失败/并发元数据/引用更新、两种成功开窗/失败/取消/关闭后晚到、磁盘重读及560px窄屏；无页面异常和外部请求，已查看四类最终截图。261加入M3入口，未重跑整套M3/M4。证据 `.qa-local/model-manager-rows-20261018/`。

旧部署与任务before散列逐份核对并备份后同步7份生产资源。58份数据在同步瞬间字节一致；核实身份/端口/锁/空闲/离线包装器后仅重启本地合成控制台57288→3496，不移除锁文件或重启旁路进程。启动后57份数据字节一致，1份用量日文件只更新savedAt，所有业务值和当前配置保持。初次重启检查因PowerShell默认JSON解析不接受baseUrl/baseURL同时存在而在停止前退出，检查器改为大小写键兼容读取后完成，未修改配置内容。final-verification记录7份源码/部署散列及全部检查，未访问受限页、真实模型、QQ或外部服务，未打包。

延后复核发现config.json在2026-10-18T15:54:06.771Z又有写入，已保留当前内容，不回滚、不推断写入来源，也不再把启动检查点配置一致表述为持续不变。另56份数据仍与同步时相同，1份用量日仍仅上述启动时间变化，7份部署/验收源码继续一致。post-sync-verification.json只记散列及时间，不输出配置或凭据。

## 2026-10-19 紧凑模型配置七处标注

模型选择器缩至640px；配置页移除地址/密钥编辑、旧图片视频专用输入/清空、高级与直接接入区及扫描入口。主模型下显示模型ID/BaseURL。图片、视频各一行语义开关，关闭危险色/开启成功色描边和细内发光，不再显示复选框或开启字样；开启滑出选模型按钮，未选显示选择模型、已选显示渠道-模型ID，减少动态效果时取消动画。列表顶端当前模型恢复跟随主模型，关掉权限保留该输入的既有模型，互不修改主模型/另一路/记忆配置。160个原配置控件隐藏保留唯一实例并沿用原FormState；补齐选择保存失败后的按钮文字回退。

17个相关回归34/61/70/90/117/133/141/185/187/188/189/244/249/259/260/261/262通过；244完整23组，249保持160字段及真实结构追加/停用。262最终有头覆盖真实开关、成功危险色与内发光、左右动画关键帧、当前模型与专用身份、关闭保留、失败/迟到取消、主模型摘要、磁盘重读、640px及560px布局、Escape和减少动态效果；无页面异常/外部请求，已查看最终截图。262加入M3，未重跑整套M3/M4。删除入口的旧用例迁至仍保留的公开流程，保留凭据隔离、保存/焦点和HTTP/SSE断言。

69旧呈现用例要求白名单至少2组，而此前按用户要求已经提取单项并变为1组；以本任务before的四份旧前端独立复现同一失败，不改界面或该断言，不计入17项通过。证据 `.qa-local/model-config-compact-20261019/` 的当前/基线69日志及test-summary。初次262发现隐藏旧开启标签计数影响断言，改为检查可见标签；随后发现选择失败时按钮文字未回退，已修复真实缺陷后完整有头通过。

四份生产前端的部署旧版与before散列逐份匹配，备份后仅同步structure/panel/model-picker/style。同步瞬间58份当前配置、聊天、会话、记忆、用量等字节一致，未写配置或重启服务。final-verification记录4份资源/数据散列和已知基线失败；刷新当前页即可载入。未访问受限页面、真实模型、QQ或外部服务，未打包。
# 2026-10-19 白名单展示与品牌图标折叠三处标注

默认记忆、聊天存档使用scope=allowlist读取列表及详情，独立chat-visibility策略按allow.groups/private明确成员过滤，保留白名单空记忆占位；空名单不展示任何聊天，不借运行时allowAllWhenEmpty展开历史。原管理员未筛选接口与准入策略保持。白名单变化后移除当前详情和选择，中止历史读取、拒绝迟到详情及已保存导航恢复；重新加入可读原档。只过滤展示，不删除或重写存档/记忆/备注。

品牌图标改为原生展开/收起按钮，删除旧独立箭头及44px占位行。保留偏好、右侧镜像、响应式、可访问名称与状态、鼠标及Enter/Space；隐藏侧栏的临时导航中点击图标可收起并返回入口焦点。保持当前iframe和导航行在折叠过程中的位置，操作不写业务配置。

35/61/100/102/110/121/141/169/180/207/217/237/251/252/254/263共16个相关文件通过。263最终有头覆盖群/私聊精确过滤、空占位、移出后当前详情/迟到响应/导航恢复、重新加入原档、空名单、原始文件字节一致、图标键盘/点击/刷新偏好/窄屏/隐藏模式；页面异常及外部请求0，已查看最终记忆、存档、展开/折叠截图。263加入M3，未重跑全套M3/M4。旧显示夹具明确加入所用合成聊天；207旧无超时关卡的拦截地址未匹配新参数，精确结束该测试及浏览器子树后补地址/超时，最终全部通过；未结束真实控制台或无关进程。102日期断言改用未在前段被整理更新的白名单私聊，保留日期呈现与管理员联合目录覆盖。

证据 `.qa-local/whitelist-brand-20261019/`。七份旧部署文件先与before核对并备份，再同步八份资源含新策略。58份当前配置/聊天/会话/记忆/用量在同步瞬间字节一致；严格校验身份、端口、锁、空闲、离线包装器后，仅重启合成本地控制台3496→31472，未删锁或动旁路进程。启动后57份字节一致，1份用量日只更新savedAt，业务值与当前配置保留，8份部署/验收源码一致。未访问受限页面、请求真实模型、启动QQ、打包或部署外部服务；刷新页面载入。

# 2026-10-19 当前价格表改为可搜索表格

按标注替换当前价格表的 JSON 输出，默认前端新增独立 price-table.js，按模型展示输入/输出/缓存单价、来源及展开说明，明确保留 0、高峰价和图片计费；显示当前有效报价、内置快照日期及远程更新时间。查看/拉取共用表格，HTTP 故障保留旧数据和筛选、更新失败展示可用缓存，迟到读取不能覆盖新更新。表格窄屏内部滚动，使用既有主题；未复制计费匹配逻辑。

264 无头/有头各 3 组通过，已查看实际窗口截图；249 字段及结构、228 价格管理 8 组、146 计价完整性 46 项均通过。264 加入 M3，未重跑全套。证据 `.qa-local/price-table-20261019/`；所有浏览器检查仅访问隔离随机端口临时应用，价格源为合成数据，无真实外部请求、DNS 或页面异常。

# 2026-10-19 成本参考价开关与报价展示

默认 cost-view.js 使参考价内容框成为可键盘操作的原生开关，开启成功色/关闭危险色描边与细内发光，隐藏旧复选框和开关字样。开启改为输入/输出/缓存三项报价展示，关闭恢复三个原输入及保留值。只改变呈现，所有原配置控件保持唯一并沿用保存/校验；有效报价直接读所选后端 current，明确显示来源，保留免费 0 和未匹配的手填回退。待保存状态不展示未生效价格，成功保存、模型选择或价格表更新后读取；失败重试、关闭和迟到回复均验证。

265 无头/有头各 3 组通过并查看两种状态和窄屏截图；249、264、244、187 相关回归均 exit0。244 的合成磁盘故障日志为既有故障注入，23 组保持通过。265 加入 M3，未重跑全套 M3/M4。证据 `.qa-local/cost-switch-20261019/`，测试仅用随机端口临时应用、被动 transport 和合成价格源，没有访问受限页面、真实模型/QQ 或外部服务。

# 2026-10-19 群聊/私聊独立允许全部

删除旧共用空名单开关的可见呈现，在两个选择弹窗顶部分别加入允许所有群聊/允许所有私聊。策略与名单按弹窗保存一起提交，取消不写；开启后隐藏对应号码框和弹窗逐项列表，名单保留、关闭恢复。新增可选 allow.allGroups/allPrivate，显式标志覆盖本类型旧空名单策略，缺省保持旧配置行为；拒绝名单优先，实际 ingest/测试发送及启动导航均接通。显式允许全部同时纳入本类型已有记忆/存档，关闭恢复过滤；旧共用空名单选项的历史展示兼容范围不变。

17/35/61/218/221/244/249/263/266 九个相关文件通过；266 无头/有头各 4 组，244 完整 23 组，249 仍保留 160 字段。涵盖两类独立保存、取消、列表离线、原名单/记忆/存档保留、拒绝优先、真实消息和合成测试发送、原子写故障及撤销、迟到回执中的新开关、重开和窄屏。已查看最终截图。266 加入 M3，未重跑全套。证据 `.qa-local/allow-all-kinds-20261019/`，验收无外部请求、DNS、真实 QQ 或模型调用。

核对并备份八份旧部署文件后，只同步十份所需源码（含两份新增纯策略模块）；58份当前业务数据在同步瞬间字节一致。验证离线包装器/进程/端口/锁/空闲和数据后，仅重载本任务合成控制台31472→74068；未删除锁、写配置或操作其他进程。启动核验57份原始文件字节一致，1份用量日仅正常 savedAt 变化，配置和业务值不变；十份部署源码与验收散列一致。final-verification.json 保存结果，未访问受限页面或部署外部服务。


# 2026-10-19 活跃设置卡片外观对齐 0.4

重新读取相邻 develop 的实际 0.4 模板、样式与滑条控制器，并在隔离随机端口渲染三个参考状态。活跃卡片按原版卡头、图标、组合按钮、开关、摘要、42px 四段轨道、5×32px 细竖手柄、字号与间距、群按钮及取消/保存重排；保留当前主题颜色。去掉可见原始配置区，160 条原配置控件仍各保留一份。窄容器换行、减少动态效果、鼠标连续拖动/离散吸附与键盘操作均验收。

卡片草稿通过原 FormState/保存生命周期提交；取消只丢弃本卡片输入。失败暂存回退、其他普通设置自动保存、新输入/改回原值遇到迟到回执、其他设置重绘、全局保存途中继续输入均有检查；分群修改和清除只影响目标群，白名单外历史覆盖数据保留。峰谷组合按钮的边缘/键盘可打开原编辑器，右侧开关不折叠卡片；沿用既有峰谷预设、冲突处理与可替换编辑器，没有改响应策略。

61/221/226/229/244/249/259/267 八个相关文件通过；226 为49项，244 为23组，267 无头/有头各7组并查看最终三个状态和560px窄屏截图。221/259 随删除入口迁移，保留实际保存、离线、迟到群名和群间数据隔离断言。267 已加入 M3；未重跑完整 M3/M4。参考散列、实测几何、测试日志和最终同步结果在 .qa-local/activity-v04-align-20261019/；说明见 docs/activity-settings-v04-presentation.md。

核对并备份四份已部署前端文件后，同步六份前端文件（新增独立活动草稿与专用样式）。58份当前业务文件在同步前后字节一致，未写配置、重启服务或访问受限页面；没有真实 QQ、模型调用或外部请求。当前预览刷新后生效。

# 2026-10-19 指令禁言整框开关

取消可见复选框与状态字样，启用群指令安静模式内容框改为语义开关。开启/关闭分别用主题成功/危险色描边和细内发光；关闭时隐藏安静指令、时长和安静群，值及原控件保持，开启后恢复。鼠标整框、键盘操作继续走原保存流程。61/249/268通过，268无头/有头各3组，验证160字段、实际禁言策略、私聊边界、永久时长0、映射替换、关闭保留、失败重试、重读与560px窄屏。已查看最终截图；268加入M3，未重跑全套。

核对并备份旧部署后同步两份前端文件；58份当前业务文件在同步瞬间字节一致，未写配置、重启、访问受限页面或调用真实模型/QQ。证据 .qa-local/command-mute-toggle-20261019/final-verification.json；刷新预览生效。

# 2026-10-19 白名单群聊/私聊安静按钮

JSON改为分组会话按钮，展示白名单所有群/私聊及允许全部模式下的已知目标；名称安全补充、离线可用。正常为成功色细描边/内发光；安静为危险色细描边/内发光、3.2秒缓慢呼吸，减少动态效果时静态。按用户明确选择支持鼠标/键盘点击切换，时长沿用上方设置，0为永久，超时自动显示正常而不写盘。

私聊使用独立private:QQ键，群兼容原数字键。每次只提交目标子键，保留其他会话/白名单外数据；恢复正常用过期时间戳，避免整图覆盖。私聊显式安静后沿用1档唤醒规则，普通私聊行为不变；活跃期、排队普通消息及异步主动开话题均不能绕过安静。保留原控件隐藏状态和160字段清单。

12/17/18/61/204/209/226/244/249/268/269共11个相关文件通过；269无头/有头各6组，查看最终截图，涵盖真实保存、同号隔离、过期/永久、入站/编排、失败重试及窄屏。269加入M3，未重跑全套。证据 .qa-local/quiet-chat-buttons-20261019/。

同步8份源码，58份当前业务文件在同步瞬间字节一致。核验合成包装器、空闲状态、身份/端口/锁及数据后重载本任务预览74068→72436，未删除锁或写配置；启动57份字节一致、1份用量日仅savedAt变化，业务值不变。未访问受限现有页面、真实模型、QQ或外部服务。最终结果见final-verification.json。

# 2026-10-19 社区删除口令安装与重复名单

社区直接显示发布账号和发布表单，删除口令安装/屏蔽名单页签、专用状态机/视图、重复名单的全部页面方法和样式，收回对应面板权限。公开verify路由/默认服务/SDK方法删除；市场安装改为{id,kind}，旧code入参在联网前拒绝，只从实时审核目录内部解析下载引用并校验，保留共享ZIP停用安装。聊天设置名单及云同步、运行时拦截保留，发布账号/验证码/反馈/创作入口不变。

18份定向文件通过，270无头/有头各4组并查看1450/960/640px截图，验证实际删除边界、RPC收权、目录失败不下载和两个市场真实安装停用未执行。旧195/196退役，M3登记270；未重跑全套。细节见docs/community-page-trim.md，证据.qa-local/community-trim-20261019/。

核对部署基线后同步10份源码并删除2份专属口令模块；58份业务文件同步瞬间字节一致。检查包装器/进程身份/空闲会话/端口/锁后重启合成预览72436→55852，未手删锁或写配置。启动后57份字节一致、1份用量日仅savedAt变化；业务值保持。最终证据.qa-local/community-trim-20261019/final-verification.json，未访问受限页面。

最后核对移除src/kernel/kernel.js宿主facade残留verify名称，再次通过270无头/有头与129，补同步1份源码并核验重载55852→57476。累计11份源码、2份专属模块删除；本次58份同步前后字节一致，启动后57份字节一致、1份用量日仅savedAt变化。最终散列审计及当前PID见final-verification.json；初次同步记录保存在manifest-phase1.json/verification-phase1.json。

# 2026-10-19 存档性能与“我的”图标

完成用户新增性能请求：先分页后解析引用、惰性协议ID索引/游标二分、带版本的聊天摘要复用、启动会话分批处理、未变用量记录幂等跳过和会话统计复用。保持既有组件装配、旧替换仓recent回退、存档格式、同步原子落盘和撤回/引用/计量语义。社区侧栏和页标题改为“我的”，人物轮廓与身份标记及选中动画重绘，配色沿用主题。

22份定向文件通过，271新增6组并登记M3，270有头/138动画检查通过，未重跑全套。最终基准：12000条存档取默认500条，首次551.27→24.11ms、重复241.91→0.53ms；160条历史恢复最长阻塞2962.39→31.36ms，恢复写入320→0。总恢复耗时仍为2309.17ms，不能把最长阻塞当完整启动耗时。具体边界、源码散列和本机合成数据证据见docs/archive-performance.md与.qa-local/archive-performance-20261019/。

核验部署基线后同步8份源码，58份业务文件同步前后字节一致。核验离线包装器、空闲状态、进程/端口/锁后重载本任务合成预览57476→73208；启动后的58份业务文件仍字节一致，未写配置或手工删锁。未访问受限现有页面或调用真实模型、QQ、外部网络。最终证据.qa-local/archive-performance-20261019/final-verification.json。

# 2026-10-19 联网搜索卡片式开关

将启用联网搜索整框改为卡片式开关，沿用成功/危险色细描边与内发光；关闭时只隐藏当前搜索源及搜索最终结果上限，原值与其它搜索功能保留。只修改默认设置结构/样式，保持原配置绑定、自动保存及追加替换路径。61与249通过，249保持160字段并验证真实保存、鼠标/键盘切换、值保留、重读和窄屏；未重跑全套。证据.qa-local/search-card-toggle-20261019/。

249无头/有头各10组通过并查看开启、关闭及窄屏截图。同步2份前端文件后核验重载合成预览73208→72196，以更新界面与元数据快照。58份业务文件同步及启动后均字节一致，未修改配置或访问受限页面。最终证据.qa-local/search-card-toggle-20261019/final-verification.json。

# 2026-10-19 图片与视频模型选择器修正

“当前模型”改为左侧顶部独立分组，仅含主模型；普通提供商移除重复快捷项。外部图片/视频按钮统一显示实际渠道和模型展示名，空专用设置显示当前主模型并随其变更、重读更新；跟随选择仍仅清空原专用字段。横向裁剪揭开动画退出共享纵向入场效果，逐帧确认x=-18→0、y=0、裁剪完全展开，支持减少动态效果。

61、187、188、249、262通过，262无头/有头各4组并查看普通/窄屏截图；249首次保存状态等待超时，重跑10组通过。原160字段、保存回滚、组件替换和运行时路由保留，未重跑全套。证据.qa-local/model-media-picker-fix-20261019/。核验后同步5份前端源码并重载合成预览72196→75312，58份业务文件同步及启动后字节一致；未写配置或访问受限页面。

# 2026-10-19 自动定期记忆整理卡片式开关

将原后台记忆整理改名为“自动定期记忆整理”并作为整框开关，使用成功/危险色描边及细内发光。整理冷却仅在开启时显示，以横向移动和裁剪揭开从左向右出现；关闭保留原冷却值，减少动态效果与窄屏受支持。保持原160字段、保存流程及后台调度，沿用DeepSeek Harness装配。

61与249通过，249无头/有头各11组，覆盖鼠标/键盘、实际保存和重读、保留冷却值、逐帧水平方向、减少动态效果、560px布局与覆盖层恢复；已查看截图，未重跑全套。证据.qa-local/memory-auto-toggle-20261019/。核验后同步3份前端文件并重载合成预览75312→71428，58份业务文件同步及启动后字节一致，未写当前配置或访问受限页面。

# 2026-10-19 记忆整理模型卡片布局

“整理使用聊天主模型”改为卡片式开关；两个手填ID框退出可见界面，原配置绑定保留。“选择整理专用模型”改为开关右侧同一行的可点击卡片，关闭主模型开关时从左向右展开，重新开启时隐藏并保留已选模型。复用成功/危险色与细内发光，支持窄屏和减少动态效果，沿用原保存及DeepSeek Harness装配。

61、187、249通过，249无头/有头各12组，覆盖布局、逐帧横向动画、隐藏ID框、鼠标/键盘、实际模型保存、切换保留、重读和追加层恢复；187验证失败回滚及取消边界。已查看截图，未重跑全套。证据.qa-local/memory-model-card-20261019/。同步2份前端源码后核验重载合成预览71428→65520，58份业务文件同步及启动后字节一致，未写当前配置或访问受限页面。

# 2026-10-19 统一人设卡片式开关

“所有会话使用统一人设”改为整框语义开关，成功/危险色描边与细内发光表示状态，保留原160字段和统一/分会话/全局弹窗的保存与编辑逻辑。模式保存后只读刷新分会话状态文字。最终61、249通过，249无头/有头各12组，覆盖鼠标/键盘、保存重读、状态文字、窄屏和结构替换；已查看截图。259初版4组通过，最终提示刷新后的补跑两次因审批超时未启动，未重跑全套。

同步3份前端文件后，重载曾因审批服务异常而未执行。用户要求直接重载后核验到等待期间只有config.json变化，保留当前配置并更新比较基线后成功重载合成预览65520→38992。58份业务文件在同步时及启动后相对各自基线均字节一致，未写当前配置或访问受限页面。证据.qa-local/persona-card-toggle-20261019/final-verification.json。

# 2026-10-19 搜索源选择与统一管理

搜索服务顶部改为联网搜索开关与搜索源选择卡片，下方为管理入口。选择窗口以卡片列出全部源，成功选择后关闭并显示名称；管理窗口以左侧列表和末尾虚线添加按钮、右侧统一名称/地址/可选Key三字段编辑。保留原160字段、结果上限、测试、密钥留空保留/显式清除、删除回落及DeepSeek Harness装配；新模块可通过ui.assets替换。旧自定义源省略type/model的更新保留原值，空Key自定义JSON请求经共享策略走原HTTP门。

38、61、80、214、233、249、272共7份定向文件通过，214为10组、233为29组，272无头/有头各5组并查看管理、选择、添加和窄屏截图。272已登记M3，未重跑全套。额外83在旧“管理分群档位”入口超时，未进入搜索段，文件未改；新搜索链路由249/272覆盖。证据.qa-local/search-sources-layout-20261019/。

核验基线后同步6份源码并重载合成预览38992→67060；58份业务文件同步及启动后均字节一致，未修改当前配置或访问受限现有页面。最终证据final-verification.json。

## 2026-10-19 活跃设置的全局目标

- 非统一模式在会话按钮首位添加「全局设置」并默认选中；直接编辑现有普通/峰谷全局字段，空白名单可用。没有独立覆盖的群聊跟随全局，清除覆盖恢复继承；保留其他群的值和元信息。
- 按用户「未单独配置的群/私聊使用全局设置」要求修正默认私聊消费：非统一模式实际遵循全局档位，统一模式保留原恒响应；两种模式仍遵守明确安静状态，群/私聊相同号码不串用群覆盖。沿用所选编排器、唤醒策略和保存生命周期，没有改变 DeepSeek Harness 组合边界。
- 12/56/61/204/226/229/259/267/269 九个定向文件通过，267 无头/有头各 9 组，已查看全局和窄屏截图，160 个原配置字段清单与三种 0.4 外观测量保持通过。完整 M3/M4 未重跑。证据：`.qa-local/activity-global-target-20261019/`。预览仅同步本次三份运行文件，重载及数据散列结果以同目录 `final-verification.json` 为准。

## 2026-10-19 主动开话题卡片式开关

- 启用主动开话题改为语义卡片开关，成功/危险描边与 6px 内发光；关闭隐藏下方四项参数，开启从顶部向下裁切弹出，减少动态效果时直接展示。鼠标/键盘操作复用原 FormState/保存生命周期，隐藏不清值；后台逻辑与 DeepSeek Harness 组合边界未改。
- 61 与 249 通过；249 无头/有头各 13 组，含 160 字段清单、整组显隐、实际保存/重读、参数保留、逐帧方向、窄屏及追加资产恢复检查。已查看三种截图，未重跑全套 M3/M4。证据 `.qa-local/proactive-card-toggle-20261019/`；同步与预览重载结果以 final-verification.json 为准。

## 2026-10-23 生命周期修复与主题说明

- 协议消息、拍一拍与自动媒体转发贯穿提供者取消信号与代际检查；名单查询前捕获原身份，替换或停止后拒绝旧结果入库或借新提供者发送。
- 已获取的基础服务立即登记一次性清理，构造失败也等待回收；服务宿主停止后解除配置、能力与总线订阅，单独重新启动时仅绑定一次。能力注册表也释放配置选择观察器。
- 重置保护改由宿主自己的 facade 承载，所选配置、仓库、命名空间和编排器可返回只读对象；保持私有字段接收者、迟到写入阻断、重置响应与最终退出清理。
- 主题与组件库说明改为暖黑黄绿、骨白橄榄绿等颜色描述；颜色数值及旧配置标识兼容。设计记录更名为 `docs/theme-color-design.md`，对应文档引用同步更新；离线市场中的第三方游戏扩展及人设内容未作为产品主题文案改写。
- 新增并登记 291/292 回归：旧消息与拍一拍跨代、迟到媒体、失败构造、重复停止与重新订阅、只读实现、私有字段及主题命名兼容。75 改为验证当次媒体操作的信号，177 补齐实际导入的设置生命周期资源。
- 29 项定向验收全部通过，包含 170–179 组合、172/177 实际 Chromium、重置子进程、SDK 边界、默认界面端到端、启动/停止冒烟和隐私检查；另行完整 M4 为 10/10。完整 M3 尝试仍有旧 UI/夹具失败（例如 83 已移除的“管理分群档位”入口），在定向验收完成后停止该广泛运行；没有将整套回归标记为通过，也没有宣称真实 QQ、安装包或生产部署验收。
