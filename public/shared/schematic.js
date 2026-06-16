// public/shared/schematic.js
// Renders a deck map_json (normalized 0..1 shapes) to SVG inner markup,
// in a 0..1000 viewBox. Loaded by both the player app and the DM console.
(function (global) {
  const S = 1000;
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function schematicSvg(map) {
    if (!map || !Array.isArray(map.shapes)) return '';
    return map.shapes.map((sh) => {
      if (sh.t === 'hull') {
        return `<rect x="${sh.x*S}" y="${sh.y*S}" width="${sh.w*S}" height="${sh.h*S}" rx="${(sh.rx||0.05)*S}" fill="#0a1814" stroke="#2f5a51" stroke-width="3"/>`;
      }
      if (sh.t === 'corridor' || sh.t === 'room') {
        const fill = sh.t === 'room' ? '#102923' : '#13332c';
        return `<rect x="${sh.x*S}" y="${sh.y*S}" width="${sh.w*S}" height="${sh.h*S}" fill="${fill}" stroke="#27463f"/>`;
      }
      if (sh.t === 'ellipse') {
        const ring = `<ellipse cx="${sh.cx*S}" cy="${sh.cy*S}" rx="${sh.rx*S}" ry="${sh.ry*S}" fill="none" stroke="#3ad29f" stroke-width="3" stroke-dasharray="6 5" opacity=".7"/>`;
        const label = sh.label ? `<text x="${sh.cx*S}" y="${sh.cy*S}" fill="#6fd8bf" font-size="22" text-anchor="middle">${esc(sh.label)}</text>` : '';
        return ring + label;
      }
      if (sh.t === 'label') {
        return `<text x="${sh.x*S}" y="${sh.y*S}" fill="#7fb8ac" font-size="22" text-anchor="middle">${esc(sh.text)}</text>`;
      }
      return '';
    }).join('');
  }
  global.Schematic = { schematicSvg, esc, S };
})(window);
