export const DEFAULT_REFRESH_MS=15000;
export function normalizeRefreshInterval(value){if(!['number','string'].includes(typeof value))return DEFAULT_REFRESH_MS;const n=Number(value);return Number.isFinite(n)&&n>=1000?Math.min(2147483647,Math.floor(n)):DEFAULT_REFRESH_MS;}
let interval=DEFAULT_REFRESH_MS;
const listeners=new Set();
export const getRefreshInterval=()=>interval;
export function setRefreshInterval(value){const next=normalizeRefreshInterval(value);if(next===interval)return interval;interval=next;for(const fn of [...listeners])fn(interval);return interval;}
export function onRefreshInterval(fn){listeners.add(fn);return()=>listeners.delete(fn);}
