// 54：工具 id 跨owner 撞车检测（bundled 裸 id 静默覆盖的诊断补丁）。
// 背景：SPEC §7.4「重复 id 覆盖」行为保持不变（后注册者生效），本次只补可观测性——
//跨 owner 撞车要warn + 留痕 + 能在控制台查到，同 owner 热重载不得误报。
import assert from 'node:assert/strict';
import { createToolRegistry } from '../src/kernel/tools.js';

const def = (id, ownerId, extra = {}) => ({
  id, name: `工具 ${id}`, description: 'x', execute: async () => 'ok', ownerId, ...extra,
});

// 1. 跨 owner 撞车：产生一条冲突记录，赢家是后者
{
  const warns = [];
  const events = [];
  const reg = createToolRegistry({ log: { warn: (m) => warns.push(m), error: () => {} }, bus: { emit: (n, p) => events.push([n, p]) } });
  reg.register(def('dup_tool', 'alpha', { bundled: true }));
  reg.register(def('dup_tool', 'beta', { bundled: true }));
  assert.equal(reg.get('dup_tool').ownerId, 'beta', '覆盖后生效者应为后注册者（行为等价未变）');
  const info = reg.collisionsInfo();
  assert.equal(info.length, 1, '应记录一条冲突');
  assert.equal(info[0].id, 'dup_tool');
  assert.equal(info[0].winner, 'beta');
  assert.equal(info[0].losers[0].ownerId, 'alpha');
  assert.equal(warns.length, 1, '跨 owner 撞车必须 warn 一次');
  assert.match(warns[0], /dup_tool/);
  assert.ok(events.some(([n, p]) => n === 'tool.conflict' && p.id === 'dup_tool' && p.loser === 'alpha'), '需广播 tool.conflict 事件');
  console.log('✓ 跨 owner 撞车：warn + 留痕 + 事件，赢家仍为后者');
}

// 2. 同 owner 重复注册 = 热重载路径，不得记为冲突
{
  const warns = [];
  const reg = createToolRegistry({ log: { warn: (m) => warns.push(m), error: () => {} } });
  reg.register(def('reload_tool', 'alpha', { bundled: true }));
  reg.register(def('reload_tool', 'alpha', { bundled: true }));
  assert.equal(reg.collisionsInfo().length, 0, '同 owner 重复注册不算冲突');
  assert.equal(warns.length, 0, '同 owner 重注册不应 warn');
  console.log('✓ 同 owner 重注册（热重载）不误报');
}

// 3. 无冲突时列表为空
{
  const reg = createToolRegistry();
  reg.register(def('a_tool', 'alpha'));
  reg.register(def('b_tool', 'beta'));
  assert.deepEqual(reg.collisionsInfo(), []);
  console.log('✓ 无冲突返回空数组');
}

// 4. 内核工具（无 ownerId）被插件顶掉也要留痕
{
  const reg = createToolRegistry({ log: { warn: () => {}, error: () => {} } });
  reg.register(def('kernel_tool', undefined));
  reg.register(def('kernel_tool', 'gamma'));
  const info = reg.collisionsInfo();
  assert.equal(info.length, 1);
  assert.equal(info[0].losers[0].ownerId, '(内核)');
  console.log('✓ 内核工具被顶掉标记为 (内核)');
}

// 5. 覆盖者被卸载后不留悬空诊断
{
  const reg = createToolRegistry({ log: { warn: () => {}, error: () => {} } });
  reg.register(def('temp_tool', 'alpha'));
  reg.register(def('temp_tool', 'beta'));
  assert.equal(reg.collisionsInfo().length, 1);
  assert.equal(reg.unregister('temp_tool', 'beta'), true);
  assert.equal(reg.collisionsInfo().length, 0, '覆盖者整体卸载后应清掉冲突记录');
  console.log('✓ 卸载后清理冲突记录');
}

// 6. 多次撞车累积成链，不丢历史
{
  const reg = createToolRegistry({ log: { warn: () => {}, error: () => {} } });
  reg.register(def('chain_tool', 'a'));
  reg.register(def('chain_tool', 'b'));
  reg.register(def('chain_tool', 'c'));
  const info = reg.collisionsInfo();
  assert.equal(info.length, 1);
  assert.equal(info[0].losers.length, 2, '两个被顶掉的 owner 都应留痕');
  assert.equal(info[0].winner, 'c');
  console.log('✓ 多次撞车累积为链，赢家为最后注册者');
}

console.log('\n✓ 54 工具 id 冲突检测：全部通过');