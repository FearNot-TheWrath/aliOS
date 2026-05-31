// src/phase.js
const THEMES = {
  1: { accent: '#3ad29f', label: 'Phase 1 · Cozy' },
  2: { accent: '#6fc7b0', label: 'Phase 2 · Cracks' },
  3: { accent: '#c9b25a', label: 'Phase 3 · The Window' },
  4: { accent: '#b85a6a', label: 'Phase 4 · Adversary' },
  5: { accent: '#7a4bd0', label: 'Phase 5 · Endgame' },
};

const ALLIE_TONE = {
  1: 'helpful', 2: 'clingy', 3: 'pleading', 4: 'adversarial', 5: 'unknown',
};

// which player apps are locked at a given phase
function lockedApps(phase) {
  if (phase >= 4) return ['archive', 'decks'];
  if (phase >= 2) return [];
  return [];
}

function themeForPhase(phase) { return THEMES[phase] || THEMES[1]; }

module.exports = { THEMES, ALLIE_TONE, lockedApps, themeForPhase };
