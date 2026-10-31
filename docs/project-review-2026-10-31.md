# QQ Agent 0.5(unfinished)项目 Review

- 日期:2026-10-31
- 范围:全项目 1143 个文件约 14.3 万行(src / bundled / ui / electron / test / docs / scripts / website / build)
- 方法:5 路并行深入审查(src 核心、bundled 插件、ui+electron、docs+扩展生态、工具链+测试+网站),引用均带 file:line,可点击跳转
- 配套导航:[project-index.md](project-index.md)

---

## 1. 总评(TL;DR)

这是一套**防御性工程做得相当重、完成度已经很高**的代码库。薄内核+全插件的架构执行得很彻底:内核只提供装配缝与 52 个默认组件,传输/工具/服务/UI 全部插件化;扩展基础设施(目录指纹绑定授权、代际失效、两段闸换版、SSRF 逐跳校验、zip-slip 防护、原子写、防穿越体系)在同类个人项目中罕见地系统化。"unfinished" 主要不是核心链路的实现缺口,而是:**真实环境验收未完成、范围收缩后的遗留代码、文档权威链条断裂、以及若干值得收紧的安全默认值**。

最需要优先处理的 6 件事:①默认零 token 的鉴权默认值;②`_looksLike401` 宽泛正则误触发令牌轮换;③search-policy 允许明文 HTTP 发 Bearer Key;④usage 统计同步 IO 阻塞事件循环;⑤账号 worker 丢弃全部子进程输出 + 一条游离 rejection 即杀进程;⑥修复 README 的规格书断链或补回 `dsh-spec/`。

## 2. 规模概况

| 区域 | 规模 | 说明 |
|---|---|---|
| src/ | 121 文件 / 19,826 行 | 内核 55 + console 39 + management 14 + protocols 6 + accounts 4 + transports shim 2 |
| bundled/ | 20 目录 / 4,907 行 | 出厂插件,最大 transport-onebot 1,043 行 |
| ui/ | ~16,729 行 | shell ~5.9K + panels JS 13.2K/CSS 2.4K,原生 ESM 无构建 |
| electron/ | 4 文件 / ~750 行 | 桌面外壳 |
| test/ | 373 个 .mjs / 52,860 行 | 全项目最大区域,约 322 个已接线 |
| docs/ | 74 md + 2 mermaid + 1 json | 约 55% 体积集中在 5 个大文件 |
| website/ | ~39,104 行 | 官网只读镜像,不随包分发 |
| scripts/ + examples/ + skills/ | ~3,800 行 | 工具链、示例、出厂技能 |

## 3. 架构评价(亮点)

1. **薄内核执行彻底**。`src/kernel/kernel.js` 按固定顺序装配约 40 个命名组件,每个组件注册一次性 disposer;`overrides/` 追加式组合层(最多 64 层)支持组件 replace/wrap、具名路由、UI shell/panels/assets 替换,且有 176–179 号测试覆盖 48 种组件排列。
2. **插件宿主是全库最扎实的部分**。`plugin-loader.js`(1,194 行)实现:目录 sha256 指纹绑定权限凭据、热重载经临时目录副本绕 ESM 缓存、两段闸换版(旧实例先 deactivate、新 setup 成功才清注册、失败回滚 stale-but-working)、fs.watch 防抖+指数退避。`sdk-services.js` 对每类宿主绑定按方法粒度映射权限 scope,出参全部过脱敏。
3. **异步取消纪律突出**。全库一致的「Promise.race + cancelled promise + AbortSignal 合并 + finally 清监听」范式,大量使用 `AbortSignal.any`;未见监听器泄漏式写法。
4. **消息链路职责清晰**。ingest(三闸)→ orchestrator(唤醒状态机)→ prompt(锚点缓存)→ agent-runner(12 轮工具循环+五时序 hook)→ tools(八步执行管线)→ SendQueue(每会话串行/限频/去重/切分)→ transport(平台无关归一化)。内核代码中不出现 QQ 专有词。
5. **前端安全模型干净**。宿主+iframe sandbox(opaque origin)+postMessage JSON-RPC 五重校验;非 vendor 代码仅 1 处 innerHTML 且内容受控(`ui/panels/settings/activity-view.js:42`),其余一律 textContent;Electron 侧 `contextIsolation/sandbox/nodeIntegration:false` 配置正确,token 经 IPC 下发不进 URL,`setWindowOpenHandler` 一律 deny。
6. **测试体系真实且离线**。约 322 个真实可执行测试(非夹具堆):121 个起真内核、69 个真 Chromium e2e、164 个源码静态契约断言;全用本地 mock(ws 假 OneBot、http 假 LLM、假域名),离线可跑。
7. **安装器数据保全流程**。先备份(白名单式删除,reparse point/盘根全拒)→ 安装 → 恢复,带回执 ini,并有专门测试。

> **2026-10-31 修复更新**：P1-1～P1-8 已全部处置——①首次装载生成随机控制台令牌并持久化（显式写空串仍表示关闭鉴权）；②_looksLike401 只认 ws 升级失败的确定形态；③预设搜索渠道仅接受 https；④usage/会话档案读缓存（mtime 失效）+ 目录微缓存 + /api/sessions limit 收敛；⑤账号 worker 输出落盘工作区日志、游离 rejection 只记录；⑥热重载临时副本启动期清扫；⑦README 显式声明 dsh-spec/develop 断链；⑧出厂技能 image-generate 迁移到当前 SDK（entry 字段、execution.send、net.outbound）。P2/P3 未动。

## 4. 问题清单

### P1 — 建议尽快处理

1. **默认零 token,REST/SSE 仅靠同源校验**
   `src/kernel/config.js:110` 出厂 `server.token: ''`,而 HTTP 守卫是 `if (token && ...)`(`src/kernel/http.js:205,341,352`)——token 为空时全量 API(改配置、读消息、扩展安装)对本机任意非浏览器进程开放。仅监听回环 + `localConsoleBootstrapAllowed` 是缓解而非防护。建议:出厂生成随机 token,或空 token 时仅放行只读端点。
2. **`_looksLike401` 按错误文本匹配,误触发令牌轮换**
   `bundled/transport-onebot/client.js:341-344` 用 `/401|unauthorized|token/i` 匹配错误消息——任何消息含 "token" 的非 401 错误都会被判为鉴权失败,触发令牌候选轮换 + 5 秒延迟重连。应改用 status/code 判定。
3. **搜索 API Key 可经明文 HTTP 外发**
   `bundled/web-tools/search-policy.js:41` 的 `searchEndpoint` 允许 `http:` 协议,Key 以 `authorization: Bearer` 明文发出(同文件 :72-73)。自建内网可解释,但至少应对非 custom 渠道禁用或告警。
4. **usage/会话统计在请求路径上同步读全量档案**
   `src/console/routes.js:192-209, 264-352`(:565,:588 处 readdir+readFileSync)在每次 `/api/usage/stats|breakdown` 上同步读所有 `usage-days/*.json` 与 `sessions/*.json`——档案一大即阻塞事件循环,而消息收发共用同一循环。另 `routes.js:1171` 允许 `limit` 至 1,048,576,可一次性序列化全部会话摘要。
5. **账号 worker:输出全丢弃 + 过激退出策略**
   `src/accounts/manager.js:261` 显式 `resume()` 丢弃子进程全部 stdout/stderr("Never forward worker stdout"),子工作区内核启动失败时父侧只剩一句报错;而 `src/accounts/worker.js:127` 对 `unhandledRejection` 直接 fatal→exit(1)——一条游离 rejection 就能杀掉整个账号进程且无第一现场日志。与 `src/server.js:6-8`(只打印)策略不一致。建议:落盘到账号工作区日志 + rejection 只记录。
6. **热重载临时副本可无限泄漏**
   `src/kernel/plugin-loader.js:87` 每次装载 `mkdtempSync` 复制插件,正常路径由 dispose 清理,但进程崩溃/断电后 `data-plugin-runtime/` 下的副本树无人回收,且无启动期清扫。
7. **文档权威链条断裂**
   README 与约 8 篇迁移文档把 `../dsh-spec/`(SPEC F-001~F-223)和 `../develop/`(0.4 参考源码)定为事实来源,两者在当前盘面均不存在;`docs/v04-parity-source-index.json`(147.7KB)整体指向失效路径。「以规格书为验收依据」目前不可复核。应补回目录、内化关键规格或显式声明失效。
8. **出厂技能依赖未记载的 SDK 面**
   `skills/image-generate` 使用 `ctx.sender.sendImage` 与 `api.fetch`,而 `docs/extension-reference.md`/`plugin-sdk.md` 均未记载(后者明确写「发送改用 execution.send」);其 skill.json 也没有 `entry` 字段,靠加载器默认约定。扩展作者照文档写会漏掉这条路径。另 `src/kernel/plugin-loader.js` 中「skills/ 出厂为空」的注释已过时。

### P2 — 值得修,风险较低

9. **构造顺序隐式约束**:`src/kernel/kernel.js:402` 的 `uiAssetResolver` 闭包引用 27 行后才 `const` 声明的 `panelAdapters`(:419)。靠「listen 在 start() 才发生」躲过 TDZ,重排即炸。
10. **`kernel.js:48` 静默吞掉异步组件构造的拒绝**(`Promise.resolve(value).catch(()=>{})`),排障只能靠后续 TypeError。
11. **`media-service/reader.js:224` 无条件信任 `media.path`**:trusted 分支直接 `stat(file)` 无目录围栏(对比读图路径有 realpath 围栏 :30-39)。安全前提是 ingest 永不写入远端可控路径——跨层信任假设,应加围栏或至少注释声明。
12. **`market/client.js:133` 死代码**:8MB 检查抛错后,32MB 的 `MARKET_MAX_UNPACKED_BYTES` 分支永不可达。
13. **清单三代格式并存**:11 个 skill.json + 8 个 plugin.json + 1 个无清单;`compat-04/skill.json:6` 与 `mcp-bridge/skill.json:6` 写 `kind:"plugin"`(文件名与 kind 错位);`media-service`/`transport-onebot` 的 plugin.json 连 description 都没有;字段丰富度分裂。对扩展作者是混乱信号。
14. **`sticker-tools/skill.json:8` 声明 `sticker_note` 工具但实现不存在**(index.js 只注册 4 个)。
15. **UI 复制粘贴对**:`ui/panels/skills/panel.js` 与 `plugins/panel.js` 逐行近似,manifest 白名单整段重复;`electron/preload.js` 与 `preload.cjs` 双份维护(后者才被使用)。
16. **`settings/panel.js` 的 `render()` 约 590 行**(panel.js:761-1349),组装 11 个分区,是该面板最大维护风险。
17. **`src/kernel/llm.js:465,479` 绕过注入 log 直接 `console.warn`**,桌面场景重试/降级事件可能不可见。
18. **`chatNameCache` 只增不减**(`src/console/routes.js:417-436`),长跑缓慢增长(低危)。
19. **实例锁三处实现需人工同步**:`kernel.js:489-534` 内联锁、`instance-lock.js:23-66` 单据事务、`accounts/manager.js:40-48` 判活。
20. **token 经 URL query 接受**(`http.js:206,340,353`):为 SSE/图片妥协,有回环监听+网关剥除缓解,但代理/日志链路可能留痕;CSP 允许 `o.alicdn.com`/`kondius.cn` 脚本源与 `style-src 'unsafe-inline'`(`http.js:35-36`),受信域被攻破即影响控制台。
21. **市场账号 token 明文落盘** `data/account.json`(`bundled/market/client.js:461`);读取视图与错误信息已脱敏,落盘本身未加密。
22. **静态服务三次独立 stat 存在轻微 TOCTOU**(`http.js:292-330`),可合并为一次 open+fstat。
23. **杂项**:`query-tools/index.js:40` 把 `Infinity` 当 limit 下传;`web-tools/service.js:33-36` 实体解码不全;`voice-to-text/index.js:69-77` 同段 JSDoc 连续出现两次;`telemetry/service.js:14` 原子写临时文件名仅 pid(与 market 的 pid+random 风格不一);`orchestrator.js:496` `keywordHit` 等死变量;`provider.js:60,230,233` 直接读 `client._configurationGeneration` 私有字段。

### P3 — 结构性观察(非缺陷)

24. **大文件集中**:`console/routes.js`(1,462)、`builtin-model-prices.js`(1,238,纯数据)、`plugin-loader.js`(1,194)、`orchestrator.js`(957)、`kernel.js`(691)、`llm.js`(507)。routes.js 已拆出 30+ 控制器但主文件仍承担用量聚合(含大量 0.4 legacy 快照合并分支,:303-348,是回归薄弱区)与扩展安装多重职责。
25. **压缩书写风格断层**:`kernel.js` 后半段、`management/runtime.js`、`console/serializers.js` 大量单字母变量与超长三元链,与其余模块的高注释密度形成对比,是「行为等价 0.4、实现从零」赶工痕迹,可维护性风险集中。
26. **兼容层堆积**:7 个 2–3 行 shim(src/transports/onebot 全目录、console/mcp-adapter 等)、onebot 别名三层并存(`kernel.js:681`、`orchestrator.js:42,59`、`routes.js:367`)。按薄内核标准,`src/transports/onebot/` 空壳目录属待清理的过渡产物。
27. **范围收缩后的遗留实现**:`src/protocols/login.js`(282 行 QR 登录编排)与 `native-login-client.js`(261 行)在 2026-10-23 范围裁决后仍在维护,:140 还有「QQ 登录暂未完成」的用户可见文案——应决策删除或明确保留。

## 5. 安全专项结论

- **到位**:SSRF 逐跳 DNS 复核+私网拦截(safe-fetch 全覆盖出站);路径穿越防护成体系(静态两段式、扩展目录、组合层 contained、账号工作区、协议端 containedPath,未发现可利用穿越);原型污染防护普遍(组件名/设置键/端口值拒 `__proto__`);密钥治理(config 脱敏回传、SDK 出参与日志红action、错误信息凭据抹除);zip-slip 防护完备;无 eval/Function;child_process 仅 5 处且实参固定或白名单。
- **需收紧**:见 P1-1(默认零 token)、P1-2/3、P2-11/20/21。
- **设计立场(需持续醒目声明)**:插件不是沙箱——安装即信任,权限闸只约束宿主 API 面;捆绑插件可直接 import 内核模块(受信层)。`permissions.js:1`、`plugin-loader.js:19`、`panel-adapters.js:1` 均有声明,文档也应持续强调。

## 6. 测试体系评价

- 真实可执行,约 322/373 已接线,离线性极强;自研逐进程 runner(M0–M4 分层)+ 12 项无头冒烟;历史记录 M3 147/147、M4 10/10、冒烟 12/12(2026-10-16),最近 M3 117/117(2026-10-24)。
- 两个缺口:**约 31 个测试文件未接入任何 runner**(258–260、281–287、management-* 14 个、rules-panel-ui、session-stream-ui 等——群管引擎的测试恰在其中);**`npm test` 不含 M0–M2 内核基础套件**(01–25 号),需手动 `node test/run-m2.mjs`,易被漏跑。
- UI/e2e 类测试对运行权限与端口敏感(沙箱内 Chromium 会因 launch EPERM 失败),属环境约束非测试缺陷。

## 7. 文档体系评价

- 好的一面:废弃标注习惯好(`batch-code-install-migration` 自标已废弃、`gap-closure-design` 自标被取代);README→docs→examples 链接大多闭环;面向 AI 的扩展合同(`extension-reference.md`)是少见的高投入。
- 短板:74 篇中约 40 篇是带日期的一次性会话产物,无 archive 归置;5 个巨型文件占 55% 体积且其一(v04-parity-source-index.json)整体失效;主题重叠(reply-provider 两篇、settings 三篇、会话表现四篇);`dsh-spec`/`develop` 断链(P1-7);命名不统一(`system_design.md` 下划线、中英文混用、日期后缀格式两种)。
- 建议:把 C/D 组移入 `docs/archive/`,补一份 `docs/README.md` 做分流导航;对断链做出显式裁决。

## 8. "unfinished" 的具体落点

1. **真实环境验收 BLOCKED**(progress.md 2026-10-01 段):真实 Electron(当时依赖未装)、真实 QQ、Windows 托盘/注册表/双实例;captcha 诊断 IPC、memory consolidate provider、proactive 实际 tick/anchor 端到端、权限卡真实点击未完成。代码侧对应逻辑已实现(orchestrator.js:511-553, 720-759),缺实机背书。
2. **安装包打包按用户要求延期**,实机验收未开始(task_plan.md:41)。
3. **Electron 自动更新为 null**(`electron/main.js:667` `update: null`),update-notice 只给下载外链——桌面更新流半成品。
4. **task_plan.md:210 列出的待办**:首启引导、记忆跨页选择、手工成员+备注跨文件事务、人设模板/分会话交互等;`blocklist-raw` 并发覆盖风险记录为独立待办(task_plan.md:276)。
5. **31 个测试未接线**(§6)。
6. **范围收缩遗留**(P3-27)。
7. 2026-10-24~26 的最新实测(真实协议端包 ZIP→启动、SnowLuma 2.2.0 双真实账号接入、多账号、真实模型流式)是最近的真实环境进展,可视为部分解封。

## 9. 修复路线建议(按性价比排序)

1. **安全默认值四连**:`server.token` 出厂随机化;`_looksLike401` 改 status/code 判定;`searchEndpoint` 对非 custom 禁 `http:`;`reader.js localize` 加围栏。均为小改动。
2. **账号可观测性**:worker stdout/stderr 落账号工作区日志;`unhandledRejection` 改记录不退出;启动期清扫 `data-plugin-runtime/` 残留副本。
3. **事件循环保护**:usage/sessions 统计改异步增量聚合或缓存;`/api/sessions` 限合理上限。
4. **清单收敛**:统一 manifest 命名与 kind 语义,补齐 description,删 `sticker_note` 幽灵声明;skills/plugins 面板入口参数化合并。
5. **接线上 31 个孤儿测试**,把 M0–M2 并入 `npm test` 或文档醒目提示。
6. **文档治理**:处理 dsh-spec/develop 断链;归档一次性会话文档;把 `sender.sendImage`/`api.fetch` 写入 SDK 文档。
7. **拆解两座大文件**:routes.js 的用量聚合、kernel.js 压缩段;消除构造顺序隐式约束(kernel.js:402)。
