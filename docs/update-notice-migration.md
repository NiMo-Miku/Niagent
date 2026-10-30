# 更新提示的原子迁移与默认模块合同

对应旧`ui/app/11-init.js:22-23`和`10-feedback.js:648-696`，以及行为规格F-014、R-62。这里只完成版本检查交互，不代表启动引导或其它领域已对账完成。

| 原子行为 | 0.5处理 |
| --- | --- |
| 启动及每小时检查 | 宿主默认update-notice模块启动一次；每次完成后1小时再查，手动检查与自动检查共用单飞请求。浏览器和Electron加载相同宿主；不再由Electron主进程额外直接fetch固定版本源。无控制台页面的headless实例不新增UI检查任务。 |
| 后台能力消费 | 仍由认证GET/api/update-check调用所选runtime.priceUpdates.updateCheck；默认工厂现在收到真实VERSION，修复此前默认0.0.0。R-62响应和三段比较合同不变。 |
| 关闭提示 | 本文档生命周期内关闭后抑制后续自动提示；手动检查有新版时再显示。刷新文档重新检查，不把关闭状态写入配置或跨启动永久隐藏。 |
| 结果与失败 | 每个文档保存最近成功结果、独立错误、成功时间和状态revision。失败不会把旧版标成新成功，也不会丢掉已有提醒。设置显示失败及保留旧结果；自动失败不刷屏。 |
| 提醒与设置 | 设置导航徽记、桌面设置分区标记和版本说明；导航筛选/重建后标记恢复。设置初次读取状态不重复查远端，手动按钮与查看入口使用宿主窄RPC。 |
| 下载入口 | 仅提供用户点击的HTTPS链接，不自动下载、安装或启动程序；拒绝用户名/密码URL及javascript/data/file/http等协议。说明纯文本、有界，不插入远端HTML。设置“查看更新与下载”唤出宿主入口，opaque面板没有任意外链权限。 |
| 并发/退出 | 自动与多个手动检查合并。revision防旧快照覆盖/旧finally提前解锁新请求；销毁清timer和DOM，迟到结果不重新显示或调度。文档卸载不承诺撤销已经到达后台的只读请求。 |

共享范围是同一个宿主文档，不宣称多个独立浏览器文档共用全局缓存。Electron托盘隐藏但文档仍在时继续使用同一策略；主进程不再保有另一个网络检查器。startElectron返回值的update仍保留null占位，UI状态从下述宿主合同读取。

## 追加替换合同

- `ui.assets["shell/update-notice.js"]`：默认导出具名`createUpdateNotice({api,doc,win,onStatus})`，返回`check({manual?})`、`action({action})`、`snapshot()`、`repaint()`、`dispose()`。check/status结果包含`result,error,checkedAt,busy,revision`；result只含公开版本信息。onStatus广播给现有面板，不包含宿主令牌。
- `ui.assets["panels/settings/update-status.js"]`：具名`mountUpdateStatus({host,action,subscribe})`，返回幂等清理函数。只渲染本页，不拥有第二个轮询器。
- 后台仍可追加替换`runtime.priceUpdates`，工厂收到`{dataDir,config,version,...}`，或按现有追加路由合同替换接口。没有新增固定核心旁路。
- `console.update`仅接受bundled settings，参数只能是`{action:"status"|"check"|"reveal"}`；不能携带URL、令牌、安装命令或其它字段。普通用户插件即使使用settings这个id也拒绝。

## 验证

199真实临时内核+Chromium覆盖启动/小时检查、关闭与手动重新显示、失败保留、导航重建、危险链接、单飞、销毁及代际；真实单文件追加宿主模块改变原设置widget。200覆盖RPC身份、精确参数与URL负例；201实际追加后台工厂，验证生产装配传入0.5.0并经认证API返回替换版本源。均不使用真实版本站、账号或当前15967。

首批16次定向全部通过，`batch8-2026-10-16T11-01-41-388Z/result.json`；其中旧响应忙态修复后追加增强199有头/无头均通过，最终源码仍需新冻结完整回归。199最初等待仍隐藏的桌面设置widget超时，是驱动没切到对应分区；改为实际切换后保留全部交互断言。旧33测试首次仍用默认工作appRoot，扫描当前扩展并尝试默认回环WS（被拒绝）；其后改用空临时appRoot、不连接外部地址的协议桩和离线价格适配器，原37断言通过。不得把首次运行描述为完全隔离。其余离线浏览器夹具补齐原先缺失的updateCheck合成依赖，原断言不删除、不缩减，新更新行为由199/201验证。

上一批最终完整`full-2026-10-16T09-58-03-831Z/result.json`：M3 166/166、M4 10/10、453份源码/测试散列一致。此旧基线不覆盖本批新代码。当前控制台没有同步这些改动，没有打包或部署。
