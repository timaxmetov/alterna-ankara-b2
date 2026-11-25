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

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_BASE = dirname(ROOT);

export const siteName = (id) => {
  const D = JSON.parse(readFileSync(join(ROOT, 'src/days', id + '.json'), 'utf8'));
  const nn = id.split('.').pop();
  return { name: `alterna-b2-${nn}-${D.design.name.replace(/^b2-/, '')}`, D };
};

for (const id of process.argv.slice(2)) {
  if (!existsSync(join(ROOT, id, 'index.html'))) throw new Error(`${id} не собран: сначала node tools/build.mjs ${id}`);
  const { name, D } = siteName(id);
  const out = join(OUT_BASE, name);
  mkdirSync(out, { recursive: true });
  cpSync(join(ROOT, id), join(out, id), { recursive: true });
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
