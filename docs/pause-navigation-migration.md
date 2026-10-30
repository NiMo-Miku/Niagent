# 暂停恢复与跨页选择

默认宿主保留“全局暂停 / 恢复运行”主按钮。普通恢复继续处理未读积压；暂停期间另显示“恢复并全部标为已读”，只有这个明确动作会先保存已有消息的已读状态，再以 `skipBacklog:true` 恢复。操作执行后新收到的消息不属于旧边界，仍能正常触发自动处理。

## 默认实现与追加替换

`ui/shell/pause-controls.js` 导出 `createPauseControls`，实际负责按钮、忙碌状态、回执、错误、部分成功和释放；宿主仅初始化并同步运行状态。`ui/panels/selection-state.js` 导出 `createSelectionState`，由实际 sessions/chats 默认页面消费，负责一次恢复、手动意图、列表交集和取消守卫。两份文件均可独立通过管理员启动组合替换，无需复制整个 app 或页面。

例如在自己的层目录中提供完整模块，再声明所需资源：

```json
{
  "version": 1,
  "id": "operator-navigation",
  "ui": {
    "assets": {
      "shell/pause-controls.js": "./pause-controls.js",
      "panels/selection-state.js": "./selection-state.js"
    }
  }
}
```

只替换其中一项时删除另一项声明即可。追加模块须保留消费者使用的导出合同：暂停工厂返回 `sync()` / `dispose()`；选择工厂返回 `touch()` / `accept(ids,{isCurrent})` / `dispose()`。模块自己的异步资源也应响应取消和释放。停用该层（`enabled:false`）或移除该层后，下次创建应用恢复默认实现；不承诺运行中热替换这些启动资产。

这属于受信任管理员代码组合。普通市场面板没有宿主 DOM、管理令牌、任意文件或任意存储权限。

## 标读回执、持久化与重试

默认固定接口 `DELETE /api/pause`，以及 `POST /api/pause` 的 `{paused:false,skipBacklog:true}`，都消费当前选中的 `data.messages` 和编排器。普通 POST 暂停/恢复行为继续保留。

首次明确动作同步捕获每个聊天的 `{chatKey,throughId,incarnation}`。`throughId` 限定当时已有的本地消息 ID；`incarnation` 仅标识当前仓库状态对象，保存在运行时 WeakMap 中。所有待重试 scope 先统一校验，再开始任何新写入。相关方法是宿主合同，不增加普通 SDK 的消息仓权限。

每个聊天通过既有固定归档的临时文件加 rename 保存。严格保存失败会抛错，并恢复该聊天刚改过的准确 read 属性；只清理该归档自己的 PID 临时文件。其它普通标读调用继续沿用原 best-effort 默认语义。

成功回执包含 `{ok:true,paused:false,marked}`。跨聊天有失败时返回 HTTP 207：

```js
{
  ok: false,
  partial: true,
  paused: true,
  marked: { /* 已保存的 chatKey: 数量 */ },
  remaining: [ /* 仅未保存的原边界 */ ],
  failed: { /* chatKey: 非敏感错误 */ }
}
```

界面显示已保存数量，保持暂停，并提供“重试未保存的标读”。后续只提交 `remaining`，不重写成功的聊天，也不将 partial 后的新消息加入旧边界。已有成功写入保留；这里没有跨文件原子性或磁盘回滚承诺。

清空并重建聊天、重建 store 或重启应用都会使旧 incarnation 失效。旧重试返回 409，不能把复用的本地 ID 当作旧消息。界面不会自动采用新边界；用户须明确“取消重试，开始新操作”。网络结果不确定时同样要求这个新意图，避免自动扩大旧操作范围。此重试状态只在当前 shell RAM 中保存，不承诺跨重启续传。

严格捕获不能确认目录、未缓存归档或合法本地 ID 时返回 503，不会把读取错误当作空积压。所选自定义消息仓若缺少 `captureReadBoundary()` / `isReadBoundaryCurrent(scope)` 合同，也明确报告不可用；默认路由不读取硬编码文件绕过该仓库。

## 跨页选择的窄状态

sessions/chats 默认清单分别声明 `viewState.keys:['navigation']` 和 `bootScripts:['panel.js']`。实际可信来源与内容代际由既有 217 元数据机制核实；共享 selection-state.js 的实际选中文件也参与启动摘要，并共用一次读取缓存。改变共享文件或其所选来源会改变代际，停用覆盖会恢复默认摘要。

保存的 JSON 只有：

| 页面 | navigation 快照 |
|---|---|
| sessions | `{schema:1,id,follow}` |
| chats | `{schema:1,id}` |

恢复先验证 ID 格式，并与新 iframe 取得的真实列表求交。手动选择或跟随切换优先于旧恢复；过期列表、迟到详情、已删除 ID 和销毁后的读取不能抢回选择。尚未获得第一份有效列表时，快照提供者拒绝提交，宿主保留之前的有效快照。

快照沿用可信 owner + panel id + generation 隔离的 RAM broker 及其字节、数量、TTL 限制。没有聊天正文、会话流水、搜索词、测试发送草稿或密钥缓存。此功能不持久化跨 host 重启，也不承诺识别离开期间未观察到的“删除后以同业务 ID 重建”；这种情形仍需业务 entity epoch 才能区分。

## 验证范围

正式 236 在默认、实际追加资源和停用回退三种模式下覆盖普通恢复、明确跳过、实际自动唤醒正负控制、新消息边界、真实写入/rename 故障、partial 限定重试、持久化重建、清空 ID 复用、真实 kernel stop/createApplication 和旧票据失效。正式 237 覆盖真实跨页选择、跟随、列表交集、删除、迟到请求、手动意图、销毁及共享资源来源摘要。两者均有实际有头、无头通过记录。

172/177 的可选 Chromium 检查继续使用自己的 synthetic shell/page，因此无需复制它们不消费的暂停或选择资源。217 验证 broker 的真实 iframe 恢复与可信隔离；额外离线探针直接证明共享 selection-state.js 被实际摘要读取一次、改变内容/追加来源会改变代际、停用恢复默认代际。

证据分别位于 `.qa-local/v04-parity-20261016/pause-navigation-236-237/` 与 `pause-navigation-integration-236-237/`。测试只使用临时合成数据、空扩展根、被动协议和自有本机端口。这些是定向验证，完整回归以之后冻结源的 M3/M4 真实终态为准。
