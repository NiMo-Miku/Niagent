# QQ Agent 0.5(Niagent)项目索引

> 生成于 2026-10-31 并随当日改动同步至收盘状态(原盘点 1143 个文件,约 14.3 万行;当日移除 Electron/安装器与「我的」面板、新增会话延续/潜水/配置页/提示词预览)。本文是导航地图:每个目录/模块一行说明,供快速定位。配套评审见 [project-review-2026-10-31.md](project-review-2026-10-31.md)(P1 已全部处置,见该文头部注记)。

---

## 1. 项目定位

QQ Agent 0.5 是 QQ 机器人的「DSH 薄内核 + 全插件」从零重写版(Node.js ≥20,运行时依赖仅 `ws`/`js-yaml`/`qrcode`)。内核只提供装配缝与默认件,传输、工具、服务、UI 面板全部以插件形式挂载。**产品形态收敛为无头服务 + 浏览器 Web 控制台**(2026-10-31 移除 Electron 桌面外壳与 NSIS 安装器);协议端(NapCat/SnowLuma)由用户自备放入 `protocols/`,本项目不附带、不分发。

- 启动:`npm run server` 后打开 `http://127.0.0.1:3210`,或双击 `启动QQ机器人.bat`(端口在 bat 顶部可配)
- 鉴权:首次装载自动生成随机控制台令牌并写入 config.json;浏览器经 `/api/console/bootstrap` 自动领取,脚本调用需携带 `x-console-token`
- 测试:`npm test`(= M3+M4 套件;M0–M2 需手动 `node test/run-m2.mjs`)

## 2. 顶层结构总览

| 目录/文件 | 规模 | 职责 |
|---|---|---|
| `src/` | 121 文件 / ~19.9K 行 | 内核与后端:装配、消息链路、LLM、HTTP/SSE、多账号、协议端托管、群管规则引擎、控制台路由 |
| `bundled/` | 20 目录 / ~4.9K 行 | 出厂插件(传输、工具、服务)与启动默认组件表 |
| `ui/` | ~16.7K 行 | 前端:宿主壳 `ui/shell` + 9 个 iframe 沙箱面板 `ui/panels`,原生 ESM 无构建 |
| `test/` | ~1110 个 .mjs / ~52K 行 | 自研逐进程回归网,M0–M4 分层 |
| `docs/` | 74 md + 2 mermaid + 1 json / ~17K 行 | 架构规格、扩展创作、迁移记录、QA 证据 |
| `website/` | ~39K 行(18MB) | kondius.cn/qq-agent 官网的只读本地镜像 + 动效实验场,不随应用打包 |
| `scripts/` | ~1.7K 行 + lib | 隐私审计、冒烟、截图、扩展 CLI、有头 QA 夹具(已无 Electron 依赖) |
| `examples/` | ~1.2K 行 | 组合层示例 + 3 个扩展教学例 + 群管规则示例 |
| `skills/` | ~0.9K 行 | 用户技能目录,出厂预装 `image-generate`(已迁移至当前 SDK) |
| `protocols/` | README | 用户自备协议端放置目录 |
| `assets/` | icon + persona | 应用图标、人设卡样例 |

原 `electron/`(桌面外壳)与 `build/`(NSIS 安装器)已于 2026-10-31 移除;父目录 `qqagent/` 下另有 `0.4/`(旧版)、上游克隆元数据等,不属本仓库。

## 3. 根目录文件

| 文件 | 说明 |
|---|---|
| `package.json` | v0.5.0;`main: src/server.js`;scripts:`server`/`test`/`test:m3`/`test:m4`/`smoke`/`shot:ui`/`extension:check|test|pack`/`privacy:check`(desktop/build/verify:preview 已随 Electron 移除) |
| `README.md` | 安装连接说明、事实来源清单(已显式标注 dsh-spec/develop 断链)、扩展创作入口、工作约定 |
| `progress.md`(310KB) | 会话日志,进度权威(UTF-8,cmd `type` 会乱码) |
| `findings.md`(74KB) | 实现关键发现与 M0–M4 架构裁决 |
| `task_plan.md`(61KB) | 规格逐条落地计划与历史执行断点 |
| `.gitignore` | 排除 `data/`、`data-*/`、日志、密钥、`dist/`、`.qa-local/`、`/protocols/*`(留 README)等 |
| `启动QQ机器人.bat` | 无头启动器:顶部可配端口(经 `QQ_AGENT_PORT` 注入)、缺依赖自动 `npm install --omit=dev`、**不自动开浏览器**(打印地址由用户自行访问) |

三个会话文档头部均有同一段「2026-10-23 范围更新」声明:专属协议端与便携客户端的安装/启动/登录态迁移已移出项目范围。

## 4. src/ — 内核与后端(121 文件,~19.9K 行)

### 4.1 启动链

`src/server.js`(35 行,headless 入口)→ `createApplication`(`src/kernel/composition.js:201`,扫描 `overrides/` 组合层,合并到 `bundled/runtime-defaults/components.js` 的 52 个默认组件)→ `createKernel`(`src/kernel/kernel.js:15`,691 行)按固定顺序构造约 40 个命名组件,`kernel.start()` 依次:实例锁 → 迁移检测 → 路由注册 → HTTP listen → 会话改判 → 插件装载 → 价格刷新 → 服务/管理/协议端启动 → 账号恢复。**首次装载(无 config.json)自动生成随机控制台令牌并持久化**(显式写 `server.token:''` = 关闭鉴权)。

### 4.2 src/kernel/(55 文件)— 核心部件

**消息链路**(按调用序):`ingest.js`(214 行,三闸准入)→ `orchestrator.js`(~970 行,唤醒状态机/防抖/禁言检查/重试退避/主动话题/**会话延续窗口**/潜水标记/记忆整理触发)→ `prompt.js`(330 行,提示词+锚点缓存)→ `agent-runner.js`(384 行,12 轮工具循环+hook 五时序)→ `tools.js`(276 行,工具注册表+八步执行管线)→ `send.js`(330 行,SendQueue 每会话串行/限频/去重/切分)→ `transport.js`(154 行,平台无关归一化)。

**扩展基础设施**:

| 文件 | 行数 | 说明 |
|---|---|---|
| `plugin-loader.js` | ~1215 | 扩展装载器:三类根(bundled/plugins/skills)、目录指纹、热重载(临时副本绕 ESM 缓存,**启动期清扫残留**)、两段闸换版、fs.watch 防抖重扫;清单支持声明式 `configPage`/`panels`;**全库最复杂文件** |
| `capability.js` | 183 | 能力注册表:provide/consume、6 个多提供者能力协商、管理员 pin、活性探针 |
| `permissions.js` | 249 | scope 权限闸;捆绑默认 allow、用户插件默认 ask;授权绑定代码指纹,一次性凭据 |
| `service-host.js`/`service-lease.js` | 227/49 | managed 服务(transport.provider、mcp.service 等)工厂/启停/代际租约 |
| `sdk-services.js` | 438 | 插件 SDK 窄化访问层:按方法粒度映射权限 scope,出参脱敏 |
| `composition.js` + `composition-*.js` | ~400 | `overrides/` 组合层装载、层选择、生命周期、方法包装 |

**基础设施**:`bus.js`(双白名单事件总线)、`config.js`(370 行,配置+脱敏+滑条+**首次装载生成随机令牌**)、`http.js`(427 行,仅回环监听;鉴权→来源→reset guard→路由→body 四段守卫;SSE 心跳/背压;静态防穿越)、`store.js`(429 行,聊天存档)、`sessions.js`(~505 行,会话状态机+**continuable/reopen 延续**)、`memory.js`(289 行,印象记忆)、`stickers.js`(474 行)、`reminders.js`、`usage-days.js`(日档用量,按会话 id UPSERT)、`llm.js`(507 行)、`safe-fetch.js`(338 行,SSRF 逐跳防护)、`migrator.js`(0.4 只读导入)、`data-reset.js`+`reset-guards.js`(两阶段数据重置)、`instance-lock.js`(实例锁事务)、`log.js`+`log-policy.js`、`scheduler.js`、`wake.js`(四档唤醒)、`holidays.js`、`env.js`、`inline-tools.js`、`reply-rescue.js`、`reply-provider.js`、`send-text.js`、`storage.js`、`web-search.js`/`media.js`/`telemetry.js`(兼容 shim)。

### 4.3 src/console/(40 文件)— 控制台后端

| 文件 | 行数 | 说明 |
|---|---|---|
| `routes.js` | ~1466 | M3 全量路由唯一事实源:status/usage(读缓存)/价格/渠道/人设/扩展安装/能力选择/会话(limit≤2000)/聊天/记忆/市场/暂停/重置/**提示词调试预览** + 组合层贡献路由的 scoped registry |
| `builtin-model-prices.js` | 1238 | 内置模型价格历史静态数据 |
| `prompt-preview-adapter.js` | ~85 | **新增**:提示词组装调试预览(与真实运行同一套 core.prompt.* 组件;sections/full 两端点) |
| `panel-adapters.js` | ~230 | 用户面板窄宿主 + **声明式 configPage** + `setConfig` 配置写回(schema 校验+密钥 hasXxx 语义) |
| 其余 37 个 | 各 2–402 行 | memory-media-adapters、price-update-adapters、panel-protocol(iframe JSON-RPC)、provider-adapters、vision-scan-adapter、session-names、search-provider-adapter、extension-updates、background-uploads、key-access、serializers、local-fonts、local-protocols、group-management、forward-adapter、sse-bridge 等;mcp-adapter/community-market-adapters 为 2 行 shim |

### 4.4 其余子目录

| 目录 | 文件 | 说明 |
|---|---|---|
| `src/management/`(14 文件) | `runtime.js` 180 行入口 | 可视化节点图群管规则引擎(catalog/flow/value-runtime/ports/sequences/state-store/recall-window) |
| `src/protocols/`(6 文件) | `manager.js` 248 行 | 用户自备协议端托管:扫描识别 NapCat/SnowLuma、ZIP 安全解压、随机端口+token、进程树管理;`adapters.js`、`login.js`/`native-login-client.js`(QQ 登录编排,**保留**)、`verify-connection.js`、`process-tree.js` |
| `src/accounts/`(4 文件) | `manager.js` ~430 行 | 多账号工作区:每 QQ 独立 data 目录 + fork 子进程(每子进程一个完整内核);**worker 输出落盘工作区日志、游离 rejection 只记录**;`gateway.js`(主→子反代,剥 token) |
| `src/transports/onebot/`(2 文件) | 各 2 行 | 纯 re-export shim,真实实现在 `bundled/transport-onebot/` |

## 5. bundled/ — 出厂插件(20 目录,~4.9K 行)

| 目录 | 清单 | 行数 | 注册内容 | 说明 |
|---|---|---|---|---|
| `transport-onebot` | plugin.json | 1043 | `transport.provider`(默认) | OneBot v11:WS 收事件+HTTP 发动作;代际互斥防 401 风暴、令牌轮换(`_looksLike401` 仅认确定形态)、指数退避;**最大插件** |
| `market` | plugin.json | 645 | `market.client` | 市场客户端:账号/发布/安全安装(手写 ZIP+zip-slip 防护)、名单同步;锁定 `www.kondius.cn` |
| `web-tools` | skill.json | 383 | `web.search`/`web.images` + 3 工具 | 预设渠道仅 https(防密钥明文)、自定义渠道允许内网 http |
| `media-service` | plugin.json | 322 | `media.reader` | 受限图片下载、缓存回退、可选 ffmpeg/ffprobe |
| `query-tools` | skill.json | 222 | 7 个查询工具 | 最近消息/转发展开(回写存档)/活跃成员/详情/图片/视频 |
| `memory-service` | plugin.json | 207 | `memory.consolidate` | LLM 合并/去重/新建成员印象(后台会话可见) |
| `telemetry` | plugin.json | 196 | `telemetry.service` | 匿名用量上报 → kondius.cn |
| `mcp-bridge` | skill.json(`kind:"plugin"`) | 195 | `process.mcp`/`mcp.tools`/`mcp.service` | stdio MCP 客户端桥 |
| `core-tools` | skill.json | ~155 | 5 个发送工具 | send_message/send_to/send_poke/**finish(支持 activeTopic 热聊延续与 lurk 潜水)**/report_feedback |
| `compat-04` | skill.json(`kind:"plugin"`) | 151 | `compat-04.createSkillApi` | 0.4 旧插件 API 垫片 |
| `media-tools` | skill.json | 105 | `send_image` 工具 | 消费 `media.reader`+`core.send` |
| `sticker-tools` | skill.json | 121 | 4 个表情工具 | 清单多声明 `sticker_note` 未实现(迁移残留) |
| `system-tools` | skill.json | 102 | 提醒 3 工具+节假日 | 直接 import 内核 `holidays.js`(捆绑=受信层) |
| `memory-tools` | skill.json | 70 | memory_append/query/remove | 消费 `data.memory` |
| `community` | plugin.json | 164 | `community.client` | 云端屏蔽名单 5 分钟同步 + 金句/反馈投稿通道 |
| `voice-to-text` | skill.json | 120 | `media.transcribe` | OpenAI 兼容 ASR;默认停用 |
| `runtime-defaults` | **无清单** | 253 | 52 个默认组件工厂表 | 非插件;被 loader 特判跳过 |
| `reminders` | plugin.json | 28 | `reminders.service` | 提醒存储接入宿主运行时 |
| `llm-dialects` | plugin.json | 86 | `llm.dialect` | 思考模型请求参数方言+拒绝降级 |
| `hello` | skill.json | 35 | `hello_say` | SDK 活样例,默认停用 |

加载器:`src/kernel/plugin-loader.js` 优先读 `skill.json` 再 `plugin.json`,按 `kind` 字段归一化。捆绑插件可相对 import 内核模块(受信层),用户插件只能走 SDK ctx。

## 6. ui/ — 前端(原生 ESM,无构建步骤)

架构:宿主页 + 沙箱 iframe 面板。`ui/shell/index.html` 是唯一宿主文档;每个面板 = `iframe sandbox="allow-scripts"`(opaque origin),与宿主经 postMessage JSON-RPC(RpcBridge:源窗口+origin+nonce+panel id+API 白名单五重校验)通信。面板切换 = 换 iframe src,`?panel=<id>` 记录状态。静态由内核 `http.js` 伺服(`/`→`ui/shell`,`/panels/`→`ui/panels`,`/panels/u/<面板>/<代际>/`→用户插件专属 ui/)。

### 6.1 ui/shell/(30 文件,~5.9K 行)

| 文件 | 说明 |
|---|---|
| `app.js` | 壳逻辑:面板挂载、SSE 状态、toast/确认框、启动导航策略、**onUserSetConfig(用户面板配置写回)** |
| `panel-registry.js` | 从 `/api/panels` 拉 `ui/panels/manifest.json`,强校验后挂 iframe;主题广播;用户面板绑定 ownerId+代际 |
| `rpc-bridge.js` | JSON-RPC 桥:nonce+origin+API 白名单;用户面板仅 `ctx.call/getConfig/setConfig/notify` |
| `api-client.js` | 统一 fetch:`x-console-token`、超时、方法/路径白名单、401 自动恢复重试 |
| `sse-client.js` | 手写 SSE 解析:26 事件白名单、16MB 上限、断线 1.5s 重连 |
| `console-auth.js` | 凭据引导:浏览器走 `/api/console/bootstrap`(仅回环同源),`?token=` 用完即删,sessionStorage 30min TTL |
| `theme.js`(panels/ 下共享) | CSS 变量主题引擎;`data-styleMode` 切换 endfield/classic/signal/flux |
| `visual-editor.js`+`visual-picker.js` | 外观点选编辑:跨 iframe 取色/属性编辑、撤销/预览 |
| `account-switcher.js`/`account-scope.js` | 多账号切换(整文档导航 `/?account=<uuid>`) |
| `update-notice.js` | 每小时查 `/api/update-check`,只给下载链接 |
| 其余 | panel-recovery、panel-view-state、refresh-queue、destructive-feedback、startup-navigation 等(captcha-diagnostics/market-publication/market-authentication 已随「我的」面板移除) |

### 6.2 ui/panels/(9 个内置面板)

> 2026-10-31:移除原第 10 个面板「我的」(community:发布账号/扩展发布/意见反馈/验证码诊断);技能市场与插件市场保留。chats 面板的金句投稿与后端 market/community 插件不受影响。

| 面板 | 规模 | 功能 |
|---|---|---|
| `settings` | panel.js 1562 行 + 50 余子模块 | **最重面板**:11 分区(QQ 连接/模型/响应范围/人设/聊天/记忆/搜索/工具/外观/隐私安全/应用);**人设分区含「完整组装预览(调试)」**;时序组含会话延续开关与窗口 |
| `rules` | management.js + canvas/graph | 规则编排器:SVG 画布、连线、模拟运行/验证/运行记录 |
| `sessions` | panel.js + trace-view 等 9 文件 | 会话流水:列表/详情/流式步骤/等待倒计时/重试/中止 |
| `chats` | panel.js + message-view/quote-mode/history | 存档浏览:媒体查看、合并转发展开、多选删除、金句投稿模式 |
| `skills` / `plugins` | 共用 extension-manager.js | 市场浏览/ZIP 安装/启停/热重载/权限对话框;**卡片含「提示词片段预览」** |
| `memory` | panel.js 231 行 | 记忆浏览/成员印象/备注/合并 |
| `usage` | panel.js + spark.js | 用量 sparkline、细分、成本表 |
| `logs` | panel.js + log-stream | 最近 200 条+流式合并(最简面板) |

根级共享模块:`panel-client.js`(面板侧 RPC,含 `ctx.setConfig`)、`ui.js`、`icons.js`、`extension-manager.js`(卡片含提示词预览)、`market-browser.js`、`destructive-action.js`、`motion.js`、`selection-state.js`、`dialog-lifecycle.js`、`live-refresh.js` 等。`manifest.json` 注册 9 面板 + 1 个测试夹具面板。

### 6.3 vendor 与 assets

- `ui/panels/vendor/`:`gsap-3.13.0.min.js`(运行时不连 CDN)+ `gsap-runtime.js`。
- `ui/panels/assets/endfield/`:默认主题「endfield」的徽标/归档图形(含 AI 生成 prompt 留档)。

## 7. docs/ — 文档(74 md + 2 mermaid + 1 json)

### A. 架构与规格(持久参考)

| 文件 | 说明 |
|---|---|
| `architecture-composition.md` | **追加式组合规格 v2.1**,全项目架构主合同(启动入口一节已更新为仅 server.js) |
| `plugin-sdk.md` | v0.5 公共插件 SDK 参考(含声明式 configPage/面板侧 ctx.setConfig) |
| `extension-reference.md`(559 行) | 给 AI 的原生 0.5 扩展「自足合同」(§12 含配置页两入口) |
| `system_design.md` | M3 控制台增量架构审计与设计 |
| `功能实现逻辑说明.md` | 面向「接下来加功能的人」的纯逻辑说明(**含会话延续窗口/潜水/提示词调试预览**) |
| `group-management-node-reference.md`(2734 行,最大) | 群管理 109 种节点目录 |
| `project-index.md` / `project-review-2026-10-31.md` | 本文件 / 当日评审(P1 处置注记在文首) |
| `class-diagram.mermaid` / `sequence-diagram.mermaid` | 控制台类图 / 面板 RPC+SSE 时序图 |

### B. 扩展创作链(持久参考)

`extension-authoring.md`(创作引导入口)、`ai-extension-prompt.md`(可复制提示词)、`v04-extension-parity.md`(0.4→0.5 能力对照)、`extension-online-updates.md`(更新与重载分离设计)。

### C. 0.4→0.5 迁移合同/记录(约 37 篇,多为一次性会话产物)

`v04-parity-plan.md`(总计划)、`v04-parity-source-index.json`(147.7KB,**指向已不存在的 ../develop**)、以及按子系统分册约 30 篇(settings/session/memory/persona/media/telemetry/logger 等系列)、`gap-closure-design`(自标已被组合规格 v2 取代)、`batch-code-install-migration`(自标已废弃)。

### D. QA/验收证据(9 篇)

`headed-qa-checklist.md`(约 186 项)、`headed-qa-results.md`(275KB,最大)、`headed-qa-regression-evidence.md`(188KB)、`headed-qa-extension-ui-evidence.md`、`headed-qa-runtime-evidence.md`、`composition-regression-evidence.md`、`composition-overlap-evidence.md`、`onebot-send-repair-evidence.md`、`ai-extension-validation.md`。

### E. 协议端接入与近期实测(2026-10-24~26,8 篇)

`protocol-account-login-2026-10-24.md`、`local-protocols-validation-2026-10-24.md`、`local-protocol-real-validation-2026-10-24.md`、`session-flow-2026-10-24.md`、`visual-realtime-2026-10-24.md`、`session-realtime-model-validation-2026-10-24.md`、`multi-account-2026-10-25.md`、`snowluma-account-audit-20261026.md`。

### F. UI/功能特性笔记(~12 篇)

`appearance-visual-editor.md`、`theme-color-design.md`、`destructive-motion.md`、`group-management-and-fonts.md`、`rules-panel.md`、`management-primitives.md`、`sl-removal-rule.md`、`session-archive-presentation.md`、`startup-navigation.md`、`local-console-auth.md`、`privacy-cleanup.md`、`capability-picker-refresh.md`。

## 8. examples/ — 官方示例

| 目录 | 说明 |
|---|---|
| `composition/20-local-customization/` | 追加式组合最小示例(wrap `core.prompt.system`+自定义路由);需复制到 `overrides/` 生效 |
| `extensions/roll-dice/` | 掷骰子技能:参数校验、`ctx.storage`、自检用例 |
| `extensions/http-query/` | 调用外部 HTTPS JSON API:令牌、取消 |
| `extensions/image-generate/` | OpenAI 风格文生图教学版(与 `skills/image-generate` 是两套实现) |
| `management/sl-removal-rule.json` | 群管规则示例(`format: qqa-management-v1`) |

每个扩展目录带 `extension.check.json` 自检清单,配合 `npm run extension:check|test|pack`。装载器只扫 `skills/`、`plugins/`、`bundled/`,不扫 `examples/`。

## 9. skills/ 与 assets/

- `skills/image-generate/`:出厂预装的文生图技能(v1.2.1,**已迁移到当前 SDK**:`entry` 字段、`execute(args,execution)`、`execution.send.sendImage`、`net.outbound`+`qq.send` 权限;实测经验记录在注释中)。
- `assets/icon.png`:应用图标;`assets/personas/xiaojingyu.txt`:人设卡样例。

## 10. protocols/ — 协议端放置约定

用户自行从上游 Releases 下载 NapCat/SnowLuma 完整发行包,ZIP 原样或解压目录放入 `protocols/`(`QQ_AGENT_PROTOCOL_DIR` 可覆盖)。应用只做识别、解压、OneBot 配置补齐与进程托管;一次托管一个协议端服务、可多账号。「Source code」ZIP 与 SnowLuma Lite 不可用。

## 11. scripts/ — 工具链

| 脚本 | 接线 | 说明 |
|---|---|---|
| `audit-privacy.mjs` | `privacy:check` | 全仓扫 7 类隐私模式,命中即 exit 1 |
| `smoke-headless.mjs` | `smoke` | 无头冒烟 13 项:spawn server(读取生成令牌)+ createApplication 清理链 + **无令牌拒绝检查** |
| `shot-ui.mjs` | `shot:ui` | 起真内核+Chromium 截 9 张 UI 图到 `.shots/` |
| `extension-dev.mjs` | `extension:check|test|pack` | 扩展 CLI(`extension-dev.cmd` 已改用纯 Node);逻辑在 `scripts/lib/extension-dev.mjs` |
| `scripts/lib/download.mjs` / `runtime-archive.mjs` | — | 安全下载器 / 自写 ZIP 解析(先审后解+CRC) |
| `headed-qa-fixture.mjs` | — | 有头 QA 夹具:复制生产 app + 合成 OneBot/mock LLM(**已剥离 Electron 包装**,保留合成服务) |
| `audit-v04-parity.mjs` / `benchmark-archives.mjs` / `generate-management-reference.mjs` / `inspect-composition.mjs` | 手动/随包 | 一次性生成器与诊断工具 |

`scripts/qa-fixtures/`:MCP server 夹具、ZIP 构造器、合成视频、安全证据脚本。

## 12. test/ — 测试体系(~1120 个 .mjs,~52K 行)

- 运行器:`run-all.mjs`(`npm test`)= **run-m3 + run-m4**,逐文件 spawnSync,240s/120s 超时。M0–M2 链需手动 `node test/run-m2.mjs`(本日已全绿:M0 9/9、M1 15/15、M2 8/8、M4 7/7、smoke 13/13)。
- 形态:两种风格(自绘断言 `test/helpers.mjs` / `node:test`);224 个 import 内核、约 70 个 playwright-core UI e2e、121 个起真内核、164 个源码静态契约断言。
- 离线性极强:`ws` mock OneBot、http mock LLM、`page.route()` 拦截、假域名;浏览器测试可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指向 Edge/Chrome。
- 本日新增:`308-plugin-config-page`(配置页端到端)、`309-prompt-preview`(提示词预览)、`310-persona-write`(插件人格能力)、18/305/25 更新为延续语义。
- 已知既有失败(HEAD 复现,浏览器环境相关,与当日改动无关):34、116、125、127、244、254、69。

## 13. website/ — 官网镜像(不随应用打包)

- `website/qq-agent/`:kondius.cn/qq-agent 的静态镜像(抓取于 2026-10-21,`mirror-manifest.json` 审计)。纯 vanilla JS SPA + vendored GSAP/Three.js;子页含 comments、holyshits、plugin-market、skill-market、persona-plaza、u、admin、captcha-sdk、lab。
- `website/snapshots/`:公开 API 数据快照;`website/serve.mjs`:本地预览(POST 一律 405);`website/tools/`:抓取与变换工具。
- 与主应用的关系:不打包,但运行时契约一致——`bundled/market`、`bundled/community`、价格源、验证码 SDK 均直连 `www.kondius.cn`。

## 14. 扩展点速查

**运行时插件 SDK ctx**(`plugin-loader.js` makeCtx):`registerTool` / `registerCapability` / `registerTransport` / `prompt.add` / `hooks.on`(before-context、before-llm-messages、after-response、before-tool、after-tool)/ `scheduler.every|at` / `send` / `http.fetch`(safe-fetch 闸)/ `storage` / `events.on|emit`(仅 blocklist-sync 可 emit)/ `ui.panel.register` / `permissions.status|request` / `config.get|all|onChange`(仅自己 configSchema 声明过的键)。

**唤醒前拦截**(2026-10-31 任务二,实现在 `bundled/runtime-defaults/business.js`):插件 `ctx.registerCapability('ingest.intercept', handler)` → 宿主在入库后、`onIncoming` 前咨询,载荷 `{chatKey, entry(脱敏副本), markRead(), signal}`;认领=已读沉历史+不排唤醒不建会话(零 token),不认领/异常/10s 超时=放行,暂停不调用,停用/换代自然失效。官方消费者 trpg-dice(3.1.0,档位 1 直发,`.r 1d100` 零模型)。测试 test/18(五条合同)+test/311(档位 1 端到端)。

**插件人格能力**(2026-10-31 本体开发任务一,组件 `core.persona.write`,实现在 `src/kernel/persona-write.js`):`ctx.capability('persona.write')` → `write({chatKey|null,fields})`(白名单 roleText/customRules/systemPromptOverride,空串=清除,越权 403/超长 400)+ `select({chatKey|null,personaId})`(按人设库切换,语义同控制台「选择」);`ctx.capability('persona.read')` → `read()` 摘要 + `resolve(chatKey)` 生效合成。scope `persona.write`(用户默认 ask/headless=deny)与 `persona.read`(默认 allow);审计日志不含正文;会话级覆盖生效仍受 personaUnified 门约束(返回值如实标注)。测试 `test/310-persona-write-test.mjs`。

**面板侧(用户插件 ui/ 页面)**:`ctx.call`(自身工具)/ `ctx.getConfig` / **`ctx.setConfig`(schema 校验+密钥 hasXxx 保留/清除)** / `ctx.notify`。

**声明式清单**:`configPage: {title?,entry?,id?}`(侧边栏配置页,免运行时代码)+ `panels: [...]`(多面板声明);`ui.panel.register` 运行时注册仍可用,同 id 判重复。

**启动组合层**:`overrides/<层>/composition.json`(组件 replace/wrap、具名路由、UI shell/panels/assets 贡献),最多 64 层;`scripts/inspect-composition.mjs` 打印装配计划。

**能力注册表**:6 个多提供者能力支持 claim/skip 协商与管理员 pin;managed 服务有代际租约。

## 15. 关键外部依赖(域名)

| 域名 | 用途 |
|---|---|
| `www.kondius.cn` | 社区 API/市场/价格源/验证码转发(bundled/market 钉死 allowedHosts) |
| `o.alicdn.com`、`captcha.cn-shanghai.aliyuncs.com` | 阿里验证码 SDK(CSP 白名单) |
| `api.deepseek.com`、`open.bigmodel.cn` | LLM 预设渠道 |
| `cn.bing.com`、`metaso.cn`、`api.bochaai.com`、`qianfan.baidubce.com` | 搜索源预设(仅 https) |
| `github.com` | NapCat/SnowLuma 下载指引、致谢 |

## 16. npm 命令速查

| 命令 | 作用 |
|---|---|
| `npm run server` | 无头启动(浏览器访问 `http://127.0.0.1:3210`) |
| `npm test`(=m3+m4)、`node test/run-m2.mjs` | 回归 |
| `npm run smoke` | 无头冒烟(13 项) |
| `npm run extension:check/test/pack -- <目录>` | 扩展自检/测试/打包 |
| `npm run privacy:check` | 隐私审计 |
| `npm run shot:ui` | UI 截图验收 |

## 17. 已知断链与注意事项

1. **`../dsh-spec/` 与 `../develop/` 不在本仓库**(README 已显式标注):规格编号引用作历史出处,当前不可复核。
2. **浏览器环境既有测试失败**(HEAD 复现,与当日改动无关):34、116、125、127、244、254、69——多为测试夹具未跟上 UI 演进或 Edge 替代 Chromium 的差异,已列入完善清单。
3. `progress.md` 为 UTF-8,cmd `type` 会乱码(编辑器/Read 正常)。
4. 会话文档自述历史编号与测试数量只对应当时范围,不代表当前版本验收完成。
5. 本机(Windows + Edge)环境注记(2026-10-31 本体开发日复核):M3 套件在本机存在大量环境性失败——已抽样验证 `55`、`62`(×2)、`87`(collect_sticker 可用性)、`132`、`173`(价格策略)、`211`、`215`(偶发)、`266`、`281` 等在 **HEAD 基线**上以相同断言失败,与当日改动无关;M0–M2(32 文件)与 M4(7 文件)在本机全绿。另一类系统性崩溃(子进程 0xC0000142 批量失败)由残留测试进程引发,清理 node/Edge 进程后重跑即消失。
5. GitHub 推送直连不稳时,可走 `eo.gh-proxy.cn` 代理 + 内嵌令牌(本日已验证可用)。
