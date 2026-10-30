import { dialectProvider } from './dialects.js';

export default {
  setup(ctx) {
    ctx.registerCapability('llm.dialect', dialectProvider, { default: true });
  },
};
