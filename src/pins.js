// src/pins.js
// Resolve what a point of interest should show, given the current phase.
// A manual DM set wins until cleared; otherwise a phase_gate auto-flips
// truth to lie. The display form NEVER includes the hidden truth label.

function effectiveState(pin, phase) {
  if (pin.manual) return pin.state;
  if (pin.phase_gate != null && phase >= pin.phase_gate) return 'lie';
  return pin.state; // default 'truth'
}

function displayPin(pin, state) {
  if (state === 'hidden') {
    return { id: pin.id, x: pin.x, y: pin.y, poi_type: pin.poi_type, label: null, obscured: true };
  }
  const label = state === 'lie' ? (pin.lie_label || '') : (pin.truth_label || '');
  return { id: pin.id, x: pin.x, y: pin.y, poi_type: pin.poi_type, label, obscured: false };
}

module.exports = { effectiveState, displayPin };
