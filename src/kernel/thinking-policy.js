// Default llm.thinking component. Endpoint/model detection belongs to the
// selected llm.dialect provider; this component only resolves user intent.
const EFFORTS = new Set(['off', 'low', 'medium', 'high', 'xhigh', 'max']);
const normalized = value => String(value ?? '').trim().toLowerCase();

/**
 * Public composition contract:
 * llm.thinking({ api, context, signal }) -> { mode, on, effort, budget }
 * The caller supplies saved thinking settings merged with the effective model
 * target, and the per-call context. A replacement may be async; cancellation
 * settles the caller without starting HTTP or accepting a late policy result.
 * mode is 'default' (follow the model), 'on', or 'off'; on matches mode === 'on'.
 * Off in the call context, global mode, or effort is a veto. Otherwise explicit
 * on uses the existing medium default, and auto only enables a valid strength.
 * Budget retains its existing value; each dialect decides how to serialize it.
 */
export function resolveThinkingPolicy({ api = {}, context = {}, signal } = {}) {
  if (signal?.aborted) throw signal.reason ?? new Error('已中止');
  const value = normalized(api.thinkingEffort);
  const effort = EFFORTS.has(value) ? value : '';
  const global = normalized(api.thinkingMode), perCall = normalized(context?.thinkingMode);
  let mode = 'default';
  if (perCall === 'off' || global === 'off' || effort === 'off') mode = 'off';
  else if (perCall === 'on' || global === 'on' || effort) mode = 'on';
  return {
    mode, on: mode === 'on',
    effort: mode === 'off' ? 'off' : mode === 'on' ? effort || 'medium' : '',
    budget: api.thinkingBudget ?? 0,
  };
}
