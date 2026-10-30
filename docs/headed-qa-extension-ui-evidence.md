# 扩展与 MCP 验收证据

日期：2026-10-11。范围：本地扩展安装包、插件 SDK、权限、面板、提供者、配置与 MCP。没有打包，也没有连接真实 QQ、市场或收费 API。

## 实际有头浏览器状态

**本轮未执行真实有头浏览器交互，不能把下列 API/模块结果计作 UI 通过。**

已完整阅读 computer-use 的 SKILL.md、guidance.md 与 confirmations.md，并尝试使用 `mcp__cua_repl` 创建独立可见 Chrome 标签页：

```text
cua.createBrowserTab("chrome", "about:blank", { sessionName: "🧩 扩展验收" })
→ Browser is not available: chrome
cua.listBrowsers()
→ []
```

没有创建成功的浏览器标签页，没有使用原生窗口、桌面坐标或独立 Playwright 绕过该限制。没有点击安装、启停、权限、配置、用户面板、提供者选择、MCP 或卸载按钮，也没有执行卸载、删除或清理的最终 UI 动作。独立 `.qa-local/extension-ui` 内核未启动；主代理现有 Electron 窗口、数据目录、fixture 和端口均未改动。MCP 有头表单验收由主代理继续执行。

## 已完成的真实 HTTP 回归

运行命令：`node test/92-mcp-settings-contract-test.mjs`，2026-10-11 最终通过。

该测试使用正式的 config、permissions、registry、loader、HTTP server、console routes，复制正式 bundled/mcp-bridge 到独立临时 app，调用本机 HTTP 接口，不使用源码字符串匹配。MCP service host 没有启动，因此保存配置和 loader 重启均不会拉起 OS 子进程。

| 行为 | 证据与结果 |
| --- | --- |
| MCP 设置编辑契约 | 正式清单的 servers 为 array，items 为 object，默认值为 []。 |
| 无存档 entry 时首次保存 | POST /api/skills/mcp-bridge 返回真实数组，loader 的 ctx.config.get 读到同一值，磁盘也保存同一值。 |
| 改写与删除数组成员/属性 | 两个 server 改为一个；省略旧 requestTimeoutMs 后该属性消失，旧元素不残留。 |
| 清空 | servers=[] 保存并在新的 loader 重启后保持为空。 |
| 错误类型 | 发送 JSON 字符串而非数组返回 400；此前有效配置保持不变。 |
| 对象属性删除 | 合成扩展 options 从 {old:true} 改成 {only:"new"}，旧属性不残留。 |
| 密钥保留与脱敏 | 省略、空字符串、****** 均保留已存密钥；HTTP 响应不包含合成密钥明文。 |
| 明确清除密钥 | clearSecrets 单独提交生效，并在新的 loader 重启后仍为空。 |
| 元信息与其它配置 | enabled、installedVersion、metadata、其它扩展设置、无关全局合成 API key 均保持。 |
| 落盘结构 | 递归检查 config.json，无 __replace__ 标记。 |
| 重启 | 两次完整停止/重新创建 config、权限引擎、注册表、loader 和 HTTP server，重新读取磁盘并复核。 |

此前首次保存返回 200 但 servers 仍为 [] 的缺陷已经由 console 负责代理在 routes 修复；上述回归针对修复后的正式代码通过。

## 已完成的离线模块与 stdio 验证

生成器：`scripts/qa-fixtures/extensions/prepare.mjs`。安装包、MCP 配置及操作顺序位于 `.qa-local/headed-20261011/extension-fixtures/fixture-manifest.json` 和 `HEADED-STEPS.txt`，未预装到主代理的有头 app。

验证命令：`node scripts/qa-fixtures/extensions/validate.mjs`，2026-10-11 通过。该脚本仅在另外创建的临时 app/data 中解压并加载，不修改主代理有头 app 或真实 data。

- 正常 ZIP 经正式 extractZipSafely 与 loader 加载：用户工具、Skill 动态提示、0.4 工具兼容均可用；路径穿越 ZIP 被拒绝。
- 正式 panel adapter 验证用户面板授权、最终工具命名空间、配置密钥脱敏、旧 generation 失效与停用后的面板移除。这是 adapter 调用，没有浏览器点击。
- 正式 SDK/registry 验证发送与会话读取 facade 的权限，net.raw 拒绝；发送目标为测试内存记录，会话内容为合成数据；HTTP 只访问本机 fixture。
- 正式 service host 验证搜索提供者 A/B 选择与停用回退；热更 v1→v2，旧面板 generation 失效；停用后 scheduler 不再计时。
- 正式 MCP process adapter 启动真正的本机 Node stdio 合成服务，验证 initialize、tools/list、tools/call，以及非法 JSON 和受控超时；随后关闭子进程。该服务不访问网络。

外部 QQ、模型、搜索及市场服务均未接受真实调用。合成服务通过，只能证明这些本地契约在受控条件下有效，不能证明真实第三方服务可用，也不能代替尚未执行的 UI 安装、非法 ZIP 提示、授权弹窗、表单、面板渲染或 MCP 有头验收。
