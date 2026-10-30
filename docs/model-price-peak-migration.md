# 模型价格与峰谷预设迁移

本页记录 0.4 → 0.5 的价格便利功能和峰谷预设迁移合同，以及 228/229 的实际验证入口。定向通过不代表完整回归通过；完整状态以单独保存的 source-frozen M3/M4 终态为准。

## 原子行为对照

旧版路径以相邻 `../develop` 源码为准。

| 原子行为 | 0.4 证据 | 0.5 默认实现 / 裁决 |
| --- | --- | --- |
| 模型名称与 ID 搜索 | `ui/app/05-memory-settings.js:647–655` 同时搜索 ID 和 provider names，名称旁显示 ID。 | `ui/panels/settings/model-price-data.js` 汇总 modelNames、模型对象 name/displayName 与全部提供商别名；保留 ID，按名称/ID/提供商搜索。同 ID 的价格仍按原全局模型键共用。 |
| 每行目录参考 | 同文件649–658从官方表匹配，名称 title 与三个输入 placeholder 显示参考单价。旧批量行没有展开 peak 数字。 | `src/console/price-update-adapters.js` 的 `reference(model)` 从未合并 custom 的目录匹配，UI独立展示目录参考与当前有效计价，提供来源/命中键及三个 placeholder。保留 DTO 的 peak 数字，未额外扩展旧批量行范围。 |
| 自定义价格与官方价区分 | 旧 `GET /api/model-prices` 提供官方表；UI 的 edits 单独存 custom。 | 现有 snapshot.prices 仍是合并目录，保持旧消费者兼容；新增 reference/quotes 明确分开，不能将合并行标成官方参考。 |
| 大批量编辑、切换/搜索保持草稿 | 同文件663–688写入整个 edits 对象，709起保存全部 edits；没有8项限制。 | `settings/model-prices.js` 的当前页面 Map 不设8项业务限制；搜索、关闭再开、失败保持全部输入。仅跨页恢复快照受有界 RAM 约束。 |
| 免费自定义价格 | 旧默认价格匹配把全0行当成未设置，可能回落官方。 | 保留0.5更准确的 custom0，包括缓存0；不恢复旧误判。未知ID仍可新增、保存并按当前实际策略计价。 |
| 清除自定义价 | 旧行按钮清除 edits[m]，保存后移除。 | 保留0.5原有两次连续点击确认；清除先改草稿，成功保存才生效。整行 CAS 防止清掉别人新写的 metadata。原83的两击与0价断言保留。 |
| 预设选项 | `ui/app/00-core.js:239–253` 两内置及有值才出现的 custom。 | `settings/peak-presets.js` 保留 workbuddy08:00–23:00、deepseek09:00–18:00，均10/100；存在 custom 时显示一个自定义槽。 |
| 应用预设 | 旧00-core257–277填时段/当前滑条草稿；旧09-community342–350决定全局或分群点目标。 | 只填当前编辑目标的四字段草稿；时段全局共享、点按目标写入；不发请求、不改变 enabled、不改变统一档位开关。显式0保留，不用旧 `||100` 改写0值。 |
| 保存 custom 不激活 | `ui/app/09-community.js:585–603` 只POST store.peakSchedule.custom。 | `console.peakSchedule` 的 kind=custom 只保存四字段到 custom；当前 enabled、active 时段/点保持原值。 |
| 保存当前活跃方案 | 旧09-community511–547整体替换两张群映射，523还把基础 contextSliderPos 耦合到低谷点。 | 当前目标字段 CAS 后同步合并最新配置，不替换旧整表，不改无关基础滑条。当前目标保存成功后，其他目标有草稿则留窗明确提示继续保存。 |
| 关闭/失败/并发 | 旧保存失败 alert 且保留弹窗；旧映射快照写入没有字段级冲突检查。 | 400/409/500均保留草稿；409可显式对比后选择保留自己的值/采用服务器值。自身成功回执只推进提交字段，迟到回执不清新输入。 |
| 合法时段与历史坏值 | 旧 config.js 的 parseHHMM 校验与跨午夜语义。 | 运行期严格语义由226维护；229控制器规范输入，接受9:00/09:00、trim、合法跨午夜及等时段。历史坏时段不阻止仅关闭 enabled=false 或清除分群点覆盖。 |

## 默认模块和真实消费链

- `src/console/price-update-adapters.js`：默认 `runtime.priceUpdates` 工厂，提供 resolve/reference/snapshot/refresh。
- `src/console/model-price-settings.js`：默认 `console.modelPrices` 工厂 `createModelPriceController({config,publish})`。
- `src/console/peak-schedule.js`：默认 `console.peakSchedule` 工厂 `createPeakScheduleController({config,publish})`。
- `ui/panels/settings/model-prices.js`、`model-price-data.js`、`peak-presets.js`、`transaction-draft.js`：独立默认 UI/纯数据/草稿模块。
- `settings/panel.js` 创建编辑器并接入入口、priceDraft/peakDraft 视图状态；`spec-editors.js` 保留 editModelPrices 兼容导出。

GET `/api/model-prices` 和 POST `/api/model-prices/refresh` 把默认真实单价选择链 `priceFor → routeDeps → 所选 runtime.priceUpdates.resolve` 传入 snapshot/refresh。默认 snapshot 也通过当前 receiver 读取 resolve/reference，因此仅包装默认工厂并替换 resolve/reference 的追加模块会影响真实 GET 与实际 terminal usage-days 计价；UI 不导入默认表、不重写匹配规则。

`prices` 保持原合并目录合同。`reference` 是未合并 custom 的目录参考；`current` 是默认计价链选出的有效行。query.models 可传 JSON ID 数组，每次最多128个ID、每ID最多200字符，返回 `quotes:[{model,reference,current}]`。完全替换 snapshot/refresh 的工厂可忽略新增 options；若不提供 quotes，UI诚实显示未提供，不从另一张默认表伪造参考。未提供的方法沿用既有逐方法兼容回退。

## API、零值和事务

四个新路由都使用既有控制台鉴权；settings manifest 只声明相应 GET/PUT 能力。

### 自定义模型价格

GET `/api/model-price-overrides` 返回：

```js
{
  entries: [{id, values:{in,out,cached}, revisions:{in,out,cached}, rowRevision}],
  empty: {id:'', values:{in:null,out:null,cached:null}, revisions, rowRevision}
}
```

PUT `/api/model-price-overrides`：

```js
{changes:[{id:'example-model', patch:{in:0,cached:null}, expected:{in:'打开时摘要',cached:'打开时摘要'}}]}
// 或明确清除整行
{changes:[{id:'example-model', remove:true, expectedRow:'打开时整行摘要'}]}
```

`patch` 仅允许 in/out/cached，值为非负 finite number 或 null。null 删除该 custom 字段，**不会变成逐字段继承官方**。现有行级 custom 语义不变：缺失输入/输出按当前 normalizer 处理，缺失缓存按该行输入价计算；至少保留输入或输出。全部清除请使用整行操作。普通编辑保留未知 metadata，整行清除比较整行摘要。

显式 custom0 是免费价；单模型 cached0 也是免费缓存价。全局手填缓存0仍按现有保守规则使用输入价，未知官方模型仍可落到手填 fallback。自定义完整行不会继承官方 peak 档。

每次 PUT 接受1–64项，同一请求先验证全部字段摘要，再同步读取最新映射并原子提交一次 config.update。不同模型/不同字段可合并；同字段陈旧摘要409。未改变内容不落盘、不发事件。摘要比较的是内容，包括字段是否存在，而非时间戳。

### 峰谷方案

GET `/api/peak-schedule?target=global` 或 `target=group:数字`：

```js
{target, active:{values:{enabled,start,end,peak,valley},revisions},
 custom:{values:{start,end,peak,valley},revisions}, global, groups}
```

PUT `/api/peak-schedule`：

```js
{target:'global', kind:'active', patch:{start:'22:00',end:'06:00',peak:0,valley:100}, expected:{/* 四字段打开时摘要 */}}
{target:'group:123', kind:'active', patch:{peak:null}, expected:{peak:'打开时摘要'}}
{target:'global', kind:'custom', patch:{start:'22:00',end:'06:00',peak:0,valley:100}, expected:{/* custom四字段摘要 */}}
```

active 的 enabled 仅全局目标可写且必须布尔值；start/end 始终全局共享。peak/valley为0–100，只有 group active 可 null，含义是删除该点及旧别名并跟随全局，保留同行未知 metadata。custom不接受null。custom的保存不启用、不改变当前方案。

验证400、陈旧摘要409、写盘错误500。两个控制器都没有在比较/合并/写入之间 await；写盘成功前不更新运行内存、不发成功事件。rename故障测试确认无部分内存/磁盘/事件变更。

## 大草稿与跨页恢复

正常编辑没有8模型/2目标上限。所有草稿保存在当前 settings 页面实例的 Map 内，失败、搜索、切换目标、Escape/关闭后重新打开不会丢当前输入。

priceDraft 的跨页快照最多8个脏模型且5200B；peakDraft最多2个脏目标且2200B，并校验宿主既有字符串/层级/节点限制。这些是**缓存约束**。超过时继续接纳当前输入，界面明确提示“当前草稿超出跨页缓存容量，输入仍保留在当前页面；请先保存再离开”。

离开时不会抛异常或发送过大快照：编辑器发送小的 `{version:1,overflow:true}` 标记（峰谷另含 current），通过正常 flush **替换**旧宿主缓存。返回后提示上次未跨页保留、旧缓存失效；不会把较早的小子集当成最新草稿恢复。若用户忽略提示直接离开，超限输入不承诺跨页保留。完整刷新、关闭窗口、重启与既有TTL到期同样不持久化 RAM 草稿。

## 64项分批、部分成功与目标边界

价格 UI 将所有脏模型分为每批64项，顺序 PUT；当前页面可继续编辑更多模型。每批成功回执只推进该批提交字段的基线，后续输入版本保持 dirty。后批失败立即停止，清楚显示已确认保存数量，其余未确认变更保持草稿。重试重新收集 dirty 项，只提交未保存/更新的内容；不能把一次批量操作宣称为跨批整体事务。

实测65项：首批64成功，第二批真实 config.rename 故障；首64保持落盘，65个输入在当前页面完整保留。剩余1项能跨页恢复，重试请求长度仅1且没有自身成功回执导致的假冲突。未确认回执的请求可能已在服务端落盘，重试遇409时需明确对比，不用 GET latest 冒充自身成功回执。

峰谷“保存”提交当前目标。其他目标仍有草稿时不关闭弹窗，明确提示切换目标继续保存；保存一个目标不会清除其他目标。时段是所有目标共享的字段，多目标同时改时段可能出现真实CAS冲突，需要显式解决；不悄悄覆盖另一目标/窗口的时段。

## 可替换模块与验收入口

可以通过单个 composition 文件选择 runtime.priceUpdates、console.modelPrices、console.peakSchedule 工厂，或只追加替换 `panels/settings/model-prices.js` / `peak-presets.js` 等 UI 资产。工厂与默认UI均通过实际消费者验证，停用追加层恢复默认实现。来源/代际改变不继承旧模块的宿主草稿；自定义整个UI面板需声明自己的视图状态合同。

正式入口：

```powershell
node test/228-model-price-reference-test.mjs --http-only
node test/229-peak-presets-test.mjs --http-only
node test/228-model-price-reference-test.mjs
node test/229-peak-presets-test.mjs
$env:QA_HEADED='1'
node test/228-model-price-reference-test.mjs
node test/229-peak-presets-test.mjs
Remove-Item Env:\QA_HEADED
```

最终定向终态：228无头/有头各8组，229各9组，均真实exit0。覆盖至少12模型及65项分批真实故障、3目标、0值、失败当前草稿保持、overflow替换旧缓存、迟到回执/报价、409明确解决、实际HTTP/disk/默认runner/usage-days和追加停用回退。所有夹具仅复制实际UI、使用空扩展根、absent迁移源、被动transport及合成 feed/version；fetch/DNS/浏览器 origin 门均生效，无真实15967、QQ、远端模型或已安装扩展。

原83完整设置浏览器链再次exit0，保留两击清除和零价全部断言；33为37/37、146为46/46、173为11/11。具体终态、原始失败说明及冻结哈希见 `.qa-local/v04-parity-20261016/finance-228/` 与 `finance-229/`。该目录是本地QA证据，不作为完整回归通过结论。

## 2026-10-19 当前价格表展示

默认设置页通过 `price-table.js` 展示所选价格适配器的原始报价结果，替换此前的 JSON 输出。表格列出模型 ID、输入、输出、缓存输入、来源和可展开说明，保留明确的 0、缓存随输入计价、高峰价、图片计费规则、内置快照日期及远程更新时间；可搜索模型 ID 或说明。当前有效报价直接来自接口的 current，前端不重算匹配或计费规则。

查看及更新共用同一表格；更新失败展示服务端的可用缓存，HTTP 异常保留旧表与筛选。迟到读取不能覆盖后续更新，设置重建或离开时撤销旧展示实例。窄屏只在表格区域内横向滚动。264 无头、有头各 3 组检查通过，249、228、146 相关回归通过，截图与日志保存在 `.qa-local/price-table-20261019/`。264 加入 M3，未重跑全套 M3/M4；验收使用隔离临时应用及合成价格源，没有请求真实远端价格或模型服务。

## 2026-10-19 参考价开关与当前模型报价

成本设置通过默认 `cost-view.js` 保留原控件及 FormState 绑定，将整块“使用远程价格表及内置参考价”改为原生 button/role=switch。删除可见复选框及开关状态字样；成功色/危险色描边和细内发光随既有主题变化，Enter/Space 可操作。开启时隐藏三个手填控件，显示当前模型的输入/输出/缓存价格、单位和来源；关闭恢复原输入与数值。原生配置字段仍各保留一份。

报价读取所选后端 `/api/model-prices?model=…` 的 current，保留自定义免费价、远程/内置价及未匹配时的手填回退，不在前端重做计价匹配。涉及 API 的待保存修改先显示等待状态，成功回执后读有效报价；失败不会展示未生效价格。切换模型、读取/更新价格表后刷新报价，关闭、重建或离开撤销旧回复。265 无头/有头各 3 组、249、264、244、187 均通过，截图与日志见 `.qa-local/cost-switch-20261019/`；265 加入 M3，未重跑完整套件。
