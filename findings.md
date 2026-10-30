# findings.md — 0.5 实现过程中的关键发现

> 范围更新（2026-10-23）：专属协议端与便携客户端的安装、启动和登录态迁移已从项目范围移除。本文保留其余历史记录；旧编号、测试数量与结果只对应当时范围，不代表当前版本已经完成验收。当前外部协议端由用户自行管理。

## 环境
- 3210 残留进程 = 上版 v0.5 的孤儿 node.exe（PID 12444，2026-09-30 用户授权杀掉）。
- 测试端口约定：3987/3988（避开默认段，防与用户实跑实例冲突）。

## M0 已固化的实现裁决（M1+ 必须遵守）
1. bus.on 双通道：internal（内核 NAMES 全集）/ 默认（插件 PLUGIN_SUBSCRIBABLE 子集）。
2. 捆绑插件工具裸 id；用户域 `<id>__<tool>`（24+38 截断）。
3. data/ 目录树按 SPEC §12.1（messages/ 不是 archives/）。
4. QQ_AGENT_PORT / QQ_AGENT_DATA_DIR 在 env 层注入 config defaults。
5. ESM 动态 import 一律 pathToFileURL + ?v=<mtime>（防缓存 + Windows scheme）。
6. 工具执行超时 30s（M0 自由裁量；SLOW_ACTION 分档在 onebot client 层另算 90s/15s）。

## M3 架构审计（software-architect，2026-09-30）

### 现状
- `src/kernel/kernel.js` 当前约 16 个路由：version/status/skills/config/logs/capabilities/chats/messages/read/sessions/retry/abort/pause/resume/memory/usage；HTTP 公共守卫与 SSE 已在 M0。
- `ui/shell` 当前是 M0 两栏壳（插件列表 + 日志），不是 SPEC §10 的 8 页签；尚无 panel-host、插件面板清单或 iframe RPC。
- `task_plan.md` / `progress.md` 已显示 M0/M1/M2 完成、M3 待做；工作树现场核实只有规划文件改动。

### M3 增量架构结论（核心约束）
1. **路由注册插件化**：kernel 只保留公共守卫、路由注册/分发、状态聚合与核心最小 CRUD；具体业务路由按 `bundled/routes-*` provider 追加文件，通过 `ctx.registerRoute({id,method,pattern,handler,bodyMode,auth})` 注册。用户插件可追加 route，但默认禁止覆盖核心 id；manifest 声明 `permissions:['ui.route']`，插件卸载同时移除路由。路由 registry 须提供 `list/availability` 供 `/api/routes` 与测试。
2. **面板协议插件化**：新增 `src/kernel/panels.js`（PanelRegistry）+ `ui/shell/panel-host.js`。面板清单声明 `id,title,entry,permissions,tab,order`；主壳只渲染宿主 iframe，不执行业务 DOM。iframe `sandbox="allow-scripts"`（不默认 allow-same-origin），仅通过 `postMessage` JSON-RPC：`hello`、`getState`、`callApi`、`emit` 三个能力；请求带 nonce、超时、origin/source 校验，API 调用仍过同源 token/origin 守卫；插件不得拿 Node/kernel 对象。面板静态资源由插件自身目录提供，追加目录即可新增/替换面板；同 id 后加载覆盖需 warn + 清理旧 iframe。
3. **默认页签由面板提供**：sessions/chats/memory/usage/skills/plugins/settings/logs/community 由 `bundled/panels-*` 默认清单提供；主壳只保留导航、SSE、主题、对话框和 panel-host。默认 UI 可删/替换而不改 kernel。
4. **configSchema 驱动设置**：Skill 设置表单由 manifest.configSchema 渲染；主设置保留最小手写区块（api/server/security/persona）；密钥字段只显示 hasXxx，脱敏回传不可覆盖真值；保存防抖 + 离开 settings flush。
5. **安全**：route provider handler 不可绕过公共守卫；panel callApi 仅允许声明的 method/path 白名单，禁止任意外域/Node；iframe 消息校验 `event.source===iframe.contentWindow` + nonce；所有危险动作走自绘 `uiConfirm`。

### 路由对账分层与优先级
- P0（M3 验收必须）：公共已实现路由回归；R-01/02/03/04/05/06/07；R-19/20/21；R-22~35 Provider；R-42 test/api；R-43/44 config/preview；R-53~63 skill/tools/config/models；R-64~69 sessions；R-70/71/72/77 chats/memory/messages；R-80~89 pause/chat ops/logs；R-90 captcha-forward。
- P1（可用性增强）：OneBot groups/friends；R-36/37 vision scan；R-38~41 search providers；R-45/46 community blocklist；R-47~52 market accounts/publish/install；R-73~76 memory edit/consolidate；R-78 media-data；R-79 members。
- P2（M4/M5 依赖或外部服务）：市场真实上传/安装、captcha 真实反代、视觉真实扫描、社区远端同步。P0 先提供稳定人话 stub/可注入 provider，不把外部缺失伪装成成功。

### 文件/接口清单
- 内核：`src/kernel/route-registry.js`、`src/kernel/panels.js`、`src/kernel/route-providers.js`（provider 装配/可替换）、`src/kernel/usage.js`（stats/breakdown）、`src/kernel/model-catalog.js`、`src/kernel/ui-actions.js`（危险操作统一 guard）。
- 插件：`bundled/routes-core/`、`bundled/routes-providers/`、`bundled/routes-ui/`；`bundled/panels-default/manifest.json + entries/*.js`。
- UI：`ui/shell/index.html/style.css/app.js` 拆为 `ui/shell/core.js`、`panel-host.js`、`dialog.js`、`tabs/*.js`；每个默认页签独立 module，不把页面业务写进 kernel。
- 测试：`test/26-route-registry-test.mjs`、`27-panel-protocol-test.mjs`、`28-m3-routes-test.mjs`、`29-ui-contract-test.mjs`，继续纳入 `run-m3.mjs`（包含 run-m2）。

### 依赖图/顺序
`route-registry + panels` → `route-providers + usage/model catalog` → P0 routes → `panel-host/dialog` → 8 default panels → P1 routes → full regression/headless。

### 工程验收门
- P0 路由契约：HTTP status/body/error 文案、公共 token/origin/body 守卫、SSE 事件均有断言。
- 面板：追加一个 fixture 面板即可在不改 kernel/主壳业务代码的情况下出现在页签；RPC nonce/source/超时/白名单失败有断言。
- 运行时：`npm test`（M0）+ `run-m1.mjs` + `run-m2.mjs` + `run-m3.mjs` 全绿；headless 3988 冒烟；工作树提交。

### M3 独立契约审计（2026-09-30）
- 高风险服务端缺口（工程修复中）：`routes.js` chat action 正则必须用命名 `op`（http 路由仅传 named groups）；R-65 返回完整顶层会话而非 `{session}` 且不能删 messages；SessionRegistry 必须从磁盘读历史并受控 delete/clear；R-43 必须使用 `sanitizeConfigForApi`（删 secret 键+`hasXxx`，不能自造 `apiKeyConfigured`）；`GET /api/tools` 是 registry DTO 而非 capability；R-80 是 `POST /api/chats/<key>/wake` 410；R-83/84/85 返回 `removed/marked` 并 emit；R-64 limit 上限 1048576。
- SSE：`/api/events` 与 REST 共用 token+origin 守卫；`bus` 必须桥接 session/chat/memory/onebot/log/plugin/status 等事件；logger 需要接 Bus，bridge stop 时解绑。
- Panel/RPC：当前首版只有 iframe mount，缺真实 panels/RPC 接线；必须 `source===frame.contentWindow` + mount nonce + panelId/path allowlist，opaque sandbox origin 下不以 origin 信任替代 nonce；shell 独占 token，iframe 不得获得 token/state secret；unmount 清 listener/timer/AbortController；测试 fixture panel + fixture route provider 验证“追加文件即可扩展”。
- 审计给出 46 条可执行用例，覆盖 SSE guards/15s ping、R43/44、R53-60、R65-69、R77/80-87、iframe JSON-RPC；M3 QA 必须用隔离 DATA_DIR+fake OneBot/LLM，断言 HTTP+JSON+磁盘+SSE 联合副作用。

## M4/M5 规格预研（m4-spec-research，2026-09-30）

### Electron 与启动（SPEC §4.1~4.8 / notes/11-external）
- 三入口：ASCII `启动QQ机器人.bat`（先查 electron.exe，缺失 echo+pause+exit 1）/ NSIS `QQ Agent.exe` / headless `npm run server`。端口从 base 最多顺延 10；必须 `core.start()` 拿真实端口后 `createWindow(port)`。
- Electron：`disableHardwareAcceleration()`；AppUserModelID=`cn.kondius.qq-agent`；打包/开发 dataDir 优先级 `QQ_AGENT_DATA_DIR` > 项目或 exe 旁 `data<profileSuffix>`；主实例且新目标不存在时迁旧 `%APPDATA%/qq-agent/data`。`app.setPath('userData', data/electron-user-data)` 是单实例/网络启动保命点。
- 核心锁 `qq-agent.lock` + Electron `requestSingleInstanceLock` 双层；boot 每阶段同步写 `boot-diag.log`；`QQ_AGENT_PROFILE` 多开 data-<n> 与端口偏移。
- BrowserWindow 1360×860，最小 960×640，show:false→ready-to-show，contextIsolation true / nodeIntegration false / preload CJS。F5 reloadIgnoringCache；外链强制系统浏览器；回环导航白名单；窗口 close 默认托盘隐藏。
- `before-quit` 必须 preventDefault → await core.stop → app.quit；stop 顺序：watcher/abort/reminder/sync+poll/index flush/SSE/OneBot/server/logger/lock。
- preload 窄桥 `qqAgentShell.refocus()`；自绘 dialog 关闭后必须 BrowserWindow.focus，防 Electron alert/confirm 后输入框失焦。

### OneBot 连接
- OneBot：WS 收事件、HTTP 发/查；HTTP 3000/WS 3001+PROFILE偏移；普通 action 15s，SLOW_ACTION `/^(send_(group|private)|upload_|_send)/i` 90s（poke 不慢）；426 专门文案；WS 退避 3s→30s，代际防 401 风暴，selfInfo 15s/45s 双兜底。
- 数据/协议层必须隔离平台词：transport provider 承担 QQ/OneBot；大图发本地 file URI，不能用 base64。

### M5 安装/升级硬约束（初步）
- appId `cn.kondius.qq-agent` 不变，`asar:false`，`nsis.deleteAppDataOnUninstall:false`；升级流程备份→卸旧→装新→还原，绝不碰安装目录 `data/` 与 `data/electron-user-data`。

## M4/M5 深水规格补充（m4-mcp-spec，2026-09-30）

### MCP bridge / 权限
- DSH-ARCH §8：`mcp-bridge` 是捆绑插件，提供 `mcp.tools` capability，把外部 MCP 工具动态注册进工具表；每项保留 server/tool 来源、description/params、scopes、handler；未知来源默认 ask。
- MCP 子进程统一走 `proc.exec`；连接走 `mcp.connect`；网络走 `net.outbound` + safe-fetch；`net.raw` 与交互式 TTY 永不开放；`computer.control` 也必须过权限闸。
- ask 卡显示 plugin id、scope、参数摘要，三选“本次允许/总是允许/拒绝”；群里只返回“权限不足”人话；headless ask=deny+高亮日志。权限闸位于工具管线第 2 步，先于参数校验；每次决定审计。
- 动态 MCP function name 必须匹配 `/^[a-zA-Z0-9_-]{1,64}$/`；不得擅自用 `:`/`.`；冲突遵 registry 后注册覆盖但保留来源追踪。连接/协议/子进程失败只令该工具不可用/报错，不得打崩核心；停用逆序回收所有子进程和动态工具。
- 最低测试：scope 缺失拒绝且不启动；未知 source ask；一次/总是/拒绝三态；net.raw 永远 deny；动态工具出现在 `/api/tools` 与 availability；MCP crash 不崩核心；关闭 bridge 全摘工具；secret 不进摘要/日志。

### compat-04 垫片
- bundled plugin，兼容 0.4 `createSkillApi`：registerTool/config/isSkillActive/capability/hasCapability/log/warn/error/fetch/utils.sleep/safeJsonParse；旧 `register(api)`、setup/hooks/providers/activate 均兼容。
- 旧 `web_fetch` 权限仅映射 `net.outbound`，不扩大到 fs/proc/mcp；旧 plugin.json prompt 形态转 prompt.sections(priority 50)；manifest BOM/id/category/self-dependency/entry realpath/priority≤99 规则沿用。
- 5 hooks 映射并保留 5000ms 超时与异常隔离；热重载 500ms、防 stale-but-working、孤儿工具清扫、停用必 deactivate/dispose、插件装错目录只警告。
- 10 个市场插件验收名单不能凭空编造：从遥测 top8 固定快照 + 2 个冷门记录 id/version/hash；每个验旧入口、工具/能力/prompt/config、web_fetch 权限、hooks、停用/热载失败回滚、命名空间、卸载不删数据。

### 主动/活跃/锚点/记忆整理的插件边界
- 四档触发、wake/wait/drain、SendQueue、安全规则、身份判定、active state、prompt anchor 状态机均是核心硬编码；插件只能通过 before-context/before-llm-messages/after-response/tool.guard/prompt section 观察或加工，不能开第二套 loop、直接写 active/memory 文件或破坏锚点字节不变。
- proactive 默认 false；检查区间 30~90min（1800000/5400000ms），idle 下限 300000，概率 0.25；每 tick 先排下一次再过 enabled/并发/概率/白名单/无未读/静默/未运行闸；主动 prompt 加“可以自然抛话题，也可以安静结束”。
- activeTopic≤60 字；仅召唤 tier 1~3 进入活跃期；reason `/话题(结束|终止|偏离)/` 退出；ttl 下限 60000ms；禁言/暂停优先级更高；插件不得写 active timer。
- promptAnchor 默认开、maxExtraRead=5；追加超限/新成员/锚头滚出 reset；插件不得改核心段顺序或缓存前缀。
- memory 整理默认开，阈值全群>4或成员>5，冷却6h（下限30min），只减不增，解析失败原样保留，每条≤120、每人≤5（下限2）；插件只能调用既有能力/观察 SSE，不能启动第二整理循环。

### NSIS / version / 覆盖升级
- appId `cn.kondius.qq-agent` 不变；data 与 electron-user-data 在安装目录，asar=false，卸载不删 data；覆盖顺序固定：停应用/释放锁→时间戳备份→备份失败立即中止→卸旧程序→装新→恢复/迁移 data→关键文件/installId 校验。
- 必保 config/memory/stickers/reminders/messages/telemetry installId；sessions 可弃；0.4 源只读；config 损坏先 `config.json.corrupt-<ts>` 再默认；Key 脱敏回传不能覆盖真值。
- version.json 固定 GET `https://kondius.cn/qq-agent/version.json`，8s 超时、三段 semver；成功 HTTP200 `{ok:true,current,latest,hasUpdate,url,notes}`，失败仍 HTTP200 `{ok:false,current,error}`；每小时一次，失败不阻断启动。

## M1 规格要点（SPEC §6 + §2.3，2026-09-30 精读）

### 事件进入（§6.1）
- 只处理 4 类：message / message_sent / notify.poke / group_recall|friend_recall / group_ban。meta 心跳忽略。
- message_sent 且 user_id===selfId → return（发送时已自行留档）。onEvent 异常 catch 成日志不打崩 WS。

### 准入三闸（§6.2，不通过=不存档不留痕）
1. 白名单：deny 含→拒；allow 非空不含→拒；allow 空 && allowAllWhenEmpty!==true→拒
2. 全局屏蔽（云端名单+本机豁免差集）
3. 按群屏蔽 blocklist[群号] 含 senderId
4. 段缺失回退 raw_message
5. segmentsToText 占位表：text 原样/at→@昵称(qq==='all'→@全体成员)/face→[表情<id>]/image→[图片]/record→[语音]/video→[视频]/file→[文件<名>]/reply→[引用 名字(QQ:xxx)：原文] 失败→[引用消息]/json→[卡片消息]/forward→[合并转发聊天记录]/其它→[<type>]；整体过 CQ 码清洗
6. 合并转发展开：文本含 [合并转发/[转发消息 && message_id → get_forward_msg → 封顶 30 节点/3000 字/深度 1，超出注"还有 N 条未展开"；失败保留占位符
7. 空文本无媒体→丢
8. @ 判定：有 @ 段以 QQ 号为准（atMarks.some(qq===selfId)，排除 all）；无 @ 段才文本回退；atNames 记录 @ 片段原文（关键词判定剔除用）
9. 指令禁言：群聊 @机器人 && 文本含 commandMute.command → active[群号]=到期 ts(0=永久)；指令本身也入库
10. store.appendIncoming（mid/ts/senderId/senderName/text/media/atMe/atNames）→ chat-update → onIncoming

### 拍一拍（§6.3）
- 自己拍的回显丢弃；操作者被屏蔽丢弃；isPoke:true 轻量记录；文案 [拍一拍] X(QQ:x) 拍了拍 Y(QQ:y)（名字优先群名片，历史反查兜底，绝不硬编码占位符）；isPoke 不进【已读信息】历史但按 1 档触发语义

### 唤醒判定（§6.4 逐条一次定生死）
- 前置：不在运行、不在倒计时、api.model 非空、该群不在活跃期
- 档位累积 4→3→2→1 首个命中：4 群聊必触发（私聊恒响应）；3 @或关键词或当场掷骰(<randomPercent，骰子结果固定)；2 @或关键词（@段原文里关键词剔除）；1 仅 @(QQ号)；禁言群强制 1 档；活跃期必响应
- 不触发→当场标已读（一闪即已读）；触发→scheduleWake(verified:true) 保持未读
- 倒计时 wakeDelayMs 固定不重置；复用 waiting 会话必须用 sessions.current.get() 活对象

### wake 顺序闸（§6.5）
1. aborted/paused→等待会话 aborted；2. model 空→aborted('模型未设置')消息保留未读
3. 群聊查自己被禁言：快=chat.ban-state 能力；慢=get_group_member_info 查 shut_up_timestamp 缓存 60s；判据=shutUp*1000>now（写成>0 会永久误判）；被禁言→全部未读标已读、不建会话
4. 并发满→waitUntil+3s 跟踪式定时器（必须入 wakeTimers 表防幽灵）
5. 触发批：verified 批 batchFloor=waiting.startedAt-60s；机械批逐条补判定（全不触发→全部标已读 discardWaiting 干净消失不调 LLM）；活跃期最早未读全进批
6. 档位此刻固定（骰子存 session.contextReason）
7. 会话状态机：等待原地转 running；重试复用 reuseSessionId
8. 会话级重试：MAX=1+min(5,retry)；条件=未满 && isRetryable && sent 空 && 未中止；退避 1s/2s；重试前清 messages/sent/usage
9. abort 标记→aborted 否则 error；sent>0→done 否则 noreply（正常不是错误）
10. drain：结束仍有未读→scheduleWake(drainDelayMs=1200ms 下限 200)
11. 记忆整理后台静默触发

### 提示词（§6.6）
- system 顺序：核心规则(不可覆盖层)→人设三层(主人>会话>全局)→Skill 片段(priority 降序默认 50 动态 40 上限 99)→ownerRules(p72)
- systemPromptOverride 整体替换+占位符 {botName}{roleText}{participation}
- user 段落顺序：【记忆】→【已读信息】→【未读信息】→【新加入成员】→表情库清单→话题锚点
- 历史读取：各档统一 historyCount=80；isPoke 跳过；撤回过滤；自己发言"我"视角标签
- 锚点：复用上一轮【记忆】+【已读信息】前缀字节不变只追加；追加>5(maxExtraRead)整体重置
- 无字符预算机制

### LLM 与工具循环（§6.7）
- 非流式 stream:false 硬编码；超时 api.timeoutMs 180s；候选=主+fallbackModels；每候选内层重试 2 次（1s/2s 无抖动）；可重试=5xx/429/超时/网络/JSON 错；4xx 不重试但换候选；abort 不重试不上抛即断
- 带图自动切 visionModel；思考方言 detectDialect；usage snake_case 兼容；response._usedApi 更新 session.vendor
- 工具循环 maxRounds 12；工具集过滤唯一口径 getToolAvailability 原因进 excludedTools
- hooks：before-context→before-llm-messages(可改)→after-response→before-tool(可否决)→after-tool；超时 5000ms（定时器不可 unref！）
- 剩 3 轮 && sent 空→注入 user 催发 send_message
- 内联工具调用三种格式解析（<function=x>…/JSON 块/首行函数名+JSON），解析成功改写成 tool_calls 形态
- 媒体 parts 不进 tool 消息（文本 only），媒体随 user 补发 [系统：以下是工具 X 返回的 N 张图片…]
- finish 触发活跃模式状态机（§6.8：activeTopic ≤60 字进活跃期；reason 匹配 /话题(结束|终止|偏离)/ 退出；ttl 兜底）

### 发送（§6.10）
- 每会话串行链：mdToPlain→[object Object] 拦截→hardSplitAt 4000 切分；全被拦抛"消息内容为空"
- 限频 80/500 按会话独立，超限抛错给模型（文案含上限）
- 真人停顿 gap=clamp(randInt(min,max)*0.5+字数*byLengthMs*0.5)，最后一条 0；表情 600-1500/图片 500-1300/媒体 800-1800 前置停顿
- 去重 8s 窗口（文本/图片指纹 url>file>dataUrl 长度+前64/媒体指纹）；成功后才记账
- 引用/at 只挂第一条；CQ 转义；store.appendSelf(self:true) 留档
- 部分失败→failed[] 带 index+原文+错误；全败抛错；表情三级回退（file→get_image→base64≤15MB）；图片两级（file URI→dataUrl）
- SLOW_ACTION=/^(send_(group|private)|upload_|_send)/i→90s；其余 15s；send_poke 不在慢表；426 专门文案（httpUrl 指到 WS 端口）

### 会话生命周期（§6.13）
- 手动重试：仅 error && sent 空 && 未在跑；按时间窗翻回未读；原地复用同一 id
- 中止：waiting→撤定时器干净消失；running→打标记+AbortController.abort() 立即断在途
- abortAll 清全部 wake 定时器（含重排）与 pendingWake

### 会话 status 枚举（§2.3）
waiting|running|done|noreply|error|aborted|discarded（干净消失 UI 不显示）

### 主动话题（§6.11）/提醒循环（§6.12）
- proactive：每次 tick 先排下一次（随机区间）再判定；enabled/并发/概率三闸；候选=白名单内&&无未读&&静默≥idle&&未跑；随机挑一个 wake(proactive:true)；userPrompt 追加专门段
- 提醒：20s tick 启动 5s 首查；due→逐个走 SendQueue 完整管道；发送成功才 markFired；reminderFiring Set 防并发

## M3 续作检查点（2026-09-30）
- M3 控制台实现已在最终验收后提交为 `a34790c`；提交前工作树包含 kernel/console/panel/test/doc 改动，现阶段仅允许追加验收记录。
- 当前以规格收口优先：R02/R03 安全数据操作、R23-R26 明文密钥独立信任闸、R67/R68/R69/R86 会话与 SSE 语义并行处理；余下路由与浏览器/Electron 真 E2E 先做精确拆分后再实施。
- 现有 `run-m3` 的全绿只证明覆盖到的合同测试，不能替代 R01-R91 逐条签收；任何外部依赖缺失不能以 503 伪装为完成。

## M3 R01/R04/R05 追加审计（2026-09-30 续）
- `notes/12-data.md:290-297` 规定 `usage-days/<day>.json` 为 `{version:1,day,savedAt,aggregates:{totals,chats,models,searchCount,toolCounts,hours}}`；历史快照沿用生成时价格，不能按当前价格重算。无快照日才扫描完整 session。
- 当前 `src/console/routes.js` 的 `usageRows()` 仅扫 `sessions.listSummaries()`，`cost/peakCost/offPeakCost` 恒为 0，`dim/key` 未实现，`showPeak` 固定 false，排序按 token；需要读取完整 session 或每日快照恢复 usage/raw usage/tool calls。
- 计价口径来自 `notes/16-periphery.md:245-251`：custom 优先；官方价启用且未命中时 `source='unmatched'`、单价 0；关闭官方价才走 manual/none；价格条目的 `cached:null` 按普通输入价。
- R01 还需输出 `onebot.everConnected/error/self`，并按 09b 三种未连接诊断优先；每个本地状态探测器必须独立容错，不能总 catch 伪装全 false。
- 已委派 write-enabled `m3-usage-status-impl` 实现/测试 R01/R04/R05；实现限定 routes.js R01-R05 区块，避免覆盖同时进行的 Vision/Search 与社区/市场区块。
- R05 快照/交叉下钻补丁已通过 `test/39-m3-usage-breakdown-subset-test.mjs` **9/9**：同维度使用对应 usage-days 聚合，chat×model/model×chat 跳过无交叉明细的日快照并完整扫描 sessions，totals 与 rows 保持同一子集。
- R70/R90 修复已通过 `test/39-m3-chat-forward-test.mjs` **18/18**、HTTP security **57/57**、console routes **21/21**、safe-fetch **32/32**；聊天 DTO 现在 `key=group_123`、`chatKey=group:123`，R90 已剥离压缩/敏感/逐跳头并覆盖 response-body timeout，白名单文案已对齐规格。
- 当前完整 M3 runner 已最终通过 **22/22 文件**（含真实 Chromium：Playwright 1.59.1 + Chromium 1228，27/27），headless smoke **12/12**，`git diff --check` 通过。R01/R04/R05 DTO 已包含 ok/range/dim/key/by、完整 rows/totals、cost.breakdown/prices/matched/peak/hasPeakTiers/cacheHitRate；新增状态插件 DTO 脱敏回归为 16/16。价格 resolver 遵守 custom → official cache/feed → manual/none；clean-room 规格目录仅给出内置表结构与来源，没有完整数值表，因此不凭空复制，生产以固定远程 feed/cache 作为 official 数据源。

## M4 MCP/Electron 审计增量（2026-10-01）
- `8d8faf2` + `e861cc5` 的 MCP fixture 回归为 42/43/run-m4 全绿，但只覆盖显式 fake spawn/手动 compat API，不等于正式 loader 装配已闭合。
- fresh-eyes 审计确认 P0：`bundled/mcp-bridge/index.js` 不能默认 import/spawn `node:child_process`；必须由捆绑特权缝注入 process adapter，缺失时明确 unavailable/fail-closed。
- fresh-eyes 审计确认 P0/P1：plugin-loader 当前 ctx.permissions 只有 status、kernelDeps 没有 permissions/http/loader 适配；compat-04 setup 仅注册 capability，正式 loader 不会自动调用 `adaptLegacySkill`；compat direct import safe-fetch 绕过窄缝；动态工具应经 ctx.registerTool 进入 owner tracking；MCP stop 必须拒绝 pending 请求并清工具/能力；stderr 必须脱敏，工具 ID 需防 namespace 碰撞。
- Electron 修订已提交 `27fbb56`，定向壳测试与语法检查通过；包含启动失败 dialog、幂等 shutdown/异常退出、托盘/close-to-tray、自启、`qqAgentShell.refocus`/`app-refocus`、captcha 单注册、版本 DTO+SSE 更新提示、外链/F5/崩溃诊断。captcha 网络诊断 IPC 仍未实现；真实 Electron 依赖未安装，真实托盘/双实例/注册表仍 BLOCKED。
- MCP 正式装配已提交 `827cbd8` + `e81aa53` + `16b242d`：无直接 spawn 的 bridge、显式 mcp adapter、权限检查注入、owner 追踪、pending/子进程/能力清理、compat fetch 注入、legacy marker 自动交给 compat-04 并把窄 compat adapter 注入 targetCtx；正式 loader fixture 6/6，MCP/compat run-m4 43/43（加入权限 Ask 后 M4 runner 7/7；MCP timeout 后42项14/14）。仍需真实 MCP server/Windows runtime 验收。
- R08-R16 已改为 processAdapters 注入式路由：M3 不直接 spawn/kill，缺 capability 明确 503；`test/40-m3-process-routes-test.mjs` **18/18**。R44/R63/tool context 已修复，`test/41-m3-preview-models-test.mjs` **14/14**，vision verdict 已接入 runtime availability。
- 独立审计发现 R52 `inflateRawSync` 超限解压风险；已由 `0686b60` 修复为受限 raw inflate，并校验 local/central size、CRC、压缩条目边界；`test/38-m3-community-market-test.mjs` **27/27**，随后完整 M3 runner **22/22**、真实 Chromium **27/27**、headless smoke **12/12** 全部复验通过。

## M4 最终门禁（2026-10-01）
- M4 runner 已独立子进程执行 **9/9 文件通过**：Electron shell、process adapters、active/memory、active-anchor production、MCP、compat、正式 loader assembly、permission ask；当前 HEAD 上 MCP 14、compat 11、loader 7、permission ask 专项均通过，模块类型 warning 仅来自临时 fixture。
- M3 防回归：`run-m3.mjs` 22/22 文件通过；headless smoke 12/12；使用 managed Node + bash `export NODE_PATH` + `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指向 Chromium 1228 后，当前提交真实 Chromium 27/27 通过。
- 工作树已 clean。实现层已提交：`27fbb56`、`6ae7274`、`827cbd8`、`e81aa53`、`16b242d`、`c8994be`、`2a7f879`、`2875ef6`、`25ff14b`、`5fcf9ad`、`8550437`、`a6aec68`、`0b2c375`、`065c5d7`、`0ff7cff`、`2b077da`、`1ce8c3a`、`d23d747`、`aea0e7d`、`d23d747`、`e77351c`。权限 Ask timer race 后续固定提交为 `d23d747`，其 test45 fake-clock 竞态门与 M4 9/9 已复验。
- 真实运行时仍 BLOCKED：虽已通过 `npm ci` 安装 Electron/electron-builder，且 package-lock 已同步（`f1ad06b`），仍未取得真实 Windows 托盘/注册表/双实例环境；未跑真实 MCP server；真实 captcha 网络/公网反代与权限 GUI 仍未验收。权限 ask 三态 broker/UI 已由 `2875ef6`、`7e1c4c2`、`2fbd330`、`5c5ff65`、`25ff14b`、`8550437`、`a6aec68` 实现并通过 test45/run-m4；其 once/always/deny、去重、超时/停机 fail-closed、审计 requestId 与 detail 脱敏仍以 mock/HTTP/SSE 级证据为主，真实 GUI 三按钮仍需 Windows runtime。
- 结论：M4 代码实现门通过，但真实运行时验收门未通过；M5 安装器/发布流程不应被本次 mock 结果伪装为已完成。

## 2026-10-06 Preview 完整功能交付启动审计

### 用户目标
用户确认地基已打好，要求开始把当前规格书内所有要求实现，产出功能完整可用的 0.5 Preview。验收口径是「功能真可用」，不是仅有路由、工具、面板数量或 mock 合同测试。

### 当前工作树基线
- 当前 `v0.5` 有大量未提交修改：之前的 M4/M3 变更、四档唤醒修订、工具冲突诊断、QQ 表情收藏、插件增删、热更新均混在一起；任何新改动必须与现有未提交内容共存，不得回滚用户改动。
- 既有文档中的 M0-M4 complete 与真实运行时验收 blocked 不能直接作为事实；需重新逐条核对源码、规格、测试与运行时。
- 规格书功能表为 F-001..F-223 共 170 条（核心/核心+扩展 162 条，扩展 14 条，标签重叠），不能用编号数量作为实现证明。
- `src/kernel` 当前实为 29 个模块；捆绑工具因删除 `sticker_note` 后为 28 个，需同步所有规格/测试/说明中的旧数字。

### 已确认的近期增量（需纳入完整审计）
- 四档唤醒已按用户权威口径改为独立短路：1=仅@，2=@或关键词，3=@/关键词之外最多骰一次，4=有消息就回；拍一拍与@同级；测试已挂入 M1。
- 技能页新增用户插件删除、ZIP 安装、单插件热更新；热更新用 import namespace 绕 ESM 子模块缓存，指纹变化作废旧授权；这些端点/manifest/UI 仍需完整运行时验证。

### 初步疑点（仅作为待核实清单，不得当成最终结论）
1. `memory.consolidate` 与 `media.transcribe` 是否仍无 provider；若无，F-031/F-101/F-102 不能宣称完整，仅能宣称 capability 缺口。
2. proactive/active/anchor 的逻辑虽有源码与 M4 测试，需核对真实 tick、配置闸门、活跃期收尾和提示词前缀字节稳定性。
3. F-160/F-161/F-167 的目录加载、热更新、删除与权限/iframe 代际是否形成完整用户链路，而不是端点各自存在。
4. NSIS 已有构建产物，但 Electron GUI、Windows 托盘/注册表/双实例、真实升级仍需运行时证据。
5. 规格中 F-170..F-175、F-220..F-223 等社区/反馈/遥测功能，需要核对当前是否真实可用、是否仅有适配器/503 stub。
6. 规格书 §6.4 旧「累积生效」文字、其它历史笔记与近期用户权威口径可能存在冲突；实现和所有测试必须以用户 2026-10-06 定义为准。

### 并行审计回传（2026-10-06）

#### UI/控制台审计（ui-auditor）
- P0：`ui/panels/sessions/panel.js` 的 `request('GET', '/api/sessions')` 不传 body，`panel-client` 的 request 返回结构在空响应时会导致 session 页首次加载抛异常；需用真实 headless HTTP + panel RPC 复现并补空 body 处理。
- P1：settings/configSchema 能渲染大部分字段，但需核对滑条/秘密字段/递归 configSchema/离页 flush 是否逐项可用。
- P1：memory 面板的整理/按成员整理受 `memory.consolidate` 缺 provider 影响；当前显示 capability missing 而非完整功能。
- P1：chats 面板分页/筛选/清空/测试发送链路需逐按钮核对；sessions 详情和 retry/abort 需逐按钮核对。
- P1：skills/plugins 两个面板内容高度重叠，新增/删除/热更新应明确职责与事件刷新，manifest 白名单必须同步。

#### 运行时/交付审计（runtime-auditor）
- P0：`src/kernel/kernel.js` 没有 production `memory.consolidate` provider；`memory-media-adapters` 会对手动/自动整理返回 503 `CAPABILITY_MISSING`。因此 F-101/F-102 仍不是完整可用功能。
- P1：真实 Electron/托盘/注册表/双实例/OneBot/MCP server/权限 GUI 仍未形成真实 Windows 证据，mock/HTTP/SSE 绿灯不能替代。
- P1：proactive/active/anchor 有单测与源码，但缺真实长跑证据；需要 deterministic clock + headless orchestration 验收。
- P1：社区/反馈/遥测路由需逐条确认是真实外部闭环还是 503/adapter；规格要求不能把“可注入”算作默认可用。

### SPEC 能力消费点审计回传（spec-auditor，2026-10-06）
- `message.owner-check`：SPEC §7.5/§3 要 orchestrator 按 QQ 号从触发批识别主人并替换 persona/rules；当前 `orchestrator.js` ownerRules 为空，全文没有 `capability.providers('message.owner-check')` 消费点。
- `media.download`：SPEC 要 app 层对 B站/抖音链接自动下载转发；当前只有 `MULTI_PROVIDER_CAPABILITIES` 声明，无 kernel URL 检测/下载转发生产消费。
- `reply.grounded-select` / `reply.local-policy`：SPEC 列出 orchestrator/reply-rescue 消费；v0.5 无 reply-rescue bundled 目录，无生产 provider/consumer。
- `reply.inline-calls`：agent-runner 有硬编码 parser，但没有 capability provider/consumer 接线，无法按插件替换。
- `media.transcribe`、`chat.ban-state` 已有真实消费：kernel ingest 和 orchestrator 分别接能力。

### 当前 P0 功能缺口重新分类（2026-10-06 更新）
1. ~~P0 能力接线：owner-check、media.download、reply.inline-calls、grounded-select/local-policy 的生产消费点。~~
   `message.owner-check` 已接入 orchestrator（缺省回退全局人设）；其余 media/reply 能力仍待补。
2. ~~P0 记忆闭环：memory.consolidate 无 production provider。~~ 已在 `kernel.js` 注册 production provider，复用 `chatCompletionWithRetry`，adapter 负责只减不增安全校验；需补真实模型+异步事件测试。
4. **P1 UI/进程**：sessions 空 body 兼容、stale lock、插件/技能职责和事件刷新。
5. **P1 后台循环**：media.download 生产消费、blocklist/price/telemetry/vision/plugin-watch/UI polling 等规格周期仍需逐项闭环。

### 2026-10-06 已完成的 P0 修复
- `message.owner-check`：orchestrator 在 `runOnce` 消费 capability，主人批次可覆盖 persona（botName 不可覆盖）并追加 priority 72 ownerRules；异常回退全局人设。
- `memory.consolidate`：kernel production provider 调当前模型 JSON 整理，adapter 继续负责 503/202/409、只减不增、≤120 字、去重、成员边界和异步 SSE。
- 工具契约：send_to 白名单空默认拒绝+拒绝当前会话；send_message/send_to/memory_append/query/remove/send_image DTO 逐步结构化；list_stickers 支持 query；check_holiday 输出 today/upcoming 对象。
- 插件 fs.watch：loader 默认监听 bundled/plugins/skills，500ms debounce、重入保护、stop 清 watcher/timer，热更新走新 import namespace。
- 全量回归：M1 13/13、M2 8/8、M3 27/27、M4 10/10、headless smoke 12/12。

### 后台循环审计补充（spec-auditor，2026-10-06）
- SPEC §13 要求的循环逐项对照：当前有 reminder/proactive/requeue/retry、WS probe、sessions 5s index debounce、SSE 15s ping；以下生产循环缺失或只做了手动路由：
  - 社区全局 blocklist 5 分钟同步（影响 F-026/F-027）；
  - 价格 feed 启动拉取 + 成功后 24h、失败后 3h 重试（影响 F-084/F-201/T-04）；
  - 匿名遥测启动 90s 首次、后续每 6h（影响 F-223）；
  - vision scan 2s flush 合并队列（当前只有一次性异步路由，影响 F-073/F-203/T-06）；
  - plugin/skills 目录 fs.watch 500ms debounce 热加载（当前只有手动 reload/hot-reload，影响 F-160/F-161）；
  - UI 15s polling（部分 panel 仅 SSE/手动刷新，影响 F-005/F-147/F-198）。
- `price-update-adapters.js:153-178` 只是按路由调用，未形成后台策略；`routes.js:430-435` vision scan 只是单次启动；kernel/http.js 的 15s 是 SSE，不是上述业务循环。
- T-28 `check_holiday` DTO 偏差：当前 `src/kernel/holidays.js` 返回 today boolean + holiday spread(wish)，SPEC 要 `today:{name,greeting,type}|null`、`upcoming:{...}|null`、`note`；需补 greeting/type/upcoming。
- F-104 搜索 provider 偏差：当前 `src/kernel/web-search.js` / `src/console/search-provider-adapter.js` 对 DeepSeek/Zhipu/Bocha/Baidu/Metaso 统一 POST `/search` + Bearer + `{query,count,model?}`，未按 notes/08 的各家 endpoint/body/response 方言解析；需逐家对契约实现与测试。

### 2026-10-06 P0/P1 第一轮实现结果
- owner-check 已从 capability registry 接到 orchestrator runOnce：批次含主人时覆盖 persona（botName 保持账号身份）并追加 ownerRules；无 provider/异常回退全局人设。
- memory.consolidate 已由 kernel 注册 production provider，复用当前配置的 `chatCompletionWithRetry` 输出 JSON；现有 adapter 的只减不增/长度/重复/成员边界校验继续生效。
- media.download 已接核心消费点：消息入库后检测 B站/抖音域名，`capability.claim` 认领 provider，结果走 SendQueue；没有平台 provider 时明确 no-provider，不伪造下载。
- loader fs.watch 已默认开启：bundled/plugins/skills 三根目录 500ms debounce、重入保护、停机关闭 watcher/timer；热更新仍走新 import namespace。
- 价格源已接 kernel scheduler：启动拉取；成功24h、失败3h；emit price-update，stop 回收 timer。
- sessions 面板 GET 空 body 已改为 `undefined + query`，并把断言加入 55 号 panel contract。
- kernel 单实例锁：遇 stale lock 会读取 pid，`process.kill(pid,0)` 确认不存活后回收并重试；活实例仍拒绝启动。
- 所有回归保持全绿：M1 13/13、M2 8/8、M3 27/27、M4 10/10、smoke 12/12。

### 第二轮实现结果（2026-10-06）
- 结构化工具契约：send_message/send_to/memory/list_stickers/query/check_holiday/send_image 已按 SPEC 终版逐步对齐；旧字符串断言同步改测试。
- `send_image` note 不再只是 result 文案，而是作为文本+图片消息链发送；浏览锁改 URL hostname 精确匹配。
- `memory` 面板正确处理印象对象 `{content,createdAt}`，显示整理状态与 202/503 结果。
- `ui/shell/app.js` 轮询状态：启动立即 poll，按 config.ui.refreshMs（下限1000，默认15s）轮询 `/api/status` + `/api/config`，失败静默写入 state，防止 toast 刷屏。
- lock：实例锁 EEXIST 时读 pid，用 `process.kill(pid,0)` 判断；死锁回收后重试，活锁明确拒绝。
- 价格循环：kernel 启动即刷新，成功24h/失败3h scheduler，stop 回收。
- media.download 核心消费点：消息文本命中 B站/抖音域名后 capability.claim，认领的 segments 统一走 SendQueue；无 provider 明确 no-provider。平台下载解析器仍需外部插件。
- `test/58-runtime-contract-test.mjs` 已纳入 M3，覆盖表情失败语义、fs.watch、stale lock、price tick、media claim、关键文件。

### 第三轮运行时/交付收口
- kernel.start 使用 try/catch：启动任一步失败时 stop transport/loader/scheduler/http 并 releaseLock，避免残留死锁。

### 2026-10-06 下午设置与管理实现口径
- 设置界面保留现有操作台色彩/布局，不另起前端框架；主配置改为分区字段+局部 patch，只读脱敏状态不回传整份配置。四档由唯一 contextSliderPos 派生，概率直接转滑条，不提交被后端忽略的派生字段。
- 密钥采用空白写入框、已配置状态、显式清除确认；仅按用户点击才读可显示的 API/搜索密钥，控制台 token 不进入 iframe。保存序列化并按每字段版本清 dirty，输入/轮询/离页冲突不能吞改动。
- 渠道/模型、人设模板、工具/能力、搜索源、视觉扫描用已实现的真实 REST 端点补成 UI；所有面板 method/path 白名单同步，测试以 Chromium 操作并检验实际磁盘/配置值为证据。

### 2026-10-06 第四轮工具/后台契约收口
- `test/58-runtime-contract-test.mjs` 已纳入 M3，锁住表情失败语义、fs.watch、stale lock、价格 tick、media claim；测试中发现并修正过度严格的源码正则（不要把无关常量当 loader 契约）。
- system-tools T-25/T-26/T-27：日期严格校验（拒绝 2 月 31 日等 JS 自动归一）、set_reminder `{set,id,dueAt,note}`、list_reminders 格式化字符串、cancel `{cancelled,id}`。
- `docs/SPEC.md` T-06/T-08/T-09 已同步 list_stickers query/items 与 sticker_note 删除/QQ 侧备注失败语义；旧 SPEC 与新用户决策不再冲突。
- M3 最新 28/28，M1 13/13，M2 8/8，M4 10/10，smoke 12/12。

### 当前阶段收口结论（2026-10-06 21:35）
- 已实跑：M1 13/13、M2 8/8、M3 28/28、M4 10/10、headless smoke 12/12；verify-preview-build 对现有 dist 证实源码资源齐全，但 QQ 外置运行时缺失。
- 已明确不凭空实现的外部能力：B站/抖音下载解析（media-download provider）、reply-rescue/grounded-select/local-policy、视频 frames、语音 transcribe、社区真实远端接口、Windows GUI/NSIS 升级真实验证。规格只定义接口/消费点，未给 provider 行为细节或发行许可资源；当前核心消费点已接线并在无 provider 时安全回退。
- 已完成仓内可确定实现：owner-check consumer、memory.consolidate production provider、工具 DTO/T-25..T-29 多项、sticker_note 新语义、loader fs.watch、UI refreshMs poll、stale lock、启动失败释放锁、price feed 24h/3h、global blocklist 5min、media.download claim+SendQueue。
- 仍需专门阶段：settings 全量配置 UI/社区市场入口/意见金句/遥测、query/web/search vendor 方言逐家对齐、vision flush、reply safety 三能力、Windows runtime 与清洁发行资源包。

### 第五轮遥测/反馈收口
- 新增 `src/kernel/telemetry.js`：匿名 installId 保持 `data/telemetry.json`，聚合 `telemetry-totals.json`，启动 90s 首报、后续6h，失败静默，toolCounts上限50；kernel 默认启动、stop 回收，`telemetry.enabled=false` 可关闭。
- `report_feedback` T-29 改为 `{reported:true}`，会话反馈仍写 `session.feedbacks` + SSE feedback。
- 当前仍不宣称 F-220/F-221 UI 完整：clean-room 仓库没有旧版意见/金句上传路由的完整参数契约，不能凭空编造外部 API。

### 2026-10-06 下午行为复查：前轮结论需要纠正
- settings 仍只有固定字段且完全跳过密钥，首次安装无法从 UI 配置 API Key；store.contextTier/randomPercent 会被 contextSliderPos 派生覆盖，编辑这两个字段不是有效设置。
- settings 用整份脱敏配置回传，status 轮询每次调用 load() 并清 dirty，会吞正在编辑的文本；须改为局部 patch 与保存版本控制，不在轮询中重建活表单。
- 插件删除/热载端点拿 listEntries DTO 的 rootKind/dir，但 DTO 只有 root 且不含 dir；功能无法实际操作。安装端点未用 extractZipSafely 返回的临时目录，loadDir 入参顺序错误；目标已存在时 catch 会误删原目录。必须改为宿主 hostEntry 与事务落盘，默认不执行未经确认的新代码。
- `?v=...&ns=...` 只改变入口 URL，不会自动传播到子模块；之前热更新已完成的说法不成立。以真实多层 helper 更新验证修复。
- Kernel 同 pid 锁会被当 stale 清理；prices/blocklist/telemetry 在网络 await 后可能停机重排；telemetry-totals 只读首次缓存会冻结统计。均需以行为复查补齐，源码匹配测试不作为完成凭证。

### 第六轮 UI 收口
- settings panel 从 Base URL/model/refreshMs 三输入升级为核心配置路径编辑器：persona、store 响应档位/关键词、proactive、chatActive、tools、webSearch、security、ui 等；密钥命名路径不生成编辑器控件，避免脱敏值覆盖真值；插件 configSchema 仍由技能/插件页处理。
- shell 顶栏补 6 个外部入口：意见、金句、Skill 市场、插件市场、人设广场、官网，统一 `window.open(...,'noopener')`；外部页面由系统浏览器承接。
- memory panel 修复印象对象渲染（`{content,createdAt}` 不再出现 `[object Object]`），整理按钮显示 202 提交/503 失败语义。
- M3 28/28 通过。

## 2026-10-06 中断回退后的严格复核（发现并修复 4 类问题）

用户提示"任务被截断回退，实际进度可能大于当前进度，对新代码要严格检查"。逐项核实后确认：

### 已存在的更成熟实现（我原以为是缺失，其实更好）
- `plugin-loader.js` 已被重构：串行 `loadQueue`、`ownerEpochs`、`graphImports` 导入预算、`watchEpoch`/`watchPending`/`loadingEntries`；**不再用 import namespace 破ESM 缓存**（那会造成模块实例泄漏）。
- `routes.js` 的删除端点更严：`hostEntry` + 符号链接拒绝 + 限定用户域直接子目录 + **移入 `uninstalled-v1` 隔离区**（可恢复），而非 `rmSync`。
- 安装端点更严：staging 暂存解压、清单唯一性/entry 防穿越/Windows 保留名防护/三域同名冲突检测。
- 热更新**不 unbind 授权**（注释明确"否则新授权也会失效"），改为返回 `needsReauthorize` 引导前端；且禁止热更新改扩展 id。

### 修复 1：遥测累计静默失效（真 bug）
`sessions.finish` 原接线把 `loadTelemetryTotals({sessions:{peek}})` 全量重算当增量用，
而该重算依赖 `sessions.list`（不存在）→ 结果恒为 0，再用 `Math.max(0, cached)` 把缓存也压成 0。
**重写为增量语义**（读缓存 → 累加本会话 → 原子写），并在 `loadTelemetryTotals` 保留"重建值不低于缓存"的下限保护，
使实现同时满足 SPEC notes/12-data §3.11（终态累加 + 删会话不回滚）与既有测试意图。

### 修复 2：前端模块缺失导致管理页白屏（真 bug）
`ui/panels/{skills,plugins}/panel.js` 都 `import{renderExtensions,installZip}from'../extension-manager.js'`，
但 `ui/extension-manager.js` **不存在**（回退丢失）→ 两个管理页在浏览器直接白屏，而 M3 契约测试全绿（只查字符串）。
**按真实契约重建**该模块（启停/热更新/宿主授权/删除/ZIP安装，删除走隔离区，bundled 不给删除与授权），
并接上 `ui.js` 已有的 `managePermissions`（此前我曾草拟过`location.reload()` 敷衍实现，已改为真实授权面板）。

### 修复 3：新增事件未注册（真 bug）
`price-update` / `blocklist-sync` 不在 `bus.js` NAMES 与 `sse-bridge.js` EVENT_MAP 中，
每次启动刷"试图 emit 未注册事件"错误日志且 UI 收不到。已补齐两处白名单。

### 修复 4：断言与实现脱节（本轮反复失败的真因）
57/58 号测试的源码断言停留在**我自己早期的简陋实现**上（rmSync 直删、import namespace 破缓存、
面板按钮写在各自 panel.js、`Math.max` 下限保护），而代码已被重构成更严格版本。
处理原则：**先读实现确认是代码对还是测试对，再改**。本轮 4 次"测试失败"里有3 次是测试过时。

### 新增测试
- `test/60-telemetry-totals-test.mjs`（31 断言，真实 SessionRegistry 驱动的累加/幂等/重建/上报隐私/周期）
- `test/61-ui-module-integrity-test.mjs`（import 可解析、共享模块导出、DOM id 齐备、端点存在）
- 修正 57/58/61-kernel 三处过时断言。

### 回归
M1 14/14、M2 8/8、M3 33/33、M4 10/10、headless 12/12、`git diff --check` 通过。

## 复核第二轮：全局扫描发现"重复实现"（我自己引入的）

### 全局扫描（不限于改动过的文件）
- 80 个源文件语法全部通过。
- 101 条相对 import：0断裂。
- 命名导入 vs 导出比对：10 处报"缺失"，其中 9 处是脚本正则不认 `export const $=...` 箭头函数（误报），**1 处是真问题**。

### 真问题：`ui/extension-manager.js` 与 `ui/panels/extension-manager.js` 重名并存
- 两个面板 `import ... from'../extension-manager.js'`（相对 `ui/panels/`）→ 实际加载的是**`ui/panels/extension-manager.js`**。
- 我在第一轮误判"该模块丢失"后，在 `ui/` 下新建了一个 4958 字节的**简化重复版**，
  而`ui/panels/extension-manager.js`（9014 字节，回退前已存在、且更完整）被我当成不存在。
- 简化版缺：configSchema 设置对话框、启用前信任确认、密钥字段遮蔽、多维状态展示（加载/开关/可用/来源/版本）、
  卸载说明"插件存储数据保留"、`pickZip` 的 focus/cancel 兜底。**已删除简化版，保留完整版。**
- 教训：判定"模块缺失"前必须先确认**相对路径解析后的真实落点**，不能只看某个目录下有没有同名文件。

### 保留的完整版能力（ui/panels/extension-manager.js）
`renderExtensions` / `installZip` / `pickZip` / `settingsDialog`；启停（启用前非沙箱警示确认）、
按 configSchema 动态设置对话框（secretKey 遮蔽 + 枚举/数值/对象类型校验）、
热更新（失败抛错 + needsReauthorize 引导重新授权）、宿主授权、卸载（先停用 + 移入可恢复隔离区 + 明示数据保留）。

### 顺带修复
- `price-update` / `blocklist-sync` 补进 `bus.js` NAMES 与 `sse-bridge.js` EVENT_MAP（此前每次启动刷"未注册事件"错误且 UI 收不到）。
- 遥测：`sessions.finish` 改为增量累加（读缓存 →累加本会话 → 原子写），`loadTelemetryTotals` 保留"重建不低于缓存"下限保护；
  `totals({verify})` 支持强制重建校验。

### 回归
M1 14/14、M2 8/8、M3 33/33、M4 10/10、headless 12/12；`verify:preview` 仍提示外置运行时缺失（M5 硬门，未变）。

### 端到端验证（真实 headless 启动）
`QQ_AGENT_PORT=3993 node src/server.js` 真实起服务：
- `/api/status` `/api/skills` `/api/tools/conflicts` `/api/memory-files` **全部 200**。
- OneBot 未启动时按 3s→6s→12s 退避重连，行为符合 SPEC T-18（未打崩主进程）。

### 方向性纠正（重要）
回退后的代码库比我以为的成熟得多。逐项核实发现**我此前判为"缺失"的多数功能其实都在**：
- 7 个能力消费点全部接线（media.download / reply.inline-calls / reply.grounded-select / reply.local-policy /
  message.owner-check / memory.consolidate / telemetry）。
- settings 页覆盖面很广：api（含 thinking/视频/视觉/价格）、persona、store（档位/关键词）、memory（整理阈值）、
  proactive、chatActive、白名单/黑名单/屏蔽、tools、security、server/desktop（含 `extensions.hotReload`）、
  webSearch、sticker、commandMute、communityExemptions 等 40+ 配置项。
- plugin-loader 的热更新已用导入预算 + epoch 机制实现，比我早前设计的 namespace 方案更严谨。

**教训**：回退场景下，先做全局事实核查（能力/配置/端点/模块落点），再决定改什么；
不要基于"我记得我改过什么"推断缺失。

## 2026-10-06 UI 设计系统统一（用户要求：别写死，追加组件也要好看）

### 根因诊断
- 8 个面板里 **7 个 style.css 为空或用 `body{font:14px system-ui;padding:16px}` 覆盖设计系统**。
- `ui/shell/style.css` 是**完全独立的第二套视觉语言**（黄绿 accent #e6ff5b、方角border-radius:0、
  独有变量 --ink/--canvas/--rail、Segoe UI 字体），与面板的蓝青+圆角+等宽字体完全不搭。
- skills 面板有硬编码色值 `#659dcb`；settings 面板把通用类（.setting-field 控件样式等）重复定义一遍。

### 设计系统（ui/panels/common.css 重写，~430 行）
13 个章节：设计令牌 → 基础重置 → 布局原语 → 容器 → 按钮 → 表单 → 徽标 → 提示条 → 页签 → 对话框 →
消息流 → 滚动条 → 响应式/动效偏好。
- 令牌：语义变量（--surface/--line/--text/--muted/--accent/--good/--warn/--bad/--focus）
  + 4 的倍数间距刻度 + 圆角刻度 + 统一动效时长/曲线。
- **组件类契约**：卡片/列表项/度量/行/操作区/网格/列表/错误/空状态/代码块/键值表/表格/消息流/
  页签(.tabs/.tab)/徽标(.badge + is-good/warn/bad/accent)/按钮组；按钮四语义（默认/primary/danger/ghost）。
- **追加组件指引**（写在文件头注释）：新组件只消费 class，不定义样式；颜色间距一律来自令牌；
  状态色用 is-* 类；布局用 head/toolbar/row/grid/card/list 组合。

### 各面板样式收敛为"纯增量"
chats/sessions/memory/usage 原本的 `body{...}` 全删，改为只放本页独有结构
（如 usage 新增 .bar-row/.bar-track/.bar-fill 图表类）；plugins 复用 skills；
settings 去掉与common.css 重复的控件样式，仅保留 settings-nav/fields/secret 等专有排布。

### shell 与面板同源
- 黄绿 accent → --accent；方角 → --r-sm；变量名统一为 --text/--bg/--surface*；字体栈对齐。
- 补 `.toast.info/.error`（实测 toast() 只会产出这两种 kind）、toast 进出场动画、焦点环、动效降级。

### 浅色主题修正（实测发现的问题）
headless Chromium 报 `prefers-color-scheme: light`，我最初加的 `@media (prefers-color-scheme: light)`
导致页面渲染成**未校准的浅色**（对比度差、按钮层级混乱）。已改为**显式 `.theme-light` 类**：
深色是设计基准与默认，浅色需显式开启且前景/背景按 WCAG AA 校准
（--text on --bg ≥ 12:1，--muted ≥ 4.6:1）。

### 对比度实测
深色 danger 按钮字/底 5.16:1、faint 文字 4.8:1、muted 7.76:1、text 16.7:1、accent 11.74:1，全部 ≥ AA。
（据此把 danger 底色混合比从 16% 提到 22%、字色提亮，保证视觉足够醒目。）

### 布局修复（用 CDP 量取真实盒模型，不靠猜）
发现 headless 下 `--window-size` 被忽略（实际视口 764px），改用 CDP `Emulation.setDeviceMetricsOverride`
精确设定 1600px 视口实测。根因链：`.head` 里标题块 `flex:1 1 240px` 吃满剩余宽度 →
操作区只剩 391px → 内部按钮+输入被迫换行。修法三步：
① 标题块改 `flex:0 1 auto`（按内容伸缩）；② `.actions` 改 `flex-wrap:nowrap`（工具栏本就该一行，
追加按钮不会挤成参差两列），卡片内动作仍允许换行；③ ≤900px 时操作区整体下沉铺开做优雅降级。
实测 `inputSameRowAsButtons: true`、操作区高度 37px（单行）。

### 验证方式（新增两条测试）
- `test/62-ui-design-system-test.mjs`：静态契约 —— 令牌/组件类覆盖度/面板样式禁止写死（禁 body 覆盖、
禁重定义控件、禁自造变量、禁硬编码色值）/面板 meta/shell 同源。
- `test/63-ui-design-system-effect-test.mjs`：**真实浏览器实效** —— 起本地 headless 控制台，
  用 CDP 在真实 skills 面板注入 3 个不同语义按钮 + 搜索框 + 卡片 + 徽标 + 空状态（全部零 CSS），
  断言它们自动获得统一圆角 5px/内边距 7px/语义色/胶囊徽标，且**排版不塌**（同行、工具栏高 < 50px）。
  这是"追加按钮/页签时不好看"这一诉求的直接回归防护。

## 2026-10-06 社区面板（功能存在但不可达 → 补齐入口）

### 缺口
后端 `/api/market/{accounts,login,logout,publish,verify,install}` 与 `/api/community/blocklist`
一直存在且实现完整，但**控制台没有任何入口**（manifest 只有 8 个面板，无 community），
用户无法发布扩展、用口令安装、维护全局屏蔽名单——典型"功能存在但不可达"。

### 新增 `ui/panels/community/`（第 9 个面板）
三个页签（全部走设计系统组件，零自定义样式）：
- **口令安装**：校验口令（先 verify 再 install）→ 展示名称/版本/描述 → 确认后安装；
  安装完成明确提示"默认停用，请检查代码后再启用"。
- **发布账号**：登录/注册（含"请勿复用重要密码"提示）、多账号切换、退出、
  发布插件/技能（选类型 + id + 名称 + 描述）。
- **屏蔽名单**：读当前名单、按行/逗号分隔编辑、保存、清空（均带确认）。
安全措辞到位：明确"Node 插件不是代码沙箱，只发布你检查过的代码"。

### 踩坑记录（两个真实问题）
1. **面板注册后不出现**：`panel-adapters.normalize` 要求 `api` 是 `{method, path}` **对象数组**，
   我最初按旧面板习惯写成**字符串数组** → normalize 返回 null → 面板被静默丢弃，
   `/api/panels` 仍显示 8 个。逐条复刻 normalize 校验规则定位到格式问题后改正为 8 条对象规则。
2. **一直在测一个没成功启动的旧实例**：`pkill -f "node.*src/server.js"` 在本环境**不生效**，
   新实例被单实例锁正确拒绝（日志"已有实例正在运行…pid=35752"），而我 curl 的还是旧进程。
   正确做法：读 `data/qq-agent.lock`（**纯 pid 文本**，不是 JSON）再 `process.kill(pid)`。
   这个坑在之前的 UI 验证中也误导过我一次（以为 manifest 改动没生效）。

### 测试固化的"可扩展性"修正
新增面板让 3 处**硬编码面板数量**的测试失败（30/34/55）。这与"UI 是活的"直接冲突，已改为：
- 30 号：`id 唯一 + 至少 8 个核心面板`（不再 `=== 8`）
- 34 号：浏览器 e2e 的 nav 按钮数改为 `manifest.panels.length` 动态比对
- 55 号：改为断言"面板 id 无重复"（自洽性而非固定数量）
另新增 `test/64-community-panel-test.mjs`（6 组：注册合规/后端端点存在/UI 覆盖三块能力/
破坏性操作有确认/符合设计系统/页签规范用法）。

### 回归
M1 14/14、M2 8/8、M3 36/36、M4 10/10、headless 12/12、diff-check 通过。

## 2026-10-06 补齐功能缺口（记忆整理 bug + 语音转文字 provider）

### 修复 1：记忆整理 prompt 用字面 \n 冒充换行（静默劣化）
`kernel.js` 的 `memory.consolidate` prompt 写成 `].join('\n')`（**源码两个反斜杠**），
于是每条规则之间是"反斜杠+n"两个字符而不是真换行 —— **代码不报错、测试全绿**，
但发给模型的 prompt 被压成一行，直接拉低整理质量。
修正为 `].join('\n')`，并新增 `test/65-prompt-newline-test.mjs`：按**源码反斜杠个数**判断
（1 个 = 真换行 ✅，2 个 = 字面 \n ❌），全库扫 9 处 join('\n') 拼接。

> 排查教训：我一度用"解析源码再打印"的方式判断，写出的检测脚本自己转义有误，
> 报了 8 处假警；最后用 `cat -A` 看原始字节才拿到铁证。**验证转义类问题时直接看字节，别信自己写的解析器。**

顺带修正 `docs/功能实现逻辑说明.md`：原文写"记忆自动整理还没做 / 需要插件提供"，
与实现不符（能力早已以 kernel 身份注册）。

### 新增 2：语音转文字 provider（`bundled/voice-to-text/`）
内核链路本来就齐（OneBot 归一 record 段→ ingest 调 `media.transcribe` → 失败退 `[语音]`），
缺的只是能力实现。新增 bundled skill，走 OpenAI 兼容 `/audio/transcriptions`，用户自填地址与密钥即可用。
- **默认不启用**（`enabledByDefault:false`）：外部付费调用必须用户显式打开。
- 语音 URL 走 `safeFetch`（逐跳 SSRF 校验）；密钥只经 `ctx.config.get('apiKey')` 读（内核按 schema遮蔽）。
- 大小/超时/返回长度都有上限；**任何异常一律退 null**（不外抛，绝不打断收消息链路）。
- 修掉一个真 bug：`transcribe` 起初没有整体 try/catch，SSRF 拒绝会直接抛出去——
  这个 provider 是跑在收消息链路上的，抛异常等于让一条语音消息处理失败。

新增 `test/66-voice-to-text-test.mjs`：起假 ASR + 假语音源**真跑provider**，6 组共 20+ 断言
（清单契约 / SSRF 默认拒绝内网 / 端到端转写 / 6 种降级路径 / 5 种响应形状 / 超长截断）。

> 排查教训：这个测试一度连环失败，我用逐步加参数、加探针的方式定位到
> "ctx.inject 只作用于取音频那一次 safeFetch，提交 ASR 的 POST 走全局 fetch"——
> 是测试设计问题，不是插件问题。**连续失败时先确认被测对象的真实契约，别急着改生产代码。**

### 回归
M1 14/14、M2 8/8、M3 38/38、M4 10/10、headless 12/12、diff-check 通过。
冒烟日志确认内核正确识别新插件：`voice-to-text 已停用（跳过装载）`。

### 文档与实现对齐（2026-10-06）
`docs/功能实现逻辑说明.md` 存在多处与实现不符的过时数字，已全部核实修正：
- 工具数 29/28 → **27 个默认启用**（另有 `hello` SDK 样例 1 个，`enabledByDefault:false` 不计入；
  以 `test/25-bundled-tools` 的 70 断言为可信口径，不靠临时统计脚本——我写的统计脚本漏了core-tools 的 report_feedback）
- 捆绑插件 10 → **11**（新增 voice-to-text）；控制台面板 8 → **9**（新增 community）
- 记忆自动整理、语音转文字：从"还没做"移入"已完成"
- NSIS 安装包：从 ✅ 改为 ⚠️ —— **产物是 2026-10-05 构建的，已落后于当前代码**（无社区面板、旧 UI）
- 测试基线更新为 run-m1 14/14、m2 8/8、m3 38/38、m4 10/10、smoke 12/12

## 2026-10-06 (晚) 设置页空白事故 —— 用户实测发现 P0 bug

### 事故
用户打开 0.5 控制台：**设置页一个设置项都没有**，只有"未授权的面板 API"错误。
我此前所有验证都是"静态契约 + 截图 shell 首页"，**从未打开过设置页本身**。

### 根因
`settings/panel.js` 的 `load()` 用 `Promise.all([6 个请求])`，其中 3 个端点
（`GET /api/tools`、`GET /api/tools/availability`、`GET /api/skills/capabilities`）
**没在 manifest.json 的 settings.api 里声明** → rpc-bridge 的 `allowed()` 拒绝返回 403
→ Promise.all 一个被拒全部失败 → 整个设置页空白。
manifest 声明是 rpc-bridge 的白名单机制（面板只能请求声明过的端点），加面板时漏同步。

### 修复
manifest.json 的 settings.api 补 3 条（34→37 条）。重启后截图验证：13 个分区页签 + 完整表单全部恢复。

### 防护：新增 67 号测试（挂入 M3）
`test/67-panel-api-declaration-test.mjs` 四段：
- A. 面板请求集合 ⊆ manifest 声明（本 bug 的直接防护）
- B. 声明 ⊆ 后端路由（字符级解析 http.route 的字符串+正则两种形态）
- C. api 规则必须是 {method,path} 对象（字符串会被 normalize 静默丢弃——community 面板踩过）
- D. 面板 id 唯一 + entry 文件齐备

### 排查中犯的三个错（都靠"运行时对象/截图"才纠正）
1. **误判"动态路由全部缺失"**：routes.js 有 78 条字符串 + **16 条正则**路由
   （`/^\/api\/sessions\/(?<id>...)$/` 形式），我的提取正则 `http\.route\('M','P'` 只匹配字符串形态；
   后来自己写的正则提取又被路由体里的 `[^/]+` 中的斜杠截断。
   `GET /api/sessions/test-id → 404` 是"会话不存在"的**正确语义**，不是路由缺失。
   最终解法：**字符级解析器**（括号配对 + 正则字面量的转义/字符类状态机），99 条路由全提取。
2. **误判"权限端点缺失"**：`/api/plugins/:id/permissions` 注册在 **panel-adapters.js**（不在 routes.js），
   我只扫了 routes.js。实测 bundled 插件被拒返回"插件尚未加载"——那是**正确语义**
   （授权对话框只面向 user 插件）。**撤销了我重写的重复实现**，改为在测试里同时扫两个文件。
3. **误判 "memory.consolidate 无消费点 / sticker_note 仍在"**：前者是 `capability?.providers?.()` 可选链
   写法没匹配上；后者命中的全是注释。

**教训（写进了 67 号的注释里）**：grep 命中 ≠ 功能存在，未命中 ≠ 功能缺失；
验证"端点是否存在"这类问题，要么起真实服务实测，要么用能正确解析源码的提取器，
绝不用一层正则就下结论。**用户实测 > 我的一切静态检查。**

### 回归
M1 14/14、M2 8/8、M3 39/39、M4 10/10、smoke 12/12。设置页截图确认恢复。

## 2026-10-07 外观重做：字体修正 + 组件库自定义（用户："这啥ui啊，怎么这么难看"）

### 1. 字体：全站等宽 → 系统 UI 字体（观感改善最大的一处）
`common.css` 的 `--font` 原本是 `ui-monospace, Consolas, monospace`——**全站等宽**。
中文没有等宽字形只能 fallback，中英混排歪斜，整体像"终端窗口"而不是产品界面。
改为系统 UI 字体栈（PingFang / 微软雅黑 / Noto Sans CJK 优先），并拆出 `--font-mono`
给 code/pre/.mono 用（代码、日志、ID 保留等宽）。
注：`--font-sans` 早就定义了却从未被使用过。

### 2. 新增「组件库」设置分区（设置页第 14 个分区）
- 5 个风格预设（默认/Cursor/Supabase/Linear/Raycast），预设只改颜色，圆角/密度/布局保留
- 14 个颜色控件（底色/文字/强调/语义/描边）
- 圆角基准滑块、间距密度（紧凑/标准/宽松）、侧边栏（左/右/隐藏）、按钮排布（左/中/右）、渐变开关
- 值存 `ui.uikit.*`（**不是 ui.theme** —— 后者已被"主题"下拉占用，是字符串）
- 真源 = config.json（可备份、换机器还在），走既有 FormState patch 保存

### 3. 踩坑：localStorage 不能当分发通道（第一版做错了）
面板 iframe 是 `sandbox='allow-scripts'`（**无 allow-same-origin**）→ opaque origin，
**读不到 localStorage**（访问抛 SecurityError，被我 try/catch 静默吞掉），
shell 也拿不到它的 contentDocument。第一版用 localStorage 分发，
结果"外壳换了皮肤、面板没换"——面板静默回落默认主题，且不报错。
**正确链路**：config.json → shell 应用 → RPC `theme.apply` / ready 时 `bridge.event('theme')` 推给 iframe。
shell 侧另需写 7 个 shell 专有别名变量（`--rail/--canvas/--ink/--surface-raised/--danger/--cyan/--accent-ink`），
否则侧栏不吃主题（实测 railBg 一直是旧的 rgb(11,20,29)）。

### 4. 踩坑：Node 侧 import 链
- `panel-registry.js` 里 `from '/panels/theme.js'` 在浏览器是 URL，在 Node 会解析成 `C:\panels\theme.js`
  → **必须用相对路径** `../panels/theme.js`（两边都能解析）。
- theme.js 自执行 `applyTheme()` 直接摸 `document`，导致 52 号测试（Node import panel-registry）崩
  → applyTheme 与自执行都加了无 DOM 防御（跳过样式写入，只更新内存态）。

### 5. 顺带触发的既有安全断言
30 号断言 `panel-client.js` 不得出现 "localStorage"/"token" 字样（防令牌泄漏）。
我在注释里写了这两个词被拦；而且参数名 `tokens` 含 `token` 子串也会命中
→ RPC 参数改名 `theme`，注释措辞调整。

### 回归
M1 14/14、M2 8/8、M3 40/40（新增 68 号）、M4 10/10、smoke 12/12。
实测（config.json 写入 Cursor 主题 → 重启 → 截图）：shell 与设置页 iframe 双双生效，
侧栏/主区纯黑、选中项紫色、"保存改动"为紫蓝渐变。

## 2026-10-07 组件库 v2：界面预设（亮/暗基准 + 独立自定义方案）+ 背景图

### 用户定稿的方案模型（重要）
- **亮色 / 暗色 = 出厂基准**，不可被"覆盖式保存"污染，随时能回到；
- 在任一基准上改动任何一项 → 进入"已修改态"（仍属该基准的编辑中状态）；
- "另存为" → 得到一个**独立于亮/暗基准之外**的自定义方案（可多个，可切换/重命名/删除）。
- 每个方案都是**完整方案**：配色 + 圆角 + 密度 + 侧栏 + 按钮排布 + 背景。

### 为什么必须替换掉原来的 ui.theme
`ui.theme`（dark/light/system）在新机制下已失效：theme.js 把 token 写成 documentElement 的
**inline style**，优先级高于 `:root.theme-light` 这类 CSS 规则，所以选 light 不会有任何变化。
改为 `ui.uikit.mode`（dark | light | custom:<id>），并在"桌面与界面"分区里显示为「界面预设」。

### 数据结构
```
ui.uikit = {
  mode: 'dark'|'light'|'custom:<id>',
  dark: {...} | null,        // 暗色基准的编辑态（null = 用出厂基准）
  light: {...} | null,       // 亮色基准的编辑态
  custom: { <id>: {name, tokens} },
}
```
**custom 用 id→方案 的映射而不是数组**：设置表单路径是 `ui.uikit.custom.<id>.tokens.bg`，
数组下标路径在 form 的 setPath 里会退化成对象，结构会坏。
旧扁平结构（v1 配置）迁移时整块归入 dark 编辑态，用户既有外观不丢。

### 背景图
- 来源：**上传本地图片** + **填 URL** 都支持。
- 上传 `POST /api/uikit/background`：按**魔数**校验类型（不信扩展名/MIME），≤8MB，
  文件名服务端生成 `bg-<12hex>.<ext>`，落 `data/ui/backgrounds/`。
- 读取 `GET /api/uikit/background/:id`：文件名白名单正则，杜绝 `../` 穿越（实测 404）。
- 渲染：`body::before` 固定铺层 + `pointer-events:none`，不设 z-index（首个子元素，内容天然在上）。
- 可调：不透明度 0~1、模糊 0~20px、铺法（铺满/完整/平铺）。
- **地址消毒** `safeBgUrl`：只允许 http(s) 或 `/api/` 前缀，且拒绝引号/分号/反斜杠/括号
  （防跳出 CSS 值注入）。

### 踩的坑
1. **`{...LIGHT_BASE, ...DEFAULT_THEME}` 顺序错**：DEFAULT_THEME 里带着暗色值，会把亮色 bg 顶掉。
   必须 `{...DEFAULT_THEME, ...LIGHT_BASE}`。
2. **migrateUikit 只认 custom/light/dark**：`{mode:'light'}`（还没编辑过任何颜色）被判成旧扁平结构，
   mode 被强制回 'dark' → **亮色预设永远选不中**。改为 `mode !== undefined` 也算新结构。
3. **manifest 路径参数名**：`/api/uikit/background/:name` 被 55 号拦下——`SAFE_PATH` 白名单只认
   `:id`/`:key`/`:uid`。改声明用 `:id`（复用既有白名单，不动安全边界）。
4. `localInput(parent,label,id,type)` 第三参是 **id 不是初始值**，三处调用传错，已改为设 `.value`。

### 回归
M1 14/14、M2 8/8、M3 40/40、M4 10/10、smoke 12/12。
实测：上传接口（合法 PNG 200 / 非图片 400）、读取与穿越防护、resolveScheme 三态（亮/暗/自定义互不污染）。

## 2026-10-07 设置页重构：侧边栏二级菜单 + 顶部下拉框（用户："一定要全写在一页里吗"）

### 1. 先修了一个真 bug（用户报"主题设置没有了"）
`field(..., { options: [...((form.value('ui.uikit.custom') || []).map(...))] })` ——
组件库 v2 把 `custom` 从数组改成了「id → 方案」的**映射**，对象没有 `.map`，
抛 TypeError → `render()` 里 desktop 分区构建失败 → 用户看到"主题设置消失"。
改为 `Object.entries(custom).map(([id,c]) => [...])`，并抽出 `schemeOptions()`。
另加 `refreshModeSelect()`：自定义方案增删/重命名后同步下拉（render 是一次性的，下拉不会自己更新）。

### 2. 设置页改版：一页纵向堆叠 → 侧边栏二级菜单 + 下拉框
13 个分区按 5 个大类分组：
- 机器人：模型与渠道 / 人设与角色 / 响应与分时
- 会话与连接：白名单与协议连接 / 发送与消息存档 / 主动话题与活跃期
- 能力：记忆与表情 / 工具与能力 / 联网搜索
- 成本与安全：价格与成本 / 安全与隐私
- 界面：桌面与界面 / 组件库

实现要点：
- `SECTION_GROUPS` 映射 + `GROUP_LABELS` 决定分组，**不改 13 处 section() 调用**（减少回归面）。
- **所有分区 DOM 始终存在，只切换 `hidden`** —— 这样表单收集、防抖保存、
  已绑定的监听全都不受影响；切换分区也因此**不需要 flush 未保存输入**（比原来的锚点跳转更安全）。
- 顶部下拉框用 `<optgroup>` 按同一分组渲染，与侧边栏双向联动。
- 窄屏（≤780px）隐藏侧边栏，只保留下拉框。
- `[hidden]` 必须 `display:none !important`，否则会被 `.card` 自身的 display 顶掉。

### 验证
截图确认：5 个分组 + 13 个分区链接渲染正确；只显示当前分区；
把默认分区临时改为 uikit 后，侧边栏高亮、下拉框值、右侧内容三者一致 → 切换逻辑正确。
（iframe 是 sandbox opaque origin，CDP 坐标点击会穿透到 shell 侧栏、executionContext 也拿不到，
故改用"临时改默认分区再截图"的方式验证。）

### 回归
M1 14/14、M2 8/8、M3 40/40、M4 10/10、smoke 12/12。


用量页 0.4 交互迁移（2026-10-15T10:51:55.471Z，UTC）：已读取 develop 中的旧版实现，将五指标卡、可悬停/键盘查看的柱图、时间范围切换、按天/会话/模型的整宽表格、模型展开和工具/分组明细弹窗迁入 0.5 沙箱面板。保留主题继承与声明 API；运行次数和实际模型调用分别统计，同模型按渠道拆分，历史未记渠道的总量明确未分渠道，不能据此钻取其它渠道。增量刷新保持行节点、焦点和滚动，旧异步响应与新明细失败不显示前一范围数值。163、106、80及5份相关测试通过，164最终有头回归 exit0；新163/164纳入M3，本轮未重跑完整M3/M4。主合成QA备份142份静止数据后同步191份core源码并以原离线wrapper启动100528/15967；原空数据只读15987预览也已更新并实际点击复验，未种入模拟用量。主旧进程退出已观察，退出码和最终关闭者未知；预览被exec中断exit1，旧锁由生产内核正常识别恢复，未手工删锁。配置字节保持，静止复制时数据字节一致不代表运行后所有缓存/日账原字节均不变。详见[本轮证据](.qa-local/usage-v04-20261015/final-verification.json)。不提升真实QQ、账号或外部模型验收结论，186项11/96/2/76/0/1保持；没有打包或远程部署。
