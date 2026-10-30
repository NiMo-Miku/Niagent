# 追加文件示例

将 `20-local-customization` 整个目录复制到程序的 `overrides/` 下，然后完全退出并重新启动。示例为默认系统提示词附加一句中文风格要求，并新增 `/api/local-customization`；不会修改出厂源码、数据格式或密钥。

删除该目录或将清单 `enabled` 设为 false 后，下一次完整启动恢复出厂行为。目录在本 `examples/` 下时不会被启动器加载。

更多组件、页面和路由替换方法见 [追加式组合规格](../../docs/architecture-composition.md)。启动组合与程序源码同等可信，请审查后再放进 `overrides/`；普通市场插件继续使用各自的权限与隔离面板协议。
