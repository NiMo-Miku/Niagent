import { createMemoryConsolidator } from './consolidator.js';
export default {
  setup(ctx) {
    const config = ctx.capability('host.config');
    const llm = ctx.capability('llm.client');
    const run = createMemoryConsolidator({ cfg: () => config.get(), memory: ctx.capability('data.memory'),
      store: ctx.capability('data.messages'), sessions: ctx.capability('data.sessions'),
      capability: { providers: (name) => ctx.hasCapability(name) ? [{ provider: ctx.capability(name) }] : [] },
      callLLM: (args) => llm.complete(args), log: ctx.log });
    const provider = Object.assign((args) => run(args), { start() {}, stop: () => run.stop() });
    ctx.registerCapability('memory.consolidate', provider, { default: true, lifecycle: true });
    ctx.lifecycle.onStop(() => run.stop());
  },
};
