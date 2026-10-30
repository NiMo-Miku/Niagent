// Shared presentation policy, independently replaceable through ui.assets.
export function sessionCacheRate(usage){
  const prompt=Number(usage?.promptTokens),cached=Number(usage?.cachedTokens);
  return Number.isFinite(prompt)&&prompt>0&&Number.isFinite(cached)?Math.max(0,Math.min(1,cached/prompt)):0;
}
export function cacheTone(rate){return rate>=.9?'good':rate>=.85?'good-soft':rate>=.8?'warn-soft':rate>=.7?'warn':'bad';}
export function formatCacheRate(usage){return `${(sessionCacheRate(usage)*100).toFixed(1)}%`;}
export function formatDuration(value){
  if(value==null||value===''||!Number.isFinite(Number(value))||Number(value)<0)return '—';
  const ms=Number(value);if(ms<1000)return `${Math.round(ms)} ms`;
  if(ms<60000)return `${(ms/1000).toFixed(2)} 秒`;
  return `${Math.floor(ms/60000)} 分 ${((ms%60000)/1000).toFixed(2)} 秒`;
}
export function sessionDuration(session,now=Date.now()){
  const start=Number(session.startedAt),end=session.endedAt==null?now:Number(session.endedAt);
  return session.startedAt==null||!Number.isFinite(start)||!Number.isFinite(end)||end<start?null:end-start;
}
