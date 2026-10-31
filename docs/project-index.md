# QQ Agent 0.5(unfinished)项目索引

> 生成于 2026-10-31,基于全量盘点(1143 个文件,约 14.3 万行)。本文是导航地图:每个目录/模块一行说明,供快速定位。配套评审见 [project-review-2026-10-31.md](project-review-2026-10-31.md)。

---

## 1. 项目定位

QQ Agent 0.5 是 QQ 机器人的「DSH 薄内核 + 全插件」从零重写版(Node.js ≥20 / Electron 33,运行时依赖仅 `ws`/`js-yaml`/`qrcode`)。内核只提供装配缝与默认件,传输、工具、服务、UI 面板全部以插件形式挂载;行为以 `dsh-spec/SPEC.md` 为验收依据(该规格书在仓库外,见 §19)。协议端(NapCat/SnowLuma)由用户自备放入 `protocols/`,本项目不附带、不分发。

- 无桌面环境:`npm run server` 后打开 `http://127.0.0.1:3210`
- 桌面:`npm run desktop` 或双击 `启动QQ机器人.bat`(需先 `npm install`)
- 测试:`npm test`(= M3+M4 套件;M0–M2 需手动 `node test/run-m2.mjs`)

## 2. 顶层结构总览

| 目录/文件 | 规模 | 职责 |
|---|---|---|
| `src/` | 121 文件 / ~19.8K 行 | 内核与后端:装配、消息链路、LLM、HTTP/SSE、多账号、协议端托管、群管规则引擎、控制台路由 |
| `bundled/` | 20 目录 / ~4.9K 行 | 出厂插件(传输、工具、服务)与启动默认组件表 |
| `ui/` | ~16.7K 行 | 前端:宿主壳 `ui/shell` + 10 个 iframe 沙箱面板 `ui/panels`,原生 ESM 无构建 |
| `electron/` | 4 文件 / ~750 行 | 桌面外壳:窗口/托盘/IPC/单实例锁 |
| `test/` | 373 个 .mjs / ~52.9K 行 | 自研逐进程回归网,M0–M4 分层,约 322 个已接线 |
| `docs/` | 74 md + 2 mermaid + 1 json / ~17K 行 | 架构规格、扩展创作、迁移记录、QA 证据 |
| `website/` | ~39K 行(18MB) | kondius.cn/qq-agent 官网的只读本地镜像 + 动效实验场,不随应用打包 |
| `scripts/` | ~1.75K 行 + lib | 隐私审计、冒烟、截图、扩展 CLI、有头 QA 夹具 |
| `examples/` | ~1.2K 行 | 组合层示例 + 3 个扩展教学例 + 群管规则示例 |
| `skills/` | ~906 行 | 用户技能目录,出厂预装 `image-generate` |
| `protocols/` | README | 用户自备协议端放置目录 |
| `build/` | 3 文件 | NSIS 安装器:数据备份/恢复/白名单清理 |
| `assets/` | icon + persona | 应用图标、人设卡样例 |

父目录 `qqagent/` 下还有:`0.4/`(旧版)、`LICENSE`、`README.md`、`plu/friend-approval`(疑似插件开发残留)。

## 3. 根目录文件

| 文件 | 说明 |
|---|---|
| `package.json` | v0.5.0;scripts:`server`/`desktop`/`build`/`test`/`test:m3`/`test:m4`/`smoke`/`verify:preview`/`shot:ui`/`extension:check|test|pack`/`privacy:check`;`build.files` 为安装包白名单 |
| `README.md` | 安装连接说明、事实来源清单、扩展创作入口、工作约定 |
| `progress.md`(310KB) | 会话日志,进度权威(注意:文件为 UTF-8,cmd `type` 会乱码) |
| `findings.md`(74KB) | 实现关键发现与 M0–M4 架构裁决 |
| `task_plan.md`(61KB) | 规格逐条落地计划与历史执行断点 |
| `.gitignore` | 排除 `data/`、`data-*/`、日志、密钥、`dist/`、`.qa-local/`、`/protocols/*`(留 README)、全局 `**/config|data|logs` 等 |
| `启动QQ机器人.bat` | 检查 electron.exe 后后台启动;清空 `ELECTRON_RUN_AS_NODE` 防宿主泄漏 |

三个会话文档头部均有同一段「2026-10-23 范围更新」声明:专属协议端与便携客户端的安装/启动/登录态迁移已移出项目范围。

## 4. src/ — 内核与后端(121 文件,~19.8K 行)

### 4.1 启动链

`src/server.js`(35 行,headless 入口)→ `createApplication`(`src/kernel/composition.js:201`,扫描 `overrides/` 组合层,合并到 `bundled/runtime-defaults/components.js` 的 52 个默认组件)→ `createKernel`(`src/kernel/kernel.js:15`,691 行)按固定顺序构造约 40 个命名组件,`kernel.start()` 依次:实例锁 → 迁移检测 → 路由注册 → HTTP listen → 会话改判 → 插件装载 → 价格刷新 → 服务/管理/协议端启动 → 账号恢复。Electron 入口(`electron/main.js`)同链路,加载 `http://127.0.0.1:<port>/`。

### 4.2 src/kernel/(55 文件)— 核心部件

**消息链路**(按调用序):`ingest.js`(214 行,三闸准入)→ `orchestrator.js`(~970 行,唤醒状态机/防抖/禁言检查/重试退避/主动话题/会话延续窗口/记忆整理触发)→ `prompt.js`(330 行,提示词+锚点缓存)→ `agent-runner.js`(384 行,12 轮工具循环+hook 五时序)→ `tools.js`(276 行,工具注册表+八步执行管线)→ `send.js`(330 行,SendQueue 每会话串行/限频/去重/切分)→ `transport.js`(154 行,平台无关归一化)。

**扩展基础设施**:

| 文件 | 行数 | 说明 |
|---|---|---|
| `plugin-loader.js` | 1194 | 扩展装载器:三类根(bundled/plugins/skills)、目录指纹、热重载(临时副本绕 ESM 缓存)、两段闸换版、fs.watch 防抖重扫;**全库最复杂文件** |
| `capability.js` | 183 | 能力注册表:provide/consume、6 个多提供者能力协商、管理员 pin、活性探针 |
| `permissions.js` | 249 | scope 权限闸;捆绑默认 allow、用户插件默认 ask;授权绑定代码指纹,一次性凭据 |
| `service-host.js`/`service-lease.js` | 227/49 | managed 服务(transport.provider、mcp.service 等)工厂/启停/代际租约 |
| `sdk-services.js` | 438 | 插件 SDK 窄化访问层:按方法粒度映射权限 scope,出参脱敏 |
| `composition.js` + `composition-*.js` | ~400 | `overrides/` 组合层装载、层选择、生命周期、方法包装 |

**基础设施**:`bus.js`(双白名单事件总线)、`config.js`(359 行,配置+脱敏+滑条)、`http.js`(427 行,仅回环监听;鉴权→来源→reset guard→路由→body 四段守卫;SSE 心跳/背压;静态防穿越)、`store.js`(429 行,聊天存档)、`sessions.js`(475 行,会话状态机)、`memory.js`(289 行,印象记忆)、`stickers.js`(474 行)、`reminders.js`、`usage-days.js`(日档用量)、`llm.js`(507 行,chatCompletion/流式/方言/降级重试)、`safe-fetch.js`(338 行,SSRF 逐跳防护)、`migrator.js`(0.4 只读导入)、`data-reset.js`+`reset-guards.js`(两阶段数据重置)、`instance-lock.js`(领取单据式实例锁事务)、`log.js`+`log-policy.js`(环形内存+按天落盘)、`scheduler.js`、`wake.js`(四档唤醒)、`holidays.js`、`env.js`、`inline-tools.js`、`reply-rescue.js`、`reply-provider.js`、`send-text.js`(md 转纯文本/切分)、`storage.js`(插件命名空间 KV)、`web-search.js`/`media.js`/`telemetry.js`(2–3 行兼容 shim)。

### 4.3 src/console/(39 文件)— 控制台后端

| 文件 | 行数 | 说明 |
|---|---|---|
| `routes.js` | 1462 | M3 全量路由唯一事实源:status/usage/价格/渠道/人设/扩展安装/能力选择/会话/聊天/记忆/市场/暂停/重置 + 组合层贡献路由的 scoped registry;**最大文件** |
| `builtin-model-prices.js` | 1238 | 内置模型价格历史静态数据 |
| 其余 37 个 | 各 2–402 行 | 拆出的控制器:memory-media-adapters、price-update-adapters、panel-adapters(用户面板窄宿主)、panel-protocol(iframe JSON-RPC)、provider-adapters、vision-scan-adapter、session-names、search-provider-adapter、extension-updates、background-uploads(魔数校验)、key-access(明文密钥守卫)、serializers(无密钥 DTO)、local-fonts、local-protocols、group-management、forward-adapter、sse-bridge 等;mcp-adapter/community-market-adapters 为 2 行 shim、prompt-preview-adapter(提示词组装调试预览 /api/debug/prompt/*) |

### 4.4 其余子目录

| 目录 | 文件 | 说明 |
|---|---|---|
| `src/management/`(14 文件) | `runtime.js` 180 行入口 | 可视化节点图群管规则引擎:`catalog.js`(节点目录)、`flow.js`(图执行器,并发 8)、`value-runtime/value-nodes/ports`(端口类型与绑定值校验,防 `__proto__`)、`nodes.js`、`sequences.js`、`state-store.js`(计次/闸门持久化)、`recall-window.js` |
| `src/protocols/`(6 文件) | `manager.js` 248 行 | 用户自备协议端托管:扫描识别 NapCat/SnowLuma、ZIP 安全解压、随机端口+token 写入 config、进程树管理、uncertainTree 保守态;`adapters.js`(314)、`login.js`(282)/`native-login-client.js`(261,范围收缩后遗留)、`verify-connection.js`、`process-tree.js` |
| `src/accounts/`(4 文件) | `manager.js` 413 行 | 多账号工作区:每 QQ 一个独立 data 目录 + fork 子进程(`worker.js`,每子进程一个完整内核),IPC 代际防串号;`gateway.js`(54,主→子反向代理,剥 token);`routes.js` |
| `src/transports/onebot/`(2 文件) | 各 2 行 | 纯 re-export shim,真实实现在 `bundled/transport-onebot/` |

## 5. bundled/ — 出厂插件(20 目录,~4.9K 行)

| 目录 | 清单 | 行数 | 注册内容 | 说明 |
|---|---|---|---|---|
| `transport-onebot` | plugin.json | 1043 | `transport.provider`(默认) | OneBot v11:WS 收事件+HTTP 发动作;代际互斥防 401 风暴、令牌轮换、指数退避 3s→30s、CQ 转义;**最大插件** |
| `market` | plugin.json | 645 | `market.client` | 市场客户端:账号登录/发布/安全安装(手写 ZIP+zip-slip 防护)、名单同步;锁定 `www.kondius.cn` |
| `web-tools` | skill.json | 383 | `web.search`/`web.images` + 3 工具 | web_search/web_fetch/search_images,全走 safe-fetch;Bing HTML 解析 + 5 家 API 预设 |
| `media-service` | plugin.json | 322 | `media.reader` | 受限图片下载、缓存回退、可选 ffmpeg/ffprobe(GIF→MP4/抽帧) |
| `query-tools` | skill.json | 222 | 7 个查询工具 | 最近消息/转发展开(结果回写存档)/活跃成员/消息详情/图片/视频 |
| `memory-service` | plugin.json | 207 | `memory.consolidate` | LLM 合并/去重成员印象 |
| `telemetry` | plugin.json | 196 | `telemetry.service` | 匿名用量上报(仅 installId/版本/计数)→ kondius.cn,首延迟 90s、每 6h |
| `mcp-bridge` | skill.json(`kind:"plugin"`) | 195 | `process.mcp`/`mcp.tools`/`mcp.service` | stdio MCP 客户端桥 |
| `core-tools` | skill.json | 152 | 5 个发送工具 | send_message/send_to/send_poke/finish/report_feedback |
| `compat-04` | skill.json(`kind:"plugin"`) | 151 | `compat-04.createSkillApi` | 0.4 旧插件 API 垫片;`proc.exec/net.raw/mcp.connect` 永不映射 |
| `media-tools` | skill.json | 105 | `send_image` 工具 | 消费 `media.reader`+`core.send`(工具层/能力层分工) |
| `sticker-tools` | skill.json | 121 | 4 个表情工具 | 清单多声明 `sticker_note` 未实现(迁移残留) |
| `system-tools` | skill.json | 102 | 提醒 3 工具+节假日 | 直接 import 内核 `holidays.js`(捆绑=受信层) |
| `memory-tools` | skill.json | 70 | memory_append/query/remove | 消费 `data.memory` |
| `community` | plugin.json | 164 | `community.client` | 云端屏蔽名单 5 分钟同步 + 金句/反馈投稿 |
| `voice-to-text` | skill.json | 120 | `media.transcribe` | OpenAI 兼容 ASR;默认停用(付费外呼);失败降级 `[语音]` |
| `runtime-defaults` | **无清单** | 253 | 52 个默认组件工厂表 | 非插件;被 loader 特判跳过,由 composition/kernel 消费 |
| `reminders` | plugin.json | 28 | `reminders.service` | 把 `data.reminders` 接到宿主提醒运行时 |
| `llm-dialects` | plugin.json | 86 | `llm.dialect` | 思考模型请求参数方言(9 种)+拒绝降级 |
| `hello` | skill.json | 35 | `hello_say` | SDK 活样例,默认停用 |

加载器:`src/kernel/plugin-loader.js` 优先读 `skill.json` 再 `plugin.json`,按 `kind` 字段归一化。捆绑插件可相对 import 内核模块(受信层),用户插件只能走 SDK ctx。

## 6. ui/ — 前端(原生 ESM,无构建步骤)

架构:宿主页 + 沙箱 iframe 面板。`ui/shell/index.html` 是唯一宿主文档;每个面板 = `iframe sandbox="allow-scripts"`(opaque origin),与宿主经 postMessage JSON-RPC(RpcBridge:源窗口+origin+nonce+panel id+API 白名单五重校验)通信。面板切换 = 换 iframe src,`?panel=<id>` 记录状态;无 hash 路由、无动态 import。静态由内核 `http.js` 伺服(`/`→`ui/shell`,`/panels/`→`ui/panels`)。

### 6.1 ui/shell/(31 文件,~5.9K 行)

| 文件 | 说明 |
|---|---|
| `app.js` | 壳逻辑:面板挂载、SSE 状态、toast/确认框、启动导航策略 |
| `panel-registry.js` | 从 `/api/panels` 拉 `ui/panels/manifest.json`(19KB),强校验后挂 iframe;主题广播 |
| `rpc-bridge.js` | JSON-RPC 桥:nonce+origin+API 白名单;禁 bootstrap/写 server.token 等特殊端点 |
| `api-client.js` | 统一 fetch:`x-console-token`、超时、方法/路径白名单、401 自动恢复重试 |
| `sse-client.js` | 手写 SSE 解析:26 事件白名单、16MB 上限、断线 1.5s 重连 |
| `console-auth.js` | 凭据引导:桌面走 IPC,浏览器走 `/api/console/bootstrap`,`?token=` 用完即删,sessionStorage 30min TTL |
| `theme.js`(panels/ 下,761 行共享) | CSS 变量主题引擎:出厂基准+自定义方案;`data-styleMode` 切换 endfield/classic/signal/flux |
| `visual-editor.js`+`visual-picker.js` | 外观点选编辑(28KB):跨 iframe 取色/属性编辑、撤销/预览 |
| `account-switcher.js`/`account-scope.js` | 多账号切换(整文档导航 `/?account=<uuid>`) |
| `update-notice.js` | 每小时查 `/api/update-check`,只给下载链接 |
| 其余 | panel-recovery、panel-view-state(RAM 租约恢复面板状态)、refresh-queue、destructive-feedback、startup-navigation 等 |

### 6.2 ui/panels/(9 个内置面板)

> 2026-10-31:移除原第 10 个面板「我的」(community:发布账号/扩展发布/意见反馈/验证码诊断);技能市场与插件市场保留。chats 面板的金句投稿与后端 market/community 插件不受影响。

| 面板 | 规模 | 功能 |
|---|---|---|
| `settings` | panel.js 1562 行 / 117KB + 50 余子模块 | **最重面板**:11 分区(QQ 连接/模型/响应范围/人设/聊天/记忆/搜索/工具/外观/隐私安全/应用);`render()` 单函数约 590 行 |
| `rules` | management.js 181 行/40KB + canvas/graph | 规则编排器:SVG 画布、连线、模拟运行/验证/运行记录 |
| `sessions` | panel.js + trace-view 等 9 文件 | 会话流水:列表/详情/流式步骤/等待倒计时/重试/中止 |
| `chats` | panel.js + message-view/quote-mode/history | 存档浏览:媒体查看、合并转发展开、多选删除、金句投稿模式 |
| `skills` / `plugins` | 共用 extension-manager.js(30KB) | 市场浏览/ZIP 安装/启停/热重载/权限对话框;两入口 panel.js 为复制粘贴对 |
| `memory` | panel.js 231 行 | 记忆浏览/成员印象/备注/合并 |
| `usage` | panel.js + spark.js | 用量 sparkline、细分、成本表 |
| `logs` | panel.js + log-stream | 最近 200 条+流式合并(最简面板) |

根级共享模块:`panel-client.js`(面板侧 RPC)、`ui.js`(DOM 工具+自动错误框)、`icons.js`、`extension-manager.js`、`market-browser.js`、`destructive-action.js`(长按确认)、`motion.js`(GSAP 封装+reduced-motion)、`selection-state.js`、`dialog-lifecycle.js`、`live-refresh.js` 等。`manifest.json` 注册 9 面板 + 1 个测试夹具面板。

### 6.3 vendor 与 assets

- `ui/panels/vendor/`:`gsap-3.13.0.min.js`(72KB,含来源与 SHA-256 记录,运行时不连 CDN)+ `gsap-runtime.js`(动态注入,5s 超时降级)。
- `ui/panels/assets/endfield/`:默认主题「endfield」的徽标/归档图形(含 AI 生成 prompt 留档 `generation-prompts.json`)。

## 7. electron/ — 桌面外壳(4 文件,~750 行)

| 文件 | 说明 |
|---|---|
| `main.js`(682 行) | 内核启动、窗口(`contextIsolation:true`/`sandbox:true`/`nodeIntegration:false`,main.js:390-405)、托盘、单实例锁、导航拦截(`setWindowOpenHandler` deny、非回环转系统浏览器)、IPC 全部校验主窗口、控制台 token 经 IPC 下发不进 URL、阿里验证码请求拦截转发、退出前渲染进程保存握手(20s 超时)、失败落 `boot-diag.log` |
| `preload.cjs`(18 行) | `contextBridge` 窄桥,仅 8 个方法 |
| `preload.js`(19 行) | 同内容的 ESM 版,未被使用(与 .cjs 重复维护) |
| `renderer-leave.js`(34 行) | 退出/刷新前保存握手协议 |

## 8. docs/ — 文档(74 md + 2 mermaid + 1 json)

### A. 架构与规格(持久参考)

| 文件 | 说明 |
|---|---|
| `architecture-composition.md` | **追加式组合规格 v2.1(2026-10-16)**,全项目架构主合同 |
| `plugin-sdk.md` | v0.5 公共插件 SDK 参考(ctx API/权限 facade/managed 服务) |
| `extension-reference.md`(559 行) | 给 AI 的原生 0.5 扩展「自足合同」 |
| `system_design.md` | M3 控制台增量架构审计与设计 |
| `功能实现逻辑说明.md` | 面向「接下来加功能的人」的纯逻辑说明 |
| `group-management-node-reference.md`(2734 行,最大) | 群管理 109 种节点目录(`scripts/generate-management-reference.mjs` 生成) |
| `class-diagram.mermaid` / `sequence-diagram.mermaid` | 控制台类图 / 面板 RPC+SSE 时序图 |

### B. 扩展创作链(持久参考)

`extension-authoring.md`(创作引导入口)、`ai-extension-prompt.md`(可复制提示词)、`v04-extension-parity.md`(0.4→0.5 能力对照)、`extension-online-updates.md`(更新与重载分离设计)。

### C. 0.4→0.5 迁移合同/记录(约 37 篇,多为一次性会话产物)

`v04-parity-plan.md`(总计划)、`v04-parity-source-index.json`(147.7KB 源码索引,**指向已不存在的 ../develop**)、以及按子系统分册:`core-behavior-parity`、`model-catalog-migration`、`model-price-peak-migration`、`media-processing-parity`、`telemetry-parity-migration`、`reply-provider-migration`/`reply-provider-lifecycle`、`thinking-policy-migration`、`search-defaults-migration`、`settings-structure/controls/save-lifecycle` 三篇、`session-activity/detail-scroll/name-presentation` 等会话表现系列、`memory-view-migration`、`memory-effective-community-policy`、`persona-template-migration`、`pause-navigation-migration`、`list-layout-migration`、`refresh-policy-migration`、`logger-resilience-migration`、`feedback-draft-migration`、`config-corrupt-diagnostic-migration`、`blocklist-raw-transaction`、`sticker-sync-migration`、`update-notice-migration`、`archive-performance`、`activity-settings-v04-presentation`、`community-page-trim`、`develop-reference-gap-closure`、`upstream-ui-migration`、`gap-closure-design`(自标已被组合规格 v2 取代)、`batch-code-install-migration`(自标已废弃)。

### D. QA/验收证据(9 篇)

`headed-qa-checklist.md`(约 186 项)、`headed-qa-results.md`(275KB,最大)、`headed-qa-regression-evidence.md`(188KB)、`headed-qa-extension-ui-evidence.md`、`headed-qa-runtime-evidence.md`、`composition-regression-evidence.md`、`composition-overlap-evidence.md`、`onebot-send-repair-evidence.md`、`ai-extension-validation.md`。

### E. 协议端接入与近期实测(2026-10-24~26,8 篇)

`protocol-account-login-2026-10-24.md`、`local-protocols-validation-2026-10-24.md`、`local-protocol-real-validation-2026-10-24.md`(真实包 ZIP→识别→解压→启动)、`session-flow-2026-10-24.md`、`visual-realtime-2026-10-24.md`、`session-realtime-model-validation-2026-10-24.md`、`multi-account-2026-10-25.md`、`snowluma-account-audit-20261026.md`(真实桌面 QQ 实测审计)。

### F. UI/功能特性笔记(~12 篇)

`appearance-visual-editor.md`(README 链接)、`theme-color-design.md`(290 行主题设计记录)、`destructive-motion.md`(删除动效规范)、`group-management-and-fonts.md`、`rules-panel.md`、`management-primitives.md`、`sl-removal-rule.md`、`session-archive-presentation.md`、`startup-navigation.md`、`local-console-auth.md`、`privacy-cleanup.md`、`capability-picker-refresh.md`。

## 9. examples/ — 官方示例

| 目录 | 说明 |
|---|---|
| `composition/20-local-customization/` | 追加式组合最小示例:`composition.json`(order 20,wrap `core.prompt.system`)+自定义路由;需复制到 `overrides/` 生效 |
| `extensions/roll-dice/` | 掷骰子技能:参数校验、`ctx.storage`、5 个自检用例 |
| `extensions/http-query/` | 调用外部 HTTPS JSON API:令牌、取消、8 用例 |
| `extensions/image-generate/` | OpenAI 风格文生图教学版,11 用例(与 `skills/image-generate` 是两套实现) |
| `management/sl-removal-rule.json` | 群管规则示例(`format: qqa-management-v1`) |

每个扩展目录带 `extension.check.json` 自检清单,配合 `npm run extension:check|test|pack`。装载器只扫 `skills/`、`plugins/`、`bundled/`,不扫 `examples/`。

## 10. skills/ 与 assets/

- `skills/image-generate/`:出厂预装的生产型文生图技能(`enabledByDefault:true`,声明 `web_fetch`/`image.generate`),实测经验记录在注释中。注意:其使用的 `ctx.sender.sendImage`/`api.fetch` 在两份参考文档中均未记载(见 review)。
- `assets/icon.png`:应用图标;`assets/personas/xiaojingyu.txt`:人设卡样例(带二级标题分节的中文角色设定)。

## 11. protocols/ — 协议端放置约定

用户自行从上游 Releases 下载 NapCat/SnowLuma 完整发行包,ZIP 原样或解压目录放入 `protocols/`(源码运行=项目根;安装版=可执行文件旁;`QQ_AGENT_PROTOCOL_DIR` 可覆盖)。应用只做识别、解压、OneBot 配置补齐与进程托管;一次托管一个协议端服务、可多账号。「Source code」ZIP 与 SnowLuma Lite 不可用。

## 12. scripts/ — 工具链

| 脚本 | 接线 | 说明 |
|---|---|---|
| `audit-privacy.mjs` | `privacy:check` | 全仓扫 7 类隐私模式(路径/凭据/手机号等),命中即 exit 1 |
| `smoke-headless.mjs` | `smoke` | 无头冒烟:spawn server 验证端点 + createApplication 全清理链 |
| `shot-ui.mjs` | `shot:ui` | 起真内核+Chromium 截 9 张 UI 图到 `.shots/` |
| `verify-preview-build.mjs` | `verify:preview` | 校验 `dist/win-unpacked` 结构 |
| `extension-dev.mjs` | `extension:check|test|pack` | 扩展 CLI;实际逻辑在 `scripts/lib/extension-dev.mjs` |
| `scripts/lib/download.mjs` | — | 安全下载器:强制 HTTPS/SHA256/≤5 跳/原子写 |
| `scripts/lib/runtime-archive.mjs` | — | 自写 ZIP 解析:先审中央目录再流式解压+CRC |
| `headed-qa-fixture.mjs`(249 行) | — | 有头 QA 总夹具:复制生产 app + 合成 OneBot/mock LLM(端口 31402/31403) |
| `audit-v04-parity.mjs` / `benchmark-archives.mjs` / `generate-management-reference.mjs` / `inspect-composition.mjs` | 手动/随包 | 一次性生成器与诊断工具(后者被 electron-builder 打包) |

`scripts/qa-fixtures/`:MCP server 夹具、ZIP 构造器、合成视频、安全证据脚本。

## 13. test/ — 测试体系(373 个 .mjs,~52.9K 行)

- 运行器:`run-all.mjs`(`npm test`)= **run-m3(约 305 文件)+ run-m4(10 文件)**,逐文件 spawnSync 子进程,240s/120s 超时。M0–M2 链(`run-m2 → m1 → m0`,内核基础 01–25 号)**不在 npm test 中**,需手动跑 `node test/run-m2.mjs`。
- 形态:约 322 个已接线,两种风格(自绘断言 `test/helpers.mjs` / `node:test`);224 个 import 内核、69 个用 playwright-core 真 Chromium 做 UI e2e、121 个起真内核、164 个做源码静态契约断言。
- 离线性极强:`ws` mock OneBot、http mock LLM、`page.route()` 拦截、`*.invalid/.fixture/.test` 假域名;仅 2 个文件 spawn 真 server。
- 未接线孤儿约 31 个(258–260、281–287、management-* 14 个、rules-panel-ui 等,见 review)。
- 历史结果:2026-10-16 组合验收 M3 147/147、M4 10/10、冒烟 12/12;2026-10-24 记录 M3 117/117。

## 14. website/ — 官网镜像(不随应用打包)

- `website/qq-agent/`:https://kondius.cn/qq-agent/ 的静态镜像(抓取于 2026-10-21,`mirror-manifest.json` 69KB 记录 URL→SHA256 审计)。纯 vanilla JS SPA:入口空壳由 `assets/qa3/core.*.js` 渲染;动效依赖 vendored GSAP/Three.js/anime.js;子页含 comments(意见墙)、holyshits(语录)、plugin-market、skill-market、persona-plaza、u(个人页)、admin(公开壳)、captcha-sdk(阿里)、lab(动效实验)。
- `website/snapshots/`:公开 API 数据快照(plugins/skills/personas/comments 等)。
- `website/serve.mjs`:本地预览服务器(127.0.0.1:4173),把 `/api/community/*` 映射到快照,POST 一律 405,不向线上转发。
- `website/tools/`:download.py(只读抓取)、local-navigation.mjs(响应期变换)、build-precision-lab.mjs。
- 与主应用的关系:不打包,但运行时契约一致——`bundled/market`、`bundled/community`、价格源、验证码 SDK 均直连 `www.kondius.cn` 线上服务。

## 15. build/ — NSIS 安装器

`installer.nsh`(解析旧安装根→备份用户数据→安装→恢复)、`check-app-running.nsh`(路径校验后插运行检查)、`preserve-user-data.ps1`(PS 5.1,白名单式删除,reparse point/盘根全拒,备份回执 ini)。配套测试 `test/273-installer-user-data-preservation-test.mjs`。

## 16. 扩展点速查

**运行时插件 SDK ctx**(`plugin-loader.js:311-580` 构造):`registerTool` / `registerCapability` / `registerTransport` / `prompt.add` / `hooks.on`(before-context、before-llm-messages、after-response、before-tool、after-tool)/ `scheduler.every|at` / `send` / `http.fetch`(safe-fetch 闸)/ `storage`(命名空间 KV)/ `events.on|emit`(仅 blocklist-sync 可 emit)/ `ui.panel.register` / `permissions.status|request` / `config.get|all|onChange`(只能读自己 configSchema 声明过的键)。

**启动组合层**:`overrides/<层>/composition.json`(version/order,组件 replace/wrap、具名路由、UI shell/panels/assets 贡献),最多 64 层;`scripts/inspect-composition.mjs` 打印装配计划。

**能力注册表**:6 个多提供者能力支持 claim/skip 协商与管理员 pin;managed 服务(transport.provider、mcp.service、reminders.service、telemetry.service)有代际租约。

**面板**:manifest 声明 `id/kind/entry/权限/API 白名单`,宿主强制白名单,`sandbox="allow-scripts"` 不给 same-origin。

## 17. 关键外部依赖(域名)

| 域名 | 用途 |
|---|---|
| `www.kondius.cn` | 社区 API/市场/价格源/验证码转发(bundled/market 钉死 allowedHosts) |
| `o.alicdn.com`、`captcha.cn-shanghai.aliyuncs.com` | 阿里验证码 SDK(CSP 白名单) |
| `api.deepseek.com`、`open.bigmodel.cn` | LLM 预设渠道 |
| `cn.bing.com`、`metaso.cn`、`api.bochaai.com`、`qianfan.baidubce.com` | 搜索源预设 |
| `github.com` | NapCat/SnowLuma 下载指引、致谢 |

## 18. npm 命令速查

| 命令 | 作用 |
|---|---|
| `npm run server` / `desktop` | 无头 / 桌面启动 |
| `npm test`(=m3+m4)、`node test/run-m2.mjs` | 回归 |
| `npm run smoke` | 无头冒烟 |
| `npm run extension:check/test/pack -- <目录>` | 扩展自检/测试/打包 |
| `npm run privacy:check` | 隐私审计 |
| `npm run shot:ui` | UI 截图验收 |
| `npm run build`(electron-builder) | Windows NSIS 安装包(按用户要求暂缓) |

## 19. 已知断链与注意事项

1. **`../dsh-spec/` 不存在**:README 声明的行为规格(SPEC §1–§18,F-001~F-223)与 `DSH-ARCH.md`、`NEXT-SESSION.md` 均指向上级目录,当前盘面上缺失;task_plan.md 提到 `<user-home>/Desktop\qq-agent\dsh-spec\`。验收锚点不可复核。
2. **`../develop/` 不存在**:0.4 参考源码目录缺失;`docs/v04-parity-source-index.json` 与约 8 篇迁移文档引用其具体路径/行号。
3. `progress.md` 为 UTF-8,用 cmd `type` 或部分工具直接读会乱码(用 Read/编辑器打开正常)。
4. 会话文档(progress/findings/task_plan)自述其历史编号与测试数量只对应当时范围,不代表当前版本验收完成。
