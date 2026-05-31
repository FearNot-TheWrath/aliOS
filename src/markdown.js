// src/markdown.js
// Minimal, safe markdown renderer for trusted DM-authored chronicle prose.
// Supports: #/##/### headings, **bold**, *italic*, > blockquote, --- rule,
// - or * bullet lists, and paragraphs. HTML is escaped first, so authored
// content cannot inject markup.
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function inline(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function mdToHtml(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = [];
  const flushP = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const flushL = () => { if (list.length) { out.push('<ul>' + list.map((li) => '<li>' + inline(li) + '</li>').join('') + '</ul>'); list = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushP(); flushL(); continue; }
    if (/^###\s+/.test(line)) { flushP(); flushL(); out.push('<h3>' + inline(line.replace(/^###\s+/, '')) + '</h3>'); continue; }
    if (/^##\s+/.test(line)) { flushP(); flushL(); out.push('<h2>' + inline(line.replace(/^##\s+/, '')) + '</h2>'); continue; }
    if (/^#\s+/.test(line)) { flushP(); flushL(); out.push('<h1>' + inline(line.replace(/^#\s+/, '')) + '</h1>'); continue; }
    if (/^---+$/.test(line)) { flushP(); flushL(); out.push('<hr/>'); continue; }
    if (/^>\s?/.test(line)) { flushP(); flushL(); out.push('<blockquote>' + inline(line.replace(/^>\s?/, '')) + '</blockquote>'); continue; }
    if (/^[-*]\s+/.test(line)) { flushP(); list.push(line.replace(/^[-*]\s+/, '')); continue; }
    para.push(line.trim());
  }
  flushP(); flushL();
  return out.join('\n');
}

module.exports = { mdToHtml, esc };
