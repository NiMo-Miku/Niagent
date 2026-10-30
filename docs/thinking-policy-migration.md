# 思考模式与默认策略

默认LLM完成器实际调用所选`llm.thinking({api,context,signal})`，返回`{mode,on,effort,budget}`；组件可异步追加替换，取消后不启动HTTP或采用迟到结果。api包含已保存思考配置及本次实际模型目标，随后始终交给所选`llm.dialect.build`序列化。

调用上下文off、全局off、强度off任一成立均关闭思考。显式on且无有效强度时沿用medium；auto只有有效非off强度时显式开启，空白/非法强度跟随模型，不强制增加参数。mode为default/on/off，on只在mode:on为真；预算保留原值，由方言决定具体字段。新默认方言接收mode:default时返回空参数，直接旧调用on:false仍保持其显式关闭合同。

219正式10组覆盖已保存配置重读、真实注册方言和完成器请求、专用/备选目标、独立策略追加与停用、自定义方言、异步取消、温度及现有单次错误回退。相关15/59/78/89/170与86全部LLM旧回归通过。证据位于`.qa-local/219-thinking-parity/targeted-result.json`。

219只处理用户意图策略。后续220独立修复方言主机/型号和拒收回退，不能将219本身的证据扩大到这些分支。

220默认方言先解析HTTP(S) hostname、匹配域名边界，再保留模型名后备并补GPT-5；路径、查询和相似域名不会充当厂商。保留0.5本地兼容端点不强发think的较优行为。拒收检测要求独立字段名与相邻拒绝文本，支持CamelCase/空格变体和extra_body，避免模型名deepseek-thinking触发错误降级；摘参补齐thinking_budget。

默认完成器只在所选strip确实改变已发送JSON值时降级重发，键重排/无变化不重复请求；自定义方言的非标准字段和原地strip仍实际生效，没有硬编码已知字段绕过所选提供者。异步拒收/strip受同一请求取消与超时控制；降级仍最多一次，原温度恢复及后续advisor合同保留。正式220实际默认装配10组、15/59/78/89/219和86三项LLM回归通过，证据`.qa-local/v04-parity-20261016/thinking220-candidate-core/formal-result.json`。它是有明确范围的请求整形启发式，不能作为任意厂商错误文案都能识别的保证。
