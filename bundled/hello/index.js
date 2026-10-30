// hello —— 捆绑插件的 SDK 活样例（DSH §2.3：捆绑插件是 SDK 的活样例）。
// 默认停用（enabledByDefault:false）：它是开发/测试用的演示件，不参与默认行为（行为等价 0.4 优先）。
// 演示面：registerTool（捆绑域裸 id，用户已批 A-2）+ prompt.add + ctx.storage 命名空间 + configSchema 声明读取。
export default {
  setup(ctx) {
    ctx.log.info('hello 插件装载（SDK 样例）');

    const finalId = ctx.registerTool({
      id: 'hello_say',
      name: '问候',
      description: '返回一句问候语（SDK 样例工具，无副作用）',
      params: {
        type: 'object',
        properties: { name: { type: 'string', description: '要问候的名字（可省）' } },
        required: [],
      },
      scopes: [],
      execute: async (args) => {
        const greeting = ctx.config.get('greeting') ?? '你好';
        const who = typeof args?.name === 'string' && args.name ? args.name : '世界';
        const uses = ctx.storage.get('uses');
        ctx.storage.set('uses', (typeof uses === 'number' ? uses : 0) + 1);
        return { ok: true, text: `${greeting}，${who}` };
      },
    });
    ctx.log.info(`hello 注册工具：${finalId}`);

    ctx.prompt.add({
      id: 'hello-demo',
      priority: 99,
      render: () => '', // 空片段：仅演示 API，不向系统提示词注入任何内容
    });
  },
  deactivate() { /* 演示卸载回收（真实插件这里停副作用） */ },
};
