# 高级原始名单事务

旧 `develop` 的整份 `blocklist` 编辑允许明确删除群键和清空整个映射。0.5 保留这一意图，用原始字段 CAS 防止整表编辑覆盖期间已提交的成员操作。三个高级字段不走社区 effective replace。

默认组件 `console.blocklistRaw` 的工厂为 `createBlocklistRawController({config,publish})`，返回同步 `{get,put}`。固定接口为 `GET /api/blocklist-raw` 与 `PUT /api/blocklist-raw`。UI 资产为 `panels/settings/blocklist-raw.js`，可单独追加替换；禁用覆盖层后恢复默认实现。

GET 和成功 PUT 返回：

```js
{
  revisionKind: 'raw-field-v1',
  fields: {
    blocklist: {value: {}, present: true, source: 'host-config:blocklist', revision: '...'},
    globalBlocklist: {value: [], present: true, source: 'host-config:globalBlocklist', revision: '...'},
    communityExemptions: {value: [], present: true, source: 'host-config:communityExemptions', revision: '...'}
  }
}
```

PUT 只接受这三个字段，每个提交字段均需其编辑基线的来源与版本：

```js
{
  patch: {blocklist: {'100': ['111']}, globalBlocklist: []},
  expected: {
    blocklist: {source: 'host-config:blocklist', revision: '...'},
    globalBlocklist: {source: 'host-config:globalBlocklist', revision: '...'}
  }
}
```

版本比较完整字段原值及是否存在。不同字段可合并；同字段陈旧则 409。多个提交字段先全部校验，再同步调用一次现有 config 事务；比较与提交之间没有 `await`。磁盘 `.tmp`/rename 失败时不更新内存或发布成功事件。`blocklist` 是明确整表替换，`{}` 删除全部群键；两个数组以 `[]` 明确清空。空文本和无效 JSON 保留草稿并拒绝保存。原始数组不归一、去重、截断或改写数据类型。

宿主的专用 `config.updateRawFields` 继续走相同磁盘事务，只允许三个根字段，并保留原始数据内部的 `hasFuture` 等历史元数据。普通配置更新仍剥离派生 UI 标志。该专用方法不暴露给 SDK；具名默认社区插件仍通过既有、已校验权限和字段绑定的 `host.config.update` 写入，宿主内部识别这类原始名单补丁。默认逐成员写入也保留未选条目中的此类元数据。

`globalBlocklist` 是本机附加名单。保存不会上传号码或删除云端缓存；清空它不解除仅存在于云端的屏蔽。`communityExemptions` 独立持久化，清空它可能恢复屏蔽。所选自定义社区服务可使用不同的生效策略。原始接口不读取所选社区服务，也不会以默认客户端冒充自定义服务的 effective 结果。

默认高级 UI 将三字段迁入独立事务；普通 `POST /api/config` 拒绝包含这些字段的请求，避免继续通过旧保存路径覆盖。宿主内部 config API 仍供其他明确业务事务使用。逐成员入口继续只比较其目标 UID；raw 先改其它 UID 不应引入额外集合版本栅栏。

UI 每字段保存独立基线，不由普通设置 FormState 的读取或保存回执推进。失败保留原文本；对比显示编辑基线、服务器当前值和草稿。用户可采用服务器值，或明确保留输入并采用新版本后重试。迟到成功回执只清除确切已提交的输入版本，保留后续输入和未提交字段的旧基线。当前页面草稿不设业务项数裁剪，也不加入现有有限跨页缓存。

高级区域标题明确为“高级原始编辑·手动保存”。普通自动保存及顶部保存不会偷偷应用原始名单。模块的 `flushGuard()` 在未保存或无效输入时抛出可操作错误，供宿主阻止切页；原生刷新/关窗仅能提示未保存输入，用户选择仍离开时不保证落盘。显式“放弃原始名单草稿”清除当前草稿并读取服务器值。`save()` 返回是否确认成功；失败仍保留输入，成功只确认本次确切版本。

验收入口为 `node test/242-blocklist-raw-transaction-test.mjs`；`--http-only` 省略浏览器，`QA_HEADED=1` 使用有头浏览器。所有数据位于测试自己创建的临时目录、随机本机端口；真实社区客户端仅使用内存 fetch/DNS 桩，无 QQ、模型或外网。
