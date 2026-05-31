// src/deckmaps.js
// The six decks of the descent, top (Crown) to bottom (Deck Zero).
// map.shapes use normalized 0..1 coordinates. Authored as the starting
// schematics; editable later from the console.
const hull = { t: 'hull', x: 0.05, y: 0.04, w: 0.9, h: 0.92, rx: 0.07 };
const spine = { t: 'corridor', x: 0.46, y: 0.08, w: 0.08, h: 0.84 };

const DECKS = [
  {
    name: 'Crown', depth: 1,
    map: { shapes: [
      hull, spine,
      { t: 'ellipse', cx: 0.5, cy: 0.32, rx: 0.3, ry: 0.18, label: 'Gardens' },
      { t: 'room', x: 0.12, y: 0.62, w: 0.3, h: 0.24 },
      { t: 'room', x: 0.58, y: 0.62, w: 0.3, h: 0.24 },
      { t: 'label', x: 0.5, y: 0.92, text: 'Observation' },
    ] },
  },
  {
    name: 'Commons', depth: 2,
    map: { shapes: [
      hull, spine,
      { t: 'room', x: 0.12, y: 0.12, w: 0.26, h: 0.2 },
      { t: 'room', x: 0.62, y: 0.12, w: 0.26, h: 0.2 },
      { t: 'room', x: 0.12, y: 0.36, w: 0.26, h: 0.22 },
      { t: 'room', x: 0.62, y: 0.36, w: 0.26, h: 0.22 },
      { t: 'ellipse', cx: 0.5, cy: 0.74, rx: 0.28, ry: 0.16, label: 'Rec-Ring' },
      { t: 'label', x: 0.25, y: 0.1, text: 'School' },
      { t: 'label', x: 0.5, y: 0.95, text: 'stairs down' },
    ] },
  },
  {
    name: 'Works', depth: 3,
    map: { shapes: [
      hull, spine,
      { t: 'corridor', x: 0.12, y: 0.46, w: 0.76, h: 0.06 },
      { t: 'room', x: 0.12, y: 0.12, w: 0.3, h: 0.28 },
      { t: 'room', x: 0.58, y: 0.12, w: 0.3, h: 0.28 },
      { t: 'room', x: 0.12, y: 0.58, w: 0.3, h: 0.3 },
      { t: 'room', x: 0.58, y: 0.58, w: 0.3, h: 0.3 },
      { t: 'label', x: 0.5, y: 0.5, text: 'Workfloor' },
    ] },
  },
  {
    name: 'Undercroft', depth: 4,
    map: { shapes: [
      hull, spine,
      { t: 'room', x: 0.14, y: 0.16, w: 0.24, h: 0.22 },
      { t: 'room', x: 0.6, y: 0.2, w: 0.26, h: 0.3 },
      { t: 'corridor', x: 0.2, y: 0.6, w: 0.6, h: 0.06 },
      { t: 'room', x: 0.3, y: 0.7, w: 0.4, h: 0.18 },
      { t: 'label', x: 0.5, y: 0.12, text: 'sealed access' },
    ] },
  },
  {
    name: 'Deep Works', depth: 5,
    map: { shapes: [
      hull, spine,
      { t: 'corridor', x: 0.12, y: 0.3, w: 0.76, h: 0.06 },
      { t: 'corridor', x: 0.12, y: 0.66, w: 0.76, h: 0.06 },
      { t: 'room', x: 0.14, y: 0.4, w: 0.28, h: 0.2 },
      { t: 'room', x: 0.58, y: 0.4, w: 0.28, h: 0.2 },
      { t: 'label', x: 0.5, y: 0.9, text: 'drone bays' },
    ] },
  },
  {
    name: 'Deck Zero', depth: 6,
    map: { shapes: [
      hull,
      { t: 'ellipse', cx: 0.5, cy: 0.4, rx: 0.22, ry: 0.16, label: 'Window' },
      { t: 'room', x: 0.38, y: 0.66, w: 0.24, h: 0.22 },
      { t: 'label', x: 0.5, y: 0.94, text: 'CORE' },
    ] },
  },
];

module.exports = { DECKS };
