// After copying this directory to APP_ROOT/overrides/, this relative import
// references the documented default implementation, not a private app object.
import { buildSystemPrompt } from '../../bundled/runtime-defaults/components.js';

export function systemPrompt(options) {
  return `${buildSystemPrompt(options)}\n\n请使用清晰、简洁的中文表达。`;
}

export function registerRoutes(http) {
  http.route('GET', '/api/local-customization', () => ({ ok: true, source: 'local-customization' }));
}
