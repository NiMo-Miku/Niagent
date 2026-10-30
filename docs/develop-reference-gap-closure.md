# develop 参考功能补齐记录

> 范围更新（2026-10-23）：专属协议端与便携客户端的安装、启动和登录态迁移已从项目范围移除。本文保留其余历史记录；旧编号、测试数量与结果只对应当时范围，不代表当前版本已经完成验收。当前外部协议端由用户自行管理。

2026-10-14。用户明确授权参考 `../develop` 补齐剩余缺口。本批只读必要旧版源码，包括模型价格和金句客户端等；其中五份主要来源纳入最终散列核对。未读取旧版数据、账号或凭据，未修改旧项目。版本和散列来自历史源码，不声称已重新下载验证供应商的当前文件。

| 功能 | 已实现的本地行为 | 验证与边界 |
|---|---|---|
| 价格兜底 | 140条旧版内置历史价，自定义优先；远程/缓存叠加内置价，未命中用全局手填或无价格；显示与实际记账共用查找；非法远程价不破坏缓存；保留已归档成本。 | [146价格验证](../.qa-local/develop-gap-closure-20261014/price/validation.json)，46/46；实际合成旧成本29、新成本281、总310。可见页142条含2条自定义，[当前价与元数据](../.qa-local/develop-gap-closure-20261014/headed-evidence/price-visible-projection.json)。这是2026年9月历史参考快照，未核实当前厂商报价。 |
| 含图金句 | 按旧客户端字段提交内联PNG/JPEG/GIF/WebP；解码预览、明确移除；总计最多9张/图片1MB/JSON 2MB；无原QQ、群号、消息号、图片URL或路径；宿主检查、验证码和提交可取消。 | [149及完整浏览器回归](../.qa-local/develop-gap-closure-20261014/full-regression.log)通过。可见界面合成753字节图片与受控POST散列一致，[形状与散列](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-image-accepted-shape-and-hash.json)。损坏图片阻止提交，明确移除后保留正文并取消，无新增POST。未真实解决验证码、外站投稿或证明官网存储。 |

插件结构保持原能力注册、社区路由及宿主 RPC 边界；图片凭证由宿主管理，不交还面板。


完整本地回归于2026-10-14 06:14:56 UTC结束，M3 **117/117**、M4 **10/10**，exit0。[结果](../.qa-local/develop-gap-closure-20261014/full-regression-result.json)、[日志](../.qa-local/develop-gap-closure-20261014/full-regression.log)、[源码冻结](../.qa-local/develop-gap-closure-20261014/source-freeze.json)、[最终核对](../.qa-local/develop-gap-closure-20261014/final-verification.json)。初次反证失败和环境spawn EPERM日志均保留，不覆盖历史证据。

新可见验收使用独立合成副本、PROFILE99，生产kernel及IAB界面；HTML仅加入明确标示的离线验证码SDK替身，网络发布由固定合成响应替代。未进行新的Electron/IPC验收、真实QQ/商业模型/社区全链、长跑或安装包构建。原有186行有头清单仍是9通过、92部分通过、84条件不足、1延期，不能把自动回归通过当成186个功能全通过。[逐项清单](headed-qa-checklist.md)。

![可见含图金句预览](../.qa-local/develop-gap-closure-20261014/headed-evidence/quote-image-preview.jpg)
