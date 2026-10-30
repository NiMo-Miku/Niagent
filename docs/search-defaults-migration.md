# 默认搜索渠道、完整接口地址与结果预算

本轮按`develop/src/config.js:98`及`develop/src/web-search.js:127`之后的实际消费比较，不以配置键都存在代替行为对等。此前五个内置渠道只有空地址占位；选择并填Key仍在发请求前失败，手填完整网关路径又会被强制改成厂商根路径。

## 原子裁决

| 原子 | 旧行为与新版缺口 | 当前裁决 |
| --- | --- | --- |
| 五个内置默认地址 | 旧配置与运行函数均有回退；新版占位为空 | 恢复共享默认表，实际工具和诊断使用同一个选择/协议实现；旧磁盘仍为空时也回退 |
| DeepSeek默认型号/超时 | 旧Flash、60秒；新版chat、20秒 | 默认改为当前支持Responses服务端搜索的V4 Pro，恢复60秒；显式型号不静默改写 |
| 完整网关地址 | 旧按完整endpoint请求；新版重建厂商根路径 | 保留非根path、查询参数与编码；仅裸origin补默认路径 |
| 请求宽度与结果预算 | 旧渠道count取样后仍截断全局maxResults；新版count可覆盖上限 | 分开计算count与输出limit；明确调用参数继续可覆盖默认预算，结果不超过该预算及请求count |
| 秘塔版本 | 旧`/api/open/v1/search`使用query/top_k；新版误发query/count | 默认当前`/api/v1/search`使用q/size/webpage；显式旧地址继续query/top_k，不把现有配置自动改成新地址 |
| 自定义单槽位 | 旧`provider:custom`按ws.custom消费；新版只认custom:id | 恢复旧单槽位的query/q/top_k/count及可选model/messages；保留新版列表的query/count/model合同 |
| 自定义完整endpoint | 旧直接使用；新版只要不以search结尾便追加 | 完整路径不重写；裸origin和既有`/vN`前缀仍支持补search，查询参数保留 |
| 返回格式 | 各渠道数组和旧自定义别名不同 | 统一有限结果投影，保留results/data/sources/references/webPages及当前秘塔webpages，忽略无链接项；DeepSeek仍返回其文本项 |
| HTTP200业务错误 | 214已修博查top/nested code及百度error_code | 保留；DeepSeek明确error也失败，不伪装成空成功 |
| 网页读取 | 工具默认已有私网拒绝；旧兼容入口漏传注入IO并接受媒体内网例外 | 兼容入口共享默认实现，网页仍拒绝私网；查询和网页显式传递调用信号 |

默认地址为DeepSeek`https://api.deepseek.com/responses`、智谱`https://open.bigmodel.cn/api/paas/v4/web_search`、博查`https://api.bochaai.com/v1/web-search`、百度`https://qianfan.baidubce.com/v2/ai_search/web_search`、秘塔`https://metaso.cn/api/v1/search`。所有已有非空地址、Key和兼容网关型号保留。智谱、博查默认请求10项，返回默认最多6项；百度、秘塔请求6项。网络超时仍经宿主safeFetch及SDK实例取消实现。

本轮查阅的[DeepSeek Responses官方说明](https://api-docs.deepseek.com/guides/responses_api/)明确服务端web_search只支持V4 Pro，Flash会忽略该工具；因此不照搬旧Flash默认。已知官方旧chat/reasoner/Flash型号在官方域名上明确报不支持，不自动增加请求或悄悄切型号；自建网关的显式型号不按官方型号表阻断。[秘塔官方Playground](https://metaso.cn/search-api/playground)给出新路径及q/size/scope字段；[博查官方示例](https://open.bochaai.com/)给出其endpoint及count字段。智谱、百度地址来自旧项目合同，本轮未用真实Key校验远端可用性。新旧秘塔返回均以合成响应验证，不能据此宣称账号、额度或实时远端已联通。

## 替换与权限边界

`bundled/web-tools/search-policy.js`仅承载默认协议，无自有网络访问。`runtime.config.defaults`可通过追加层replace/wrap各渠道默认值；`web.search`可由普通获准扩展注册替换，实际工具继续查询当前选中实现。停用替换扩展恢复默认，不暗中补发默认请求。需要更改宿主诊断语义时可显式替换`console.routes`或相应组合路由；诊断“测试此渠道”不假称是在测试任意被另一个扩展接管的工具实现。

`src/kernel/web-search.js`保留旧导出入口，但委托同一个默认服务，借宿主safeFetch适配器执行IO；控制台诊断也委托此服务，避免三份请求逻辑漂移。安全层不交给协议表：SDK权限、实例指纹、重定向逐跳SSRF、浏览锁定、取消及响应预算继续在宿主执行。默认配置本身仍可由已授权的可信启动模块替换，普通市场扩展不因此获得任意宿主配置或原生IO。

## 验证边界

正式233覆盖两个真实默认入口的五渠道默认/完整endpoint、预算、显式型号、秘塔新旧、单槽位与列表，以及实际createApplication→loader→SDK→工具→runner和同一注册诊断处理器。追加配置层改变实际请求，追加web.search替换与停用恢复均有物理请求计数控制。HTTP响应、DNS均合成，原生fetch/DNS/HTTP及进程入口有拒绝门，不启动listener、真实QQ、远端模型或现有15967控制台。

首次233终态24/26：网页预取消暴露宿主safeFetch既有漏洞，独立241修正；诊断夹具漏传自身fetchImpl，尚未对齐注入边界即失败。原始测试快照和工具终态指针保留于`.qa-local/v04-parity-20261016/search233-before`。最终执行结果另行追加，不能将设计或纯Response样本当远端验收或完整回归通过。

最终233 **29/29 actual exit0**，证据`batch11-targets-2026-10-17T07-24-33-370Z`，log SHA256 `e920bf1e2602842139e2f5a5e61053e2c5732b926c98facb2ed18b5ae2508df0`。独立只读复核发现的两项新增回归已修并纳入这29项：`webSearch:null`继续回退Bing，自定义/Bing诊断继续拒绝借图片例外访问私网，browseLock不剥离。前一定向233/03/24/235/240也全部exit0；241最终26项及既有20/214/216全过。完整项目的终态另读新冻结记录，不将这些专项当全量通过。
