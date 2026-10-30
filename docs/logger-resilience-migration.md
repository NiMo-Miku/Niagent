# Logger 三个韧性原子的迁移合同（246）

本批只迁入旧 develop 中三个已确认的有用原子。保留 v0.5 的工厂实例、按天结构化 JSONL、500 条环、记录前级别过滤、child 来源、bus/SSE、同步写入与 stopWrites；不恢复旧单例、旧纯文本格式或旧异步缓冲。默认实现仍可被 runtime.logger 整体替换，磁盘策略可单独通过 runtime.log.policy 替换。

| 原子 | 旧实际行为与基线 | 本批裁决与新行为 |
| --- | --- | --- |
| 同步重入护栏 | develop/src/logger.js 的 writing/finally 丢弃监听器同步回写；v0.5 真实 SDK log 观察者回写 child、或观察者抛错后 Bus 用 logger 报错，均连续重入 | 在当前 logger 实例共享闭包中保护完整 record；所有 root/child、磁盘、console 与 bus 的同步内层调用直接丢弃。finally 释放护栏，下一次独立调用正常。异步持续产生日志不属于同步重入，本批不加全局限流 |
| 单条磁盘预算 | 旧对落盘文本取前 64*1024 个 UTF-16 字符并标记；新基线一条中文/emoji JSONL 为 200070 字节 | 默认每条新写记录含换行最多 65536 个 UTF-8 字节，保持有效 JSON，按完整 surrogate pair 截短 msg，必要时截短 src。明确标记 reason、originalBytes、limitBytes 与 sourceTruncated；ring/bus/GET/SSE 仍保留全文。不是旧字符预算的逐字复制 |
| 近期巨大日志启动整理 | 旧对大于 256MiB 文件保留尾部 16MiB 原始字节；v0.5 基线 268435457 字节近期逻辑文件启动后仍原大 | 默认仅启动时，对大于 256MiB 的近期普通 .log 文件扫描最后 16MiB，保留窗口内完整、严格 UTF-8、可 JSON.parse 的换行结束记录。丢弃窗口起始碎片、未结束尾行及无效行；前置合法 JSONL 标记准确记录原大小、保留/丢弃字节与无效完整行数 |

旧源码的真实快照及新实现前基线在 `.qa-local/v04-parity-20261016/log246/`。基线通过真正 kernel、loader、SDK 订阅验证，夹具主动在第 20 次停止递归；因此“20”是安全复现界限，不是旧实现的固有上限。超阈值基线仅用 ftruncate 建逻辑长度，不复制巨大内容，临时根执行后删除。正式测试用较小可注入预算执行真实文件 I/O。

## 策略接口与实际装配

`src/kernel/log-policy.js` 导出同步工厂：

```js
createLogPolicy({
  maxDiskEntryBytes: 64 * 1024,       // 最小 512，含 JSON 编码和结尾 LF
  maxStartupFileBytes: 256 * 1024 * 1024,
  startupTailBytes: 16 * 1024 * 1024,
  retentionDays: 7,
})
// => { diskLine(entry): string, prepare({ logsDir, now = Date.now() }): summary }
```

数值必须为正安全整数；startupTailBytes 不超过 maxStartupFileBytes。prepare 返回 `{removed, compacted, skipped, failed}`。compacted 包含文件名、原/保留/丢弃字节与无效行数；failed 明确文件与错误。默认 logger 的 startupMaintenance getter 返回该摘要的副本。失败还进入内存环与 console 的中文 warn，并临时禁该诊断落盘，保证它不会自己追加到整理失败的原件。

默认装配先构造所选 runtime.log.policy，再把 policy 传入所选 runtime.logger。直接 `createLogger({dataDir})` 同样自动采用默认策略；`createLogger({policy:null})` 明确关闭磁盘预算与启动整理，重入护栏仍有效。追加层可以让 runtime.log.policy 工厂返回 null，或给出自有同步策略。prepare 与 diskLine 的异步返回会被拒绝并吸收拒绝 Promise，不建立隐藏异步写队列。普通 SDK 不得到策略对象或新配置写权限。

diskLine 收到 entry 的浅副本，默认字段为 at、level、src、msg；磁盘策略对 msg 的修改不回写原 ring/bus entry。自有 logger 可以不使用该策略；其行为由可信启动组合负责。策略替换不需要更换默认 logger；整 logger 替换继续经同一 kernel、SDK child、日志路由与 SSE 消费链。

## 文件边界与失败语义

prepare 仅检查日志目录直接子项的 .log 文件。日志目录必须是实际目录；symlink/junction、目录、其他非普通文件和 nlink 不等于 1 的硬链接文件均跳过。过期普通文件仍按 mtime 七天清理，非 .log 不动。日常 append 同样不跟随日志目录或日文件的链接、不写硬链接或设备/管道；目录不可用时 ring/bus 仍可工作。

近期整理只分配尾部窗口，按 LF 对齐并严格解码，保留行的原始字节及顺序。窗口恰好起于完整行边界时保留该行。输出的说明行额外占少量空间，尾部预算不是包含说明行的整个文件硬上限；既有保留行不重新应用“新写单条”的预算。没有完整有效行时只留下诚实说明；不把无效旧纯文本伪装成 JSONL。

严格解码采用 `TextDecoder('utf-8', {fatal:true, ignoreBOM:true})`，让行首 BOM 保留在验证字符串中，由 JSON.parse 拒绝。不能用默认解码器悄悄剥掉 BOM 后通过验证，又保留带 BOM 的原始字节；这样会产生内部判断有效、实际逐行 JSON.parse 无效的文件。合法 JSON 字符串内容里的 U+FEFF 字符仍按原字节保留。

整理先检查源文件身份/大小/时间，读后复查，再写同目录随机且排他创建的临时文件、fsync、校验临时文件完整字节，最后复查源文件并原子 rename。读取、写入、fsync、校验、rename 失败或复查发现源文件变化时，不替换源文件，并尽力移除临时文件；摘要和 warn 不声称成功。此检查避免已观察到的并发变更覆盖，不承诺对外部不协作进程提供文件系统 CAS；原子 rename 也不等于断电后的目录持久化保证。

本策略只在 logger 构造时整理，不承诺运行中总文件大小或异步日志频率始终受限。完整 ring/bus 文本的内存预算是独立问题，本批不改变现有全文诊断合同。

## 验证

`test/246-logger-resilience-parity-test.mjs` 共九组：真实 SDK 同步回写/异常、UTF-8 JSONL 预算与全文保留、级别/环/child/stopWrites/null 策略、近期文件与保留期、精确行边界、行首 BOM 原始字节一致性、真实 junction/硬链接/非普通路径、六类隔离进程 I/O/变化故障，以及真实追加 policy+完整 logger replace → SDK/JSONL/鉴权 GET/SSE → 禁层恢复默认。

所有数据为自建临时合成内容，HTTP 只使用系统分配的本机端口，远端 fetch 在夹具中直接失败；不启动浏览器、真实 QQ、安装扩展或模型。fs 替身只在专用子进程中存在并在 finally 恢复。最终结果与源码散列见独占 QA 目录；定向通过不代替 root 后续源冻结完整回归。
