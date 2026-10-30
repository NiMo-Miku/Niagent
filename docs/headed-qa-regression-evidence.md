# 自动回归与有头补验记录（2026-10-11–14）

> 范围更新（2026-10-23）：专属协议端与便携客户端的安装、启动和登录态迁移已从项目范围移除。本文保留其余历史记录；旧编号、测试数量与结果只对应当时范围，不代表当前版本已经完成验收。当前外部协议端由用户自行管理。

**最新有头清单冻结（2026-10-14 develop参考补缺批）**：186仍为9通过/92部分通过/0失败/84条件不足/0待测/1延期，101行覆盖或尝试（54.3%），不是101通过。[本批逐行计数](../.qa-local/develop-gap-closure-20261014/checklist-counts.json)。E01限定本地通过、C10部分通过，真实阿里等余项保留；该功能清单与新M3 117/117、M4 10/10自动文件分别计数。上一113+10与首批111/113+10/10 exit1均保留。

**后续文档同步**：2026-10-11统一首轮仍如实保留58/70；正常进程权限12文件重跑11/12，唯一真实布局失败70独立修复后原70项分批有效通过。100–136中实际收录的测试均有定向/完整通过来源，135最终8/8、136四组真实HTTP/UI回归已绿并正式冻结，M3静态清单104唯一。2026-10-12第一批完整run-all/session19196 **exit1，M3 94/99、M4 10/10**保留；五项对应合同/夹具证据修复及定向有效通过另记。第二批run-all/session67908 **exit1，M3 98/99、M4 10/10**，首批五项已通过，95测试同步修复后1秒/15秒定向通过及移除revision保护反证失败，生产app.js未改；第三批session71802亦exit1（M3 98/99、M4 10/10），95通过，当时唯一115背景fit持久化断言，现仅测试真实POST/ack保存同步修复有效green、生产未改。独立PROFILE102实际可见IAB插件边界/能力/managed/错误诊断另记partial。三批原始输出保留。132迁移数组派生flag源修冻结、Z03修后fresh IAB6保存/运行指定故障关闭partial（真实旧登录态未验）；Z02本地损坏实测通过。主QA已最新源码重启44396；第四100+M4/session90402实际exit0，M3 100/100、M4 10/10，前三批exit1均保留；最新原生nav/SSE/25sessions与首次用量重读补限定partial。第四自动完整回归截至132，不等于全部功能/规格有头通过；133冻结消费者修后实际原生cache16.7%/IAB徽标开关与reload指定case补partial；第五101全套/session40444实际exit0，M3 101/101、M4 10/10。134目标name修后fresh IAB四中文名复验通过，S11限定partial；第六102全套/session26339实际exit0，M3 102/102、M4 10/10，最新源码冻结。独立合成删除clone用户最新已明确批准限定dataDir清理及最后reset，已实收聊天清空/单成员删除两个case，其后整group记忆受控1→0、终态会话7→0/用量保持已实收；最终reset旧EPERM故障经135/136修复，root实际提交备份/正常退出/新启动文件清理及会话聊天空态已复验；最后原生设置默认/IAB记忆0/全部历史用量0均已实际复验，G29限定本地源码/授权合成副本通过。第七104全套64/104 exit1为大量sandbox spawn EPERM环境阻断；第八正常权限103/104 exit1，唯一131夹具依赖闭包不完整，补依赖/保留原13断言并新增非法pending第14case后14/14绿。第九完整正常权限exit0，M3 104/104、M4 10/10；九批原始结果分别保留，不将自动回归合并为全部有头功能通过。

本文件记录自动化 **headless/模块/API 回归**，并在后续各节单独收录根代理的实际有头补验及其证据层级；Chromium headless布局与交互断言、Electron回调模拟和真实内核停止测试，不等同根代理在原生窗口或可见IAB的逐项操作。文档代理未操作有头副本的UI/API/数据或进程；root在明确授权的合成副本操作另节如实记载。没有打包、安装器、发布、真实QQ账号或收费模型验证。

**本轮修复已收尾**：用户“修复吧”后的认证/记忆/扩展诊断定向红绿、可见离线操作、第二完整runner exit0与最终源/快照核对见文末。此前“无新生产修复/全量”属于旧批次，不覆盖本次已执行的修复；没有据此宣称186项全部通过。

**develop参考补缺批新增完整结果及最终核对已收尾**：严格版本门槛补修冻结后，M3 117/117、M4 10/10、exit0；可见IAB图片预览/离线投稿、坏图阻止/移除及历史价格展示已补证，见文末。198源/测试指纹和旧三份快照保持，此前113+10和旧失败保持历史，真实QQ/免扫码/阿里/社区服务器存储未闭合。

## 统一回归与定向复验

| 执行 | 结果 | 原始记录 |
|---|---|---|
| `node test/run-m3.mjs`，20:54:11–20:56:42 | exit 1，58/70 顶层测试文件通过；上游 M2 自报 8/8。运行启动时清单含 90/91/92/94–99，不含 93/100/101。 | [完整日志](../.qa-local/full-regression-20261011.log)，144979 字节；保留首次事实。 |
| 仅 12 个浏览器失败文件，以正常进程权限重跑，21:00:05–21:01:24 | exit 1，11/12；实际应用断言失败只有 70。 | [正常权限日志](../.qa-local/browser-rerun-20261011.log)，[定向脚本](../.qa-local/rerun-m3-browser-failures-20261011.mjs)。 |
| `node test/100-memory-live-state-test.mjs` | 沙盒首轮在 Chromium launch 处 EPERM；正常权限再跑 exit 0。真实 route/bus、卡片/count/disabled、失败保留、漏 SSE 的状态轮询恢复、SDK 印象写入通知均通过。 | [首轮](../.qa-local/memory-live-state-100-20261011.log)、[有效复验](../.qa-local/memory-live-state-100-normal-20261011.log)。 |
| 新版 `node test/97-electron-token-reload-test.mjs`，21:04:57 | exit 0；主窗口/根文档令牌边界，CommonJS preload 刷新复用 IPC 通过。 | [97 日志](../.qa-local/electron-token-97-20261011.log)。 |
| `node test/101-electron-destroyed-window-test.mjs`，21:04:57–58 | exit 0；销毁窗口 native getter、真实内核 shutdown、HTTP 释放、实例锁释放通过。 | [101 日志](../.qa-local/electron-destroyed-101-20261011.log)。 |
| 冻结布局修复后，仅 `node test/70-layout-overflow-test.mjs` 正常权限单跑，21:10:16–35 | exit 0；四个窗口尺寸通过明确断言，960×640 与新增 960×600 均首屏容纳 13 入口。关联 62 由布局代理验证，本代理没有重复跑 95 或整套。 | [70 修复后日志](../.qa-local/layout-70-after-20261011.log)。 |
| 冻结后的 `test/102-memory-allow-list-test.mjs`，由 extensions_review 代理执行 | 根代理确认实际 kernel HTTP + headless Chromium 回归通过；关联旧 35/100 也由该代理验证通过。本代理仅整合其执行证据和核对测试源码，没有重复启动测试或浏览器。 | [102 实际测试](../test/102-memory-allow-list-test.mjs)；执行来源为 extensions_review 完成报告及根代理确认。 |
| `test/104-runtime-boundary-repair-test.mjs`，由本代理独立执行 | 修复前sessionRetryAttempts=0及字符串0均实际请求3次，非法拍一拍目标被下传且整数参数被schema拒绝；修复后8/8通过，0只请求1次、非法目标动作数0，合法参数及私聊默认保留。关联74为23/23、25为73/73、98为8/8。 | [104测试](../test/104-runtime-boundary-repair-test.mjs)、[修复前](../.qa-local/runtime-boundary-104-before.log)、[修复后](../.qa-local/runtime-boundary-104-after.log)、[74](../.qa-local/runtime-boundary-104-related-74.log)、[25](../.qa-local/runtime-boundary-104-related-25.log)、[98](../.qa-local/runtime-boundary-104-related-98.log)。 |
| `test/105-extension-local-lifecycle-test.mjs`，由 extensions_review 代理独立执行 | 负责代理确认真实loader/config/storage/permissions/registry与受控MCP回归通过：配置副本及旧代KV保护、并发MCP只建一个child、旧list失败不能停新代。关联42/44/51/84/85/89通过。本代理只整合报告。 | [105测试](../test/105-extension-local-lifecycle-test.mjs)；来源为负责代理执行报告，无另存日志，不虚构日志路径。 |
| `test/106-usage-dimension-drilldown-test.mjs`，由负责代理独立执行 | 根代理确认用量维度下钻回归独立通过并已加入runner；本代理仅同步该执行结论，没有重跑或把它算作原生有头操作。 | [106测试](../test/106-usage-dimension-drilldown-test.mjs)；来源为根代理确认。 |
| `test/107-hotreload-event-contract-test.mjs`，独立回归 | 根代理确认107和关联60/62/29独立通过，已将107加入runner。本代理只同步执行报告，没有重跑测试或窗口；实际MCP热更的有头证据另记journal164–166。 | [107测试](../test/107-hotreload-event-contract-test.mjs)；来源为根代理确认，不虚构本代理日志。 |
| `test/108-uikit-action-wrap-test.mjs`，由shell_function_fixes代理独立执行 | 根代理确认108及关联70/73/62通过；108用headless验证948/960/1360尺寸下八预设保存及40字符主题重命名，溢出0。本代理仅补runner收录、语法与清单检查，没有重跑该回归。 | [108测试](../test/108-uikit-action-wrap-test.mjs)；来源为负责代理执行及根代理确认，不能计为原生窗口配色操作通过。 |
| `test/109-theme-root-inheritance-test.mjs`，由shell_function_fixes代理独立执行 | 根代理确认109/68/62/95/108通过；本代理仅收录109并检查语法/清单，没有重跑行为测试。后续根代理已实际原生F5确认B浅色外壳正确，截图与journal274另记有头文档，不将自动与原生证据混同。 | [109测试](../test/109-theme-root-inheritance-test.mjs)、[原生复测记录](headed-qa-results.md)；回归来源为负责代理执行及根代理确认。 |
| `test/110-hidden-navigation-recovery-test.mjs`，由shell_function_fixes代理独立执行 | 根代理确认110/95/109/70/62回归通过；本代理仅收录/静态检查，没有重跑。111冻结后QA已同步，后续实际原生hide/F5/ShowNav/Escape/settings链路也复测通过，journal322–330单列有头来源。 | [110测试](../test/110-hidden-navigation-recovery-test.mjs)、[原生复测](headed-qa-results.md)；自动执行与原生执行分别归属，互不冒充。 |
| `test/111-background-roi-test.mjs`，由extensions代理独立执行 | 根代理确认111冻结、15组像素和关联68/71/109通过；本代理仅收录/语法检查，没有重跑像素或浏览器测试。后续原生20%缩框/green→blue构图复测已完成，journal319–321另记有头来源。 | [111测试](../test/111-background-roi-test.mjs)、[原生记录](headed-qa-results.md)；不混同两种执行。 |
| `test/114-community-public-entry-test.mjs`，负责代理独立执行 | 根代理确认114及52/64/67/61/62通过。该测试使用headless Chromium/本地代替外站，不能替原生公共按钮或远端业务。关联80首跑在第116行等待详情时序超时，仅完整复跑一次通过、未削断言；保留该首轮事实。 | [114测试](../test/114-community-public-entry-test.mjs)；来源为负责代理/根代理报告，本代理未执行。 |
| `test/115-background-fit-test.mjs`，负责代理独立执行 | 根代理确认115冻结、headless通过，五文件修复铺法/比例/共享paint。后续根代理已实际原生切换完整显示/铺满/平铺、观察2×2tiles并F5保持，属于另一份有头证据，不归本代理执行。 | [115测试](../test/115-background-fit-test.mjs)、[指定原生case](headed-qa-results.md)；没有把API合成背景预置写成真实上传。 |
| `test/116-browser-reload-auth-test.mjs`，负责代理独立执行 | 根代理确认116 headless通过；普通浏览器sessionStorage缓存30min TTL/origin绑定、URL清token、401清缓存，Electron IPC不缓存。后续真实可见IAB重新打开授权URL后reload/暂停/恢复通过，原生F5也成功；自动与有头来源分别记录。 | [116测试](../test/116-browser-reload-auth-test.mjs)、[IAB复测](headed-qa-results.md)；本代理仅收录/语法检查。 |
| `test/117-settings-reload-discard-test.mjs`，负责代理独立执行 | 根代理确认五组真实kernel+headless Chromium+helper通过，关联90/83/100/69/68通过。后续IAB实际确认窗>700ms磁盘未写、确认丢弃和取消后恢复自动保存两分支通过；延迟GET期间新输入仍仅headless验证。 | [117测试](../test/117-settings-reload-discard-test.mjs)、[两分支有头证据](headed-qa-results.md)；本代理未运行行为测试。 |
| `test/118-public-site-skill-entry-test.mjs`，负责代理独立执行 | 根代理确认118冻结/headless通过，关联114/52/61/62/64/67通过。实际kernel+headless验证固定URL、按面板限制RPC、无token/key传出、失败/重试、最小窗口可达。后续五公共入口已由根代理实际原生点击，QA桌面适配器记录精确URL/externalOpened:false，另列有头证据；没有真实打开外站。 | [118测试](../test/118-public-site-skill-entry-test.mjs)、[原生本地dispatch](headed-qa-results.md)；来源为负责代理/根代理，不虚构本代理日志。 |
| `test/119-provider-upsert-model-append-test.mjs`，负责代理独立执行 | 根代理确认119及关联33（36/36）/90/83/117通过。同baseURL upsert/拉模型append指定合同后续已实际可见IAB复验：复用qa-local、渠道仍3、Key仍configured，pull保留手工model至5，显式edit恢复4和原名；不扩大为完整CRUD或商业模型。 | [119测试](../test/119-provider-upsert-model-append-test.mjs)、[后续有头复测](headed-qa-results.md)；本代理未重跑或操作IAB。 |
| `test/122-settings-map-replacement-test.mjs`，由本代理独立执行 | 修复前真实临时kernel+Chrome把personaByChat删去10001并删10002.participation后，两处旧值仍留磁盘；修复后六完整JSON对象编辑器删键/清{}、fallback数组、非法/空白/保留键不提交、迟到POST时同map与botName新输入保留、普通补丁深merge/显式overrides及provider map替换、秘密/其它字段与读档均通过。仅改settings panel.js，未改backend/FormState或QA。关联68/83/90/117本轮定向通过。 | [122测试](../test/122-settings-map-replacement-test.mjs)、[真实修复前](../.qa-local/settings-map-122-before.log)、[最终通过](../.qa-local/settings-map-122-after.log)、[68](../.qa-local/settings-map-122-related-68.log)、[83](../.qa-local/settings-map-122-related-83.log)、[90](../.qa-local/settings-map-122-related-90.log)、[117](../.qa-local/settings-map-122-related-117.log)。 |
| `test/120-quote-mode-publication-test.mjs`，负责代理独立执行 | 根代理确认完整回归通过：真实kernel/community默认provider、headless金句选择/预览/取消、固定文字POST与公开字段、受控CAPTCHA宿主隔离、取消/重复/429/停用边界。没有真实外站或真实阿里；后续根代理原生只完成预览/取消与图片发布限制，未final publish。 | [120测试](../test/120-quote-mode-publication-test.mjs)、[指定原生case](headed-qa-results.md)；本代理只收录/语法检查，不虚构自跑日志或上传。 |
| `test/123-session-follow-readiness-test.mjs`，负责代理独立执行 | 根代理确认真实kernel+Chromium的初始化丢SSE pending、快照恢复、显式ready/follow、旧响应及初次失败重试通过。80仅增真实sessions-ready同步；后续121最终冻结后120/83/53/80均通过，80严格id2删除断言未改。旧“121/80待完成”阶段已由明确后续执行关闭，不从123单独推断。 | [123测试](../test/123-session-follow-readiness-test.mjs)；执行来源根代理确认，本代理仅静态收录。 |
| `test/121-chat-history-scroll-test.mjs`，负责代理独立执行 | 根代理确认121最终冻结及最后EOF绝对anchor修复、121/120/83/53/80均通过，80严格id2删除未放宽。121用真实临时kernel+Chromium精确验证805+2档案的500/200/105页、滚动/去重/绝对位置、coalescing、选择/金句/草稿/标读/旧段突变及跨聊天代际。后续原生819另有拖动追加/EOF按钮隐藏/修后旧文本y476截图；原生精确DOM行数仍待IAB核对。 | [121测试](../test/121-chat-history-scroll-test.mjs)、[原生历史观察](headed-qa-results.md)；本代理只收录/语法检查，不虚构自跑日志。 |

没有重新运行完整M3来混淆首轮记录。100在统一runner已读入70项数组后才加入，所以按根代理要求单跑；101冻结后只跑新版97+101；102及后续新增项保留各自独立执行来源（不存在103/112/113条目，124–128现已收录，129未冻结）。统一首轮没有业务AssertionError，不存在证据把浏览器启动失败归因于100并行修改；114关联80的等待时序失败/复跑及后续121关联80严格删除通过分别保留。

补108/109/110时静态清单分别78/79/80唯一，111/114后82，115–119后87，122后88，120/123后90；121最终冻结/独立执行通过后收录，核对 **91文件、91唯一文件、121一次、缺失文件0**，runner/121语法检查exit0。默认npm test仍经run-all运行M3/M4，本批没有重复完整套件或启停QA；只改文档与runner，112未实施、113未新增。社区停用503已有原生启用只读成功，不绕过停用语义。

122首次沙盒运行在Chrome launch处spawn EPERM，没有到产品断言；获准正常权限运行后真实复现删key失败。首次修复后六map与竞态已过，测试夹具后续HTTP辅助误用Bearer得到401，随后按宿主x-console-token修正并全过；[夹具错误原记录](../.qa-local/settings-map-122-fixture-auth-error.log)保留，该401不是产品故障。独立只读复核再提出空textarea会隐式当{}风险，最终版改为必须显式{}或[]清空，空/空白输入不提交的最终122再次通过。

**102 的已执行范围（来自代理报告）**：真实 `/api/memory-files` 合并已有档案与合法群/私聊白名单、去重/非法输入过滤、空档计数与更新时间为 0、仅查看不创建目录；实际进行中的整理标记正确并在完成后清除。Headless Chromium 验证日期呈现、打开白名单内无档案私聊、新增成员后文件持久化与列表人数变化；重启后已有档案与未物化的白名单行仍正确。该项使用临时数据、受控本地模型和注入的离线 transport，不是 QQ 实机或有头 Electron 操作。

## 首轮 12 项失败的分类

| 文件 | 首轮事实 | 正常进程权限复验 |
|---|---|---|
| 34-m3-browser-e2e | `browserType.launch: spawn EPERM` | 通过 |
| 53-panel-browser-host | `browserType.launch: spawn EPERM` | 通过 |
| 63-ui-design-system-effect | Chrome/CDP 未就绪，`ECONNREFUSED 127.0.0.1:9451` | 通过 |
| 69-settings-presentation | `browserType.launch: spawn EPERM` | 通过 |
| 70-layout-overflow | `browserType.launch: spawn EPERM` | 首次正常权限为真实布局失败；布局冻结后独立复验通过 |
| 71-background-editor | `browserType.launch: spawn EPERM` | 通过 |
| 72-shell-visual-language | Chrome/CDP 未就绪，`ECONNREFUSED 127.0.0.1:9454` | 通过 |
| 73-uikit-scheme-persistence | `browserType.launch: spawn EPERM` | 通过 |
| 80-ui-spec-completion | `browserType.launch: spawn EPERM` | 通过 |
| 83-settings-spec-completion | `browserType.launch: spawn EPERM` | 通过 |
| 90-provider-settings-repair | `browserType.launch: spawn EPERM` | 通过 |
| 95-shell-runtime-controls | `browserType.launch: spawn EPERM` | 通过 |

这两轮给出因果区分：首轮进程限制不能算产品失败，也不能记为跳过后通过；正常权限实际执行后，11 个通过、70 留下一个可复现的产品布局条件失败。该失败再经明确修复和第三批单项复验关闭，保留三阶段事实。

**70 修复前证据**（正常日志第 241、265 行，原测试第 131 行）：960×640 minimum 窗口中，settings iframe 为 728×545，13 个分区均存在，三列导航、无横向溢出、状态灯 13 个可见、侧栏没有裁切；但分区最低位置为 579，超过视口 545，`allInFirstScreen=false`，违背本测试“13 分区首屏全部可见”的断言。本代理未修改 UI 或缩松断言。

**70 修复后证据**：布局代理冻结 `ui/panels/settings/style.css` 并扩展 70 后，本代理正常权限独立单跑通过。960×640 的 iframe 高 545、入口底 487；新增 960×600 的 iframe 高 505、入口底 487；两者 13 入口均首屏内，标题字体最低 13px、点击高度最低 27.546875px。1080×700、1360×860 也通过各自横向/裁切/可读性断言；宽屏测试没有要求所有入口首屏可见，不能把其通过扩大解释为这一条件。

## git diff 检查

`git diff --check` 已做三次只读检查：

- 20:54:46–47：[原始输出](../.qa-local/diff-check-20261011.log)，exit **0**，空白错误 **0**、问题文件 **0**。
- 21:04:59：[后续快照](../.qa-local/diff-check-20261011-latest.log)，exit **0**，空白错误 **0**、问题文件 **0**；仅 **84 条 LF→CRLF 提示**，没有其它错误行。
- 布局复验后：[布局后快照](../.qa-local/diff-check-20261011-post-layout.log)，exit **0**，空白错误 **0**、问题文件 **0**。

LF→CRLF 提示不是 `diff --check` 空白错误。该命令检查 Git 追踪差异，**不检查未追踪文件**；首次检查时有 232 个未追踪文件，其中源码/测试/文档等 113 个。因此不能把 exit 0 宣称为所有新增文件均已受 Git 差异检查。后续并行修复也应按新的检查快照判断。

统一回归及首轮定向复验阶段未执行reset、commit或改生产源码，只写日志、定向脚本与记录。后续104修复按授权仅修改orchestrator会话重试预算和core-tools拍一拍校验；范围内diff检查exit0，仅2条LF→CRLF提示。本代理始终未改真实用户数据或根代理headed副本；本次文档同步未启动任何新测试或窗口。

## 其它证据边界

94 本轮统一运行通过，详见 [逐工具/运行证据](headed-qa-runtime-evidence.md)。其中实际默认业务工具 27 个，加显式启用的 `hello_say` 样例共 28 个；没有恢复用户已删除的 `sticker_note`。OneBot、LLM、媒体服务是本地合成对端；网页正例的 DNS/socket 路由注入被明示，另由真实未注入内核确认私网页面连接前拒绝。

M3总数按顶层文件/子runner计数，不能换算为有头通过项数。此前70项有效分批通过与新增二十六项独立通过不等于全面符合规格，也不是一次全量96/96。119/122指定IAB合同已复验；121后续可见IAB实际button分页为500→700→819、unique819/末id819/EOF无按钮，原生scroll/旧段撤回与y476位置另有journal403–405及此前截图。test121的805+2/500+200+105仍是独立headless数据。124原生仅反馈校验/文本预览/返回/取消，没有发布或验证码；125原生/IAB仅完成host窗只读打开/关闭与F5/freshreload，show/copy/写入/轮换仍未执行。126后续已有根实际可见IAB双后台100/101的端口、独立种子、暂停隔离、reload与正常exit0/锁释放/端口关闭证据；占用/上限与真实账号余项仍保留。127已冻结，原生诊断只读开/关和保稿已实测，真实探测/验证码/投稿未执行。C10登录合同、C11真实故障网络和G28写入/轮换完整复测仍未关闭；真实QQ/模型/阿里/外站、含图金句发布、最终删除/原生上传及安装打包余项保留。[API-only背景](../.qa-local/headed-20261011/background-seed-evidence.json)不冒充上传。[当前有头记录](headed-qa-results.md)与自动执行分开，本次整理只改文档/runner，没有操作原生窗口或QA状态。

124/125/126收录时的历史静态核对为**94文件/94唯一/缺失0，三项各一次**，run-all仍递归M3/M4且M4原十项不变；该批没有执行完整runner。125日志6577B/mtime00:48:11 UTC，124有效日志4210B/mtime00:50:35 UTC，126独立顺序日志1328B/mtime00:50:25 UTC仅标识各自执行记录，不冒充原生动作时间。截至433的186行历史状态为65部分/2失败/97条件不足/21待测/1延期，尚无整行通过；后续A03与C11实操更新见结果末段，不继续沿用该计数。

125自动回归后根代理另实际原生打开令牌host modal并只读关闭、F5恢复九导航/SSE/23会话；可见IAB重新bootstrap后modal/freshreload也完成。[journal430–433](../.qa-local/headed-20261011/ui-actions.jsonl#L430)、[原生截图](../.qa-local/headed-20261011/screenshots/native-token-dialog-125.png)属于后续有头证据。旧IAB bootstrap超30min TTL后的401不算125故障；未show/copy/credentialwrite或rotate，不能将此只读复测写成真实轮换/撤权通过。

## 127/128冻结后的独立来源

| 执行 | 结果与范围 | 证据 |
| --- | --- | --- |
| `node test/127-market-captcha-diagnostics-test.mjs`，shell_function_fixes独立执行 | exit0。实际临时kernel/market默认插件/生产adapter/ZIP multipart/headless Chromium串联；固定官方SDK/scene由本地替身返回proof，验证确认取消0POST、验证码失败/取消与迟到proof0POST、重复409、成功一次、quota/禁用保稿、redirect不跟随、上游成功/错误脱敏、宿主长请求在模拟16s仍等待、异源/nonce/wrongpanel拒绝。诊断Node真实函数用本地HEAD替身区分HTTP200/403/404/503与DNS/TLS/timeout/network；浏览器固定3目标、manual不可读状态、失败与www.aliyun.com不直探、无IPC说明、关闭/重试/草稿保留。 | [127测试](../test/127-market-captcha-diagnostics-test.mjs)、[隔离Chromium截图](../.shots/captcha-127-diagnostics.png)。无另存完整日志，不虚构日志路径；原生只读诊断另见[journal439–444](../.qa-local/headed-20261011/ui-actions.jsonl#L439)。 |
| 127关联定向回归，shell_function_fixes独立执行 | 125/124/120/114/118/95/80/38/52/61UI/62design/64/67/85/m4-electron-shell通过。旧64更新为检查窄RPC/host验证码/真实市场POST；80仅接受固定SDK本地替身并明确产生本地proof，保留SPEC80CODE、云publish、数据落盘与其它业务断言，完整通过。 | [80](../test/80-ui-spec-completion-test.mjs)、[64](../test/64-community-panel-test.mjs)。源码/测试改动冻结，未执行完整runner，未真实登录/阿里验证/外网投稿。 |
| `test/128-electron-autostart-config-test.mjs`，负责代理独立执行与根代理最终冻结确认 | 根代理确认回归通过并授权收录。实际原子config+生产Electron生命周期、OS记录替身：committed设置同步登录项与托盘、重复/无关保存不重apply、失败write/rename不应用、OS失败后续重试、closeToTray实时、停止后无订阅/late apply；源码/打包登录命令及带空格参数、PROFILE/DATA roundtrip用普通Node child验证。 | [128测试](../test/128-electron-autostart-config-test.mjs)。根后续原生设置开/关已实际产生QA适配器记录true/false并还原，A08旧同步故障关闭partial；不称真实注册表或开机登录通过。[有头证据](headed-qa-results.md)。 |

该阶段收录为96唯一，129/130当时未冻结。根原生撤回实操证实reply不降级、实际受控模型context仍含撤回直接/引用原文，H08/H09记录失败，H12仅文本安全局部通过；详见[原生故障与实际请求](headed-qa-results.md)和[修前请求证据](../.qa-local/headed-20261011/recall-context-before-repair.json)。N02原生新增聊天/空印象/两条印象与备注保存、刷新、磁盘核对通过，重启后原生重读尚待，仍partial；这些不是自动测试或已完成完整持久化验收。

## 129/130正式冻结收录

| 执行来源 | 结果与范围 | 证据/限制 |
| --- | --- | --- |
| 129负责代理独立执行，根代理最终确认 | 10/10及相关green。真实loader/permissions/kernel、本地HTTP与默认业务facade：LLM callback只给请求元数据、实际凭据仍仅HTTP；MCP生命周期/错误callback不外借且停用后不回调；market/community/memory按consumer权限与窄DTO；显式abort/revoke/unload经默认与嵌套替换provider的SDK传播，宿主create/start/stop工作不借consumer生命周期，第三方custom capability合同保持。生产仅kernel/sdk-services/service-host三文件。 | [129测试](../test/129-sdk-consumer-callback-boundaries-test.mjs)。无真实外网/实际child，未冒充根原生SDK权限/取消验收；本代理本批未重复运行。 |
| 130负责代理独立执行，根代理最终确认 | 7/7及120/121等相关green。实际临时kernel/正常transport归一化/本地HTTP模型/headless：pause seed/reply/recall/resume不让源与旧quote入后续prompt，显示引用降级；缺失/遗留/删除/重复协议引用及重启；全撤回批次不调用模型；工具轮中止仅重新排独立未读，无关历史不误取消；self裁剪不重发/不丢sent，已裁剪源的在途撤回仍取消。生产仅store/ingest/prompt/orchestrator/query-tools/routes六文件。 | [130测试](../test/130-recall-context-test.mjs)。根修后原生与实际请求尚待，H08/H09失败未自动关闭；本代理本批未重复运行。 |

当前收录为**98文件/98唯一/缺失0，129/130各一次**。根后续真实同步/正常重启到PID78000，130原生新/旧引用降级与实际模型46→47请求过滤通过（修后source原文不入context、reply仍入、placeholder=true、发送不增），H08/H09指定故障关闭partial；N02实际重启读名称/备注/两印象保留，根确认本地条件完成升通过。这些有头/实际请求证据另列[结果末段](headed-qa-results.md)，不混为129/130自动回归。

130原生复验阶段的186行历史快照为2通过/70部分/1失败/94条件/18待测/1延期，完整98套件未执行。随后初次真实十端口耗尽的重复错误框进入A10明确故障，131正式冻结如下，不把早期阶段计数当作当前。

## 131单次启动错误报告

根确认仅`electron/main.js`和[131回归](../test/131-electron-startup-report-test.mjs)正式冻结。由负责代理独立运行，自动入口基线实际dialogs=2/startup records=2/exit1，修后13场景通过，128/97/101/125关联通过；[修前](../.qa-local/131-baseline-evidence/131-before-repair.log)、[修后](../.qa-local/131-baseline-evidence/131-final.log)均保留。13场景的原生Electron边界为mock，真实十端口测试使用实际kernel/HTTP/锁；没有把该自动测试宣称为根已完成修后原生弹窗。

根实际初轮端口耗尽PID70904/exit1/no lock、holder77724关闭及重复错误框另有[原生证据](../.qa-local/startup-error-owned-YDX1oF/error-native.json)和[退出](../.qa-local/startup-error-owned-YDX1oF/observed-electron-exit.json)；A10从待测改失败，待131根有头复验再关闭。S02/S05后续可见IAB筛选/原始JSON保持只补实际浏览器局部记录，不混为自动或原生全项通过。

131冻结收录阶段M3为99文件/99唯一/缺失0、131一次；当时186行2通过/70部分/2失败/94条件/17待测/1延期。根随后实际有头131单次错误复验如下，不能把这个中间失败数当作当前。

## 131有头复验与新完整运行（进行中）

根新的own holder61549–61558十端口耗尽，Error1837008 AX为启动失败/61558 EADDRINUSE；一次Return后PID38356 exit1/lock=false，startup-failed=1，后续无第二Error，holder78384正常shutdown/端口关闭。截图返回底层root，完整Error像素证据不存在；[AX与限制记录](../.qa-local/startup-error-owned-7UDrCR/error-native-131.json)、[退出](../.qa-local/startup-error-owned-7UDrCR/observed-electron-exit.json)、[boot日志](../.qa-local/startup-error-owned-7UDrCR/data/boot-diag.log)属于实际有头来源，另于自动13场景。A10指定重复报告故障关闭partial；A04仍保留非有头fallback余项。

根已启动完整run-all，session19196，输出[full-regression-20261012-final.log](../.qa-local/full-regression-20261012-final.log)。当前结果**待完成**；此前首轮58/70、正常权限11/12和70最后布局独立复验事实保留，不由新运行覆盖。M3 99文件/99唯一，186行当前2通过/71部分/1失败/94条件/17待测/1延期；不写99/99或run-all全绿，待根最终exit/摘要。本代理自全套启动后仅docs/静态，不再运行并行行为测试。

根随后可见IAB实际日期2026-10-12六维逐项等待后总额保持12runs/20calls/3000tokens/¥0.003240，单session150tokens/1call/¥0.000162及关闭、工具按钮滚动到finish14/send13/Hello1/MCP1另有[浏览器记录](../.qa-local/headed-20261011/browser-usage-six-dimensions.json)、[单会话详情](../.qa-local/headed-20261011/browser-usage-session-detail.txt)、[工具截图](../.qa-local/headed-20261011/browser-usage-tools.png)。这是根的可见浏览器实操，不是本代理自动测试；>20模型/range变更/完整二次钻取/跨日求和未验，U01/U03/U04继续partial。完整run-all仍等待最终结果。

## 2026-10-12完整run-all首批结果

根确认session19196 **exit1，M3 94/99、M4 10/10**。[完整原始日志](../.qa-local/full-regression-20261012-final.log)本次读取227455字节，末尾M4 10/10；M3第3539行为94/99失败。保留这次完整运行，不改成跳过后通过，也不与2026-10-11的58/70首轮混同。

五个失败顶层文件为run-m2（内部57旧静态生命周期断言）、34（旧shell清token函数静态位置）、80（无mid的reply夹具期待旧原文）、94（stop后访问失效ctx KV）、126（第二十端口准备在40attempt内未能完成）。根已分别安排extensions_review修57/94、runtime_review修80/126、根修34，保留各自真实业务/安全断言；当前仅记录责任与定位，不在有效执行前归结为全环境/全产品或关闭。

当前M3仍99文件/99唯一，五项后续有效复验待根确认。根另只读IAB能力29项/6服务运行、两页一致使E10/E11补partial，G02已保存name不是未提交草稿。当前有头186行2通过/73部分/1失败/94条件/15待测/1延期；这与94/99自动文件结果是不同统计。本代理本轮仅docs/静态，没有并行行为测试或启动/修改QA。

后续根将34两条旧静态shell函数字符串断言迁到actual createConsoleAuth URL行为与shell wiring，保留浏览器业务验证；[34-final-rerun.log](../.qa-local/34-final-rerun.log)记录**28/28通过**。该项有效定向复验关闭其旧失败，但不改写首批完整94/99与exit1；其余四项有效结果仍待。根另实际IAB成员昵称/QQ/空结果/clear及private无群按钮有[记录](../.qa-local/headed-20261011/browser-memory-member-search.json)，没有记忆mutation，群名片/真实QQ未验；N06继续partial，统计不变。

## 失败合同/夹具复核与第二次完整run-all

根确认新57/94夹具在129前baseline和当前源码均通过；旧57静态“不unbind”并不等价授权不得清掉新实例的实际合同，改实际行为断言；94不访问已stop/失效ctx来读KV，仍核持久化与拒绝边界。[57当前](../.qa-local/129-baseline-evidence/57-current-after-repair.log)、[57旧源码](../.qa-local/129-baseline-evidence/57-sticker-qq-library-test-baseline-after-fixture-migration.log)、[94当前](../.qa-local/129-baseline-evidence/94-current-after-repair.log)、[94旧源码](../.qa-local/129-baseline-evidence/94-headed-qa-runtime-evidence-test-baseline-after-fixture-migration.log)为独立执行来源，本代理未运行。

80以实际source550/reply.mid补合法引用，同时保留原文/全部ID/计数与业务断言，[定向日志](../.qa-local/80-quote-fixture-after130.log)通过。126以随机候选真实11bind预检、保留10实占和六场景，[有效日志](../.qa-local/126-fixture-selection-after.log)6场景通过。原准备阶段40attempt失败原因无法回溯，不归咎低端口；仅旧门槛非契约已确证，真实十端口约束没有缩松。

第二批完整run-all/session67908 **exit1，M3 98/99、M4 10/10**，另存[full-regression-20261012-rerun.log](../.qa-local/full-regression-20261012-rerun.log)，第一批227455B[exit1原始日志](../.qa-local/full-regression-20261012-final.log)保留。首批五个失败文件在该完整批均通过；唯一失败95-shell-runtime-controls-test.mjs第86行等待状态轮询10秒未观察到请求，日志1872–1930保留原错误。首批95通过，extensions_review正在核对本次差异；目前不归咎产品或夹具，不以增加超时当修复，也无全绿结论。

根另实际可见IAB更改渠道编辑dialog显示名称为QA-HEAD-CANCEL-132、未保存关闭并重开，实际输入仍QA-HEAD-PROVIDER-B-RENAMED：[取消证据](../.qa-local/headed-20261011/browser-provider-cancel-132.txt)。仅该dialog取消未提交草稿已测，不能泛化为全局普通设置字段取消；botName此前已700ms自动保存并已还原小鲸鱼。G04继续partial，该阶段186清单2通过/73部分/1失败/94条件/15待测/1延期。该段132为操作标记，当时未新增runner或源码修复；后续正式迁移test132另记，不混为普通设置修复。

## 95有效同步修复与第三次完整run-all

95只变更测试，根确认生产app.js哈希不变；旧测试15秒刷新配置下稳定触发原10秒gate超时，[修前日志](../.qa-local/129-baseline-evidence/95-refresh15s-before-repair.log)保留。新测试以clock驱动实际生产timer，真实HTTP/SSE/pause及被暂留的旧status快照仍执行，等待真实state提交点而非固定250ms。修后[1秒](../.qa-local/129-baseline-evidence/95-refresh1s-after-repair.log)/[15秒](../.qa-local/129-baseline-evidence/95-refresh15s-after-repair.log)均通过，[差异](../.qa-local/129-baseline-evidence/95-test-changes.diff)仅test95。own副本移除revision保护使新assert实际false!==true失败，[反证日志](../.qa-local/129-baseline-evidence/95-race-guard-mutant.log)说明竞态断言仍有效。不能追认第二批超时具体OS调度原因，前两次exit1不改写。

根第三次完整run-all/session71802已启动，另存[full-regression-20261012-third.log](../.qa-local/full-regression-20261012-third.log)，M3仍99唯一、M4原十项，整体最终exit待根确认。本代理仅docs/静态；独立扩展有头helper就绪不等于插件清单实操通过，有头186行计数仍2通过/73部分/1失败/94条件/15待测/1延期。

## 第三批完整结果与独立第三方插件有头来源

根确认session71802 **exit1，M3 98/99、M4 10/10**：[第三批原始日志](../.qa-local/full-regression-20261012-third.log)。95本批green；唯一115-background-fit-test.mjs第135行存盘fit实际contain/期望repeat，日志2528–2610。真实保存同步/竞态仍由extensions_review核对，未修复关闭，不能宣布全99绿。前两批94/99、98/99及exit1不改写。

根独立PROFILE102[run descriptor](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/descriptor.json)实际可见IAB4验证第三方用户面板第十导航；自有配置仅label/hasApiKey、所属probe工具可用，[正向JSON](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-positive-results.json)。五项全局API/未声明key/theme/token/其它插件工具实际拒绝，[边界JSON](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-boundary-results.json)、[PNG](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-boundary.png)。E09/E15/K05补partial；ui.panel由helper预授，E08授权UI仍待测，有头HTTP/send/取消/热更及theme失败后普通保存未验。

E10实际plugin pin默认→QA_DEFAULT、skills清pin→QA_CUSTOM、停用custom→QA_DEFAULT、再启用恢复自动QA_CUSTOM，[pin](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-single-pinned.json)/[unpin](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-single-unpinned.json)/[fallback](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-single-fallback.json)/[restore](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-capability-restored.txt)为真实UI与所属工具结果，不是仅文案。E11实际45秒pending/ready、预期failed与默认恢复有[后端](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-managed-backend-status.json)/[pending](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-managed-pending.txt)/[ready](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-managed-ready.txt)/[failed](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-managed-failed.txt)；未授权/pending中停用/备用owner余项仍未执行，两行保持partial。

E12实际A→B协作链展示无pin，[region文本](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-capability-initial.txt)支持展示partial，不支持真实LLM/旧pin/转换guardclaim执行。E05 apiVersion999/setup错误、错目录已见[错误清单](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-plugin-errors.txt)/[skills诊断](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-wrong-directory.txt)，补partial；根随后fresh probe的[hook卡片](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-hook-error-active.txt)实际已加载/启用/可用是并显示QA_EXPECTED_BEFORE_TOOL_ERROR。先前错误清单是重扫后lastError已reset的快照，新旧两份语义区分；其它类型矛盾/第三方兼容未验。上述为可见浏览器而非native，由根操作，本代理仅docs/静态。

helper初seed缺settings、上个run合成token误用401已按own准备修正，不算产品鉴权bug。根随后own controlshutdown生产stop→child5020 exit0/supervisor47280结束，[descriptor](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/descriptor.json)已stopped/workerExited=true/instanceLockPresent=false；实际IAB4 SSE断开后已关闭，所有proof保留。Z02/Z03只prepared未有头。186行当前2通过/78部分/1失败/94条件/10待测/1延期，M3仍99唯一，不能将其与98/99自动文件结果换算。

## 115同步修复、132迁移修复与Z02独立有头证据

115正式冻结仅测试文件，生产未改；新测试匹配本轮真实保存POST body/ack、“已保存”与内存/磁盘/CSS，暂留repeat保存时后台stillcontain、前端tiling，释放后repeat。[旧即时断言在真实held保存下red](../.qa-local/129-baseline-evidence/115-held-real-save-before-repair.log)准确contain!==repeat，[115有效修后](../.qa-local/129-baseline-evidence/115-after-save-sync.log)green，111/71/117/69关联green。第三完整批exit1/98/99仍保留，不由该定向结果改写。

132production仅[src/kernel/migrator.js](../src/kernel/migrator.js)数组stripKeys早退一行修，新增[132](../test/132-migration-derived-array-test.mjs)实际import/config/API/kernel.start/HTTP/lock 5/5。[修前](../.qa-local/132-baseline-evidence/132-before-repair.log)providers.0.hasApiKey=true红，[修后](../.qa-local/132-baseline-evidence/132-after-repair.log)false/5场景green；[03](../.qa-local/132-baseline-evidence/03-final.log)/[09](../.qa-local/132-baseline-evidence/09-final.log)/[23](../.qa-local/132-baseline-evidence/23-final.log)/[125](../.qa-local/132-baseline-evidence/125-final.log)关联通过。正式回归132与先前QA操作标记132不同。runner现100文件/100唯一/缺失0、132一次，只做静态核对，第四100+M4未启动。

根旧[own recoveryrun](../.qa-local/data-recovery-headed-1791774366183-02e5c664/descriptor.json)实际IAB5见1健康session/30tokens、坏session当空跳过不崩原file保留；root GET坏4101messages触发按SPEC §12空重建，再IAB刷新两聊天/4101空/4102两原文撤回+我标记保留。坏档触发是root API，未冒称UI直接触发。config先备份60B/hash matchesOriginalBadConfig=true再默认设置空api.base/model，见[初始状态](../.qa-local/data-recovery-headed-1791774366183-02e5c664/evidence/headed-initial-status.json)、[健康session](../.qa-local/data-recovery-headed-1791774366183-02e5c664/evidence/corrupt-healthy-session.txt)、[空archive](../.qa-local/data-recovery-headed-1791774366183-02e5c664/evidence/corrupt-empty-archive.txt)、[健康archive](../.qa-local/data-recovery-headed-1791774366183-02e5c664/evidence/corrupt-healthy-archive.txt)、[默认UI](../.qa-local/data-recovery-headed-1791774366183-02e5c664/evidence/corrupt-default-settings.txt)。bundled全停用/noop transport明示为隔离QA覆盖。旧双profile正常shutdown/锁清、IAB5断开后关；对应Z02全部本地损坏条件有实际证据，升local通过。

旧迁入配置providers数组派生flag残留实际缺陷有根报告及132修前重现，Z03记failed（源已修待headed）；fresh recoveryrun1791776254167-e41025fd仅prepared未启动，不提前关闭。186行现3通过/78部分/2失败/94条件/8待测/1延期，第四全套尚未启动，不写100/100全绿。

## 132修后Z03新own窗口/保存/实际运行复验

根fresh PROFILE104[own run](../.qa-local/data-recovery-headed-1791776254167-e41025fd/descriptor.json)实际可见IAB6复验providers派生false/obsoleteStream=false/thinkingMode=on；旧聊天4201原文/撤回/我、旧memory成员/备注与LEGACY_MEMORY、人设全局身份/旧模板/两种personaByChat JSON键可见。[chat](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/migration-chat-4201.txt)、[memory](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/migration-memory.txt)、[settings](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/migration-persona-settings.txt)。实际普通customRules追加SAVE_ROUNDTRIP至已保存，[before](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/before-ui-save-status.json)/[after](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/after-ui-save-status.json)6secretHash全保持、source不变。初脚本hashfalse是新PowerShell进程缺变量，后以before JSON正确重核true，[最终verdict](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/migration-verdict.json)已更新，不算产品密钥故障。

root stimulus4201/4202后真实runner向合成LLM两request、各30tokens终态0send；实际UI展开system数字键NUMERIC_SYSTEM+ROLE+安静/chatkey CHATKEY_SYSTEM+ROLE+活跃，均全局小鲸鱼身份、无MUST_NOT_OVERRIDE。[4201](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/migration-runtime-4201.txt)、[4202](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/migration-runtime-4202.txt)、[PNG](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/migration-runtime.png)、[最终状态](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/migration-final-status.json)为根可见浏览器来源。Z03具体数组派生flag缺陷closed→partial，真实旧账号/登录态/真实QQ与模型仍未验，19bundles停用为QA覆盖。

fresh双profiles正常shutdown、lock=false、session99439 exit0/IAB6已关，helpers全部stop。主QA只复制migrator132/main131而live78000仍旧实例，最终正常重启待做；第四100+M4仍未启动。当前186行3通过/79部分/1失败/94条件/8待测/1延期，C09含图合同缺口与C10登录合同失败保持，runner100唯一未全套执行，本代理仅docs/静态。

## 最新主QA重启、第四完整回归与链接静态核对

根旧PID78000正常nativeclose/锁清后，用最新main131/migrator132重启为PID44396；own helpers均已stop，仅原QA fixture36000/主实例44396保留。实际nav/SSE/PNG只读复验尚待根观察，本批只记录正常退出/重启进程事实。

根第四完整run-all/session90402实际**exit0，M3 100/100、M4 10/10**，[独立第四批日志](../.qa-local/full-regression-20261012-fourth.log)220237B、mtime2026-10-12 12:10:01+08:00，M3在3277行/M4在3315行。前三次94/99、98/99、98/99 exit1日志保留；第四全套通过与各次独立修复证据分别归档，不aggregate为全功能/完整规格验收通过。

本代理只静态审三份验收Markdown：571 个本地链接引用/187 唯一目标路径/缺失0（忽略外部URL，去除fragment与行号后核文件存在），130新PNG在run根目录的路径正确；这不验证anchor或内容。runner100文件/100唯一/缺失0，186清单3通过/79部分/1失败/94条件/8待测/1延期不变。第四期间无并行行为测试或生产edit。

根最新PID44396/window9832878原生九nav/SSE连接/25sessions/runtime paused=false、running=[]。首次原生用量7天¥0.006940/22runs/48calls、4680in/1120out/720cached/15%，与重启前IAB统计相同，图表4模型正常，[原生截图](../.qa-local/headed-20261011/native-usage-after132.png)已保存；U06仅首次打开与重启金额补partial，删session档案/匿名共存仍未headed。S12慢proxy仅准备，G29/H04取消未执行。

当前186行3通过/80部分/1失败/94条件/7待测/1打包延期；自动M3完整100/100、M4完整10/10。C10登录合同失败、C09含图发布缺口/真实外部与剩余操作条件保持。所有临时helpers已stop，仅原QA fixture36000/主44396保留，生产132/main131等冻结，无新sourceedit；本代理只文档/静态。

## 最新H04/G29取消与S12迟到真实交付边界

根原生H04清空确认/取消、G29重置确认/取消的[journal497](../.qa-local/headed-20261011/ui-actions.jsonl#L497)/[500](../.qa-local/headed-20261011/ui-actions.jsonl#L500)及[清空PNG](../.qa-local/headed-20261011/native-clear-cancel-dialog.png)/[重置PNG](../.qa-local/headed-20261011/native-reset-cancel-dialog.png)保留；[实际API与计数核对](../.qa-local/headed-20261011/clear-reset-cancel-verification.json)botName QA 小鲸鱼/qa-local/qa-chat、paused=false/running=[]，聊天823/36/17、resetCancelled=true/deletionExecuted=false。只证明确认/取消范围，两行partial，不声称最终删除/备份/重置全绿。初JSONnull来自核对脚本text/plain未parse，最终已正确，不算产品故障。

根可见IAB own slowproxy真实A200 held→B200完整交付04:27:20.538Z→500ms后A04:27:21.045Z释放并交付，A/B clientDisconnected=false，[真实事件](../.qa-local/slow-detail-headed-20261012042503212-c3df4e6a/events.jsonl)/[状态](../.qa-local/slow-detail-headed-20261012042503212-c3df4e6a/headed-status-after-ui.json)。两次真实UI点击后迟到A没有覆盖B，heading仍mv4lxvqd-7473a9db/detailQA-HEAD-130-CONTEXT-CHECK：[UI](../.qa-local/slow-detail-headed-20261012042503212-c3df4e6a/headed-after-late-a.txt)/[PNG](../.qa-local/slow-detail-headed-20261012042503212-c3df4e6a/headed-after-late-a.png)。S12该case通过→partial，刷新中编辑/弹窗/其它竞态未验。own helper正常stop/exit0/tab7关闭，sourceKernelStopRequested=false，主kernel未停。

A13旧五入口原生dispatch/externalOpened=false、G27已有自启/托盘/主题消费者限定证据静态补回partial，不制造新UI动作；视觉显示消费者新修仍进行中待实证。当前186行3通过/85部分/1失败/92条件/4待测/1延期，第四100/100+M4 10/10仍为截至132冻结源码的完整自动事实，不为后续显示修复提前补全套结果。本代理仅docs/静态审计，未跑行为测试或触碰liveQA。

## 133收录静态核对与G29实际Explorer来源

133五UI生产源正式冻结、局部green由根确认：[133测试](../test/133-cache-vision-ui-test.mjs)真实kernel/catalog/usage+隔离Chromium、合成HTTP。修后headed结果仍待根消息，U07不由此关闭；runner静态101文件/101唯一/缺失0、133一次，未执行101全套。第四100/100+M4 10/10截至132，第五101待跑，首次三个exit1均保留。

G29根原生点打开数据目录后真实Explorer10815482标题/AX路径准确QA data、19项，[journal503](../.qa-local/headed-20261011/ui-actions.jsonl#L503)、[激活后真PNG](../.qa-local/headed-20261011/native-open-data-explorer.png)。该case是真资源管理器打开，非仅recorder；G29仍partial，重置取消以外最终备份/清理未验。capture先审批等待timeout90秒再重观成功，不是approval rejection或产品失败；AltF4已dispatch、是否关闭仍待根核对。186清单3通过/85部分/1失败/92条件/4待测/1延期不变，本代理未行为测试。

## 第五完整批与133修后原生/浏览器证据

根session40444第五完整run-all实际**exit0，M3 101/101、M4 10/10**：[第五原始日志](../.qa-local/full-regression-20261012-fifth.log)220733B/2026-10-12 13:37:05+08:00，结论3287/3325行。包含133冻结源；第四截至132的100/100、前三exit1分别保留，未重复运行或将批数aggregate为全功能/全规格通过。

根nativeF5/window9832878顶栏今日16.7%=400cached/2400prompt：[原生截图](../.qa-local/headed-20261011/native-cache-hit-133.png)/[真实API](../.qa-local/headed-20261011/cache-hit-133-api.json)，与7日15%不同范围合理。实际IAB1目录10徽标，qa-local3支持/qa-fail HTTP503未知/B同名未扫，真实[开启DOM](../.qa-local/headed-20261011/browser-vision-catalog-on-133.txt)/[PNG](../.qa-local/headed-20261011/browser-vision-badges-133.png)；label关→saveACK→0img/options原ID，[关闭DOM](../.qa-local/headed-20261011/browser-vision-catalog-off-133.txt)；开→saveACK/reload→10img恢复/qa-chat，showVision=true/autoStart=false/closeToTray=false：[恢复DOM](../.qa-local/headed-20261011/browser-vision-catalog-restored-133.txt)/[API](../.qa-local/headed-20261011/vision-restored-133-api.json)。U07补partial/G27指定消费者旧缺口关闭；未新scan、no-vision仅自动，真实模型/F206其余消费未验。

ownedExplorer10815482 AltF4后根列表确认不存在，旧8653216未触。E06/E13 fresh own取消操作仍进行中、未真实安装/删除。本批186行3通过/86部分/1失败/91条件/4待测/1延期，M3完整101/101+M4 10/10不改其它条件；本代理只docs/静态。

最终133文档同步后链接静态核对：638 本地引用/205 唯一文件路径/缺失0；去fragment与行号只核路径存在，外部URL未由此验证。runner101文件/101唯一/缺失0，本代理未重跑任何行为测试。

## 最终E06/E08/E13限定取消/只读来源

根fresh [own run66b6](../.qa-local/extension-headed-20261012053034556-66b6a63e/descriptor.json)可见UI8实际用户qa-head-single-custom卸载确认→取消，[PNG](../.qa-local/extension-headed-20261012053034556-66b6a63e/headed-uninstall-confirm.png)/[后UI](../.qa-local/extension-headed-20261012053034556-66b6a63e/headed-uninstall-cancel-after.txt)仍已加载/启用/可用是，codefile存在；[最终verdict](../.qa-local/extension-headed-20261012053034556-66b6a63e/headed-cancel-final-verification.json)明确采用UI/文件存在、未作有效API状态核对（驱动错误地址/api/skills404），该404非产品bug。E13只取消partial，未实际卸载。

E08实际宿主授权readonlydialog显示fingerprint/ui.panel预授allow/三controls→关闭0dialogs，[DOM](../.qa-local/extension-headed-20261012053034556-66b6a63e/headed-permissions-readonly.txt)/[PNG](../.qa-local/extension-headed-20261012053034556-66b6a63e/headed-permissions-readonly.png)。未allow/deny/ask操作，预授不算UI修改，partial仅入口/指纹/关闭。

E06 IAB filechooser10秒timeout，根nativeOSpicker实际打开ZIP(*.zip)但受filename cached-state/owned child定位限制，activate/Alt+n未可靠定位；未路径输入/未选ZIP，Escape实际取消回10cards/8loaded/error0：[journal509](../.qa-local/headed-20261011/ui-actions.jsonl#L509)/[限制](../.qa-local/headed-20261011/native-zip-picker-ownership-limit.txt)。只有picker打开/取消partial，未安装确认/安装/恶意包验证，pickerPNG尚未归档。旧helper default spawn EPERM/starting无worker为环境约束，fresh正常stop/workerExited=true/lock=false/session8007 exit0/tab8关闭。行为与证据局限如实保留，source133第五101/101+M4 10/10未改、未重复测试。

186行现3通过/89部分/1失败/91条件/1待测(E17)/1延期；剩真实外部/最终操作/合同差异按各partial行保留，不称每个功能全部符合。以上root实际有头来源，本代理仅静态/docs。

最终取消补验后静态核对：663 个本地链接引用/212 唯一目标文件/缺失0；runner101文件/101唯一/缺失0，scoped diff与尾随空白检查无问题。该检查只核本地路径存在，未重跑行为测试。

## 134冻结、旧群发名称故障与第六完整回归待跑

根实际S09清除终态确认取消后25会话/persist保持：[确认](../.qa-local/headed-20261011/browser-session-clear-confirm.txt)/[取消后](../.qa-local/headed-20261011/browser-session-clear-cancel-after.txt)，补partial仅取消；实际删除/用量历史保留未验。旧群发空内容/无目标校验与有效草稿二次确认取消/选择保留/关闭0dialog实际完成，[旧目标DOM](../.qa-local/headed-20261011/browser-broadcast-name-before134-confirm.txt)/[计数无变化](../.qa-local/headed-20261011/session-broadcast-cancel-status.json)发送10/模型47/marker0。

旧UI只有数字/内部key而API已有标准{id,name}，合同源[notes09b R17/R18](../../dsh-spec/notes/09b-route-contracts.md#L138)，不借F140聊天条目描述群发。134 production仅sessions/panel.js一行消费name，负责代理actual before red/after green+80/123green；[134测试](../test/134-broadcast-target-names-test.mjs)已runner收录，102文件/102唯一/缺失0、134一次。修后headed待root，S11当前failed（校验/取消指定case已过），不可源freeze提前关闭。

第五101/101+M4 10/10截至133完整结果保留；第六102项全套尚待运行，不合并局部green变102/102。新own纯合成destructive clone只准备/启动，尚未delete/reset/install/最终确认，不记已验。该时点186行3通过/90部分/2失败/89条件/1待测/1延期；本代理只有docs/静态。

## 第六102完整通过与134目标名实际复验

根source134同步后旧IAB临时bootstrap超过30分钟reload401属预期TTL，fresh授权后实际四目标中文名正确，关闭0dialogs：[修后DOM](../.qa-local/headed-20261011/browser-broadcast-name-after134.txt)/[PNG](../.qa-local/headed-20261011/browser-broadcast-name-after134.png)。S11数字名故障headed关闭→partial，空目标/空消息/二次确认取消等旧实证保持；无实际群发或真实QQ送达。

根session26339第六完整run-all实际**exit0，M3 102/102、M4 10/10**：[第六原始日志](../.qa-local/full-regression-20261012-sixth.log)221175B/2026-10-12 14:44:42+08:00，结论3293/3331行；截至134最新源冻结。前五批日志保留，包含前三次失败，不将多批通过aggregate为全功能或完整规格已验。186行当前3通过/91部分/1失败/89条件/1待测/1延期，C10登录合同与C09含图公开发布/真实外部余项保持。

新的纯合成删除clone实际native7session/3聊各14msg、6members9imp/initial29files：[session范围](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-synthetic-session-scope.png)/[chat范围](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-synthetic-chat-scope.png)。group10001清空确认已打开未确认，[PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-clear-awaiting-approval.png)/[text](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-clear-awaiting-approval.txt)/[pending state](../.qa-local/destructive-headed-20261012062252328-8b5b758d/pending-review-state.json)记录审批awaiting、helper destructive=false。根已请求限定该clone dataDir聊天/记忆/会话delete及最后reset批量授权，尚未收到人类答复，未记录已批准/已删/已重置/已安装。原QA44396/36000仍运行且pausedfalse/running[]/normal/null、send10/model47保持；clone仍运行/确认待答，不称已清理。本代理只docs/静态。

第六完整批文档同步后静态审计：701 个本地链接引用/226 唯一目标文件/缺失0；runner102文件/102唯一/缺失0。去fragment/行号仅核本地文件存在，不验证外部URL或审批状态；无行为测试或服务启动。

## 最新限定授权与待验断言

根转达用户已明确允许仅destructive-headed-20261012062252328-8b5b758d/data的合成聊天/记忆/会话删除清理及最后reset，42消息/7会话/6成员9印象/测试配置密钥，外侧initialsnapshot29files保留。当前授权已收到、尚未收到执行结果；旧[pending state](../.qa-local/destructive-headed-20261012062252328-8b5b758d/pending-review-state.json)是批准前历史快照，不代表当前继续awaiting。root独占UI/liveQA，代理只docs/源码静态读取。

完整本地断言：H04目标14→0/他群私聊各14/记忆6/9+sessions7保持；N04单member仅该chat/user、同QQ其它档保留，再整chat清后4members6imp；S09单terminal7→6→剩余终态0/detail清，但历史usage金额与tokens保留，当前7全终态不足以验running/waiting拒删；G29最后reset先有真实sibling backup，按操作当时pre-reset而非初始29file基线核内容，lock排除且live lock按源码保留，按回复要求重启后验默认配置/秘密清理与档案空。这里只静态列断言，未操作或运行测试；实际证据将由root补，186行仍3通过/91部分/1失败/89条件/1待测/1延期，第六102/102+10/10不变。

## Clone前两项实际完成与中断边界

根真实native group10001清空：实际操作前15（seed14+预置合成提醒1）→0/刷新0/nextLocalId1，另两聊天各14/文件hash不变：[PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-chat-cleared.png)/[三档快照](../.qa-local/destructive-headed-20261012062252328-8b5b758d/after-chat-clear-file-counts.json)。H04该执行链通过，但全记忆隔离余项尚未完整证明，整行partial。

根group10001 memory成员20001实际delete，6/9→5/7、其余两聊天4files hash不变：[PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-member-deleted.png)/[5files snapshot](../.qa-local/destructive-headed-20261012062252328-8b5b758d/after-memory-member-delete.json)。整群clear确认开后被user-input guard中断，未执行，恢复待root重观。名为[after-chat-memory-clear.json](../.qa-local/destructive-headed-20261012062252328-8b5b758d/after-chat-memory-clear.json)的文件仍5files/7imp，不作为整群清空成功证据。既有精确授权在“继续”后持续有效，不重复问；会话清理/最终reset未有实际结果。source134与第六102/102+10/10保持，186行3通过/91部分/1失败/89条件/1待测/1延期不变。本代理仅docs/证据只读，无UI/live/API/服务/测试。

## 新恢复操作与G29真实reset故障

中断期间memory已空/部分chat清空未归因，不算root已操作。root先UI恢复group10001原seed20002/QA小周一印象，[恢复DOM](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-memory-restored-for-clear.txt)，再whole group1→0：[清后DOM](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-whole-memory-clear-confirmed.txt)/[PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-whole-memory-clear-confirmed.png)。其它memory原已空，memberFiles0不作为跨对象原记录隔离证据。N04实际整group操作case补partial，早期误名五files快照仍按历史解释。

root真实session单7→6、clear6→0，[sessions DOM](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-sessions-cleared.txt)/[PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-sessions-cleared.png)，[before](../.qa-local/destructive-headed-20261012062252328-8b5b758d/usage-before-session-delete.json)/[after](../.qa-local/destructive-headed-20261012062252328-8b5b758d/usage-after-all-session-clear.json)7runs/14calls/¥.00455/in2730/out490/total3220/cache420及usage-day hash不变，[实际usage UI](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-usage-after-session-clear.txt)。[verdict](../.qa-local/destructive-headed-20261012062252328-8b5b758d/session-cleanup-verdict.json)明确只有初始终态/未running拒删；S09/U06限定partial。

root最后reset实际EPERM unlink electron-user-data/Cache/Cache_Data/data_0：[失败DOM](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-reset-failed-before-repair.txt)/[PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-reset-failed-before-repair.png)/[preReset范围](../.qa-local/destructive-headed-20261012062252328-8b5b758d/pre-reset-scope.json)。备份后删除失败且可能部分删config，不能判完成；G29 failed，135两阶段内核清理/136诚实restartUI修复未完成。当前只有test136存在/test135未齐全，runner暂保102，不收未完文件或全套。第六102/102+10/10截至134保留，最新186行3通过/90部分/2失败/89条件/1待测/1延期；所有新的UI/数据动作root执行，代理无live/API/服务/测试。

## 135后端7/7冻结与104候选runner

根确认135七生产源finalfreeze，[hash清单](../.qa-local/135-production-source-hashes.json)保留；[修前](../.qa-local/135-reset-before.log)真实kernel HTTP500/configExists=false/lockedCacheExists=true红，[修后](../.qa-local/135-reset-after.log)7/7绿，[相关32](../.qa-local/135-related-32.log)25/25。新两阶段先quiesce+备份/校验marker/封闭业务，返回resetAccepted=true/resetCompleted=false/restartRequired=true，完整退出后新启动先于Electron userData与kernel仓库/日志清理；PID/路径/备份digest/claim校验失败不清、保留marker/backup拒启动。独立隔离回归与root actual headed复测分别计，G29仍failed。

136两UI源实现但source未finalfreeze/行为未验证，测试文件存在；按root显式要求[135](../test/135-reset-lifecycle-test.mjs)+[136](../test/136-reset-result-ui-test.mjs)一起加入runner。静态104文件/104唯一/缺失0、各一次，尚未完整104运行，不能把candidate收录当136已绿。第六102/102+10/10截至134保留，186行3通过/90部分/2失败/89条件/1待测/1延期不变；本代理只文档/runner静态，无root UI/live/API/服务/测试。

## 135/136最终回归与第九完整104项通过

候选阶段历史保留。135[最终日志](../.qa-local/135-reset-after.log)8/8，增加preparing期间新SSE消费者收到真实最终状态；136[最终日志](../.qa-local/129-baseline-evidence/136-after-reset-result-consumer.log)四组均绿，覆盖真实HTTP接受未完成/备份失败、持久结果、确认期间自动保存暂停/取消保稿、实际SSE及迟到HTTP不重新锁失败表单。相关117/52/133定向通过由负责代理提供；未由本代理运行。原独立/events正常，不把SSE409排查假设记作产品故障。

第七[完整日志](../.qa-local/full-regression-20261012-seventh.log)/[结果](../.qa-local/full-regression-20261012-seventh-result.json)exit1，M3 64/104、M4 10/10，大量sandbox spawn EPERM为环境阻断。第八同冻结源码、正常本地权限[日志](../.qa-local/full-regression-20261012-eighth.log)/[结果](../.qa-local/full-regression-20261012-eighth-result.json)exit1，M3 103/104、M4 10/10；唯一131夹具遗漏新增生产config/data-reset依赖，目标case未运行。只补测试依赖闭包，原13case断言保持，新增非法pending前置校验第14case：[修前红](../.qa-local/131-dependency-before.log)/[修后14/14](../.qa-local/131-dependency-after.log)/[差异](../.qa-local/131-dependency-fixture.diff)。没有放松报告一次/退出/实例锁合同或增加产品源修复。

第九session8858于13:26:48Z完成，[完整日志](../.qa-local/full-regression-20261012-ninth.log)3364/3402为**M3 104/104、M4 10/10**，[结果JSON](../.qa-local/full-regression-20261012-ninth-result.json)两组exit0、normalLocalProcessPermissions=true/includes131DependencyFixture=true。M3仍104文件/104唯一，第四100/第五101/第六102完整绿与其余失败批原始证据分别保留。自动模块/HTTP/headless/native mock通过不冒充全186项有头完成，不打包。

## 修后G29真实两阶段结果的有限有头范围

root同授权clone实际原生确认83232重置，[接受DOM](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-repaired-reset-accepted.txt)/[PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-repaired-reset-accepted.png)、[快照](../.qa-local/destructive-headed-20261012062252328-8b5b758d/repaired-reset-accepted.json)证明先保留16业务文件/备份hash一致、pending prepared、accepted但未completed；OneBotfalse/pausedtrue/fixtureclients0。File→Exit后旧83232/lock消失、pending仍在：[正常退出](../.qa-local/destructive-headed-20261012062252328-8b5b758d/repaired-pending-normal-exit.json)。正常权限再次启动同data得到80504/native3346260，[完成快照](../.qa-local/destructive-headed-20261012062252328-8b5b758d/repaired-reset-completed.json)旧Key全部清/providers0/model空、messages/memory/sessions/usage文件0，Electron proof/marker消失、原备份仍在且业务hash保持。

实际原生会话0条[DOM](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-repaired-reset-empty-sessions.txt)/[PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-repaired-reset-empty-sessions.png)，IAB聊天0/0已读；最后记忆/用量/设置GUI待root补，不从文件0推断全部空态UI通过。原主QA[54文件对比](../.qa-local/destructive-headed-20261012062252328-8b5b758d/main-qa-after-repaired-reset.json)changed=[]、锁44396保持。旧reset EPERM红证据保留，G29指定修后链关闭并暂partial；当前186行3通过/91部分/1失败/89条件/1待测/1延期。本代理只有docs/静态，无live/API/UI/服务/测试。

## G29最后三页实际空态与当前验收统计

root补齐原生[默认设置DOM](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-repaired-reset-default-settings.txt)/[PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-repaired-reset-default-settings.png)：空Base URL/model、Key未配置、无渠道、保存enabled、无pending；实际可见IAB[记忆0文件/0整理](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-reset-completed-memory.txt)，[用量全部历史DOM](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-reset-completed-usage-all.txt)/[PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-reset-completed-usage-all.png)成本/运行/调用/输入/输出/cache均0。原生session0、IABchat0/0保持，后者仅root工具transcript，无单独txt链接。主QA54个业务hash unchanged/锁44396保持。G29限定本地源码/授权合成副本through，历史EPERM失败保留。

完成时点明确区别：旧[notes09b R-03](../../dsh-spec/notes/09b-route-contracts.md#L39)描述备份后即刻清空并返回200；当前为保护活Electron缓存采用安全两阶段，200为resetAccepted=true/resetCompleted=false/restartRequired=true，业务先保留，彻底退出后下一PID完成清理并回到defaults。接口仍保留backupDir/message，UI持续诚实提示重启；本轮没有把接受回执等同清理完成，也没有声称旧立即清理时序原样保留。

root最终确认第九完整104/104+M4 10/10 exit0，13:26:48Z，生产源码全冻结。186行现**4通过/90部分通过/1失败/89条件不足/1待测/1延期**，外部前提/剩余GUI及C09/C10合同余项仍未关闭；root所属clone/fixture正常收尾进行中，备份/初始快照/旧源保留，主QA继续运行。不再行为测试，本代理只文档静态核对。

## 2026-10-14 紧凑UI定向验证与功能清单重新接续

上节“冻结/不再测试”是2026-10-12历史阶段。用户现要求UI修复后继续原186行有头测试；root已在[新的独立合成副本](../.qa-local/headed-resume-20261014/fixture/live.json)使用实际可见IAB访问15667，而不是沿用已关闭实例或只凭进程存在推断界面成功。数据目录外侧[初始快照](../.qa-local/headed-resume-20261014/initial-seed-snapshot.json)保留30文件；所有新配置/扩展操作均限于该副本，没有真实数据、公开投稿、真实QQ送达或安装包构建。

UI结果分层记录：首批[9/10](../.qa-local/compact-workspace-20261013/focused-result.json)，随后12项原批次[11/12、exit1](../.qa-local/compact-workspace-20261013/final-focused-result.json)、sourceStable=true，原失败均保留。110与141只修鼠标目标滚动/字体/两次真实绘制的驱动同步，原业务断言/动画保留；95只修一次性拦截解除与真实即时轮询相撞的夹具，固定路由加真实提交屏障后1秒×5、15秒×2为7/7，独立去revision保护仍失败：[95结果](../.qa-local/compact-workspace-20261013/95-final-repair/result.json)。这些独立通过使该UI冻结阶段12项有效定向检查完成，不能改写原批次全绿，不能当作最新完整M3或186项有头验收完成。

root实际展开/收起[几何](../.qa-local/headed-resume-20261014/evidence/ui-geometry.json)均44px顶部、同徽记坐标/36尺寸、同九行46px及footerY=675，外层溢出false；[四项键盘详情](../.qa-local/headed-resume-20261014/evidence/status-keyboard.json)均Escape返回对应按钮。模型详情明确“已配置、尚未验证连通”，合成OneBot已连通不冒称真实QQ已就绪。静态截图与几何不证明物理FPS。

### G04真实名称刷新缺陷的最小生产修复

真实有头保存显示名后仍显示旧名、手动重新读取才更新：[原始红记录](../.qa-local/headed-resume-20261014/evidence/G04-provider-name-stale.json)。独立真实HTTP诊断保留普通BODY焦点阴性结果，受控持有新provider响应、回复提交时让渠道操作按钮聚焦则稳定复现红；API/config/provider及磁盘已是新名，UI/闭包仍旧名。根因是读取后#fields焦点保护误把按钮当编辑器。只把三处焦点判断限制为INPUT/SELECT/TEXTAREA/contenteditable，保留dirty/saving/version/saveCommitRevision/reset合同：[完整诊断与前后哈希](../.qa-local/headed-resume-20261014/G04-provider-refresh-diagnostic/G04-provider-refresh-final-result.json)。

117新增真实回复提交场景先[红](../.qa-local/headed-resume-20261014/G04-provider-refresh-diagnostic/117-provider-regression-red.log)后[最终绿](../.qa-local/headed-resume-20261014/G04-provider-refresh-diagnostic/117-provider-regression-green-final.log)；真实输入在回复期间保持原连接节点、焦点和值，后续明确重新读取仍可取得新渠道。原117动作/断言全部保留。第一次修后新附加输入定位用了不存在#field-api-model，改为已有#model后通过；此驱动错误与原产品红分开，不新增产品补丁。关联69、122、137均exit0、sourceStable=true：[结果](../.qa-local/headed-resume-20261014/G04-provider-refresh-diagnostic/related-result.json)，137仍明确为Node DOM/RPC夹具。

root同步后实际UI编辑Proxy A并保存，新名“QA Resume Proxy A 已复测”自动进入列表和当前渠道下拉、noManualRefresh=true：[实际有头绿](../.qa-local/headed-resume-20261014/evidence/G04-provider-refresh-headed-green.json)、[截图](../.qa-local/headed-resume-20261014/evidence/G04-provider-refresh-green.jpg)。settings/panel.js冻结哈希BFBCC5C9A6DF1B3F71B9BA75316445CAF74119A712B8F4A51D60D7B5ABD7669F；117为69EDC424820B310B10DCD1CE7E4F27BDBF630E9FAA2AEB81C9011E6D576D01ED。此修改发生在前述UI12项验证之后，没有据旧12项结果声称新设置源已全量回归。

### 新有头子项与有限证据

- G02实际13分区与“组件”筛选/清空恢复：[记录](../.qa-local/headed-resume-20261014/evidence/G02-setting-sections.json)。G03实际新增13981/13982两个不同endpoint的渠道并A→qa-chat/B→qa-vision切换：[界面切换](../.qa-local/headed-resume-20261014/evidence/G03-channel-switches.json)、[合成磁盘元数据](../.qa-local/headed-resume-20261014/evidence/G03-persisted-channel-metadata.json)。实际本地模型测试成功不替代商业模型或真实QQ验收。G04[取消重开](../.qa-local/headed-resume-20261014/evidence/G04-provider-cancel.json)保留原值；相同endpoint初次“新增”是正常upsert，不计作独立新渠道。
- E03实际取消、[integer2.5拒绝](../.qa-local/headed-resume-20261014/evidence/E03-schema-integer-rejected.json)、[非法JSON拒绝](../.qa-local/headed-resume-20261014/evidence/E03-schema-invalid-json.txt)、七种非secret类型保存重开：[字段](../.qa-local/headed-resume-20261014/evidence/E03-schema-saved-fields.json)。[自有工具](../.qa-local/headed-resume-20261014/evidence/E03-schema-own-tool.json)读回string/number/integer/boolean/enum/object/array及hasApiKey=true；secret清除再输入与dirty-only未测。
- E02 root实际信任取消→启用确认→宿主ui.panel允许及确认→打开自有面板→停用，最终[状态](../.qa-local/headed-resume-20261014/evidence/E02-disabled-tool-and-panel-withdrawn.json)disabled/loadedfalse/工具0/面板0。任务/订阅/全部权限组合未由该样例证明。E09本批只[正向自有脱敏配置](../.qa-local/headed-resume-20261014/evidence/E09-schema-panel-sanitized.json)与[面板截图](../.qa-local/headed-resume-20261014/evidence/E09-own-plugin-panel.jpg)，不复用旧攻击结果作本轮攻击通过。

只读鉴权诊断同服务器bootstrap和连续两次普通Chromiumreload200、SSE在线、errors=[]、源码未改；受控过期/fresh tab/不可用sessionStorage可复现清URL后401：[初次](../.qa-local/headed-resume-20261014/G04-auth-reload-diagnostic/result-1791924893812.json)、[补充TTL诊断](../.qa-local/headed-resume-20261014/G04-auth-reload-diagnostic/result-1791925014094.json)。实际IAB首次几何至修后跨31分51秒，超过30分钟TTL，但未记录重载前缓存时间；不据此证明IAB存储异常，也不将401直接列为产品bug。

本批只补充已有partial行的子项，不改清单状态：**186=4通过/90部分通过/1失败C10/89条件不足/1待测E17/1打包延期**。E17尚不能以停用用户schema或捆绑MCP替代两scope真实撤权重授/旧listing/旧闭包保护；C09/C10及真实外部条件保留。全部历史exit1、旧全量exit0、定向回归与新可见有头证据分开记；本代理只写文档/静态核对，没有操作UI/API/服务或执行行为测试。

### 同批后续实际操作与一次无效验收时序

N05 root实际编辑既有20001备注为“QA 小林 · 续测备注”，重新读取后保持，旁侧20002原印象仍在：[重读](../.qa-local/headed-resume-20261014/evidence/N05-note-edit-reload.txt)、[截图](../.qa-local/headed-resume-20261014/evidence/N05-note-edit.jpg)；空串清除与全局其它档隔离未由此完成。N04印象编辑后取消、重开原两条：[原值](../.qa-local/headed-resume-20261014/evidence/N06-impression-edit-cancel.txt)，没有实际提交marker/清除。证据文件沿用当时误标N06前缀，本动作实际属于N04/F-100；本批未新增N06群成员列表结论，历史N06不改。G11新增/使用“QA 续测人设模板”，删除确认取消后重新读取模板与QA_ROLE_RESUME仍在：[状态](../.qa-local/headed-resume-20261014/evidence/G11-persona-create-use-delete-cancel.json)、[确认截图](../.qa-local/headed-resume-20261014/evidence/G11-persona-delete-confirm.jpg)，没有最终删除。

S05同一新会话mv75ygm9-7bab64c5，[20:59:17Z运行中](../.qa-local/headed-resume-20261014/evidence/S05-same-session-before.json)已经followfalse/用户提示词展开并含实际应用的QA_ROLE_RESUME；20:59:21Z自然finish为未回复/0发送后，[20:59:57Z实际界面](../.qa-local/headed-resume-20261014/evidence/S05-same-session-after.json)仍同ID/followfalse/保持展开。两次scrollTop均0，仅证明此子项，不称非零滚动位置保护已验。

首次S12草稿截图晚于终态，明确[validForTerminalRetention=false](../.qa-local/headed-resume-20261014/evidence/S12-first-draft-timing-not-valid.json)，该尝试不计通过。新60秒slow、预设finish工具会话mv760adm-8f3cbfa6的[控制记录](../.qa-local/headed-resume-20261014/evidence/S05-JSON-S12-draft-controls.json)、[终态前阅读](../.qa-local/headed-resume-20261014/evidence/S05-json-reading-before.json)及[终态前草稿](../.qa-local/headed-resume-20261014/evidence/S12-draft-before-terminal.json)显示21:00:54Z仍running/endedAtnull、JSON模式/非零top469/followfalse/有效未提交草稿。

60000ms实际触发请求超时/多层重试边界；root在21:04:26Z仅把夹具未来请求delayMs改为250，已等待请求仍原60秒、slow模式/toolCall不变：[恢复记录](../.qa-local/headed-resume-20261014/evidence/S05-S12-future-delay-recovery.json)。其后真实finish工具自然使同ID于21:05:24.490Z成为noreply，未写入假终态；这是受控恢复后的终态刷新保留验收，不是原60秒单次成功，也不是完整超时重试用尽验收。

root21:05:34Z实际[终态后JSON](../.qa-local/headed-resume-20261014/evidence/S05-json-reading-after.json)仍同ID/jsonMode=true/follow=false/top469/sent0；[终态后弹窗](../.qa-local/headed-resume-20261014/evidence/S12-draft-after-terminal.json)仍open、VALID未提交草稿/checked[true,false,false,false]与before相同，[实际截图](../.qa-local/headed-resume-20261014/evidence/S12-draft-after-terminal.jpg)已归档。[发送核对](../.qa-local/headed-resume-20261014/evidence/S12-no-send-after-terminal.json)draftSends=0，会话sent0。S05非零JSON阅读与S12草稿/勾选/弹窗保留指定子项实际通过，首次无效尝试和控制变化保留；whole-row仍partial、186统计不变。

### G07 / G08实际请求覆盖及新统计冻结点

G07 root实际UI新增B/qa-vision与A/qa-chat两个候选、上移排序，[保存JSON](../.qa-local/headed-resume-20261014/evidence/G07-fallback-order-saved.json)同顺序；再移除B并保存，[JSON](../.qa-local/headed-resume-20261014/evidence/G07-fallback-remove-saved.json)仅A/qa-chat。主渠道B/qa-fail经[本地@刺激](../.qa-local/headed-resume-20261014/evidence/G07-fallback-trigger.json)启动真实应用运行，实际qa-fail HTTP503三次后qa-chat HTTP200；mv769bak-b882c834最终providerId=A、modelqa-chat/calls4/sent0：[真实请求与恢复](../.qa-local/headed-resume-20261014/evidence/G07-fallback-actual-requests-and-restored.json)、[实际有头详情](../.qa-local/headed-resume-20261014/evidence/G07-fallback-headed-detail.txt)、[截图](../.qa-local/headed-resume-20261014/evidence/G07-fallback-headed.jpg)。GUI已恢复主B/qa-vision/fallback[]。只关闭该故障类别/单候选链，不关闭全部降级组合、商业模型或真实QQ条件。

G08六参数经GUI保存0.35/2/5000/on/low/128，[合成入站](../.qa-local/headed-resume-20261014/evidence/G08-parameter-trigger.json)后的[真实模型请求](../.qa-local/headed-resume-20261014/evidence/G08-actual-parameter-request.json)为neutral qa-vision、temperature0.35、streamfalse/tool_choiceauto/HTTP200；[实际会话](../.qa-local/headed-resume-20261014/evidence/G08-parameters-headed-detail.txt)/[截图](../.qa-local/headed-resume-20261014/evidence/G08-parameters-headed.jpg)mv76bp80-adf15b87为finish/noreply、1调用/0发送。thinking供应商方言/优先级及maxRounds/timeout全部边界未实证；控件保存不能替代这些请求级验证。六参数已GUI还原[原始](../.qa-local/headed-resume-20261014/evidence/G08-original-parameters.json)0.8/6/60000/auto/空/0，[恢复控件](../.qa-local/headed-resume-20261014/evidence/G08-restored-parameters.json)相符。

root据此将G07/G08条件不足→部分通过，当前**186=4通过/92部分通过/1失败C10/87条件不足/1待测E17/1延期**；97行已覆盖/尝试=4+92+1，不写97通过。上节90部分/89条件保留为先前冻结点，不改写旧结果。纯合成限定证据、真实外部前提、原UI定向/历史全量证据层级不变；本代理只写文档/静态核对，不改清单、生产或测试，也没有行为测试/GUI/API/服务操作。

### G12有头新红、最小同步修复与当前统计

root真实键盘滑条0/10/20/50/90/100的[原始边界](../.qa-local/headed-resume-20261014/evidence/G12-slider-initial-boundaries-before-fix.json)/[有头红](../.qa-local/headed-resume-20261014/evidence/G12-slider-probability-stale-red.json)/[红截图](../.qa-local/headed-resume-20261014/evidence/G12-slider-probability-red.jpg)证明摘要与独立概率框不同步：50摘要43%而框0，90/100摘要4档而框43。根因renderResponse.update只更新档位/读数，未同步独立概率框。生产仅提前创建概率框并在未聚焦编辑时同步派生概率；保留tierFor/逆映射/配置唯一写入/0.1步长/自动保存/全部脏稿与版本保护及G04真实输入helper，没有派发合成事件/递归或增加保存：[最终记录](../.qa-local/headed-resume-20261014/G12-response-probability-diagnostic/G12-response-probability-final-result.json)。

69原动作/断言保留，新增即时50→43精准[红](../.qa-local/headed-resume-20261014/G12-response-probability-diagnostic/69-probability-red.log)后完整[绿](../.qa-local/headed-resume-20261014/G12-response-probability-diagnostic/69-probability-green.log)；同真实输入的64草稿在真实SSE下保持连接节点，后续提交/真实POST与派生值正确。关联117/137均exit0、前后源码稳定：[关联](../.qa-local/headed-resume-20261014/G12-response-probability-diagnostic/related-result.json)，137仍Node夹具。最新settings哈希AF88C16847F1D5DA51CB5B6964062E9BA47F461141599F6AABDE98F3319C5111，69为D85A6A8FD6B0BD0DD2F7060B169F38D6A0B383CA5C36BD0DB787E2C299EF0377；117未改。新定向结果不替代新完整M3或UI12项全套。

root同步/重载后实际有头六个Home/PageUp/End边界即时UI与保存值：[绿记录](../.qa-local/headed-resume-20261014/evidence/G12-slider-six-boundaries-headed-green.json)0/10→tier1、20→tier2/UI概率0，后端低档randomPercent仍旧合同10；50→tier3/UI及后端43%，90/100→tier4/100%。不能将低档UI0与后端10误记为修复失败或声称所有UI概率等于后端；本修复未改变后端合同。

逆向初次fill/Tab未提交原生change，[观察](../.qa-local/headed-resume-20261014/evidence/G12-probability-reverse-initial-not-committed.json)保留，不计成功或新产品bug。实际数字ArrowUp/ArrowDown再鼠标保存提交后[绿](../.qa-local/headed-resume-20261014/evidence/G12-probability-reverse-headed-green.json)为概率50→slider55/tier3/50%、真实backend55/3/50；[截图](../.qa-local/headed-resume-20261014/evidence/G12-response-probability-green.jpg)归档，GUI最后[恢复100/4档100%](../.qa-local/headed-resume-20261014/evidence/G12-response-restored.json)。关键词/统一/分群/真实群响应与骰子次数等仍未完整验收。

另G11 root实际使用出厂“小鲸鱼”后textarea全文6225字符，与canonical trimEnd逐字相同且管理员rules保留，[核对](../.qa-local/headed-resume-20261014/evidence/G11-builtin-role-fulltext.json)matchesCanonicaltrue；随后GUI恢复QA续测模板和rules。只补全文未截断子项，删除仍取消未执行。

root将G12条件不足→部分通过，当前**186=4通过/93部分通过/1失败C10/86条件不足/1待测E17/1延期**；98行已有覆盖/尝试=4+93+1，不写98通过。旧92/87为上一冻结点，保留历史。E17[最终准备审计](../.qa-local/headed-resume-20261014/fixtures/e17-proposal/final-review-manifest.json)仅preparedOnlytrue/executedfalse/appliedToActivePluginfalse，MCP进程启动0/权限变更0/GUI0/API0，活插件不变，生产factory原样提取、四脚本语法检查；未实际生命周期验证，仍待测。文档代理不改清单/生产/测试、不操作UI/API/服务，未打包或触真实数据。

### E16首次非空配置保存的新增有头证据

[保存前](../.qa-local/headed-resume-20261014/evidence/E16-before-first-nonempty-save.json)实际skills['qa-resume-mcp']节点不存在/hasServersfalse；root通过GUI直接填入[一个固定Echo条目的servers数组](../.qa-local/headed-resume-20261014/fixtures/mcp-servers-first-save.json)保存，没有先保存[]。重开后[数组读回](../.qa-local/headed-resume-20261014/evidence/E16-first-nonempty-array-headed-readback.json)expected/readback完全匹配、长度1/firstSaveWasNonemptytrue/processGrantOrActivationPerformedfalse；[有头截图](../.qa-local/headed-resume-20261014/evidence/E16-first-nonempty-array.jpg)已归档。

[保存后状态](../.qa-local/headed-resume-20261014/evidence/E16-saved-but-inactive.json)storedServerCount1/三项enabled-loaded-active均false/toolIds[]。此次只是未激活插件的配置首次保存/重读子项，未授予proc.exec或mcp.connect、未启用或spawn，不能写成本批新initialize/Echo/退出回收或E17实际代际测试通过；proposal仍prepared/未active。E16整行原已partial，当前186仍4/93/1/86/1/1、98为覆盖/尝试，不增加整行通过。本代理只补文档/静态核对，不改清单/生产/测试、不操作UI/API/服务，历史所有失败/旧批范围保持。

### 本轮最终交接与QA代理恢复

root[最后有头截图](../.qa-local/headed-resume-20261014/evidence/ui-final-headed-session.jpg)为实际选中会话/收起侧栏，浏览器已标记Handoff。待处理模型请求0后[合成控制恢复](../.qa-local/headed-resume-20261014/evidence/fixture-controls-restored-for-handoff.json)normal/delay15000/toolCallnull，主helper41324/Electron22756交接时仍活、控制台15667保留。

原QA代理helper35532已退出、两个端口曾ECONNREFUSED，原因未实证，不记产品故障。原helper/描述保留；新[固定回环恢复helper](../.qa-local/headed-resume-20261014/evidence/provider-local-proxies-recovered.json)50436/session91077继续13981/13982→固定15666，headers/body不记录、应用配置不改。[最终核对](../.qa-local/headed-resume-20261014/evidence/final-snapshot-and-proxy-health.json)30初始快照sha全不变/mismatches[]、两代理models200且各4。此动作只启动QA辅助代理，不是MCP授权/激活；E17未applied/未granted保持。当前186=4/93/1/86/1/1不变，未新UI业务改动/全量/打包；本代理仅补交接文档及静态核对。

### 当前clone收到限定授权后的实操增量（approved-run-20261014）

用户已明确允许只在headed-resume-20261014/fixture/data删除/清空合成渠道、人设、记忆和Key，并为核对过的固定本地Echo扩展授予、撤销、恢复proc.exec/mcp.connect。原待答是批准前状态；该授权不扩到真实数据、公开投稿或其它程序。root先存[操作前业务快照/hash](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/pre-approved-snapshot.json)，seeded=false，不重新铺数据。受限Electron FATAL pipe启动失败是环境约束，随后正式本地进程权限启动helper50136/Electron48012/session62490、代理54516/session94218；本节没有据进程启动声称原生窗口验收。

- G05旧编辑弹窗清Key再保存：[操作前三Key hash](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G05-keys-before.json)与[清后保存磁盘](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G05-cleared-then-save-disk.json)证明B hasKey=false、其它两Key hash相同；[实际列表](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G05-cleared-then-dialog-saved.txt)显示B已清密钥。之后实际删除当前B，[UI三空值](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G05-current-provider-deleted-ui.json)/[截图](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G05-current-provider-deleted.jpg)provider/base/model均空、仅qa-local及A仍在。GUI已选qa-local恢复基线；删后其它Key的独立hash核对尚待补，不借用清Key阶段证据代替。
- G11这次真实确认删除当前自定义模板，重读后[列表仅factory但role/rules保持](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G11-custom-template-deleted-role-retained.json)/[实际截图](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G11-template-deleted.jpg)。上一批取消与全文6225核对各自保持，不混同这次实际删除。
- E03清secret后[自有工具hasApiKey=false](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E03-schema-secret-cleared-tool.json)。主页面旧弹窗ratio仍0.6，仅改greeting/新secret；第二可见页面GUI只保存ratio0.7；回主旧弹窗保存后[工具ratio0.7/new greeting/hasApiKeytrue](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E03-dirty-only-concurrent-dialog-and-secret-new.json)、[截图](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E03-schema-dirty-only.jpg)。真实可见并发行为验证未改字段不被旧快照覆盖，未抓HTTP请求体不称完整请求体审计；Key明文未输出。
- E03另实际[number=-0.1/underflowtrue/validfalse](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E03-number-bounds-rejected.json)、[labels={}数组形状拒绝](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E03-array-object-shape-rejected.txt)；最后schema停用。不是任意schema类型或所有卸载资源验收。

E17七文件候选现已应用到该clone的inactive插件，旧源已备份，[记录](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-reviewed-candidate-applied.json)含逐文件hash并明确此脚本未grant/activate。上一批prepared-only是旧时点，本节当前为applied但未激活；授权已收到不等于权限实际修改或MCP生命周期通过。实际四阶段/PID/旧listing/旧closure/进程回收须等root新操作证据。本次不改186清单和计数，保持4/93/1/86/1/1；本代理只记录三文档/静态核对，未操作GUI/API/服务、未改生产/测试/fixtures、未新全量或打包。

### 同批删后磁盘与N07/N08慢速整理补核

G05[删除后独立磁盘核对](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G05-after-delete-disk-and-restored.json)现证明B对象/Key均不存在、其它两Key hash仍相同，当前已恢复qa-local/qa-chat/15666；上一节待补是较早时点，不再是当前阻断。E03[最终脱敏磁盘](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E03-final-disk-redacted.json)新secretExact/unchangedOtherFields均true、ratio.7/newgreeting持久化，未输出Key明文。

N07实际单成员整理group10001/20001成功，[前hash](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N07-memory-before-hashes.json)→[后delta](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N07-single-memory-success-hash-delta.json)仅该档变化、其余五档含其它聊天同QQ不变，[实际完成详情](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N07-single-memory-success-detail.txt)吻合。不是整聊批量/全部错误合同验收。

N08在该慢速整理仍running时实际打开编辑弹窗、输入未提交marker，[before](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N08-slow-memory-draft-before.json)整理中1→[after](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N08-slow-memory-draft-after.json)整理中0仍同草稿/1dialog，[真实截图](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N08-memory-draft-retained.jpg)保留；上述磁盘delta unsavedDraftAbsenttrue。实际完成刷新没有关闭弹窗/覆盖或落盘草稿，指定子项通过。跨聊当前只有before，错误/批量/删除等尚未由本节完成，不据文件前缀扩大范围。统计仍4/93/1/86/1/1，等待root判定行状态；文档代理无GUI/API/服务或测试操作。

### N08跨聊天终态与N07受控503后档案保持

N08旧group10001慢速任务期间root已选择group10002，[before](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N08-cross-chat-before-terminal.json)整理中1/当前group10002；[after](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N08-cross-chat-after-terminal.json)整理中0，[实际正文](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N08-cross-chat-after-terminal-body.txt)当前仍group10002、两成员三条原事实保持。指定后台完成不抢详情子项通过，更新上一段仅before的当时状态。

N07/N08单成员受控HTTP503：[开始UI](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N07-error-start.json)整理中1/按钮禁用→[结束UI](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N07-error-completed-ui.json)目标名及503明细、整理中0/按钮恢复；[失败前](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N07-error-before-hashes.json)与[失败后六档hash](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N07-error-after-hashes.json)allUnchangedtrue。只关闭该单目标全失败保留和恢复，不扩大为多成员部分失败或全部失败/真实模型掉线合同。

N05清20001备注的[有效脱敏磁盘核对](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N05-cleared-note-disk.json)NoteAbsentOrEmpty/member20002Unchanged均true，并明确排除旧错误解析器；显示名不直接等同独立note字段，旧解析失败不记产品bug。N04实际[两条印象保存刷新](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N04-multiple-facts-saved-reloaded.json)再[单条保存刷新](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N04-single-fact-saved-reloaded.json)，各marker可见、20002原印象保持；删除余项等root下一批实证。未自行改清单或统计，也未新全量/打包。

N04下一批实际删除：以[当时六档磁盘基线](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N04-before-delete-disk.json)为准，root先删group10001/20001并刷新，[UI剩20002/一原事实](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N04-member-deleted-ui.json)，再实际整group10002清空并刷新，[UI该目录0/0](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N04-chat-memory-deleted-ui.json)。[磁盘最终](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N04-after-approved-deletions-disk.json)目标三档缺失、其余三档hash不变/remainingBusinessFiles3，[截图](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N04-approved-memory-deletions.jpg)保留。四聊天目录索引仍显示、group10002为0成员0印象不代表删除失败；只核业务档案清空及其它对象隔离。N05[错误大小写解析器的原记录](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N05-cleared-note-disk-invalid-parser.json)独立留存，两个null投影不计有效note结果。删除指定子项补齐，但文档代理仍不改行状态/统计或执行行为测试。

N04[后补确认文字](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N04-observed-confirmations-record.json)来源本轮root实际CUA AX观察，非确认框截图：成员确认对应group10001/20001、整聊确认对应group10002；一次跨frame选择器无匹配未执行，随后当前列表定位成功。结合既有取消及单/多编辑、实际删除和隔离，完整本地行结论由root统一提交，不虚构确认截图。

### E17候选四阶段实际有头生命周期与边界

root经真实授权UI先[三项allow](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-initial-three-grants.txt)并启用审核后的clone用户扩展。它调用真实公共process.mcp/本地stdio，原生产factory/helpers逐字提取未修改；当前Echo走最终动态ID→ctx.call/宿主registry。候选register:false、每代newfactory，不覆盖bundled默认setup稳定mcp.tools门面；listing门控发生在真实stdio DTO读取之后、交付factory之前，不是死PID产生新回包。root明确E17仅部分通过，继续保留该稳定门面余项。

| 阶段 | 已验证的实际结果 | 决定性结果文件 |
|---|---|---|
| A proc.exec 已连通撤权/重授 | gen1/serial1/PID49356撤后OSdead、servicefalse/tools[]，保留原factory闭包拒绝/all toolsCallDelta0；新gen2/serial2/PID7984实际Echo成功/OSalive，旧gen1仍拒绝且不调用新代。 | [撤后旧闭包](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-A-proc-revoked-old-call.json)、[新Echo](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-A-proc-restored-echo.json)、[新代期间旧闭包](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-A-proc-restored-old-call.json)、[旧停](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-OS-A-proc-revoked.json)、[新活](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-OS-A-proc-restored.json)。 |
| B mcp.connect 已连通撤权/重授 | gen2/PID7984单独mcp deny后OSdead/工具撤回，旧闭包拒绝；重授新gen3/serial3/PID24528实际Echo成功/OSalive，旧gen2拒绝/all deltas0。 | [撤后旧闭包](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-B-mcp-revoked-old-call.json)、[新Echo](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-B-mcp-restored-echo.json)、[新代期间旧闭包](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-B-mcp-restored-old-call.json)、[旧停](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-OS-B-mcp-revoked.json)、[新活](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-OS-B-mcp-restored.json)。 |
| C held旧listing / proc撤权 / 新代后resolve | gen4/PID33996真实读后DTO held，撤proc后OSdead；新gen5/serial4/PID55796 Echo先成功，再resolve旧DTO，旧connect拒绝/newcurrent和serial保持、新Echo再次成功。 | [held状态](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-C-proc-listing-held-status.json)、[旧resolve](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-C-proc-old-list-resolved.json)、[释放后新Echo](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-C-proc-successor-after-release.json)、[新活旧停](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-OS-C-proc-successor-after-release.json)。 |
| D held旧listing / mcp撤权 / 新代后reject | gen6/PID38784真实读后DTO held，撤mcp后OSdead；新gen7/serial5/PID55076 Echo先成功，reject旧DTO只修改旧错误，新current/serial保持/lastError空，新Echo再次成功。 | [held状态](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-D-mcp-listing-held-status.json)、[旧reject](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-D-mcp-old-list-rejected.json)、[释放后新Echo](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-D-mcp-successor-after-release.json)、[新活旧停](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-OS-D-mcp-successor-after-release.json)。 |

所有phase的宿主deny/allow文字、原工具捕获、before/after、OS只读和截图保留于approved-run目录，results表含更多原始链接。A首次快照异步未完成而抓旧status输出，已单独保留[invalid-stale-output](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-A-proc-revoked-old-call-invalid-stale-output.json)，不作为旧闭包通过依据；以上是完成后的真正结果。string工具ID跨代相同，实际用generation/definitionSerial/PID证明不同定义。最后[候选停用UI](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-final-disabled-ui.txt)、[七Echo PID全停/应用PID48012活](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-OS-final-all-stopped.json)证明宿主撤销/停用回收，未以强杀替代。description中的“未执行E17候选”为预置测试文案，非当前执行状态。没有新生产改动、新完整回归或安装包，整体统计等root统一提交，本代理仅三文档/静态核对。

### 后续实际草稿/flush、六源下钻与主题传播

- G02真正未提交状态以非法JSON阻止自动保存：[before](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G02-advanced-unsaved-before.json)含personaByChat错误草稿及systemPromptOverride合法草稿，[切区/筛选/折叠后](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G02-advanced-unsaved-after-switch-filter.json)两值逐字保持；[磁盘marker absent](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G02-unsubmitted-disk.json)证明不是已经自动保存后读回。
- G01首轮[902ms](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G01-fast-leave-action.json)保存成功但不证明小于700ms防抖，原样保留；有效第二轮[两个真实动作整体566ms且无显式Save](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G01-fast-leave-second-action.json)，随后[磁盘新名](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G01-fast-leave-second-disk.json)、[回页相同值](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G01-fast-leave-second-return-ui.json)。只关闭该防抖前离面板flush子项，不扩大为所有延迟回复/继续输入竞态。
- U03实际六来源各选一行，下钻后依次六by再关闭，共36次明细维度切换；[汇总](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/U03-six-source-summary.json)每来源摘要六次一致，六份原始正文在approved-run并由results逐一链接。日期旧closed=false是用count=0检查隐藏而非移除节点的诊断，汇总已核isVisible=false/关闭按钮不可见，保留旧值不记产品bug。峰谷拆分、全部行/组合、商业模型未关闭，显示摘要保持不是新完整财务合同验收。
- E01实际[ID/名称/描述搜索及重扫](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E01-plugin-id-name-description-rescan.json)均单个候选且inputValue保持；另一个filter属性null投影不用于否定真实输入值。根目录/全部失败原因余项不关闭。
- K02[四模式有效实测](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/K02-four-visual-language-live.json)等待宿主/iframe都达到目标data-style-mode，endfield实际按钮radius0/切7，前三样本radius4/clipnone；[center/right/left、gradient on/off、恢复](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/K02-align-gradient-live-restored.json)两层同步、预览justify与实际button背景图同步，[最终暖黑黄绿截图](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/K02-endfield-restored-final.jpg)保留。跨origin与过早读两份invalid原记录由results链接，排除不记bug；checkbox value=on只是默认值，checkedfalse/gradientoff才是最后状态。15颜色/全部角度和布局余项及帧率仍未实证。

文档代理只核已保存证据，不执行上述UI/API/服务或测试；当前清单/统计等待root最终统一更新，未新全量/打包。

### 2026-10-14授权批严格计数及保留余项

root已实际提交清单状态，[严格186行计数](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/checklist-approved-batch-statuses.json)为**8通过/92部分通过/1失败C10/84条件不足/0待测/1延期**。N04/E03/G11/G02原partial升为限定本地through；G05/N08原conditional、E17原pending补partial，另八行只补说明。101=8+92+1表示覆盖/尝试，占54.3%，不是通过率。旧4/93/1/86/1/1和各自动全量文件计数保留各自时间/来源，不混计。

E17候选未覆盖bundled稳定mcp.tools/同factory替换，N08多成员混合部分失败/真实模型、G05真实商业M及C10既有合同失败均保留；84条件不足和1安装包延期没有由本地合成通过消除。本授权批没有新生产修改、行为回归重跑或打包；最终源/快照/授权/活动进程交接核对等root后续证据。本代理仅三文档同步/静态核对，未改清单或操作UI/API/服务。

### 授权批最终源码、备份、授权和交接实证

[最终独立只读结果](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/final-approved-verification.json)已补electronMain root/clone同hash、候选七文件reviewedCandidateMatches全true；[67个UI逐文件身份](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/final-approved-ui-identity.json)全cloneMatchestrue，共68生产UI/入口匹配。初始30/批准前37两份外侧快照hash全不变，settings及69/117冻结hash保持。第一次[仅UI版本](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/final-approved-verification-ui-only.json)原样保留，不补写当时未核项目。

QA schema/MCP两扩展disabled/unloaded/inactive/unavailable、工具0；三scope已恢复allow/同审核指纹fc082…，扩展停用与授权allow共存是明确交接状态，七Echo子PID此前OS实证全停。root恢复QA小鲸鱼、qa-local/qa-chat、personaByChat={}及空system override，fake normal/15000/null；保留主helper50136/Electron48012/proxy54516/session62490、94218/console15667供后续，不声称主QA服务已清理。最终[expanded](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/final-shell-expanded.jpg)/[collapsed](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/final-shell-collapsed.jpg)是可见实际画面；[两态再展开几何](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/final-shell-collapse-expand-alignment.json)九导航46高/y逐项不变、brand36/x12.5/y22全同。静态画面不证明FPS，未打包/公开操作/新全量；最新186状态8/92/1C10/84/0/1、101覆盖/尝试54.3%保持。文档代理仅静态采证/三文档同步，未操作GUI/API/服务/生产或测试。

[当前handoff](../.qa-local/headed-resume-20261014/handoff.json)已记录received=true/approvalPendingnull、8完整通过/101覆盖、两QA停用及scope恢复allow、活动专属PID/session、可见会话tab/展开侧栏/Deliverable；旧等待批次原版另外归档。独立[用户授权记录](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/user-authorization-received.json)仍仅指定clone及原操作范围，不扩真实数据/外站或本副本会话、聊天删除；不据旧pending文件重复要求同范围批准。

## 2026-10-14新增本地修复：142/144/145红绿与合同来源

本节对应用户“修复吧”后的新增源码，区别于上节仅实测/交接。186行仍以上一批8/92/1C10/84/0/1为历史冻结，不据自动回归关闭C10或真实外部条件；尚未收录本轮完整runner及可见修后验收，无安装包、公开投稿、真实账号或验证码作答。

| 定向回归 | 已执行结果 | 证据层级 |
|---|---|---|
| 142宿主认证 | [红诊断](../.qa-local/142-auth-before-with-counts.log)authPosts=1/hostCaptchaStarts=0后超时；[绿日志](../.qa-local/142-auth-after.log)五组离线生命周期/opaque边界完成。 | headless真实shell/iframe/kernel与离线SDK，取消/迟到proof、失败/空proof不认证、一次成功、后续密码草稿保留、注册确认取消、离页、非社区RPC及直接POST拒绝；非真实阿里/外站成功。[最初spawn EPERM](../.qa-local/142-auth-before.log)与[正常权限产品超时](../.qa-local/142-auth-before-normal-permissions.log)分开保留。 |
| 144客户端凭据保护 | [红](../.qa-local/repair-market-auth-20261014/144-before.log)16/31/exit1→[绿](../.qa-local/repair-market-auth-20261014/144-after.log)47/0/exit0。 | [hash及相关回归](../.qa-local/repair-market-auth-20261014/repair-validation.json)含38的27/0、85通过、127正常权限通过及首次spawn EPERM。异常token/account/ok、输入拒绝、错误密码/token脱敏、失败文件不变、官方字段转发已验，受控上游。 |
| 145备注/原名 | [红](../.qa-local/repair-memory-notes-20261014/145-before.log)17/9/exit1→[绿输出捕获](../.qa-local/repair-memory-notes-20261014/145-after.log)26/0/exit0。 | [原始工具chunk/exit/hash](../.qa-local/repair-memory-notes-20261014/verification.json)含13的32/0、35的12/0、82的34/0、65/M4相关通过。记忆段实时备注、consolidator展示/持久name分离、实际adapter写回、跨聊隔离、新建真实原名及旧名不猜测恢复；无有头操作。绿日志为已完成工具输出捕获，非第二次运行。 |

[官方市场GET](../.qa-local/repair-market-auth-20261014/official-contract.json)04:01:49Z/200/未认证未提交、[原HTML](../.qa-local/repair-market-auth-20261014/official-skill-market.html)确认doAuth没有CAPTCHA字段，只loginId/password，注册加displayName；doUpload另用验证码。142本地门控不改变远端认证合同，也不证明远端验证了本地proof。

[官方金句GET](../.qa-local/repair-market-auth-20261014/official-holyshits-get.json)04:03:34Z/200/未认证未提交，SHA256 A5F960139F68834007C62A7155E87DEE0849144788268D6049B4A75496F2E05A与[原HTML](../.qa-local/repair-market-auth-20261014/official-holyshits.html)再次显示476只读media[].url、683投稿media:[]、704仅nickname/messages/captchaVerifyParam。C09含图功能仍缺可信写入合同，不以展示字段、反馈images或受控200替代。当前解释纠正历史“规格明文含图”较强表述：SPEC F221只概述上传，notes10列按钮函数，含图/引用是QA增强范围，没有图片写schema明文。K02渐变角度同为QA/主题增强，原规格无此明文；固定90度不独立构成原spec失败。

143 metadata、本轮可见实测及完整runner等根代理后续证据。历史失败、环境失败及上一批统计保留，文档维护不改checklist或真实数据。

### 新可见离线副本及首批完整runner 111/113

root已在原批准合成dataDir、新生产内核与可见IAB实际复验；[live](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/live.json)明确helper42564/未seed/无Electron-IPC实测、root HTML离线SDK、缺入口manifest候选、固定市场响应，修前快照另存。此时点不能用上一批Electron PID作当前原生窗口证据。

- E01[缺entry before/after](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/E01-missing-entry-directory-and-rescan.json)显示未加载/启用/不可用、版本1.0.0、错误总数1、absent.js明确原因及真实安装目录；rescan后details open1、正文保持，[截图](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/E01-missing-entry-visible.jpg)。结合此前kind/三搜索/正常启停/version，补本地明列余项，不扩大所有内部故障穷举。
- C10[真实可见离线容器](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-before-proof-visible.jpg)后实际取消/失败/无效proof零认证请求，[有效取消](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-headed-cancel-before-auth.json)控件恢复/容器移除；[无效敏感字段投影](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-headed-cancel-before-auth-invalid-secret-inspection.json)保留排除。auth延迟10秒时root输入下一份密码，[成功后](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-headed-success-after-new-draft.json)仍非空，CUA值redacted，精确保留只能用142自动断言，不能把有头布尔投影当明文等值。[错误脱敏](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-headed-error-redacted.json)、[失败hash](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-failures-preserved-account-hash.json)证明受控错误及异常token拒绝时account保持；[本地注册取消/确认](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-headed-local-register-cancel-and-confirm.json)成功并清已提交密码。[请求状态](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/offline-auth-state.json)三次loginId/password、一次加displayName，远端字段无proof、全部离线；本地门控不证明服务器验证auth proof，真实阿里仍余项，C10不升through。
- N05新建20003明确原名/备注A→改B，[实际模型记忆段](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/N05-actual-note-B-model-prompt.json)newNote/oldAbsent/storedNameOriginal均true；[指定整理完成](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/N05-headed-consolidated-with-note.json)2→1，持久name原名。[清后UI](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/N05-headed-note-cleared-original-name.json)/[截图](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/N05-headed-original-name-after-clear.jpg)回退原名，[另一实际请求投影](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/N05-actual-cleared-note-model-prompt.json)原名/oldNotesAbsent/storedNameOriginal均true、1印象。是实际内核→本地qa-chat HTTP200，不是收费模型或旧缺名猜测恢复。

首批[完整runner原日志](../.qa-local/repair-suite-20261014.log)M3 **111/113、M4 10/10、exit1**，142–145均通过。143真实临时loader→HTTP核两kind真实目录/description、重扫/activation、密钥掩码/未声明settings不泄露；共享renderer/两面板诊断、状态、展开是合成DOM模块验证，分别于上述可见E01记录。首批失败不删改。

80身份/根目录语义源修复及认证driver适配新离线验证码后[独立绿](../.qa-local/80-repair-auth-driver.log)，旧断言保持。109[验证manifest](../.qa-local/repair-market-auth-20261014/109-validation.json)明确旧.readiness-heading已删除导致TypeError、[原诊断](../.qa-local/repair-market-auth-20261014/109-diagnostic-first-error.log)保留，改真实.readiness-name/rail检查后[独立绿](../.qa-local/repair-market-auth-20261014/109-current-label-diagnostic.log)；生产主题不改、阈值4.5及全部其它paint/icon/root/body/POSTack不放宽。第二完整runner67075仍等待root最终状态，本节不提前写113/113或新清单统计。

### 第二完整runner最终exit0：113/113与10/10

[第二执行记录](../.qa-local/repair-suite-second-20261014-result.json)start04:29:37.9342884Z/end04:37:59.8591725Z/exit0、session67075；独立只读核对[第二原日志](../.qa-local/repair-suite-second-20261014.log#L3565)第3565行实际M3 113/113、第3603行M4 10/10。上段pending为结果到达前状态，当前已完成。第一[完整exit1日志](../.qa-local/repair-suite-20261014.log#L3581)仍111/113+10/10，两轮分别保留。

80的extension-id/根目录语义源修与认证driver先完成新离线验证、109仅旧heading选择器driver修正均保留各自解释及红/独立绿，原断言不放宽、不把首批归零失败。113+10是自动文件数，不能换算为186功能有头全部验收；真实阿里/auth服务器proof验证、QQ/商业模型/外站、FPS与安装包仍没有由本轮自动全绿证明。最终清单和源/备份audit等root落盘后补记，文档代理不改checklist。

### 最终audit、清单与现场状态

[本轮计数](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/repair-checklist-counts.json)实际9通过/92部分/0失败/84条件/0待测/1延期=186，101覆盖/尝试54.3%；E01限定L/X通过、C10因本地消费者修复由failed转partial，真实阿里/认证场景/server proof验证/原生Electron未闭。N05仅补子项未升级，113+10自动文件不是186功能通过数。旧8/92/1C10/84/0/1统计及首批111/113 exit1保留历史。

[final-repair-verification](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-repair-verification.json)04:44:49Z确认三快照30/37/38文件hash全不变；src56/bundled50/electron3全匹配，UI68/67匹配，唯一index.html离线SDK注入+额外shim，allUiCloneMatches=false/uiDeviationExactlyOfflineSdkInjection=true分别如实保留，不能称UI全部相同或Electron实测。既有3成员档案/20002备注保持，新20003原名/1fact/noteClearedtrue；accountCount0、market/Schema/MCP均停用工具0、MCP三scopeallow同受审指纹、七Echo全停。

诊断候选移副本外归档，最终[身份/路径各一](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/E01-headed-corrected-path-identity.json)、[健康目录截图](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/E01-final-healthy-plugin-directory.jpg)、[最后可见画面](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-repair-visible.jpg)/[正文](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-repair-visible.txt)为12插件/加载7/错误0。helper42564/proxy54516及87811/94218保留运行，旧50136/48012死、currentElectronPidnull；normal/15000/null、authok/0、恢复测试人设/qa-local/qa-chat/空高级覆盖，不称所有进程清理。

[独立只读review](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-readonly-review.json)核113唯一/各一次执行heading，全量exit0及所审认证/80/109无阻断；143/145只从完整日志确认绿，不能扩大独立源码审计范围。[当前handoff](../.qa-local/headed-resume-20261014/handoff.json)更新、[旧版归档](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/handoff-before-repair.json)保留。旧负结果/无效投影/来源边界继续保留，C09可信图片写合同、真实QQ/商业模型/外站及安装包余项不因此消除；没有真实验证码作答或公开发布。

[追加metadata源码只读审计](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-extension-readonly-review.json)独立核loader/DTO真实dir-description且掩码保持、ID/路径各自语义、两面板去重错误计数、已测诊断清洗及未知iframe/RPC边界，无阻断；没有新测试或源码/现场修改，143结果来自第二完整日志。[最终文档/源冻结审计](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-repair-doc-links-audit.json)核相关引用、25源码测试hash不变、限定scope diff-check及9/92/0/84/0/1；root在最后文档修改后更新其doc hash。沙盒Git访问受限后正常权限只读diff-check exit0属于核对环境差异，不改写产品或测试失败。

### 2026-10-14 develop源码授权后的价格、安装、迁移和图片补缺

用户明确允许参考`develop`的必要源码，覆盖此前禁读旧源的约束；本批没有读取旧`data`、`community.key`、`debug.log`、真实账号/令牌。所有安装/迁移归档、登录配置与媒体测试都是独立合成数据，没有执行旧安装脚本或真实QQ程序。上一轮186清单**9/92/0/84/0/1**、覆盖101/54.3%和完整M3 **113/113**、M4 **10/10**保留为上一冻结点；新四文件的定向回归不能提前替代root计划的新117+10整批结果，亦不把自动文件数计为186功能验收。

| 定向回归 | 原始红与有效绿 | 验证边界 |
|---|---|---|
| 146价格完整性 | [初红](../.qa-local/develop-gap-closure-20261014/price/146-before.log)14/25 exit1；[外源缓存红](../.qa-local/develop-gap-closure-20261014/price/146-cache-origin-before.log)43/1 exit1；[最终](../.qa-local/develop-gap-closure-20261014/price/146-final.log)46/0 exit0，[manifest](../.qa-local/develop-gap-closure-20261014/price/validation.json)记录真实合成成本旧29/新281/HTTP总310、历史字节不变。 | [版本化140条历史快照](../.qa-local/develop-gap-closure-20261014/price/builtin-source.json)，不是当前报价。统一匹配/优先级、非法远端保留有效缓存、外URL缓存不删除但不使用；逐模型明确零价与全局cache未设置零分开。旧历史不重算，未请求真实供应商计费。 |
| 146关联回归 | [33](../.qa-local/develop-gap-closure-20261014/price/33-after.log)37/0、[39](../.qa-local/develop-gap-closure-20261014/price/39-after.log)9/0、[36](../.qa-local/develop-gap-closure-20261014/price/36-after.log)16/0、[106](../.qa-local/develop-gap-closure-20261014/price/106-after.log)exit0；83[初次失败](../.qa-local/develop-gap-closure-20261014/price/83-after.log)发现全局cache零被错当免费，生产修回既有合同后[最终绿](../.qa-local/develop-gap-closure-20261014/price/83-final.log)，原83测试不改。 | 源语义失败保留，不改写成环境问题；定向文件与完整runner分别记录。 |
| 148关联迁移 | [23](../.qa-local/develop-gap-closure-20261014/migration/23-final.log)57/0、[132](../.qa-local/develop-gap-closure-20261014/migration/132-final.log)5场景exit0。 | 均独立合成文件/真实kernel；不把源hash与复制成功当作真实旧账号免扫码。155定向绿早于installer最终路径/上限收尾，新完整runner须再覆盖最终共享依赖，更新hash本身不是重跑。 |
| 149图片发布与120浏览器 | [149原红](../.qa-local/develop-gap-closure-20261014/quote-before.log)真实图片拒绝；[149最终绿](../.qa-local/develop-gap-closure-20261014/quote-final-limits-after.log)保留真实内核media→community HTTP、停用provider、累计图片/请求体上限；[120正常权限绿](../.qa-local/develop-gap-closure-20261014/quote-browser-normal-permissions.log)文本/图片精确像素、坐标边界、坏图显式移除、host proof隔离、取消/成功清理、重复/错误与停用均通过。[120首次EPERM](../.qa-local/develop-gap-closure-20261014/quote-browser-after.log)独立保留。 | 图片写参考来自已授权`develop/ui/app/10-feedback.js:778–840`的`media[].dataUrl`；不是此前官方GET得到的只读url字段。50消息/9图、解码累计1MiB、body2MiB，白名单MIME/base64/magic；原URL/文件及QQ聊天ID不外送。120是headless，不冒充可见操作；官网公开POST/真实阿里/远端保存未测试。 |

宿主preflight取消的[原探针](../.qa-local/develop-gap-closure-20261014/quote-preflight-readonly-probe.json)证明GET未传signal、取消后controller仍held、retry409/POST0。最终publication helper传signal且验证/提交前检查取消，[修后实际production bridge/helper探针](../.qa-local/develop-gap-closure-20261014/quote-preflight-final-readonly-probe.json)在旧readiness未返回前已允许重试，新链路GET/GET/POST、starts1。该最后helper由149和探针核验；120日志早于最后提取，不宣称最后源码已完整浏览器重跑。[图片只读review](../.qa-local/develop-gap-closure-20261014/quote-readonly-review.json)无所审范围阻断，明确旧schema不证明当前远端接受、源中迟到媒体guard不冒充新slow-media浏览器case、magic检查不等同服务端图片清洗。


安装追加修复现已重新冻结，本节仍没有新完整runner或新可见副本结果；root接续执行，结果及最后源/快照audit另补。186行判定由root维护checklist，文档代理只三文档/只读核证，不操作UI/API/现场，不公开发布、不回答真实验证码、不生成安装包。

### 新完整117/117与10/10，以及可见离线图片复验

上节等待状态现为历史。新[完整执行记录](../.qa-local/develop-gap-closure-20261014/full-regression-result.json)实际start06:06:09.9283745Z/end06:14:56.7891271Z、**exit0**；[原日志](../.qa-local/develop-gap-closure-20261014/full-regression.log#L3662)第3662行M3 **117/117**、第3700行M4 **10/10**。第3569–3573行146为46/0，第3587–3607行148为155/0，147严格version门槛及149最终publication helper通过。此前113+10整批、111/113+10/10 exit1、146/147/148/149红和120 EPERM均保留。

root[新可见副本](../.qa-local/develop-gap-closure-20261014/headed-evidence/live.json)为独立PROFILE99/headed/app/headed/data、helper48600、URL15867，production kernel+可见IAB；显式离线SDK及合成固定投稿端点为受控偏差，没有Electron wrapper、真实外网POST或真实账号状态。实际UI与记录层级分别如下：

- 图片15实际预览288×144 checker合成图片：[正文](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-image-preview.txt)/[截图](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-image-preview.jpg)；[离线验证前requests0](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-before-offline-proof.json)。root完成离线SDK模拟后[UI提交成功](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-image-accepted.jpg)，[形状/hash](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-image-accepted-shape-and-hash.json)requests1、exactReviewedPixels/noSourceCoordinates均true，753bytes及SHA `ed482f363a04c44eba969fa166ba007eefee84fa0fc164ac5caa995c6f72a6ef`匹配审核图片，url/file为空，没有源QQ/chatID。[合成记录](../.qa-local/develop-gap-closure-20261014/headed-evidence/synthetic-publications.json)仅1条，固定官方地址被合成fetch接管，不证明官方存储接受。
- 坏图16实际decode失败，[正文](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-corrupt-blocked.txt)/[截图](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-corrupt-blocked.jpg)为提交disabled与明确移除提示；root实际移除后[正文](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-corrupt-explicitly-removed.txt)保留合成文字、素材已移除/图片0、提交恢复可用。随后取消，记录仍1条；该第二条没有发布，不能记作服务端失败或成功。
- [可见价格投影](../.qa-local/develop-gap-closure-20261014/headed-evidence/price-visible-projection.json)/[截图](../.qa-local/develop-gap-closure-20261014/headed-evidence/price-visible.jpg)显示qa-chat custom1/2/0.1、142条=140 builtin+2custom、明确2026年9月历史来源/版本及未核当前价格提示；remote摘要source=builtin/fetchedAt0，不是刚从官网同步的140条当前报价。可见来源与合成当前价一致，不扩大为真实计费。

141就绪栏消费者的[原红](../.qa-local/develop-gap-closure-20261014/readiness-lock-before.log)保存实际failure state/Timeout：running却版本门槛失败时仍显示成功；[修后绿](../.qa-local/develop-gap-closure-20261014/readiness-lock-after.log)实际包含truthful readiness、geometry、details lifecycle、constrained viewport等原断言。它是自动浏览器检查而非root新可见操作，没有真的启动不合格组件；此源修已在[06:06:09源码冻结](../.qa-local/develop-gap-closure-20261014/source-freeze.json)之后的117完整批再次通过，原红不记作纯环境失败。

自动117+10文件与186功能清单继续分别计数；保留上一9/92/0/84/0/1冻结，最新说明与final-verification须等root落盘核对。真实QQ安装、旧账号免扫码、商业模型、阿里验证码和官网社区存储仍未验证；没有新原生Electron/IPC、公开发布、安装包或FPS结论。文档代理仅维护三文档/读证据，没有进行上述UI操作。

### develop参考补缺批最终audit与交接记录

[final-verification](../.qa-local/develop-gap-closure-20261014/final-verification.json)06:24:40.114Z确认198份冻结生产/测试源指纹全不变，5份纳入审核的主要旧源指纹全部保持；不把“5份审核指纹”误写为所有只读源总数。clone src58/bundled51/electron3/scriptslib3全部同；UI69/68，仅HTML离线SDK差异+额外shim，uiDeviationExactlyOfflineSdkInjection=true，不能据此声称UI全部相同或本批原生Electron运行。原30/37/38外侧快照文件及元数据全不变。最终完整log散列记录在该audit，117/117+10/10/exit0与实际原日志一致。

最终visibleEvidence recordCount1/image753bytes与审核hash一致、无原坐标/url/file；corruptImageBlockedAndExplicitlyRemoved/cancelDidNotPost均true、realServerAcceptanceVerified=false。fresh fixture工具未设置（toolCallPresent=false），不是必须有显式null字段；账号未存储/accountCount0，不是必须存在旧account.json。最初沿用旧夹具结构的审核失败经正确投影后恢复有效核对，无产品/测试改动，不归为新增源码故障。对端normal/15000、market/telemetry停用，qa-local/qa-chat。

[最终逐行计数](../.qa-local/develop-gap-closure-20261014/checklist-counts.json)仍186=9/92/0/84/0/1、101覆盖54.3%，只补说明不升真实外部行。[handoff](../.qa-local/develop-gap-closure-20261014/handoff.json)保留helper48600/session8539/PROFILE99/console15867与旧42564/54516辅助进程，前一[handoff](../.qa-local/headed-resume-20261014/handoff.json)独立保留；不声称全部临时进程结束。[设计/来源/边界记录](develop-reference-gap-closure.md)补全本批实现范围。真实QQ下载/安装/免扫码、阿里、商业模型和社区服务器接受/长跑未验；无新Electron/IPC、外网发布、打包或FPS结论，历史负结果完整保留。

[最终source只读review](../.qa-local/develop-gap-closure-20261014/final-source-readonly-audit.json)独立核198唯一源/测试指纹198匹配、5主要旧源5匹配；184应同clone文件逐字一致（含setup），HTML离线注入/额外shim与QA-only omitted工具分别记录，不能称整个副本无差异。117个M3声明/唯一文件、每个heading恰一次，117/117与M4 10/10真实原日志全绿；review本身没有重跑。四个新增缺口未发现生产插件旁路，审核范围限本批安装/default transport、core迁移/价格例外和面板RPC/host proof/选定community服务，不扩大为全部插件规格合格或全部仓库源文件均在198冻结内。[两次final审核夹具假设失败](../.qa-local/develop-gap-closure-20261014/final-audit-harness-corrections.json)分别记录toolCall缺省及account文件尚未materialized，纠正投影但productionSourceChanged/testAssertionsChanged均false。最后可见[聊天交接画面](../.qa-local/develop-gap-closure-20261014/headed-evidence/final-visible-chat.jpg)合成群、选择0/金句模式关、无验证弹窗，现场保留供审阅。


## 2026-10-15 全功能续批回归、失败历史与完整冻结

本批自动回归与实际有头功能判定分开；下表全部引用各自原记录，不聚合覆盖失败。

| 轮次 | 冻结范围 | M3 / M4 | 结果记录 |
|---|---|---|---|
| 1 | 201目录指纹 | 119/119 + 10/10，exit0 | [记录](../.qa-local/all-acceptance-20261014/full-regression-result.json) |
| 2 | 203目录指纹 | 121/121 + 10/10，exit0 | [记录](../.qa-local/all-acceptance-20261014/full-regression-round2-result.json) |
| 3 | 204目录指纹 | 122/122 + 10/10，exit0 | [记录](../.qa-local/all-acceptance-20261014/full-regression-round3-result.json) |
| 4 | 204目录指纹 | 122/122 + 10/10，exit0 | [记录](../.qa-local/all-acceptance-20261014/full-regression-round4-result.json) |
| 5 | 204目录＋test74/test140另2指纹，206实际 | 122/122 + 10/10，exit0 | [记录](../.qa-local/all-acceptance-20261014/full-regression-round5-result.json) |
| 6 | 完整366：src58/bundled51/ui70/electron3/scripts14/test168/package和lock2 | **121/122 exit1** + 10/10 exit0，overall false | [原final](../.qa-local/all-acceptance-20261014/evidence/full-regression-round6-2026-10-14T15-58-18-475Z-33d7044d/final-verification.json) |
| 7 | 相同完整366范围，仅test83 fixture相对第6轮变化 | **122/122 exit0** + **10/10 exit0**，overall true | [新final](../.qa-local/all-acceptance-20261014/evidence/full-regression-round7-2026-10-14T16-16-23-745Z-80995222/final-verification.json) |

前5轮目录仅部分测试catalog，不能把其204目录说成全部test。第5轮另钉74/140并比后hash，其后settings117修复由第6/7完整test168覆盖。第7轮M3实际16:16:23.859Z→16:26:12.950Z，M4至16:26:15.534Z；before/after tree同9ad567943c4d42a96d524a4d7665c31ae5a42f2571b1cfeea85c3344cf58d7d1，changed/added/removed0，4日志hash/真实汇总行独立匹配；[完整独立读核](../.qa-local/all-acceptance-20261014/docs-draft-round6/round7-completion-independent-audit.json)还核第6轮14个封存artifact逐字未变。[S04后366指纹](../.qa-local/all-acceptance-20261014/evidence/two-tool-headed-independent-effective-day/post-S04-round7-source-provenance.json)再次匹配，这些读核不是重跑full或新增覆盖。旧94 singleton证据本轮用显式preload重定向到新目录，run-plan透明列出，历史原报告hash未变。源码冻结不包含docs/QA data/runtime和本轮辅助证据。

第6轮唯一83 settings失败是测试用Date.now()-1h作为“今天”记录，在北京时间午夜后一小时落到昨天：today实际2500000而旧硬设2500020。root仅授权修改test83，recentTodayAt钳制本地午夜/非未来/前1h，保留6边界属性及原价格/用量断言；生产记账和全局Date钟未改。[83红/绿/定向记录](../.qa-local/all-acceptance-20261014/evidence/fixture83-midnight-repair-round7/final-targeted-verification.json)含83与33/39/60/106/146全exit0；新fixture SHA c324010193ea2a13dd3ea59e64a64454753c11ad1aa2fb3b2b52218a3c3b34a9。完整第7轮与第6轮唯一source差异test83，原false仍保留，不写成产品记账修复。

| 当前源修复 | 修前/修后与验证 | 实际界面范围 |
|---|---|---|
| transport热切地址及发送超时 | 150旧18/30→48/48；151旧25/15→40/40；完整回归覆盖 | [G16原生热切](../.qa-local/all-acceptance-20261014/evidence/G16-native-hot-http-verification.json)、[H07/H06原生](../.qa-local/all-acceptance-20261014/evidence/native-send-verification.json)，仅本地OneBot/合成消息 |
| QQ隔离保护及原生ZIP选择 | 152 guard39/39；153 2/10→10/10，未实现真实QQ子进程独立隔离 | P01/P06真失败保留，QQ/一键启动pause为fail-closed；ZIP本地11类实际选包 |
| extension-manager错误反馈 | [154验证](../.qa-local/all-acceptance-20261014/zip-prefix-dedupe-20261014/verification.json)旧source同final10fail/74pass→0fail/84pass，153/62/61/143必要检查绿；保留原错误信息/安全throw，仅前缀去重 | 旧“安装失败”重复红保留；反馈持久性修后现场另验，不提前写全UI通过 |
| dialog-lifecycle嵌套focus | [140红绿](../.qa-local/all-acceptance-20261014/modal-focus-20261014/verification.json)最小13行，samefinal旧exit1→绿0；Cancel/Escape父TEXTAREA/草稿、busy/token与新parent不抢焦点 | [实际IAB取消/Escape](../.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/A16-tools-final-independent-verification-corrected.json)两focus true，父草稿可继续、未import；不是全部原生弹窗 |
| orchestrator实际batch标题 | [74红绿](../.qa-local/all-acceptance-20261014/evidence/trigger-summary-repair/final-verification.json)23pass/4fail→27/0，82=34/34、104=8/8；waiting/实际batch/abort保留 | [新双工具实际IAB](../.qa-local/all-acceptance-20261014/evidence/two-tool-headed-independent-effective-day/S04-fixed-effective.verification.json)及[OLD→FRESH](../.qa-local/all-acceptance-20261014/evidence/two-tool-headed-independent-effective-day/S04-fixed-old-fresh-transition.verification.json)独立true；旧整体false仍保留 |
| settings工具可用reason | [117最终验证](../.qa-local/all-acceptance-20261014/evidence/tools-availability-repair/final-verification.json)既有＋6正常/3边界绿，69/122/133/136绿；finally保存、reset取消、focused reload/version guard | [同页IAB false→true](../.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/A16-tools-final-independent-verification-corrected.json)及[独立schema/像素窄审](../.qa-local/all-acceptance-20261014/evidence/round7-headed-independent-preparation-2026-10-14T16-49-46-127Z-73bd4c65/a16-tools-narrow-readonly-review.json)，只更新原因不重建用户输入 |

root正常关闭67840后仅同步extension-manager/dialog-lifecycle/orchestrator/settings panel四源；[四源同步与首次启动](../.qa-local/all-acceptance-20261014/review-sync-round6/applied-20261014-155118028-23b7c7c0/source-sync-and-launch.json)全部hashmatch/各before备份，无data/runtime/vendor复制。其后67036消失cause unknown，root执行[restart-only实际记录](../.qa-local/all-acceptance-20261014/restart-only-67036/started-20261014-162531016-ac0cee74/launch-final.json)启动72188，仅备份stale锁并由unchangedkernel正常回收，未sync第二次/改配置/OS安全/sandbox；正常启动写其常规QA状态是预期，不能说不写测试数据。正常重复启动只恢复现有72188窗口、不新建kernel，launcher退出码不可取得。

观察器问题分别保留：117首次final错误假设RPC无前缀，改为逐字比较真实错误；S04旧day-key baseline误用Oct14磁盘，在Oct15读取effective API0新baseline并保留原旧磁盘132bytes/hash，不改产品；A16/tools原available字段应为enabled/code/reason，图像实际JPEG而非后缀PNG，正确1085×884但原JSON维度错保留；Sky opaque ID不能比较Windows HWND。它们不是产品新增bug，也不抹真实旧focus/标题/前缀/QQ隔离失败。

186行逐行重数：**10通过、96部分通过、2失败、77条件不足、0待测、1延期**。通过或部分通过106行（57.0%）；连同两失败行，已实际尝试108行（58.1%）。10行只表示各自明示范围全部完成，不代表106或108行全通过。P01/P06对应同一个真实QQ隔离缺口的两条规格。

E06仅11包本地类别通过，任意插件/市场/权限安全未全验；新S04商业模型仍缺，A16全部窗口仍部分，背景本轮现场仍待补。新真实6h冻结copy从11:39:41Z计到17:39:41Z，读取2026-10-14T17:16:41.904Z仍未完成，后续四源等修复未被running copy载入；跨日最终记账/收尾/锁释放和无泄漏需等实际final审查，不写满帧率/全UI长跑通过。无安装包。

[本轮四文档完整备份](../.qa-local/all-acceptance-20261014/evidence/formal-doc-integration/2026-10-14T17-08-23-180Z-e8cd291b/backup-manifest.json)。


## 2026-10-15 背景子项与新通知缺陷（2026-10-14T17:26:36.857Z补记）

此前背景“尚待补”及R7源稳定说明属于前一执行时点。root随后已实际选文件完成[PNG](../.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-native-png-after-20261014T165631598911Z.json)、[JPEG](../.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-independent-jpeg-after-20261014T170421154631Z.json)、[GIF](../.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-independent-gif-after-20261014T170851703084Z.json)、[WebP](../.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-native-webp-after-20261014T171337234463Z.json)四格式；原生AX操作记录与独立磁盘投影联合支持真实上传，均精确匹配合成fixture字节/格式、生成本地引用、每次只有一新文件且已有背景文件保持。projection本身是disk-only，不单独当GUI或HTTP MIME验收。JPEG阶段缺其他scheme独立before，不扩称每个scheme都逐字未变。

干净可见IAB的[GIF九帧独立像素证据](../.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/K03-gif-playback-independent-pixel-verification-20261014T171646397696Z.json)观察4.413秒、六次左右转换、三个往返完整循环，证采样时预览确实循环。采样manifest没有逐帧DOM src，关联来自已保存GIF与root当时未输入的上下文；分析时已换WebP，所以不是当前仍显示GIF。没有FPS、宿主背景播放、所有GIF解码或无限循环保证。[非法图不保存](../.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-native-invalid-after-20261014T171455795692Z.json)实际错误瞬间由root看到，独立磁盘引用/库存保持；稍后settled AX已被错误清空，不能当原错误截图。[超8MB AX](../.qa-local/all-acceptance-20261014/evidence/K03-native-oversize-feedback-ax.txt)有“图片不能超过8MB”，最终磁盘after由root另核，当前不扩大拒绝全流程写入结论。

这次实际测试发现新的性能/反馈缺陷：[通知状态分析](../.qa-local/all-acceptance-20261014/evidence/two-tool-headed-independent-effective-day/K03-status-feedback-sticky-notification-analysis.json)显示真正configUpdated SSE把flag持久缓存进runtimeStatus，之后默认15秒普通status poll重新播出历史flag，使设置面板反复读取7端点并用“配置已读取（脱敏）”清掉上传失败反馈。source流与root现场支持缺陷；缺少对那次稍后精确event的trace，settled AX只证后来清空，初始覆盖私人桌面的屏幕没有作为本地截图归档。root已授权对 **ui/shell/app.js 与 test/95-shell-runtime-controls-test.mjs** 作最小修复/有意义红绿回归，同final95旧源红→修后绿已完成，但关联定向、完整R8与修后现场验收尚未完成，不提前写整批通过。

R7 122/122＋10/10及完整366冻结仍是修此新问题之前的真实历史绿，R6失败和R7冻结原artifact保留。当前新95/app源码改动必须作为另一个版本比较，不能继续说当前源码等同R7或R7已覆盖此次新修；最终整合audit只容许root已明确授权的这两个source差异，其余源仍核指纹。K03整行保持部分，四角裁剪/旋转/modes还在实操、K04取消引用尚未完成；本段不预填通过。六小时同样仍按其独立final处理，本轮不打包。

新增定向结果（17:25:55Z完成）：[95同final旧源红](../.qa-local/all-acceptance-20261014/evidence/status-notification-repair-round8-2026-10-14T17-21-35-123Z-83a7fb2d/red-95-final-driver-result.json)exit1、[修后绿](../.qa-local/all-acceptance-20261014/evidence/status-notification-repair-round8-2026-10-14T17-21-35-123Z-83a7fb2d/green-95-result.json)exit0，测试SHA393ffc4619d1b749883cecce4e300507d436cc3eac4f89208d54862d5b6c72e2两次相同；生产app仅注释与delete next.configUpdated，保留真实SSE通知刷新，普通poll不重播历史flag。两真实configPOST各触发一次refresh、普通两poll配置读增量0、上传错误保留，以及原pause/latepoll断言通过。初次red在readiness装饰动画定位超时、未到新分支，原日志留存；driver按既有141惯例设reducedMotion后才得到上述samefinal产品红/绿，不修改readiness生产源。修后app SHA1378bd6750397584dead3fd85741161b60e7f6c462980acc6fdf7d80b97cc687。关联定向和完整R8仍待，当前运行QA尚未据此证明修后有头通过；R7保持历史绿，当前source只允许这两个已知授权差异。


## 2026-10-15 背景、真实六小时和第8轮最新实际结果

本节为本次已执行增量。第8轮真实失败与所有历史red保留；正常重启和第9轮完整结果尚待后续实际证据，不提前记通过。

[第8轮原final](../.qa-local/all-acceptance-20261014/evidence/full-regression-round8-2026-10-14T17-35-05-058Z-6fcff3e1/final-verification.json)实际17:35:05.340Z→17:49:22.436Z，M3 **121/122 exit1**、M4 **10/10 exit0**、overallfalse。366 source before/after tree同f271dd00c7eefbbbfc50befd0c117a8836dd989787e5d7a382d63eb3fede796b，0changed/added/removed，94/R6/R7 history guards保持。唯一80旧指定清除按钮预期0实际1发生在后端pin已undefined而前端await PUT后再GET capabilities/提交DOM之前，属于正在核查的UI完成等待竞态；只补测试等待最终detached、保留全部strict断言是另一个版本，不改生产也不覆盖本次false。不能将定向green、136本轮full各casegreen或R9启动当完整green。[通知修复定向](../.qa-local/all-acceptance-20261014/evidence/status-notification-repair-round8-2026-10-14T17-21-35-123Z-83a7fb2d/targeted-final-verification.json)95与7相关最终绿，136首一次真实失败与同源/同test hash重跑green并存、原因未证明。

### K03/K04 背景实操与边界

[PNG](../.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-native-png-after-20261014T165631598911Z.json)、[JPEG](../.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-independent-jpeg-after-20261014T170421154631Z.json)、[GIF](../.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-independent-gif-after-20261014T170851703084Z.json)、[WebP](../.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-native-webp-after-20261014T171337234463Z.json)四次实际原生选择上传配合各阶段AX和disk-only投影，生成本地引用及精确fixture字节/解码格式，已有文件保持。[GIF九帧](../.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/K03-gif-playback-independent-pixel-verification-20261014T171646397696Z.json)干净IAB像素4.413秒/六转换/三完整往返，只证采样预览，不证FPS/宿主无限动画/所有GIF。

四角NW→NE→SW→SE，初100%依次83→67→55→45，[NW](../.qa-local/all-acceptance-20261014/evidence/K03-crop-nw-settled-ax.txt)、[NE](../.qa-local/all-acceptance-20261014/evidence/K03-crop-ne-settled-ax.txt)、[SW](../.qa-local/all-acceptance-20261014/evidence/K03-crop-sw-settled-ax.txt)、[SE](../.qa-local/all-acceptance-20261014/evidence/K03-crop-se-settled-ax.txt)settled AX每段都有16:9文字和正确bg-zoom；root实际拖动四角，文字声明不代替独立像素aspect不变量测试。[move](../.qa-local/all-acceptance-20261014/evidence/K03-crop-move-settled-ax.txt)显示x7/y6，[knob](../.qa-local/all-acceptance-20261014/evidence/K03-crop-rotate-settled-ax.txt)显示137°；[磁盘存盘](../.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-native-crop-saved-20261014T172440895912Z.json)为137/zoom0.44510035419126326/offset6.90672963400236、5.9184611344537785，[IAB reload controls](../.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/K03-crop-browser-after-reload.json)137/45/7/6精确对应rounded展示，截图同时有预览和宿主背景。后续slider改rotate45、opacity.24/blur6/fitrepeat由[清除前已存盘](../.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K04-before-clear-20261014T173435746804Z.json)和[可见controls](../.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/K04-clear-ui.txt)支持；range-input-proof只证min/max，不单独当用户动作。

[非法图磁盘保持](../.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-native-invalid-after-20261014T171455795692Z.json)原root瞬间错误随后被sticky通知覆盖，settled AX不是初始error。[oversize错误](../.qa-local/all-acceptance-20261014/evidence/K03-native-oversize-feedback-ax.txt)确有“图片不能超过8MB”；[延迟after](../.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-native-after-oversize-delayed-20261014T172654468125Z.json)与before同bgImage及四文件库存/hash，但期间有crop/旋转，不能说全部bg参数或配置字节未变，也不推无HTTP。修后[原生错误持久](../.qa-local/all-acceptance-20261014/evidence/K03-fixed-invalid-feedback-persistence.json)17:58:15.979→17:59:02.946Z **46.967秒**同上传失败文本保留，无中间save/reload；网络两poll由95单独证明，不推原生每poll count。[修后5磁盘checks](../.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-fixed-native-after-invalid-20261014T175911430853Z.json)bgImage仍空/参数与其他scheme/四文件保持。首次文件名漏前缀弹Windows找不到文件属于定位无效尝试，随后正确79Bfixture进入程序的拒绝才计该case。

K04 [after清引用](../.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K04-after-clear-20261014T173635268190Z.json)证明**bgImage=''已存盘**，rotate45/zoom0.4451/offset6.9067、5.9184/fitrepeat/opacity.24/blur6保留、其他scheme及四文件SHA/库存全保持，清的是引用，不删除磁盘图。[IAB空态](../.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/K04-clear-ui.txt)尚未选择背景图；K04-clear-browser.jpg头栏仍有未保存改动，单图只证即时空态/controls，保存以较后disk独立证据为准。[native Ctrl+r后AX](../.qa-local/all-acceptance-20261014/evidence/K04-native-clear-after-refresh-ax.txt)与[refresh后7磁盘checks](../.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K04-native-clear-after-refresh-20261014T180135808401Z.json)现已补齐：AX是会话页11/SSE连接，不是设置空态文字，root另观察宿主背景为空；空引用/其余参数/四文件及其他scheme由磁盘证明。没有归档覆盖无关桌面内容的原生截图，不把IAB图当native。正常close/restart尚待，不预填重启保持。

### Z05 真实六小时：子场景已完成

[final](../.qa-local/all-acceptance-20261014/soak-restart-20261014/final.json)11:39:41.378Z→17:39:50.017Z，北京10/14 19:39→10/15 01:39真实跨午夜，monotonic21600396.515ms、362采样、actualSixHours/complete/passed=true，13driver checks true/errors0。[独立最终10checks](../.qa-local/all-acceptance-20261014/soak-restart-20261014/independent-final-verification-20261014T174422Z.json)owner63776消失、16166/67/68释放、lock自然消失、lifecycleexit0，四收尾<20s、timer/handles0；[工具clock独立补证](../.qa-local/all-acceptance-20261014/soak-restart-20261014/independent-final-clock-link-20261014T174549Z.json)记录17:44:21实际工具时钟，先前null记录保持原样。189源clone全hash保持，较新15份生产差异未被此长跑加载；不含hotReload、真实Q/M/C、nativeGUI/FPS或最新全修复。

[额外提醒及发送一一核对](../.qa-local/all-acceptance-20261014/soak-restart-20261014/independent-seeded-reminder-send-accounting-20261014T175017Z.json)9checks全true：360注入唯一marker对应360同目标唯一回复、missing/repeat/unexpected/wrongTarget各0；另一次未带输入marker发送准确为seed后1h预置提醒，due12:39:36.982/实际12:39:47.964、24ms后fired、唯一内容/目标/SHA匹配，361全部解释。只证明mock action capture，不是QQ送达；原保守“one send unresolved/perInput notverified”的独立投影保留，由新增审计补齐不覆盖。RSS71→205MB、heap20→107MB包含helper证据积存与360session分配，没有自动内存泄漏判定，“重复timer6保持”等检查不能替代无泄漏证明。

本次Z05由条件不足更新为部分通过，真实6h/跨日/重连/一次503恢复/暂停积压/去重/收尾子项已执行；缺最新热更/真实QMC/GUI/内存证明，不升整行通过。root已同意K03明列有限本地合成条件通过、K04部分、Z05部分。本次已实际逐行重数186为11通过/96部分/2失败/76条件不足/0待测/1延期；107通过或部分/109含失败尝试，不能叫全项目完成率。K03不额外要求遍历全部组合，也不扩大GIF/FPS结论；K04正常重启与其余组合仍缺。

### 两项文案精度更正

1. settings.load普通无reset分支先额外GET status，再批量7项config/providers/templates/tools/availability/search/vision；因此源码路径是**状态读取后再读7项设置数据，8个额外GET**，不把“7项批量”称所有额外请求总数。
2. 首95readiness关闭未隐藏Timeout是事实；reducedMotion后进入新branch支持稳定定位，但装饰动画为因果推断且无独立eventtrace，不把精确原因写死为动画bug。原失败及同final95产品红绿保留。

ZIP重复前缀修后[实际native traversal17checks](../.qa-local/all-acceptance-20261014/evidence/zip-headed-independent/ZIP-round7-prefix-after-traversal.verification.json)也已通过，exact安装失败：安装包含不安全路径，old双前缀原证保留、管理/extension/bundled/runtime/catalog/namespace/config/testtools前后diff空；仍只该本地包子项。[S04最终等待/渠道恢复](../.qa-local/all-acceptance-20261014/evidence/two-tool-headed-independent-effective-day/S04-final-wait-channel-complete-verification.json)15966/v1、qa-local/qa-chat、wake200、two-tools已安装但停用/注册0；原override缺省→显式true语义恢复而非结构原样，storage5/Oct15ledger458保留。proxy15986仍活，不说全部helper退出或所有背景/价格配置字节恢复。

最新重做的oversize不是只靠旧延迟snapshot：[修后实际超限AX](../.qa-local/all-acceptance-20261014/evidence/K03-fixed-oversize-feedback-ax.txt)明确图片不能超过8MB；[修后完整5 unchanged checks](../.qa-local/all-acceptance-20261014/fixtures/background-formats-20261014/projections/K03-fixed-native-after-oversize-20261014T180055150879Z.json)与175911 before同bgImage=''、所有背景参数/四文件/其他scheme保持，现已关闭这一有界拒绝子项。旧期间crop变化的snapshot仍保留，不改写成全配置字节不变。

当前第9轮[独立run-plan](../.qa-local/all-acceptance-20261014/evidence/full-regression-round9-2026-10-14T18-09-18-420Z-de28b27b/run-plan.json)18:09:18.508Z实际启动，完整366/tree eaccc49d697ea7ad2ed7c1e02d6ea2b45dcc2e823ca72ae9b656dd8b37401e97；相对R8生产0变更、95同，唯一test80加等待旧clear按钮detached，所有原strict断言保持。当前final pending，不能将启动/before冻结写成完整green。R8唯一80等待竞态是观察器修正版本，原121/122/overallfalse继续原样。

当前186条：**11通过、96部分通过、2失败、76条件不足、0待测、1延期**。K03仅本行有限本地合成条件通过，K04部分，Z05旧189copy真实6h部分；107通过或部分，109含失败尝试，仅是范围明确的覆盖/尝试数量，不是全项目完成率。P01/P06仍同一真实QQ隔离缺口的两失败行。安装包继续延期，无打包。

[本次四文档完整备份](../.qa-local/all-acceptance-20261014/evidence/formal-doc-integration/2026-10-14T18-15-32-485Z-b86a04e7/backup-manifest.json)保存增量前全字节；本次仅文档和外侧证据，没有源码/测试/配置/GUI/网络修改。


## 2026-10-15 最终完成态补充

此前“R9运行中”“正常重启待测”均为历史时点，以下为最新结论。[R9完整回归](../.qa-local/all-acceptance-20261014/evidence/full-regression-round9-2026-10-14T18-09-18-420Z-de28b27b/final-verification.json)已于18:18:46.942Z完成：M3 **122/122 exit0**、M4 **10/10 exit0**，[独立14checks](../.qa-local/all-acceptance-20261014/evidence/test80-dom-settlement-repair-round9-2026-10-14T17-55-46-111Z-6f24f8a8/full-round9-independent-verification.json)全部通过；366文件before/after/live冻结tree eaccc49d697ea7ad2ed7c1e02d6ea2b45dcc2e823ca72ae9b656dd8b37401e97不变，本次文档写入前后也未变化。相对R8仅test80增加等待旧清除按钮detached，原strict断言和生产源码保持；R8真实121/122失败及R6失败、R7通过等原始历史仍保留。当前清单逐行重数仍为 **186＝11通过／96部分通过／2失败／76条件不足／0待测／1延期**；P01/P06是同一QQ隔离缺口对应的两行失败。132个自动回归文件通过不代表186项全部完成；旧189源副本的真实六小时证据仍只用于Z05部分覆盖，不冒充最新源码、真实QQ/商业模型/社区、热更新或满帧率验收。

正常原生关窗18:02:17.931Z后，[关闭独立9checks](../.qa-local/all-acceptance-20261014/evidence/final-native-restart-readonly/closed-20261014T180527Z.json)确认72188消失、15967真实refused、锁自然释放；18:15:18.877Z以相同data/profile99正常启动82300，[重启独立9checks](../.qa-local/all-acceptance-20261014/evidence/final-native-restart-readonly/restarted-20261014T181737Z.json)和[七次健康采样](../.qa-local/all-acceptance-20261014/evidence/final-native-restart-readonly/existing-82300-health-20261014T181720697Z.json)通过（核验过程22.173秒）。raw config SHA598bd48d31dda427694c80830861eee0b85671bd635bd54ca8cff5b5d0ba1ee8在关窗前、关闭后、重启后完全一致：空背景引用、当前裁切/显示参数、四图文件、11会话、KV5及6成员8印象保持；旧native exit code未知仍null，不宣称exit0。[新native会话AX](../.qa-local/all-acceptance-20261014/evidence/K04-native-after-normal-restart-sessions-ax.txt)确认11会话/SSE连接；[新native UIKit AX](../.qa-local/all-acceptance-20261014/evidence/K04-native-after-normal-restart-uikit-ax.txt)和[同服务器可见IAB DOM](../.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/K04-after-normal-restart-browser-ui.txt)确认“尚未选择背景图”及45°／45%／X7／Y6／24%／6px／平铺。[干净IAB截图](../.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/K04-after-normal-restart-browser.jpg)仅证明画面中的参数，空背景标题在其viewport上方，不以截图声称该标题可见。K04清引用→保存→刷新→正常关闭/重启子链已齐，整行仍部分；K03仅有限本地合成条件通过，GIF只认采样循环而不扩称FPS。15966 peer和三个闲置proxy按root决定保留，本次未停止它们；安装包继续延期。首次浏览器自动审批超时的原记录和唯一成功重试均保留，无绕过。此增量只修改四份文档，[完整写前备份](../.qa-local/all-acceptance-20261014/evidence/formal-doc-integration/2026-10-14T18-35-24-206Z-4393b439/backup-manifest.json)已保存。


## 2026-10-15 第11轮完成与本地修复增补

此前“R10/R11待完成”是历史时点。[R10](../.qa-local/all-acceptance-20261014/evidence/full-regression-round10-2026-10-14T19-50-27-246Z-dd3da4b2/final-verification.json)与最新[R11完整回归](../.qa-local/all-acceptance-20261014/evidence/full-regression-round11-2026-10-14T20-22-08-951Z-2531dd10/final-verification.json)均实际 **M3 125/125 exit0、M4 10/10 exit0**。R11于20:33:51.957Z结束，369文件（含171测试文件）before/after tree **2fa7cf892f5c8ae130a42352b8d4f761f63a0d1f3c7d5b6a712ab47aee67557d**一致，0 changed/added/removed，原94及R6–R10全目录历史保持。R10的b4955d旧树仍是其时点的完整绿；R6/R8真实失败、R7/R9/R10通过及各观察器更正保留，不用后来的绿覆盖原红。完整自动回归的135个通过文件不等于186项规格全部验收；本次逐行重数仍 **186＝11通过／96部分通过／2失败／76条件不足／0待测／1延期**。P01/P06是同一真实QQ隔离缺口对应的两失败行。旧189源码副本的真实六小时仍只覆盖其有限本地mock范围，不证明当前新增源码、真实QQ/商业模型/社区、全部热更或FPS。

主题上传已按逻辑方案、模式和请求版本归属，普通同槽重命名、配色、另一窗口普通设置保存引发重建可继续合法请求；换槽/基准自定义/ABA、清图、整方案恢复、离页/销毁和新选择使旧请求失效，成功刷新当前预览，旧catch/finally不误处理新选择。[同一最终155驱动](../.qa-local/all-acceptance-20261014/evidence/theme-upload-lifecycle-repair-20261015/round2/final-verification.json)对原始3e81客户端不可变字节红13/18、修后18/18，另实际当前预览src/解码的同槽4组全绿，73/115/117/122均exit0；[第二作者13项](../.qa-local/fix-all-20261015/theme-upload-second-author-review-2026-10-14T19-36-32-348Z-a822e920/independent-theme-upload-review.json)通过。旧源对照仅替换客户端模块，其他依赖为当前版，不能称旧全树回归。较新的真正有头同槽案例：native A上传20:38:17.086Z产生HTTP200，另一可见IAB客户端20:38:27[保存普通customRules](../.qa-local/fix-all-20261015/headed-probe/evidence/valid-origin-2026-10-14T19-46-33-435Z-c24a49f0/theme-actual-rebuild-settings-save-dom.txt)，20:38:31.234Z释放回包，等待14.148秒低于15秒预算；root核实磁盘A由bg-399c19e8e7e2变为bg-30be2f477be4.png，B引用空、mode保持A。[native结果](../.qa-local/fix-all-20261015/headed-probe/evidence/valid-origin-2026-10-14T19-46-33-435Z-c24a49f0/theme-actual-rebuild-native-result.json)确认同槽且不再空图；[同服务器IAB预览结果](../.qa-local/fix-all-20261015/headed-probe/evidence/valid-origin-2026-10-14T19-46-33-435Z-c24a49f0/theme-actual-rebuild-preview-result.json)实际src为bg-30be2f477be4.png、complete=true、960×540，[可见预览](../.qa-local/fix-all-20261015/headed-probe/evidence/valid-origin-2026-10-14T19-46-33-435Z-c24a49f0/theme-actual-rebuild-preview.png)另存干净截图。较后保存覆盖上传反馈，结果中feedback为空，不据此虚报捕获了成功toast；也未保存含无关覆盖层的原生截图。

有头试验边界已纠正：[只读超时诊断](../.qa-local/fix-all-20261015/headed-probe/evidence/valid-origin-2026-10-14T19-46-33-435Z-c24a49f0/readonly-timeout-diagnosis-20261014T203459906Z-01258744/readonly-timeout-diagnosis.json)确认首跨槽112.492秒、首同槽61.930秒均超过上传三层15秒预算；proxy即使响应已断开仍记upload-delivered，因此这些旧HTTP200日志只证明上游备好回包，不能证明客户端收到成功回包并由生命周期逻辑拒绝。旧跨槽只限引用无串写/配置保持，首次Origin403为无效上传尝试。20:34:33快成功在普通保存已完成后才开始，仅验证正常上传；20:36:19尝试没有新upload-held，未计通过。上述原记录全部保留，不削弱155已有严格回包/当前预览断言。随后[正常预算跨槽实际重做](../.qa-local/fix-all-20261015/headed-probe/evidence/valid-origin-2026-10-14T19-46-33-435Z-c24a49f0/theme-cross-slot-within-budget-final-result.json)已完成6项检查：held HTTP200为20:40:48.313Z，另一可见客户端20:41:00保存B后，20:41:00.533Z释放，12.220秒低于15秒；native当前B仍空图，磁盘A保留bg-30be2f477be4.png/B引用空、queue0、panel69dc。[保存DOM](../.qa-local/fix-all-20261015/headed-probe/evidence/valid-origin-2026-10-14T19-46-33-435Z-c24a49f0/theme-cross-slot-within-budget-save-dom.txt)与[native结果](../.qa-local/fix-all-20261015/headed-probe/evidence/valid-origin-2026-10-14T19-46-33-435Z-c24a49f0/theme-cross-slot-within-budget-native-result.json)另存，不能将本次结果回填到旧超时试验。**主QA五文件同步尚待root，不因源码完整绿或临时有头服务通过而声明主QA已加载最新版本。**

插件监听修复扩展根替换后的自动重绑、owned watcher error/close处理、500ms debounce及有界退避、hotReload即时开关与补停用期间修改、manual stop撤订阅且不复活。[156最终4/4](../.qa-local/fix-all-20261015/watch-root-recovery/green-result.json)和[独立窄审/10项原生canary](../.qa-local/fix-all-20261015/watch-root-recovery/independent-readonly-review.json)通过，旧最终1通过/3失败保留。挂起setup期间Off→On、旧ctx幽灵注册被拒、恰一工具/四watchers与最终资源归零为有限合成证据；stable parent本身被毁及全部有头热更组合不由此推定。R11包含这些修复，但E04整行仍部分。


Stage2此前V1的low-label-build87/exit20、七项native exact false和最小LABEL-only首program API成功但exactfalse/控制flags改变的记录保留；原V1完整native before未保存，不能重建或声称原metadata/future inheritance已精确恢复。V2修正ML字符串、owned Job kill-on-close与失败有界drain、token失败先于任何IO、属性列表清理、后代potential dirty及full raw Control严格比较，[r2独立代码审查](../.qa-local/all-acceptance-20261014/fixtures/appcontainer-stage2-20261015-aa26d70c/evidence/revised-v2-prepared/independent-r2-code-review-20261014T200511087Z-3fbdae66/independent-stage2-v2-r2-source-review.json)14项及20+7pins通过。随后在用户批准的原固定七对象/同moniker/SID/0caps/自身Echo/no vendor/no network范围[实际V2执行](../.qa-local/all-acceptance-20261014/fixtures/appcontainer-stage2-20261015-aa26d70c/evidence/root-v2-run-20261014T200650774Z-7df1ed76/root-verified-result.json)exit0、9项通过：三个实际token均AppContainer/预期SID/Low4096/caps0，allowed读写成功、blocked拒绝error5，owned Job实际0、自己创建profile删除且不存在。七项native DACL/label/control对**实际V2执行前基线**精确恢复；[独立后验11项](../.qa-local/all-acceptance-20261014/fixtures/appcontainer-stage2-20261015-aa26d70c/evidence/independent-post-v2-20261014T201355300Z-34601ed9/independent-post-v2-verification.json)再核before/rollback/current一致、ML0、profile目录/映射/native absence、selfprocess0及V1软件/失败记录保持。合成write-probe/inherited-output按授权发生写入，恢复声明只限权限基线，不称所有合成文件字节还原。**V2成功不抹V1失败，不重建丢失before，更不证明真实QQ GUI、登录、网络、IPC或user-data-dir隔离；P01/P06评级保持。** 本次只追加四份文档，原历史原样；安装包继续延期。



## 2026-10-15 第11轮主QA同步与重启收尾

上段“五文件同步尚待”是历史时点，现已完成。[独立实际同步13项](../.qa-local/all-acceptance-20261014/evidence/independent-actual-five-sync-round11-2026-10-14T20-47-39-642Z-cdc323aa/independent-actual-five-source-sync-verification.json)确认只更新五个目标、五个原文件备份精确、187个已复制core源码匹配当前生产及R11、其余182个未变，完整138文件静止数据before/snapshot/after逐路径逐字节一致；开发用途的11个未复制文件仍明确省略，不称完整369文件都部署到QA。首次sandbox启动47676发生FATAL且已退出，原失败日志保留；以原启动器和相同data/profile99重试85660正常启动，再由既有single-instance refocus恢复native1443924。[最终独立24项](../.qa-local/all-acceptance-20261014/evidence/independent-restart-round11-20261014T205112478Z/independent-final-restart-verification-corrected-observer.json)核实旧82300/失败47676均消失、实际85660拥有15967、profile99/固定QA路径/原launcher8c17及五源码指纹保持；[native必要AX结果](../.qa-local/all-acceptance-20261014/evidence/final-five-source-sync-round11-2026-10-14T20-44-25-801Z-420b62fa/restarted-native-summary.json)由root实际观察导航/SSE内容，无sandbox降级、ACL更改或kill，也未保存含无关private overlay的全桌面截图。重启后32个非日账业务文件字节保持；六份日账仅正常会话重放产生savedAt变化，records/usage/价格/aggregate深等，不能称全部live缓存/锁/日志/派生索引或原始日账字节都不变。实际保留11会话（0running/0waiting）、6成员8印象、3聊天55消息、1渠道、KV5、6日账、当日1run/458tokens、4背景资产；tools.overrides是primitive true，原首次观察器schema/日账误判的false报告已保留并另纠正，没有为过测改产品或数据。

真实QQ/登录/网络/IPC未提升为通过，现有peer与proxy也未声明全部停止。Stage3此时仅为独立QA候选准备，未执行vendor/Profile/ACL新流程；该准备不代表已有新scope批准或已Run。最新完整回归仍为R11的125+10全绿/369冻结树2fa7cf，186条评级仍 **11通过／96部分通过／2失败／76条件不足／0待测／1延期**，P01/P06同一QQ缺口两失败行保持；旧V1metadata失败和旧189源码六小时范围继续保留。此收尾只增补四份正式文档及外侧证据，历史prefix完整，未改源码/测试/配置/数据或操作UI，安装包继续延期。



## R15完整回归通过，主程序已部署，余项验收待完成

[R15完整真实回归](../.qa-local/all-acceptance-20261014/evidence/full-regression-round15-2026-10-15T00-14-11-600Z-f5793ba0/final-verification.json)actualpassed=true：M3 128/128exit0（00:14:11.700–00:23:53.429 UTC）、M4 10/10exit0（至00:23:55.837）；374前后树`8cca7f576cedff95f08a91b3572f855b47f619f7cbee9adf97b4ec40a1ae03f7`一致，完整src59/bundled51/ui70/electron3/scripts14/test174/pkg2/ignore1，test94及R6–R14全部旧字节保护真。相对[R14真实127/128失败](../.qa-local/all-acceptance-20261014/evidence/full-regression-round14-2026-10-14T23-49-33-475Z-846d4f1d/final-verification.json)仅108`f72a8001…`测试同步，生产与ignore其余373全不变；[R13中断主证](../.qa-local/fix-all-20261015/round14-lock-http-repair/r13-interrupted-primary.json)是370同源/53开始/无M3final/M4未起，不是全绿或产品断言失败；[R12真实125/126失败](../.qa-local/all-acceptance-20261014/evidence/full-regression-round12-2026-10-14T22-56-34-560Z-6de970ee/final-verification.json)保留。首次R15 QA runner误替换历史receipt路径、未开始M3即ENOENT的准备/不完整目录原样保留，[路径修正与实际启动前guard](../.qa-local/fix-all-20261015/round15-primary-path-correction-2026-10-15T00-10-37-783Z-0351de1f/corrected-final-preparation-actual-verification.json)仅修QA runner回真实receipt，不造dummy、不改产品；不能用旧c1e104准备当full，实际执行50d6272a runner才是本R15。

[108真实延迟POST红绿](../.qa-local/fix-all-20261015/test108-save-synchronization-2026-10-15T00-03-44-808Z-755e781d/final-test108-synchronization-verification.json)保留旧/最终测试真实1200ms held POST红绿、三个viewport200/finished/UI saved后原GET与新disk、普通108和73exit0；原13条assert行逐字保留。早先`all12OriginalAssertionsUnchanged`只计行首assert而漏if内一行，实际metadata补13并保留旧说明，无弱化断言；R14整体false不能被此更正覆盖。


[启动恢复锁主证](../.qa-local/fix-all-20261015/round14-lock-http-repair/lock-repair-targeted-primary-corrected-observer.json)原159首driver与最终扩展driver各保存，明确sameFinalDriverOldSourceExecuted=false；原两真实kernel同时ready红、最终stale竞争/被结束claimant回收/四fresh唯一赢家/HTTP/退出释放绿与126/135/101/131关联绿，不伪造完全同驱动红。[背景HTTP与备份忽略12项证明](../.qa-local/fix-all-20261015/background-upload-limit-repair-2026-10-14T23-37-35-028Z-ec62bfba/final-upload-limit-and-backup-ignore-verification.json)12检查全真，160`00343840…`同最终driver旧6/10exit1→最终10/10exit0，HTTP`4bbc01cc…`只为精确背景POST加base64 JSON容积额度，图自身8MiB校验和普通/邻近/auth/Origin/12soft/16hard保持；09 37/37、31 57/57green。ignore`aa06b893…`只假路径验证`data.backup-*`，R14起纳入freeze，不读真实data/备份；373原scope+1ignore=374不得与旧370混写。

[Stage4归因边界](../.qa-local/q4-75c6aa6b/evidence/independent-post-stage4-20261014T223816012Z-463fce53/stage4-failure-attribution-source-and-records.json)只承认actualQQ创建/token7合格/无GUI/metadata未知、原native20failed，未以Stage5自然退出反推Stage4原因。[Stage5合并真值](../.qa-local/q5-08702061/evidence/independent-post-stage5-20261014T233513563Z-b93fb585/independent-stage5-post-merged-truth.json)5项真是原24/26+只读4/4的清理补证：2752实际baseline原生权限完全恢复、2528public同、profilegone/own0，新LowData与20字节合成写入保留；原native20/tool1/QQ同held句柄4235ms code`0x80000003`无GUI/原因unknown仍false。V1丢失native before未重建，无账号认证/网络验收，P01/P06仍未通过。

Root正常关闭旧主R11 PID85660，同一held句柄exit0、进程gone/锁释放/claims0/10秒预算实际ConnectionRefused，首2秒timeoutfalse保留。[R15实际八源复制](../.qa-local/all-acceptance-20261014/evidence/final-eight-source-sync-round15-2026-10-15T00-37-39-858Z-56ae1dee/sync-result.json)已完成7修改+1新增，188core与固定8目标一致，139份关闭状态数据before/snapshot/copy-after字节完全相同；随后正常启动PID84308/profile99/15967，原启动器8c17未改，[重启独立19项语义补证](../.qa-local/all-acceptance-20261014/evidence/main-restart-r15-20261015T003804651Z-5f282fa8/independent-main-r15-semantic-supplement-1792025205520.json)全部通过，精确创建身份/端口owner/锁/claims0/boot-ready已核。业务11会话、7份记忆文件、3份消息文件、KV calls5、4背景和配置保持；六份日账仅savedAt因正常重放更新，其余记录/价格/聚合/JSON逐键一致，不能说重启后全部raw bytes相同。原17/19false及Root两次CIM/日期parse false、childCIM不可用报告原样留，用新补证追加更正。当前没有main页面/DOM/AX/HTTP读取，15967保存的browser拒绝仍待实际解除及用户回复，不以源码部署替代页面交互。OneBot15966当前未连接/30秒WS重连，独立本地替身只准备未启动，不写恢复成功。[F011新实际31项限定补证](../.qa-local/fix-all-20261015/f011-r15-native-presence-author-audit-2026-10-15T00-43-35-068Z-43c445d9/independent-f011-native-presence-limited-verification.json)支持真实native popup出现和预期held exit1，但正文AX未成功读取/谁关闭unknown，Root未click/key，不作人工确认或A10整行通过；[F012新原生限定15项补证](../.qa-local/native-renderer-fixed-r14-9226b1a5/f012/evidence/independent-f012-fixed-actual-1792024520807.json)实证held PID89204 exit0/31952ms、真实renderer crash日志与30秒观察，旧exit1/EBADF QA记录器失败保留，未改生产处理逻辑。 当前186行仍为通过11、部分通过96、失败2、条件不足76、待执行0、延期1；P01/P06是同一未完成QQ隔离缺口的两失败行，局部单测、token、清理或自制进程不能替代真实完整验收。不打包。 原189冻结长跑六小时通过仍仅其旧mock范围，不覆盖当前374、GUI/FPS或真实QQ/模型/市场；既有R11正式前缀不改，源级R15green不算全部剩余QA完成。本段按Root授权追加，部署/重启与两个限定原生子例已完成；主页面交互及完整真实条件继续待验。


本轮当前状态（2026-10-15T00:53:35.660Z）以上述R15终态与实际部署/重启为准，覆盖此前历史段落中的“R12/R13/R14尚运行”“主QA仍加载R11/同步待办”等旧时点表述，原历史前缀及所有red/false/incomplete证据不删不改。[Root原始时间字符串的精确身份补证](../.qa-local/all-acceptance-20261014/evidence/main-restart-r15-20261015T003804651Z-5f282fa8/root-exact-start-time-original-json-string-supplement.json)保存tickdelta0/CIM六位精度匹配，未把损失精度的旧false抹掉；[F011精确owned进程消失与锁释放补证](../.qa-local/fix-all-20261015/f011-r15-native-presence-author-audit-2026-10-15T00-43-35-068Z-43c445d9/additional-root-owned-process-absence-verification.json)只认本测试PID，无全部helper退出声明。F012只观察自有Sky窗口元数据，无DOM/AX/page/截图；F011只观察native presence/委托marker/预期exit1，正文与关闭者仍未知。A10仍部分通过，P01/P06仍失败、实际市场/商业模型前提未齐，186等级11/96/2/76/0/1不变，安装包延期。

[更新后正常第二实例的实际主证](../.qa-local/all-acceptance-20261014/evidence/single-instance-r15-20261015T005102309Z-da573a66/root-actual-single-instance.json)进一步确认同profile99/原wrapper的duplicate29144由原held句柄exit0、production日志single-instance-denied，primary84308同原StartTime保持alive；未读取页面、未观察refocus，不推广全部单实例组合或运行中数据全raw bytes不变。


本地连接恢复补记（2026-10-15T01:03:11.483Z）：此前断连/“只准备未启动”保留为原取证时点；Root现已实际一次启动独立合成peer38868，loopback15966约232ms ready，自己状态client1/connectionTotal1/self900001，主84308的00:55:50日志实际WS已连接并出现合成900001。[作者实际只读25项核验](../.qa-local/standalone-peer15966-r15-1eb90c4a/evidence/author-readonly-passive-reconnection-2026-10-15T01-00-13-905Z/independent-passive-reconnection-actual-verification.json)支持有限passive mock恢复，只有3次get_login_info探测，model/audio/chatEvents均0、无主动emit/真实QQ/外网/配置更新；配置保持仅引用Root对139关闭副本基线中配置hash的投影，不称全部运行中139文件raw bytes相同。[Root按存在至少一次的正确补证](../.qa-local/standalone-peer15966-r15-1eb90c4a/evidence/root-passive-reconnection-presence-supplement.json)保留真实3条匹配，[首“恰一条login”observer误判false](../.qa-local/standalone-peer15966-r15-1eb90c4a/evidence/root-passive-reconnection-proof.json)不覆盖。主84308与peer38868保留运行，不宣称所有helper已停；主15967保存的browser拒绝仍待用户实际解除/回复，无page/AX/HTTP绕读，本地重连不等于真实QQ/模型/媒体/UI验收。P01/P06失败、A10部分及186评级11/96/2/76/0/1保持，安装包延期。


服务恢复补记（2026-10-15T01:53:10.749Z）：[主恢复15/15](../.qa-local/all-acceptance-20261014/evidence/main-recovery-stale-r15-20261015T014656114Z-14151edd/independent-main-recovery-jsonlog-supplement-1792028972412.json)与[独立测试连接端恢复17/17](../.qa-local/standalone-peer15966-restore-5fa0bf57/evidence/author-restoration-actual-20261015T014913764Z-1a8355b2/independent-fresh-peer-restoration-verification.json)确认主57808/peer92928恢复，141快照与旧锁留存、业务保持，六日账仅savedAt变化，原14/15日志观察器false保留；[此前data协议错误观测](../.qa-local/all-acceptance-20261014/evidence/main-recovery-stale-r15-20261015T014656114Z-14151edd/root-browser-recovery-status.json)与[用户手动重开后的普通访问](../.qa-local/all-acceptance-20261014/evidence/main-recovery-stale-r15-20261015T014656114Z-14151edd/root-browser-after-user-reopen.json)分别保留，用户称看见控制台后工具仍因保存的用户权限拒绝15967，未读取页面/AX/DOM/截图/主HTTP，未完成本轮有头用例。仅本地合成被动连接成立，peer审计未独立把socket归到主PID；既有128+10回归、186评级11/96/2/76/0/1及真实QQ失败/外部前提判定不变，服务留运行、未打包。


权限阻塞核对（2026-10-15 08:25 UTC）：用户已确认个人空间及该地址“始终允许”，本地精确站点配置亦为 allow；文档所列两份本地管理策略文件不存在，但新工具会话仍在访问原地址前拒绝网络授权，具体拒绝层未明。已保存[权限不一致证据](../.qa-local/all-acceptance-20261014/evidence/browser-permission-allow-denied-20261015T082524Z.json)，不再记作用户尚未设置允许。当前374份源码无增删改，既有128＋10项自动回归结论保持；本轮未执行新的有头用例、未重启测试程序或打包，整体目标未完成。


权限诊断续记（2026-10-15 16:57，北京时间）：用户已重建精确站点记录、改为询问并完整退出重开 Codex；同一浏览器访问同一地址仍在页面访问前被授权层拒绝，具体拒绝来源未明。见[重启后诊断记录](../.qa-local/browser-permission-repair-20261015T083308251Z-edc94190/after-full-restart-denial-20261015.json)和[待用户提交的诊断说明](../.qa-local/browser-permission-repair-20261015T083308251Z-edc94190/browser-permission-feedback-20261015.txt)。本轮曾实际启动独立主测试程序81216并确认拥有15967监听；Codex重启后16:55核对原进程及监听均不存在，未取得原句柄退出记录，退出原因未知，当前未再次启动。本轮无新增有头通过，既有R15自动回归128＋10及186项评级11/96/2/76/0/1保持，未打包、未向外部提交诊断。


有头测试恢复补记（2026-10-15T09:47:24.705Z，UTC）：此前权限拒绝及服务停机记录保留为历史时点。独立主测试版已恢复，用户手动重新打开后，浏览器工具现已实际成功访问15967；按程序现有合成 token 登录后 URL 清除 token，刷新仍可认证且 SSE 已连接。本轮实际加载全部九个页签，确认单个沙箱 iframe；侧栏收放前后九行均46px且纵坐标一致，品牌图标中心不变，“工作面板09”已移除。MCP 空配置设置打开后取消，并实际热更新三次，三条后台激活日志与界面12插件/7加载/0错误相符；未启动 MCP 子进程或授予权限。社区选中图标在焦点离开导航后4.38秒内持续变化，会话未选中图标保持静止；只证明这对图标，不代表全部图标或满帧率验收。QQ“隔离未验证”诊断可开关，启动保护保持，未启动真实QQ。见[本轮实际证据](../.qa-local/all-acceptance-20261014/evidence/main-recovery-stale-r15-20261015T090954978Z-317a79e1/headed-resume-smoke.json)，原生测试版局部截图亦保存在同目录。本轮未发现需修改源码的新缺陷；R15自动回归128＋10结论保持，186条评级11/96/2/76/0/1不变，真实QQ/市场/商业模型及剩余完整生命周期用例仍待验，未打包。


状态入口与页内市场更新（2026-10-15T10:19:25.769Z，UTC）：按用户四条页面批注，模型状态直达设置“模型与渠道”；真实IAB四次点击均到正确目标且不再弹状态对话框，95/141覆盖键盘及同一设置iframe草稿保持。技能/插件页新增“已安装／在线市场”切换，目录通过可替换market.client.listCatalog能力和窄API提供；搜索/分类在本地进行，状态SSE不触发反复联网。实际只读有头预览显示200技能/277插件，语音搜索10项、媒体分类57项（仅为取证时数量）；没有真实扩展下载、安装、账号或公开发布。161有头合成回归覆盖两类市场的加载/空态/失败重试/确认取消/安装失败与惰性请求，焦点回到原安装按钮；151的真实RPC虚拟时间检查覆盖市场专用180秒预算而普通请求额度不变。附带修复HTTP退出等待空闲TCP连接：1秒完成已有响应后关闭残留连接，162旧红新绿且Node24/Electron Node20均通过。16份集成测试全绿，新161/162已纳入M3；本轮没有重跑完整M3/M4，不能把历史R15128+10当作这次新源码的全量结果。独立主QA已备份139份静止数据、同步190份core源码并正常重启，原离线wrapper未改；另开空数据只读15987预览供查看真实目录，禁止安装/账号/发布。见[本次证据](../.qa-local/market-panel-20261015/final-verification.json)与[真实目录截图](../.qa-local/market-panel-20261015/public-plugin-market.png)。186项评级11/96/2/76/0/1保持，剩余完整生命周期验收继续待办，未打包、未改远程服务器。
