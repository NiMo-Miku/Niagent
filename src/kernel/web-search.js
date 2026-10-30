// Compatibility entry point for host diagnostics. Search protocols and parsing
// share the default web.search implementation; outbound IO keeps the host gate.
import { safeFetch } from './safe-fetch.js';
import { createWebSearch as createDefaultWebSearch } from '../../bundled/web-tools/service.js';
export { buildBingUrl, parseBingHtml, extractImages, extractReadableText } from '../../bundled/web-tools/service.js';

export function createWebSearch({ cfg, log = console, fetchImpl, dnsLookup } = {}) {
  return createDefaultWebSearch({ cfg, log, http: { async fetch(url, init) {
    const result = await safeFetch(url, { ...init, fetchImpl, dnsLookup });
    return { status: result.status, headers: result.headers, url: result.finalUrl,
      truncated: result.truncated, text: async () => result.body };
  } } });
}
