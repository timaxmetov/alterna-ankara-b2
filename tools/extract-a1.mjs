// Один раз: иконки вкладок и разметка диалога из опубликованного дня A1 (вкладочный формат платформы).
import { readFileSync, writeFileSync } from 'node:fs';
const h = readFileSync(process.argv[2], 'utf8');
const ic = JSON.parse(readFileSync(new URL('./icons.json', import.meta.url), 'utf8'));
const svgAfter = (needle, from = 0) => { const i = h.indexOf(needle, from); if (i < 0) return null; const s = h.indexOf('<svg', i); return h.slice(s, h.indexOf('</svg>', s) + 6); };
for (const t of ['hedef', 'diyalog', 'sozluk', 'yasiz', 'practice', 'simulator', 'check', 'cheat']) {
  const v = svgAfter(`data-tab="${t}"`);
  if (!v) throw new Error('нет вкладки ' + t);
  ic['tab_' + t] = v;
}
ic.place = svgAfter('class="lx-place"');
const ctrlStart = h.indexOf('<div class="lx-chat__ctrl"');
ic.chat_ctrl = h.slice(ctrlStart, h.indexOf('</div>', ctrlStart) + 6);
writeFileSync(new URL('./icons.json', import.meta.url), JSON.stringify(ic, null, 1));
console.log(Object.keys(ic).join(' '));
console.log(ic.chat_ctrl.replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>'));
