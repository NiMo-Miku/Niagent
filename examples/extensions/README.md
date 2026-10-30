# 原生 v0.5 扩展完整范例

这三个目录是可独立复制、加载、离线自检和打包的技能。它们使用真实的公共 SDK，不导入 `src/`、不访问 `ctx.kernel`，不依赖 0.4 兼容适配器。所有范例均为 `enabledByDefault: false`，留在本目录不会被技能加载器自动启用。

| 目录 | 学习内容 | 自检用例 |
| --- | --- | --- |
| [roll-dice](roll-dice/README.md) | 参数约束、运行时配置、隔离的本地持久化 | 5 个 |
| [http-query](http-query/README.md) | 自己的 HTTPS JSON 服务、可选令牌、取消、安全错误 | 8 个 |
| [image-generate](image-generate/README.md) | 图片服务配置、PNG base64、当前聊天、受控发送和真实回执语义 | 11 个 |

每个目录包含完整的 `skill.json`、`index.js`、说明及 `extension.check.json`。最后一个文件是自检输入，不会被宿主当作配置。里面的 `test-token`、`test-image-key`、`test-image-model` 是公开的合成测试值；`.example.test` 地址由离线测试替身处理，不是真实服务或凭据。

## 从范例到自己的技能

1. 选择最接近的目录，复制到工作目录，修改清单的 `id/name/description/author/version`，同步修改 `prompt.sections` 中的完整工具 ID。原生用户工具 ID 为 `<技能 id>__<本地工具 name>`，不要照搬 0.4 的 `execute(ctx, args)` 或可调用的 `log()`。
2. 保持 `settings` 内密钥为空，只声明 `configSchema` 和必要权限。用户在安装后的技能配置界面填写真实地址和密钥；真实凭据不要写进源文件、自检用例或 README。
3. 修改代码和自检用例。`handler(args, execution)` 的输入来自工具调用；`ctx.config` 读取自身配置；`execution.chatKey` 是当前聊天的运行时键，例如 `private:10001` 或 `group:20001`。不要用控制台 URL 的 `private_10001` 代替运行时键。
4. 在项目根目录运行检查、离线执行、打包。以下命令里的目录可以换成任意一个范例或自己的开发目录。

```powershell
node scripts/extension-dev.mjs check examples/extensions/roll-dice
node scripts/extension-dev.mjs test examples/extensions/roll-dice --case examples/extensions/roll-dice/extension.check.json
node scripts/extension-dev.mjs pack examples/extensions/roll-dice --out .qa-local/example-roll-dice.zip
```

网络范例也能离线测试：测试工具通过真实加载器、工具注册表和权限 facade 执行，HTTP 和最终发送由明确的本地替身接管。用例不会访问图片服务、社区或 QQ。用例中未列出的请求直接失败，不会回退真实网络。离线绿色结果验证这条公共接口路径；实际服务的响应格式、配额、凭据和 QQ 运行状态仍需在用户环境验收。

5. 实际安装时将整个技能目录放到应用的 `skills/<清单 id>/`，例如 `skills/example-roll-dice/`，或使用打好的 ZIP 在技能安装界面安装。发布功能按 ID 定位 `skills/<id>/` 或 `plugins/<id>/`，所以安装目录名应与清单 ID 一致。然后在技能页启用、保存配置、按提示授权。启动加载器只扫描 `skills/`、`plugins/` 及内置目录，不扫描 `examples/`。
6. 从社区发布界面选择本地扩展类型和 ID，填写展示名称、说明，选择自己的已登录社区账号，并完成发布验证。宿主会从 `skills/<id>/` 或 `plugins/<id>/` 重新收集文件并上传；它不会直接上传前一步检查过的 ZIP，所以发布前应重新检查安装目录。发布提交回执不等于审核通过或已经上架；只有社区的审核与目录结果能证明可供别人安装。不要用这些未修改的教学范例占用社区公共 ID。

打包工具与生产社区发布使用相同的扩展文件集合规则；`extension.check.json` 可能随包发布，所以这里的所有用例都只包含公开合成值。开发目录中不要保留私人服务的响应、日志或临时凭据。

## 阅读顺序

先运行掷骰子例子，再看 HTTP，最后看直接发送图片。完整 API 与架构边界分别见 [公共插件 SDK](../../docs/plugin-sdk.md) 与 [扩展开发说明](../../docs/extension-authoring.md)。普通技能和插件可消费受控能力；需要替换启动组合时，另读 [追加式组合规格](../../docs/architecture-composition.md)，不要把覆盖层混入普通市场 ZIP。

这些范例是教学合同：HTTP 查询服务约定响应 `{ "answer": "文本" }`，图片服务约定 OpenAI 风格的 `data[0].b64_json` 且图片为 PNG。不同服务需据其真实协议修改请求及解析；不要用宽泛“兼容任意 API”的描述掩盖未经实现的格式。
