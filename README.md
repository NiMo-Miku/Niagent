# Niagent · QQ Agent 0.5

> 薄内核 + 全插件架构的 QQ 机器人宿主，无头服务 + 浏览器 Web 控制台。

QQ Agent 0.5（代号 DSH）是 0.4 的架构重写：内核只负责会话、唤醒、记忆与调度这些不可替换的部分，模型渠道、协议端、面板、工具全部以插件形式接入。所有能力都通过 `setup(ctx)` 注册，宿主不向插件暴露 kernel、registry 或原始事件总线。

- 运行时：Node.js 20+
- 形态：无头服务 + Web 控制台（不含 Electron 桌面壳）
- 协议端：OneBot v11（NapCat / SnowLuma 等），由用户自备

## 特性

| 能力 | 说明 |
|---|---|
| 唤醒判定 | 按群/私聊档位（仅 @ / 关键词 / 随机）决定是否唤醒模型；唤醒前已有插件拦截点 |
| 会话延续 | 同一话题在时间窗口内复用同一会话；模型可用 `finish` 带 `lurk` 主动结束话题进入静默 |
| 记忆 | 消息存档、成员印象整理、跨会话检索；内置仿生记忆插件提供长期事实与回忆 |
| 人设 | 全局人设 + 分会话覆盖；插件可经 `persona.read` / `persona.write` 读取与切换 |
| 插件能力 | `ingest.intercept` 零 token 拦截、`friend.request`、`chat.member-info`、发送队列、存储、调度、钩子 |
| 扩展创作 | 控制台内「创作扩展」生成提示词，AI 按 `docs/` 合同自行制作技能/插件 |
| 外观 | 主题与逐元素可视化编辑，配置存于面板隔离存储 |

## 快速开始

```bash
git clone https://github.com/NiMo-Miku/Niagent.git
cd Niagent
npm install
npm run server
```

启动后打开 `http://127.0.0.1:3210`（端口可在 `data/config.json` 的 `server.port` 修改）。Windows 也可双击 `启动QQ机器人.bat`。

首次启动会自动生成随机控制台令牌并写入 `data/config.json`，浏览器打开控制台会自动领取；脚本调用 API 需带 `x-console-token` 头。把 `server.token` 显式写成空字符串可关闭鉴权——仅建议在本机可信环境这么做。

## 连接 QQ

推荐：把上游协议端完整包放进项目根目录的 `protocols/`，控制台「设置 → QQ 连接」里选择「启动并连接」，宿主会检测发行物、解压、补齐 OneBot 配置并管理自己启动的进程树。

- [NapCat Releases](https://github.com/NapNeko/NapCatQQ/releases)
- [SnowLuma Releases](https://github.com/SnowLuma/SnowLuma/releases)

也可以连接你自己已经跑起来的 OneBot v11 服务，在设置里填写 `onebot.wsUrl`、`onebot.httpUrl`、`onebot.accessToken`、`onebot.httpAccessToken`。QQ 登录、首次协议确认由协议端自己的页面完成，本仓库不接管登录态。

## 插件与技能

内置在 `bundled/`、`plugins/`、`skills/` 下，控制台列表里启用即可。启用用户插件时会弹授权卡，按需允许 `qq.send`、`ui.panel`、`persona.read/write` 等能力。

| 扩展 | 位置 | 说明 |
|---|---|---|
| 好友申请审批 | `plugins/friend-approval`（本仓库） | 按审批人列表自动或人工处理好友申请 |
| 文生图 | `skills/image-generate`（本仓库） | 调用已配置的模型渠道生成图片 |
| TRPG 跑团骰子 | 独立仓库 [na-trpg-dice](https://github.com/NiMo-Miku/na-trpg-dice)，放进 `plugins/trpg-dice` | `.r`/`.ra`/`.st`/`.pc` 等指令在唤醒前直接计算发送，零模型零 token；支持跑团人设切换、自定义回复模板与后缀 |
| 仿生记忆 | 独立分发，放进 `plugins/biomimetic-memory` | 事实/偏好/经历整理、相关回忆注入、冲突处理与备份 |
| 真 @ 提醒 | 独立分发，放进 `skills/real-at` | 发送真正的 at 消息段，而不是正文里的「@昵称」文字 |

`plugins/` 与 `skills/` 是用户扩展目录，不随本仓库分发；克隆后按需放入。插件更新会改变代码指纹，之前的授权随之失效，更新后需在插件卡片上重新「宿主授权」。

## 开发扩展

```bash
npm run extension:check -- <目录>   # 静态自检
npm run extension:test  -- <目录> --case <用例文件>
npm run extension:pack  -- <目录> --out <ZIP路径>
```

- 入门与完整合同：[扩展创作](docs/extension-authoring.md)、[完整参考](docs/extension-reference.md)
- SDK 概览：[插件 SDK](docs/plugin-sdk.md)
- 追加式组合（替换默认实现）：[组合规格](docs/architecture-composition.md)
- 从 0.4 迁移：[能力逐项对照](docs/v04-extension-parity.md)
- 可执行范例：`examples/extensions/`

插件通过 `setup(ctx)` 使用 `ctx.registerTool` / `registerCapability` / `registerTransport` / `ui.panel.register`，以及 `ctx.hooks.on`（`before-context`、`before-llm-messages`、`after-response`、`before-tool`、`after-tool`）、`ctx.scheduler`、`ctx.storage`、`ctx.config`。

## 配置与安全

- 配置：`data/config.json`（原子写、损坏自动备份）。模型渠道、权限、档位、记忆策略等都在此文件与控制台里。
- 密钥：`data/` 已被 `.gitignore` 排除，不要提交；控制台 API 返回配置时会对密钥脱敏，只给 `hasXxx` 标记。
- 插件权限：声明在 `plugin.json` 的 `permissions`，按代码指纹绑定，每次请求校验。
- 插件在 Node 进程内执行，不是沙箱；只安装可信代码。

## 数据目录

```
data/
  config.json                  配置
  messages/                    消息存档
  memory/                      记忆与成员印象
  sessions/                    会话与用量
  plugin-storage/              插件自己的持久化目录
  plugin-authorizations.json   插件授权记录
  logs/                        日志
```

升级前建议整体备份 `data/`。

## 测试

```bash
npm test          # 主回归
npm run test:m4   # M4
npm run smoke     # 无头冒烟
```

测试使用隔离的合成副本和假传输，不连接真实 QQ；自动测试通过不代表真实账号联调完成。涉及浏览器的用例需要本机 Chromium。

## 目录结构

```
src/kernel/      内核：会话、唤醒、编排、能力注册、SDK 边界
src/console/     控制台 HTTP 路由与面板适配
bundled/         随仓库分发的默认插件/技能（可在组合层替换）
plugins/         用户插件
skills/          用户技能
ui/              控制台外壳、内置面板与设计系统
protocols/       协议端发行包存放处（不入库）
docs/            架构、SDK、扩展开发参考
test/            回归与端到端用例
```

## 许可证

内核与主体代码为 MIT（见 `package.json`）。各插件许可证见其自身 `plugin.json`；`plugins/trpg-dice` 为 AGPL-3.0（移植自 OlivaDiceCore）。

## 已知边界

- 只提供无头服务与 Web 控制台；桌面外壳、安装包、QQ 扫码登录均不在本仓库范围内。
- 不迁移 0.4 的账号数据与专属运行时配置；升级前请自行备份。
- 协议端版本、许可与联调条件以上游说明为准；连接状态不等于真实收发已验证。
