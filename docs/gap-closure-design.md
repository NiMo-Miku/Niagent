# v0.5 剩余目标实现方案（换平台已删除）

> 2026-10-16：本文件保留早期功能补齐记录；插件化架构以 [追加式组合规格 v2](architecture-composition.md) 为准。用户已授权修订相邻规格书，旧“固定 core”或“规格只读”限制不再适用于本轮。

> 对应 `task_plan.md` 插件化总纲中**仍在目标内**的条目。所有卡点均已 grep 代码核实，非推测。日期：2026-10-04。
>
> **目标修订（同日）**：原「换平台（微信）」目标**已从 task_plan.md 删除**。qq-agent 定位为 **QQ 专用机器人**。
> - **已删除**：换平台（微信等跨平台接入）——理由见文末「附录：为什么删除换平台目标」，适配层仅占约 20% 成本。
> - **保留**：更换兼容的 OneBot 协议端，接口与行为差异由 provider 处理。
> - 下方「三」已改为**只覆盖换协议端**；原跨平台分析降级为附录，供决策追溯。

---

## 2026-10-11 规格功能补齐

以相邻只读 `dsh-spec` 的行为契约和项目后续决策为准；未读取旧 `develop` 实现。

- 会话面板增加状态/聊天/关键词筛选、自动跟随、结构化提示词/消息/工具/raw/排除原因与 JSON 切换。聊天存档增加 500+200 分页、批量选择删除、引用/撤回/媒体和按本地 ID 展开合并转发。
- 记忆面板提供成员检索、印象/备注编辑、指定成员整理以及基于真实发言新建印象。后台整理支持专用渠道/模型、单成员失败保留、名称反查 QQ、同 QQ 多档合并和并发修改保护；后台调用记录真实用量。自动发现按最近 2000 条真实发言计数，默认至少 20 条、每轮最多 3 人，沿用整理冷却；人数设为 0 可关闭，空结果及失败不写假档、不阻止重试。
- 媒体读取走安全下载与协议缓存回退；视频支持 ffprobe 元信息、原生输入、1~12 帧以及关闭画面模式。GIF 可按配置转视频，缺少 ffmpeg 时保留可解释退路。图片与表情发送补齐回退、预览约束、大小/额度和取消控制。
- 设置增加渠道 YAML 导入（源文本剥离密钥）、模型多选/试聊、备选模型顺序、分群档位/峰谷、批量价格清除、搜索源完整编辑。默认媒体限制与真实执行入口一致。
- 主动话题增加专用提示；提醒只在确认成功发送后消费，失败余项持久化重试。上下文 hook 在组装前执行一次，动态扩展提示支持异步与超时，运行时异常进入扩展诊断。
- 用量增加渠道/会话维度与交叉下钻；“全部”包含一年以前，24 小时严格按时间过滤。每日用量存档保留累计用量、工具计数和当时价格，会话文件清理后仍可统计；运行中及同 ID 重试增量立即可见，日档失败保留会话和计费基线供重启补写。旧匿名汇总保留其总额；因原档缺少身份与单会话价格，无法还原已丢失的细分账单。
- 协议面板补齐顺序启动、日志级别和贴底；扩展与社区面板补齐残留配置清理、运行错误和发布口令呈现。修复真实发布链中 ZIP 模式位溢出；导入当前渠道的新地址会同步主模型配置，移除当前模型则清除选择。

新增验收入口为 `test/80`–`83`，默认 `npm test` 纳入功能回归和真实 Chromium 保存链；媒体验收使用本机已有 ffmpeg/ffprobe。QQ 协议、外部模型和社区请求使用离线夹具，不向真实群或账号发送测试消息。

最终验收：`npm test` 返回 0，M3 **55/55**、M4 **10/10**；`npm run smoke` **12/12**。80/83 实际运行 Chromium 的 iframe→RPC→HTTP→落盘链；81 实际执行 ffmpeg/ffprobe；82 运行时专项 **34/34**。旧测试 55/62/65 已随实现迁移，同时保留请求参数、类型/密钥/取消、事实/采样/容量与换行等行为断言。

验收记录：系统临时目录中的 `qq-agent-spec-acceptance-final.log`。当前轮改动保留在工作区，原有未提交改动未做整体重置；真实 QQ 登录、外部模型与社区账号仍需实际环境联调。

## 2026-10-11 规格符合性复核

**结论：当前工作区尚未完整满足规格，现有安装包也不能代表本轮修复后的实现。** 上一节的“最终验收”仅说明当时覆盖的自动化回归通过，不能作为整个 SPEC / DSH-ARCH 达标的结论。后续插件化整改仅关闭下表注明的 SDK、协议接入及业务归属项，其余行为缺口保留。

依据为相邻只读 `dsh-spec/SPEC.md`、`DSH-ARCH.md` 及对应 notes，并采用项目后续有效决策：QQ 专用、每条消息一颗随机骰、移除 sticker_note、宿主指纹授权及现行面板隔离方案。不把已删除的跨平台目标重新列为缺口；未读取旧 develop 实现。

### 已确认的规格缺口与行为故障

| 项目 | 对应要求 | 当前证据与实际影响 |
|---|---|---|
| 切换渠道后仍使用旧地址 | F-200 / SPEC §5 渠道配置 | 真 Chromium 操作设置页“当前渠道”并等待保存后，`api.provider` 已变为 B，`api.baseUrl` 和 `api.model` 仍为 A；`resolveApiKey` 则选 B 的密钥。`ui/panels/settings/panel.js:439` 只保存 provider，`src/kernel/llm.js:52`、`:373` 分别读取密钥与地址，可能形成错误的端点/密钥组合。未发外部请求。 |
| 清除/删除渠道后密钥仍留存 | R-33 / R-34，F-208 | 真实隔离 HTTP 返回 `hasKey:false` 后，配置仍含旧键，再次 GET 显示 `hasKey:true`；删除渠道也留孤立密钥。`src/console/routes.js:564–574` 删除对象键后调用配置深合并，不能删除既存键。 |
| 视频段被丢弃却报告发送成功 | F-093 / SPEC §6.10 | 生产 SendQueue + 生产 OneBot provider + 离线 client 复现：视频段进入 `send_group_msg` 时 message 变成空数组，返回 `ok:true` 并留档。实现现位于 `bundled/transport-onebot/provider.js:117–125`（原 src 路径仅兼容 export），未转换 video/json/forward/file，默认直接忽略。本轮只迁移归属，没有修复该业务行为。 |
| 图片内网开关同时放开网页抓取 | SPEC §8 web_fetch / §16 SSRF 基线 | 既有生产 `createWebSearch` 隔离本地 HTTP 复现：`allowPrivateImageHosts=true` 时 `web_fetch` 可访问 127.0.0.1。实现现位于 `bundled/web-tools/service.js:68`、`:123–125`，仍把图床例外用于网页请求。本轮只迁移到公共 HTTP，没有关闭该配置语义缺口。 |
| SDK 的完整面未落地（本轮关闭） | DSH-ARCH §4.2 | `src/kernel/plugin-loader.js` 已提供 `config.onChange/send/http.fetch/ui.panel.register/lifecycle` 和 `{name,params,handler}`；工具执行上下文与具名服务使用 `src/kernel/sdk-services.js` 的精确 facade，不含 ctx.kernel。84/85/89 以实际 loader 验证权限、指纹、配置/数据脱敏、取消、MCP 句柄与停用回收，80 运行真实 Chromium。详见 `docs/plugin-sdk.md`。 |
| 0.4 合法清单未自动进入兼容垫片 | DSH-ARCH §4.3 / SPEC §7 | 未加人为兼容标记的 `skill.json + setup(api){api.config()}` 夹具报 `api.config is not a function`。`src/kernel/plugin-loader.js:142` 的兼容选择依赖额外标记或旧 prompt，不能满足旧插件无需改包的兼容要求。10 个真实市场插件验收也未完成。 |
| 扩展目录重建后监听不自愈 | SPEC §7（目录删除重建） | 临时目录隔离复现：删除并重建 skills/ 后，新插件不自动装载，手动 loadAll 才激活。`src/kernel/plugin-loader.js:790–814` 重扫没有重建目录监听器。已接受的依赖/资产更新需重启决策没有取消这一目录监听要求。 |
| 插件化边界仍有结构缺口（本轮关闭） | DSH-ARCH §3.2 / §6.3 | market/community/telemetry/reminders/media-service/memory-service/llm-dialects 的默认业务实现已归属 bundled，web.search 由 web-tools、process.mcp 由 mcp-bridge 注册，kernel 装配窄接口和服务宿主。旧业务路径仅保留兼容入口。86 验证各服务及停用撤销，87 真实 kernel 验证默认 owner、替换、定时任务和公开 facade。已批准的数据仓、状态机、配置、发送排队、统计持久化及 A-6 价格机制继续由 core 拥有，不计为新缺口。 |
| 追加插件替换协议端（本轮关闭） | DSH-ARCH §6.2 / §6.3 | `bundled/transport-onebot/provider.js`、`client.js`、`processes.js` 拥有默认协议及进程实现；用户通过 `registerTransport` 注册受授权控制的 managed transport。87 的真实磁盘插件驱动真实发送队列、归一化入站及状态，并验证停用回退、重新授权、热更新、旧回调抑制和保存的 facade 动态解析。无需编辑 kernel 或重新构建；真实 QQ 协议端联调仍在实机验收范围。 |
| 内置官方价格表与手填兜底不完整 | F-084 / SPEC §11.3 | `src/console/price-update-adapters.js:131–150` 仅有 custom + 远程缓存。空缓存夹具虽标 `source:builtin`，价格条目为 0、模型无匹配；首次离线启动没有规格要求的内置价格兜底。`src/console/routes.js:107` 在官方开关启用且未匹配时直接返回 0，也未使用全局手填兜底。 |
| 发送批次引用与媒体停顿偏差 | SPEC §6.10 第 3、5 条 | 文字批次的每条仍传 `replyToMessageId`，OneBot 每条都插引用，未限定首条；图片/表情/媒体缺少规格规定的前置停顿。见 `src/kernel/send.js` 的 `chainSend` 与媒体入口、`bundled/transport-onebot/provider.js:129–132`。本轮没有修改该业务行为。 |
| 思考强度与旧模式的优先级错误 | F-072 / SPEC §5（thinkingEffort） | 真实 LLM 请求构造＋离线 fetch 复现：effort=off、mode=auto 时仍发 DeepSeek thinking.enabled，o3 则收到 reasoning_effort=off；effort=high、mode=off 时又被关掉。`src/kernel/llm.js:224–228` 先用旧模式决定开关，未落实“effort 为空时才兼容旧模式”的要求。 |
| 配置零次会话重试仍会重试 | F-069 / SPEC §5（sessionRetryAttempts=0 关闭） | 真实编排器＋离线 network 失败复现：配置 0 后仍发起 3 次 LLM 调用。`src/kernel/orchestrator.js:336` 的 Number(value) || 2 把合法的 0 替换为默认 2。 |
| 关闭锚点时遗漏历史成员记忆 | notes06b §7（标准模式成员集） | 隔离运行中历史消息在提示词内，但该历史成员的印象缺失；仅触发者印象出现。`src/kernel/orchestrator.js:449–450` 无锚点时只取 batch 成员，没有合并已读窗口全部成员。 |
| 历史条数配置被固定窗口截断 | SPEC §5 / §6.7（historyCount） | 700 条已读历史、配置 historyCount=600 的隔离运行实际只保留 499 条；`src/kernel/orchestrator.js:402` 固定读取最近 500 条，触发批再占用这个窗口，后续 limit 配置无法补回。 |
| 锚点命中时稳定前缀仍会变化 | SPEC §6.7 / notes06b §8 | 已有成员新增印象后，第二轮仍标记 anchor、基座 readIds 相同，但【记忆】＋【已读信息】前缀字节不同。`src/kernel/orchestrator.js:449–450` 每轮重新读取记忆正文，锚点只保存成员 ID；不满足规定的前缀不变性质。对厂商缓存命中和金额的影响尚未实测。 |
| 社区及就绪功能的 UI 入口不完整 | F-198 / F-220–222 / notes10 | 真 DOM 中意见、金句、技能市场、人设广场、四项就绪体检、全局暂停入口均不存在；`ui/shell/app.js:16–24` 的外链绑定没有对应 DOM。金句选择/确认上传流未实现。Electron 验证码转发与诊断 IPC 已有，但 UI 无 SDK/验证码容器及 IPC 消费链，不能归为仅未实机验证。 |
| 记忆列表遗漏白名单中的空档聊天 | R-71 | 真实隔离 HTTP：白名单有聊天但尚无记忆文件时列表返回空，无法从列表进入该聊天创建记忆。`src/console/routes.js:916` 仅列已有文件，没有补白名单条目。 |
| 部分搜索及能力消费契约缺失 | SPEC §8 / DSH-ARCH §5.1 | 自定义源强制要求 Key、改变自定义端点路径、丢弃 references 结果，均已离线复现，当前实现见 `bundled/web-tools/service.js:96–119`；`web.fetch`、`message.inline-at-normalize` 仍缺生产消费点。图搜只有 Bing，尚未实现规定的百度优先回退。本轮只增加可替换 web.search，没有关闭这些搜索契约。 |
| 其他控制台功能仍未闭合 | F-205 / F-206 / F-141 | 控制台令牌管理未实现；视觉徽标开关仅保存而无模型展示消费者；聊天分页已有 500+200 按钮，缺少规定的滚动追加行为。主题、布局和权限隔离的已接受改动不计入此项。 |

### 验收证据的边界

- 本轮插件化定向验收：84/85/89 实际公共 SDK；86 为 18/18、87 真实 kernel 为 8/8、88 真实 kernel 回调边界为 5/5；80 实际 Chromium 验证提供者选择、协作链、未授权服务恢复及原八面板流程。相关旧测试 25（73/73）、42（14/14）、57、61、65 已适配新所有权并保留行为断言。最终源码 `npm test` 返回 0，M3 61/61 个测试文件、M4 10/10；最终 headless 冒烟 12/12、`git diff --check` 返回 0。日志为系统临时目录的 `qq-agent-pluginization-acceptance-final.log` 和 `qq-agent-pluginization-acceptance-smoke.log`。
- 默认 host binding 仅供实际 bundled 域中具名默认插件的明确 facet/method；用户不能靠清单声明提权。Node import 的信任模型仍是管理员认可插件代码，不是原生模块沙箱；公共 API 的权限、指纹及取消边界已经单独验收。
- 本轮已有 `npm test` 返回 0 的记录：M3 55/55 个测试文件、M4 10/10；冒烟 12/12。Chromium 保存链与 ffmpeg/ffprobe 是实际运行。这些结果仍有效，覆盖不足处如上列出。
- Electron 壳和进程适配器的 M4 测试使用 BrowserWindow/spawn/网络探测替身；尚不能证明实际 Windows 托盘、自启、多 PROFILE、验证码、安装升级及真实 QQ 收发全部通过。
- DSH-ARCH §13 明确要求真实群 @唤醒回复、真实 0.4 数据迁移、覆盖升级数据完好且免扫码、三种启动方式、10 个真实市场插件及发布端切换。当前缺少完整实机验收记录，不能以离线夹具替代。
- 现有 `dist/QQ Agent Setup 0.5.0.exe` 是 2026-10-05 的产物。打包 kernel 与当前 kernel 的 SHA256 不同，包内缺少本轮新增 media.js、usage-days.js、provider-catalog.js 和 settings/spec-editors.js。
- 系统提示整体覆盖的规则存在文档冲突：SPEC §5 要求安全/工具协议也失效，notes06b 要求保留；当前实现选择保留。该项需要先统一有效要求，没有计为已确认的行为故障。“配置模型后自动处理积压”亦需补执行复验，当前缺少证据。

整改顺序：先修实际请求/发送/清除密钥及网页安全边界，再补 SDK 与兼容/插件化边界、迁移和 QQ 安装流程、剩余 UI；最后重新构建，并执行规格明确要求的实机验收。任何“全规格完成”结论都应以这些缺口关闭及验收证据补齐为前提。

## 2026-10-05 收口状态（后面的 10-04 草案仅供历史追溯）

- 清单 `legacyTrusted` **不再采用**。清单只能声明 scope，不能替管理员授权，也不会升为 bundled 级。
- 管理员在「技能 / 插件 → 宿主授权」确认；决定保存到独立 `plugin-authorizations.json`，绑定当前目录与全部文件的结构化 SHA256 指纹。
- 旧插件 setup 网络请求也经过异步 ask / 一次授权 / 持久授权。拒绝、撤销、代码更新、卸载与关机都 fail-closed；更新代码（version 不变也一样）需要重新授权。
- Node 动态 import **不是代码执行沙箱**，请只加载可信插件；scope 仅约束宿主 API，不保证拦住插件直接 import 原生模块。
- 用户面板清单 entry 改为相对插件 **`ui/` 专用资产目录**，不公开源码或配置目录。资源 URL 和调用绑定面板 id / 真实 owner / 加载代际，active + ui.panel 授权才能访问。
- `ctx.call` 只能调用本插件的最终工具 id，复用可用性、参数与 scope 管线；`ctx.getConfig` 只读自身 schema，按名称和 schema secret/sensitive 标记递归脱敏。
- 用户 iframe 不接收全局 SSE 日志/聊天/权限，不拿 shell token；启停/撤销/热重载使旧面板立即失效。
- ESM 相对子模块不能只靠入口 query 热更新：**依赖/资产内容变化明确要求进程重启**。拒绝让旧子模块按新版磁盘指纹继承授权；单入口更新仍支持。
- 验收：M0–M3 全回归（含 34/53 两组真实 Chromium）25/25，M4 10/10，headless 12/12。50/51/52 增加身份/撤销/指纹绕过/代际/SSE 行为断言。

## 一、改前端页面 —— 面板运行时注册（10-04 初版草案）

### 现状卡点

- `ui/shell/app.js:17-21`：读**静态** `ui/panels/manifest.json`，逐个 `registry.register(panel)`
- `ui/panels/manifest.json`：8 个面板全写死，8 个 `style.css` **均为 0 字节**
- `PanelRegistry` 实例是壳层局部变量，插件拿不到；`plugin-loader.js` 也没有任何面板相关注册面

结论：面板协议（sandbox + JSON-RPC + API 白名单）设计正确，但**插件无法贡献页签**，加页签必须改 `app.js` + 手改 manifest.json。

### 实现方案

**Step1 — 后端聚合接口**

新增 `src/console/panel-adapters.js`，暴露 `GET /api/panels`：

```
返回 = bundled 静态清单（ui/panels/manifest.json）
     + 所有 active 插件 skill.json 里声明的 panels[]
```

`skill.json` 新增可选字段（沿用现有 manifest 规范化流程 `normalizeManifest()`）：

```json
{
  "id": "my-plugin",
  "panels": [{
    "id": "my_panel",
    "title": "我的面板",
    "entry": "panel.html",
    "permissions": ["ui.panel"],
    "api": [{ "method": "GET", "path": "/api/my-plugin/stats" }]
  }]
}
```

**Step 2 — 校验规则复用（关键）**

把 `ui/shell/panel-registry.js` 的 `normalize()` 逻辑**镜像到服务端** `panel-adapters.js`：
- `ID = /^[A-Za-z0-9_-]{1,64}$/`
- `VALID_KINDS = {bundled, user}`
- `VALID_METHODS = {GET,POST,PUT,DELETE,PATCH}`
- `SAFE_PATH = /^\/api(?:\/[A-Za-z0-9._~-]+|\/:id|\/:key|\/:uid)*$/`
- `entry` 禁 `..`、禁绝对路径、必须 `.html` 结尾
- `kind==='user'` 必须含 `ui.panel` 权限

> 服务端校验是必须的：manifest.json 是可信静态文件，但插件清单是**用户输入**。
> 建议把这段规则抽成共享模块 `src/kernel/panel-spec.js`，壳层 import 同一个文件，避免双份实现漂移。

**Step 3 — 静态目录落盘**

`http.js` 的 `serveStatic()` 目前只服务 `ui/`。需扩展为「bundled 面板从 `ui/panels/` 出，用户面板从 `data/plugins/<id>/` 出」。
**安全要点**：路径拼接后必须 `safeJoinStatic()` 二次校验，防`../` 穿越（现有 `test/09-http-test.mjs` 与 `31-m3-http-security-test.mjs` 已有静态穿越用例，需补用户插件目录的用例）。

**Step 4 — 壳层改一行**

`app.js:17` 的 `fetch('/panels/manifest.json')` → `fetch('/api/panels')`（经ApiClient 带 token）。
`panel-registry.js` 的 `normalize()` 保留为**第二道防线**（壳端不信任服务端返回）。

**Step 5 — 面板的 HTTP 路由由插件自己注册**

面板调`/api/my-plugin/stats`，这条路由得存在。两个做法：
- **A（推荐）**：插件通过 `ctx.registerCapability` 注册能力，console 层加一类 `transport.http` 能力让插件贡献路由
- **B（简单）**：先只为bundled 面板提供路由，用户面板暂时只能用现有 68 条内置路由

> 建议先做 B 验证链路，A 作为后续增强。B 改动≈0，A 要动`routes.js` 的注册模型。

### 验收

- 新测试 `test/48-panel-registry-runtime-test.mjs`：用户插件声明面板 → `/api/panels` 出现 → 未授权路径被拒 → 重复 id 被拒
- 真实 Chromium E2E 扩展一条：动态加载一个用户面板并交互

### 工作量

| 项 | 行数 |
|---|---|
| `src/kernel/panel-spec.js`（共享校验） | ~50 |
| `src/console/panel-adapters.js` | ~80 |
| `http.js` serveStatic 扩展 | ~20 |
| `app.js` 改fetch | 1 |
| 测试 | ~150 |

---

## 二、跑 0.4 老插件 —— 权限降级映射

### 现状卡点

**不是 API 缺失**。`bundled/compat-04/index.js` 已映射 v0.4 `createSkillApi` 的 13 个方法：`registerTool` / `config` / `isSkillActive` / `capability` / `hasCapability` / `log` / `warn` / `error` / `fetch` / `utils.sleep` / `utils.safeJsonParse`。

真正的断层是**权限模型**：

| | v0.4 | v0.5 |
|---|---|---|
| 声明形式 | 扁平字符串数组 `["web_fetch"]` | 11 个 scope + 三层策略 |
| 判定 | `permissions.includes('web_fetch')` | bundled/user 分级 + 运行时 ask |
| 默认值 | 有声明才给 fetch | bundled=allow，user=ask |

`compat-04/index.js:11` 只映射了 `web_fetch → net.outbound`，其余全无。老插件声明了 `scheduler` 或想读自己 kv.json 就会失败。

### 实现方案

**Step 1 — 权限映射表**

在 `compat-04` 加降级映射，v0.4 声明 → v0.5 scope：

| v0.4 声明 | v0.5 scope | 降级策略 |
|---|---|---|
| `web_fetch` | `net.outbound` | ✅ 已实现 |
| （隐式 kv 读写） | `fs.namespace` | 新增，限自身命名空间 |
| （无对应） | `scheduler` | 新增，但**仅 bundled 级** |
| `proc.exec` | — | **不映射**，`net.raw`/`proc.exec` 永不放行 |

**Step 2 — 老插件的权限等级决策（关键）**

两条路：

- **方案 A：老插件一律 user 级**。安全，但 `ui.panel` / `scheduler` 要走ask，老插件在 headless 下直接不可用
- **方案 B：清单里标 `legacyTrusted: true` 的走 bundled 级** ✅推荐

理由：`compat-04` 本身就是用户从社区市场装来的插件，v0.4 时代根本没有权限系统。默认给bundled 级等于**用新架构给旧代码开后门**——但反过来说，`net.raw` / `proc.exec` / `mcp.connect` 这些高危 scope 在 v0.5 里对 bundled 也是 deny 或白名单，所以最坏情况可控。

建议：`legacyTrusted` 默认 false，在 UI 上让用户**显式勾选信任**才升级到 bundled 级。这是唯一需要你拍板的产品决策。

**Step 3 — 迁移文档**

写 `doc/extend_development/migrate-04-skill.md`，列出 v0.4 API → v0.5 能力的完整对照表 + 不兼容项清单。
v0.4 已有 9 篇开发文档（4722 行），但 v0.5 的 `docs/` 只有 3 篇（system_design + 2 个 mermaid），**文档本身就是缺口**。

### 验收

- `test/43-compat-04-test.mjs` 扩展：老插件声明 scheduler/fs 后能否拿到能力
- 用真实 v0.4 插件做回归（社区市场那 800 个贡献方法就是现成样本）

### 工作量

| 项 | 行数 |
|---|---|
| 权限映射表 + 降级逻辑 | ~60 |
| 迁移文档 | ~300 |
| 测试 | ~80 |

---

## 三、换协议端 —— transport 能力化 ★仍需先做

> **范围（2026-10-04 修订）**：本节**只解决「换协议端」**：连接不同的 OneBot 实现，并核对接口支持情况。
> 这是同协议不同实现，provider 抽象可覆盖绝大部分，改 3 处内核即可。
> **不解决跨平台接入**——该目标已删除，理由见附录。
> transport 解耦本身仍值得做：内核不再静态依赖 OneBot 实现，对测试注入、协议端更换都有直接价值。

### 现状卡点（三个硬编码）

**好消息**：`src/transports/onebot/provider.js` 的抽象**已经选对了**：

```js
{
  id, client, selfId,
  start(), stop(),
  toPlatformSegments(segments),          // 归一化段 → 平台段
  send(chatKey, segments, {replyToMessageId}),
  actions: { poke, recall, getChatInfo, getMembers, getForward },
  segmentSupport: { text, at, image, face, record, video, reply, json, forward, poke },
}
```

QQ 差异（`group_id` / `user_id` / CQ 转义 / `send_group_msg` vs `send_private_msg`）**全关在 provider 内部**。抽象层选对了，只是没接上。

真正的硬编码有三处：

| # | 位置 | 问题 |
|---|---|---|
| 1 | `kernel.js:22` `import { createOneBotProvider }` | 静态 import；`createKernel({env, headless})` 无注入位 |
| 2 | `orchestrator.js:172` `await onebot?.call('get_group_member_info', {group_id, user_id, no_cache})` | **QQ 专属 API 写在调度器里**，拿成员禁言状态 |
| 3 | `routes.js:543` `kind==='group' ? 'send_group_msg' : 'send_private_msg'` | 控制台路由直接拼 OneBot action |

另：`bus.js:11,23` 白名单里有 `onebot.status` 等平台专属事件名。

### 实现方案（已落地 2026-10-04 / 10-05）

> 原方案是"把 transport 注册为 5 个 capability"，**实际实现改用更轻的做法**：
> transport 本来就是内核的一等依赖（`createSendQueue({transport})`、orchestrator 直接收 transport），
> 再包一层 capability 只是多一层间接。改为**补齐 transport 对象契约 + 开放工厂注入**。

**Step 1 — `createKernel` 开放工厂注入**

```js
createKernel({ env, headless, transport, transportFactory })
// transport：现成 provider 对象（存量兼容，bind() 可选）
// transportFactory：({cfg, log, onEvent, onStatus}) => provider —— 内核把回调交给工厂
```

provider 侧新增 `bind({onEvent, onStatus})`，让**现成注入对象也能接上入站回调**。

**Step 2 — 入站与生命周期闭环**

- 内核维护 `transportStatusSnapshot`，provider 回调即更新，并双广播 `transport.status` + `onebot.status`
- `selfId` 从 status 同步（不再只认 OneBot client 字段）
- `transportStopped` 闸门：`stop()` 后 provider 的迟到事件直接丢弃（microtask 前后各判一次）
- `transportRef` 可变引用：provider 构造期若同步回调，不触发 const TDZ
- 控制台 `/api/status` 优先读内核快照（`deps.transportStatus()`），回落 provider 契约

**Step 3 — orchestrator 禁言查询走归一化动作**

```js
// 改前：QQ 专属 API 写在调度器里
const res = await onebot?.call('get_group_member_info', {group_id, user_id, no_cache});

// 改后：平台无关，缺失即降级（`t*1000 > now` 的 SUSPECT 判据一并移入 provider）
const r = await transport?.actions?.getSelfMemberInfo?.(chatKey);
if (r) muted = !!r.muted;   // null/undefined = 平台无法判定 → 按未禁言处理
```

**Step 4 — console 路由不再拼 action**

- 群/好友/成员/群名 → `transportAction(transport, name)`，**能力缺失返回 501 + 人话文案**（不伪装成功）
- test-send → `transport.send(chatKey, segments)`，不再拼 `send_group_msg` / `send_private_msg`
- 媒体图片解析 → `transport.actions.getImage`（新增归一化动作）

**Step 5 — 收回原始 action 逃逸**

`bundled/query-tools` 与 `memory-media-adapters` 原来直调 `K.onebot.client.call(...)`。
现改为只消费 `actions.getForward` / `actions.getImage`，**能力缺失即明确报错**（不再静默回落 client.call）。
`kernelDeps.onebot` 兼容别名随之移除（仅顶层 `kernel.onebot` 保留并标 `@deprecated`）。

**Step 6 — bus 事件名**

新增 `transport.status`，`onebot.status` 保留兼容双广播。

**Step 7 — chatKey 命名空间**

`parseChatKey` 三段式兼容本已就绪；`makeChatKey` 加可选 `platform`（全库零调用点，改动零风险），
`store.js` 的 `FILE_RE` 放宽为可选平台前缀 + `chatKeyFromFile` 反解，**存量数据零迁移**。

### 验收（实测）

- `test/49-transport-inject-test.mjs`：**53 断言**。用 `clientFactory` 缝做真实行为验证
  （不再是"方法存在"式探针）：入站事件归一化、getForward / getImage / getSelfMemberInfo 的
  **实际请求参数与判据**、transportFactory 收到 callbacks、真实 `createKernel().start()` 装配后
  入站消息落 store、控制台 status DTO 反映 provider 状态、停机后迟到事件被忽略、
- 回归：smoke 12/12、run-m1 12/12，以及 09 / 19 / 25 / 28 / 31×2 / 35 / 36 / 39 / 40 / 43 / 44 /
  46 / 50 / 51 / m4-shell 逐个全绿
- 35 号测试的 onebot mock 随契约升级为 `actions.getImage`；其 `client.call` 改为"不应被调用"，
  从测试侧防止有人日后把直调action 加回来

### 工作量

| 项 | 行数 |
|---|---|
| `transport-caps.js`（能力注册） | ~80 |
| `kernel.js` 注入位 | ~15 |
| `orchestrator.js:172` + `routes.js` 三处 | ~40 |
| mock transport（测试用） | ~120 |
| 测试 | ~300 |

**⚠️ 注意**：以上工作量**只覆盖「换协议端」**。跨平台接入的目标已删除（见附录），本文档不再为其提供方案。

---

## 附录：为什么删除「换平台」目标（决策依据，2026-10-04）

> 本附录保留，供决策追溯。**不再是待实施方案。**

当时的判断：**抽象事件总线只能统一「消息怎么进、怎么出」，换平台和重写难度一致。** 核实后成立，且证据比预想更硬。

平台语义渗进了三层**非适配器**模块：

### 层 1：人格层（prompt.js，最重）— 约 250 行

`prompt.js` 308 行里出现 19 处「群」，且都不是可参数化的通用规则：

| 行号 | 内容 | 为什么换不了 |
|---|---|---|
| 11 | 群友没有管理权限，要求「禁言/踢人/改群名片」一律拒绝 | 依赖 QQ 群管理员体系 |
| 55-57 | 「群聊不是客服队列」/「混在群里」/「不要逐条点评」 | 群聊语感本身 |
| 67-69 | 「不要当群管家」「你只是群友之一，不是主持人」 | 角色设定 |
| 106-107 | 「QQ 场景规则」「Markdown 在 QQ 上会显示成乱码」 | **QQ 渲染行为**，微信完全不同 |
| 22,120 | 「不会发送到 QQ」「不要输出 message_id xxx」 | 平台词汇 |

这些是**人设长在 QQ 语境里**，不是适配器能解决的。换微信要重写一整套语感规则。

### 层 2：数据层（store.js）— 约 120 行

`store.js:72` 注释写明「QQ 消息 id（**可为负数**）」——这是 OneBot 的历史包袱（v0.4 有专门的 `message-id-test.mjs` 回归负数 id）。

`findByMid()` / `markRecalled()` / `updateByMid()` 三个方法**全部靠 mid 匹配**，承担撤回、合并转发幂等更新等语义。换平台若用字符串 id，这三个方法连同调用点都要重写。

`memory.js:13` 用 `/^\d+$/` 判断 QQ 号，非数字 id 走 `u_<sanitize>` 兜底——已经兼容了一部分，但文件名格式会变。

### 层 3：语义层（ingest / orchestrator）— 约 100 行+

- `ingest.js:90`：优先读 `sender.card`（**群名片**，QQ 独有）再读 `nickname`
- `orchestrator:172`：`get_group_member_info` 拿禁言状态——**QQ 禁言 ≠ 微信群禁言**，语义都不对应，退群/撤回/限制发言三平台各不同
- `transport.js` 的 `kind: 'group' | 'private'` 二元模型假设了「只有群和私聊」，Discord 有 thread、Telegram 有 channel/supergroup、飞书有话题

### 成本估算

| 层 | 行数 | 可复用度 |
|---|---|---|
| 适配层（provider） | ~150 | 90% 可复用 |
| 人格层（prompt） | ~250 | 20%，需重写 |
| 数据层（幂等/存档） | ~120 | 40%，需改造 |
| 语义层（成员/权限） | ~100+ | 30%，需重建 |
| **唤醒档位调参** | 不可估 | **无历史可参考，只能实测** |

**适配层只占约 20%。**

最后一项最关键：`wake.js` 的四档响应概率、`send.js` 的限频参数（`minGapMs`/`maxPerMinute`/`hardSplitAt`）、`prompt.js` 的上下文档位——这些数值是**在 QQ 上用 2,256 个安装实例 / 47 亿 token 调出来的**。换平台等于**从头开始调参，且没有先验可参考**。这是 v0.4 README 自述的核心卖点（"事件驱动 + 无状态会话→ 成本恒定可控"）的护城河，换平台就归零。

### 决策

**删除「换平台」目标，qq-agent 定位为 QQ 专用机器人。**

保留的 transport 解耦仍然做，但价值锚点改为「换协议端」——内核不静态依赖 OneBot 实现，对测试注入与协议端更换有直接价值，且是「内核只是缝」这一理念的完整兑现。

省下的精力投向当前真正的短板：**补前端（451 行 vs v0.4 的 13,432 行）与生态（社区市场/价格表/人设库/setup 脚本链全缺）**。

---

## 执行顺序建议

```
1. transport 能力化← 必须最先，不做这个后面全要返工
        ↓
2. 面板运行时注册     ← 改动最小，立刻能让「插件化」看得见
        ↓
3. compat-04 权限映射  ← 有 legacyTrusted 决策要先拍板
        ↓
4. 补前端 + 迁 v0.4 生态（纯体力活，compat-04 已铺路）
```

**共同前置**：M4/M5 的真实运行时验收（Electron GUI / 外部协议连接 / Windows 安装）不能继续拖。transport 改造会让内核改动面变大，届时用 mock 验收的返工成本更高。

---

## 需要你拍板的三个决策

1. **`legacyTrusted`**：老插件默认 user 级（安全但 ask 多），还是清单显式标记才给 bundled 级？
2. **用户面板路由**：先走「只支持 bundled 面板调内置路由」（省事），还是同期做「插件贡献路由」的能力？
3. ~~chatKey 是否升三段式~~ —— **已核实无需此决策**：`parseChatKey` 已兼容三段式且两段式自动补 `platform:'qq'`，存量数据零迁移。只需给 `makeChatKey` 加可选 `platform` 参数。
