# 掷骰子：配置、校验和本地持久化

完整原生 v0.5 技能，ID `example-roll-dice`，工具 `example-roll-dice__roll`。默认禁用，无网络和发送权限。它只返回结果供 Agent 回复，不直接发消息，不需要账号凭据。

## 配置和调用

| 字段 | 默认值 | 约束 |
| --- | --- | --- |
| `defaultSides` | `6` | 1 到 1000 的整数；调用未传 `sides` 时使用 |
| `maxRolls` | `10` | 1 到 20 的整数；每次调用的骰子数上限 |

工具参数为 `{ "count": 2, "sides": 6 }`，两个字段均可省略。默认掷 1 个骰子，面数取当前配置。宿主校验参数类型和静态范围；处理函数另外校验当前配置、空值和用户设置的更小上限。这里允许 1 面骰子，便于确定性离线测试。

成功输出例如：

```json
{
  "text": "掷出 2 个 6 面骰子：2、5；合计 7。",
  "rolls": [2, 5],
  "total": 7,
  "rollCount": 1
}
```

真实点数用 Node `crypto.randomInt` 生成。`ctx.storage` 在当前数据目录的 `plugins/example-roll-dice/kv.json` 保存本技能的 `stats`：累计调用数 `rollCount`、累计骰子数 `diceCount`、最近总点数 `lastTotal`。存储由宿主命名空间提供，技能不自己构造路径，也不写源码目录；跨聊天共享本技能统计，卸载默认保留数据。这个例子没有随机过程公平性认证，不用于需要可审计开奖的场景。

## 离线自检与打包

在项目根目录执行：

```powershell
node scripts/extension-dev.mjs check examples/extensions/roll-dice
node scripts/extension-dev.mjs test examples/extensions/roll-dice --case examples/extensions/roll-dice/extension.check.json
node scripts/extension-dev.mjs pack examples/extensions/roll-dice --out .qa-local/example-roll-dice.zip
```

五个独立用例覆盖连续两次执行并检查 KV、用户配置生效、运行时上限、错误类型和未知参数。用例明确断言没有 HTTP 或发送副作用；测试用 1 面骰子得到稳定结果，没有修改生产代码的随机数生成。

安装、启用、上传社区及凭据要求见 [范例总说明](../README.md)。首次安装仍默认禁用，用户需主动启用。
