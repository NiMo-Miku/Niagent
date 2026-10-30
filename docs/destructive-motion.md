# 统一删除与重置动效

所有出厂页面的删除、清空、移除、卸载和恢复出厂入口使用
`destructiveButton` / `bindDestructiveAction`，包括设置中的全量重置、
社区口令草稿移除与白名单清空。模型勾选的“清除选择”等非数据删除操作
仍属于普通选择操作。独立插件通过相同公共组件接入；宿主不跨 iframe
注入 DOM 或猜测第三方按钮的含义。

独立页面显式引入 `/panels/common.css`，再从 `/panels/ui.js` 导入
`destructiveButton` 或 `bindDestructiveAction`。普通插件的沙箱、CSP、
自身工具与配置权限保持不变；使用动效不需要全局 DOM 或额外后台权限。

绑定返回的控制器提供 `refresh()`：勾选目标改变时重新计算 `canActivate`，
避免首次删除清空选择后按钮永久禁用。进行中的请求和退场动画仍保持锁定。
只改变选择时可调用 `reset({preserveCommittedLayout:true})` 清除未提交进度，
保留已经提交的退场补位；Escape、卸载等取消场景继续使用 `reset()`。

删除导致滚动容器自动夹紧 `scrollTop` 或恢复阅读锚点时，布局事务继续
完成撕裂与补位；这类内部滚动不等于用户取消。滚轮、触摸滚动、滚动键、
滚动条和明确点击其他内容仍可清除装饰，不撤销已经提交的删除。
真实存档页的底部单条删除、中段批量删除、长存档可见行及滚轮取消由 252
回归采样动画帧。每个容器最多保留 120 个可见行的位置；不会将扫描范围
截在最前面的 120 条旧消息，避免长存档尾部再次跳过动画。

## 行为与视觉分别替换

- `ui/panels/destructive-action.js` 管理有效点击、500ms 保持、线性回退、
  逻辑目标、单次提交、失败反馈及生命周期。普通删除至少两次；影响较大
  的操作三至五次；全量重置六次。视觉帧不会触发或重放业务请求。
- `ui/panels/destructive-motion.js` 是默认视觉实现：GSAP 持续随机重排
  文本条带与数据块，幅度随进度增加。达到 100% 后继续运动；成功后约
  0.54 秒撕裂消散，再以 FLIP 释放列表位置。失败只清理视觉，保留数据。
- `ui/panels/destructive-layout.js` 保留请求前的安全内容快照。SSE 提前
  刷新时先显示持续运动的旧内容，收到成功后才退场；保留的内容框在清空
  后也会撕掉旧内容。模态框快照使用无交互顶层显示，防止被原生 dialog
  遮挡，退场结束前保持原弹窗高度。
- `ui/panels/destructive-snapshot.js` 只复制有界的可见文本位置；不读取
  表单值（包括密码与密钥输入），也不复制脚本、资源地址、自定义元素或交互节点。每份快照最多
  48 个文本段、2200 字符；每文档最多八个动态图层，更多目标仍有染色。
  快照仅存在于当前页面的短时内存，不保存到磁盘或进入 RPC。
- `ui/shell/destructive-feedback.js` 管理全窗口重置效果。仅通过已认证的
  默认设置角色桥接 `progress` 与 `phase`；普通插件仍不能控制宿主视觉。
  `phase` 仅允许 `charging`、`pending`、`complete`、`cancelled`。

默认视觉使用当前主题的 `--bad`、`--text`、`--surface`、`--bg`。
减少动态效果、Escape、离开页面、取消、卸载和目标消失均清理装饰资源；
它们不撤销已经提交的业务请求。不可见对象的循环会暂停。

GSAP 3.13.0 的发布原件保存在 `ui/panels/vendor/`，由本地经典脚本加载器
异步提供，不在运行时请求 CDN。加载不会阻塞 `panel-client` 初始化、
握手或业务按钮；引擎就绪前只保留最新视觉进度，已取消的视觉不会迟到
启动。加载失败时仍保留确认与业务行为。版本、校验和与独立许可见该目录 README。

## 仅追加文件更换动效

新增 `overrides/50-my-danger/composition.json`：

```json
{
  "version": 1,
  "id": "my-danger-motion",
  "enabled": true,
  "order": 50,
  "ui": {
    "assets": {
      "panels/destructive-motion.js": "./motion.js"
    }
  }
}
```

`motion.js` 必须导出 `createDestructiveMotion(node, options)`，返回：

```js
export function createDestructiveMotion(node, options = {}) {
  return {
    update(progress, { decaying = false } = {}) { /* 0..1；纯视觉 */ },
    async exit({ signal, duration = 540 } = {}) { /* 成功后的有界退场 */ },
    dispose() { /* 幂等：停止循环、移除节点、监听和临时样式 */ }
  };
}
```

`options.windowMode` 表示宿主全窗口反馈；`options.exitOnly` 表示已成功
删除的安全快照。方法不能删除真实内容、调用删除 API、改点击计数或提升
插件权限。`exit` 应尊重 signal、减少动态效果和隐藏状态，且必须能结束；
`dispose` 可在任意阶段调用。调用方会等待 exit 完成再释放旧位置。
模块同样被内置页面、独立插件组件与宿主消费，不需要逐页改代码。

可分别覆盖 `panels/destructive-action.css`、`panels/destructive-layout.js`
或确认组件本身。重叠选择沿用 `ui.assets` 的确定性层序，只替换命中的
资产；停用或移除该层恢复出厂默认。完整替换页面若使用共享组件，应保留
所需共享资产或显式提供替代实现。

## 验证

`250-destructive-motion-test.mjs` 使用实际共享组件和独立随机端口页面，
逐帧检查固定 100% 的运动、独立条带退场、保留框清空、模态框显示、
SSE 提前移除、取消、失败、主题色、全窗口重置与减少动态效果；另通过
真实应用装配验证追加资产接管四次点击的渠道删除及停用后恢复默认。
所有测试使用合成数据，不访问日常控制台、QQ 或远端账号。

相关回归：168、169、172、177、180、195、221、250，以及设置重置结果
与失败保留测试 136。行为测试仍然验证请求发生的次数与时机，而非只检查
动画样式或最终 DOM。

2026-10-18 最终验收：`acceptance-final` 同轮 M3 **218/218**、M4 **10/10**，
561 份生产/测试代码的运行前后及终态后校验一致。当前 250 的 11 项场景另有
有头实操通过；普通用户插件的真实不透明 iframe/CSP 下也验证了动态条带、
两击确认、Escape 清理及原有受限 RPC。15 份控制台静态文件与当前源码一致。
日志、前后哈希、终态与最终核对记录位于
`.qa-local/destructive-gsap-20261018/acceptance-final/` 和
`.qa-local/destructive-gsap-20261018/final-verification.json`。
