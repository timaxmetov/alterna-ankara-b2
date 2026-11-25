// Один раз: вынуть иконки из опубликованного дня B1, чтобы разметка совпадала с kit.
import { readFileSync, writeFileSync } from 'node:fs';
const src = process.argv[2];
const h = readFileSync(src, 'utf8');
const grab = (cls) => {
  const i = h.indexOf(`<span class="${cls}">`);
  if (i < 0) return null;
  const s = h.indexOf('<svg', i), e = h.indexOf('</svg>', s) + 6;
  return h.slice(s, e);
};
const ic = {
  map: grab('lx-app__ico'), pin: grab('lx-hero__pin'), note: grab('st-note__ico'),
  quirk: grab('st-quirk__ico'), choice: grab('st-choice__ico'), say: grab('lx-say__ico'),
};
const re = /<span class="lx-kicker__ico">(<svg[\s\S]*?<\/svg>)<\/span><span lang="tr">([^<]+)<\/span>/g;
for (const m of h.matchAll(re)) ic['k_' + m[2].replace(/[^A-Za-z]/g, '').toLowerCase()] = m[1];
for (const [k, v] of Object.entries(ic)) if (!v) throw new Error('missing ' + k);
writeFileSync(new URL('./icons.json', import.meta.url), JSON.stringify(ic, null, 1));
console.log(Object.keys(ic).join(' '));
