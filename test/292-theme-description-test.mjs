import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PRESETS, DEFAULT_THEME, STYLE_MODES, LIGHT_BASE, DARK_BASE } from '../ui/panels/theme.js';

test('292 theme descriptions use colors while saved preset and style identifiers retain compatibility', () => {
  assert.equal(PRESETS.endfield.label, '暖黑黄绿');
  assert.equal(DEFAULT_THEME.styleMode, 'endfield'); assert.ok(STYLE_MODES.has('endfield'));
  assert.equal(DARK_BASE.bg, '#191a19'); assert.equal(DARK_BASE.accent, '#d6e452');
  assert.equal(LIGHT_BASE.bg, '#e4e6de'); assert.equal(LIGHT_BASE.accent, '#838d1f');
  for (const preset of Object.values(PRESETS)) assert.doesNotMatch(`${preset.label} ${preset.note}`, /工业化?\s*(?:UI|界面|设计)|终末地|Endfield/i);
  const panel = fs.readFileSync(path.resolve(import.meta.dirname, '../ui/panels/settings/panel.js'), 'utf8');
  assert.doesNotMatch(panel, /工业|终末地|Endfield/);
  assert.match(panel, /暖黑黄绿 · 默认/); assert.match(panel, /骨白.*橄榄绿/);
});
