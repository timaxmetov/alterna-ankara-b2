// export.mjs — каждый день отдельным сайтом в своей папке с уникальным именем.
// node tools/export.mjs d.b2.01 [d.b2.02 ...]
//
// Результат: C:\Users\Hp\claudee\alterna-b2-<NN>-<slug>\
//   d.b2.NN/   — гайд дня в точности в формате платформы (как d.b1.NN в alterna-guides),
//                его без правок переносят в общую архитектуру;
//   kit/v1/    — копия движка, чтобы сайт работал сам по себе;
//   index.html — переход на d.b2.NN/;
//   README.md  — откуда сайт и как его перенести.
// Имя папки = имя репозитория на GitHub.

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_BASE = dirname(ROOT);

export const siteName = (id) => {
  const D = JSON.parse(readFileSync(join(ROOT, 'src/days', id + '.json'), 'utf8'));
  const nn = id.split('.').pop();
  return { name: `alterna-b2-${nn}-${D.design.name.replace(/^b2-/, '')}`, D };
};

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/** Картинка для превью ссылки (og:image) 1200×630 из сцены дня. */
function ogImage(media) {
  const tmp = join(media, '_og.html');
  writeFileSync(tmp, `<!doctype html><style>html,body{margin:0;width:1200px;height:630px;overflow:hidden}svg{display:block;width:1200px;height:630px}</style>${readFileSync(join(media, 'scene.html'), 'utf8')}`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1200,630',
    `--screenshot=${join(media, 'og.png')}`, pathToFileURL(tmp).href], { stdio: 'ignore' });
  rmSync(tmp);
}

/** В отдельном сайте ссылка «следующий день» ведёт на сайт следующего дня; в папке для платформы она относительная. */
function linkNextDay(dir) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.html'))) {
    const p = join(dir, f);
    const h = readFileSync(p, 'utf8').replace(/href="\.\.\/(d\.b2\.\d+)\/" data-next-day="\1"/g, (m, nid) =>
      existsSync(join(ROOT, 'src/days', nid + '.json')) ? `href="${SITE}${siteName(nid).name}/${nid}/" data-next-day="${nid}"` : m);
    writeFileSync(p, h);
  }
}
const SITE = 'https://timaxmetov.github.io/';

for (const id of process.argv.slice(2)) {
  if (!existsSync(join(ROOT, id, 'index.html'))) throw new Error(`${id} не собран: сначала node tools/build.mjs ${id}`);
  const { name, D } = siteName(id);
  const out = join(OUT_BASE, name);
  mkdirSync(out, { recursive: true });
  cpSync(join(ROOT, id), join(out, id), { recursive: true });
  ogImage(join(out, id, 'media'));
  linkNextDay(join(out, id));
  cpSync(join(ROOT, 'kit'), join(out, 'kit'), { recursive: true });
  writeFileSync(join(out, '.nojekyll'), '');
  writeFileSync(join(out, 'index.html'), `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>День ${D.day}. ${D.title_ru}</title>
<meta http-equiv="refresh" content="0; url=${id}/"><link rel="canonical" href="${id}/"></head>
<body><a href="${id}/">День ${D.day}. ${D.title_ru}</a></body></html>
`);
  writeFileSync(join(out, 'README.md'), `# ${name}

Alterna · B2 · Анкара · день ${D.day}: **${D.title_ru}** (${D.title_tr}).

Интерактивный урок по дневной теме дорожной карты Alterna (\`${id}\`).

- \`${id}/\` — сам гайд в формате платформы (как \`d.b1.NN\` в alterna-guides). Для переноса в общую архитектуру копируется эта папка целиком, рядом с остальными \`d.*\`.
- \`kit/v1/\` — копия общего движка kit, нужна только чтобы сайт работал отдельно. При переносе не копируется: на платформе он уже есть.
- \`index.html\` — переход на \`${id}/\`.

Собрано из \`alterna-ankara-b2/src/days/${id}.json\` скриптом \`tools/build.mjs\`.
`);
  console.log(`${id} → ${out}`);
}
