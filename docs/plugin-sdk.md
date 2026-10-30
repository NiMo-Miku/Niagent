# v0.5 公共插件 SDK

> 2026-10-16：前端、后端、核心业务和基础服务均可通过管理员追加启动组合来替换，具体文件格式、默认组件表和验收合同见 [追加式组合规格 v2](architecture-composition.md)。本文描述普通运行时插件的窄 SDK；其权限约束不再意味着相应业务实现属于不可替换内核。市场包不会自动获得启动组合权限。

本文的公共 SDK 主体记录 2026-10-11 工作区实现，面板组件接入更新至2026-10-16。2026-10-21 新增面向 AI 的 [完整扩展参考](extension-reference.md)、[0.4 能力逐项对照](v04-extension-parity.md)及[可执行范例](../examples/extensions/README.md)，常见工具的完整参数、发送回执和离线自检以这些新文档为入口。插件通过 `setup(ctx)` 注册工具、能力、传输或面板；宿主不再向插件提供 `ctx.kernel`，工具执行上下文也不提供 registry、permissions、loader 或原始事件总线。

## 一个最小插件

用户扩展放在 `plugins/<目录>/` 或 `skills/<目录>/`，清单声明自己的配置和权限。清单中的权限是请求范围，管理员的决定绑定扩展目录及代码指纹。

```json
{
  "id": "example-search",
  "kind": "plugin",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["net.outbound"],
  "configSchema": {
    "endpoint": { "type": "string" },
    "apiKey": { "type": "string", "secret": true }
  }
}
```

```js
export default {
  setup(ctx) {
    ctx.registerTool({
      name: 'search',
      description: '查询自己的搜索服务',
      params: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      scopes: ['net.outbound'],
      async handler({ query }, execution) {
        const response = await ctx.http.fetch(ctx.config.get('endpoint'), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${ctx.config.get('apiKey') || ''}`,
          },
          body: JSON.stringify({ query }),
          signal: execution.signal,
        });
        if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
        return { ok: true, result: await response.json() };
      },
    });
  },
};
```

用户工具最终 ID 为 `<插件id>__<工具短id>`（标识 sanitize 并限长）；已有 `{id, execute}` 格式继续有效，但原生 `execute` 与 `handler` 都是 `(args, execution)` 顺序，不是 0.4 的 `(ctx, args)`。`registerTool` 返回最终 ID。只有面板客户端的 `ctx.call` 能调用本插件拥有的工具，并复用参数、可用性和权限检查；setup 的 SDK 没有 `ctx.call`。`ctx.log` 是 `info/warn/error/debug` 对象，执行上下文用 setup 闭包访问它。

## 生命周期和基础接口

| 接口 | 行为 |
|---|---|
| `ctx.config.get(key)` / `all()` | 读取自身 `configSchema` 字段及设置；插件自身可读取自己的密钥。面板配置 RPC 使用脱敏 DTO。 |
| `ctx.config.onChange(fn)` | 收到自身 schema 的配置快照；停用、热更、卸载时撤销订阅。 |
| `ctx.storage` | 插件自己的持久化命名空间。 |
| `ctx.scheduler.every/at` | 定时任务归属本插件，停止时回收。 |
| `ctx.http.fetch(url, options)` | 受 `net.outbound`、实例、指纹及取消信号控制；返回标准 Fetch 风格 Response，支持 `text/json/arrayBuffer/status/ok/headers`。 |
| `ctx.send(chatKey, segments, options)` | 受 `qq.send` 控制，经宿主真实发送队列。 |
| `ctx.lifecycle.signal` | 插件实例停止时中止。 |
| `ctx.lifecycle.onStop(fn)` | 注册清理函数，返回可手动撤销的 disposer。 |
| `ctx.ui.panel.register({id,title,entry,size})` | 异步请求 `ui.panel`，仅允许自身 `ui/` 内相对 HTML；返回 `{id,dispose}`。 |
| `ctx.registerCapability(name, provider, options)` | 注册本插件拥有的能力，停止时撤销；`options.default` 声明默认回退。 |
| `ctx.capability(name, ...args)` / `hasCapability(name)` | 消费能力；函数提供者会以参数调用，对象能力提供受控方法。 |

HTTP、发送及用户能力方法在授权等待和执行阶段都检查身份；撤权、源码指纹改变或实例停止会取消在途操作并拒绝旧结果。调用者的 `signal` 与实例取消共同生效。MCP 子进程句柄只暴露 `request/notify/stop`，按调用插件拥有，清理不会停止别的插件的连接。

这些约束针对宿主 API。Node 动态 import 本身不是进程沙箱，插件仍应来自管理员认可的代码来源。

默认插件的额外 host binding 同时检查实际 bundled 域、具名默认 ID、facet 和方法。用户扩展即使采用相同显示名称或声明 `hostConfig`，也不会获得默认插件权限；全局业务对象没有打包成可遍历的 `host.services`。

## 公开能力面

| 能力 | 方法范围 |
|---|---|
| `host.config` | `get/onChange`；具名默认插件还可在获准配置段内 `update`。 |
| `host.environment` | 普通插件只读版本及 profile；具名默认服务按需要获得 appRoot/dataDir。 |
| `data.messages` | `recent/findByMid/updateByMid/listChats`。 |
| `data.memory` | 印象查询、添加、删除及明确的成员/档案操作。 |
| `data.sessions` | 会话创建、更新、完成及明确的查询方法。 |
| `data.reminders` / `data.stickers` | 提醒及表情的明确数据方法，发送或外部操作另外检查相应权限。 |
| `core.send` | `sendTextBatch/sendImage/sendSticker/sendSegments/poke`。 |
| `transport.actions` | 明确的聊天、成员、媒体、转发、表情及发送动作；不提供原始 client 或任意协议调用。 |
| `media.reader` | `image/imageParts/probe/framesAvailable`。 |
| `web.search` | `search/fetchPage/lockState`。 |
| `llm.client` | `complete`；宿主解析配置中的渠道与凭据，不接收任意凭据或端点替换。 |
| `market.client` | `listCatalog/listAccounts/login/logout/publish/install`。`listCatalog({kind:'skill'\|'plugin'})` 返回公开目录、分类及条目；`install({id,kind})` 只能安装实时目录中的已审核条目，不接受口令，不再公开 `verify` 方法。目录读取只需 `net.outbound`；账号读取、认证、发布与安装分别检查相应数据读取、网络及全局写入权限。 |
| `community.client` | 屏蔽名单、文字金句与反馈的明确业务方法；不提供生命周期控制。 |
| `memory.consolidate` | 函数调用或对象的 `consolidate`；需要消费插件的网络、记忆/会话读取及 `fs.outsideNamespace` 权限。 |
| `process.mcp` | `startServer/stopAll/redactError`；不提供原生 child。 |
| `extensions.state` | `isActive/isEnabled`；具名 media-service 可只读 `videoFrames()` 的 `{enabled,frames}`，保留旧视频帧设置。 |
| `host.feedback` | 只通过 `report(payload)` 提交反馈。 |

完整的方法白名单和权限映射在 `src/kernel/sdk-services.js`。普通用户插件的方法按 scope 异步授权，并复制、脱敏结果；默认插件只有具名方法绑定保留必要的同步行为。数据读取不会把底层仓对象交给插件，工具执行上下文中的 send/store/memory/transport 等也是这些 facade。

`mcp.service`、`reminders.service`、`telemetry.service` 仅由宿主管理，SDK 消费会被明确拒绝；市场、社区与记忆整理的业务入口也不提供 `create/start/stop`。调用业务方法需要消费插件自己的授权，不能借默认提供者的权限。默认服务内部的 HTTP 同样受消费者的取消约束；宿主自行创建、启动和停止的后台服务保留独立生命周期。第三方自定义能力仍使用双方约定的接口。

`llm.client.complete` 的 `onRequest` 只收到模型及公开端点、渠道、超时元信息，不含模型密钥、令牌或请求头。MCP `onError` 只收到 `category/fatal`。回调调用前检查消费者授权和实例状态，停止后的诊断不会调用旧消费者。

`hostConfig` 不能由用户清单提权。宿主仅对 bundled 域中明确的默认 ID 与其允许配置段取交集；普通插件的 `host.config` 仍只有自身设置。搜索插件可读取自己搜索域的密钥，voice 插件读取自己的 `ctx.config.apiKey`；全局模型密钥、控制台令牌、原生进程环境和无关配置不会传入公共快照。

## 替换默认服务

默认 OneBot、媒体读取、记忆整理、搜索、市场、社区、遥测、提醒及模型方言的业务实现由相应 bundled 插件拥有。MCP 默认进程适配器由 mcp-bridge 拥有。原 src 导入路径保留兼容 exports，不再成为额外的生产业务实例。

MCP 的 setup 只注册 `process.mcp`、`mcp.tools` 和 managed `mcp.service`；配置中的服务器在插件激活后的服务 start 中初始化。这避免在 loading 阶段消费自身尚未激活的默认能力，也让启动权限、取消和停止归属服务宿主。

每次已授权的服务 start 都建立独立桥实例；撤权、停用或替换会清掉本代工具及连接，再授权时创建新桥。setup 发布的 `mcp.tools` 对象保持稳定，方法委托当前代；旧工具闭包及迟到的 `tools/list` 不能删除新代工具或停止新连接。生命周期、deactivate 与服务 stop 的重复清理保持幂等。

已批准的核心边界继续保留：数据仓、运行状态机、配置、发送排队、统计持久化和 A-6 价格机制仍在 core。插件消费这些模块的公开方法，核心拥有数据一致性和生命周期；这不是需要继续迁出的插件化缺口。

```js
export default {
  setup(ctx) {
    ctx.registerTransport({
      id: 'my-onebot',
      create(host) {
        // host.signal/current 和归一化 onEvent/onStatus 由宿主提供。
        return {
          id: 'my-onebot',
          selfId: '123456',
          actions: { /* 实现需要支持的公开动作 */ },
          start() { /* 建立连接并报告状态 */ },
          stop() { /* 关闭本实例拥有的连接和进程 */ },
          send(chatKey, segments, options) { /* 返回确认后的消息 ID */ },
          toPlatformSegments(segments) { /* 唯一协议段转换 */ },
        };
      },
    });
  },
};
```

传输插件至少声明 `net.outbound`；需要启动外部进程的实现另外声明 `proc.exec`。`registerTransport` 注册 managed `transport.provider`。通用 managed 服务使用 `{lifecycle:true}`；宿主调用对象的 `create/start/stop`，管理取消和停止错误。内部 completion token 仅供宿主检查旧结果，不提供给 SDK。

单提供者能力自动优先使用已启用的非默认实现，同优先级保留注册顺序；默认实现负责回退，管理员可以 pin 一个可选 owner。多提供者按声明顺序协作，消费方使用转换链、全体 guard 或 `claim/claimAsync`；其中认领型消费由第一位认领者处理。default 和 pin 不重排协作链，控制台及 API 禁止对多提供者单选，但可清除旧指定。

控制台技能/插件页通过 `PUT /api/skills/capabilities/provider` 保存指定或恢复自动。managed 提供者分别展示已选和实际运行状态：活跃的备用 owner 可选，服务未授权或启动失败时不显示可用。停用、撤权、热更、删除及同对象重新注册都会撤销旧实例。已取得的公共 facade 在每次调用时解析当前服务，旧代回调不能重新发布状态；默认服务停用后，能力缺失会明确报错。

## 面板设计系统与动效（2026-10-13）

新页面仍由插件注册，UI 主题没有增加宿主权限。插件在自身 `ui/` 目录放入 HTML、JS 和图片，再通过 `ctx.ui.panel.register({ id, title, entry: 'index.html' })` 注册；清单必须声明 `ui.panel`，由管理员授权。停用、卸载或热重载后，宿主撤销该代面板与资产地址。

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>扩展面板</title>
  <link rel="stylesheet" href="/panels/common.css">
  <link rel="stylesheet" href="panel.css">
</head>
<body>
  <main>
    <header class="head"><h2>扩展面板</h2></header>
    <section class="card" data-motion="mount">
      <button id="run" type="button">运行</button>
      <pre id="result" class="pre" aria-live="polite"></pre>
    </section>
  </main>
  <script type="module" src="panel.js"></script>
</body>
</html>
```

```js
import { ctx } from '/panels/panel-client.js';
import '/panels/theme.js';
import { installMotion } from '/panels/motion.js';
import { createIcon } from '/panels/icons.js';

const disposeMotion = installMotion();
const run = document.querySelector('#run');
run.prepend(createIcon('extension'));
run.addEventListener('click', async () => {
  document.querySelector('#result').textContent = JSON.stringify(
    await ctx.call('my-plugin__run', {}), null, 2,
  );
});
// installMotion also disposes itself on pagehide. Call disposeMotion() when
// explicitly retiring this document's motion installation.
```

`common.css` 引入 `design-system.css`，后者引入 `icon-motion.css`，提供颜色、间距、字体、按钮、输入框、页签、表格和弹窗等公共规则。插件可以引用这些规则，也可以使用自己的局部 CSS。颜色从 `--bg`、`--surface`、`--text`、`--muted`、`--accent`、`--accent-ink`、`--line` 和 `--good/--warn/--bad` 读取；间距使用 `--sp-*`，圆角使用 `--r-*`。共享卡片角标需要卡片自身的定位包含块；局部响应式样式取消 sticky 时保留 `position: relative`，不要将带角标的卡片改为 static。

图标由 `createIcon(name, { size = 20 })` 生成，使用 `currentColor`；文字标签和可访问名称仍由调用方提供。39款共享图标均为SVG，描边与少量实心部件随控件颜色同步换色，品牌和存档也遵循同一规则。CSS空状态使用同形的本地archive.svg alpha遮罩。名称仅匹配内置白名单和有限别名；`extension` 对应 `plugins`，未知插件名称回退为 `panel`，元信息不能插入 SVG 代码。接口、名称和尺寸参数保持兼容，`ICON_NAMES` 导出可用名称。

`createIcon()` 为当前文档懒安装一次 `icon-motion.js`。只有选中控件的 `aria-current="page"`、`aria-selected="true"` 或显式 `data-icon-active="true"` 驱动持续语义动画；hover和普通键盘焦点不启动。取消选择后回到静止；后台、减少动效、隐藏、禁用、移除或pagehide时取消，恢复可见时仍选中的控件继续播放。窗口失焦和焦点进入iframe不取消当前可见页签。模块使用单文档清理observer和浏览器原生动画，JS没有逐帧任务。若插件需要显式清理，可导入 `/panels/icon-motion.js` 的 `installIconMotion(doc = document)`，返回幂等disposer，与重复安装及 `createIcon` 共用实例。现行约定按2026-10-13用户澄清改为“选中页签”，取代此前hover/键盘焦点循环；不增加插件权限或RPC，未使用模块的旧图标不受强制改写。

每个控件最多4个活动图标，每个图标最多3条效果，整个文档最多8个活动图标和24条效果。图形按实际用途区分：会话是执行路线、记忆是成员印象、技能是工具、插件是插接模块、设置是参数滑轨、社区是扩展交换。语义动效使用transform/opacity并跟随currentColor，以部件的 `data-icon-role` 寻址；普通循环采用动作、归位、短暂停顿。选中变化、CSS显隐和文档可见性通过相关事件与mutation处理，检查不在逐帧任务中执行。普通操作按钮默认静止；插件选择状态由其自身界面维护，宿主不会在其他插件文档代设选中项。

主题沿用已有握手和事件链路：配置是保存来源，shell 应用方案，在面板 ready 时发送当前主题，随后发送 `theme` 变更事件；`panel-client.js` 将已校验的事件转为文档内 `qq-theme`，`theme.js` 只写当前 iframe 的 CSS 变量及布局属性。用户面板收到 `publicPanelTheme()` 的纯视觉 DTO：仅明确列出的色值与布局，不含背景图片地址、私有方案名称、配置对象、密钥或未知字段。opaque-origin 面板不读取宿主存储、不访问宿主 DOM。用户面板只能消费主题，不能调用 bundled 专用的 `theme.apply` 或借此修改全局配置。旧面板和未知面板不会被强行注入样式或脚本，未引用设计系统的页面继续使用自己的界面。

视觉 DTO 的色值字段为 `bg/surface/surface2/surface3/text/muted/faint/accent/accent2/line/lineSoft/good/warn/bad/accentInk`，只接受合法十六进制颜色；布局字段为有界 `radius/density`、枚举 `sidebar/btnAlign/styleMode` 与布尔 `gradient`，`preset` 只保留公开内置值。坏值回落或收敛，背景 URL/路径及自定义方案名称不传给用户 iframe。共享主题短时关闭颜色 transition，保留 transform/opacity，两次实际帧回调后恢复，并清理后台/减少动效/pagehide状态；回调次数不表示固定毫秒时限。

`installMotion(root = document)` 为当前文档或子树安装动效，返回幂等清理函数。它使用短时、可取消的 opacity/transform 动画，没有常驻帧循环或永久 `will-change`；首屏与列表追加每批最多 12 项，替换式轮询不重播全部行。原生弹窗打开、页签显露、详情切换与 details 展开保持原有提交、取消和焦点行为，关闭不等待动画。`animateMount(node, options)` 可用于插件自己的局部入口。`data-motion="mount"` 声明入口，`data-motion="append"` 声明追加项，`data-motion="view"` 声明详情区域，`data-motion="off"` 排除整个子树。系统减少动效偏好、文档转入后台、节点移除和页面卸载会取消在途动画；隐藏元素和关闭的 dialog 不会闪现。

销毁后重建的临时弹窗可自愿导入 `/panels/dialog-lifecycle.js`，对每个实例调用一次 `installDisposableDialog(dialog, { onClosed, canClose })`。它仅包装这个实例的 close，保留原生 returnValue，显式close/ESC同步移除并调用 `onClosed`；重复关闭及迟到旧close事件不会再清理一次，已被preventDefault的cancel继续受尊重。返回对象提供 `close(...args)`、`dispose()` 及只读 `closed`；`canClose` 返回false时阻止普通close/ESC，`dispose`用于明确销毁。插件自己的读取取消和敏感输入释放应在自己的 `onClosed` 中处理。模块不修改HTMLDialogElement.prototype、不导入panel-client或存储/API，也不适用于需要反复复用的静态dialog。

内置通用临时弹窗有9处接入；宿主令牌窗口另同步清空两个输入并保留忙态关闭保护，诊断窗口关闭时abort三个renderer信号及隔离旧结果。反馈和金句使用专用同步幂等清理，旧发布finally/媒体结果不能影响新预览；它们的成功/取消、CAPTCHA与本地图片安全断言继续保留。静态app confirm和public-captcha不由该模块改写，发送、保存和授权合同不变。120/121/124/125/127/138/140另有真实Chromium证据，137的八组是实际模块在Node DOM/RPC夹具下的验证。前两完整回归106/107、第三和第四107/108均保留失败与Windows符号链接子项skip；第四109的失败是保存ACK前读取backend，不能称为select断言。其原断言保留并修正等待；独立旧GET产品回退通过设置面板的输入版本/成功回执次序保护修复，force跨回执仅一次受保护新读取，109/69/117/122/136/137定向6/6。117中间fresh超时是新增driver把BODY首参当期望文字，回调参数修正后严格fresh条件通过，未扩大RPC或修改保存队列。修复后本地UI66+main1共67份逐hash一致，备份344/344，另有有头IAB普通保存/重载检查；受控延迟仍以117独立验证。

正式第五全量已exit0：M3 108/108、M4 10/10，151条含嵌套runner的实际子退出记录均status0，与摘要互核一致；M0–M2不能与M3相加。runtime186/tests154/docs17起止逐文件差异0，未捕获异常/超时0、文件/Node skip0，50号Windows符号链接子项skip1仍保留。首次QA preload路径解析启动失败的testedFiles为0、未启动runner，独立保存，不混为完整产品失败。本文最终结果补写发生在该全量结束后，源码/测试仍冻结。阶段日志、实际可见检查及全部性能限制见设计记录；原186项逐功能验收暂停、外部业务缺口不因本地回归关闭，不表示全部规格完成或全程满帧。

这些共享资源不是全局样式注入接口：插件 CSS/JS 仍只在自己的 iframe 执行。实际宿主继续使用 `sandbox="allow-scripts"`、一次性 nonce、source、面板 ID 和加载代际校验；用户 RPC 仍限 `ctx.call`、`ctx.getConfig`、`ctx.notify`。主题和动效模块没有扩大 API allowlist、暴露控制台令牌或新增插件间路由，保持 DSH-ARCH §9.2 与 §9.4 的边界。

本机控制台自动认证属于宿主：`/api/console/bootstrap`不允许通过面板RPC代理，普通插件不能获取令牌。自动恢复只作用于宿主共享连接，不改变工具/面板权限；候选令牌验证客户端也不会自动替换其凭据。默认实现与来源合同见[本机认证](local-console-auth.md)。

宿主现在合并面板清单刷新通知并复用未变的导航控件；同一面板只有在定义身份相同、桥已握手且未关闭、iframe仍连接时复用。插件定义或加载代际变化仍撤销旧桥/资产并创建新面板，过期刷新结果不替换新清单；这没有改变插件工具调用、配置保存或授权合同。共享图标、主题 DTO 与宿主去重的实际验证和测量限制见 [暖黑黄绿 UI 设计记录](theme-color-design.md)。

宿主导航可以收起为图标栏，展开/收起偏好仅保存在宿主本地；它不改变面板定义或加载代际，不重新挂载iframe，不增加全局配置写入。插件面板的可访问名称与名称提示由当前注册标题生成，未知图标仍回退为共享panel图形；收纳状态不要求插件提供第二套界面。

宿主当前将内置页面的重复标题收起，仅保留紧凑运行控制栏与面板自己的标题。用户插件仍在控制栏中保留注册标题，避免自绘或canvas页面失去页面名称；宿主不读取iframe内容来判断标题，也不修改插件页面。`common.css` 的紧凑标题规则仅自动适用于九个内置 `body[data-panel]`；插件可在自己的body显式设置 `data-layout="compact"` 采用相同间距与标题规则，未知面板默认布局保持兼容。

OneBot 与模型配置状态属于宿主侧栏，不占插件内容区。共享名称 `status-onebot-ready/pending`、`status-model-ready/pending` 分别提供成功与未成功的两种轮廓；颜色和文字由调用方根据实际状态提供。宿主仅good使用ready，其它状态使用pending；模型ready只表示地址与模型已配置，详情明确尚未验证服务连通。这些状态控件显式 `data-icon-active="true"`，沿用已有动画预算和后台/隐藏/减少动效清理，不新增RPC或授权。

## 插件化阶段验证（UI 重做前的历史记录）

84 验证真实 SDK、动态面板、HTTP/发送权限、旧桥身份和热更新；85 验证全部既有 bundled 工具公共入口、默认替换、MCP 撤权后恢复及宿主授权/工厂/start/stop 边界；86（18/18）验证各默认服务、真实 HTTP 选择、协作顺序及服务就绪，包括异步 start 完成前不能显示运行；87（8/8）验证实际 kernel 装配、磁盘传输替换、发送队列、撤权/热更、提醒、记忆服务选择及旧视频帧配置；88（5/5）验证真实 kernel 的回调输入与事件边界；89 验证配置及数据脱敏、精确默认绑定、受控模型整理、MCP 句柄及旧代回收。80 另以真实 Chromium 验证两个面板的选择、自动回退、失败、刷新、协作链及未授权服务恢复。

这些离线验收没有代替真实 QQ 登录、收发、外部服务凭据或十个真实市场插件的实机验收，也没有关闭 `gap-closure-design.md` 中其它业务缺口。

现有安装包尚未按本轮源码重建；本文不表示新的桌面应用已经安装或发布。

此前插件化阶段源码验收：`npm test` 返回 0，M3 61/61 个测试文件、M4 10/10；`npm run smoke` 12/12，`git diff --check` 返回 0。包括该阶段的 hook/prompt/provider 输入、事件出口、多提供者顺序及 managed 服务就绪改动。原始记录在系统临时目录的 `qq-agent-pluginization-acceptance-final.log` 和 `qq-agent-pluginization-acceptance-smoke.log`。这组历史数量不代表 2026-10-13 UI 重做后的最终验证，最新界面验证见 [暖黑黄绿 UI 设计记录](theme-color-design.md)。
## 渐进删除按钮

插件面板可选择使用控制台的共享组件与危险色变量。它只控制本面板的删除交互，不扩大工具权限，也不访问宿主 DOM。

```js
import {destructiveButton} from '/panels/destructive-action.js';

card.append(destructiveButton('删除', async () => {
  await ctx.call('my-plugin.removeItem', {id: item.id});
}, {
  target: () => card,
  key: () => item.id,
  clicks: 2,
  impact: '删除这条记录。',
}));
```

页面需加载 `/panels/design-system.css`，组件使用当前 `--bad` 危险色。普通条目默认点击两次；批量清空、清除密钥、卸载等可配置 3～5 次。500 毫秒未点击后，进度按每 1500 毫秒一个满格的恒定速率线性回退，到 100% 才调用执行函数。按钮附近显示非阻塞影响说明，键盘 Enter/Space 同样计次，长按产生的重复事件不计次。切换实体时应更新 `key`；选择集合变化可调用 `bindDestructiveAction` 返回的 `reset()`，离页时可调用 `resetDestructiveActions()`。

现有按钮可用 `bindDestructiveAction(button, {action, ...options})` 接入，须移除旧的单击执行监听，避免绕过累积进度。执行中的按钮防止重复提交；失败后重新积累进度重试。该组件是界面交互，不替代后端授权或数据校验。全窗口染色仅用于内置设置页的六次“重置全部数据”，用户插件不能控制宿主染色。

进度增加使用150ms平滑过渡，回退仍遵守原500ms等待及线性速率。可见反馈使用分段刻度和逐渐增强的危险色故障块；保留影响说明，剩余点击数只供辅助阅读器读取。系统减少动画时仍须按相同次数确认。

共享按钮默认在本面板中预先捕获短暂的退出与列表补位状态。即使SSE先移除节点、执行函数随后才收到响应，也先保留不可交互且`aria-hidden`的视觉副本，成功后快速故障溶解，再让存活项缓入缓出补位；失败不主动移除对象。副本移除输入、脚本、资源、ID和事件属性，不运行自定义元素；动作、切页、后台、取消后会清理。列表重绘时，给条目设置稳定的`data-motion-key`，给会被整体重建的列表设置唯一`data-motion-list`，可让不同DOM节点仍按同一实体补位。

自绘面板也可在破坏性RPC成功后调用`destructiveRefresh(target, refresh, {container, signal})`（从`/panels/destructive-layout.js`导入），先退出再刷新。如果在共享按钮的`action`中使用此显式接口，应设置`layoutMotion:false`以免重复执行动效。纯装饰动画不会决定请求是否成功，也不改变确认阈值。
