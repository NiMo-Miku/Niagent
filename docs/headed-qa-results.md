# 本地有头验收记录（2026-10-11–14）

> 范围更新（2026-10-23）：专属协议端与便携客户端的安装、启动和登录态迁移已从项目范围移除。本文保留其余历史记录；旧编号、测试数量与结果只对应当时范围，不代表当前版本已经完成验收。当前外部协议端由用户自行管理。

**最新冻结点（2026-10-14 develop参考补缺批）**：186项仍为9通过、92部分通过、0失败、84条件不足、0待测、1安装包延期；101项已有覆盖或尝试，占54.3%，不是101项全部通过。[本批严格逐行计数](../.qa-local/develop-gap-closure-20261014/checklist-counts.json)。E01限定本地L/X通过，C10部分通过，真实阿里/认证服务端验证仍未闭合；新本地补缺及完整117+10不抬高真实环境通过数。最新实测及限制见文末，旧批次结论保留。

各批只运行本地源码，不生成安装包。初始2026-10-11批次使用实际Electron原生窗口，数据位于`.qa-local/headed-20261011/`；2026-10-14各批使用可见IAB连接独立合成副本，部分批次伴随Electron，本次修复批仅运行真实内核，各节明确来源，不把进程存在等同原生窗口操作。各副本与日常数据分离。

**本轮修复已完成所列本地验证**：认证、记忆及扩展诊断修复的定向红绿、可见离线操作与完整runner已收尾，M3 113/113、M4 10/10、exit0；首批111/113、10/10、exit1仍保留。自动文件数与186项功能清单分别计数，外部条件和部分通过余项没有据此关闭。

**develop参考补缺批已完成新增本地验证与最终核对**：严格版本门槛补修后，新完整M3 117/117、M4 10/10、exit0；独立可见IAB实际图片预览/离线提交、坏图阻止及移除、历史价格展示均已补证，见文末。198个生产源/测试指纹与旧30/37/38文件备份保持；真实QQ安装/免扫码、阿里和社区服务器保存仍未验证，原失败历史保留。

## 判定规则

- `通过`：实际点击、输入或选择后，界面结果与本地持久化/服务日志一致。
- `部分通过`：已完成的操作有证据，但同一清单行仍有未执行条件，或 QQ/模型等外部环节使用本地替身。下表中限定范围的“通过”不等于整行清单通过。
- `修复后通过`：实际复现问题，修复源码，重新加载运行副本后复测通过。
- `失败`：实际行为不符合预期。
- `条件不足`：缺少真实 QQ、外部账号或对应运行时，不能据本地替身宣称真实环境通过。
- `待测`：尚未完成操作。

本地 OneBot 和模型服务是受控替身；它们验证真实应用内部链路，不代表 QQ 平台或商业模型服务兼容性已经验收。开机启动测试使用记录适配器，避免修改设备日常启动项。外部网络调用在验收副本中受控处理。

## 操作记录

| 功能 | 操作及观察 | 结果 |
| --- | --- | --- |
| 实际 Electron 启动、IPC token、SSE | 实际窗口 http://127.0.0.1:31403/；无 URL token，九项导航，SSE 已连接 | 通过（本地） |
| S02 会话搜索、状态筛选、空结果和复位 | 搜索“QA 合成会话 2”得1条；组合失败状态仍1条；不存在文字得0条和空态，复位得7条 | 通过；聊天筛选与大列表仍待测 |
| S03/S04/S05 会话详情、JSON与工具记录 | 点击实际会话，切换原始JSON并恢复，展开 send_message 参数和结果 | 通过（合成历史）；动态刷新保留仍待测 |
| S08 模型请求中止 | 慢模型请求期间点击“中止”；终态已中止/已发送0，替身记录 clientDisconnected=true，无发送动作 | 通过（本地真实链路） |
| S07 失败后手动重试 | 注入HTTP503生成失败记录；恢复服务后点击“重试”；mv3sikpc-3c4a4266 同ID由 error 变 done，9条总数保持不变，真实send_private_msg发至合成好友 | 通过（本地真实链路） |
| S10 自动跟随运行 | 两次WS触发均自动展示新运行会话，详情随终态更新 | 通过；关闭跟随和筛选保持仍待测 |
| S06 等待倒计时和消息聚批 | 实际显示等待16秒；追加第二条前后同ID、waitUntil=1791721279122不变，两条均进入一次userPrompt并完成一次回复 | 通过（本地真实链路）；等待中中止仍待测 |
| H01/H06 聊天入库与实际测试发送 | 打开测试群，空输入未发送；填写QA-HEAD-SEND后点击发送，输入清空、self消息进入可见档案；本地OneBot记录send_group_msg/group_id=10001/精确原文 | 通过（本地）；真实QQ送达条件不足 |
| H10 图片实际解码 | 在真实聊天窗口滚动至图片，点击“查看图片”，占位替换为正常解码的蓝色图标 | 通过（本地图片）；其它媒体待测 |
| A17 全局暂停/恢复及积压 | 点击暂停，注入一条群消息；未读1，模型请求仍14；只看未读显示1/3；点击恢复后模型请求16、真实send_group_msg至10002，未读筛选变0/3空态 | 修复后通过（本地）；托盘入口仍待测 |
| A14 就绪体检 | 旧版状态展示记录已归档；移除专属运行时状态后，保留 OneBot 连接与模型配置状态 | 当前版本待重新验收，不能沿用旧版通过结果 |
| A12 F5/Ctrl+R授权与导航 | 同一窗口F5曾复现401空导航；修复后实际F5恢复九导航和SSE、11条会话；随后Ctrl+R实际恢复九导航、SSE已连接及13条会话。[journal 98](../.qa-local/headed-20261011/ui-actions.jsonl#L98) | 修复后通过F5/Ctrl+R；未提交编辑恢复仍待测 |
| G04 模型设置连接与试聊 | 主模型测试曾拒绝显式本地端点；修复后实际成功100ms，获取4模型，全部已有渠道1/1成功；单渠道连接/模型试聊成功，受控HTTP503试聊错误明确显示。[journal 88–97](../.qa-local/headed-20261011/ui-actions.jsonl#L88) | 修复后通过已执行的本地链路；CRUD/候选切换及真实商业模型待验 |

详细界面观察记录：`.qa-local/headed-20261011/ui-actions.jsonl`。测试服务的动作与模型连接记录：`.qa-local/headed-20261011/state.json`。截图由实际窗口控制工具逐次呈现，不用自动化接口结果代替界面检查。

## 修复与复测

已复现并修复桌面刷新授权丢失；实际 F5 复测通过。全局暂停入口已补齐，实际暂停/积压/恢复通过。就绪体检的旧版结果不适用于当前状态面板。并行运行时测试发现的发送、拍一拍和记忆计数问题，单独记录在运行时证据文档，不计为已经有头复测。

## 未完成的验证条件

各项余项见下表及逐项清单。真实QQ、收费模型、搜索/社区外网条件仍未具备；安装/删除扩展、托盘及未执行的故障/延迟组合不会因本地替身通过而关闭。

## 后续实际复测（优先于首版的旧故障状态）

| 功能 | 实际操作及证据 | 判定 |
| --- | --- | --- |
| N07 整理完成与重复提交 | 新源码中实际点击整理全部：整理中1，全部整理按钮禁用；本地模型三次请求后自动显示整理完成、整理中0、成员3/印象3，按钮恢复。[journal 70–73](../.qa-local/headed-20261011/ui-actions.jsonl#L70) | 修复后通过整理全部的本地成功链路；修复后指定单人重测、错误/掉线分支及真实QQ/模型仍待验 |
| N08/A16 整理期间弹窗 | 整理中实际打开编辑印象；完成后的自动刷新没有关闭弹窗；输入未提交QA-HEAD-LIVE-DRAFT并取消，无该草稿落盘 | 部分通过；尚未证明输入草稿先于终态事件的覆盖分支 |
| A07/Z06 实际正常退出 | 修复后在closeToTray=false时实际点击原生关闭按钮；主代理核实窗口从枚举消失，PID70952退出，qq-agent.lock不存在，未产生新fatal；随后重新启动恢复可见。[journal 74](../.qa-local/headed-20261011/ui-actions.jsonl#L74) | 修复后通过正常关窗退出；留托盘开关/恢复/退出及完整扩展与外置QQ清理条件仍待测 |
| N01/N02/N06 白名单空档与重启 | 正常重启后实际记忆列表显示4档，含private:20002、0成员/0印象/暂无更新；点击后进入带新增成员按钮的空态，私聊没有群成员按钮。原20003手工记忆及备注重启后可读，更新时间显示人类可读日期。[journal 75–76](../.qa-local/headed-20261011/ui-actions.jsonl#L75) | 修复后通过列表和空档进入；真实QQ、新增聊天/其余编辑分支待测 |
| G04 模型扫描 | 实际打开扫描并等待完成；4个模型有结果、scanning=false；qa-chat/qa-vision/qa-memory为vision，qa-fail为unknown并显示HTTP503。[journal 91–92](../.qa-local/headed-20261011/ui-actions.jsonl#L91) | 本地受控成功/故障展示通过；真实厂商视觉能力仍条件不足 |

首版清单的N07、A07/Z06、N01失败状态已有以上实际复测，后续同步清单时以此表为准，不能据首版计数认为这些缺陷仍未修复。

## 首版清单同步与验收补记（历史）

本次整理读取 [journal](../.qa-local/headed-20261011/ui-actions.jsonl) 第 1–65 条，末条时间为 2026-10-11 20:57:21（Asia/Shanghai），并纳入主代理随后报告的关窗退出和空记忆档案缺陷。未改写该持续追加的 journal。以下磁盘与模型终态事实来自主代理对本轮隔离数据的核实，整理者未读取真实用户文件或操作窗口。

| 对应清单 | 实际操作及观察 | 当前判定及余项 |
| --- | --- | --- |
| N02 新增成员与手工印象 | 实际输入非法 QQ `abc` 后保存被拒绝；改为 `20003`，姓名 `QA 手工成员`，备注 `QA-HEAD-NOTE`，保存 `QA-HEAD-MEMORY：第一条手工印象` 与 `QA-HEAD-MEMORY：第二条手工印象`。界面显示新卡片，主代理核实两条印象及备注已写入隔离磁盘。[journal 47–54](../.qa-local/headed-20261011/ui-actions.jsonl#L47) | 部分通过；新增聊天、空印象和应用重启后重读尚未执行。 |
| N06 群成员搜索 | 在实际群成员弹窗输入 `20002`，显示 `QA 小周`，可打开其备注及现有印象；成员数据来自本地 OneBot 替身。[journal 57–61](../.qa-local/headed-20261011/ui-actions.jsonl#L57) | 部分通过；昵称/名片检索、私聊按钮及真实 QQ 列表条件未完成。 |
| N04/A16 嵌套取消 | 取消嵌套备注编辑后返回父群成员弹窗，搜索仍为 `20002`；将印象草稿改为 `QA-HEAD-CANCEL：这条草稿取消后不应落盘` 后取消，父搜索仍保持。主代理核实 `QA-HEAD-CANCEL` 未写入磁盘。关闭父弹窗后返回成员档案。[journal 59–65](../.qa-local/headed-20261011/ui-actions.jsonl#L59) | 部分通过；其它编辑保存、删除及弹窗类型尚未完整执行。 |
| N07 单人整理 | 实际点击重新整理 `QA 小林`。模型任务已经 `done`，但 UI 超过 90 秒仍显示整理中、没有刷新正确卡片；后续界面记录仍显示“正在整理 · 已 747 秒”。[journal 55–56](../.qa-local/headed-20261011/ui-actions.jsonl#L55)、[journal 65](../.qa-local/headed-20261011/ui-actions.jsonl#L65) | 首轮失败（历史）；100修复后实际整理全部终态刷新通过，见上表/journal 70–73。修复后指定单人及错误/掉线分支仍待验。 |
| A07/Z06 关闭主窗口及退出 | 主代理实际在 `config.server.closeToTray=false` 时关闭主窗口；窗口销毁后退出抛 `Object has been destroyed`。boot-diag 指向 `electron/main.js` 324/325 的 cleanup 读取已销毁 `win.webContents`；owned PID `73468` 残留锁，最终用 CLI 停止。 | 首轮失败（历史）；101修复后实际PID70952正常退出、无锁及无新fatal，见上表。托盘和完整资源清理余项仍待验。 |
| N01 白名单空档案 | QA allow 中有群 `10001`/`10002`、私聊 `20001`/`20002`，实际记忆列表仅列 3 个已有文件，缺少无文件的 `private:20002`，无法直接点击创建空档案。现有档案列表与成员查看可用。[journal 45–46](../.qa-local/headed-20261011/ui-actions.jsonl#L45) | 首轮失败（历史）；102修复后实际列表包含可进入的private:20002空档，见上表/journal 75–76。真实QQ条件仍不足。 |

[逐项清单](headed-qa-checklist.md) 首版共186项：28项部分通过、5项失败、115项条件不足、37项待测、1项打包延期。首版失败项为A07、N01、N07、G04、Z06，其中A07/Z06属同一关窗退出缺陷；这组故障状态已由上述后续实际复测更新，不能当作当前未修复故障数。

上一批同步journal第66–98条时，186项为33项部分通过、0项保留失败状态、115项条件不足、37项待测、1项打包延期。这是历史进度快照，以下本日补记更新当前计数。

## 2026-10-12 后续实际操作

本次读取截至journal第202条（06:35:34，Asia/Shanghai），按第103–199条已完成操作和主代理对隔离进程/锁/磁盘的核查同步。第200–202条仅开始打开组件库，尚无完整主题结果，不记主题通过。整理者只读取记录、更新三份文档，没有驱动窗口、改配置或跑新测试。

| 对应清单 | 实际操作及证据 | 判定及余项 |
| --- | --- | --- |
| U01/U03 模型与会话下钻 | 在实际用量页点击qa-chat，再点击会话mv3piora-3cddae52；子集为1run/2calls、310输入/60输出/40缓存，共370token、¥0.000394；随后二次维度切为聊天。[journal 104–108](../.qa-local/headed-20261011/ui-actions.jsonl#L104) | 已执行的本地子集展示通过；其它维度、关闭及峰谷/原始usage逐项核对仍未完成。 |
| U02 五个时间范围 | 真实键盘操作today/all/30d/7d/24h；今天显示空窗口，其它范围按下表显示。[journal 109–116](../.qa-local/headed-20261011/ui-actions.jsonl#L109) | 范围选择与当前合成历史展示通过；500天前档案、零token与缓存逐档核对及真实模型未验。 |
| U04 工具明细 | 实际点击“查看工具调用”，跳到send_message6次/finish3次。[journal 116](../.qa-local/headed-20261011/ui-actions.jsonl#L116) | 局部通过；模型>20行展开/收起和跨日逐工具求和未验。 |
| E01–E04 Hello设置与生命周期 | 实际筛选Hello，保存QA-HEAD-HELLO、启用并手动热更；会话展开hello_say(name=QA-local-check)返回“QA-HEAD-HELLO，QA-local-check”。实际停用工具1→0、重扫保留hello筛选，展开能力提供者28项。[journal 117–134](../.qa-local/headed-20261011/ui-actions.jsonl#L117) | 捆绑样例的本地设置/启停/调用链路通过；用户扩展信任、权限、自动文件热更、删除/安装等未完整验收。 |
| E03/E16 MCP数组校验 | GUI提交malformed JSON与对象{}均被拒绝，主代理核实原confignull保留；修正[]后首次保存成功。[journal 137–143](../.qa-local/headed-20261011/ui-actions.jsonl#L137) | 本地拒绝/首次空数组保存通过；不能据此宣称已从null首次保存非空数组。 |
| E16/S04 真实stdio工具 | 自编纯stdio Echo脚本由已安装Node实际运行，经GUI写配置并手动热更，发现mcp_qa-local-stdio-echo_qa_echo_1awk7bp；会话mv4dzumv-8594f6e5展开参数text=QA-HEAD-MCP：真实stdio合成回显，结果原样echo、isError=false、sent0。[journal 154–162](../.qa-local/headed-20261011/ui-actions.jsonl#L154) | 真实本地子进程/协议/registry调用链路通过，业务及LLM为合成对端；第三方MCP、撤权/异常退出及旧代故障组合未完整验收。 |
| A07/Z01/Z06 正常退出与MCP重启 | 主代理实际原生关闭PID65776；其已启动MCP73120（父65776）亦退出、锁消失。新PID76288重启后MCP工具1可见，保存配置仍可用。[journal 163](../.qa-local/headed-20261011/ui-actions.jsonl#L163) | 正常关闭及所运行MCP子进程回收通过；托盘、全部扩展/索引/用量flush及外置QQ不误杀仍待验。 |
| E04 107热更修复复测 | 同步routes的107修复后，在实际插件页再次热更MCP；主代理核实日志无注册错误，界面错误0、工具1。[journal 164–166](../.qa-local/headed-20261011/ui-actions.jsonl#L164) | 此本地热更链路修复后通过；未扩大为全部热更/删除/资源组合通过。 |
| A15 原生最小窗口 | 实际Alt+Space→Size、箭头选边界并拖动边框达到最小约束；原始截图948×635，13设置分区首屏可见。[journal 167–183](../.qa-local/headed-20261011/ui-actions.jsonl#L167)、[原始截图](../.qa-local/headed-20261011/screenshots/native-min-settings-13.png) | 已执行的原生最小窗口条件通过；其它缩放/Tab/全部页/大列表仍待验。 |
| G01/G10 非法JSON与未保存预览 | 实际筛选人设、展开高级字段，输入非法JSON阻止自动保存，再填botName=QA-HEAD-PREVIEW-NOSAVE；真实预览含该名字，主代理核实磁盘仍QA小鲸鱼。随后通过UI还原botName与JSON{}，自动保存显示成功。[journal 184–199](../.qa-local/headed-20261011/ui-actions.jsonl#L184) | 这两条本地case通过，整行部分通过；未测延迟响应期间继续输入、SSE覆盖、其它人设字段/组合及真实模型。 |

用量数字对应06:06–06:07的范围操作时点，发生在本批Hello/MCP新增调用之前，不宣称是后续实时总额；成本来自隔离配置与合成usage，不代表真实商业账单。

| 当时实际选中范围 | runs | calls | 成本 |
| --- | ---: | ---: | ---: |
| Today | 0 | 0 | ¥0.000000 |
| all | 13 | 34 | ¥0.006170 |
| 30d | 11 | 30 | ¥0.004258 |
| 7d | 10 | 28 | ¥0.003700 |
| 24h | 9 | 26 | ¥0.002818 |

上述截至第202条时，[186项清单](headed-qa-checklist.md)为44项部分通过、0项保留失败状态、111项条件不足、30项待测、1项打包延期。以下新增主题操作再更新当前进度。

## 原生主题方案后续补记（截至219的历史快照）

本批按journal第203–219条（截至2026-10-12 06:44:02，Asia/Shanghai）和主代理持久化核查同步，仅更新文档与测试runner收录，不驱动原生窗口、改QA配置或启停进程。

| 对应清单 | 实际操作与证据 | 当前判定及余项 |
| --- | --- | --- |
| K01 主题A/B另存 | 实际输入QA-HEAD-THEME-A并另存，界面提示切换至该方案，ID为smv4en2c2n4so；再输入QA-HEAD-THEME-B另存，显示两条方案，B的ID为smv4erxe1hjz3。[journal 207](../.qa-local/headed-20261011/ui-actions.jsonl#L207)、[journal 214–215](../.qa-local/headed-20261011/ui-actions.jsonl#L214) | 保存及切换局部通过；不同ID和“独立方案”文案不等于已经验证颜色独立修改。 |
| K01 B重命名 | 实际将B改为QA-HEAD-THEME-B-RENAMED并保存，显示“已重命名”，仍为smv4erxe1hjz3；主代理确认同ID持久化。[journal 216–219](../.qa-local/headed-20261011/ui-actions.jsonl#L216) | 此本地重命名case通过；删除、重启恢复、A/B及出厂基准的palette独立性仍待原生实测。 |
| K02 108样式载入与按钮可见性 | 108配色按钮换行修复经F5载入真实最小窗口，随后实际打开组件库；主代理滚动后观察到5+3两排共8按钮均可见。[journal 208–215](../.qa-local/headed-20261011/ui-actions.jsonl#L208) | 已观察载入和可见性；逐个点击、15颜色/渐变/尺寸等效果及palette独立性未完成，K02保留待测。 |

截至219时，186项为45项部分通过、0项保留失败状态、111项条件不足、29项待测、1项打包延期；以下补记更新这些条件的后续实际进度。

## 原生配色应用与背景编辑补记（截至264的历史快照）

本批读取journal第220–264条（截至2026-10-12 06:58:08，Asia/Shanghai），结合主代理对隔离配置的核查。本记录仅描述原生文件选择器打开及工具定位/焦点限制，不引用选择器的个人文件信息或其截图。整理者未驱动窗口、改变QA配置或启停进程。

| 对应清单 | 实际操作与证据 | 当前判定及余项 |
| --- | --- | --- |
| K02 最小窗口配色按钮 | 原生最小窗口第二行Linear、Raycast、Flux逐个实际点击，字段随操作变化，8按钮均可见；保存原生截图。[journal 221–224](../.qa-local/headed-20261011/ui-actions.jsonl#L221)、[native-uikit-wrap-after.png](../.qa-local/headed-20261011/screenshots/native-uikit-wrap-after.png) | 此三按钮的原生可见/点击case通过；不是全部15颜色、渐变及布局效果通过。 |
| K01 A/B不同色应用 | 实际先应用A恢复其暗色，再应用B恢复其不同色方案；两张卡片及同ID重命名保留，主代理核实各自保存的参数。[journal 225–228](../.qa-local/headed-20261011/ui-actions.jsonl#L225) | 保存参数独立及来回应用局部通过；109的浅色渲染问题需单独复测，不能把切换观感扩大为全部CSS变量正确。 |
| K01 桌面界面预设 | 在Desktop分区原生键盘Home+Return提交暗色、Down选择亮色、End恢复自定义B；主代理比对持久化，custom方案未被切换操作修改，两个出厂基准slot仍null。[journal 235–239](../.qa-local/headed-20261011/ui-actions.jsonl#L235) | 此预设选择和保存case通过；方案删除、重启恢复及其它独立性组合仍未完成。 |
| K02 109浅色变量修复 | 主代理发现body浅色固定变量覆盖custom；shell_function_fixes已修shell/common CSS并独立跑109/68/62/95/108通过，两份CSS已复制QA。 | 自动回归记录单列；109修复后原生F5及浅色custom实际渲染复测待做，K02保持部分通过。 |
| K03 原生背景选择 | 实际打开系统file picker，但Helper定位/焦点输入不可靠，Escape取消。[journal 243–250](../.qa-local/headed-20261011/ui-actions.jsonl#L243) | **未完成真正原生upload**；只验证入口打开及取消，不记录选择器个人文件内容，也不将工具限制判为上传成功。 |
| K03 API背景预置 | 主代理以API-only预置800×450四色网格合成PNG；证据method明确native picker upload not completed，upload为6420bytes/image/png、配置200。[background-seed-evidence.json](../.qa-local/headed-20261011/background-seed-evidence.json) | 仅API夹具准备，不能计为原生文件上传；没有使用真实个人图片。 |
| K03 原生旋转和框编辑 | API预置后原生F5重新读取背景，实际点击90°旋转按钮、拖右下corner缩至57%，再拖16:9框移动。[journal 251–259](../.qa-local/headed-20261011/ui-actions.jsonl#L251) | 已执行原生编辑并存盘；最终crop图缩小语义正在另查，四角/其它旋转方式及上传格式/拒绝条件未完整验收。 |
| K04 偏移/透明度/模糊 | 原生拖框后offsetX≈12/Y≈6；实际滑块调opacity44%、blur6px，主代理核实config保存。[journal 258–262](../.qa-local/headed-20261011/ui-actions.jsonl#L258) | 参数操作与存盘局部通过；不能仅凭参数判编辑器/宿主裁切一致。移除、重启保持及crop最终视觉结果仍待验。 |

截至264时，186项清单为48项部分通过、0项保留失败状态、111项条件不足、26项待测、1项打包延期；当时109原生F5和crop语义仍未完成。下批实际复测与确认的缺陷更新该历史快照。

## 原生109复测、媒体与聊天补记（截至307的历史快照）

本批按journal第265–307条（截至2026-10-12 07:12:33，Asia/Shanghai）及主代理服务/配置核查同步。除了已执行case，也记录110/111未完成的复测及只读源码入口缺项；没有把自动测试或未提交认证计作有头通过。

| 对应清单 | 实际操作与证据 | 当前判定及余项 |
| --- | --- | --- |
| K01/K02 109原生复测与布局 | 两份CSS更新后原生F5，自定义B浅色外壳正确。[journal 274](../.qa-local/headed-20261011/ui-actions.jsonl#L274)、[native-theme-109-after.png](../.qa-local/headed-20261011/screenshots/native-theme-109-after.png)。实际radius12、密度紧凑/宽松/标准、sidebar右/隐藏/在当前设置Home恢复左均执行；主代理核实B持久化、A未改。[journal 263–273](../.qa-local/headed-20261011/ui-actions.jsonl#L263) | 109这个原生case修复后通过；已执行参数case局部通过，不能关闭110隐藏导航恢复缺陷及其余颜色/渐变组合。 |
| K02 110隐藏导航 | 主代理确认隐藏导航、离开设置后无恢复入口的真实缺陷；shell_function_fixes修三shell文件并独立跑110/95/109/70/62通过。 | QA同步等待111冻结，原生复测尚未进行；按清单规则仍失败，不以headless回归关闭有头故障。 |
| K03/K04 111 ROI | 主代理审查确认缩选框时图也跟着缩小，shell没有按ROI裁切；既有57%/offset/旋转存盘不能证明正确取景语义。 | 已确认失败；extensions修复进行中，未冻结/未同步/未原生复测。真正native upload仍未完成。 |
| G01 112候选边界 | “先编辑再确认”的候选仅见于源码注释，没有authoritative规格依据，主代理决定不改autosave。 | 未实施112，也不将现有自动保存记作此候选的规格失败。 |
| H10 视频与语音 | 本地OneBot替身入站video/record/forward三条。原生点击视频/语音入口再点击原生play，二者时间进度0→1；主代理实际截图有蓝色视频帧。[journal 279–285](../.qa-local/headed-20261011/ui-actions.jsonl#L279) | 本地视频/音频实际播放通过。AX残留disabled“无法播放媒体”与实际画面/进度不符，不能据此误报decode失败；真实QQ、文件/表情及其它媒体条件未完整验收。 |
| H11 转发展开 | 原生点击合并转发，从本地OneBot实际取回1node，显示QA小林/QA合成转发内容。[journal 286–287](../.qa-local/headed-20261011/ui-actions.jsonl#L286) | 此本地取回/显示case通过；嵌套/媒体/时间、重复请求缓存及真实QQ仍未验。 |
| H03 标读/忽略/未来唤醒 | 原生标读3→0、档案21条；新无at入站后1未读/22条，忽略后0/22；恢复再发新at，模型请求31→33、send_group_msg1，UI0未读/24条。[journal 288–293](../.qa-local/headed-20261011/ui-actions.jsonl#L288)、[read-ignore-evidence.json](../.qa-local/headed-20261011/read-ignore-evidence.json) | 本地真实链路通过；忽略仅处理当前未读，没有永久暂停。真实QQ/商业模型未验。 |
| H05 多选与删除取消 | 全选24→刷新仍24，媒体保持进度1；打开删除24确认后取消，档案和选择保留；取消选择0→勾1条→切私聊0。[journal 294–301](../.qa-local/headed-20261011/ui-actions.jsonl#L294) | 已执行选择/刷新/取消/跨聊天清选择case通过；**没有点击最终删除确认**，实际单/多条删除未验，整行部分通过。 |
| A05 双可见控制台 | 第二可见IAB控制台切暂停后，原生Electron同步全局已暂停。[journal 307](../.qa-local/headed-20261011/ui-actions.jsonl#L307) | 此状态同步case通过；全部事件类型、断线恢复及去重仍未完整验收。 |
| C01/C02/C04 社区入口 | 原生打开口令/发布账号/屏蔽三tab；发布账号可见用户名/邮箱、密码、显示名及注册；空口令提交显示本地错误，安装仍禁用。[journal 302–306](../.qa-local/headed-20261011/ui-actions.jsonl#L302) | 界面字段和空输入校验局部通过，注册入口确实存在；未提交真认证、有效口令、安装、外网或上传。 |
| C06 屏蔽tab红字原因 | 原生只读tab出现社区能力未就绪503。只读查明seed/config刻意停用community和market；getBlocklist方法、生产及QA装配均存在，client本地读方法不发HTTP。[fixture开关](../scripts/headed-qa-fixture.mjs#L229)、[默认方法](../bundled/community/index.js#L28)、[默认client](../bundled/market/client.js#L399) | 此次是fixture停用提供者，不是生产漏API或缺账号。主代理将通过原生UI启用既有bundled community后本地复测，wrapper仍阻止外网；本代理不绕过停用、不新增113。 |

## 只读规格与操作入口核对（114前的历史快照）

以下是源码/规格证据，不冒充已在原生窗口提交。确定没有入口或消费者的项不能只标“外部条件不足”；外部网站/服务器的实现与实测条件仍单独保留。核对未读develop、未改业务源码或QA配置。

| 清单 | 当前确定边界 | 规格和源码证据 |
| --- | --- | --- |
| C02 注册 | 字段、按钮与mode=register提交链存在；真实注册/验证码/账号保存未执行。 | [表单](../ui/panels/community/index.html#L52)、[提交](../ui/panels/community/panel.js#L75)、[R48](../../dsh-spec/notes/09b-route-contracts.md#L327)。 |
| C03/C07/C12 外链 | 官网、技能市场、人设广场只有URL表、没有DOM或替代入口；插件市场有“市场网页版”链接，不能因旧按钮ID消失判缺。其系统浏览器/远端操作未验，不能仅凭href判成功。广场本来是外部网站，只判本地入口缺失，不据仓库判远端浏览/发布缺失。 | [空DOM可选绑定](../ui/shell/app.js#L85)、[实际插件市场链接](../ui/panels/community/index.html#L18)、[F172](../../dsh-spec/SPEC.md#L470)、[外部站点边界](../../dsh-spec/SPEC.md#L1544)、[UI外链要求](../../dsh-spec/notes/10-ui.md#L367)。 |
| C08 意见 | 缺意见按钮/输入modal/提交消费者；report_feedback工具不是等价UI。 | [空绑定](../ui/shell/app.js#L86)、[F220](../../dsh-spec/SPEC.md#L509)、[openFeedbackModal要求](../../dsh-spec/notes/10-ui.md#L366)。 |
| C09 金句 | 缺金句入口、进入退出模式、确认/预览/上传；当前聊天多选只用于删除，已有图片/引用展示不替代这一流。 | [删除选择关联](../ui/panels/chats/panel.js#L25)、[F221](../../dsh-spec/SPEC.md#L510)、[模式/确认要求](../../dsh-spec/notes/10-ui.md#L364)。 |
| C10/C11 验证码 | IPC与后端转发存在，UI缺容器、token生产、诊断调用/呈现；未向真实阿里/社区提交认证。 | [直接注册](../ui/panels/community/panel.js#L75)、[已有IPC](../electron/preload.js#L6)、[F222](../../dsh-spec/SPEC.md#L511)、[UI容器](../../dsh-spec/notes/10-ui.md#L242)。 |
| G28 控制台令牌 | 管理UI缺失；主frame IPC与脱敏保密已有。规格支持“令牌管理项”，没有单独规定专用轮换命令/路由，这部分由主代理定实现范围。 | [桌面控件清单](../ui/panels/settings/panel.js#L655)、[F205](../../dsh-spec/SPEC.md#L499)、[server.token](../../dsh-spec/SPEC.md#L825)。 |

截至307时，186项清单为50项部分通过、11项失败、100项条件不足、24项待测、1项延期；当时110/111原生复测及114入口修复尚未完成，多行也可能覆盖同一缺陷。这是历史快照，以下补记更新当前判定。

## 双可见控制台、社区及110/111修复后原生复测

本批读取journal第308–330条（截至2026-10-12 07:28:54，Asia/Shanghai），结合主代理实际可见IAB操作、合成服务/配置核查和代理独立回归报告。IAB是经BrowserUse以visible=true创建的真实tab1，不把headless测试称为可见界面；本代理只记录事实并更新文档/runner，没有操作UI、QA配置或进程。

| 对应清单 | 实际操作及证据 | 当前判定及余项 |
| --- | --- | --- |
| A05 可见IAB初始授权与同步 | 实际IAB URL token清除，SSEgreen、17会话；IAB暂停后原生Electron同步paused；两头同一DUAL-SSE消息显示1未读/25条，IAB恢复后两头0未读/26条、3卡片无重。[journal 307–310](../.qa-local/headed-20261011/ui-actions.jsonl#L307) | 已执行状态/聊天同步case通过，整行部分通过；断网、日志和其它事件类型未测。此次默认group10001，fixture忽略emit的chatId10002字段，不能误记成10002。 |
| A05 116 IAB reload故障 | 主代理实际IAB reload出现401、导航空及pause禁用，shellagent正在修116，尚未复制到QA。 | 明确失败子case，未复测/未关闭；不与已通过的Electron F5或本次同步case混同，116未加入runner。 |
| C06 启用默认社区后的只读名单 | 原生启用bundled community，loaded7→8、cap28→29；再打开blocktab成功“当前屏蔽0”、原503消失。[journal 311–314](../.qa-local/headed-20261011/ui-actions.jsonl#L311) | 本地只读加载case通过，证明此前provider刻意停用表现正常，不修113或绕过停用；未修改名单、未提交认证，wrapper仍阻止外网。community当前启用未restore，market仍disabled。 |
| K03/K04 111修复后取景 | 111冻结后复制5份QA文件并原生F5；20%最小选择只缩框、源图保持大小，拖框green→blue使宿主背景真实red/green→blue；B保存zoom.2/rot90/X-12.887/Y-14.472。[journal 319–321](../.qa-local/headed-20261011/ui-actions.jsonl#L319)、[native-bg-roi-111-after.png](../.qa-local/headed-20261011/screenshots/native-bg-roi-111-after.png)、[native-bg-roi-111-blue.png](../.qa-local/headed-20261011/screenshots/native-bg-roi-111-blue.png) | 此原生ROI缩框/移动/构图case修复后通过；其它铺法/旋转/四角、移除/重启仍未完整验收，K03/K04部分通过。 |
| K03 IAB背景选择限制 | IAB背景按钮实际click，但文档filechooser waitForEvent等待10s超时，仅按钮active，没有上传；browser reload取消旧状态。 | IAB和桌面picker均未完成真正native upload；只记工具限制，不读取/记录个人文件信息。[API-only预置](../.qa-local/headed-20261011/background-seed-evidence.json)仍不能当原生上传。 |
| K02 110导航恢复原生链路 | 110 index及114文件/111 style复制后，原生hide→F5回会话仍ShowNav→click显示九nav→Escape收起、焦点蓝框回ShowNav→再ShowNav选择settings自动收起。config仍hidden，临时操作未改偏好。[journal 322–330](../.qa-local/headed-20261011/ui-actions.jsonl#L322) | 恢复入口故障该case修复后通过；K02其它15颜色/渐变组合未全验。当前B sidebar仍hidden，尚未restore；新settings页仍可达。 |
| 114公共入口源码与QA复制 | 114冻结，社区真实按钮已含市场网页版/人设广场/意见收集，经仅bundled community且固定三target的host RPC打开；已复制QA，但原生公共按钮仍待看/点击。 | 只认源码/独立回归，不计为原生外链通过。C07导航入口的旧missing结论已过时；C03/C12官网/Skill入口、C08输入modal/向作者提交及其它缺项仍保留。 |

114后的入口范围由只读源码复核确认：[社区按钮](../ui/panels/community/index.html#L18)→[click handler](../ui/panels/community/panel.js#L10)→[限定RPC](../ui/shell/rpc-bridge.js#L24)→[宿主打开](../ui/shell/app.js#L99)。人设广场跳转入口已存在，但远端浏览/导入/发布未验；意见外链按钮已存在，但“请求打开意见页面”不等价于[notes10要求的反馈输入/提交流](../../dsh-spec/notes/10-ui.md#L366)。官网/Skill市场仍无当前DOM/替代入口，C09金句、C10/C11验证码消费者和G28管理UI也未因114而关闭。

截至330的历史快照：[186项清单](headed-qa-checklist.md)为54项部分通过、7项失败、100项条件不足、24项待测、1项延期。该时点A05的116 reload、114原生入口观察尚未完成；后续进度如下，不沿用为当前故障结论。

## 115–118与可见IAB后续实操

本批读取journal331–357（截至2026-10-12 07:49:13，Asia/Shanghai）；可见IAB的授权刷新、117确认分支、渠道/YAML和S10详情保持，来源为主代理实际Cua action工具日志、DOM与截图观察及跨tool只读磁盘核查，不伪造为原生journal条目。整理者只改文档/runner，没有驱动窗口、修改QA配置或启停进程。

| 对应清单 | 实际操作与证据 | 当前判定及余项 |
| --- | --- | --- |
| A05 116刷新复测 | 116 app/helper复制后，真实可见IAB tab1从token URL重新打开、query清除，reload成功九导航/17会话/SSE绿；实际点击全局暂停出现toast/status，恢复成功。原生F5也成功九导航/会话。[journal 338](../.qa-local/headed-20261011/ui-actions.jsonl#L338)只对应原生刷新，IAB结果归主代理Cua报告。 | 旧IAB 401/nav空/pause禁用子case修复后通过。AX曾把按钮映成checkbox且isEnabled返回false，但DOM为button、实际点击成功，不记产品缺陷；断网、日志及全部事件仍未验。 |
| K02 左侧偏好恢复 | 110隐藏恢复链路结束后，原生dropdown Home+Return恢复B sidebar left、九导航可见。[journal 331–337](../.qa-local/headed-20261011/ui-actions.jsonl#L331) | 当前B已恢复left，不继续记hidden；A未变，隐藏模式的已执行case仍保留。 |
| K03/K04 115铺法与持久化 | 实际范围End→100%、点击0°，截图与磁盘旋转0/偏移0；选择平铺后预览与宿主由单图变2×2tiles，再用键盘依次完整显示→铺满→平铺，F5会话宿主仍tile。[journal 345–354](../.qa-local/headed-20261011/ui-actions.jsonl#L345)、[平铺截图](../.qa-local/headed-20261011/screenshots/native-bg-repeat-115.png)、[刷新截图](../.qa-local/headed-20261011/screenshots/native-bg-repeat-115-reload.png) | 此原生铺法/刷新case通过。B repeat/zoom1/rotate0/offsets0/opacity.44/blur6/sidebarleft存盘，A未变；AX残留90°/旧offset不覆盖实际截图/磁盘证据。背景仍API-only合成seed，没有真实上传；移除/完整重启及其它组合未验。 |
| G01 117确认丢弃 | 主代理实际可见IAB人设输入QA-HEAD-117-DISCARD后立刻重新读取；自定义确认窗保持超过700ms，跨tool磁盘读取仍QA小鲸鱼。确认后UI恢复QA小鲸鱼并提示配置已读取。 | 旧自动保存timer在确认期间误写的该case修复后通过；不是只凭117 headless绿灯关闭。 |
| G01 117取消与恢复 | 再填QA-HEAD-117-CANCEL→重新读取→取消；UI保留输入，之后跨tool读取磁盘已自动保存该名。最后实际UI恢复QA小鲸鱼并保存。 | 取消后自动保存恢复该case通过。延迟GET期间继续输入仅由代理headless回归覆盖，尚无有头证据；整G01仍部分通过。 |
| G04 本地渠道操作 | 可见IAB添加空Key QA-HEAD-PROVIDER-B，本地31402/v1、qa-chat/qa-vision；编辑为B-RENAMED并加qa-memory，卡片即时更新。设当前provider_mv4gy0us、选qa-memory时顶部同步，再恢复qa-local/qa-chat。 | 此阶段添加/编辑/设当前/模型同步局部通过；当时119已冻结但QA尚待重启复测，此前重复地址新增不算完整CRUD。后续指定upsert/append实操见本文最后补记，保留阶段先后。 |
| G06 YAML合并与拒绝 | 可见IAB默认merge新id qa-head-yaml/QA-HEAD-YAML/2models，再同id更名MERGED并加vision至3models。重复qa-head-duplicate明确拒绝，!!js/function报unknown tag，javascript: URL报需要http(s) BaseURL；各错误dialog保持后取消。 | 本地合并/同ID更新/三类拒绝通过。主代理只读核查当前qa-local/qa-chat且只有原+B+YAML MERGED三渠道，invalid未落盘；没有replace/delete/Key操作，整G06部分通过，不再仅记模型前提不足。 |
| S10 关闭/恢复自动跟随 | 可见IAB实际点击QA合成会话1（mv3pioqz-7cff5f2d），followfalse并筛group:10001；用fixture groupId10001/at true触发HEAD-FOLLOW-OFF，新卡片已回复300tokens，DOM与实际截图中详情仍旧ID、followfalse、群筛选保持。恢复follow并清筛选后触发HEAD-FOLLOW-ON，详情到mv4h54x6-76beb146且已回复/发送1；原生F5见19条及两新卡片。[journal 356–357](../.qa-local/headed-20261011/ui-actions.jsonl#L356)只佐证原生刷新后的列表。 | 已执行关闭跟随保持阅读、恢复跟随case通过。IAB详情读数归主代理Cua证据，不从journal卡片倒推；其它running/waiting及筛选组合仍未验。 |
| G21 单工具关闭/恢复 | 可见IAB将send_message checkbox设false并保存，配置override=false；fixture HEAD-TOOL-OFF产出mv4h92p1-fa4586f3（noreply/1call150tokens/sent0），实际展开excludedTools的id send_message/code tool-disabled/reason该工具已被单独关闭。主代理只读核对OneBot send_group_msg7→7、modelReq39→40。恢复true保存后TOOL-ON产出mv4ha5q9-af13201e（done/2calls300tokens/sent1）。 | 单工具开关、排除原因和真实本地registry/send动作一致case通过；未动跨聊天/权限/安全隐私，整G21部分通过，不能称真实QQ送达。 |
| C03/C07/C08/C12 公共入口 | 原生截图/AX已见114市场网页版、人设广场、意见收集三按钮。[journal 355](../.qa-local/headed-20261011/ui-actions.jsonl#L355)。118复制后主代理又实际截图见技能页“技能市场”按钮11292；公共官网新入口源码与headless已验证，原生观察尚待。 | 原人设/技能入口缺失已修且对应按钮实际载入；尚未点击外跳、无外网认证/发布/意见提交。C08缺输入/提交反馈流、C09金句、C10/C11验证码消费者及G28管理UI仍保留，不能用外部条件掩盖。 |

截至357与上述可见IAB操作的历史快照：[186项清单](headed-qa-checklist.md)为58项部分通过、6项失败、97项条件不足、24项待测、1项延期；当时官网原生观察和公共按钮dispatch尚待。后续实际点击如下，不沿用这个旧故障数。

## 下一批本地有头建议（未执行）

以下五项是可用现有隔离数据继续操作的建议，不计作通过；S10及G21建议已经由主代理实际执行，故从待执行建议移除。

| 优先项 | UI路径与现有前提 | 建议核对 |
| --- | --- | --- |
| S09 单会话删除与历史用量 | 会话搜索MCP会话mv4dzumv-8594f6e5→详情“删除”；该终态已有usage-days归档。 | 先取消确认，再最终确认，只删目标；刷新后用量all/会话历史仍保留归档贡献。 |
| H05 单条聊天删除 | 聊天→group:10001现有合成普通文本→勾选单条→删除。 | 先取消，再确认，只减少一条，媒体/私聊保留；不把此前取消当实际删除。 |
| N05 备注修改与删除 | 记忆→group:10001→手工成员20003→编辑备注；当前备注QA-HEAD-NOTE。 | 修改、重入；留空删除后再恢复QA-HEAD-NOTE，核对20001/20002备注不变。 |
| N04 印象编辑 | 记忆→group:10001→已有手工成员20003→编辑印象；已有可见印象可记录原文。 | 取消一次不改档，再实际保存编辑、重入确认，最后恢复原文；仅此成员变化，不能把已有草稿取消算编辑保存成功。 |
| A07/Z06 托盘退出 | 安排本轮末尾，从Windows托盘执行退出；当前MCP已运行且保存配置可重启。 | 退出主进程/MCP/锁，再重启确认配置和工具；与已完成的标题栏关闭分别记录，不影响真实QQ进程。 |

## 正常重启与五公共入口本地dispatch

读取journal358–369（截至2026-10-12 07:57:11，Asia/Shanghai），以及[桌面适配器记录](../.qa-local/headed-20261011/desktop-adapter.jsonl#L38)第38–42条。以下点击由主代理在原生Electron窗口执行，整理者没有驱动窗口或修改QA状态。

| 对应清单 | 实际操作与证据 | 判定及边界 |
| --- | --- | --- |
| A07/Z01/Z06 正常重启 | 119 routes复制QA后实际正常关窗，主代理核对旧PID76288已不存在、lock=false，再启动新窗口8852262；实际21会话/SSE绿。[journal 359–361](../.qa-local/headed-20261011/ui-actions.jsonl#L359) | 此阶段正常退出/重启case通过；当时119合同尚待，不能从启动推断。合同后续IAB实操见最后补记；托盘/全部flush/外置QQ仍未完整验。 |
| K04 背景重启保持 | 新原生窗口仍显示自定义B repeat背景。[journal 360](../.qa-local/headed-20261011/ui-actions.jsonl#L360) | 指定B铺法完整重启保持case通过；背景为API-only合成seed，未追加真实upload证据。 |
| C03/C07/C08/C12 五入口 | 依次实际点击技能市场、官网、插件市场、人设广场、意见收集，五次UI均显示请求成功；适配器逐条写入精确URL/externalOpened:false。[journal 364–369](../.qa-local/headed-20261011/ui-actions.jsonl#L364) | 本地原生按钮→受限RPC→生产窗口外链处理→QA桌面适配器调用链通过；未真实打开外部浏览器、访问外站或提交。C12旧入口缺失关闭，整行部分通过。C08输入modal/提交反馈流仍缺，不以dispatch状态成功关闭。 |

| 原生点击 | 桌面适配器精确记录URL | 是否真实打开外站 |
| --- | --- | --- |
| 技能市场 | `https://www.kondius.cn/qq-agent/skill-market/` | false，[记录38](../.qa-local/headed-20261011/desktop-adapter.jsonl#L38) |
| 打开官网 | `https://kondius.cn/qq-agent` | false，[记录39](../.qa-local/headed-20261011/desktop-adapter.jsonl#L39) |
| 插件市场 | `https://www.kondius.cn/qq-agent/plugin-market/` | false，[记录40](../.qa-local/headed-20261011/desktop-adapter.jsonl#L40) |
| 人设广场 | `https://www.kondius.cn/qq-agent/persona-plaza/` | false，[记录41](../.qa-local/headed-20261011/desktop-adapter.jsonl#L41) |
| 意见收集 | `https://kondius.cn/qq-agent/comments` | false，[记录42](../.qa-local/headed-20261011/desktop-adapter.jsonl#L42) |

本批仅QA包装器新增`import shell`并在生产main加载前将`shell.openExternal`替换为本地记录返回，保留`externalOpened:false`；[生成代码](../scripts/headed-qa-fixture.mjs#L102)，生产Electron入口没有因此改动。首次原生技能按钮动作被自动审批审查拒绝，原因是拦截证据不足，动作没有执行；主代理只读核对实际包装器、生产`setWindowOpenHandler`与运行PID74484命令行后，同一原生动作获准并实际完成。这是查证后的批准，不是绕过拒绝，当前无审批阻塞。

截至369的历史快照：[186项清单](headed-qa-checklist.md)为59项部分通过、5项失败、97项条件不足、24项待测、1项延期。该文档同步批次没有运行测试；后续122隔离修复与人设实操如下，不能将两阶段来源混同。

## 分会话人设实操与122隔离修复

本段有头结果来自主代理新实际操作报告，122回归来自本代理的独立临时kernel+headless Chrome；整理者没有操作正在运行的QA窗口、数据或配置。没有用直接API清除主代理当前人设map。

| 对应清单 | 实际证据 | 当前判定与边界 |
| --- | --- | --- |
| G11 模板保存/应用 | 主代理实际自定义template save/apply成功。 | 本地指定case通过，整行部分通过；出厂全文/规则、删除/取消及其它模板组合未验。 |
| G10 覆盖与分会话 | 主代理实际system override的botName/role/high→活跃预览正确；UI关闭unified、设personaByChat[10001]角色/low/customRules/systemPromptOverride，真实本地fixture会话mv4hl7ng-ea74ec50实际prompt为QA小鲸鱼&#124;PERCHAT&#124;安静，分会话botName坏值未覆盖全局账号身份。 | 覆盖占位及实际会话分层语义case通过；LLM/OneBot为本地合成对端，不代表商业模型或真实QQ。 |
| G10 JSON清空故障 | 主代理UI恢复personaByChat{}、全局普通人设并保存，但只读disk仍有10001旧键，暂恢复unified=true。 | 真实故障已确认；122在独立临时界面复现同根因：map删除与嵌套旧字段仍被深merge保留。 |
| 122修复回归 | 本代理仅改settings panel.js：完整JSON对象编辑发送现有__replace__协议，六map删key/清{}均通过；非法类型/保留键/空白不提交，数组仍整体替换，新输入在旧响应期间保留，后端普通补丁仍深merge。关联68/83/90/117通过，[回归详情](headed-qa-regression-evidence.md)。 | 此阶段源冻结/headless通过、当时QA同步和清{}尚待；后续IAB已实际复验见最后补记。后端/FormState没改，本代理未直接清QA map。 |

122冻结时历史快照为60部分通过、5失败、97条件不足、23待测、1延期；G10清空子case待实际复验。随后根代理确认120/123独立通过并授权收录，下批更新当前范围，不写成一次全量命令。

## 120金句预览与819条聊天档案

本批按主代理原生操作报告与journal370–388（至2026-10-12 08:13:00，Asia/Shanghai）同步；389–390已记后续恢复/准备后端重启，不从准备动作推断120后端已重启或已公开发布。主代理在本批暂停期间使用本地OneBot合成对端，整理者没有操作QA状态。

| 对应清单 | 实际操作/证据 | 判定与余项 |
| --- | --- | --- |
| H02/H07 800条合成seed与标读 | group:10002暂停期间emit800，模型请求44→44、发送10→10；档案共819/未读800，原生看到首屏500/819，再标读0/819、档案保留。[seed证据](../.qa-local/headed-20261011/fixtures/history-seed-evidence.json)、[journal372–375](../.qa-local/headed-20261011/ui-actions.jsonl#L372) | 此阶段入站/首500/大批标读case通过，121当时未冻结/未复制、自动滚动尚待。后续原生拖动/EOF与自动精确行数的不同来源见最后补记，不将后续结果追记到本阶段。 |
| C09 文字金句预览/取消 | 原生进入quote mode、选1条人类消息、预览dialog，Escape取消，再退出模式，选择重置0且普通删除控件恢复。[journal376–381](../.qa-local/headed-20261011/ui-actions.jsonl#L376)、[文字预览截图](../.qa-local/headed-20261011/screenshots/native-quote-preview-120.png) | 旧入口/选择/预览/取消链路缺失关闭，整C09部分通过；没有确认公开发布。 |
| C09 图片预览与发布限制 | 再选message13合成图片，dialog图真实可见，滚动后见“含图片不能发布”的说明及disabled确认公开发布；点击取消。[journal384–388](../.qa-local/headed-20261011/ui-actions.jsonl#L384)、[图片截图](../.qa-local/headed-20261011/screenshots/native-quote-image-120.png)、[限制截图](../.qa-local/headed-20261011/screenshots/native-quote-image-blocked-120.png) | 已执行预览/限制/取消case通过；**含图发布仍未实现**，不能将明确限制写成完整F221通过。 |
| C10/C11 验证码范围 | 120源码新增金句宿主public-captcha消费及受控SDK headless回归；本批原生没有进入验证码或提交文字POST，QA只加载120 UI、当时backend尚未重启。 | 真实阿里/认证/诊断边界未验。只读source中登录/注册仍直接请求，captchaNetProbe/interceptorStatus仍无UI消费；撤销“整个UI无captcha”泛论，保留C10登录范围与C11诊断缺项。 |

截至388阶段为62项部分通过、4项失败、97项条件不足、22项待测、1项延期；当时runner90唯一、121未冻。以下补记更新冻结/实操范围，不沿用为当前“未修/未复测”状态。

## 121最终冻结、原生历史追加与119/122可见复验

本批读取journal391–402（截至2026-10-12 08:22:06，Asia/Shanghai），结合主代理原生操作与截图观察；119/122及人设的实际可见IAB结果来自主代理Cua报告、UI操作和只读disk核查，不伪造journal条目。整理者仅文档/runner、语法/清单检查，没有启动测试或操作QA窗口/配置/进程。

| 对应清单 | 实际操作/观察 | 当前判定与范围 |
| --- | --- | --- |
| Z01/H02 重启档案 | 实际原生重启至PID75188/window15994232，819档案完整保留，模型44/发送10未新增。[journal391–394](../.qa-local/headed-20261011/ui-actions.jsonl#L391)、[默认latest截图](../.qa-local/headed-20261011/screenshots/native-history-121-latest.png) | 此合成聊天重启保留case通过；不扩大为全部迁移/配置/金额类别。 |
| H02 原生自动追加 | 首批默认在latest0796..0800；拖内层thumb879→447自动加载历史，截图首0301仍y476。再拖576→447到EOF，追加入口隐藏；第三拖可见旧合成历史1。[journal395–397](../.qa-local/headed-20261011/ui-actions.jsonl#L395)、[追加截图](../.qa-local/headed-20261011/screenshots/native-history-121-auto200.png) | **拖动、自动追加、旧历史可达是实际原生观察**。500/200与最后119为当次UI/fixture页义及合成总数，不是逐行native DOM统计；精准DOM计数仍待IAB复验。 |
| H02 EOF绝对位置修复 | EOF隐藏按钮曾使首0101文本屏幕y438；最终修复history.js同步后重新F5/拖动，首0101保持y476。[journal398–402](../.qa-local/headed-20261011/ui-actions.jsonl#L398)、[修复前](../.qa-local/headed-20261011/screenshots/native-history-121-eof-before.png)、[修复后](../.qa-local/headed-20261011/screenshots/native-history-121-eof-after.png) | 指定原生绝对位置case修复后通过。独立test121精确805+2档案/500+200+105、顺序/去重与≤1px anchor断言由负责代理执行，不能把其数字改成native819的DOM统计。 |
| G10 122实际清map | 可见IAB明确填personaByChat{}并保存，主代理disk核查真实为空、无__replace__泄漏；unifiedtrue、原全局人设、provider qa-local/model qa-chat已恢复。 | 旧人设JSON清空故障该IAB case修复后通过。其余五对象map/非法输入/保存竞态仍仅122自动回归，整G10保持部分通过。 |
| G04 119实际upsert/append | 可见IAB以同endpoint/v1添加手工model，复用qa-local ID、渠道总数3、Key仍显示configured；pull后手工model保留且模型数5，再显式edit恢复4和原名。 | 指定规范化upsert/拉模型append/显式编辑case修复后通过；没有删除渠道、显示/清除Key或真实商业模型，不称完整CRUD。 |
| G10/G11 模板及分会话恢复 | 实际模板A保存多行角色/apply，全局占位high→活跃预览；分会话session mv4hl7ng-ea74ec50为全局名字+perrole/安静并附加perrule，分群botName不改身份；随后实际UI还原全局并清分群JSON。 | 指定模板/覆盖/分层/还原case通过；出厂全文、删除/取消与其它组合未完整验收。 |

121最终冻结及EOF修复已复制QA；根代理确认121/120/83/53/80全部独立通过，80严格id2 SSE删除断言没有修改。本批将121加入runner，**91文件/91唯一/缺失0、121一次**，runner/121语法检查通过；未运行一次全91项套件。

截至402的历史快照为**62项部分通过、4项失败、97项条件不足、22项待测、1项延期**。该阶段G28/C08/C10/C11有头故障未关闭；下批124反馈实操更新C08，不能将这一历史快照当作当前计数。

## 原生反馈、第二实例、历史精确计数与会话跟随补记

本批读取journal403–424（截至2026-10-12 08:50:00，Asia/Shanghai），并纳入根代理实际可见IAB操作与只读进程/锁核查报告。整理者没有驱动窗口、访问真实用户数据或改变QA状态。以下IAB精确DOM数字来自根代理已执行的有头操作报告，不伪造为原生journal逐行计数。

| 对应清单 | 实际操作/证据 | 判定与剩余条件 |
| --- | --- | --- |
| H02 可见IAB精确历史分页 | 根代理在可见IAB实际点击加载更早：500条/首local id320→700条/首id120→819条/首id1；最终unique819、末id819、EOF没有按钮。原生两次scroll到EOF后旧0101文本屏幕y476前后保持，已有[journal401–402](../.qa-local/headed-20261011/ui-actions.jsonl#L401)与[EOF截图](../.qa-local/headed-20261011/screenshots/native-history-121-eof-after.png)。 | 指定有头分页/无重复/EOF与原生绝对位置case通过；IAB与原生来源分开。独立121的805+2/500+200+105仍属headless，完整逐条时间顺序及其它边界未逐项有头核对，整H02保留部分通过。 |
| H02 旧前缀撤回刷新 | 合成WS实际撤回local120/mid7129，原生当前历史UI显示已撤回；可见IAB仍819unique。[journal403–405](../.qa-local/headed-20261011/ui-actions.jsonl#L403)。 | 指定旧段即时刷新case通过；对端为本地OneBot替身，不能据此宣称QQ平台送达/撤回兼容。 |
| A09 同profile第二实例 | 主代理实际启动第二Electron PID80852，其exit0、boot-diag新增single-instance-denied；主PID75188/window15994232、锁、SSE、合成OneBot连接保持。[journal406](../.qa-local/headed-20261011/ui-actions.jsonl#L406)。 | 指定原生同profile拒绝case通过，整A09部分通过；不同PROFILE有头同时运行与真实账号隔离尚未验。正常Electron实例锁静默退出，不把没有错误框当作失败。 |
| C08 原生意见收集 | 实际打开124反馈modal，空昵称/正文校验阻止预览；输入QA-HEAD-124及多行含`<script>alert(124)</script>`的合成正文，预览按文字展示并明确“尚未投稿”；返回编辑保留完整草稿，取消回社区。[journal411–419](../.qa-local/headed-20261011/ui-actions.jsonl#L411)、[预览截图](../.qa-local/headed-20261011/screenshots/native-feedback-preview-124.png)。 | 旧输入/预览操作流缺失该原生case关闭，C08更新部分通过。没有提交、验证码或外网；真实图片选择、作者收到反馈、成功/失败重试仍待验。 |
| S10 123首次进入与跟随 | 从community首次进入会话即选当前running mv4jadaf-cf189b8b；实际点旧mv4hl7ng-ea74ec50后followfalse/旧详情；恢复followtrue回当前running，自然finish为noreply/150tokens/sent0仍同详情。model44→45、send仍10。[journal421–424](../.qa-local/headed-20261011/ui-actions.jsonl#L421)、[原生截图](../.qa-local/headed-20261011/screenshots/native-session-bootstrap-123.png)。 | 指定首次进入、手动旧详情与恢复/终态保持case通过；模型/OneBot是本地合成对端，其它waiting/filter组合和真实外部条件仍未完整验。 |
| A04/A09 126隔离端口/锁回归 | extensions_review独立真实kernel/Node CLI六场景通过，验证env优先但不写storedport、0/非法值、reload不移动socket、九占用至base+9、十全占用拒绝/锁释放、两PROFILE HTTP身份与历史隔离、同DATA拒绝；runtime_review在其它关联测试结束后再次独立顺序6/6通过。[126有效日志](../.qa-local/console-token-125-126-sequential.log)。 | 是实际隔离API/CLI测试，不是根代理有头端口/不同PROFILE实测。A04保留待测，A09只因上一行原生同profile证据提升至部分通过。 |

125已冻结并复制QA，真实临时kernel/headless Chrome/受控Electron IPC回归及关联测试通过；根代理正在安排源GUI重启，尚未报告原生令牌管理操作。不用自动回归关闭G28旧有头失败。124/125/126已收录M3，清单**94文件/94唯一/缺失0，各一次**；127尚未冻结，不收录。新增独立回归与此前70项分批有效通过分开，未执行单次全94套件。126两次与其它测试并行时的临时端口失败及最终顺序通过均保留在[自动记录](headed-qa-regression-evidence.md)。

截至424的历史快照为**64项部分通过、3项失败、97项条件不足、21项待测、1项打包延期**。当时G28尚待有头复测；以下433补记更新其只读入口状态，不能将这一历史快照当作当前失败数。

## 125原生令牌窗只读与刷新复测

本批按journal425–433（截至2026-10-12 08:54:08，Asia/Shanghai）及根代理可见IAB报告更新。根代理正常重启至PID81816/native window50662932，123合成会话已自然结束；model45、send10，fixture已恢复normal/toolCallnull。整理者没有操作窗口、写入凭据或改变QA状态。

| 对应清单 | 已实际执行 | 判定与边界 |
| --- | --- | --- |
| G28/A12 原生host令牌窗 | 实际设置筛“桌面”进入令牌host modal，当前值masked、新输入空，显示/复制/保存控件可见；只读关闭回设置，实际F5九导航/SSE绿/23会话。[journal430–433](../.qa-local/headed-20261011/ui-actions.jsonl#L430)、[原生截图](../.qa-local/headed-20261011/screenshots/native-token-dialog-125.png)。 | 旧管理入口缺失该原生case关闭，G28更新部分通过；没有点击show/copy或写入/轮换令牌，不把控件存在计为那些操作已完成。 |
| G28/A12 可见IAB host能力 | 超30min TTL的旧bootstrap reload先401；重新own授权URLbootstrap后可用，实际可打开只读host modal；关闭后freshreload恢复九导航。 | 宿主能力也支持普通浏览器，不称desktop-only。旧缓存TTL到期401是预期失效，不记为125产品故障或已完成轮换；来自根代理可见IAB实操报告，与原生journal分开。 |

截至433的历史快照为**65项部分通过、2项失败、97项条件不足、21项待测、1项打包延期**，该时点没有整行“通过”。127正在实施、未冻结；以下启动补记继续更新当前状态。

## 后台多配置与关窗留托盘实操

根代理实际操作可见IAB及原生Electron，并读取自有进程/锁/配置。所有目录均在本项目`.qa-local/`；没有改真实用户注册表、账号或档案。

| 对应清单 | 实际执行与观察 | 判定与范围 |
| --- | --- | --- |
| A03/A04/A09 后台双配置 | 辅助PID70440只启动生产CLI、不操作浏览器；profile100/PID80400为env0、监听15125、存盘仍29606；profile101/PID79428为env29607、监听29607、存盘仍0。根可见IAB tabs2/3分别只见group_126100/QA-P100-READ-SEED、group_126101/QA-P101-READ-SEED，各1条已读，九导航/SSE绿；两头实际reload均正常。100暂停时101仍自动响应启用，再恢复100。[100截图](../.qa-local/startup-headed-126-20261012010125874-9f9807f1/profile100-headed.png)、[101截图](../.qa-local/startup-headed-126-20261012010125874-9f9807f1/profile101-headed.png)。 | A03本地启动/可见控制台case通过；A04环境端口与持久配置局部通过，A09不同PROFILE的可见聊天/运行状态隔离局部通过。真实账号、原生双窗口及占用/错误框余项保留，bundled服务全停用，不伪称真实OneBot连接。 |
| A03 正常退出 | 本地辅助POST shutdown经IPC触发生产SIGINT，两CLI exit0、各自锁删除、15125/29607端口关闭；UI随后都显示SSE重连失败，根关闭自建临时tabs。[descriptor](../.qa-local/startup-headed-126-20261012010125874-9f9807f1/descriptor.json)、[supervisor](../.qa-local/startup-headed-126-20261012010125874-9f9807f1/supervisor.jsonl)。 | 对应本行正常后台退出通过，A03整行本地通过。辅助preload阻断非loopback出站；配置/业务合成，不对应安装包或真实账号验收。 |
| A07 留托盘/恢复 | 实际IAB开启closeToTray，原生关闭后窗口消失，PID81816/锁继续存在；第二同副本启动PID80876 exit0，恢复同window50662932，SSEgreen/23会话。原生搜索QA-HEAD-123-PENDING匹配1，再清空回23。[恢复输入截图](../.qa-local/headed-20261011/screenshots/native-tray-restore-input.png)。 | 开关、关闭保留进程、同实例恢复后输入case通过；恢复是第二实例事件，不冒充托盘图标点击。closeToTray已UI还原false，托盘菜单/弹窗余项保留。 |
| A08 自启设置故障 | 实际IAB开启后UI与QA config为true，desktop-adapter仍最新启动false/calls11，无新登录项apply；源码仅启动/托盘回调消费autoStart。实际UI恢复false，真实OS登录项由QA记录适配器隔离。 | 记录新明确失败。128已安排修复，未有头复测前不能关闭；源码版启动入口/多profile注册命令亦在核对。 |

本阶段186行历史快照：**1通过、66部分通过、3失败、97条件不足、18待测、1打包延期**。当时127/128/129仍在修复与独立回归，M3为94唯一；以下127实操和冻结补记更新当前范围，不把当时未复测项目提前关闭。

## 127原生诊断只读与最后冻结范围

根代理实际同步127、原生F5再进入社区；本批journal439–444截至2026-10-12 09:12:39（Asia/Shanghai）。整理者只维护文档/runner，没有操作窗口、测试副本或执行外部投稿。

| 对应清单 | 已实际执行 | 判定与边界 |
| --- | --- | --- |
| C11 诊断消费者 | 原生口令输入QA-HEAD-127-DRAFT，打开验证码诊断宿主modal；IPC实际读回“桌面转发已安装·已转发0次，安装状态不代表验证码已就绪”。4目标的主进程/浏览器均尚未检测，网络与关闭按钮可见、无溢出。[journal439–442](../.qa-local/headed-20261011/ui-actions.jsonl#L439)、[原生截图](../.qa-local/headed-20261011/screenshots/native-captcha-diagnostics-127.png)。 | 旧源码诊断UI消费者缺失case实际复验关闭，C11部分通过；没有按检测网络，不能声称真实HTTP/反代/离线/代理与重试已过。 |
| C11 输入保留与还原 | 原生Escape关闭modal回社区，code完整保留，随后实际UI清空还原。[journal443–444](../.qa-local/headed-20261011/ui-actions.jsonl#L443)。 | 原生取消和保稿通过；没有验证码、登录、投稿或安装。合成127回归中的proof/RPC/错误边界另列自动记录，不混同原生操作。 |
| C10 官方合同边界 | [SPEC F222](../../dsh-spec/SPEC.md#L511)包含社区登录验证码；[notes11 §2.4及认证表](../../dsh-spec/notes/11-external.md#L299)与只读[官方客户端](https://www.kondius.cn/qq-agent/skill-market/)将验证码放在公开写入/上传，login/register不传proof。120/124/127消费真实固定SDK与投稿字段。 | 本轮没有臆造认证proof合同或执行真实阿里；C10仍留失败，原因改为规格登录范围与认证合同尚未闭合，不继续误称所有UI无验证码消费者。 |

127已冻结，新增`test/127-market-captcha-diagnostics-test.mjs`独立通过；64/80最小更新为专用市场RPC与受控SDK/proof，保留SPEC80CODE及实际云publish断言，80完整通过。125/124/120/114/118/95/38/52/61UI/62design/64/67/85/m4-electron-shell关联通过。所有公开投稿和验证码为本地替身，不是真实外网成功。

128已最终冻结，仅生产`electron/main.js`及其回归，根代理确认`test/128-electron-autostart-config-test.mjs`通过并授权收录；A08真实UI开/关自启和关窗收口仍待根代理报告，因此保留失败。129正在修复SDK边界，暂不收录。M3现**96文件/96唯一**，本批未运行完整runner。

该阶段186行历史快照：**1通过、67部分通过、2失败、97条件不足、18待测、1打包延期**，剩余失败当时为A08与C10；随后128原生设置同步实操如下。

## 128原生自启设置同步复测

根代理实际同步`electron/main.js`并正常重启至PID77760/window19927262；journal445–452记录正常重启、定位设置桌面分区及自启开/关。OS登录项始终由QA记录适配器隔离，未修改真实用户注册表。

| 对应清单 | 已实际执行 | 判定与边界 |
| --- | --- | --- |
| A08 开启与关闭自启 | 原生开启autoStart，UI提示保存、QA config=true，desktop-adapter调用12→13/latest openAtLogin=true；再次关闭，UI/config=false、调用13→14/latest=false，closeToTray仍false。[journal450–452](../.qa-local/headed-20261011/ui-actions.jsonl#L450)、[开启截图](../.qa-local/headed-20261011/screenshots/native-autostart-on-128.png)、[关闭截图](../.qa-local/headed-20261011/screenshots/native-autostart-off-128.png)。 | 旧设置保存不消费到Electron的明确故障实际复验关闭，A08更新部分通过。记录的是生产桌面调用链到QA适配器，不是实际Windows注册表或开机登录。 |
| A08 参数/profile | 记录中的path为本地Electron，args为QA APP_ROOT、--qq-agent-profile=99、--qq-agent-data-dir=QAdata，name为cn.kondius.qq-agent.profile-99。[适配器记录](../.qa-local/headed-20261011/desktop-adapter.jsonl)。 | 实际本测试档案参数正确；其它PROFILE/打包/带空格启动及保存失败、托盘失败、OS失败边界仍只128独立回归，未真实开机或安装。 |

128已最终冻结并收录，当时129仍进行中不收录。M3为96文件/96唯一，未运行完整runner。该阶段186行历史快照：**1通过、68部分通过、1失败、97条件不足、18待测、1打包延期**；随后原生撤回/引用实操发现如下两项明确故障。

## 130撤回引用与实际模型上下文故障

根代理在原生窗口全局暂停，合成OneBot入站seed mid7831/local820与引用reply mid7832/local821。seed含唯一标记QA-HEAD-RECALL-129-SEED和`<script>alert(129)</script>`文字，真实QQ/模型仍未参与。journal453–460截至2026-10-12 09:21:44（Asia/Shanghai）；130交runtime修复，目前未冻结，不能先关闭失败。

| 对应清单 | 实际执行与观察 | 判定与范围 |
| --- | --- | --- |
| H08 撤回引用 | 原生滚动见reply引用QA小周和原文；撤回seed后，source行已显示撤回，但reply继续显示原文，没有降级。[撤回前](../.qa-local/headed-20261011/screenshots/native-reference-before-recall.png)、[撤回后故障](../.qa-local/headed-20261011/screenshots/native-reference-after-recall-bug.png)、[journal456–459](../.qa-local/headed-20261011/ui-actions.jsonl#L456)。 | 指定本地原生case失败，不能继续写“条件不足/没有操作”。130修复与实际复验前保留；真实QQ/缺失引用其它边界未验。 |
| H09 撤回上下文 | 恢复运行后受控模型请求45→46、HTTP200，实际请求context中seed直接文本和reply引用原文都保留，recalledSeedStillInActualModelContext=true。[实际请求](../.qa-local/headed-20261011/recall-context-before-repair.json)、[journal460](../.qa-local/headed-20261011/ui-actions.jsonl#L460)。 | 指定本地实际模型调用链失败；对端为fixture而非真实商业模型，不掩盖已证实缺陷。档案821，sends仍10，无新增发送；toolCall已还原null。 |
| H12 安全文字 | 上述>500合成档案中原生滚动观察seed/reply，script标记以文字呈现，没有执行或弹窗。 | 该原生文本安全case通过，整行部分通过。含媒体、图片错误、刷新及真实Q组合未完整验收；不能用安全渲染抵消H08/H09故障。 |

129/130仍进行中，未收录，统一套件待其冻结后由根执行。M3保持96文件/96唯一。当前186行：**1通过、69部分通过、3失败、94条件不足、18待测、1打包延期**；失败为C10合同范围、H08引用撤回、H09撤回上下文。

## C09含图金句的官方合同边界

runtime代理只读GET[官方金句页](https://kondius.cn/qq-agent/holyshits/)于2026-10-12 01:21:45.548 UTC获得HTTP200/725行，根代理转交证据。页面336–337将相对图片地址接到`/qq-agent/holyshits/`，476–477用`media[].url`展示图片；但670–684构建投稿时每条消息固定`media:[]`，698–704只以JSON `{nickname,messages,captchaVerifyParam}` POST `/qq-agent/api/holyshits`。257的`input[type=file]`仅样式，未发现文件控件、FileReader、FormData、dataURL或图片上传地址合同，所引theme/nav脚本也没有上传流程。

因此当前金句含图预览/取消已实际验证，**含图公开发布仍未实现**。SPEC F221及notes10要求含图，但没有给出图片写入schema；不会借意见收集的`images:dataURL`编造金句接口或静默丢图。120文字投稿的受控HTTP200只证明本地合同调用，未真实公开发布、阿里验证或图像写入。C09继续部分通过并保留该明确源功能缺口，需要可信图片写入合同才能继续收口。

## N02新增聊天/空印象与刷新持久化（重启前）

根代理本批原生记忆页新增聊天，空key被原生必填拒绝、group:abc被格式校验拒绝；group:10003合法进入空详情，尚无成员所以不物化新file，这是当前设计。随后新增20004/name QA-HEAD-EMPTY-MEMBER留空印象保存，显示5档、1成员0印象；再次编辑改名QA-HEAD-PERSIST-MEMBER、备注QA-HEAD-PERSIST-NOTE、两行QA-HEAD-PERSIST-A/B（后一行含literal `<script>alert(130)</script>`），保存后1成员2印象按文本显示。实际点击刷新仍完整保留。[journal461–478](../.qa-local/headed-20261011/ui-actions.jsonl#L461)、[刷新后截图](../.qa-local/headed-20261011/screenshots/native-memory-persist-before.png)。

根代理另只读核对QA memory/group_10003/20004.json的name与两条content一致，global memberNotes20004为该备注。没有删除任何旧印象/成员。本批新增/输入校验/空印象/手工编辑/实际刷新case通过，N02仍部分通过，应用重启后原生读取尚待129/130同步重启时复验。未从磁盘存在推断重启后的UI结果；当前186行计数不变。

## 129/130正式冻结与待实际复验

根代理确认129正式冻结，生产范围为kernel/sdk-services/service-host三文件，`test/129-sdk-consumer-callback-boundaries-test.mjs`独立10/10及关联回归通过；130正式冻结，生产范围为store/ingest/prompt/orchestrator/query-tools/routes六文件，`test/130-recall-context-test.mjs`独立7/7及120/121等关联通过。本批仅收录/语法与清单核对，没有运行完整套件或操作QA进程/数据。

129覆盖私有默认服务的调用者权限、窄callback DTO与密钥隔离、生命周期不可借用、显式取消/撤权/卸载传播、嵌套SDK调用和宿主自有生命周期；130覆盖撤回后的显示/实际HTTP提示过滤、遗留/缺失/重复协议引用与重启、全撤回批次不调用模型、工具轮撤回中止与重新排独立未读、无关历史撤回不取消、self归档裁剪后发送计数和已裁剪源撤回的在途取消。这些是临时内核/本地对端/headless结果，H08/H09尚待根修后原生引用及实际请求复验，不从独立7/7自动关闭。

M3现**98文件/98唯一**，129/130各一次且路径存在；尚未运行完整98项套件。N02原生重启重读、A04实际十端口占用、SDK私有服务权限/取消的根实际验证仍待最后证据。当前186行仍**1通过、69部分通过、3失败、94条件不足、18待测、1延期**。

## 130原生撤回复验与N02重启读取

根代理正常退出PID77760、锁清后同步129三文件/130六文件，启动PID78000/window37422544；journal479–492截至2026-10-12 10:03:23（Asia/Shanghai）。以下是修后实际原生与本地模型请求证据，不从独立测试7/7推断。

| 对应清单 | 实际执行与观察 | 判定与范围 |
| --- | --- | --- |
| H08 引用降级 | 新seed7834/reply7835撤回7834，原生引用从原作者/原文变为“引用消息已撤回”，旧7832为“旧引用来源无法核实”，source原文在档案中保留。[修前](../.qa-local/headed-20261011/native-reference-130-before.png)、[修后](../.qa-local/headed-20261011/native-reference-130-after.png)、[journal488–490](../.qa-local/headed-20261011/ui-actions.jsonl#L488)。 | 旧本地原生故障指定case关闭，整H08部分通过；真实QQ与其它引用组合未完整验收。 |
| H09 实际模型上下文 | resume后model46→47/唯一新request200，recalledSeedInActualContext=false、replyTriggerInActualContext=true、contextRecallPlaceholder=true；sends10→10，paused恢复false/running[]。[修后实际请求](../.qa-local/headed-20261011/recall-context-after-repair.json)、[journal491–492](../.qa-local/headed-20261011/ui-actions.jsonl#L491)。 | 旧本地实际请求泄入撤回原文指定case关闭，整H09部分通过；受控模型/合成OneBot不代替真实商业模型/QQ和在途工具轮全部组合。修前错误请求仍保留，不删历史失败。 |
| N02 重启读取 | 原生重启后记忆页打开group:10003/member20004，QA-HEAD-PERSIST-MEMBER、QA-HEAD-PERSIST-NOTE及两条印象均完整存留。[journal482–483](../.qa-local/headed-20261011/ui-actions.jsonl#L482)、[实际重读](../.qa-local/headed-20261011/native-memory-persist-after.png)。 | 根确认N02对应本地条件全部完成，升本地通过；新增/校验/空印象/编辑/刷新/磁盘/实际重启UI证据闭合。没有删除旧资料，不扩大为全部记忆整理或真实QQ通过。 |

此时186行是**2通过、70部分通过、1失败、94条件不足、18待测、1延期**；仅C10合同范围仍失败。A04/A10端口耗尽的初次真实故障报告及131修复另记，不能因这一轮正常重启称启动错误/端口上限完美。完整98套件尚未运行。

## 131启动错误重复报告修复与可见IAB筛选

| 对应清单 | 实际执行/来源 | 判定与边界 |
| --- | --- | --- |
| A04/A10 初次十端口耗尽 | 根实际持有16023–16032，Electron可见EADDRINUSE最后16032；根报告两个相同错误框，PID70904最终exitCode1/no lock；holder77724正常shutdown/portsClosed=true。[首个原生快照](../.qa-local/startup-error-owned-YDX1oF/error-native.json)、[截图](../.qa-local/startup-error-owned-YDX1oF/error-native.png)、[实际退出](../.qa-local/startup-error-owned-YDX1oF/observed-electron-exit.json)、[descriptor](../.qa-local/startup-error-owned-YDX1oF/descriptor.json)。 | 拒绝启动/退出清理该case有真实证据，但重复弹窗是明确故障。A04保留partial，A10从待测改失败；图片只表示首个错误框，不伪称一张图同时记录两个。 |
| 131 独立冻结回归 | 仅electron/main.js/test131正式冻结。实际自动入口基线dialogs=2/startup records=2，修后13/13涵盖单次报告/cleanup/原错误保留、preflight/ready/import/factory/window失败、真实kernel十端口锁释放；128/97/101/125关联green。[修前日志](../.qa-local/131-baseline-evidence/131-before-repair.log)、[13场景](../.qa-local/131-baseline-evidence/131-final.log)。 | 原生边界在该测试中为mock；根131修后实际错误框尚待，不用13green关闭A10，也不称未捕获异常/renderer崩溃全完成。 |
| S02/S05 可见IAB | 根实际浏览器选失败+private:20001得1条“合成2”，点mv3pior5-691dd980详情自动follow=false，展开原始JSON；复位两筛选回25条且同ID/JSON保留。 | 更新实际浏览器局部证据，S02/S05保持partial。没有原生这些操作/专门滚动/SSE观察，当前25条不足分页阈值，不称load-more或阅读位置所有组合通过。来源为根可见IAB操作报告，不虚构journal/截图路径。 |

131加入M3后为**99文件/99唯一**，仅做语法/存在性检查，未运行完整套件。当前186行**2通过、70部分通过、2失败、94条件不足、17待测、1延期**；失败为C10合同与A10重复启动报告（源码已修，待有头复验）。

## 131修后原生启动失败复验与完整套件启动

根在新的own fixture[7UDrCR](../.qa-local/startup-error-owned-7UDrCR/descriptor.json)实际占用61549–61558十端口，原生Error1837008的AX为“QQ Agent启动失败”/最后61558 EADDRINUSE。按Return一次后watched PID38356 exitCode1/no lock，boot-diag只有1条startup-failed；后续原生窗口列表无第二Error、仅主root37422544。holder supervisor78384由自有loopback控制正常shutdown，portsClosed=true并退出。[AX记录与截图限制](../.qa-local/startup-error-owned-7UDrCR/error-native-131.json)、[实际退出](../.qa-local/startup-error-owned-7UDrCR/observed-electron-exit.json)、[boot日志](../.qa-local/startup-error-owned-7UDrCR/data/boot-diag.log)。

此次截图工具返回底层root窗口，**没有完整Error像素证据**；只用AX、一次按键、退出/锁/日志和后续无第二Error证明指定启动故障修复。A10更新部分通过，未捕获异常/renderer崩溃未注入；A04补十端口耗尽的实际case，单端口/九占用fallback仍仅隔离测试，整行保持partial。初次双错误及其修前日志继续保留。

当前186行为**2通过、71部分通过、1失败、94条件不足、17待测、1延期**，失败仅C10合同范围未闭合。根已启动完整`run-all`回归，原始输出写入[final日志](../.qa-local/full-regression-20261012-final.log)，进程session19196；M3为99文件/99唯一，**结果仍待运行结束**，不提前写全绿。本代理自该启动起仅维护文档/静态记录，没有并行行为测试、QA/UI/进程操作。

## 实际可见IAB用量六维、单会话与工具区

根实际可见IAB打开2026-10-12日期明细，对聊天/模型/日期/小时/会话/渠道六个by逐项选择，并等待当前region载入；最终每个显示12runs/20calls/3000tokens/¥0.003240。[六维记录](../.qa-local/headed-20261011/browser-usage-six-dimensions.json)保存的是等待后的最终版本，不包括最初瞬态旧region。关闭后实际打开mv4lxvqd-7473a9db单会话详情，显示1run/1call/150tokens/¥0.000162/qa-chat，并关闭成功。[单会话详情](../.qa-local/headed-20261011/browser-usage-session-detail.txt)。

再点击“查看工具调用”，实际滚动到finish14/send_message13/hello_say1/MCPecho1并截图。[工具区](../.qa-local/headed-20261011/browser-usage-tools.png)。这些更新U01/U03/U04的可见浏览器局部证据，未冒充原生或商业模型计费；当前仅4模型，>20模型展开/收起未触发，日期range变更与各维度继续二次钻取链本次未执行，跨日逐工具求和仍未核对。三项保持partial，186计数不变。完整run-all仍运行中，等待最终exit/摘要。

## 本次完整run-all首批失败与后续只读IAB证据

根确认session19196完整run-all结束**exit1**：M3 **94/99**，M4 **10/10**。[原始日志](../.qa-local/full-regression-20261012-final.log)227455字节（本次读取快照），保留失败事实，不把后续单项修复提前记成同次全绿。

| 失败顶层文件 | 根核对的失败位置/待修范围 | 当前状态 |
| --- | --- | --- |
| run-m2.mjs | 内部57旧静态断言“不unbind新实例授权”；交extensions_review核对129后授权生命周期合同。 | 待证据修复/有效重跑，不跳过。 |
| 34-m3-browser-e2e.mjs | 旧静态shell清token函数断言，现bootstrap已移到console-auth模块；根将两旧位置断言改为actual createConsoleAuth URL行为+shell wiring。 | 后续真实browser定向28/28通过，[有效复验](../.qa-local/34-final-rerun.log)；原完整首批94/99不改写，另四项待复。 |
| 80-ui-spec-completion-test.mjs | reply夹具没有mid却期待原文，130现在按缺来源引用降级；交runtime核对合法引用fixture。 | 待保留真实引用/撤回断言的有效重跑。 |
| 94-headed-qa-runtime-evidence-test.mjs | stop后访问已失效ctx的KV；交extensions_review核对持久数据与停用ctx拒绝边界。 | 待保持持久化/失效边界的有效重跑。 |
| 126-port-profile-instance-test.mjs | 第二reserveRange在40attempt内找不到十个安全相邻ephemeral端口；交runtime核对保留十端口约束的夹具分配。 | 首次失败发生在准备阶段；不把它当跳过通过，待有效重跑。 |

以上五项当前记录实际失败与负责范围，不在证据修复完成前一律归为“全是环境”或“全是产品”。自动回归文件数不换算为有头清单通过数。

根另可见IAB设置搜索“桌面”仅1导航、clear后13导航与分区切换已执行。132未提交草稿尝试实际等过700ms自动保存，因此切换保留name、重新读取无确认属于已保存预期；未证实真正未提交保留/取消确认，QA名字已UI还原小鲸鱼。G02保持partial，该段132是操作标记，当时未新增测试或源码修复；后续同号正式迁移test132另记，不混为设置草稿修复。

插件能力区域29项/current自动/6服务运行，技能区内容一致；[插件文本](../.qa-local/headed-20261011/browser-plugin-capability-providers.txt)和[技能文本](../.qa-local/headed-20261011/browser-skill-capability-providers.txt)为实际可见IAB记录。E10/E11从待测补部分通过，只覆盖正常只读显示；未保存pin/制造未授权或启动失败/取消链，不能替代129安全自动回归。当前没有第三方授权fixture，E08仍待测；协作链说明文案不等于实际多owner消费，E12仍待测。

当前186行**2通过、73部分通过、1失败、94条件不足、15待测、1延期**；M3静态清单仍99唯一，完整首批94/99 exit1，后续有效复验结果待根确认。

## N06可见IAB群成员检索与34定向复验

根实际IAB group10001成员列表为3合成人员；搜索小周仅20002、20001仅小林、QA-NO-MATCH-132无article，clear回3；关闭再进入private:20002，无“成员列表”按钮、空成员正常。[检索记录](../.qa-local/headed-20261011/browser-memory-member-search.json)。没有记忆/备注mutation，当前群名片全空未测名片匹配；真实QQ未参与。N06补实际浏览器证据并保持partial，不冒充原生这组搜索或完整名片合同。

根对首批失败34的两条旧静态shell函数字符串断言，改为actual createConsoleAuth URL行为及shell wiring；既有实际浏览器业务断言保留，定向执行**28/28通过**。[34有效日志](../.qa-local/34-final-rerun.log)。这是完整首批失败后单项有效复验，首批run-all exit1/M3 94/99/M4 10/10仍保留；另四项核对/修复结果待根确认，不提前记一次完整99/99全绿。

## 首批失败的证据修复与第二次完整运行

根确认57/94迁移后的夹具在129前的baseline源码和当前源码都通过，日志保留新旧两侧。57将旧“不出现unbind”的静态判断改为实际旧/新授权生命周期行为；94不再在stop后调用已失效ctx读KV，持久数据与停止后拒绝边界仍验证。[57当前](../.qa-local/129-baseline-evidence/57-current-after-repair.log)、[57 baseline](../.qa-local/129-baseline-evidence/57-sticker-qq-library-test-baseline-after-fixture-migration.log)、[94当前](../.qa-local/129-baseline-evidence/94-current-after-repair.log)、[94 baseline](../.qa-local/129-baseline-evidence/94-headed-qa-runtime-evidence-test-baseline-after-fixture-migration.log)。这些是对应合同/夹具的有效证据，不抹去第一次实际失败。

80补实际source550和reply.mid，继续要求合法引用原文、所有消息ID/计数及其它业务断言，完整定向通过。[80有效复验](../.qa-local/80-quote-fixture-after130.log)。126改随机候选的真实11次bind预检，之后仍保留10个实际占用端口、九占用fallback/十占用拒绝与锁清、两profile等六场景，定向6场景通过。[126有效复验](../.qa-local/126-fixture-selection-after.log)。原始40attempt为何无法选取已不可回溯，**不能归咎低端口**；只确认旧门槛并非产品合同，新夹具没有降低十端口的真实约束。

根第二次完整run-all/session67908已结束**exit1**，输出另存[full-regression-20261012-rerun.log](../.qa-local/full-regression-20261012-rerun.log)：M3 **98/99**，M4 **10/10**，第一批[exit1日志](../.qa-local/full-regression-20261012-final.log)未覆盖。首批五个失败文件已在这次完整批通过；唯一失败为95-shell-runtime-controls-test.mjs第86行，等待状态轮询10秒未观察到请求（日志1872–1930）。第一批95通过，本次差异正在核对，尚无有效修复/复验结论，不能仅增超时或提前称全绿。两次整体失败与单项有效复验均保留，不声称第一次所有失败同属环境原因。运行期间本代理仅docs/静态，无并行行为测试。

## 渠道编辑dialog取消草稿的可见IAB复验

根在QA-HEAD-PROVIDER-B-RENAMED卡片点击“编辑渠道”，将dialog显示名称改为QA-HEAD-CANCEL-132，未点击保存即关闭；再次编辑，实际输入仍为QA-HEAD-PROVIDER-B-RENAMED并关闭。[重开输入值](../.qa-local/headed-20261011/browser-provider-cancel-132.txt)为根的实际可见IAB证据。仅该渠道dialog未提交草稿取消case通过，G04保持partial。前述全局botName等待700ms已自动保存，其还原小鲸鱼并核对磁盘，不能据此称普通字段未保存取消已验。

截至第二批结束时186行仍**2通过、73部分通过、1失败、94条件不足、15待测、1延期**；这是有头清单范围统计，与该次M3 98/99文件结果分开。当时待修自动失败为95，随后有效复验如下；规格/外部条件余项仍按清单保留，打包仍延期。

## 95轮询回归的确定性修复与第三次完整运行

根确认95仅测试文件正式冻结，生产app.js哈希前后相同。旧测试在15秒刷新配置下可稳定复现10秒等待状态请求超时：[修前15秒](../.qa-local/129-baseline-evidence/95-refresh15s-before-repair.log)。新测试由浏览器clock驱动生产轮询timer，HTTP、SSE与pause接口仍实际执行，并等待旧HTTP快照的真实提交点，不用固定250ms等待替代竞态验证。修后1秒/15秒配置均通过：[1秒](../.qa-local/129-baseline-evidence/95-refresh1s-after-repair.log)、[15秒](../.qa-local/129-baseline-evidence/95-refresh15s-after-repair.log)、[仅测试差异](../.qa-local/129-baseline-evidence/95-test-changes.diff)。

根在own副本去除生产revision保护，新断言实际失败false!==true，证明该测试能检测晚到快照覆盖较新暂停状态：[保护移除反证](../.qa-local/129-baseline-evidence/95-race-guard-mutant.log)。这是测试同步修复的定向证据，不能追认第二批超时具体由某项OS调度造成，也不能改写第二批exit1。

根第三次完整run-all已启动session71802，另存[full-regression-20261012-third.log](../.qa-local/full-regression-20261012-third.log)，最终exit/M3与M4整体结果仍待。前两批原日志94/99与98/99保留。本代理仅同步docs/静态，不并行执行行为测试；有头186行计数仍2通过/73部分/1失败/94条件不足/15待测/1延期。

根另准备独立PROFILE102扩展有头夹具，当前仅helper/kernel就绪，实际IAB插件场景待执行。前一helper以Windows裸C路径传--import失败，child exit1/lock=false；改fileURL后新run就绪。这是验收helper准备故障，没有产品UI验收结论，不将其算作应用缺陷或对应清单通过。

## 第三次完整run-all结果与独立插件可见IAB验收

根确认第三批session71802完整run-all **exit1，M3 98/99、M4 10/10**：[原始日志](../.qa-local/full-regression-20261012-third.log)。95本批通过；唯一失败为115-background-fit-test.mjs第135行，保存背景fit实值contain、期望repeat（日志2528–2610）。extensions_review正在核对真实存盘同步/竞态，尚无修复结论，不把失败先归为产品或夹具、也不记完整全绿。前两批exit1原日志继续保留。

根实际可见IAB4操作独立[PROFILE102夹具](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/descriptor.json)，内核18681、控制18679，与原QA主程序分开。自编用户面板为第十导航，ui.panel在helper准备时预授，不能算宿主授权UI已验。下表均为可见浏览器操作，不冒充原生Electron：

| 清单范围 | 实际操作与证据 | 本批边界 |
| --- | --- | --- |
| E09/E15/K05 用户面板配置/RPC边界 | seed own插件label/apiKey后，实际“读取自有配置”只回label/hasApiKey=true；probe所属工具OK/ownScope=true/singleLabel=QA_CUSTOM。[正向](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-positive-results.json)。实际五项越权分别拒绝全局API(-32601)、未声明key/全局theme/token管理/其它插件工具(-32003)，宿主仍暗色。[拒绝JSON](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-boundary-results.json)、[实际截图](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-boundary.png)。 | 三行从待测补partial；无API key明文回显。未执行授权UI、直接kernel/进程对象、HTTP/send完整合同、有头取消/热更旧回调，theme失败后普通字段保存亦未特测。 |
| E10 单提供者选择/回退 | plugin页pin默认后实际probe QA_DEFAULT；skills页清pin自动后QA_CUSTOM；plugin停用custom后QA_DEFAULT，再启用自动QA_CUSTOM。[pin](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-single-pinned.json)、[unpin](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-single-unpinned.json)、[fallback](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-single-fallback.json)、[恢复区域](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-capability-restored.txt)。 | 两页保存与实际能力解析指定case已测，继续partial；手动pin custom、删除fallback等组合未验。 |
| E11 managed就绪/启动失败 | 启用自编45秒delay，实际UI未就绪且控制后端running=false；45秒后重扫磁盘显示运行中。[pending](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-managed-pending.txt)、[后端](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-managed-backend-status.json)、[ready](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-managed-ready.txt)。停用delay、启用自编failed，实际未就绪/QA_MANAGED_EXPECTED_START_FAILURE；停用failed恢复默认running。[失败](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-managed-failed.txt)、[失败截图](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-managed-failed.png)。 | 继续partial；未pending中停用、未授权启动、备用owner pin或错误草稿全支路。 |
| E12 多提供者展示 | llm.request-params实际显示A默认→B替代协作链，region selects=[]/buttons=[]，无pin入口。[初始区域](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-capability-initial.txt)。 | 从待测补partial，仅展示与控件；无实际LLM调用/旧pin重排/完整转换、guard、claim消费执行。 |
| E05 失败清单/错目录/hook错误 | apiVersion999与setupthrow实际清单明确诊断999不支持/QA_EXPECTED_SETUP_ERROR，未加载不可用。[失败清单](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-plugin-errors.txt)。wrongdir在skills页未加载并显示找不到skill.json/plugin.json，[错目录](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-wrong-directory.txt)。根随后fresh probe，hook卡片仍已加载/启用/可用是，最近运行错误QA_EXPECTED_BEFORE_TOOL_ERROR实际可见：[fresh hook错误快照](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/headed-hook-error-active.txt)。 | 从待测补partial，上述指定本地case通过；先前txt为重扫后lastError已reset，不能用它代替fresh错误。其它类型矛盾/第三方兼容性余项未验。 |

初seed缺settings来自helper未持久schema.default，根仅给ownsettings补seed并修helper准备；最初浏览器误用上一run合成token401，改freshURL后正常。这两项是夹具/操作准备偏差，不记录为产品鉴权故障，也不编造应用修复。根随后POST own controlshutdown走生产stop，child5020 exit0、supervisor47280结束；[descriptor](../.qa-local/extension-headed-20261012025751773-5c1c1d6e/descriptor.json)为state=stopped/workerExited=true/instanceLockPresent=false。IAB4实际SSE显示Failed to fetch后已关闭，proof保留未删除。停止前默认managed恢复、failed/delay停用、custom single启用自动。Z02/Z03 own helper目前只是prepared，未开始有头验收。

当前186行为**2通过、78部分通过、1失败、94条件不足、10待测、1延期**；新增五行partial均限定上述浏览器证据。M3静态仍99文件/99唯一，第三批98/99 exit1与有头清单的唯一C10规格合同失败分别统计，115自动失败待核对。

## 115保存同步测试修复与132迁移派生字段修复冻结

根确认115正式冻结仅test115，生产源码未改。新测试匹配本轮真实保存POST body+ack、前端“已保存”、内存/磁盘和CSS，主动hold repeat保存时后端仍contain、前端已tiling，release后内存/磁盘repeat；保留真实持久化与像素断言。[真实暂留保存下旧断言失败](../.qa-local/129-baseline-evidence/115-held-real-save-before-repair.log)精确重现contain!==repeat，[修后115](../.qa-local/129-baseline-evidence/115-after-save-sync.log)通过，111/71/117/69关联通过。第三批98/99 exit1仍是完整运行事实，不将独立修后结果改写为同批全绿。

旧own recoveryrun另实际发现旧配置迁入后providers[0].hasApiKey仍存；132修前真实importer同样在config.providers.0.hasApiKey断言失败，[修前](../.qa-local/132-baseline-evidence/132-before-repair.log)。production仅src/kernel/migrator.js数组stripKeys早退一行修复，新[132测试](../test/132-migration-derived-array-test.mjs)5/5涵盖对象/数组/嵌套数组去派生flag保留业务/密钥、重复迁移源byte不变、dryrun、真实配置/API/保存与真实kernel自动迁移/HTTP/锁释放：[修后](../.qa-local/132-baseline-evidence/132-after-repair.log)。03/09/23/125关联green。该正式132与前述设置操作标记132不同，源已冻结，fresh own recoveryrun尚prepared未有头复验，Z03按已发现故障保留failed。

M3已加入132，静态为**100文件/100唯一/缺失0，132一次**，未执行100项整体；第四批拟100+M4，但尚未启动。此前三次完整日志94/99、98/99、98/99及exit1均保留。本代理本轮只维护docs/runner静态，未行为测试。

## Z02隔离损坏恢复的实际可见IAB验收

根实际IAB5操作旧[own recoveryrun](../.qa-local/data-recovery-headed-1791774366183-02e5c664/descriptor.json)：会话页1健康会话/30tokens，坏session读取当空跳过、不崩，原坏file保留；[健康会话](../.qa-local/data-recovery-headed-1791774366183-02e5c664/evidence/corrupt-healthy-session.txt)。坏chat4101初未列，根GET该messages触发真实生产空重建，再IAB刷新见2聊天，4101空/4102两原文及撤回+我标记保留；[空档](../.qa-local/data-recovery-headed-1791774366183-02e5c664/evidence/corrupt-empty-archive.txt)、[健康档](../.qa-local/data-recovery-headed-1791774366183-02e5c664/evidence/corrupt-healthy-archive.txt)。坏messages恢复由root API读触发，不声称IAB直接读坏档触发。

[实际初始状态](../.qa-local/data-recovery-headed-1791774366183-02e5c664/evidence/headed-initial-status.json)记录config备份60B、hash matchesOriginalBadConfig=true，实际设置api.base/model均空默认：[默认设置](../.qa-local/data-recovery-headed-1791774366183-02e5c664/evidence/corrupt-default-settings.txt)。SPEC §12允许store/session损坏当空重建，config例外先备份；坏session原file保留、健康档仍可读、config备份与默认UI均有证据，Z02升完整对应本地隔离条件通过。bundled全停用/noop transport是明示QA安全覆盖，不代表默认生产策略；没有QQ或外部模型调用。

根旧双profile正常POSTshutdown、锁均false，session99594 exit0；IAB5实际Failed to fetch后关闭。新[own recoveryrun](../.qa-local/data-recovery-headed-1791776254167-e41025fd/descriptor.json)刚prepared未启动，迁移修后有头复验仍待，不据源5/5关闭Z03。

该冻结时点186行为**3通过、78部分通过、2失败、94条件不足、8待测、1延期**；失败为C10登录合同与Z03已修待有头的数组派生flag。115自动独立修后green/三次整体历史exit1另记，100项第四批当时未启动；Z03后续实际复验如下。

## Z03源132修后新窗口迁移链路的可见IAB复验

根fresh [own recoveryrun](../.qa-local/data-recovery-headed-1791776254167-e41025fd/descriptor.json)、PROFILE104实际IAB6复验：磁盘providers派生flag=false、obsoleteStream=false、thinkingMode=on，旧数组派生flag缺陷已关闭。聊天4201两旧archive原文/撤回/我保留，[旧聊天](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/migration-chat-4201.txt)；memory group4201显示QA旧备注成员/QA_Z03_LEGACY_MEMORY，[旧记忆](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/migration-memory.txt)。实际设置打开全局botName/昵称、unified=false、旧模板与两种personaByChat JSON键：[人设设置](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/migration-persona-settings.txt)。

根实际UI给普通customRules追加SAVE_ROUNDTRIP并等待“已保存”，[保存前](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/before-ui-save-status.json)/[保存后](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/after-ui-save-status.json)核对6项secretHash全相同、sourceinventoryunchanged=true。初核hash=false来自PowerShell新进程未载入旧变量，随后以已保存before JSON重新正确核对true并更新[verdict](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/migration-verdict.json)；这是验收核对脚本偏差，没有产品Key丢失事实。

root control/stimulus4201/4202触发真实应用runner向受控LLM两request，两个30tokens终态/0send。实际IAB分别展开system：数字键4201为NUMERIC_SYSTEM+ROLE+安静，chatkey4202为CHATKEY_SYSTEM+ROLE+活跃；globalIdentity均QA-Z03全局小鲸鱼，MUST_NOT_OVERRIDE未进入实际modelcontext。[数字键运行](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/migration-runtime-4201.txt)、[聊天键运行](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/migration-runtime-4202.txt)、[实际截图](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/migration-runtime.png)、[最终状态](../.qa-local/data-recovery-headed-1791776254167-e41025fd/evidence/migration-final-status.json)。该UI/保存/运行的本地链与132自动5场景分别记录；Z03从failed更新partial，真实旧账号/QQ登录态迁移未验。

全程合成0.4源、明确19bundles停用、假QQ和LLM为隔离QA覆盖，不据此称生产默认依赖或真实登录态全部通过。先前SSE工具审批90秒超时后仅一次重新观察/重试成功，无reject/无批准pending，不作为产品鉴权故障。fresh双profiles正常POSTshutdown、锁false，session99439 exit0；IAB6 SSE Failed to fetch后关闭，helper均已stop。主QA仅已复制migrator132/main131，live78000仍旧实例，最终正常重启尚待；第四100+M4也尚未启动。

当前186行为**3通过、79部分通过、1失败、94条件不足、8待测、1延期**；唯一失败C10登录合同，C09含图投稿合同/外部真实发布等缺口仍按partial记录。M3静态100唯一，不把修后本地有头链当100项完整回归已执行，不打包。

## 主QA最终源码重启与第四次完整回归

根正常原生关闭旧PID78000，锁清；使用最新main131/migrator132重启主QA为PID44396。own扩展/损坏/迁移helpers已全部stop，根确认仅原QA fixture36000与主实例44396保留。该次重启后九导航/SSE/PNG只读复验尚待根后续观察，不由PID推断UI已通过。

根第四次完整run-all/session90402实际结束**exit0，M3 100/100、M4 10/10**：[full-regression-20261012-fourth.log](../.qa-local/full-regression-20261012-fourth.log)，M3结论在3277行、M4在3315行；日志220237B、最终mtime2026-10-12 12:10:01+08:00。前三次完整exit1及独立115/95/132修复证据保留，这是第四批完整通过结果；不将自动文件通过数换算为全功能/规格有头通过。本代理本轮只docs/静态，无并行行为测试或生产源码改动。

本代理静态检查这三份验收Markdown全部571 个本地链接引用、187 个唯一文件路径，缺失0；130新截屏指向run根目录，早期截屏指向其实际screenshots子目录。检查去除fragment/行号，仅证明本地目标路径存在，不验证anchor位置或截图含义。runner100文件/100唯一/缺失0，当前186行3通过/79部分/1失败/94条件不足/8待测/1延期不变。

## 最新实例原生就绪与首次用量重读

根最新PID44396/window9832878实际原生看到九导航、SSE连接、25sessions，runtime paused=false/running=[]。首次原生打开用量7天，¥0.006940、22runs/48calls、输入4680/输出1120/缓存720与15%，与重启前IAB统计相同；图表与4模型正常，[实际原生截图](../.qa-local/headed-20261011/native-usage-after132.png)。U06仅首次打开/重启金额scope从待测补partial，删session后历史用量与旧匿名/身份档共存仍未headed。

第四完整本地回归已通过，当前186行仍按实际覆盖分别判定：**3通过、80部分通过、1失败、94条件不足、7待测、1打包延期**。唯一失败C10登录验证码与官方认证合同范围未闭合；C09含图金句发布仍缺可信写入合同，真实QQ/商业模型/旧登录态/公开发布/CAPTCHA及表内余项未由此关闭。S12 own slowproxy helper正在准备，尚无case通过；G29/H04确认取消计划也尚未执行。本批无新sourceedit、未打包，全部临时helpers已stop，仅原QA fixture36000/主44396保留。

## 最新清空/重置取消及迟到详情的实际复验

根最新原生先打开聊天清空确认再取消：[journal497–499](../.qa-local/headed-20261011/ui-actions.jsonl#L497)、[清空确认截图](../.qa-local/headed-20261011/native-clear-cancel-dialog.png)；再打开设置重置确认再取消：[journal500–502](../.qa-local/headed-20261011/ui-actions.jsonl#L500)、[重置确认截图](../.qa-local/headed-20261011/native-reset-cancel-dialog.png)。[最终API/计数核对](../.qa-local/headed-20261011/clear-reset-cancel-verification.json)记录botName=QA 小鲸鱼/provider=qa-local/model=qa-chat、paused=false/running=[]、group10002=823/group10001=36/private20001=17，resetCancelled=true/deletionExecuted=false。H04/G29从待测补partial，仅确认/取消；没有最终清空或重置，不由此证明备份、删除目标或全部隔离。最初核对JSON为null是验收脚本未parse text/plain，已更正最终记录，不算产品取消故障。

根own [slowproxy run](../.qa-local/slow-detail-headed-20261012042503212-c3df4e6a/descriptor.json)实际可见IAB两次点击会话cell，真实A GET200已held，B GET200完整交付04:27:20.538Z后500ms，A于04:27:21.045Z自动释放、21.050Z交付完，A/B clientDisconnected=false：[事件](../.qa-local/slow-detail-headed-20261012042503212-c3df4e6a/events.jsonl)、[UI后状态](../.qa-local/slow-detail-headed-20261012042503212-c3df4e6a/headed-status-after-ui.json)。迟到后仍“会话mv4lxvqd-7473a9db”与QA-HEAD-130-CONTEXT-CHECK：[实际UI](../.qa-local/slow-detail-headed-20261012042503212-c3df4e6a/headed-after-late-a.txt)、[截图](../.qa-local/slow-detail-headed-20261012042503212-c3df4e6a/headed-after-late-a.png)。S12该晚A不覆盖B指定case通过、整行partial；刷新中编辑/弹窗与其它竞态仍未验。helper正常shutdown/session14216 exit0、tab7关闭，sourceKernelStopRequested=false、主kernel仍运行。

本次静态审计还发现A13/G27两行旧“暂无实操”残留：A13已有journal364–369五原生入口→QA recorder dispatch/externalOpened=false；G27的自启/托盘/暗亮主题消费者已有A08/A07/K01–04限定证据。两行补partial，只复用已发生证据，没有新增外跳/配置操作。视觉显示消费者正由extensions代理补，不判永久缺失、也不提前称修后headed完成。

当前186行**3通过、85部分通过、1失败、92条件不足、4待测、1打包延期**；第四完整M3 100/100、M4 10/10原记录保持。剩待测E06/E08/E13/E17须按真实前提与操作范围继续，静态建议与已执行case分开，本代理无产品/UI/服务操作。

## 133显示消费者冻结与数据目录真实Explorer验收

根确认133生产五UI源已正式冻结，局部回归green。[133回归](../test/133-cache-vision-ui-test.mjs)使用真实kernel统计/模型目录与隔离Chromium、合成模型HTTP，验证缓存统计、目录/扫描、showVision持久化、部分SSE与窄布局。根同步后的headed结果尚未出，U07不提前从条件不足升通过；G27保持已有分项partial。M3 runner已收录133，静态**101文件/101唯一/缺失0，133一次**；第四100/100+M4 10/10仍是截至132冻结源码的完整结果，第五101项拟运行、尚未启动，不能把局部green合成新全套结果。

根原生实际点击“打开数据目录”：[journal503–504](../.qa-local/headed-20261011/ui-actions.jsonl#L503)。新owned Explorer10815482标题与sky AX准确指向`.qa-local/headed-20261011/data`、19项；激活后实际PNG：[资源管理器截图](../.qa-local/headed-20261011/native-open-data-explorer.png)。G29真实目录打开指定case完成，仍partial，最终重置/备份/清理未执行。初capture自动审批等待90秒后重新观察/重试成功，这是工具等待超时，未发生自动审批拒绝，也不是产品失败。AltF4关闭动作已dispatch，根稍后核对关闭结果，现不称已关闭。

当前186行3通过/85部分/1失败/92条件不足/4待测/1延期不变；最新新增133独立源/自动证据与尚待headed、第四完整结果/第五待跑分开。本代理只docs/runner静态，未启动行为测试或服务。

## 第五完整回归通过与133实际显示消费者复验

根第五完整run-all/session40444已实际**exit0，M3 101/101、M4 10/10**：[完整第五批日志](../.qa-local/full-regression-20261012-fifth.log)220733B/mtime2026-10-12 13:37:05+08:00，M3在3287行/M4在3325行，包含133冻结源码。第四100/100截至132与前三次失败批原日志分别保留，不把多批结果叠加成全功能/完整规格通过；本代理未重复测试。

133五UI复制后根原生F5/window9832878实际顶栏显示“今日缓存命中16.7%”，[原生PNG](../.qa-local/headed-20261011/native-cache-hit-133.png)与[实际API](../.qa-local/headed-20261011/cache-hit-133-api.json)为2026-10-12输入2400/缓存400；7日用量15%是另一范围，两者差异不记错误。应用paused=false/running=[]。

根IAB1 fresh授权bootstrap进入设置模型目录，实际10徽标：qa-local三项支持、qa-fail未知并显示HTTP503、B同名未扫，旧结果未串到其它渠道。[开启目录DOM](../.qa-local/headed-20261011/browser-vision-catalog-on-133.txt)、[真实徽标截图](../.qa-local/headed-20261011/browser-vision-badges-133.png)。实际点击“显示视觉能力标记”label关闭→保存ACK→目录0img且selectoptions仅原ID：[关闭DOM](../.qa-local/headed-20261011/browser-vision-catalog-off-133.txt)。再次开启→保存ACK→reload→设置等待支持img显示，10img恢复、主模型qa-chat；[恢复DOM](../.qa-local/headed-20261011/browser-vision-catalog-restored-133.txt)、[恢复API](../.qa-local/headed-20261011/vision-restored-133-api.json)记录showVision=true/autoStart=false/closeToTray=false。

U07从条件不足补partial、G27更新消费者实际范围，旧仅保存开关缺口关闭；本次未新scan，使用已有合成结果，no-vision分支只有133自动回归、真实模型仍未headed。各F206刷新间隔/自动watcher等余项仍按G27保留，不能把指定显示case扩大到整行全部条件。根另AltF4后列窗确认owned Explorer10815482已关闭，旧8653216未触。

当前186行**3通过、86部分通过、1失败、91条件不足、4待测、1打包延期**；完整M3 101/101/M4 10/10与有头覆盖分别统计，C09含图发布合同/真实外部与C10登录合同范围未消除。E06/E13在fresh own fixture仅取消操作仍进行中，尚无安装/删除通过记录；本批未打包、未新增源修复。

最终133文档同步后链接静态核对：638 本地引用/205 唯一文件路径/缺失0；去fragment与行号只核路径存在，外部URL未由此验证。runner101文件/101唯一/缺失0，本代理未重跑任何行为测试。

## 最终插件卸载取消、宿主授权只读及ZIP选择器取消

根fresh [own extensionrun](../.qa-local/extension-headed-20261012053034556-66b6a63e/descriptor.json)、owned31692/UI8实际操作：qa-head-single-custom卸载确认→取消，[确认PNG](../.qa-local/extension-headed-20261012053034556-66b6a63e/headed-uninstall-confirm.png)与[取消后UI](../.qa-local/extension-headed-20261012053034556-66b6a63e/headed-uninstall-cancel-after.txt)显示仍已加载/启用/可用是，owned codefile仍存在。[最终核对](../.qa-local/extension-headed-20261012053034556-66b6a63e/headed-cancel-final-verification.json)明确uninstallCancelled=true，API状态核对未完成（验收驱动向错误地址/api/skills得到404），验证来源为UI+owned文件存在，不拿无效404证明产品状态或归为产品bug。E13仅确认/取消partial，没有实际卸载/storage等全流程。

E08 root实际qa-head-panel宿主授权readonlydialog有fingerprint、ui.panel既有allow、允许/拒绝/每次询问三controls；关闭后0dialogs。[只读DOM](../.qa-local/extension-headed-20261012053034556-66b6a63e/headed-permissions-readonly.txt)、[PNG](../.qa-local/extension-headed-20261012053034556-66b6a63e/headed-permissions-readonly.png)。未点击allow/deny/ask，未修改授权；预授来自helper准备，只有只读入口/指纹显示/关闭partial，授权修改/异步ask/超时等仍未headed。

E06 IAB waitForEvent(filechooser)10秒超时，root native9832878安装ZIP实际打开OSpicker并显示ZIP(*.zip)；filename AXID26536不在cached state、child坐标定位不符目标限制，activate一次/Alt+n仍焦点到search，未可靠定filename，因此未输入路径/未选ZIP/未继续不支持的UI操作。Escape实际取消回主QA插件10cards/8loaded/error0：[journal509–516](../.qa-local/headed-20261011/ui-actions.jsonl#L509)、[定位限制记录](../.qa-local/headed-20261011/native-zip-picker-ownership-limit.txt)。仅picker打开/取消partial，未选ZIP、未到安装确认/安装，合法/恶意包安装余项仍未验；pickerPNG本批尚未归档，不编造截图证据。工具等待/定位限制不是产品失败。

own helper第一次default spawn EPERM，旧run cd36b42c descriptor为starting/无worker；fresh66b6在获准执行权限下正常启动，这是验收环境约束。fresh正常controlshutdown，descriptor stopped/workerExited=true/lock=false、session8007 exit0、tab8关闭；代码与所有proof保留。主程序133冻结与第五101/101+M4 10/10不变，无需再跑。

当前186行**3通过、89部分通过、1失败、91条件不足、1待测、1打包延期**；剩待测E17 MCP撤权/重新授权实际生命周期，部分行的最终安装/卸载/删除/重置/授权修改等仍未执行。C09含图发布合同/C10登录合同与真实外部前提保持，本代理只有docs/静态核对。

最终取消补验后静态核对：663 个本地链接引用/212 唯一目标文件/缺失0；runner101文件/101唯一/缺失0，scoped diff与尾随空白检查无问题。该检查只核本地路径存在，未重跑行为测试。

## 会话清除取消、群发校验取消与134目标名称修复冻结

根实际IAB打开“清除终态”确认→取消，返回仍25条会话、persist保持：[确认DOM](../.qa-local/headed-20261011/browser-session-clear-confirm.txt)、[取消后DOM](../.qa-local/headed-20261011/browser-session-clear-cancel-after.txt)。S09从条件不足补partial，只有确认/取消，没有实际删除，删除后历史用量/运行会话拒删仍未headed。

群发旧UI实际空内容/无目标警告，填QA-HEAD-BROADCAST-CANCEL-134并选group10002，二次确认取消后草稿/选择保留，再关闭0dialog；[旧确认前DOM](../.qa-local/headed-20261011/browser-broadcast-name-before134-confirm.txt)、[最终计数](../.qa-local/headed-20261011/session-broadcast-cancel-status.json)为sends10/models47/marker0、toolCall=null、deletionExecuted=false，无实际群发。但实际目标只显示数字/内部key，真实API已给{id,name}，这是名称消费者缺陷，[authoritative notes09b R17/R18](../../dsh-spec/notes/09b-route-contracts.md#L138)为字段合同；F140是聊天管理，不能硬套成群发规格。

134 production仅ui/panels/sessions/panel.js一行消费标准name，源已正式冻结；[134回归](../test/134-broadcast-target-names-test.mjs)由负责代理实际before red/after green及80/123关联通过，真实provider规范化→HTTP→iframe/RPC、合成发送不等于外部送达。root修后headed还未出，S11将已验证校验/取消与目标名称故障分开，当前failed待实际关闭。runner静态**102文件/102唯一/缺失0，134一次**，第五101/101+M4 10/10截至133保留，第六102项全套待跑，不提前称102/102。

根新的纯合成[destructive ownclone](../.qa-local/destructive-headed-20261012062252328-8b5b758d/descriptor.json)为3聊42消息/7sessions/6members9impressions、initialsnapshot29files，fixture73756已启动/Electron84256待root实际选窗。尚未执行delete/reset/install或最终确认，不由准备完毕记对应功能通过；最终动作范围由root另行明确，本代理未动该实例。

该时点186行**3通过、90部分通过、2失败、89条件不足、1待测、1延期**；失败C10登录合同与S11目标名称（源134已修待headed），上述校验/取消等case不扩大为最终发送/删除。本代理只docs/runner静态，无新增行为测试。

## 134修后实际目标名称与第六完整回归通过

根同步唯一sessions源后IAB reload旧临时bootstrap超过30分钟，401/无导航为预期短期凭据TTL；fresh授权URL重新bootstrap后正常，未当134产品故障。实际群发四个checkbox名称为QA · 本地功能验收群/QA · 第二测试群/合成私聊联系人/合成成员：[修后DOM](../.qa-local/headed-20261011/browser-broadcast-name-after134.txt)、[修后PNG](../.qa-local/headed-20261011/browser-broadcast-name-after134.png)，关闭后0dialogs。旧数字名消费缺陷实际关闭，S11恢复partial；之前校验/取消实证保持，未实际群发或逐目标失败统计。

根第六完整run-all/session26339实际**exit0，M3 102/102、M4 10/10**：[第六完整原始日志](../.qa-local/full-regression-20261012-sixth.log)221175B/mtime2026-10-12 14:44:42+08:00，M3结论3293行/M4结论3331行。最新源截至134全部冻结、完整通过；前五批原始事实保留，不把自动全套102文件通过换为全部功能符合规格。本代理未重跑任何测试。

当前186行**3通过、91部分通过、1失败、89条件不足、1待测、1打包延期**；失败仍C10认证/验证码合同范围，C09含图公开发布与真实外部条件仍未闭合。未安装包打包。

## 独立删除副本可复核范围与待答授权

根新[纯合成clone](../.qa-local/destructive-headed-20261012062252328-8b5b758d/descriptor.json)实际native：fixture73756/17484、Electron84256/window22875062/console17485，7sessions、3聊天各14消息、6记忆成员/9印象，initialsnapshot29files保留。[会话范围PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-synthetic-session-scope.png)、[聊天范围PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-synthetic-chat-scope.png)。实际group10001清空确认已打开：[待授权确认PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-clear-awaiting-approval.png)、[确认文字](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-clear-awaiting-approval.txt)。

根已请求操作当时批量授权，仅限`.qa-local/destructive-headed-20261012062252328-8b5b758d/data`内合成聊天/记忆/会话删除及最后重置，**尚未收到答复**，不能判已批准或已执行。[待审状态](../.qa-local/destructive-headed-20261012062252328-8b5b758d/pending-review-state.json)明确approvalState awaiting、destructiveActionsExecutedByHelper=false；本轮此副本只scope/确认预览，未计删除/重置/安装通过。主QA window9832878/PID44396+fixture36000仍paused=false/running=[]/normal/toolCall=null/sends10/models47，与待审副本分开。当前删除副本仍运行/确认待答，不称全部临时进程已清理。

第六完整批文档同步后静态审计：701 个本地链接引用/226 唯一目标文件/缺失0；runner102文件/102唯一/缺失0。去fragment/行号仅核本地文件存在，不验证外部URL或审批状态；无行为测试或服务启动。

## 限定删除/重置授权已收到，实际结果待逐项复验

根代理转达用户最新已明确允许，仅在`../.qa-local\destructive-headed-20261012062252328-8b5b758d\data`执行合成聊天清空、记忆清空、会话删除/清理，最后全部重置；范围为42消息/7会话/6成员9印象及测试配置密钥，dataDir外initialsnapshot29files保留。授权已收到，**截至本次文档同步尚无执行证据**，等待root逐项实际UI/服务/磁盘结果，不预记删除或重置通过。[旧pending state](../.qa-local/destructive-headed-20261012062252328-8b5b758d/pending-review-state.json)属于批准前确认预览快照，其awaiting值不代表最新授权仍待答。所有UI/own liveQA由root独占，本代理未写live文件或启动/调用服务。

静态核对四行完整本地验收需保留以下断言；这是待验清单，不计作已执行：

| 清单行 | 本副本应核对的实际结果 | 完整判定的余项 |
| --- | --- | --- |
| H04 聊天清空 | group10001消息14→0；group10002/private20001仍各14；记忆6成员9印象、会话7保持。刷新/重进仍空，确认仅指该聊天。store保留空JSON/nextLocalId=1是正常结果。 | 除取消旧实证外，还须实际清空后的UI/磁盘/其它对象保持，不能只见200。 |
| N04 记忆删除 | 单成员删除只作用目标chat/user，同QQ在其它群/私聊仍存。删20001为6/9→5/7，删20002为5/8；清group10001后4成员6印象，其余两档各2成员3印象。 | 单成员与整聊天两类都要验，历史编辑/取消已有独立实证；列表白名单空placeholder正常，不能据残存空卡判未清。 |
| S09 会话删除 | 单terminal删除7→6，余终态clear后0；选中detail不留旧ID；删前后历史usage/all/天档tokens、金额贡献不减少。 | 当前7全done/error/aborted，不能证明running/waiting拒删；需独立受控case或整行保留partial。 |
| G29 最后reset | 以操作当时pre-reset文件/secret hash为基线；真实backupDir在clone base内为data的sibling，内容应匹配当时pre-reset且排除qq-agent.lock。回复要求重启，正常重启本clone后核默认配置/测试密钥清理/聊天记忆会话等清空与锁行为。 | 外侧初始29文件快照与原QA保持；备份是重置前已局部删除后的数据，不能误与初始seed全量比较。配置/档案/密钥清理均需真实证据，授权不等于结果。 |

第六102/102+M4 10/10截至134冻结源码不变，186行3通过/91部分/1失败/89条件不足/1待测/1延期尚未因授权改变；本轮未打包。

## 授权clone已完成聊天清空与单成员删除

根实际原生确认清空clone group10001，操作当时15消息（初seed14+预置合成提醒触发1）→0，刷新仍0/nextLocalId=1；另外group10002/private20001各14，文件hashunchanged。[实际清空PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-chat-cleared.png)、[三档磁盘计数/hash](../.qa-local/destructive-headed-20261012062252328-8b5b758d/after-chat-clear-file-counts.json)。这是H04目标清空/其它聊天保持的已执行case，初始seed基线14不用于否定实际操作前15，整行其它记忆隔离证明仍按范围保留partial。

根clone实际删除memory group10001成员20001，6成员9印象→5/7，其余两聊天4文件hashunchanged、同QQ在其它档仍存在：[单成员删除PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-member-deleted.png)、[删后5成员快照](../.qa-local/destructive-headed-20261012062252328-8b5b758d/after-memory-member-delete.json)。N04补该实际删除范围，整群记忆清空确认只打开；因window user-input guard中断，未执行整群清空，恢复后当前窗口/数据须root重新观察。名称为[after-chat-memory-clear.json](../.qa-local/destructive-headed-20261012062252328-8b5b758d/after-chat-memory-clear.json)的记录也仍是5files/7impressions，不能从文件名推断整群4/6清空成功。

用户“继续”后，已取得的精确dataDir action-time授权仍有效，无需重复申请；是否执行由root实际逐项记录，授权本身不代替结果。会话delete/clear及最后reset暂未收到执行证据，不提前记录成功；产品134冻结、第六102/102+M4 10/10保持。H04/N04仍partial，186行3通过/91部分/1失败/89条件不足/1待测/1延期不变，本代理未操作UI/live/API/服务或测试。

## 恢复后整群记忆与终态会话清理实证、重置实际失败

中断期间原memory已空、部分chat已清空，未能归因这些变化，不能计root操作或其它隔离成功。根为了可验证整群操作，用UI恢复group10001原seed成员20002/QA小周及一条印象：[受控恢复DOM](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-memory-restored-for-clear.txt)；再实际清空该group1→0，[confirmed清后DOM](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-whole-memory-clear-confirmed.txt)/[PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-whole-memory-clear-confirmed.png)，[preReset scope](../.qa-local/destructive-headed-20261012062252328-8b5b758d/pre-reset-scope.json)memberFiles=0。只将该已恢复目标的实际清空计入N04，其它档原先空无法证明原记录隔离；早期误名after-chat-memory-clear.json五文件状态不与新confirmed混同。

S09 root真实UI单session7→6，再清终态6→0，[清后DOM](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-sessions-cleared.txt)/[PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-sessions-cleared.png)。[usage删前](../.qa-local/destructive-headed-20261012062252328-8b5b758d/usage-before-session-delete.json)/[全清后](../.qa-local/destructive-headed-20261012062252328-8b5b758d/usage-after-all-session-clear.json)totals保持7runs/14calls/¥0.00455、输入2730/输出490/总3220/缓存420；[用量实际UI](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-usage-after-session-clear.txt)仍可读。[cleanup verdict](../.qa-local/destructive-headed-20261012062252328-8b5b758d/session-cleanup-verdict.json)sessionFileCount=0/totalsUnchanged=true/usageDayHashesUnchanged=true，也明确onlyInitialTerminalCases=true/runningDeletionCaseTested=false。S09/U06补删除后用量保留实际case，均partial，运行拒删/匿名共存余项不由此关闭。

授权clone最后reset实际失败：[失败DOM](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-reset-failed-before-repair.txt)/[PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-reset-failed-before-repair.png)，EPERM unlink `data/electron-user-data/Cache/Cache_Data/data_0`。根报告备份已创建后删除失败，部分数据/config可能已删，尚未完整核定残存范围；不能把有备份或已确认当成功重置。G29从partial更新failed。135内核两阶段正常退出/重启清理与136设置诚实restartUI正在修，未完成；当前test135尚未齐全、136测试存在，不先收录不完整修复或重复运行全套。

第六102/102+M4 10/10是截至134冻结源码的完整历史结果，135/136新修不由此自动通过。当前186行**3通过、90部分通过、2失败、89条件不足、1待测、1延期**；失败C10登录合同/G29实际reset EPERM。所有新操作由root在既有授权clone执行；本代理只docs和测试runner静态管理，未UI/live/API/服务/测试操作。

## 135后端修复冻结与136候选UI收录

根确认135后端七生产源正式finalfreeze：[源hash清单](../.qa-local/135-production-source-hashes.json)包含data-reset、kernel、HTTP、log、console routes/route-adapters及Electron main。[135修前真实kernel HTTP](../.qa-local/135-reset-before.log)稳定500/lockedCacheExists=true/configExists=false，重现旧备份后遇锁缓存部分删除问题；[135修后](../.qa-local/135-reset-after.log)7/7通过，[相关32](../.qa-local/135-related-32.log)25/25。

新合同分两阶段：运行中先停业务owner/封闭旧仓库写入、完整备份并提交经校验的pending marker；HTTP明确`resetAccepted=true/resetCompleted=false/restartRequired=true`，请彻底退出再打开，刷新不能完成。彻底退出后下次启动，在Electron选择/打开userData及kernel日志/配置/仓库之前验证PID、锁、路径、备份receipt/digest和独占claim，再清理并写一次新defaults；失败保留备份/marker并拒绝启动，不在活Chromium缓存上unlink。7场景包括真实HTTP/锁缓存、备份失败不删Key档案、并发清理、防未验证路径/PID/备份、崩溃claim与Electron userData时序。这是负责代理的隔离后端回归，不是root实际重置复测已通过。

136设置UI两源已实现但尚未finalfreeze，行为尚待负责代理容量恢复。[135测试](../test/135-reset-lifecycle-test.mjs)/[136候选UI测试](../test/136-reset-result-ui-test.mjs)均按root最新指令收录runner，静态**104文件/104唯一/缺失0，两项各一次**；收录不等于136回归已通过。未运行104全套、第六102/102+M4 10/10截至134仍保留。G29 actual failed继续等待root修后复测，186行3通过/90部分/2失败/89条件/1待测/1延期不变，本代理未启动测试、服务、UI或触live数据。

## 135/136最终定向证据及第七至第九完整回归

上节是候选收录时的历史状态。135最终[后端日志](../.qa-local/135-reset-after.log)为8/8，包括新authenticated SSE订阅在preparing期间收到真实最终状态；136最终[HTTP/UI日志](../.qa-local/129-baseline-evidence/136-after-reset-result-consumer.log)四组通过：接受重置后持久显示备份/待彻底退出，不假称完成或重新读表单；确认期间暂停普通自动保存、取消保留草稿；实际备份500失败保留输入和失败结果；新打开preparing页面收到真实最终SSE，迟到旧HTTP不能把失败表单重新锁定。相关117/52/133定向通过由负责代理回报，未由本代理重复运行。独立/events链原本正常，不能把排查期间的SSE409猜测记作产品故障。

| 完整批次 | 实际结果与解释 | 原始证据 |
|---|---|---|
| 第七，104文件 | exit1，M3 64/104、M4 10/10；大量sandbox spawn EPERM使行为未运行，是环境阻断，不能把这些视为40项产品断言失败。 | [日志](../.qa-local/full-regression-20261012-seventh.log)、[退出记录](../.qa-local/full-regression-20261012-seventh-result.json) |
| 第八，同源码正常本地进程权限 | exit1，M3 103/104、M4 10/10；唯一131夹具未复制新增config/data-reset生产依赖，启动import失败使预期case未运行。 | [日志](../.qa-local/full-regression-20261012-eighth.log)、[退出记录](../.qa-local/full-regression-20261012-eighth-result.json) |
| 第九，session8858、修后131夹具 | exit0，M3 104/104、M4 10/10；正常本地进程权限，明确includes131DependencyFixture=true。13:26:48Z结果文件已写入，日志3364/3402分别记录两组通过。 | [日志](../.qa-local/full-regression-20261012-ninth.log)、[退出记录](../.qa-local/full-regression-20261012-ninth-result.json) |

131只修测试生产依赖闭包，保留原13个case断言，增加非法pending前置校验第14case；[旧依赖红日志](../.qa-local/131-dependency-before.log)、[补齐后14/14](../.qa-local/131-dependency-after.log)、[测试差异](../.qa-local/131-dependency-fixture.diff)分别保留。没有松启动一次报告/退出/锁断言，也没有额外产品源改动。第六102/102截至134、第四/第五和前三批记录均保留；第九104/104截至136自动回归通过不等于186行有头规格全部完成。runner仍104文件/104唯一，本代理未运行任何测试或服务。

## 授权clone修后重置实际提交、退出与新启动清理

root在同一授权clone原生window4528158/PID83232实际确认重置：[接受结果DOM](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-repaired-reset-accepted.txt)/[PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-repaired-reset-accepted.png)。[接受快照](../.qa-local/destructive-headed-20261012062252328-8b5b758d/repaired-reset-accepted.json)显示业务仍保留、16文件与新备份`data.backup-2026-10-12T13-05-18-176Z-7d071d03`hash匹配、pending prepared；此时resetAccepted=true/resetCompleted=false，OneBot已断、paused=true/fixtureclients=0，UI明确请彻底退出再打开，不能刷新冒充清理完成。

root File→Exit正常退出，旧83232不再运行、锁消失，pending和config仍存在：[正常退出快照](../.qa-local/destructive-headed-20261012062252328-8b5b758d/repaired-pending-normal-exit.json)。再以正常本地权限启动同data，新80504/native3346260成功；不是自动重启，也不是继续删除旧活Chromium缓存。[完成快照](../.qa-local/destructive-headed-20261012062252328-8b5b758d/repaired-reset-completed.json)旧测试API/OneBot/console Key均空、providerKeys0/providers0/model空、messages/memory/sessions/usage文件0，Electron proof及pending marker消失，备份仍存在且业务hash一致。

实际原生会话0条：[空态DOM](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-repaired-reset-empty-sessions.txt)/[PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-repaired-reset-empty-sessions.png)；root可见IAB聊天0/0已实读。最后记忆/用量/设置GUI仍等root逐页结果，文件0不代替尚未记录的UI观察。原QA对比54文件changed=[]、锁仍44396：[隔离核对](../.qa-local/destructive-headed-20261012062252328-8b5b758d/main-qa-after-repaired-reset.json)；不触外侧初始29文件快照。旧EPERM原始失败截图/500日志按上节历史保留。

G29当前从failed改为partial：修后备份/正常退出/新启动文件清理及会话聊天指定case已实际通过，待最后三页UI后再判整行。当前186行**3通过、91部分通过、1失败、89条件不足、1待测、1打包延期**；唯一失败C10登录验证码合同，C09含图投稿合同/真实外部条件继续保留。全部UI/进程/数据动作由root执行，本代理只文档与静态核对。

本批三份Markdown静态审计793个本地链接引用/269个唯一目标文件/缺失0，runner104文件/104唯一/缺失0，diff whitespace检查通过。去fragment和行号只核路径存在，不验证外站、anchor或截图含义；新增回归、实际重置和剩余GUI观察分别记录，没有行为测试或服务操作。

## G29修后最后GUI复验完成

root已实际补齐三页观察：原生[默认设置DOM](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-repaired-reset-default-settings.txt)/[PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/native-repaired-reset-default-settings.png)显示Base URL/model空、Key尚未配置、没有渠道、保存按钮可用、无pending卡；可见IAB[记忆DOM](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-reset-completed-memory.txt)0文件/0整理；[全部历史用量DOM](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-reset-completed-usage-all.txt)/[PNG](../.qa-local/destructive-headed-20261012062252328-8b5b758d/headed-reset-completed-usage-all.png)全部成本0/运行0/调用0/输入输出cache0。此前原生会话0与root可见IAB聊天0/0仍有效，聊天transcript只存在root工具记录，没有单独归档txt，不造证据链接。

G29整行限定本地源码/授权合成副本通过：真实Explorer、取消、先备份不清/正常退出/新启动完成、默认设置/秘密清理和档案空态均已实证。[54个原QA业务hash核对](../.qa-local/destructive-headed-20261012062252328-8b5b758d/main-qa-after-repaired-reset.json)全unchanged，原lock44396不变。R-03当前安全两阶段200仅表示resetAccepted=true/resetCompleted=false，完成发生在旧PID完全退出后的下一PID；旧route合同即刻清理的完成时点已调整，HTTP200或备份存在均没有单独记作重置完成。

第九session8858已由root确认exit0/M3 104/104（日志3364）/M4 10/10（3402）/13:26:48Z，全部产品源冻结，不再运行测试。当前186行**4通过、90部分通过、1失败、89条件不足、1待测、1打包延期**；本地重置链完成不等于186项全通过，C10认证合同、C09图片投稿合同和真实外部余项继续保留。root正正常退出leaf clone并停止所属fixture，备份/原初快照/旧源保留；收尾未收到最终状态前不称已经全停，原主QA继续保留。本代理只更新文档/静态检查。

最终静态核对：三份Markdown共806个本地链接引用/274个唯一文件/缺失0；186行状态计数与上段一致；runner104文件/104唯一/缺失0。diff whitespace及另查三份未跟踪文档行尾空白均通过。只核本地路径存在，未执行测试/联网/服务或操作liveQA。

## 2026-10-14 紧凑UI完成后的首批有头续测

用户要求先完成UI修复，再继续原有功能测试。root现已在新建的[独立合成副本](../.qa-local/headed-resume-20261014/fixture/live.json)实际使用可见IAB访问本地15667控制台；原始30文件已保存到数据目录外侧的[初始快照](../.qa-local/headed-resume-20261014/initial-seed-snapshot.json)。本批界面操作、配置保存和插件加载均限定该副本，QQ/模型对端是本地合成服务，没有真实QQ送达、商业模型调用、外站投稿或安装包打包。Electron进程存在不单独算作原生窗口操作证据。

紧凑UI的实际展开/收起[几何](../.qa-local/headed-resume-20261014/evidence/ui-geometry.json)均为顶部44px、徽记36×36且坐标(12.5,22)、九个导航按钮46px且逐项纵坐标一致、footer纵坐标675；两态无外层横向溢出，收起导航scrollWidth/clientWidth均45、railScroll=0。[展开截图](../.qa-local/headed-resume-20261014/evidence/ui-expanded.jpg)、[收起截图](../.qa-local/headed-resume-20261014/evidence/ui-collapsed.jpg)是实际静态画面，不证明帧率。当时逐个使用Enter打开状态详情，再Escape返回对应按钮焦点；[旧版键盘记录](../.qa-local/headed-resume-20261014/evidence/status-keyboard.json)保留了合成OneBot已连通与“模型已配置、尚未验证服务连通”的区分，不代表当前状态面板已复验。

| 清单项 | 本批实际操作与结果 | 本批仍未覆盖的范围 |
|---|---|---|
| G02 设置分区 | 实际打开13个分区，各标题/可见性正确；搜索“组件”只剩组件库，清空恢复13项。[记录](../.qa-local/headed-resume-20261014/evidence/G02-setting-sections.json)。 | 本记录仅证明分区入口与筛选恢复，不代替所有字段行为验收。 |
| G03 / G04 渠道 | 经界面新增不同端口13981/13982的Proxy A/B；A同步qa-chat、B同步qa-vision。[切换记录](../.qa-local/headed-resume-20261014/evidence/G03-channel-switches.json)、[持久化元数据](../.qa-local/headed-resume-20261014/evidence/G03-persisted-channel-metadata.json)、[实际界面](../.qa-local/headed-resume-20261014/evidence/G03-channels.jpg)证明三个独立渠道及主地址/模型/合成Key存在。实际主模型测试返回本地合成回复；编辑名称后取消、重开保持旧名也已实操。[取消记录](../.qa-local/headed-resume-20261014/evidence/G04-provider-cancel.json)。 | 无模型渠道清旧值、删除渠道、清Key后再保存、所有候选/模型对象与真实模型组合仍未由本批关闭。初次使用相同endpoint新增实际上是按既有合同upsert，不能算新增独立渠道。 |
| E03 schema 表单 | 未保存修改后取消、重开为初始欢迎文字；integer=2.5触发stepMismatch/valid=false，非法对象JSON显示解析错误并保持弹窗。[取消](../.qa-local/headed-resume-20261014/evidence/E03-schema-cancel.json)、[整数拒绝](../.qa-local/headed-resume-20261014/evidence/E03-schema-integer-rejected.json)、[JSON拒绝](../.qa-local/headed-resume-20261014/evidence/E03-schema-invalid-json.txt)。实际保存string、number=0.6、integer=3、boolean=false、enum=beta、object、array，再重开读回；[字段记录](../.qa-local/headed-resume-20261014/evidence/E03-schema-saved-fields.json)、[表单截图](../.qa-local/headed-resume-20261014/evidence/E03-schema-form.jpg)及[自有工具返回](../.qa-local/headed-resume-20261014/evidence/E03-schema-own-tool.json)相符，密钥仅以hasApiKey=true核对。 | secret清除后输入新值、dirty-only请求内容和其它边界未在本批执行，不能仅凭密码框存在关闭完整secret流程。 |
| E02 用户扩展生命周期 | root实际打开用户扩展信任确认并取消，再启用确认；ui.panel经宿主允许及后续确认后，自有面板可用。[信任确认截图](../.qa-local/headed-resume-20261014/evidence/E02-trust-confirm.jpg)和后述面板是限定证据。随后实际停用，最终[脱敏状态](../.qa-local/headed-resume-20261014/evidence/E02-disabled-tool-and-panel-withdrawn.json)为enabled/loaded/available=false，ownTools=[]、ownPanels=[]。 | 文件/任务/订阅撤销、全部授权组合和配置唯一开关的完整持久化仍未由本批闭合；该扩展没有进程或网络权限。 |
| E09 用户面板 | 真实用户iframe读取该扩展自己的保存结果，输出仅业务字段与hasApiKey布尔值。[脱敏读回](../.qa-local/headed-resume-20261014/evidence/E09-schema-panel-sanitized.json)、[实际面板](../.qa-local/headed-resume-20261014/evidence/E09-own-plugin-panel.jpg)。 | 本批为正向自有配置/RPC流程，未重新执行越权攻击；旧独立扩展的拒绝证据仍是历史批次，不能写成本轮新攻击通过。 |

### G04新发现的保存后名称不刷新：实际红、修复及实际绿

root实际保存渠道名称后弹窗关闭，服务端/磁盘已保存新名，但渠道列表与下拉仍显示旧名，需点击“重新读取”才更新：[原始有头红记录](../.qa-local/headed-resume-20261014/evidence/G04-provider-name-stale.json)。独立真实HTTP诊断确认/api/config与/api/providers均为新值；当回复提交时焦点落在渠道操作按钮，设置的读取后保护把任意#fields后代都误当作正在编辑的输入，因此只合并FormState而未更新渠道闭包及列表。普通BODY焦点阴性诊断、受控按钮焦点红/绿、API事实和源码哈希全部保留在[最终诊断记录](../.qa-local/headed-resume-20261014/G04-provider-refresh-diagnostic/G04-provider-refresh-final-result.json)。

生产只修改settings/panel.js的三处焦点保护，将“编辑中”限制为真实INPUT/SELECT/TEXTAREA或contenteditable；dirty/saving/version/保存回执revision/reset保护不变。117保留原动作和断言，新增同一真实HTTP渠道提交场景先[红](../.qa-local/headed-resume-20261014/G04-provider-refresh-diagnostic/117-provider-regression-red.log)后[绿](../.qa-local/headed-resume-20261014/G04-provider-refresh-diagnostic/117-provider-regression-green-final.log)，同时验证真实输入框仍保留同一连接节点、焦点和输入值。中间新增测试选择器#field-api-model不存在所致超时仅为驱动错误，修正为既有#model，没有新增产品修复。关联69/122/137均exit0且源码稳定：[关联结果](../.qa-local/headed-resume-20261014/G04-provider-refresh-diagnostic/related-result.json)；137为Node DOM/RPC夹具，不冒充有头界面。

root同步修复后重新打开实际可见页面，将Proxy A改为“QA Resume Proxy A 已复测”并保存；没有点击手动刷新，列表与渠道下拉自动出现新名：[实际绿记录](../.qa-local/headed-resume-20261014/evidence/G04-provider-refresh-headed-green.json)、[实际绿截图](../.qa-local/headed-resume-20261014/evidence/G04-provider-refresh-green.jpg)。冻结settings哈希BFBCC5C9A6DF1B3F71B9BA75316445CAF74119A712B8F4A51D60D7B5ABD7669F，117哈希69EDC424820B310B10DCD1CE7E4F27BDBF630E9FAA2AEB81C9011E6D576D01ED。指定缺陷关闭，不把局部修复写成整行CRUD通过。

### 鉴权重载诊断与证据层级

实际IAB首次几何记录20:20:53Z至修后20:52:44Z跨31分51秒，超过浏览器凭据30分钟有效期。独立普通Chromium同服务器bootstrap及连续两次reload均HTTP200、凭据正确、九导航/SSE在线，源未改；过期session、fresh tab及sessionStorage不可用的受控边界可复现清除URL令牌后reload401。[首次只读诊断](../.qa-local/headed-resume-20261014/G04-auth-reload-diagnostic/result-1791924893812.json)、[补充TTL边界诊断](../.qa-local/headed-resume-20261014/G04-auth-reload-diagnostic/result-1791925014094.json)均errors=[]。未捕获实际IAB重载前的缓存成功时间，TTL是合理解释而不是已证明的具体失效原因；不将这次401直接判为产品鉴权bug，也未改鉴权源码。

紧凑UI首批9/10和后续12项原批次11/12、exit1的历史结果保留：[首批](../.qa-local/compact-workspace-20261013/focused-result.json)、[12项原批次](../.qa-local/compact-workspace-20261013/final-focused-result.json)。110/141的目标滚动/字体/绘制同步和95的固定拦截/真实轮询提交屏障修后分别有独立通过，95为5次1秒+2次15秒共7/7，移除revision保护反证仍红：[95最终证据](../.qa-local/compact-workspace-20261013/95-final-repair/result.json)。因此该UI冻结阶段12项有效定向检查完成，不能改写原批次exit0；之后G04新设置修复仅有117与69/122/137定向及实际有头复验，没有重跑全部12项或整个M3。

本批不修改186行清单状态：仍为**4通过、90部分通过、1失败C10、89条件不足、1待测E17、1打包延期**。上述已有partial行补充了新实操子项，未据此升整行通过；C09图片投稿合同、C10登录验证码合同、E17真实两scope撤权/重授及旧listing/旧闭包代际保护、真实QQ/外部模型条件继续保留。原最简备份和全部历史失败证据未改，本代理仅记录文档与静态核对，没有UI/API/服务或行为测试操作。

### 同批后续：备注、印象取消、人设模板与运行会话阅读

root实际将group:10001成员20001的备注改为“QA 小林 · 续测备注”，重新读取仍保留；20002的原印象仍显示“负责记录本地功能验收结果”。[N05重读记录](../.qa-local/headed-resume-20261014/evidence/N05-note-edit-reload.txt)、[实际截图](../.qa-local/headed-resume-20261014/evidence/N05-note-edit.jpg)只证明本次编辑/重读及旁侧成员可见原印象，不代替空串清除、其它聊天同QQ或全局提示词隔离。N04印象编辑取消：root在编辑20001印象时输入未提交marker后取消，再打开仍为原来两条：[取消后原值](../.qa-local/headed-resume-20261014/evidence/N06-impression-edit-cancel.txt)，没有提交或清除印象。证据文件仍沿用当时误标的N06前缀，实际清单映射为N04/F-100；本批没有新增N06群成员列表结论，历史真正N06记录不改。

G11实际新建并使用“QA 续测人设模板”，role为QA_ROLE_RESUME隔离验收角色；打开删除确认后取消，重新读取仍有模板和当前role。[实际状态](../.qa-local/headed-resume-20261014/evidence/G11-persona-create-use-delete-cancel.json)、[删除确认截图](../.qa-local/headed-resume-20261014/evidence/G11-persona-delete-confirm.jpg)。此处只有删除确认/取消，没有最终删除；不得以模板仍在证明删除已完成。

root通过本地合成刺激创建真实新会话mv75ygm9-7bab64c5，运行中20:59:17Z实际选择、关闭自动跟随并展开用户提示词；其中已经包含应用后的QA_ROLE_RESUME及续测备注作为已读消息发送者。[运行中记录](../.qa-local/headed-resume-20261014/evidence/S05-same-session-before.json)。会话20:59:21Z自然成为“未回复”，finish工具结束、0条发送；20:59:57Z界面仍同一会话ID、follow=false且用户提示词保持展开：[终态后记录](../.qa-local/headed-resume-20261014/evidence/S05-same-session-after.json)。S05该“选择/展开不被同会话终态刷新破坏”子项实际通过，两次scrollTop=0，不能当作非零阅读位置已验证。

首次S12未提交草稿截图发生在上述会话终态之后，验收时序不足：[无效时序记录](../.qa-local/headed-resume-20261014/evidence/S12-first-draft-timing-not-valid.json)明确validForTerminalRetention=false，保留而不计成功。root随后设置本地60秒slow、预设finish工具并创建另一真实会话mv760adm-8f3cbfa6；[控制记录](../.qa-local/headed-resume-20261014/evidence/S05-JSON-S12-draft-controls.json)、[终态前JSON阅读](../.qa-local/headed-resume-20261014/evidence/S05-json-reading-before.json)显示21:00:54Z仍running/endedAt=null、follow=false、JSON模式/scrollTop469；同时[终态前草稿](../.qa-local/headed-resume-20261014/evidence/S12-draft-before-terminal.json)已存在。

这次60000ms延迟碰到配置的请求超时/多层重试边界，并非单次60秒请求直接成功。root在21:04:26Z仅把本地夹具的未来请求延迟改为250ms，slow模式和预设finish工具保持不变，已经开始等待的请求仍用原60秒延迟：[恢复控制记录](../.qa-local/headed-resume-20261014/evidence/S05-S12-future-delay-recovery.json)。随后真实工具finish使同一会话在21:05:24.490Z自然成为noreply；没有人为写入终态，也不是超时重试全部用尽场景。此控制变化完整保留，不能把结果写成“原60000ms单次成功”或完整超时策略已验。

root在21:05:34Z实际读到同一ID、JSON模式、follow=false、scrollTop469全部保持、sent=0：[终态后JSON阅读](../.qa-local/headed-resume-20261014/evidence/S05-json-reading-after.json)。群发测试弹窗仍open、未提交草稿QA-HEAD-RESUME-S12-UNSENT-DRAFT-VALID及四目标勾选[true,false,false,false]与21:00:54Z一致：[终态后草稿](../.qa-local/headed-resume-20261014/evidence/S12-draft-after-terminal.json)、[实际截图](../.qa-local/headed-resume-20261014/evidence/S12-draft-after-terminal.jpg)。[发送核对](../.qa-local/headed-resume-20261014/evidence/S12-no-send-after-terminal.json)为draftSends=0，会话自身也sent=0。S05非零JSON阅读位置与S12弹窗/未提交草稿在该真实同会话终态刷新期间保留的指定子项通过；原首次无效记录、超时/重试和控制恢复均不隐藏。S05/S12整行继续partial，其它竞态/功能条件及186行统计保持不变。

### G07 / G08新增实际子项与当前统计

以上4通过/90部分通过等计数是首批续测冻结点；随后root在同一独立合成副本实际补测G07/G08，并按限定覆盖将两行从条件不足改为部分通过，不覆盖商业模型/供应商方言等真实外部条件。

G07 root经界面新增两个备选模型并使用上移调整顺序，保存JSON为Proxy B/qa-vision、Proxy A/qa-chat：[排序保存](../.qa-local/headed-resume-20261014/evidence/G07-fallback-order-saved.json)。再移除B候选并保存，仅A/qa-chat保留：[移除保存](../.qa-local/headed-resume-20261014/evidence/G07-fallback-remove-saved.json)。将当前主模型设置为B/qa-fail后，用[本地合成@入站](../.qa-local/headed-resume-20261014/evidence/G07-fallback-trigger.json)触发真实应用运行；实际模型HTTP记录为qa-fail三次503，再qa-chat一次200，最终会话mv769bak-b882c834为A的providerId/model=qa-chat、calls=4、sent=0。root实际选择该会话读到4调用/qa-chat及13981地址：[请求与恢复记录](../.qa-local/headed-resume-20261014/evidence/G07-fallback-actual-requests-and-restored.json)、[有头详情](../.qa-local/headed-resume-20261014/evidence/G07-fallback-headed-detail.txt)、[截图](../.qa-local/headed-resume-20261014/evidence/G07-fallback-headed.jpg)。随后经界面恢复主B/qa-vision与fallback=[]。此处证明候选新增/排序/移除以及主模型真实合成HTTP故障后降到一个候选的指定链路；全部候选耗尽、其它错误类别、无故障不降级及商业模型尚未由此验收。

G08 root经界面保存temperature=0.35、maxRounds=2、timeoutMs=5000、thinkingMode=on、effort=low、budget=128，再[合成@入站](../.qa-local/headed-resume-20261014/evidence/G08-parameter-trigger.json)触发实际应用模型请求。[配置及实际请求](../.qa-local/headed-resume-20261014/evidence/G08-actual-parameter-request.json)显示qa-vision/stream=false/tool_choice=auto/temperature=0.35、HTTP200；真实finish工具结束会话mv76bp80-adf15b87为noreply/1调用/0发送：[有头详情](../.qa-local/headed-resume-20261014/evidence/G08-parameters-headed-detail.txt)、[截图](../.qa-local/headed-resume-20261014/evidence/G08-parameters-headed.jpg)。该模型是neutral合成模型，本次请求没有证实特定供应商thinking方言及优先级，也没有完整验证maxRounds/timeout边界。六参数之后已通过GUI恢复[原值](../.qa-local/headed-resume-20261014/evidence/G08-original-parameters.json)0.8/6/60000/auto/空effort/0，并有[恢复控件记录](../.qa-local/headed-resume-20261014/evidence/G08-restored-parameters.json)。

当前186行更新为**4通过、92部分通过、1失败C10、87条件不足、1待测E17、1打包延期**；97行已有覆盖/尝试（4+92+1），不是97行全部通过。旧90部分/89条件是前一冻结点，保留历史不改写。root负责清单行状态，本代理只记录这三份文档/静态核对，没有改生产、测试、清单或操作GUI/API/服务；未新完整回归、未打包、未触真实数据。

### G11出厂全文应用与G12同步缺陷修复后的实际验收

G11 root实际使用出厂“小鲸鱼”人设，角色textarea内容6225字符，与生产assets/personas/xiaojingyu.txt经trimEnd后的全文逐字一致，当前管理员规则保留；随后GUI重新使用QA续测模板恢复角色与规则。[全文核对](../.qa-local/headed-resume-20261014/evidence/G11-builtin-role-fulltext.json)为matchesCanonical=true、actualCharacters/canonicalCharacters均6225。只证明出厂全文应用没有截断，删除仍只做确认/取消，不计最终删除。

G12 root使用真实Home/PageUp/End键操作0/10/20/50/90/100边界，档位摘要改变正确，但独立概率输入框停在旧值：例如50摘要43%而框为0，90/100已4档但框仍43。[初始边界红](../.qa-local/headed-resume-20261014/evidence/G12-slider-initial-boundaries-before-fix.json)、[红记录](../.qa-local/headed-resume-20261014/evidence/G12-slider-probability-stale-red.json)、[红截图](../.qa-local/headed-resume-20261014/evidence/G12-slider-probability-red.jpg)全部保留。生产最小修复为先创建概率输入框，再在renderResponse.update中同步派生值；概率框自身正在编辑时保留草稿，未制造事件/递归/额外保存。档位换算、逆映射、slider唯一配置写入、0.1步长、自动保存与dirty/saving/version/revision/reset及此前G04真实输入焦点保护均不变：[最终修复记录](../.qa-local/headed-resume-20261014/G12-response-probability-diagnostic/G12-response-probability-final-result.json)。

69保留全部旧动作/断言，新即时50→43检查精准[先红](../.qa-local/headed-resume-20261014/G12-response-probability-diagnostic/69-probability-red.log)后完整[绿](../.qa-local/headed-resume-20261014/G12-response-probability-diagnostic/69-probability-green.log)，并验证逆向输入、真实保存、真实SSE期间同一输入节点的64草稿保护；关联117/137均exit0且sourceStable=true：[关联记录](../.qa-local/headed-resume-20261014/G12-response-probability-diagnostic/related-result.json)。137为Node DOM/RPC夹具，此处不把自动SSE/草稿检查冒充有头同一动作。最新settings/panel.js哈希AF88C16847F1D5DA51CB5B6964062E9BA47F461141599F6AABDE98F3319C5111，69哈希D85A6A8FD6B0BD0DD2F7060B169F38D6A0B383CA5C36BD0DB787E2C299EF0377，117仍69EDC424820B310B10DCD1CE7E4F27BDBF630E9FAA2AEB81C9011E6D576D01ED。

root同步并重载实际可见页面后，立即仍可鉴权成功；重新按六个真实键盘边界实操，UI及保存结果在[有头六边界绿](../.qa-local/headed-resume-20261014/evidence/G12-slider-six-boundaries-headed-green.json)：0/10→1档、20→2档，UI概率均0；50→3档43%；90/100→4档100%。后端0/10/20的randomPercent仍按既有合同为10，50为43、90/100为100；低档不使用3档的骰子概率，不能写成所有UI概率都等于后端randomPercent，也没有改后端既有换算。

初次fill/Tab或输入后Tab只得到框内50、slider仍100，尚未提交原生change：[未提交观察](../.qa-local/headed-resume-20261014/evidence/G12-probability-reverse-initial-not-committed.json)，该尝试不算绿，也不新增产品故障。随后实际数字ArrowUp/ArrowDown再鼠标保存提交change，概率50→slider55/3档50%，保存后backend=55/3/50：[反向提交绿](../.qa-local/headed-resume-20261014/evidence/G12-probability-reverse-headed-green.json)、[绿截图](../.qa-local/headed-resume-20261014/evidence/G12-response-probability-green.jpg)。最后GUI恢复原100/4档100%：[恢复记录](../.qa-local/headed-resume-20261014/evidence/G12-response-restored.json)。G12只关闭本地六边界/双向控件同步与持久化子项，关键词、unifiedTier/historyCount/分群、真实群响应和骰子次数等仍未完整验收。

root据上述实际覆盖将G12由条件不足补部分通过；当前**186=4通过、93部分通过、1失败C10、86条件不足、1待测E17、1延期**，98行已有覆盖/尝试（4+93+1），不是98行全部通过。前一92部分/87条件保持历史，未声称新完整M3或UI12项全套又执行。

E17后续代际测试材料只准备在fixtures/e17-proposal，未应用到活插件/未授予权限/未启动MCP/未进行GUI或API动作；[最终静态审计](../.qa-local/headed-resume-20261014/fixtures/e17-proposal/final-review-manifest.json)明确preparedOnly=true/executed=false/appliedToActivePlugin=false/startedMcpServers=0/permissionChanges=0，生产factory提取保持原样、活插件源码未变、四个不同脚本语法检查完成。准备完成不算MCP生命周期通过，实际PID/撤权重授/旧listing/旧闭包行为仍待有头执行。该材料未改变本节统计；本代理仅写文档与静态核对，真实数据/安装包未动。

### E16全新节点直接首次保存非空数组

root实际保存前[配置快照](../.qa-local/headed-resume-20261014/evidence/E16-before-first-nonempty-save.json)为skills['qa-resume-mcp']节点不存在、hasServers=false；不是此前旧批先保存空数组的同一场景。GUI直接填写[固定本地Echo条目的非空servers数组](../.qa-local/headed-resume-20261014/fixtures/mcp-servers-first-save.json)并保存，从未先保存[]。重开表单后读回与原数组逐项一致、长度1，firstSaveWasNonempty=true/matches=true：[实际读回](../.qa-local/headed-resume-20261014/evidence/E16-first-nonempty-array-headed-readback.json)、[实际截图](../.qa-local/headed-resume-20261014/evidence/E16-first-nonempty-array.jpg)。

随后[实际存储/运行状态](../.qa-local/headed-resume-20261014/evidence/E16-saved-but-inactive.json)为storedServerCount=1、enabled/loaded/active=false、toolIds=[]；本次只保存配置，没有启用、授予进程/连接权限或启动MCP。E16“全新配置直接首次非空保存及重读”指定子项关闭，不能扩大成此次新process.initialize、列工具/Echo调用、进程回收或E17撤权重授通过。旧批已实际stdio的证据仍保留自己的范围与前置步骤，E17新proposal仍prepared/未应用/未授权。

当前统计仍**186=4通过/93部分通过/1失败C10/86条件不足/1待测E17/1延期**，98为已覆盖/尝试而非98全部通过；E16原已partial，本子项不另增加整行数。root负责清单说明更新，本代理只补文档与静态核对，未操作GUI/API/服务、未改生产/测试，未打包或触真实数据。

### 本轮交接状态

root最后保留了实际可见会话选中及收起侧栏的[交接截图](../.qa-local/headed-resume-20261014/evidence/ui-final-headed-session.jpg)，浏览器已做Handoff标记。待处理模型请求为0后，将合成对端控制恢复normal/delayMs15000/toolCallnull：[恢复记录](../.qa-local/headed-resume-20261014/evidence/fixture-controls-restored-for-handoff.json)。交接时主fixture helper41324、Electron22756仍运行，控制台15667可供接续。

最后只读核对发现原代理helper35532已退出、13981/13982连接拒绝；退出原因未证明，不归为产品bug。原helper及描述记录保留，root启动固定回环恢复helper50436/session91077，继续同两端口只转发到固定15666，不记录请求头/正文或修改应用配置：[恢复描述](../.qa-local/headed-resume-20261014/evidence/provider-local-proxies-recovered.json)。[最终快照及健康记录](../.qa-local/headed-resume-20261014/evidence/final-snapshot-and-proxy-health.json)在21:27:56Z核对30个外侧初始快照文件sha全部不变、mismatches=[]，两代理/models均200且各4个模型。这里只恢复QA辅助服务，不是MCP授权或启动；E17仍prepared/未applied/未granted。交接不增加功能结论，186计数保持4/93/1/86/1/1，未新增UI业务修改或打包。

### 2026-10-14 当前合成副本限定授权已收到，继续删除与配置续测

用户已明确答复“允许，仅在该合成副本”：范围只包含`.qa-local/headed-resume-20261014/fixture/data`中的测试渠道、人设、记忆、合成密钥删除/清空，以及已核对的固定本地Echo扩展的`proc.exec`、`mcp.connect`授予、撤销和恢复，不包含真实数据或公开投稿。此前的待答状态现为历史，不能再据此要求同范围重复确认。root接续时先保存了[操作前业务快照及hash](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/pre-approved-snapshot.json)，没有重新seed；外侧初始快照继续保留。受限启动先出现Electron FATAL pipe拒绝访问，随后在正式本地进程权限下启动helper50136/Electron48012（session62490），固定代理helper54516（session94218）保持13981/13982→15666。该启动约束不是新增产品断言失败。

| 清单项 | 已实际执行的新增子项 | 证据和仍保留的限制 |
|---|---|---|
| G05 渠道密钥与当前渠道删除 | 在Proxy B编辑弹窗清除合成Key，再在同一旧弹窗修改名称并保存，Key仍为空；随后实际删除当前B，主渠道、地址、模型控件均清空，列表仅原qa-local和Proxy A。root之后选择qa-local恢复测试基线。 | [操作前Key存在/hash](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G05-keys-before.json)、[清除后同弹窗保存UI](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G05-cleared-then-dialog-saved.txt)、[保存后磁盘](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G05-cleared-then-save-disk.json)明确currentKeyCleared=true/otherKeysUnchanged=true；[删除后UI](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G05-current-provider-deleted-ui.json)/[截图](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G05-current-provider-deleted.jpg)证明三项空值。其它两Key在清除/保存阶段hash不变；删除后的独立磁盘hash核对尚待补充，不能把前一阶段的hash直接移作删后证据。 |
| G11 当前自定义模板实际删除 | root实际确认删除“QA 续测人设模板”，重读后列表仅出厂“小鲸鱼”，当前QA_ROLE_RESUME角色和管理员规则仍保留。 | [删除后重读](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G11-custom-template-deleted-role-retained.json)、[截图](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G11-template-deleted.jpg)。这次已实际删除，区别于上一批的确认/取消；此前出厂全文6225字符核对仍为独立子项。 |
| E03 secret及dirty-only并发保护 | 先清合成secret，自有工具返回hasApiKey=false；主页面旧弹窗保持ratio=0.6，仅修改greeting和输入新secret；第二个可见页面通过GUI只将ratio改为0.7并保存；回主旧弹窗保存后工具返回ratio=0.7、新greeting、hasApiKey=true。 | [清除后工具](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E03-schema-secret-cleared-tool.json)、[两个实际弹窗及工具结果](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E03-dirty-only-concurrent-dialog-and-secret-new.json)、[实际截图](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E03-schema-dirty-only.jpg)。该可见并发行为证明未改ratio没有被旧弹窗0.6覆盖，不声称抓取了全部HTTP请求体；新secret仅核存在布尔值，不记录密钥明文。 |
| E03 数值/类型拒绝与停用 | number=-0.1得到rangeUnderflow/valid=false，labels填写{}后显示“设置 labels 类型不正确”；root最后停用该schema扩展。 | [数值拒绝](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E03-number-bounds-rejected.json)、[数组形状拒绝](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E03-array-object-shape-rejected.txt)。结合上一批integer/非法JSON等记录只关闭各指定边界，不扩大为任意schema/全部生命周期验收。 |

E17已将审核过的七个文件应用到该副本的**未激活**qa-resume-mcp插件，旧源码备份保留：[应用记录与hash](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-reviewed-candidate-applied.json)明确onlyIsolatedPlugin=true、permissionsGrantedByThisScript=false、pluginActivatedByThisScript=false。这修订了上一批“尚未applied”的当前状态，但截至本节仍无实际MCP授予/初始化/Echo/PID回收/旧listing或旧闭包结果，不能记E17通过。记忆慢速/错误/草稿及实际删除也尚待root后续证据。本次仅增加已执行子项，清单与统计暂保持**186=4通过/93部分通过/1失败C10/86条件不足/1待测E17/1延期**，98是覆盖/尝试而非98通过；本代理只写三份文档并静态核对，未操作GUI/API/服务或改生产/测试/fixtures。

### 同批磁盘补核与单成员整理时的未提交草稿

上节待补的G05删后磁盘证据现已取得：[删后核对及恢复](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G05-after-delete-disk-and-restored.json)明确B deletedAbsent=true/deletedKeyAbsent=true、其它两Key hash保持、当前已恢复qa-local/qa-chat/15666地址。此为删除后的独立核对，与早先清Key/保存阶段分开。E03[最终脱敏磁盘核对](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E03-final-disk-redacted.json)另证明新合成secret逐字匹配而不输出明文、其它字段未变、ratio=0.7及新greeting持久化。

N07 root实际单独重新整理group:10001成员20001；[整理前六档hash](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N07-memory-before-hashes.json)与[成功后差异](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N07-single-memory-success-hash-delta.json)证明只有group_10001/20001.json变化，其它五档hash不变，包括同QQ在group10002/private20001的档案；[有头详情](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N07-single-memory-success-detail.txt)显示整理完成及更新印象。只关闭该单成员成功/隔离子项，不代替整聊批量队列或全部错误策略。

同一次慢速整理尚未结束时，root实际打开成员编辑弹窗并输入未提交草稿QA_APPROVED_N08_UNSAVED_DRAFT；[终态前](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N08-slow-memory-draft-before.json)整理中1、草稿及编辑标题已在。[完成后](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N08-slow-memory-draft-after.json)整理中0，草稿逐字保持、openDialogs=1，[截图](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N08-memory-draft-retained.jpg)归档；成功后磁盘记录unsavedDraftAbsent=true，草稿没有写入档案。N08该慢速单成员完成时保护未提交弹窗/草稿子项实际通过；跨聊天切换当前只有before，错误503/批量和实际删除暂无本节完成证据，不提前记通过。统计暂仍4/93/1/86/1/1，清单状态等待root统一判定。

### 记忆跨聊天阅读、503保留及印象编辑补证

N08跨聊天补验随后完成：旧group10001成员仍在慢速整理时，root已实际选择group10002，[终态前](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N08-cross-chat-before-terminal.json)为group10002详情/整理中1；[旧任务完成后](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N08-cross-chat-after-terminal.json)整理中0，[实际正文](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N08-cross-chat-after-terminal-body.txt)仍为group10002，20001两条原事实及20002原事实保持。该后台旧任务完成未抢走当前聊天详情的指定子项通过，补齐上一段当时只有before的限制。

N07/N08另实际受控单成员503错误：[开始](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N07-error-start.json)整理中1且整理按钮禁用；[结束UI](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N07-error-completed-ui.json)显示目标成员及模型HTTP503明细、整理中0、按钮恢复。操作前[六档hash](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N07-error-before-hashes.json)与[失败后核对](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N07-error-after-hashes.json)allUnchanged=true；目标原印象与其它五档均未改变。这只证明一次单成员全失败保留和可见错误/恢复，不是整聊批量部分失败明细、全部多成员失败或真实商业模型/网络掉线验收。

N05实际清空20001备注后，[有效磁盘核对](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N05-cleared-note-disk.json)member20001NoteAbsentOrEmpty=true、member20002Unchanged=true。记录明确invalidPriorParserExcluded=true；此前错误解析尝试不计结果，也不能凭友好显示名判断独立note字段仍存。N04 root实际保存两条marker印象并刷新，再保存单条marker并刷新：[两条读回](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N04-multiple-facts-saved-reloaded.json)、[单条读回](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N04-single-fact-saved-reloaded.json)均实际出现对应内容，20002原事实仍在。单成员及整聊天实际删除尚待后续证据，本节不先计通过；整行统计继续等待root统一判定，未新全量或安装包打包。

N04后续删除已实际完成：在本次[删除前磁盘基线](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N04-before-delete-disk.json)之后，root实际删除group10001的20001，刷新后[该聊天只剩20002/一条原事实](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N04-member-deleted-ui.json)；再确认清空group10002整聊记忆，刷新后[目录为0成员/0印象](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N04-chat-memory-deleted-ui.json)。[删后磁盘](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N04-after-approved-deletions-disk.json)证明目标三个业务档不存在、另三个档案hash保持，remainingBusinessFiles=3；[实际截图](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N04-approved-memory-deletions.jpg)归档。UI仍有四个聊天目录，其中group10002空目录是正常目录索引，不要求目录条目消失才判数据清空。本次单成员/整聊删除及其它三档隔离子项通过，更新上一段待补状态；N05错误大小写解析的[原始记录](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N05-cleared-note-disk-invalid-parser.json)独立保留，其两个null投影不能用作有效备注字段结论。仍未自行修改清单与统计。

N04两次实际确认文本另以[后补文字记录](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/N04-observed-confirmations-record.json)归档：单成员为“删除 QA 小林 · 续测备注 的成员印象？”，整聊为“确认清空此聊天的记忆？”，分别对应group10001/20001及group10002。来源是本轮实际CUA AX返回的root观察，**不是确认框截图**；一次跨frame定位无匹配没有执行，随后当前列表定位成功。与既有取消、单/多印象保存及精确删除隔离共同构成N04本地完整验收依据，行状态由root统一提交。

### E17实际四阶段撤权/重授、旧闭包及延迟DTO交付

root在用户已批准的本合成副本，通过真实宿主授权界面将ui.panel/proc.exec/mcp.connect设为allow并启用审核过的用户候选：[初始三授权](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-initial-three-grants.txt)。真实本地Node stdio依次执行initialize、notifications/initialized、tools/list；当前动态工具以最终ID经ctx.call/宿主registry调用Echo，不是固定工具绕过注册。原生产createMcpBridge/helpers逐字提取未改，但候选使用register:false、按代创建新factory，并在真实stdio读取完成后门控客户端DTO的交付；**不是已停止PID产生的新回复，也没有覆盖bundled默认setup的稳定mcp.tools门面**。因此root判定E17只能部分通过，不以这组候选验证宣布整个bundled撤权代际合同完整关闭。

| 阶段 | 实际结果 | 核心证据 |
|---|---|---|
| A 已连通后撤proc.exec再重授 | gen1/serial1/PID49356当前Echo成功并保存原factory工具闭包；GUI单独deny proc，service=false/工具撤回、PID停止。旧闭包明确reject、toolsCallDelta=0。重授后gen2/serial2/PID7984实际Echo成功；旧gen1仍拒绝且旧/新代传输增量都0。 | [原Echo](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-A-proc-before-echo.json)、[原闭包捕获](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-A-proc-capture-original.json)、[单独proc deny](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-A-proc-denied-dialog.txt)、[撤后旧调用](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-A-proc-revoked-old-call.json)、[旧PID停止](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-OS-A-proc-revoked.json)、[新Echo](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-A-proc-restored-echo.json)、[新代期间旧调用](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-A-proc-restored-old-call.json)、[新PID存活](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-OS-A-proc-restored.json)。 |
| B 已连通后撤mcp.connect再重授 | gen2原闭包另行保存；proc保持allow，GUI单独deny mcp，gen2/PID7984停止/工具撤回、旧调用拒绝且传输增量0。重授产生gen3/serial3/PID24528并实际Echo成功；旧gen2仍拒绝、所有代传输增量0。 | [单独mcp deny](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-B-mcp-denied-dialog.txt)、[撤后旧调用](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-B-mcp-revoked-old-call.json)、[旧PID停止](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-OS-B-mcp-revoked.json)、[新Echo](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-B-mcp-restored-echo.json)、[新代期间旧调用](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-B-mcp-restored-old-call.json)、[新PID存活](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-OS-B-mcp-restored.json)。 |
| C 持有旧listing DTO，撤proc后重授，再resolve旧DTO | gen4/PID33996真实读到qa_echo后listing-held、工具尚未注册。deny proc使旧PID停止；重授后gen5/serial4/PID55796实际Echo成功。随后resolve早已读取的旧gen4 DTO，旧connect拒绝“bridge或连接已停止”，新代current/工具serial不变、继续Echo成功，OS新活旧停。 | [真实读后held](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-C-proc-listing-held-status.json)、[旧PID停止](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-OS-C-proc-held-revoked.json)、[新Echo先成功](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-C-proc-successor-before-release.json)、[旧DTO resolve结果](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-C-proc-old-list-resolved.json)、[释放后新Echo](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-C-proc-successor-after-release.json)、[新活旧停](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-OS-C-proc-successor-after-release.json)、[实际截图](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-C-old-list-resolved-successor.jpg)。 |
| D 持有旧listing DTO，撤mcp后重授，再reject旧DTO | gen6/PID38784真实读到qa_echo后held；deny mcp使旧PID停止。重授后gen7/serial5/PID55076实际Echo成功。reject旧gen6只记录旧代QA_E17_CONTROLLED_OLD_LIST_FAILURE，新代lastError仍空、current/工具serial不变、继续Echo成功，OS新活旧停。 | [真实读后held](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-D-mcp-listing-held-status.json)、[旧PID停止](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-OS-D-mcp-held-revoked.json)、[新Echo先成功](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-D-mcp-successor-before-release.json)、[旧DTO reject结果](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-D-mcp-old-list-rejected.json)、[释放后新Echo](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-D-mcp-successor-after-release.json)、[新活旧停](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-OS-D-mcp-successor-after-release.json)、[实际截图](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-D-old-list-rejected-successor.jpg)。 |

A首次旧调用快照在异步按钮仍disabled时抓到前一步status输出，原记录已另存[invalid-stale-output](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-A-proc-revoked-old-call-invalid-stale-output.json)，明确排除；上表引用的是等待完成后的真正旧闭包reject结果。相同字符串工具ID不能单独证明代际更换，记录用generation/definitionSerial与实际PID区分。最后root实际停用候选，[UI为未加载/停用/不可用](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-final-disabled-ui.txt)，[OS只读核对](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E17-OS-final-all-stopped.json)七个Echo PID全停止、应用Electron48012仍运行；不是靠强杀Echo制造撤权成功。扩展description中的“未执行E17候选”是预置静态fixture文案，不是完成后的运行状态。四阶段成功不等于新全量回归、真实外站MCP或整个项目验收；统计仍等待root最后统一更新，本代理未执行GUI/API/服务或行为测试。

### 同批G01/G02草稿、U03六源下钻、E01筛选及K02实时主题

| 清单项 | 实际补测结果 | 范围与证据限制 |
|---|---|---|
| G02 高级未提交草稿 | 非法personaByChat JSON阻止自动保存，同时输入高级systemPromptOverride草稿；切分区、搜索筛选、折叠/再展开后两个草稿逐字保持，磁盘仍personaByChat={}、systemPromptOverride空、marker absent。 | [实际before](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G02-advanced-unsaved-before.json)、[切换筛选后](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G02-advanced-unsaved-after-switch-filter.json)、[未提交磁盘](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G02-unsubmitted-disk.json)。借非法JSON保留真正未提交状态，不混作已自动保存后的普通读回；本子项不代替全部13分区字段合同。 |
| G01 防抖前离页flush | 第二次连续真实填名字与离开Settings两动作整体566ms，小于700ms防抖；没有显式保存，随后磁盘及返回页面均为QA_G01_FAST_LEAVE_2。 | [有效动作计时](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G01-fast-leave-second-action.json)、[磁盘](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G01-fast-leave-second-disk.json)、[回页](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G01-fast-leave-second-return-ui.json)。首轮[902ms记录](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/G01-fast-leave-action.json)虽然保存成功，但不能单独证明在700ms前离开，原记录保留不计该时序通过；新子项不关闭延迟保存回复期间继续输入的全部组合。 |
| U03 六个来源逐行下钻 | 日期、模型、聊天、渠道、会话、小时六来源各实际点一行，在该子集依次切chat/model/day/hour/session/provider六次维度，再关闭详情；每组总摘要跨六维一致。 | 六份实际正文：[日期](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/U03-date-source-six-details.json)、[模型](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/U03-model-source-six-details.json)、[聊天](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/U03-chat-source-six-details.json)、[渠道](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/U03-provider-source-six-details.json)、[会话](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/U03-session-source-six-details.json)、[小时](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/U03-hour-source-six-details.json)。[汇总](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/U03-six-source-summary.json)修正日期关闭早期count=0误判：节点是隐藏，实际isVisible=false且关闭按钮不可见；原closed=false留存，不记产品失败。只验每源一行和摘要一致，峰谷拆分与全部数据组合/真实商业模型未因此关闭。 |
| E01 ID/名称/描述与重扫 | 实际搜索qa-resume-mcp、QA 首次非空、客户端旧DTO，均只显示该候选；重扫后输入值和过滤结果保持。 | [实际搜索/重扫](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/E01-plugin-id-name-description-rescan.json)inputValue为客户端旧DTO。记录中的另一个filter投影为null不等于真实输入丢失；用户失败原因/根目录逐项核对等余项仍未关闭。 |
| K02 styleMode / 对齐 / 渐变 | 实际classic→signal→flux→endfield，等待宿主及iframe data-style-mode对应后采样；endfield按钮radius0/7px切角，其余该按钮样本radius4/clipnone。center/right/left实时作用两层，预览布局依次center/flex-end/normal；gradient on/off使两层--accent-grad及按钮background-image同步改变。最后恢复endfield/left/gradient off。 | [四模式有效采样](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/K02-four-visual-language-live.json)、[对齐/渐变/恢复](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/K02-align-gradient-live-restored.json)、[最终实际截图](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/K02-endfield-restored-final.jpg)。[跨origin检查null](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/K02-four-visual-language-invalid-cross-origin-inspection.json)及[过早采样](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/K02-four-visual-language-invalid-early-read.json)分别保留排除；opaque iframe保护与尚未完成切换的采样不是产品故障。checkbox默认value=on不代表checked，最终checked=false/gradient=off。15颜色与全部角度/布局组合未因此验完，静态截图不证明帧率。 |

本节所有操作仍在授权clone/可见IAB，未触真实数据、未改生产源码或执行新全量；各子项证据与完整行结论分开，最终186统计由root下一步统一核算。

### 2026-10-14授权批严格逐行状态冻结

root已实际更新清单并[严格计数186行](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/checklist-approved-batch-statuses.json)：**8通过、92部分通过、1失败C10、84条件不足、0待测、1延期**，101行覆盖或尝试=8+92+1，占54.3%，不能写成101通过或全项目完成。N04/E03/G11/G02由部分通过升为限定本地通过；G05/N08由条件不足、E17由待测补为部分通过。N05/N07/G01/U03/E01/K02及E16/G04的新增证据只补子项，未额外增加完整通过数。

E17仍明确保留bundled稳定mcp.tools门面/同factory替换余项，G05仍保留真实商业模型前提，N08仍保留混合多成员部分失败和真实模型；C10实际认证/验证码合同失败未因本批消失，84条件不足与安装包延期继续独立记录。此前4/93/1/86/1/1等均是各自旧冻结点，不覆盖或删去其历史。最新行状态由root提交，文档代理只同步三文档及静态核对；本批没有新生产修复或全量回归，最终源码/快照/授权/进程交接核对仍待root最后证据。

### 本授权批最终只读核对与可接续状态

root[最终只读核对](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/final-approved-verification.json)现已完成：外侧初始30文件与批准前37文件快照逐hash全部不变；[生产UI67文件身份表](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/final-approved-ui-identity.json)与clone全一致，另独立electron/main.js hash也与clone一致，共68个生产UI/入口文件匹配。settings及69/117保持上轮冻结hash；候选七文件全部reviewedCandidateMatches=true，没有在已授权执行后偷偷变更候选。第一份仅UI核对的[原版本](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/final-approved-verification-ui-only.json)单独保存，不冒称它当时也核了Electron入口或七候选源。

两个QA用户扩展均enabled/loaded/active/available=false、toolIds=[]；MCP三scope恢复allow且均对应审核指纹fc082eb580cd4c388a79345134f02f70028af2646299ca89b82070f737b4deb1，**授权恢复与扩展停用分别记录**。七Echo子PID已由前述OS只读独立证明全退出；应用与专属fixture/代理留供后续测试，记录helper50136/Electron48012/proxy54516、session62490/94218、控制台15667。GUI已恢复QA小鲸鱼、qa-local/qa-chat及空高级人设覆盖；合成对端normal/delay15000/toolCallnull，不把这些运行QA辅助进程写成所有临时服务均退出。

最终实际[展开截图](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/final-shell-expanded.jpg)和[收起截图](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/final-shell-collapsed.jpg)保留，可见tab供接续。[两态对齐记录](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/final-shell-collapse-expand-alignment.json)navYHeightUnchanged/brandXYUnchanged均true：九项导航全部46px且每项y一致，徽记36×36、x12.5/y22两态完全相同，重新展开后仍一致。截图和几何不替代动效/FPS量测。最终清单保持**186=8通过/92部分通过/1失败C10/84条件不足/0待测/1延期，101已覆盖或尝试（54.3%）**；未打包、未公开操作、未新全量回归，所有旧失败/无效采样与限定范围保留。

[最新handoff](../.qa-local/headed-resume-20261014/handoff.json)已同步authorizationReceived、approvalPending=null、101覆盖/8完整通过、正常fixture、两QA停用、关键scope恢复allow及专属PID/session；可见IAB tab1/browser2实际停在会话/侧栏展开并标记Deliverable。[本轮人类授权文字及范围](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/user-authorization-received.json)独立保留，本批范围仍限定已列的渠道/人设/记忆/合成Key及固定Echo权限，不含真实数据/公开投稿，也不扩至本副本会话或聊天删除。旧等待批准的[handoff原版](../.qa-local/headed-resume-20261014/evidence/approved-run-20261014/handoff-before-approved-batch.json)作为历史归档，不再把它误当当前approvalPending。

## 2026-10-14“修复吧”后的本地源码修复与合同复核

本轮修复已证实的本地问题，继续源码/合成测试、不打包、不公开投稿、不操作真实数据。认证只用受控服务及离线验证回调，没有真实登录/注册或阿里验证码作答。以下自动回归与后续可见操作分开，不先改变186行清单状态。

| 问题与修复 | 已执行证据 | 当前限制 |
|---|---|---|
| C10认证宿主门控：登录/注册先进入宿主验证，取消/失败不认证，离页取消等待；对应密码提交成功且未继续改动才清除。验证凭据留在宿主，远端认证字段不变。 | [142原故障](../.qa-local/142-auth-before-with-counts.log)记录authPosts=1/hostCaptchaStarts=0后超时；[修后日志](../.qa-local/142-auth-after.log)完成取消/迟到回调、失败/空proof、一次提交、密码新草稿、注册确认取消、离页及非社区RPC/直接POST拒绝。最初[spawn EPERM](../.qa-local/142-auth-before.log)及另一次[正常权限产品超时](../.qa-local/142-auth-before-normal-permissions.log)分别保留。 | headless真实shell/opaque iframe/kernel，SDK固定离线替身；不证明真实验证码或外站认证，不据此将C10整行升通过。 |
| 市场认证客户端：拒绝非法输入和异常成功响应，只保存有效字符串token及有效账号；上游错误中的提交密码/返回token脱敏，失败不改合成account.json。 | 144[修前](../.qa-local/repair-market-auth-20261014/144-before.log)16/31/exit1→[修后](../.qa-local/repair-market-auth-20261014/144-after.log)47/0/exit0。[验证与hash](../.qa-local/repair-market-auth-20261014/repair-validation.json)收38的27/0、85通过及127正常权限通过；127首次spawn EPERM保留。 | 受控上游，不新增官方认证字段；真实账号、投稿、旧登录态未由此验收。 |
| N05记忆备注：记忆段原先只用持久member.name，与UI实时备注优先不一致；现在每次读取当前memberNotes。整理displayName只供模型/错误提示，持久name保留；新建取真实senderName。 | 145[修前](../.qa-local/repair-memory-notes-20261014/145-before.log)17/9/exit1→[修后输出捕获](../.qa-local/repair-memory-notes-20261014/145-after.log)26/0/exit0，[工具记录/hash](../.qa-local/repair-memory-notes-20261014/verification.json)另列13的32/0、35的12/0、82的34/0及65/M4相关通过。覆盖跨聊即时编辑/清备注、其它成员隔离、显示不写业务文件、真实异步adapter写回与新建原名。 | 自动模块/配置/适配器回归，待可见UI复验。历史已经被旧整理覆盖的原名无法可靠恢复，不猜测迁移；旧标签单独不能证明独立备注删除失败。 |

官方合同再次只读核对：[市场GET](../.qa-local/repair-market-auth-20261014/official-contract.json)04:01:49Z/HTTP200/未认证未提交及[原HTML](../.qa-local/repair-market-auth-20261014/official-skill-market.html)确认doAuth仅loginId/password，注册另含displayName，验证码用于doUpload。宿主本地门控不把proof编成官方认证字段，也不证明官方服务器验证了本地proof。

当前解释纠正历史较强表述，原文及证据按原时点保留：C09含图/引用范围来自[QA清单](headed-qa-checklist.md)；[SPEC F-221](../../dsh-spec/SPEC.md#L510)只概述金句上传，[notes10](../../dsh-spec/notes/10-ui.md#L364)列按钮函数，没有图片写schema明文。本次[官方金句GET](../.qa-local/repair-market-auth-20261014/official-holyshits-get.json)04:03:34Z/200/未认证未提交，SHA256 A5F960139F68834007C62A7155E87DEE0849144788268D6049B4A75496F2E05A；[原HTML](../.qa-local/repair-market-auth-20261014/official-holyshits.html)476只读media[].url展示、683投稿固定media:[]、704仅nickname/messages/captchaVerifyParam，仍无可信图片上传合同。含图发布缺口保留，不借展示字段、意见反馈dataURL或受控200编造写入。

K02“渐变角度”同为本项目QA/主题增强；原规格只有F-206暗/亮主题及存储约定，没有渐变角度明文。固定90度与缺独立角度控件不能记作原spec明确合同失败，其它增强及未验组合仍按各自范围保留。

metadata装载/序列化/呈现修复143、本轮可见离线实测和完整runner，等待根代理完成后另补，不提前写通过。文档维护仅汇总已执行证据，没有操作有头副本或真实数据。

### 本轮可见离线复验与第一次完整回归

根代理已用新生产源码/真实内核在原先批准的合成dataDir启动新服务，通过可见IAB实际操作：[live](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/live.json)记录helper42564、console15667、未重新seed及明确偏差——根页面加载固定离线SDK、缺入口插件仅manifest不执行代码、市场端点返回合成官方合同响应。**这一批没有Electron窗口或IPC实测声明**，不沿用上一批Electron48012进程作当前窗口证据；[修前业务快照](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/pre-repair-snapshot.json)单独保留。

| 项目 | 实际可见操作与核对 | 证据与限制 |
|---|---|---|
| E01目录与失败诊断 | 缺入口候选显示未加载/启用/不可用、用户安装、版本1.0.0，面板总错误1；明确“entry文件不存在：absent.js”，根目录为真实clone插件目录。重扫后内容一致、目录details仍展开。 | [before/after正文](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/E01-missing-entry-directory-and-rescan.json)、[可见截图](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/E01-missing-entry-visible.jpg)。结合此前kind分流、三字段搜索、正常启停和版本实测补齐该行本地明列余项；不把单一缺入口扩成所有可能故障类型。 |
| C10取消/失败/无效验证 | 可见离线验证容器出现；root实际取消、失败回调及空proof，均没有认证请求。取消后容器移除、登录注册按钮恢复；失败/无效proof显示原因。 | [验证前截图](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-before-proof-visible.jpg)、[有效取消记录](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-headed-cancel-before-auth.json)、[失败](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-headed-verification-failure.txt)、[无效proof](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-headed-invalid-proof.txt)。[敏感字段旧检查](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-headed-cancel-before-auth-invalid-secret-inspection.json)单独保留排除，CUA返回redacted使精确字符串比较无效，不记密码丢失bug。 |
| C10迟到成功、错误与本地注册 | auth延迟10秒期间实际输入下一份密码草稿，成功后字段仍非空、按钮恢复；受控错误密码/token均显示[已隐藏]；异常token响应拒绝，失败后的account文件hash保持。实际取消注册确认后再确认，完成一次本地合成注册且已提交密码清空。 | [等待中新草稿](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-headed-auth-pending-new-draft.json)、[成功后](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-headed-success-after-new-draft.json)、[截图](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-headed-auth-success.jpg)、[错误脱敏](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-headed-error-redacted.json)、[异常token](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-headed-malformed-token-rejected.txt)、[失败hash保持](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-failures-preserved-account-hash.json)、[注册](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/C10-headed-local-register-cancel-and-confirm.json)。CUA隐藏敏感值，有头只证明输入后仍非空；精确新密码保留是142自动断言，二者不混用。 |
| N05编辑备注与实际提示词 | 新建20003原名QA原名、备注A，实际改备注B；新真实内核调用合成模型的记忆段使用B、旧A absent，持久name仍原名。 | [UI改B](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/N05-headed-note-B-before-consolidation.json)、[真实模型请求投影](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/N05-actual-note-B-model-prompt.json)status200/newNoteInActualPrompt=true/oldNoteAbsent=true/storedNameOriginal=true；对端为qa-chat loopback，不是商业模型。 |
| N05整理与清备注回退 | 实际指定20003整理，印象2→1且名字不被备注覆盖；随后清备注，UI回退原名，另一实际模型记忆段使用原名、A/B均absent，持久name保留。 | [整理开始](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/N05-headed-consolidation-start.json)、[完成UI](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/N05-headed-consolidated-with-note.json)、[清后UI](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/N05-headed-note-cleared-original-name.json)、[原名截图](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/N05-headed-original-name-after-clear.jpg)、[清后真实请求投影](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/N05-actual-cleared-note-model-prompt.json)originalNameInActualPrompt/oldNotesAbsent/storedNameOriginal均true、impressions1。新建明确原名提供了可靠回退依据，不对旧档历史丢失名字猜测修复。 |

[离线认证请求状态](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/offline-auth-state.json)最终只有三次loginId/password与一次另含displayName的合成请求；auth字段没有proof。root观察的取消/失败/无效验证均在首次有效认证前，未产生请求。该客户端门控与官方服务器没有auth proof字段/验证这一事实分别记录：本地消费者缺口已修并实测，真实阿里、场景适用性和服务器认证验证仍未完成，因此C10整行不升通过；状态变更由root提交。

第一次新完整runner已执行：[原始日志](../.qa-local/repair-suite-20261014.log)M3 **111/113、M4 10/10、exit1**。142、143、144、145都在该批通过；143包含真实临时loader→HTTP的kind/description/真实目录、重扫/启停、schema密钥掩码及未声明设置不泄露，另用共享renderer及两面板测试诊断/状态/目录展开，后者是模块合成DOM而非有头浏览器。

首批两个失败随后分别修复并独立绿：80的目录展示误复用扩展ID语义属于源呈现问题，分离身份/路径；其认证driver先完成新增离线验证才继续原账号断言，原断言保留，[80定向日志](../.qa-local/80-repair-auth-driver.log)八面板通过。109诊断确认仅旧.readiness-heading选择器已删而导致css.match(null) TypeError，driver改检查现有.readiness-name与真实rail背景；生产主题未改、对比度阈值仍4.5、其它paint/icon/root-body断言及真实POST保存ack保留：[109验证](../.qa-local/repair-market-auth-20261014/109-validation.json)、[原诊断](../.qa-local/repair-market-auth-20261014/109-diagnostic-first-error.log)、[有效独立绿](../.qa-local/repair-market-auth-20261014/109-current-label-diagnostic.log)。不把driver故障当主题源故障，也不抹首批exit1。

第二完整runner session67075/repair-suite-second仍由root等待结果，截至本节不写全量通过。E01是否限定本地通过、C10失败转部分通过以及新统计均待root，不由文档代理改checklist。没有新增真实外站操作、安装包或帧率结论。

### 第二完整回归完成

第二完整runner session67075现已结束：[执行记录](../.qa-local/repair-suite-second-20261014-result.json)记录2026-10-14 04:29:37.9342884Z启动、04:37:59.8591725Z结束、**exit0**；[原始日志](../.qa-local/repair-suite-second-20261014.log#L3565)实际第3565行是“M3全部通过：113/113个测试文件”，第3603行是“M4 runner：10/10个测试文件通过”。上节等待状态属于结果到达前，当前全量已通过；首批[111/113、M4 10/10、exit1](../.qa-local/repair-suite-20261014.log#L3581)仍保留，不合并两批掩盖失败。

80的扩展身份与根目录呈现源问题确已修复，新增路径节点不再充当extension-id；认证driver完成新增离线CAPTCHA后执行原账号断言。109只修旧readiness-heading选择器的driver，真实readiness-name/rail对比度仍要求4.5，生产主题不改、其它paint/icon/root/body及真实POSTack保留。这些修复与两个原失败的性质分别记录，第二批通过不把首批改写为环境问题或从未失败。

113+10是自动回归文件数，不能替代186项有头功能清单或证明真实QQ/模型/阿里/外站、全程FPS。根代理正在提交本轮最终源/快照核对及E01/C10行状态；最终清单统计与审核记录待实际落盘后另补。未打包或公开操作。

### 本轮最终核对与交接

root已实际提交[本轮严格计数](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/repair-checklist-counts.json)：**186=9通过/92部分通过/0失败/84条件不足/0待测/1延期**。E01依据既有kind/搜索/正常状态及本轮真实目录/错误诊断/重扫展开保持升为限定本地L/X通过；C10本地登录消费者已修并复验，转部分通过，真实阿里场景、服务端auth proof验证和原生Electron仍余项。N05本轮只补可靠的新原名回退与实际提示词子项，行状态未额外升级。101=9+92、54.3%仍是覆盖/尝试，9才是限定范围完整通过数，不能把113+10自动文件算作186功能通过。

[最终只读审核](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-repair-verification.json)04:44:49Z已落盘：初始30、批准前37、修复前38文件三快照hash全保持；src56、bundled50、electron3逐文件全部匹配。UI源68中67匹配，唯一差异ui/shell/index.html为显式离线SDK注入，另多qa-local-captcha.js shim，uiDeviationExactlyOfflineSdkInjection=true，**allUiCloneMatches=false明确保留**，不能写成全部UI相同。electron源文件相同只证明源码身份，不证明本轮原生窗口/IPC已测。

既有三个成员档案hash保持、20002全局备注保持；新20003原名“QA 原名 20003”、1条印象、备注已清。合成账号已退出/accountCount0，market/Schema/MCP均停用、未加载/不活跃/不可用、toolIds[]；MCP三scope仍allow且同受审指纹，七Echo PID全退出。诊断manifest已移到副本外侧保留，最终界面12插件/加载7/错误0，健康Schema目录可见：[身份与路径各一个节点](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/E01-headed-corrected-path-identity.json)、[健康目录截图](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/E01-final-healthy-plugin-directory.jpg)、[最后可见截图](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-repair-visible.jpg)/[正文](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-repair-visible.txt)。静态画面不证明FPS。

现保留专属helper42564/proxy54516、session87811/94218及console15667供接续；旧helper50136/Electron48012均已停止、currentElectronPid=null。对端normal/15000/null、离线auth ok/0，GUI恢复QA小鲸鱼、qa-local/qa-chat、空高级覆盖；不是所有测试辅助进程已停止。[当前handoff](../.qa-local/headed-resume-20261014/handoff.json)已更新，旧[修复前handoff](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/handoff-before-repair.json)保留。

[独立只读review](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-readonly-review.json)未发现所审认证/driver范围内阻断问题，核113唯一文件各一次heading及全绿；143/145绿色来自完整日志，其生产源码不在该次认证重点独立review范围，不能扩大为全项目审计。所有历史失败/无效投影、C09图片写合同及真实QQ/模型/外站条件保留，本轮没有真实验证码作答、公开发布或安装包。

另一次[metadata独立只读审计](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-extension-readonly-review.json)覆盖loader→DTO→renderer、身份/路径语义、两面板错误汇总与诊断规则、未知插件iframe边界，未发现所审范围阻断；该次没有重跑测试或改源码/现场，143绿色仍引用已有完整日志。[文档与冻结源核对](../.qa-local/headed-resume-20261014/evidence/repair-run-20261014/final-repair-doc-links-audit.json)保存相关引用存在、25源码/测试hash冻结、限定scope diff-check通过及清单计数；根代理在文档最终落盘后重核版本，普通沙盒Git受限与正常权限只读通过分别保留，不计产品失败。

### 2026-10-14 参考已获授权的develop源码补缺：定向验证已收，整批复验待补

用户本批明确允许参考旧`develop`源码，覆盖此前“不读旧源”的约束；仅核对价格、安装/版本、迁移和金句发布的必要源文件，未读取`develop/data`、`community.key`、`debug.log`或真实登录配置/账号/令牌。价格、安装、迁移及图片发布测试仍使用独立合成文件、归档和服务。上一轮**186=9通过/92部分通过/0失败/84条件不足/0待测/1延期**与M3 **113/113**、M4 **10/10**是已冻结的历史结果；本批定向通过不能提前写成新完整回归或新有头结果，也不改写首批111/113、10/10、exit1。

| 本批实现 | 已执行证据 | 范围和未闭合条件 |
|---|---|---|
| 价格初始数据、匹配、优先级和兜底 | [146验证](../.qa-local/develop-gap-closure-20261014/price/validation.json)记录初红14通过/25失败、外源缓存红43/1，最终[46/46](../.qa-local/develop-gap-closure-20261014/price/146-final.log)exit0；关联33、39、36、106及最终83均绿，83初次全局cache零语义失败保留。真实合成历史成本29保持，新调用281、HTTP总计310。 | 内置[140条版本化历史快照](../.qa-local/develop-gap-closure-20261014/price/builtin-source.json)来自已授权旧源，版本`develop-v0.4-20261014-f605221cca8b`；不是最新官方报价或真实账单。custom、当前固定源缓存/remote、builtin及全局手动兜底统一匹配；逐模型明确零价与全局未设置cache零的既有语义分开，旧历史不重新计价。 |
| C09本地图片发布及取消链路 | 旧源`develop/ui/app/10-feedback.js:778–840`提供`media[].dataUrl`投稿模式，补齐之前仅官方GET无法证明的本地参考；[149原红](../.qa-local/develop-gap-closure-20261014/quote-before.log)因图片拒绝而失败，最终[149本地内核/HTTP绿](../.qa-local/develop-gap-closure-20261014/quote-final-limits-after.log)及[120浏览器绿](../.qa-local/develop-gap-closure-20261014/quote-browser-normal-permissions.log)分别记录。[只读review](../.qa-local/develop-gap-closure-20261014/quote-readonly-review.json)列范围与限制。 | 允许审核后的内联图片及纯图片消息，隔离原QQ/聊天ID、原始URL/文件地址及proof；最多50消息、9图片、解码累计1MiB、请求体2MiB。120是自动headless，不是本批可见IAB；最初[浏览器EPERM](../.qa-local/develop-gap-closure-20261014/quote-browser-after.log)保留，不计产品失败。官网公开POST、真实阿里及远端存储接受未测试，旧参考不证明当前远端所有图片schema均接受。 |

图片链路追加只读探针确证宿主readiness GET未携带取消信号：已取消旧任务仍占controller、重试409、POST0，[原探针](../.qa-local/develop-gap-closure-20261014/quote-preflight-readonly-probe.json)保留。修后使用无副作用publication helper，GET传signal且CAPTCHA/POST前检查取消；[最终探针](../.qa-local/develop-gap-closure-20261014/quote-preflight-final-readonly-probe.json)在旧GET未返回前即可重试，实际production bridge/helper记录新链路GET→POST、验证启动1次。该最终helper由149/只读探针验证；120绿色早于helper最后提取，本节不把旧120扩大为最后源码已整套浏览器复测。


148定向绿发生在installer最后路径/资源限制及追加未知版本门槛收尾之前，共享依赖的最终源码须由root新完整runner再次覆盖，不能仅把更新过的manifest hash当作旧测试已执行该版本。新完整runner与独立可见副本正由root准备，完整结果、现场源身份与186清单状态须等实际证据；文档代理只改三文档，不操作GUI/API/服务，不改checklist，不打包或公开投稿，不回答真实验证码。

### develop参考补缺批完整117+10与独立可见复验已完成

上节“准备/待完整与可见结果”是结果到达前的状态。新[完整执行记录](../.qa-local/develop-gap-closure-20261014/full-regression-result.json)为06:06:09.9283745Z启动、06:14:56.7891271Z结束、**exit0**；[原日志第3662行](../.qa-local/develop-gap-closure-20261014/full-regression.log#L3662)实际M3 **117/117**、第3700行M4 **10/10**。146在该完整批46/0、148为155/0，147严格门槛及149最后helper均通过，148实际重验了安装最后冻结后的共享依赖。冻结后没有修改生产源码；113+10上一整批、首批111/113+10/10 exit1和本批各定向红/环境EPERM分别保留，不改写历史。

root另启全新独立合成`headed/app`、`headed/data`，PROFILE99，helper48600、console15867；[现场描述](../.qa-local/develop-gap-closure-20261014/headed-evidence/live.json)明确真实production kernel、可见IAB，HTML只注入标注的离线SDK、固定社区端点由合成accept响应接管，**未运行Electron wrapper**。这不是此前批准副本的再seed，也没有新增原生窗口/IPC实测。可见操作结果如下：

| 已实际操作 | 结果与证据 | 限定范围 |
|---|---|---|
| 图片15预览及离线提交 | root选择合成消息15，实际预览288×144 checker图片，[预览正文](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-image-preview.txt)/[截图](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-image-preview.jpg)。[验证前状态](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-before-offline-proof.json)requests0，离线SDK模拟成功后UI显示已提交：[提交截图](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-image-accepted.jpg)/[正文](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-image-accepted.txt)。[形状及hash核对](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-image-accepted-shape-and-hash.json)requests1、exactReviewedPixels/noSourceCoordinates均true，图片753bytes、SHA256 `ed482f363a04c44eba969fa166ba007eefee84fa0fc164ac5caa995c6f72a6ef`与预览一致，原url/file空。 | [合成提交记录](../.qa-local/develop-gap-closure-20261014/headed-evidence/synthetic-publications.json)只有1条；真实内核组装审核后的图片与公开字段，没有源QQ/chatID。端点虽记录官方地址，实际由合成fetch接管，没有外网POST、真实阿里或社区服务器存储接受。 |
| 坏图16阻止、显式移除与取消 | root实际选择合成坏图16，浏览器无法解码，显示“请移除后重试”且提交disabled：[原正文](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-corrupt-blocked.txt)/[截图](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-corrupt-blocked.jpg)。实际点击移除后[正文](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-corrupt-explicitly-removed.txt)原合成正文仍在、素材标已移除、保留图片0、提交重新可用；最后取消，没有新增投稿。 | 本地错误提示/阻止/显式移除/正文保留/取消子项已实测；不把未提交的第二条正文算作发布成功，不扩大为所有图片解码或服务端清洗。 |
| 价格历史来源与当前自定义价 | root实际打开可见设置，[界面投影](../.qa-local/develop-gap-closure-20261014/headed-evidence/price-visible-projection.json)/[截图](../.qa-local/develop-gap-closure-20261014/headed-evidence/price-visible.jpg)显示当前qa-chat来自custom，in1/out2/cached0.1；合并表142条=140内置+2自定义，明确2026年9月旧源历史快照、builtin版本和未验证当前报价提示。 | remote摘要实际source=builtin、fetchedAt0；不是最新官网价格获取或真实商业账单。此次可见补验证明展示与所记录来源/优先级一致，价格变更后的真实供应商收费仍未测试。 |

版本门槛的就绪栏消费者另有真实浏览器红绿：已运行进程但版本不合格仍被显示成功，[141原红](../.qa-local/develop-gap-closure-20261014/readiness-lock-before.log)保存实际失败状态及Timeout；修正显示判断后[141绿](../.qa-local/develop-gap-closure-20261014/readiness-lock-after.log)保留geometry/真实性/details/小视口访问全部断言。该层是自动headless，区别于上表可见IAB，没有实际启动不合格QQ。完整批依据[06:06:09源码冻结](../.qa-local/develop-gap-closure-20261014/source-freeze.json)执行，不把先前阶段hash直接移作新源码已测。

本批新增结果是完整自动回归与上述限定本地可见链路，不关闭真实QQ安装、旧账号免扫码、真实验证码、商业模型或社区服务器存储。自动117+10文件不替代186功能；上一冻结9/92/0/84/0/1统计保留，最新清单说明及最终源/快照核对待root实际提交后引用。没有安装包、公开投稿或新的Electron/IPC结论。

### develop参考补缺批最终冻结与交接

[06:24:40Z最终核对](../.qa-local/develop-gap-closure-20261014/final-verification.json)已落盘：06:06:09源码冻结中的198份生产/测试指纹全部不变，纳入该批最终审核的5份主要旧源指纹也不变；这5份是指纹审核范围，不是本批只读源文件总数。新副本src58/58、bundled51/51、electron3/3、scripts/lib3/3全部匹配；UI69中68匹配，唯一index.html差异为明确离线SDK注入，另有qa-local-captcha.js，不能称全部UI源码相同或原生Electron已测。先前三份外侧快照30/37/38文件及其元数据hash全部不变，旧项目未改且真实旧凭据未读。

最终合成记录仍只有1条图片投稿，753bytes/hash与审核图一致；坏图显式移除和随后取消没有新增POST，realServerAcceptanceVerified=false。对端normal/delay15000，fresh fixture未设置toolCall（toolCallPresent=false）、未存储账号（accountCount0），market/telemetry停用，qa-local/qa-chat恢复。最初审核沿用旧副本的显式null/账号文件存在假设，纠正为真实缺省状态后审核通过；这是验证脚本的假设修正，没有改产品源码或放宽测试断言。

[本批最终计数](../.qa-local/develop-gap-closure-20261014/checklist-counts.json)在06:20:54Z严格核186=**9通过/92部分通过/0失败/84条件不足/0待测/1延期**，101覆盖或尝试/54.3%保持；本批只是补实现/子项说明，没有据本地合成测试把真实环境行升通过。[新handoff](../.qa-local/develop-gap-closure-20261014/handoff.json)记录PROFILE99、helper48600/session8539/console15867保留可见审阅，旧helper42564/proxy54516也保留；[旧handoff](../.qa-local/headed-resume-20261014/handoff.json)原位保留，不称全部辅助进程清理。[本批设计与范围](develop-reference-gap-closure.md)汇总安装、迁移、价格、图片与插件边界。真实QQ安装/免扫码、阿里及官网存储、商业模型长跑仍未闭合，没有新Electron/IPC实测、安装包、公开发布或FPS结论。

[最终独立只读审核](../.qa-local/develop-gap-closure-20261014/final-source-readonly-audit.json)另核198/198生产冻结指纹、5/5主要旧源指纹、184份应同的clone文件逐字一致（含setup），已知HTML离线偏差与QA工具省略分别记录；M3的117个声明文件每个heading恰一次、117/117与M4 10/10一致。四个本批缺口未发现新增插件旁路：安装归显式setup/default transport，迁移沿既有core入口，价格沿core例外，图片沿面板RPC→宿主proof→选定community服务；这是所审四项边界，不是全部插件规格已证明。198是明确冻结范围，不是全仓库所有文件。[两次审核假设修正](../.qa-local/develop-gap-closure-20261014/final-audit-harness-corrections.json)单独保留，生产/测试均未改。root最后回到合成群聊天、选择0/金句模式关/无验证对话框，[交接画面](../.qa-local/develop-gap-closure-20261014/headed-evidence/final-visible-chat.jpg)保留可查。


## 2026-10-15 全功能续批：真实本地结果及当前边界

186行逐行重数：**10通过、96部分通过、2失败、77条件不足、0待测、1延期**。通过或部分通过106行（57.0%）；连同两失败行，已实际尝试108行（58.1%）。10行只表示各自明示范围全部完成，不代表106或108行全通过。P01/P06对应同一个真实QQ隔离缺口的两条规格。

本批保留独立合成data/PROFILE，未制作安装包、未真实QQ登录/商业模型或社区外站投稿。真实QQ运行曾暴露子进程默认RoamingQQ隔离失败，当前fail-closed保护已阻止再次启动，独立运行功能仍未恢复。界面验收与自动回归分开记录；A16/tools修后操作为可见IAB，不冒充原生桌面弹窗验收。

本批由root操作可见界面、独立代理只读核证。既有原生H07/G16/ZIP操作按各自记录标明；新A16/tools和S04修后操作明确是IAB有头。72188为独立QA Electron/kernel，原wrapper固定PROFILE99/15967/合成desktop/data；下列界面测试不因后端是Electron便称原生UI。

- **发送与连接**：[H07/H06独立核对](../.qa-local/all-acceptance-20261014/evidence/native-send-verification.json)实际45秒合成发送，16.096秒后且完成前输入新草稿，busy禁用，成功仅清本次、1请求/1self；retcode1200失败可见且保草稿、恢复按钮，无成功self。[G16热切HTTP](../.qa-local/all-acceptance-20261014/evidence/G16-native-hot-http-verification.json)15969→15966保存后不重启kernel，新端1动作/1self、旧标记请求0。真实QQ送达、WS/令牌全组合仍未验。
- **分页、保存及SSE恢复**：[S02可见21检查](../.qa-local/all-acceptance-20261014/fixtures/session-pagination/headed-s02-verification.json)独立IAB15977实际305条，100→300→305无重复/遗漏，bucket44/error76/group:10001=102/组合3/空0/复位及同选中detail保持，限定189源/零用量历史副本。[G01](../.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/G01-headed-verification.json)旧A2响应hold6015ms不覆新B2，离页C flush67ms<700ms、重入及角色还原。[A05最终还原](../.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/A05-restoration-verification.json)两可见控制台SSE503断开/恢复、单档不重与暂停无模型/发送成立，13:40阶段已解除gate并恢复渠道/响应；这是该阶段还原，不称所有后续测试配置永未改变。
- **记忆与中止**：[N08混合整理](../.qa-local/all-acceptance-20261014/evidence/N08-headed-mixed-verification.json)20001印象2→1，20002三次503整个档案不变、另外四档不变，部分失败及按钮恢复可见；[渠道还原](../.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/N08-channel-restoration-verification.json)保留阶段证明。模型输入排序与磁盘数组顺序的核验假设已更正，不计产品新故障。[S08等待中止](../.qa-local/all-acceptance-20261014/evidence/S08-local-verdict.json)提前131.941s中止、超过原截止40.203s无session/标记模型/发送，[还原](../.qa-local/all-acceptance-20261014/evidence/S08-restoration-verification.json)raw wakeDelay100→200但effective200等效，非逐字恢复；权限等待/禁言查询/工具响应中止仍余项。
- **渠道弹窗焦点和工具提示修复**：[A16/tools独立核对](../.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/A16-tools-final-independent-verification-corrected.json)IAB实际cancel与keyboard Escape各为TEXTAREA/inside=true/save enabled，qa-a16-final-draft及继续输入准确保持；root随后取消父弹窗，较后tools UI无dialog、live/API/disk无该provider，未确认导入。工具false保存同页提示“该工具已被单独关闭”，true保存同页“当前可用”，最终overrides true及runtime enabled=true/code=ok/reason=null。只关闭这些子用例，A16全部弹窗/设置全组合仍部分；原BODY焦点红、初次observer误设available字段及JPEG扩展名/尺寸误识别均保留，[独立窄审及图像格式](../.qa-local/all-acceptance-20261014/evidence/round7-headed-independent-preparation-2026-10-14T16-49-46-127Z-73bd4c65/a16-tools-narrow-readonly-review.json)确认两张图实际JPEG1085×884、hash/像素未改。
- **双工具及OLD→FRESH展示修复**：[旧S04失败](../.qa-local/all-acceptance-20261014/evidence/two-tool-headed-independent/S04-first-live.verification.json)runner/记账已真，整体false因显示旧S08标题；源修只更新实际消耗batch标题，不改等待/abort。新[35项实际验收](../.qa-local/all-acceptance-20261014/evidence/two-tool-headed-independent-effective-day/S04-fixed-effective.verification.json)用mv8ctdi3-c7071c80/QA-S04-FIXED-20261015，2HTTP200，echo成功→expected_error明确失败→finish成功，调用ID/顺序/参数/result/raw及storage仅新增两call，noreply/send0；usage392/66/458/cache24/calls2/reasoning12，Oct15有效API0→458、disk rollover/ledger和telemetry一致。[16项OLD→FRESH独立核对](../.qa-local/all-acceptance-20261014/evidence/two-tool-headed-independent-effective-day/S04-fixed-old-fresh-transition.verification.json)旧entry26仍读历史/anchor，新27唯一triggerEntryIds及标题，同ID从OLD等待到FRESH终态。OLD创建16:58:37.851、deadline16:59:07.852、FRESH到达16:59:01.734、请求07.911，支持原30s截止未重置；只实拍OLD等待及终态，fresh-waiting命名文件其实终态，不算第二等待或running截图。跨午夜baseline已用effective API Oct15；旧Oct14磁盘字节独立留存，不将正常惰性rollover或旧helper baseline误判成产品记账bug。
- **插件安装**：[11包独立汇总](../.qa-local/all-acceptance-20261014/evidence/zip-headed-independent/approved-zip-batch-complete.summary.json)以及[最终范围复核](../.qa-local/all-acceptance-20261014/evidence/two-tool-headed-independent-effective-day/final-reviewed-zip-grade-boundaries.json)支持root将E06本行类别记“通过（本地合成范围）”。清单10＋two-tools1共11：合法flat/wrapped/skill/two-tools默认disabled；duplicate-v2保留flat v1，traversal/executable/symlink/entry越界/protected-core/oversize七类拒绝，前后无残留、core未变。flat初安装无独立before，rootUI和随后duplicate精确v1/disabled补证；无残留不是从未stage，oversize无独立traffictrace不称绝未upload。two-tools随后在明确批准无net/proc权限范围手工enable、注册恰两工具并仅在本地实际调用；E07口令/市场仍未完成，E08不因permissions=[]而获得allow/ask/deny/timeout/去重/并发路径通过。旧重复前缀文案红与154自动修复证据保留，反馈持久性修后现场另验。
- **价格**：[三个明确零价实际保存](../.qa-local/all-acceptance-20261014/evidence/G24-native-zero-price-saved.json)及[临时9879取消](../.qa-local/all-acceptance-20261014/evidence/gates-headed-20261014/G24-cancel-verification.json)后live/disk qa-chat1/2/.1、qa-vision2/3/.2、global1/2/.1、official=false恢复，审查区间字节/mtime未变；没有全操作writeledger，不说整流程零写。新增ID/清除提交/全远程与真实账单仍余项。

桌面进程另有独立事实：root先正常关闭旧67840、closeToTray=false，异步退出后原锁自然释放和端口refused；[正常关闭](../.qa-local/all-acceptance-20261014/evidence/normal-native-shutdown-resume.json)与[退出核对](../.qa-local/all-acceptance-20261014/review-sync-round6/old-qa-normal-exit-verification.json)不混作托盘/真实QQ停止验证。15:51四源同步启动67036后来消失，stderr IPC/Network/cache ACL五行但stdout继续过，确切终止cause unknown。root于16:25按[restart-only实际launch](../.qa-local/all-acceptance-20261014/restart-only-67036/started-20261014-162531016-ac0cee74/launch-final.json)正常启动72188，脚本仅外侧备份stale.lock、由生产kernel回收，不手删锁、不改ACL/Windows安全、sandbox或no-sandbox；[health](../.qa-local/all-acceptance-20261014/restart-only-67036/started-20261014-162531016-ac0cee74/health-verification.json)核pid/wrapper/profile/dataDir/lock一致，20s是探测预算非全GUI稳定时长。[正常第二实例](../.qa-local/all-acceptance-20261014/evidence/restart-72188-independent/normal-activation-singleinstance-20261014T164905Z.json)73664 single-instance-denied后消失、72188仍单监听/own lock，root观察原桌面窗口恢复可见；不能取得退出码不写exit0。[opaque ID/HWND纠正](../.qa-local/all-acceptance-20261014/evidence/restart-72188-independent/sky-id-hwnd-comparison-correction-20261014T165035Z.json)单列不同命名空间，保留原数值误比较false，既有原生恢复与新IAB功能操作各有边界。

最新[第7完整自动回归](../.qa-local/all-acceptance-20261014/evidence/full-regression-round7-2026-10-14T16-16-23-745Z-80995222/final-verification.json)122/122＋10/10已结束，全366源before/after同tree9ad567943c4d42a96d524a4d7665c31ae5a42f2571b1cfeea85c3344cf58d7d1；第6轮真实121/122＋10/10/overall false保留，test83仅跨午夜fixture修正。自动文件数不替代186行，详细源码修复/红绿/冻结见[回归证据](headed-qa-regression-evidence.md)。六小时在2026-10-14T17:16:41.904Z约337min仍running/complete=false/passed=null，原55min中断unknown保留，新冻结copy未加载后续全部QQguard/UI/标题/settings修复，没有全UI满帧率/内存不增长或整规格完成的结论。背景本轮现场补验仍未计通过，安装包A02延期。

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

[R15完整真实回归](../.qa-local/all-acceptance-20261014/evidence/full-regression-round15-2026-10-15T00-14-11-600Z-f5793ba0/final-verification.json)实际00:14:11.700–00:23:55.837 UTC，M3 128/128exit0、M4 10/10exit0。374文件（src59/bundled51/ui70/electron3/scripts14/test174/package-lock2/ignore1）前后`8cca7f576cedff95f08a91b3572f855b47f619f7cbee9adf97b4ec40a1ae03f7`不变，相对R14只test108。[108真实延迟POST红绿](../.qa-local/fix-all-20261015/test108-save-synchronization-2026-10-15T00-03-44-808Z-755e781d/final-test108-synchronization-verification.json)在旧/最终两个测试上施加同一1200ms真实POST延迟：旧驱动点击后GET200但无新名而真实失败；修后等实际POST200、requestfinished、界面已保存再执行原GET与方案名断言，三个尺寸都通过，原13条assert原文保留并加磁盘持久化断言，普通108/73退出0；这是测试同步修正，不是新的产品保存修复。[R14完整127/128失败](../.qa-local/all-acceptance-20261014/evidence/full-regression-round14-2026-10-14T23-49-33-475Z-846d4f1d/final-verification.json)、[R13中断未完成](../.qa-local/fix-all-20261015/round14-lock-http-repair/r13-interrupted-primary.json)与[R12完整125/126失败](../.qa-local/all-acceptance-20261014/evidence/full-regression-round12-2026-10-14T22-56-34-560Z-6de970ee/final-verification.json)全部保留。


[启动恢复锁主证](../.qa-local/fix-all-20261015/round14-lock-http-repair/lock-repair-targeted-primary-corrected-observer.json)保留原首159驱动旧源真实两内核均ready的红，最终扩展驱动通过stale竞争、被结束的恢复claimant后恢复、4fresh启动者唯一赢家/HTTP/退出释放；最终驱动并未对旧源执行，不能说same-final-driver红绿。126/135/101/131关联退出0。[背景HTTP与备份忽略12项证明](../.qa-local/fix-all-20261015/background-upload-limit-repair-2026-10-14T23-37-35-028Z-ec62bfba/final-upload-limit-and-backup-ignore-verification.json)12项真，160同driver旧HTTP6/10→新10/10，真实3MiB两POST路径、恰8MiBPNG存盘/staticHash通过，8MiB+1图片400/无变；普通JSON2MiB、邻近path/auth/Origin/12soft/16hard保留，09 37/37、31 57/57退出0；ignore只验证固定假路径，不读实际备份数据。

Stage4原native20失败，QQ73404有7次token合格却无可见窗口，后来metadata占位未知不得叫逃逸；[Stage4限定归因](../.qa-local/q4-75c6aa6b/evidence/independent-post-stage4-20261014T223816012Z-463fce53/stage4-failure-attribution-source-and-records.json)和[Stage4原20/22](../.qa-local/q4-75c6aa6b/evidence/independent-post-stage4-20261014T223816012Z-463fce53/independent-stage4-actual-postconditions.json)+[Stage4只读4/4补证](../.qa-local/q4-75c6aa6b/evidence/independent-post-stage4-20261014T223816012Z-463fce53/escalated-own-process-and-synthetic-length-correction-20261014T223923839Z-e90418d9.json)仅界定本次清理。Stage5原native20/tool1仍失败，[Stage5原24/26](../.qa-local/q5-08702061/evidence/independent-post-stage5-20261014T233513563Z-b93fb585/independent-stage5-actual-postconditions.json)+[Stage5只读4/4](../.qa-local/q5-08702061/evidence/independent-post-stage5-20261014T233513563Z-b93fb585/own-process-and-synthetic-stage5-string-correction-20261014T233937076Z-061bd951.json)+[合并5项真值](../.qa-local/q5-08702061/evidence/independent-post-stage5-20261014T233513563Z-b93fb585/independent-stage5-post-merged-truth.json)确认2752 actualbefore/rollback/current原生权限一致、2528公共文件保持、profile/own进程清理；QQ43104同held句柄4235ms确认code`0x80000003`两次、样本身份/token有效、无可见GUI，原因unknown，不能倒推Stage4。新LowData/两份20字节合成文件保留，V1 lostmetadata未重建，仍非P01/P06通过。

Root正常关闭旧主R11 PID85660，同一held句柄exit0、进程gone/锁释放/claims0/10秒预算实际ConnectionRefused，首2秒timeoutfalse保留。[R15实际八源复制](../.qa-local/all-acceptance-20261014/evidence/final-eight-source-sync-round15-2026-10-15T00-37-39-858Z-56ae1dee/sync-result.json)已完成7修改+1新增，188core与固定8目标一致，139份关闭状态数据before/snapshot/copy-after字节完全相同；随后正常启动PID84308/profile99/15967，原启动器8c17未改，[重启独立19项语义补证](../.qa-local/all-acceptance-20261014/evidence/main-restart-r15-20261015T003804651Z-5f282fa8/independent-main-r15-semantic-supplement-1792025205520.json)全部通过，精确创建身份/端口owner/锁/claims0/boot-ready已核。业务11会话、7份记忆文件、3份消息文件、KV calls5、4背景和配置保持；六份日账仅savedAt因正常重放更新，其余记录/价格/聚合/JSON逐键一致，不能说重启后全部raw bytes相同。原17/19false及Root两次CIM/日期parse false、childCIM不可用报告原样留，用新补证追加更正。当前没有main页面/DOM/AX/HTTP读取，15967保存的browser拒绝仍待实际解除及用户回复，不以源码部署替代页面交互。OneBot15966当前未连接/30秒WS重连，独立本地替身只准备未启动，不写恢复成功。[F011新实际31项限定补证](../.qa-local/fix-all-20261015/f011-r15-native-presence-author-audit-2026-10-15T00-43-35-068Z-43c445d9/independent-f011-native-presence-limited-verification.json)支持真实native popup出现和预期held exit1，但正文AX未成功读取/谁关闭unknown，Root未click/key，不作人工确认或A10整行通过；[F012新原生限定15项补证](../.qa-local/native-renderer-fixed-r14-9226b1a5/f012/evidence/independent-f012-fixed-actual-1792024520807.json)实证held PID89204 exit0/31952ms、真实renderer crash日志与30秒观察，旧exit1/EBADF QA记录器失败保留，未改生产处理逻辑。 当前186行仍为通过11、部分通过96、失败2、条件不足76、待执行0、延期1；P01/P06是同一未完成QQ隔离缺口的两失败行，局部单测、token、清理或自制进程不能替代真实完整验收。不打包。 本轮完整自动回归通过不能代替全部剩余有头验收；本段按Root授权追加，不执行新GUI/源改/打包；主页面与剩余真实联调继续待验。


本轮当前状态（2026-10-15T00:53:35.660Z）以上述R15终态与实际部署/重启为准，覆盖此前历史段落中的“R12/R13/R14尚运行”“主QA仍加载R11/同步待办”等旧时点表述，原历史前缀及所有red/false/incomplete证据不删不改。[Root原始时间字符串的精确身份补证](../.qa-local/all-acceptance-20261014/evidence/main-restart-r15-20261015T003804651Z-5f282fa8/root-exact-start-time-original-json-string-supplement.json)保存tickdelta0/CIM六位精度匹配，未把损失精度的旧false抹掉；[F011精确owned进程消失与锁释放补证](../.qa-local/fix-all-20261015/f011-r15-native-presence-author-audit-2026-10-15T00-43-35-068Z-43c445d9/additional-root-owned-process-absence-verification.json)只认本测试PID，无全部helper退出声明。F012只观察自有Sky窗口元数据，无DOM/AX/page/截图；F011只观察native presence/委托marker/预期exit1，正文与关闭者仍未知。A10仍部分通过，P01/P06仍失败、实际市场/商业模型前提未齐，186等级11/96/2/76/0/1不变，安装包延期。

[更新后正常第二实例的实际主证](../.qa-local/all-acceptance-20261014/evidence/single-instance-r15-20261015T005102309Z-da573a66/root-actual-single-instance.json)进一步确认同profile99/原wrapper的duplicate29144由原held句柄exit0、production日志single-instance-denied，primary84308同原StartTime保持alive；未读取页面、未观察refocus，不推广全部单实例组合或运行中数据全raw bytes不变。


本地连接恢复补记（2026-10-15T01:03:11.483Z）：此前断连/“只准备未启动”保留为原取证时点；Root现已实际一次启动独立合成peer38868，loopback15966约232ms ready，自己状态client1/connectionTotal1/self900001，主84308的00:55:50日志实际WS已连接并出现合成900001。[作者实际只读25项核验](../.qa-local/standalone-peer15966-r15-1eb90c4a/evidence/author-readonly-passive-reconnection-2026-10-15T01-00-13-905Z/independent-passive-reconnection-actual-verification.json)支持有限passive mock恢复，只有3次get_login_info探测，model/audio/chatEvents均0、无主动emit/真实QQ/外网/配置更新；配置保持仅引用Root对139关闭副本基线中配置hash的投影，不称全部运行中139文件raw bytes相同。[Root按存在至少一次的正确补证](../.qa-local/standalone-peer15966-r15-1eb90c4a/evidence/root-passive-reconnection-presence-supplement.json)保留真实3条匹配，[首“恰一条login”observer误判false](../.qa-local/standalone-peer15966-r15-1eb90c4a/evidence/root-passive-reconnection-proof.json)不覆盖。主84308与peer38868保留运行，不宣称所有helper已停；主15967保存的browser拒绝仍待用户实际解除/回复，无page/AX/HTTP绕读，本地重连不等于真实QQ/模型/媒体/UI验收。P01/P06失败、A10部分及186评级11/96/2/76/0/1保持，安装包延期。


服务恢复补记（2026-10-15T01:53:10.749Z）：[主恢复15/15](../.qa-local/all-acceptance-20261014/evidence/main-recovery-stale-r15-20261015T014656114Z-14151edd/independent-main-recovery-jsonlog-supplement-1792028972412.json)与[独立测试连接端恢复17/17](../.qa-local/standalone-peer15966-restore-5fa0bf57/evidence/author-restoration-actual-20261015T014913764Z-1a8355b2/independent-fresh-peer-restoration-verification.json)确认主57808/peer92928恢复，141快照与旧锁留存、业务保持，六日账仅savedAt变化，原14/15日志观察器false保留；[此前data协议错误观测](../.qa-local/all-acceptance-20261014/evidence/main-recovery-stale-r15-20261015T014656114Z-14151edd/root-browser-recovery-status.json)与[用户手动重开后的普通访问](../.qa-local/all-acceptance-20261014/evidence/main-recovery-stale-r15-20261015T014656114Z-14151edd/root-browser-after-user-reopen.json)分别保留，用户称看见控制台后工具仍因保存的用户权限拒绝15967，未读取页面/AX/DOM/截图/主HTTP，未完成本轮有头用例。仅本地合成被动连接成立，peer审计未独立把socket归到主PID；既有128+10回归、186评级11/96/2/76/0/1及真实QQ失败/外部前提判定不变，服务留运行、未打包。


权限阻塞核对（2026-10-15 08:25 UTC）：用户已确认个人空间及该地址“始终允许”，本地精确站点配置亦为 allow；文档所列两份本地管理策略文件不存在，但新工具会话仍在访问原地址前拒绝网络授权，具体拒绝层未明。已保存[权限不一致证据](../.qa-local/all-acceptance-20261014/evidence/browser-permission-allow-denied-20261015T082524Z.json)，不再记作用户尚未设置允许。当前374份源码无增删改，既有128＋10项自动回归结论保持；本轮未执行新的有头用例、未重启测试程序或打包，整体目标未完成。


权限诊断续记（2026-10-15 16:57，北京时间）：用户已重建精确站点记录、改为询问并完整退出重开 Codex；同一浏览器访问同一地址仍在页面访问前被授权层拒绝，具体拒绝来源未明。见[重启后诊断记录](../.qa-local/browser-permission-repair-20261015T083308251Z-edc94190/after-full-restart-denial-20261015.json)和[待用户提交的诊断说明](../.qa-local/browser-permission-repair-20261015T083308251Z-edc94190/browser-permission-feedback-20261015.txt)。本轮曾实际启动独立主测试程序81216并确认拥有15967监听；Codex重启后16:55核对原进程及监听均不存在，未取得原句柄退出记录，退出原因未知，当前未再次启动。本轮无新增有头通过，既有R15自动回归128＋10及186项评级11/96/2/76/0/1保持，未打包、未向外部提交诊断。


有头测试恢复补记（2026-10-15T09:47:24.705Z，UTC）：此前权限拒绝及服务停机记录保留为历史时点。独立主测试版已恢复，用户手动重新打开后，浏览器工具现已实际成功访问15967；按程序现有合成 token 登录后 URL 清除 token，刷新仍可认证且 SSE 已连接。本轮实际加载全部九个页签，确认单个沙箱 iframe；侧栏收放前后九行均46px且纵坐标一致，品牌图标中心不变，“工作面板09”已移除。MCP 空配置设置打开后取消，并实际热更新三次，三条后台激活日志与界面12插件/7加载/0错误相符；未启动 MCP 子进程或授予权限。社区选中图标在焦点离开导航后4.38秒内持续变化，会话未选中图标保持静止；只证明这对图标，不代表全部图标或满帧率验收。QQ“隔离未验证”诊断可开关，启动保护保持，未启动真实QQ。见[本轮实际证据](../.qa-local/all-acceptance-20261014/evidence/main-recovery-stale-r15-20261015T090954978Z-317a79e1/headed-resume-smoke.json)，原生测试版局部截图亦保存在同目录。本轮未发现需修改源码的新缺陷；R15自动回归128＋10结论保持，186条评级11/96/2/76/0/1不变，真实QQ/市场/商业模型及剩余完整生命周期用例仍待验，未打包。


状态入口与页内市场更新（2026-10-15T10:19:25.769Z，UTC）：按用户四条页面批注，模型状态直达设置“模型与渠道”；真实IAB四次点击均到正确目标且不再弹状态对话框，95/141覆盖键盘及同一设置iframe草稿保持。技能/插件页新增“已安装／在线市场”切换，目录通过可替换market.client.listCatalog能力和窄API提供；搜索/分类在本地进行，状态SSE不触发反复联网。实际只读有头预览显示200技能/277插件，语音搜索10项、媒体分类57项（仅为取证时数量）；没有真实扩展下载、安装、账号或公开发布。161有头合成回归覆盖两类市场的加载/空态/失败重试/确认取消/安装失败与惰性请求，焦点回到原安装按钮；151的真实RPC虚拟时间检查覆盖市场专用180秒预算而普通请求额度不变。附带修复HTTP退出等待空闲TCP连接：1秒完成已有响应后关闭残留连接，162旧红新绿且Node24/Electron Node20均通过。16份集成测试全绿，新161/162已纳入M3；本轮没有重跑完整M3/M4，不能把历史R15128+10当作这次新源码的全量结果。独立主QA已备份139份静止数据、同步190份core源码并正常重启，原离线wrapper未改；另开空数据只读15987预览供查看真实目录，禁止安装/账号/发布。见[本次证据](../.qa-local/market-panel-20261015/final-verification.json)与[真实目录截图](../.qa-local/market-panel-20261015/public-plugin-market.png)。186项评级11/96/2/76/0/1保持，剩余完整生命周期验收继续待办，未打包、未改远程服务器。


用量页 0.4 交互迁移（2026-10-15T10:51:55.471Z，UTC）：已读取 develop 中的旧版实现，将五指标卡、可悬停/键盘查看的柱图、时间范围切换、按天/会话/模型的整宽表格、模型展开和工具/分组明细弹窗迁入 0.5 沙箱面板。保留主题继承与声明 API；运行次数和实际模型调用分别统计，同模型按渠道拆分，历史未记渠道的总量明确未分渠道，不能据此钻取其它渠道。增量刷新保持行节点、焦点和滚动，旧异步响应与新明细失败不显示前一范围数值。163、106、80及5份相关测试通过，164最终有头回归 exit0；新163/164纳入M3，本轮未重跑完整M3/M4。主合成QA备份142份静止数据后同步191份core源码并以原离线wrapper启动100528/15967；原空数据只读15987预览也已更新并实际点击复验，未种入模拟用量。主旧进程退出已观察，退出码和最终关闭者未知；预览被exec中断exit1，旧锁由生产内核正常识别恢复，未手工删锁。配置字节保持，静止复制时数据字节一致不代表运行后所有缓存/日账原字节均不变。详见[本轮证据](../.qa-local/usage-v04-20261015/final-verification.json)。不提升真实QQ、账号或外部模型验收结论，186项11/96/2/76/0/1保持；没有打包或远程部署。
