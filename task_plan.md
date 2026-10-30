# task_plan.md — QQ Agent 0.5 Preview 完整功能交付（规格书逐条落地）

> 范围更新（2026-10-23）：专属协议端与便携客户端的安装、启动和登录态迁移已从项目范围移除。本文保留其余历史记录；旧编号、测试数量与结果只对应当时范围，不代表当前版本已经完成验收。当前外部协议端由用户自行管理。

> **2026-10-16 最新用户裁决**：前端、后端、核心业务及绝大多数基础实现均是默认项，管理员应能靠追加文件替换；社区追加层部分重叠时须逐目标组合并验证稳定性。以 `docs/architecture-composition.md` v2.1 为追加式架构合同。下文历史“保留 core 不算缺口”“规格只读”等说法不再限制本轮改造；真实账号、打包和部署仍不属于此次本地回归范围。

本轮交付与验证详情见 `docs/composition-regression-evidence.md`；启动组合示例位于 `examples/composition/`。既有运行时插件热更新与新增启动组合分开管理：有状态核心更换在新进程代生效。

2026-10-16 基础组合验收：52 个默认组件、页面/共享资产/外壳替换、后端控制器作用域与核心真实消费链已接入；相邻规格书已同步并保留原件。当时完整回归 M3 143/143 文件、M4 10/10 文件，冒烟 12/12，独立有头 Edge 验证通过。本轮重叠贡献的最新结果另见 `docs/composition-overlap-evidence.md`，不得以旧基线代替；已安装第三方扩展或真实账号联调不因这些结果被自动认定通过。

2026-10-16 部分重叠验收完成：逐目标 replace/wrap、版本兼容、UI根与单文件层次裁决、独立路由资源清理及只读来源诊断已落实。176–179覆盖48种组件排列/子集、9代UI、6种路由移除顺序及6代真实核心消费。最终完整回归退出0：M3 147/147文件、M4 10/10文件；冒烟12/12；最终有头177通过。前两轮的136/90测试夹具竞态及修订均保留证据，未减少业务断言。规格v2.1同步，未打包或部署。

> 当前任务（2026-10-06）：用户要求以 `dsh-spec/SPEC.md` 为唯一事实源，把 0.5 Preview 的规格要求完整实现；已有地基测试不能替代逐条功能验收。

> 事实来源：`<user-home>/Desktop\qq-agent\dsh-spec\`（SPEC.md + DSH-ARCH.md + notes/×11）。
> 2026-10-14 用户补充授权：允许参考 `<user-home>/Desktop\qq-agent\develop` 补齐功能，覆盖下方历史“禁读 develop”限制。规格与已接受的插件化设计仍决定最终行为；旧目录仅作源码参考，不修改该目录或读取其中的真实数据、密钥和登录态。
> 铁律：L1 规格书唯一事实源（禁读 develop/，写不清→问用户）；L2 架构按 DSH；L3 每阶段实跑验证。
> **用户终极指令（2026-09-30，2026-10-04 修订）**：完成整个 0.5 到"可长时间日常使用不做改动且功能完善"；
> 插件化理念贯穿一切——**内核只是缝 + 一堆默认项**，追加文件即可改前端/加功能/换核心/
> 换协议端（NapCat）。没有任何东西是写死的。
>
> **2026-10-04 决策：删除「换平台（微信）」目标。**
> 理由（经代码核实，见 `docs/gap-closure-design.md` 附录「为什么删除换平台目标」）：
> 适配层仅占约 20% 成本，平台语义渗进 prompt 人格（308 行含 19 处「群」）、存档幂等
> （`store.js` 三个方法全靠 QQ 的 mid 匹配）、成员模型（群名片/禁言语义）三层非适配器模块；
> 且四档概率与限频参数是 2,256 实例/47 亿 token 调出来的，换平台需从头调参且无先验。
> **qq-agent 定位为 QQ 专用机器人。** 保留「换协议端」——同协议不同实现，适配器可覆盖 90%。

## 当前执行状态（2026-10-11：专注插件化）

本轮按用户明确选择处理公共 SDK、默认业务归属和追加插件替换协议端；没有把其余规格缺口、历史待办或实机验收自动标成完成。详细边界见 `docs/plugin-sdk.md`，已确认的其它行为缺口继续保留在 `docs/gap-closure-design.md`。

- [x] 既有 bundled 工具入口改为 `ctx.capability`，移除 ctx.kernel；默认业务由 transport-onebot/media-service/memory-service/web-tools/market/community/telemetry/reminders/llm-dialects 等插件注册。
- [x] 公共配置、HTTP、发送、数据和 MCP facade 按实际 bundled 域、具名默认 ID、facet/method 或用户 scope 约束；工具和面板不获得原始 kernel/loader/registry/permissions/bus。
- [x] 服务宿主管理授权、工厂、start/stop 的取消及代际，同对象重新注册也撤销旧实例；停止错误保留并在 stop 汇总。
- [x] MCP 默认进程实现由 mcp-bridge 拥有，setup 只注册；mcp.service 激活后启动，每次恢复建立新桥，旧结果不干扰新工具或子进程。
- [x] 控制台技能/插件页新增服务提供者选择；80 实际 Chromium 验证指定/自动回退、刷新草稿、失败和真实配置保存，以及协作链与未授权服务恢复。
- [x] 84/85/86/87/88/89 提供真实 loader、SDK、服务宿主及 kernel 验证；86 为 18/18、87 为 8/8、88 为 5/5；旧测试夹具迁到公开接口，保留业务与停止失败断言。
- [x] hook/prompt/provider 输入和事件出口边界定向复核；多提供者保留声明顺序，managed 服务展示真实运行/错误状态。
- [x] 最终完整 `npm test` 返回 0：M3 61/61 个测试文件、M4 10/10；最终 `npm run smoke` 12/12，`git diff --check` 返回 0。涵盖末次回调、服务就绪及提供者选择改动。
- [ ] 按新源码重建安装包并完成既有规格要求的实机验收；当前未宣称新应用已经安装或发布。

上述为 2026-10-11 的历史边界，已由 2026-10-16 的追加式组合 v2 取代：数据仓、状态机、配置、发送排队和统计等均须提供实际替换入口。公共 API 权限闸不是原生 Node 模块沙箱，原生启动组合与程序源码具有相同信任等级。

## 历史执行断点（2026-10-06 下午）

- [ ] 控制台设置：首次配置密钥、渠道/模型、人设、四档滑条、白名单、工具、搜索、安全、桌面设置；保存只提交用户改动，轮询不能覆盖正在编辑的表单。
- [ ] 技能/插件管理：两页按 kind 分流并提供设置/安装/停用/删除/热更新；修复安装器解压落点和已存在目录误删风险。
- [ ] 真热更新：入口 query 不会自动传播到相对 import；以真实 helper 子模块更新测试作为验收，不以源码含 ns= 判定完成。
- [ ] 后台生命周期：同进程实例锁不允许误抢；退出不得杀用户外置 QQ；价格/名单/遥测停止后不可再次排程，统计不得只读首次缓存。
- [ ] 用户最新要求：collect_sticker 必须 QQ 收藏与备注均确认成功才入索引；旧缓存/无能力/失败不伪装成功。
- [ ] 真实 Chromium 验收与完整回归、阶段产物；完整 Preview 仍需逐条收口，保持 task 2/3/4 未完成直到全部要求落实。

## Phases

### Phase M0 内核底座 ✅ complete（提交 6906b00，231 断言 + 12 冒烟全绿）
9 模块 + hello 插件 + 最小控制台 + headless。明细见 dsh-spec/PROGRESS.md §6。

### Phase M1 消息链路 ✅ complete（提交 3ad2a02，M0+M1 合计 548 断言+12 冒烟全绿）
- [ ] transport 归一化（chatKey/segments/msg，DSH §6.1）
- [ ] onebot client（WS+HTTP/退避 3s→30s/代际互斥/SLOW_ACTION 90s/15s/426 文案）
- [ ] ingest（准入三闸/CQ 清洗/@ 三态/U-03 禁言标记/拍一拍）
- [ ] wake（四档累积/私聊恒响应/防抖不重置）
- [ ] store（messages 仓，0.4 存量兼容）
- [ ] orchestrator（状态机/drain/重试五 409/R-08 已发不重试/并发满重排）
- [ ] prompt（§6.6 分层组装）+ llm（候选/重试分类/abort）
- [ ] send 队列（限频/去重 R-02/真人停顿/hardSplitAt/toFileUri R-13）
- [ ] agent-runner（maxRounds/媒体 parts R-19/催发）+ memory + sessions
- [ ] onebot provider（事件分派）+ kernel 全链装配
- [ ] e2e mock 测试：@→唤醒→回复→留档→done + 断链人话错误
- 验证终点：全绿 + git 提交

### Phase M2 数据与扩展 ✅ complete（提交 0bb3fb1，累计 796 断言 + 12 冒烟全绿）
数据仓（reminders/stickers/migrator/safe-fetch/web-search/holidays）+ 28 工具落 7 个捆绑插件。

### Phase M3 控制台全量 ✅ complete（提交 a34790c；R52 安全补丁 0686b60）
8 页签 + R-01…R-90 逐条对账 + 设置页（configSchema/脱敏/滑条）+ prompt-preview + 面板协议（iframe 沙箱——UI 插件化的落点）。

**已完成并通过最终验收：**8 个 iframe 面板、REST/SSE 全量路由、R01-R91 契约覆盖、shell token/SSE/RPC 加固；M3 已提交为 `a34790c`，当前工作树仅含后续验收记录更新。

**当前最终收口：**
- [x] R02/R03：open-data-dir + 安全 reset（路径闸、先备份、失败原子性、会话/OneBot 收束、默认配置重建）。
- [x] R23-R26：明文密钥 endpoint 独立 `keyEndpointAllowed`，而非仅通用 API 守卫。
- [x] R67/R68/R69/R86：聚合 cleared SSE、retry restored/五类冲突、waiting abort 物理删除、resume drain/skipBacklog。
- [x] 去除或迁移 `kernel.js` 中被 M3 新路由遮蔽的 legacy routes，避免注册顺序形成双重事实源。
- [x] R19/R27-R29/R35-R42/R44/R45-R63/R65-R90：真实适配器、DTO、SSE、安全边界及定向合同测试；R08-R16 通过 processAdapters 注入，真实外部进程留给 M4。
- [x] 真实 Chromium/Electron 控制台安全链路中的 Chromium 部分：8 面板 sandbox/module CORS/RPC、settings 离页 flush、fetch-SSE、token 不泄露；真实 Electron 壳行为留给 M4。
- [x] R01/R04/R05 最终 DTO 字段与生产价格 resolver 对齐（custom → official cache/feed → manual/none；完整内置官方表不在 clean-room 规格目录，未凭空编造）。
- [x] R52 ZIP 安全补丁（受限解压、声明/本地头一致性、CRC 校验）已提交 `0686b60`；定向市场回归 27/27。

验收终点：R01-R91 矩阵逐条签收 + M0-M3 全回归 + headless smoke + 真实 Chromium + `git diff --check`；上述门已通过，M3 里程碑提交为 `a34790c`。

### Phase M4 桌面壳与深水区 ✅ implementation complete; real-runtime acceptance blocked
Electron 全行为/主动话题/活跃期/峰谷四象限/锚点/记忆整理
/ask 弹卡/MCP 桥（transport 可替换性的落点——NapCat = 换协议端插件）。

**已提交：** Electron `182233c`/`27fbb56`、进程适配器 `d9c2523`、active/anchor/memory `cf5c096`、MCP/compat `8d8faf2`/`e861cc5`/`827cbd8`/`e81aa53`/`16b242d`，完整 M4 runner `9815e75`。
**剩余阻塞：** 真实 Electron 依赖/GUI、QQ/Windows 注册表/双实例、captcha 诊断 IPC 未验收；M3 Chromium 当前提交后的实跑结果需 QA 明确报告。权限 ask 三态 UI/超时/去重/停机 fail-closed 已完成 mock 门禁。M5 不得以 mock 绿灯替代真实运行时门。

### Phase M5 打包与验收 ⬜ pending
M4 实现门已完成；进入 M5 前仍需取得真实 Electron/Windows 环境并完成阻塞的运行时验收。
已增加前置配置提交 `a73da81`（Electron/electron-builder scripts、NSIS 配置、installer.nsh、ASCII 启动脚本）与锁文件同步提交 `f1ad06b`；但 `assets/icon.png` 缺失，真实依赖安装/构建/Windows 安装验收仍 BLOCKED。
NSIS/installer.nsh/version.json/compat-04 垫片（0.4 插件兼容 = "追加文件"的最终证明）

**2026-10-05 增量（不占 M5 门）**：捆绑域工具 id 撞车补可观测性——`register()` 跨owner 撞车
warn + `tool.conflict` 事件 + `collisionsInfo()` 诊断 + `GET /api/tools/conflicts` + 技能页顶部
`.conflict-note` 提示块（manifest 白名单已同步，`rpc-bridge.js:16 allowed()` 只放行声明过的路径）。
**仲裁行为未变**（仍是后注册者生效，行为等价线不动），只是不再静默。新增 54/55 两个测试文件，
run-m3 27/27。详见 `progress.md` 同日条目。

## 插件化总纲（用户钦点，贯穿所有阶段）

| 需求 | 实现方式（全部 = 追加文件） |
|---|---|
| 改前端页面 | 面板协议（M3 iframe 沙箱）+ 插件静态目录 |
| 加功能 | 捆绑/用户插件 registerTool/capability/hook |
| 改核心行为 | hook（before-llm-messages 可改消息、before-tool 可否决）+ capability 替换 |
| 0.4 老插件 | compat-04垫片翻译旧 API |

### 冲突仲裁（两个插件改同一处时）

| 场景 | 机制 | 归属 |
|---|---|---|
| 工具同名（用户插件） | id 加 `<skillId>__<toolId>` 前缀（24+38，≤64） | 物理隔离，共存 |
| 工具同名（捆绑域） | 后注册者覆盖 + warn + `collisionsInfo()` 留痕 | 后加载者（可查） |
| 能力（6 个多提供者） | 按声明顺序协作，消费方使用转换链、全体 guard 或 `claim/claimAsync`；不受 default 或管理员单选 pin 重排 | 转换依次执行、guard 全体执行、认领型由首个认领者处理 |
| 能力（其余单提供者） | `consume()` 取 `providers()[0]`；自动优先已启用的非默认实现，默认负责回退；管理员可 pin 可用 owner | 指定 owner 优先，否则同优先级按注册顺序 |
| 提示词片段 | **并置非覆盖**：核心先 push，priority `min(99)` 封顶，同分按 `__seq` | 都生效，核心恒最后 |
| hook | 串行遍历 + `before-tool` 否决权，抛错只记日志，超时 5s | 按装载顺序叠加 |

装载顺序 =目录名 `sort()`；同 owner 重复注册属于新注册代际，撤销旧服务后建立新实例。此顺序在同优先级单提供者与多提供者协商中保留；是否默认及管理员指定是单提供者选择的额外规则。

**不在目标内**：跨平台（微信等）。见文首2026-10-04 决策。transport provider 的解耦仍然做（为「换协议端」服务），但不承诺跨平台。

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| ESM 热重载同路径拿旧模块 | 1 | import URL 加 ?v=<mtime> |
| undici fetch 改不了 Host 头 | 1 | 测试用原始 http.request |
| Windows 子进程收不到真 SIGINT | 1 | 优雅退出走同进程 stop() 验证 |

## 2026-10-16 新活动目标：全面复查0.4并择优迁移（未完成）

完整范围及逐项判定规则见[0.4功能迁移计划](docs/v04-parity-plan.md)，不以历史M3实现完成或当前几个增量代替本目标。0.4只读源码，未读取其data/凭据；生成72份源码/895个候选锚点索引，候选不等于原子功能数。

首批落地模型目录持久化/元数据保持/显示名/筛选/逐项移除与可逆折叠组件；继续遵守默认实现可通过追加UI文件、默认控制器及组合层替换。184/185有头和无头通过，相关定向回归已过（137的测试DOM接口曾缺失，已补齐并保留全部原断言）。全面语义核对、远端勾选导入、分渠道模型选择/专用模型配置及其他领域仍未结束。

首批冻结完整回归正在`.qa-local/v04-parity-20261016`执行，exec session1754；先轮询同一活句柄或查对应result.json，不能因观察超时另起一轮。当前源码/测试422份，期间不要修改生产或测试文件。真实状态优先于本段文字；后续恢复先检查终态。未同步或重启现有15967控制台，未打包、未操作真实QQ。

2026-10-16续记：首批session1754已正常终止，M3 153/153、M4 10/10，422散列一致；固定证据`batch1-final-evidence.json`。第二批完成模型勾选导入/分渠道与专用选择、默认llm.target、当前渠道密钥UI及凭据来源隔离，186/187/189有头和无头、188真实生产组合/HTTP通过。详情与尚未闭合项见[模型迁移记录](docs/model-catalog-migration.md)。

**最新活任务**：第二批冻结完整回归`.qa-local/v04-parity-20261016/full-2026-10-16T06-49-59-598Z`，exec session34018，431份源码/测试，预计M3 157文件但须以实际终态为准。修改生产/测试前先确认此任务终态；持续等待同一handle，不重复启动。下一批优先修复既有编辑渠道的整数组覆盖及元数据/Key分次写入，然后继续全部领域对照。当前15967仍未同步。将来同步时，新默认visionProvider/videoProvider可能补齐配置，需按备份做语义核对，不能机械套用旧217文件/配置逐字节门槛。

**2026-10-16更新（覆盖上段活任务指针）**：34018已终止M3 156/157、M4 10/10，431散列一致；89补齐显式合成模型端点后通过。渠道编辑事务已实现：默认独立provider-editor UI、按ID/实际字段提交、同字段及凭据冲突检测、单次config.update、目录/邻居/元数据保留、关闭防迟到写入。190实际UI/磁盘故障/追加替换验证有头与无头通过，第三批13文件14次定向全过。第三批首轮exec35025已终止M3 157/158、M4 10/10、434散列一致；117适配其等待的新保存接口后原断言全部通过（70483已终止exit0）。详见progress及模型迁移记录。

**当前唯一完整回归活句柄：exec11902**，目录`.qa-local/v04-parity-20261016/full-2026-10-16T07-24-46-804Z`，434份冻结源码/测试。先轮询同一handle/核对result终态，不能因观察超时重启或期间改源码。下一步列表调宽（沙箱偏好、窄屏与键盘）、聊天扫选监听器去重/cancel清理、记忆按需ticker；继续所有领域逐原子对账，不将新文档设计标成实现。当前15967未同步，未操作真实账号或部署；保留完整历史失败，不称本目标完成。

**2026-10-16第四批更新（覆盖上段指针）**：11902已exit0，M3 158/158、M4 10/10，434散列一致。随后实现列表宽度默认模块/受限单字段API、三页共享/窄屏/键盘/失败重试，扫选一次委托与取消清理、记忆按需ticker；191/192有头和无头、193与相关70/100/121/123/169/180等11文件13次定向全过，详见progress及docs/list-layout-migration.md。草稿已提升为正式文件，不要重跑wire-layout.mjs或重复复制。

**当前唯一完整回归活句柄：exec35943**，目录`.qa-local/v04-parity-20261016/full-2026-10-16T07-42-09-959Z`，441份源码/测试，预计M3 161文件，须以终态为准。源码冻结期间只读审查、可写文档/QA证据，不编辑生产/测试。先轮询同一handle，不能因观察超时重启。下一步继续完整设置折叠的后台/重绘真实验证、会话空闲ticker及其它领域原子核对；新发现启动更新通知的web/desktop差异和DIY创作引导也要追踪。15967仍未同步，目标仍active。

**2026-10-16第五批更新（覆盖上段指针）**：35943已终止M3 159/161、M4 10/10，441散列一致。111/115因新增全局list CSS失败，生产入口已限制在三个列表面板，旧测试未放宽并恢复通过。创作引导已按0.5 SDK/启动组合边界迁入三个入口，默认UI文件追加替换验证通过；9不同文件10次定向全过，package清单补齐文档/只读预检脚本后194再过。详情见progress及docs/extension-authoring.md，wire-authoring.mjs已执行不要重复。

**当前唯一完整回归活句柄：exec25796**，目录`.qa-local/v04-parity-20261016/full-2026-10-16T08-01-23-199Z`，445份冻结源码/测试，预计M3 162文件。先轮询同一handle/读取result终态，运行中不得改生产/测试，不因观察超时重启。下一批优先旧多口令安装UI：旧openInstallCodeModal是分享口令而非源码执行，当前0.5缺多行/稳定行身份/批量部分失败与取消交互；复用现有宿主验证/安装，默认停用和授权边界不变。会话ticker、完整折叠重绘/后台、web更新通知与所有其它领域仍继续。15967未同步；不打包、部署或操作真实业务，完整目标仍active。

**2026-10-16第六批更新（覆盖上段指针）**：25796已exit1，M3 160/162、M4 10/10，445散列一致；143/154为手动导入夹具少新增依赖，补注入和方向断言后原测试全过。多口令UI已按稳定ID、去重、代际、部分失败/显式重试、顺序安装/停止未发出项实现；195真实默认市场/生产ZIP/磁盘与强制停用及未执行标记，有头/无头与追加状态机验证通过；196原子时序过。10不同文件11次定向全绿，见progress和docs/batch-code-install-migration.md。wire-code-installer.mjs已执行、QA drafts比正式文件旧，不要重跑或覆盖。

**当前唯一完整回归活句柄：exec90799**，目录`.qa-local/v04-parity-20261016/full-2026-10-16T08-55-04-865Z`，449份冻结源码/测试，预计M3 164文件须以终态为准。先核对同一handle/result，运行中不得改生产/测试，不因观察超时重启。下一步继续会话等待ticker、设置折叠的重绘/后台真实验证、启动/更新通知和剩余所有领域逐原子对账；不能因增量通过完成总目标。15967未同步，测试数据仅独立临时副本，未打包或远程部署。

**2026-10-16第七批更新（覆盖旧活任务指针）**：90799已真实exit0，M3 164/164、M4 10/10，449散列一致。会话独立activity默认模块、逻辑折叠目标、真实后台停止/前台校正和追加替换已实现；197/198有头与无头、193/123/185/100/70共9次定向全过。新完整**exec57574**，`full-2026-10-16T09-44-11-988Z`，453份冻结源码/测试，预计166须以终态为准；期间不改源码/正式测试。

**冻结期间另发现并确认的必修项**：activity只观察list，因此选中详情倒计时不动。独立复现`detail-clock-before-fix.json`：列表59.6→58.6秒，详情59.6→59.6秒。修复草稿仅在QA：prepare-detail-clock-fix.mjs生成session-activity.next.js、session-panel.next.js、198-session-activity.next.mjs；引入显式detail容器并观察两个根，增强测试覆盖两处同步及过滤后详情仍计时。`test-detail-clock-draft.mjs`只写临时fixture私有源码副本并运行增强198，exit0。**尚未提升生产**，必须先确认57574终态，然后核对草稿锚点/正式文件，提升三文件并有头/无头及相关回归，再重新冻结全量。不能把当前全量即使通过当作此遗漏已经修好。

继续范围：版本检查浏览器/桌面一致性、可关闭提示/提醒/安全外链，以及ui.refreshMs各消费者动态策略、所有其它领域。总计划已纠正旧聊天selectChat自动POST标读的错误描述：实际旧函数只GET消息，原UI删除了标读入口；后台业务自动标读另行对账，不恢复查看即消费未读的错误假设。当前15967未同步或访问，目标active，未操作真实业务、打包或部署。

**最新状态，覆盖上段未提升说明及活任务指针**：57574已exit0，M3 166/166、M4 10/10，453散列一致。随后详情时钟双根修复及198增强断言已正式合入；第二轮batch7-2026-10-16T09-56-25-384Z共9次全部通过。不要再次运行QA草稿提升覆盖生产。当前唯一完整回归活句柄**exec13147**，目录`full-2026-10-16T09-58-03-831Z`，453份冻结源码/测试，预计M3 166、M4 10须以终态为准。运行期间不改生产/测试，不因观察超时重启。先查同一handle/result，完成后推进更新通知、动态刷新配置和其它全部领域。当前15967未同步，目标active。

**第八批最新指针，覆盖旧活任务**：13147已真实exit0，166/166+10/10、453散列一致。更新提示迁入两个独立默认模块，前端可单文件追加替换；后台沿用runtime.priceUpdates，传入真实VERSION修正0.0.0。Electron重复直接fetch/timer已移除；宿主统一启动/小时检查、设置窄RPC/标记、失败保留和关闭抑制、安全下载、单飞及代际/销毁。199有头/无头、200/201与相关16次定向过；最终增强199有头/无头、旧34/72隔离后的原断言通过。详见progress及docs/update-notice-migration.md。wire-updates.mjs、update-auth-fixtures.mjs、complete-update-fixtures.mjs均已执行，不要重复运行。

**当前唯一完整回归活句柄exec44328**，full-2026-10-16T11-21-39-880Z，458份冻结源码/测试，预计M3 169、M4 10以终态为准。先核对同一handle/result，期间不编辑生产或测试，不因观察超时重启。继续旧/新ui.refreshMs消费者差异（不能机械让精确展示时钟读取后台）、会话事件合批、启动/全部其它领域原子对账，目标active；当前15967没有更新或访问，未打包、部署或操作真实QQ。


用量页 0.4 交互迁移（2026-10-15T10:51:55.471Z，UTC）：已读取 develop 中的旧版实现，将五指标卡、可悬停/键盘查看的柱图、时间范围切换、按天/会话/模型的整宽表格、模型展开和工具/分组明细弹窗迁入 0.5 沙箱面板。保留主题继承与声明 API；运行次数和实际模型调用分别统计，同模型按渠道拆分，历史未记渠道的总量明确未分渠道，不能据此钻取其它渠道。增量刷新保持行节点、焦点和滚动，旧异步响应与新明细失败不显示前一范围数值。163、106、80及5份相关测试通过，164最终有头回归 exit0；新163/164纳入M3，本轮未重跑完整M3/M4。主合成QA备份142份静止数据后同步191份core源码并以原离线wrapper启动100528/15967；原空数据只读15987预览也已更新并实际点击复验，未种入模拟用量。主旧进程退出已观察，退出码和最终关闭者未知；预览被exec中断exit1，旧锁由生产内核正常识别恢复，未手工删锁。配置字节保持，静止复制时数据字节一致不代表运行后所有缓存/日账原字节均不变。详见[本轮证据](.qa-local/usage-v04-20261015/final-verification.json)。不提升真实QQ、账号或外部模型验收结论，186项11/96/2/76/0/1保持；没有打包或远程部署。


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

**最新真实终态（覆盖旧活句柄）**：exec46696已exit0，M3 177/177、M4 10/10、469哈希一致；证据full-2026-10-16T15-07-58-429Z/result.json，log SHA=567ad825a778712040b4e13766272324230820d3d09495532736a3084079079d。当前无完整冻结，210–213下一批正在实现：旧工具兼容、人设稳定ID/继承、手工成员备注分步回执、媒体避免放大。各代理拥有专属文件，root负责公共接线，不重跑旧提升脚本；新完整需待所有修改停止且定向通过。现15967仍未同步，完整择优迁移目标active。

**第十一批最新唯一完整活句柄exec11807**：full-2026-10-16T15-49-17-375Z，startedAt15:49:17.444Z，478份冻结文件，预计M3 182/M4 10须真实终态。210–214五文件已纳入M3，root两条额外定向15/15及9/9，代理定向均通过；现不能用旧46696全绿覆盖本批新源。所有正式源停止，只能QA草稿/只读/文档。下一批215分会话人设、216图搜、217跨页状态、218首启导航尚未实现；完整择优迁移目标active，现15967未同步。

**第十一批已终态、当前无冻结**：exec11807 exit0，182/182+10/10、478哈希一致，结束16:04:34.487Z，log SHA=b44f73760a30a23324a2d152a3d55a1fd02d3f66821476ddb02e5669f59b8635。现正式实施215分会话、216图搜、217跨页快照/可信UI元数据；root218首启和219思考参数。QA候选不能算生产完成；新完整必须等本批停止源修改且定向通过。当前15967未同步，完整目标active。

**最新冻结指针覆盖旧记录：exec49580**，full-2026-10-16T16-48-28-917Z，490文件，预计187+10但必须读终态；当前src/bundled/ui/electron/assets/scripts/package.json/test/*.mjs禁止改。215–219已正式实现且有头/无头/真实默认调用定向均过，六份旧sessions夹具显式合成ready配置后6/6。详见progress第十二批及四份迁移文档。完整目标仍active；候选220思考方言与错误回退、关键词误拆/空名单、反馈草稿及其它领域继续只读/QA，不提前提升。15967未访问/同步，不打包/部署。

**最新真实终态覆盖49580活指针**：49580已exit1，185/187+10/10，490哈希一致，结束17:05:26.623Z，SHA50e0051f…c5a7f6。失败80真实选择刷新竞态已root修并223双模式6组及原80/143/154绿；211原样双probe未复现，连续两击动作改native dblclick并保持原断言，待复验，不能说查明原失败。当前无完整冻结，220/221/222定向已完成，224反馈草稿由motion持browser实现/测，225遥测由core纯/服务修测，startup隔离83/69/90/106/108/110/102旧夹具，root124与M3接线/公共集成。等所有源停止和定向过后再新full，不重启49580。详见progress第十三批；目标active、15967未同步、未打包部署。

**当前最新唯一完整冻结exec86353**：full-2026-10-16T18-06-32-191Z、startedAt18:06:32.257Z、501份文件，预计193+10，以实际终态为准。220–225定向全部正式收敛，35份旧测试已完成隔离并逐份实际通过；最后63/75/127默认根漏项也已处理，原业务断言保留。root helper新增callback/promise DNS双门后仅63已定向实际验证，其余最终字节由本轮full覆盖；原helper阶段通过日志不改写。181/183/182本轮再次实际exit0。所有代理只读/私有纯离线QA，不改生产/正式test或开浏览器；先读同一handle终态，不重复启动。15967仍未访问/同步，完整旧版择优迁移目标active。

## 第十四批当前权威状态（覆盖旧49580/86353活指针）

旧86353已真实终态exit1：191/193 M3、10/10 M4、501文件不变；64/119测试不匹配已经最小修正并真实2/2通过，不倒改旧完整结果。当前无完整回归进程或源码冻结。

226峰谷合法时段、227文本无损拆分/所选策略/提醒一次准备、228模型报价与窄事务、229峰谷预设与custom事务、230可选reply rescue、231表情同步与收藏均已正式接线。230独立审查实际复现两个新缺陷，已修真实无type receipt排重及来源lease持续到实际queue，正式21/21、78/59真实3文件exit0；原失败snapshot保留。root231/89/96三文件也真实exit0。M3已增加226–231六文件，下次预期199 M3+10 M4，须新完整终态确认。

startup仍完善228/229：RAM预算不能限制当前页正常批量编辑；无头已真实2288组/2299组，含65模型分批64+1、第二批rename失败和仅重试剩余1项、三目标0值及overflow替换陈旧缓存，有头仍在跑。等其停源与独立230修复复核完成，再只启动一次冻结完整回归。所有其它代理只写QA/文档，root未访问或同步15967、未打包/部署/真实账号联调。

完整用户目标active：当前已定位旧local-policy post-batch payload/timing、inline逐响应选择/代际、JSON包装与XML实参类型五项另批缺口，私有10case基线中的5个expected failures是缺陷确认，不是迁移通过。剩余所有旧原子领域仍需逐项裁决，不能把本批199文件绿当成整个目标完成。

## 当前唯一完整冻结69360

唯一完整活句柄exec69360，full-2026-10-17T06-10-57-628Z，startedAt=2026-10-17T06:10:58.322Z，516份生产/测试文件，预计199 M3+10 M4，等待实际终态。所有代理及root停写冻结源，仅文档/QA；不因观察超时重启。

228/229大草稿最终有头/无头各8/9组exit0，83最终原链exit0，browser已全关，root后才开始冻结。230两修点已独立只读复核。完整已观察到70一份失败：前两尺寸通过，1080几何断言全过，在逐导航access click时浏览器报告page/context/browser closed，原log保留，目前原因未知，不声称为已证明的产品布局错误或夹具错误。待本轮完整终态后才进行受控事件复现；不要修改运行中的70或重跑另一份full。

冻结期间root纯离线社区5case审计（无HTTP/browser/native/external IO）确认：无管理密钥本地豁免跨同步保留为正控制；重新明确屏蔽仍被旧豁免抵消（旧源码亦受影响）；有但失效的管理密钥阻断旧版的本机解除兜底；pushLocal=false丢弃远端列表（未证当前调用方）三条需分别裁决。空云端不自动上传本机名单保留新版隐私行为，不机械迁入旧自动seed。证据community-contract-audit-root/probe.mjs/result.json，exit0表示这些分支已确认，不是新修复。

**69360最新真实终态覆盖活指针**：2026-10-17T06:26:08.739Z已exit1，197/199 M3、10/10 M4、516hash一致，SHA7cbcc17ae954bd1986bed211382f118e75f625055cd0e4ea8410ab8c789f09d8。失败仅70 browser关闭未知与91旧下划线期望；226–231及64/119全部过。当前没有完整活进程；motion接独占browser执行prepared70诊断，因其247hash守卫root/代理暂不改相关source/91。诊断实际终态后才解除此局部保持、正式对齐91并开展下一批。完整原子目标仍active，不将197/199当全绿或完成。

## 第十五批正式实施中（当前无完整回归/冻结）

70唯一生命周期诊断exec21053已真实exit0：5尺寸/65导航，pageCrash0/unexpectedClosure0，5page-close/5context-close/1browser-disconnected全部正常finally，247相关源hash不变、offline门零。原full70未复现、原因仍未知，不改原失败、不加retry。91只改旧下划线期望并新增真实protocol/receipt/archive一致性，原完整链exit0，batch11-targets-2026-10-17T06-29-18-761Z（sha d4fb5245b9c2460771f233bdf8fc4e4e57adcc976d646abaf014fe688782e75d）；没有产品降级或删断言。

root232已正式把默认parser抽到src/kernel/inline-tools.js，通过原agent-runner命名re-export和core.tools.parseInline选择链消费。恢复tool_call内JSON/旧args aliases/具名换行格式/XML逐参数JSON类型，保留现代fence/bare-body；拒绝坏参数与普通正文，不让XML参数内的name对象偷走外层function。正式232实际19/19（含真实loader/SDK/core-tools/queue/archive、typed arrays、追加覆盖/停用），232/230/78顺序3/3真实exit0，目录batch11-targets-2026-10-17T06-41-34-831Z。M3目前只新增232至200文件；234–237尚在写/测，不能提前加入或称完成。inline每响应重选/来源lease及local-policy批后合同仍待root继续，不把parser两项修复代称全部reply原子完成。

代理分工与共享边界：
- motion236/237正式拥有pause-controls.js、app暂停小片、routes仅POST/DELETE pause、store仅strict markAllRead/throughId+host-only boundary incarnation、sessions/chats选择状态/selection-state.js、新236/237/自有fixture。browser由motion独占，完成后交startup。partial必须暂停、诚实marked/failed/remaining、只重试原有界scope，新消息不误标；clear/recreate/restart旧票据409，取消重试才新意图。不能仅以runtime标读声称持久成功。当前还在补严格故障/边界，未停源。
- startup234正式拥有bundled/market/client.js名单部分、新console/blocklist-members、settings/blocklist-state/members、settings panel仅access入口、community panel仅名单迟到保护、新234及自有fixture。已纯/HTTP首轮7组exit0，browser未跑；需真实client停止信号捕获、volatile pushLocal:false远端∪最新local−exempt/get/cache变动失效、目标membership CAS/跨入口/partial等补全。当前页Map不限，不占7400B RAM，跨页面不保存的界限明确。root已实际接console.blocklistMembers factory、GET/PUT /api/blocklist-members、settings成员GET与两新bootScripts（总7）；root仅给market/index factory加signal一行，client每操作须捕获旧signal实例防stop/start复活。
- core235拥有OneBot client/provider、kernel ingest/transport、sdk-services只新transport.actions权限/信号表、prompt/history effective-global（orchestrator只history区不碰resume）、new235。kernel只facade/ingest/动态globalBlocklistOf注入小片可直接改。实际19/19首轮过，继续追加服务Promise/代际及权限边界，未停源。有效global必须消费当前所选community.client权威集合，不仅raw−exempt；缺能力/异常才cfg fallback。
- root独占其余routes/defaultComponents/manifest/M3、232inline后续与233搜索默认/精确endpoint/最终结果cap。233只有QA实际缺陷还未正式实现；新local-policy合同要保留现代preflight与旧批后原子，不能盲加同key二次调用造成已有provider时序改变，待明确compat映射/新phase设计。

所有UI/后台/核心仍须通过追加文件实际消费验证；当前无源码冻结，不能启动full。继续局部测试、待全员停源和root剩余实现收敛再新full，保留full69360 197/199+10/10真实历史。15967仍未访问/同步，未打包、部署、真实QQ/账号/远端模型联调；完整用户原子迁移目标保持active。

## 第十五批最新交付及本机认证复核（覆盖上段代理进行中状态）

234、235、236/237全部已交付并正式停源，浏览器和其合成进程均退出。234最终HTTP10组、有头/无头各14组及原38断言27项通过；root接线`resolveCommunity`必须返回实际selected service，不能返回动态facade。235最终26/26及其相关旧回归通过。236最终严格capture/持久故障修正后有头/无头均exit0，11份相关hash不变；237双模式与95/121/123/202通过。交付分别在`blocklist234/implementation-report.md`、`transport235-implementation-core/README.md`、`pause-navigation-236-237/REPORT.md`。这些交付尚未加入M3清单、未跑新full，不等于全部原子闭合。234原settings高级JSON/global/豁免整表编辑仍有并发覆盖风险，明确独立待办，不称全入口CAS。

用户最新“本机自动认证、保持连接、保留后台校验”已核对既有实现，纠正令牌管理说明，7个专项文件181/183/182(有头)/125/116/97/167实际全exit0，目录`batch11-targets-2026-10-17T06-58-59-952Z`。真实两PID有头重启复验5/5、actual exec55787 exit0，`auth-recheck-20261017/restart-headed-final/result.json`；前一次旧QA没配置模型而被正确导航设置、尚未重启即搜索框超时的失败保留，只补QA合成seed，不改产品/原断言。无15967访问或同步。完整原子迁移目标仍active，root233及inline/provider/local-policy、kernel缓存身份清空旁支等继续；仍无新full活进程或冻结。

## 当前唯一完整冻结65084（覆盖前述无活进程状态）

233默认协议/完整endpoint/预算已落实，最终29/29；238回复阶段/租约29/29；239名单数据留存9组；240公开身份状态及热切3组；241网络取消最终26项，均真实exit0，既有定向及代理交付见各QA报告。root已接kernel同步selection通知、真实triggerEntries、身份显式null清空与DTO，更新追加式架构及SPEC顶部迁移补充（保留全部0.4原事实快照）。当前M3注册209文件、全部存在无重复。静态预检初版regex漏计run-m2聚合入口，报错后被不当继续启动full；已仅修QA预检regex并实际核对209，未重启full，也未改冻结源码。

**唯一活句柄 exec65084**：目录`full-2026-10-17T07-29-43-497Z`，startedAt `2026-10-17T07:29:43.556Z`，**537**份源码/测试冻结，预计M3 209+M4 10，尚未终态。所有代理与root生产/test/scripts/assets停写；仅文档/QA可写，禁止另起browser或重复full。观察超时不等于进程停止，先轮询同一handle；实际terminal/result优先。

root233共享实现的只读复核发现null配置/Bing及自定义诊断媒体私网例外两新增回归，已修且加正式233覆盖，非遗留。其首轮24/26及测试夹具漏fetchImpl/既有safeFetch取消缺陷、全过程记录在search233-final/README.md，不声称首轮外网0。新全量尚不能证明通过，旧69360 197/199+10/10不改写。

完整目标仍active，下一批优先高级名单JSON/raw global/exempt整字段CAS（保留原本机字段语义，不能接云replace）、memory discovery所选effective集合、窗口最后保存及剩余全域原子对账。15967仍未访问/同步，未操作真实QQ/账号或打包部署。


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

进度与所有原始失败、实际通过、未完成验证详见`.qa-local/settings-structure-20261017/STATUS.md`，合同见`docs/settings-structure-migration.md`。上一批216+10不覆盖本轮；249已注册。旧定向活指针已由最终12/12无头、249/197有头2/2、244有头23组的真实终态覆盖，最终截图/字段/范围审计已完成。

当前唯一完整冻结 PID166656，`full-2026-10-17T12-30-29-822Z`，560份生产/测试文件，预期217 M3+10 M4，未终态。启动前一次QA正则漏算run-m2的失败已保留且确认未执行测试；修QA后才启动本轮，不改生产或正式测试。先等待同一进程及终态前后散列，不另起full/browser或修改冻结源。当前目标仅设置页，完成审计见`.qa-local/settings-structure-20261017/completion-audit.md`；15967未访问/同步/重启，无打包部署。

最新覆盖：166656已真实217/217+10/10、560hash一致结束。随后真实复现并只修密钥弹窗状态标签，增加249开窗写入/三击清除的磁盘及状态断言；仅panel+249两文件变化。最终相关4/4、有头249/1972/2、24423组及新12截图全过。**当前唯一完整冻结PID117684，full-2026-10-17T12-53-30-791Z，560文件，预期217+10，未终态**。旧轮结果first-full-verification.json不能证明最后修复；等待同一新轮实际终态，再verify-final和逐要求审计。范围仍仅设置页，禁止冻结中改源/test或另起full/browser，不访问/同步15967或打包。

**最终覆盖：本设置页目标已验证完成。** PID117684于2026-10-17T13:12:34.426Z真实exit0，217/217 M3+10/10 M4，560份运行前后及终态后当前hash一致；verify-final.mjs综合核验通过，completion-audit.md所有明确要求已证实。当前无活full，源码冻结解除，无需再启动测试。九分区、按钮模态框、折叠/后台清理、160配置控件、保存/草稿、最后密钥标签与实际追加/禁用恢复均完成；文档已更新。仅此设置页目标，不继续旧全域迁移；15967未访问/同步/重启，无打包部署。
