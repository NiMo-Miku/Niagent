import { randomInt } from 'node:crypto';

function integer(value, fallback, minimum, maximum, label) {
  const result = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new Error(`${label}须为 ${minimum} 到 ${maximum} 的整数`);
  }
  return result;
}

export default {
  setup(ctx) {
    ctx.registerTool({
      name: 'roll',
      description: '掷骰子并返回点数；不直接发送消息。可指定 count 和 sides。',
      category: 'utility',
      params: {
        type: 'object', additionalProperties: false,
        properties: {
          count: { type: 'integer', minimum: 1, maximum: 20, description: '骰子数，默认 1' },
          sides: { type: 'integer', minimum: 1, maximum: 1000, description: '面数，默认取技能配置' },
        },
      },
      handler(args, execution) {
        if (execution.signal?.aborted || ctx.lifecycle.signal.aborted) throw new Error('操作已取消');
        const maxRolls = integer(ctx.config.get('maxRolls'), 10, 1, 20, '配置 maxRolls');
        const defaultSides = integer(ctx.config.get('defaultSides'), 6, 1, 1000, '配置 defaultSides');
        const count = integer(args.count, 1, 1, maxRolls, '骰子数');
        const sides = integer(args.sides, defaultSides, 1, 1000, '骰子面数');
        const rolls = Array.from({ length: count }, () => randomInt(1, sides + 1));
        const total = rolls.reduce((sum, value) => sum + value, 0);

        // KV 是本技能的持久化命名空间，不写插件源码目录，也不读取其它技能。
        // 读、改、写均同步完成，没有跨 await 的计数竞争。
        const previous = ctx.storage.get('stats');
        const rollCount = Number.isSafeInteger(previous?.rollCount) && previous.rollCount >= 0 ? previous.rollCount + 1 : 1;
        const diceCount = Number.isSafeInteger(previous?.diceCount) && previous.diceCount >= 0 ? previous.diceCount + count : count;
        ctx.storage.set('stats', { rollCount, diceCount, lastTotal: total });
        return { text: `掷出 ${count} 个 ${sides} 面骰子：${rolls.join('、')}；合计 ${total}。`, rolls, total, rollCount };
      },
    });
    ctx.log.info('掷骰子范例已注册');
  },
};
