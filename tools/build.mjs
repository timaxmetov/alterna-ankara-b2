// build.mjs — дневные темы Анкары (B2) в формате опубликованных D-гайдов Alterna.
// node tools/build.mjs [d.b2.01 ...]   без аргументов собирает все src/days/*.json
//
// На входе src/days/<id>.json и src/scenes/<design>.svg, на выходе <id>/index.html,
// <id>/lesson-2.html, <id>/exercises.json и <id>/media/*. Разметка повторяет pnpm day:build:
// те же классы kit/v1 (lx, dy, st), те же разделы урока и та же схема exercises.json.
//
// Разметка в текстах дня: *курсив* → <em>, [[tr|перевод]] → кликабельное слово st-w.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { viz, route, opener, cloud, speak } from './viz.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const IC = JSON.parse(readFileSync(join(ROOT, 'tools/icons.json'), 'utf8'));
const CITY = { slug: 'ankara', ru: 'Анкара', ring: 'ANKARA · B2 · ANKARA · B2 · ', level: 'B2' };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plural = (n, [one, few, many]) => {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
};
const words = (s) => String(s).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const strip = (s) => String(s).replace(/\[\[([^|\]]+)\|[^\]]+\]\]/g, '$1').replace(/\*([^*]+)\*/g, '$1');

/** Текст с разметкой дня → HTML. */
const rich = (s) => esc(s)
  .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, (_, tr, ru) =>
    `<button type="button" class="st-w" data-say="${tr}" aria-expanded="false"><span lang="tr">${tr}</span><span class="st-w__ru">${ru}</span></button>`)
  .replace(/\*([^*]+)\*/g, '<em>$1</em>');

/** Детерминированное перемешивание, чтобы сборка не прыгала от запуска к запуску. */
const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const shuffled = (arr, r) => arr.map((x) => [r(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

const ava = (who) => {
  const parts = who.replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/);
  return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].slice(0, 2).replace(/^./, (c) => c.toUpperCase());
};

function bubble(b) {
  const me = b.who === 'Sen';
  return `<div class="st-b${me ? ' st-b--me' : ''}"><span class="st-b__ava" aria-hidden="true" data-ui>${esc(b.ava || ava(b.who))}</span><div class="st-b__body"><span class="st-b__who" lang="tr">${esc(b.who)}</span><p class="st-b__tr" lang="tr" data-say="${esc(b.tr)}">${esc(b.tr)}</p><p class="st-b__ru">${esc(b.ru)}</p></div></div>`;
}
function note(n) {
  const ex = (n.ex || []).map(([tr, ru]) => `<li><b lang="tr" data-say="${esc(tr)}">${esc(tr)}</b><span>${esc(ru)}</span></li>`).join('');
  return `<div class="st-note" role="note"><p class="st-note__h"><span class="st-note__ico">${IC.note}</span><span>Тонкость: ${esc(n.h)}</span></p><p>${rich(n.text)}</p>${ex ? `<ul class="st-note__ex">${ex}</ul>` : ''}</div>`;
}
function quirk(q) {
  return `<div class="st-quirk" role="note"><p class="st-quirk__h"><span class="st-quirk__ico">${IC.quirk}</span><span>Кстати</span></p><p>${rich(q)}</p></div>`;
}
function choice(c, id) {
  const opts = c.opts.map((o) => `<button type="button" class="st-opt" data-ok="${o.ok ? 'true' : 'false'}" data-then="${esc(o.then.replace(/\*([^*]+)\*/g, '«$1»'))}" data-say="${esc(o.tr)}"><b lang="tr">${esc(o.tr)}</b><span>${esc(o.ru)}</span></button>`).join('');
  return `<div class="st-choice" data-choice="${id}">
          <p class="st-choice__q"><span class="st-choice__ico">${IC.choice}</span><span>${esc(c.q)}</span></p>
          <div class="st-choice__opts" data-ui>${opts}</div>
          <p class="st-choice__then" aria-live="polite" hidden></p>
        </div>`;
}
function chapter(ch, i) {
  const body = ch.blocks.map((b, k) => {
    if (b.p) return `<p class="st-p">${rich(b.p)}</p>`;
    if (b.b) return bubble(b.b);
    if (b.note) return note(b.note);
    if (b.quirk) return quirk(b.quirk);
    if (b.choice) return choice(b.choice, `ch${i + 1}-${k + 1}`);
    if (b.viz) return viz(b.viz, IC);
    throw new Error('неизвестный блок в главе ' + (i + 1));
  }).join('\n        ');
  return `      <article class="st-ch" id="ch-${i + 1}" style="--i:${i}">
        <p class="st-ch__k"><span class="st-ch__n" data-ui>${i + 1}</span><span class="st-ch__t">${esc(ch.time)}</span></p>
        <h3 class="st-ch__h">${esc(ch.title)}</h3>
        ${body}
      </article>`;
}

/** Задание «Dinleyelim»: слышишь фразу, выбираешь перевод. Варианты берутся из слов и фраз урока. */
function listening(L, id, r) {
  const pool = [...L.words, ...L.goals];
  const picks = shuffled(pool, r).slice(0, 5);
  return {
    id, lesson: L.n, kind: 'practice', skill: 'situation', difficulty: 1, type: 'multiple_choice',
    instruction: 'Послушай и выбери перевод', description: 'Dinleyelim',
    items: picks.map(([tr, ru], k) => {
      const wrong = shuffled(pool.filter((x) => x[1] !== ru), r).slice(0, 3).map((x) => x[1]);
      const options = shuffled([ru, ...wrong], r);
      return { id: String(k + 1), prompt: 'Что ты слышишь?', say: tr, options, answer: options.indexOf(ru), explanation: `${tr} — ${ru}` };
    }),
  };
}
/** Тест дня: 5 вопросов по словам и фразам, порог 80%. */
function check(L, id, r) {
  const pool = [...L.words, ...L.goals];
  const picks = shuffled(pool, r).slice(0, 5);
  return {
    id, lesson: L.n, kind: 'check', skill: 'situation', type: 'mixed', difficulty: 2,
    instruction: 'Sınav — проверь себя', passPercent: 80,
    items: picks.map(([tr, ru], k) => {
      const toTr = k % 2 === 1 && L.words.some((w) => w[0] === tr);
      const wrong = shuffled(pool.filter((x) => x[0] !== tr), r).slice(0, 3);
      const options = shuffled(toTr ? [tr, ...wrong.map((x) => x[0])] : [ru, ...wrong.map((x) => x[1])], r);
      return {
        id: String(k + 1), type: 'multiple_choice',
        prompt: toTr ? `Как сказать по-турецки: «${ru}»?` : `«${tr}» — это…`,
        options, answer: options.indexOf(toTr ? tr : ru), explanation: `${tr} — ${ru}`,
      };
    }),
  };
}

/** Hazırlık из модели урока дорожной карты: вопрос до истории и знакомые слова, которые можно послушать. */
const prep = (p) => p ? `      <div class="dy-prep">
        <p class="dy-prep__h"><span lang="tr">Hazırlık</span> · перед историей</p>
        <p>${rich(p.q)}</p>
        <p class="dy-prep__w" data-ui>${p.chips.map((w) => `<button type="button" class="lx-chip lx-chip--tr dy-prep__chip" lang="tr" data-say="${esc(w)}">${esc(w)}</button>`).join('')}</p>
      </div>\n` : '';

/** Культурный слой дорожной карты: «как здесь принято», одна формула или правило на день. */
const culture = (c) => c ? `      <aside class="dy-culture"><p class="dy-culture__h"><span class="dy-culture__ico">${IC.culture}</span><span>Как здесь принято</span></p><p>${rich(c)}</p></aside>\n` : '';

/** Поведение страницы сверх kit: анимация сцены (как design.js у дней A1) и самопроверка «скрыть перевод». */
const PAGE_JS = `<script>
(() => {
  document.querySelectorAll('[data-hide-ru]').forEach((t) => {
    const s = t.closest('section');
    t.addEventListener('click', () => {
      const on = s.classList.toggle('is-hide-ru');
      t.setAttribute('aria-pressed', on);
      t.textContent = on ? 'Показать перевод' : 'Скрыть перевод';
      s.querySelectorAll('.is-peek').forEach((x) => x.classList.remove('is-peek'));
    });
    s.addEventListener('click', (e) => {
      const row = e.target.closest('.dy-goal__w, .st-words li');
      if (row && s.classList.contains('is-hide-ru') && !e.target.closest('button')) row.classList.toggle('is-peek');
    }, true);
  });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !window.gsap) return;
  const q = (c) => document.querySelectorAll('.lx-scene .' + c);
  gsap.from(q('an-drive'), { x: -380, duration: 2.2, ease: 'power3.out', delay: 0.2 });
  gsap.from(q('an-sun'), { y: 40, opacity: 0, duration: 1.6, ease: 'power2.out' });
  gsap.from(q('an-pop'), { y: 18, opacity: 0, duration: 0.7, ease: 'back.out(2)', stagger: 0.15, delay: 1.2 });
  gsap.to(q('an-bob'), { y: -4, duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: 0.4 });
  gsap.to(q('an-drift'), { x: 24, duration: 9, ease: 'sine.inOut', yoyo: true, repeat: -1 });
})();
</script>`;

/** Иконка вкладки: буква A на цвете дня. */
const favicon = (accent) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${accent}"/><path d="M20 48 32 14l12 34M24.5 36h15" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`);

const sec = (key, words, extra = '') => `<section data-section="${key}" data-words="${words}"${extra}`;
const kicker = (icon, tr) => `<p class="lx-kicker"><span class="lx-kicker__ico">${icon}</span><span lang="tr">${tr}</span></p>`;

function page(D, L, scene, exList) {
  const many = D.lessons.length > 1;
  const file = L.n === 1 ? 'index.html' : `lesson-${L.n}.html`;
  const part = many ? ` · часть ${L.n}` : '';
  const choices = L.chapters.reduce((s, c) => s + c.blocks.filter((b) => b.choice).length, 0);
  const tasks = L.practice.length + 1;
  const nav = many
    ? `<nav class="lx-lessons" aria-label="Части дня">${D.lessons.map((x) => `<a href="${x.n === 1 ? 'index.html' : `lesson-${x.n}.html`}"${x.n === L.n ? ' aria-current="page"' : ''}>${x.n}</a>`).join('')}</nav>`
    : '';
  // Порядок разделов повторяет анатомию урока Yeni İstanbul (book_basis в дорожной карте):
  // открытие юнита (BECERİLER / DİL BİLGİSİ / KELİMELER) → Hedef dil → Hazırlık → Okuma → Dil bilgisi →
  // Söz varlığı → Alıştırmalar со сквозной нумерацией → Ya siz? → Dinleme → Yazma → Konuşma → Özet → Sınav.
  const SECTIONS = [
    ['p-acilis', 'Açılış'], ['p-hazirlik', 'Hazırlık'], ['p-hikaye', 'Okuma'], ['p-dilbilgisi', 'Dil bilgisi'],
    ['p-sozluk', 'Kelimeler'], ['p-practice', 'Alıştırma'], ['p-yasiz', 'Ya siz?'], ['p-dinleme', 'Dinleme'],
    ['p-yazma', 'Yazma'], ['p-konusma', 'Konuşma'], ['p-ozet', 'Özet'], ['p-check', 'Sınav'],
  ];
  const toc = SECTIONS.map(([id, t]) => `<li><a href="#${id}" data-toc="${id}"><span lang="tr">${t}</span></a></li>`).join('');
  const storyText = L.chapters.map((c) => c.blocks.map((b) => b.p || b.b?.tr || b.b?.ru || b.note?.text || b.quirk || b.choice?.q || '').join(' ')).join(' ');
  const trText = [
    ...L.chapters.flatMap((c) => c.blocks.map((b) => [b.b?.tr, b.note?.text, ...(b.note?.ex || []).map((x) => x[0]), b.quirk, ...(b.choice?.opts || []).map((o) => o.tr)].filter(Boolean).join(' '))),
    ...L.goals.map((g) => g[0]), L.yasiz.tr, L.yasiz.model, ...(L.konusma?.model || []).map((m) => m[1]),
  ].join(' ');
  const goalLi = ([tr, ru], i) => `        <li class="dy-goal__i" style="--i:${i}"><span class="dy-goal__n" data-ui>${i + 1}</span><span class="dy-goal__w"><b lang="tr" data-say="${esc(tr)}">${esc(tr)}</b><span>${esc(ru)}</span></span><button type="button" class="lx-say" data-say="${esc(tr)}" aria-label="Послушать" data-ui><span class="lx-say__ico">${IC.say}</span></button></li>`;
  const goals = L.goals.map(goalLi).join('\n');
  const wordsHtml = L.words.map(([tr, ru]) => `        <li><b lang="tr" data-say="${esc(tr)}">${esc(tr)}</b><span>${esc(ru)}</span></li>`).join('\n');
  const practice = exList.filter((e) => e.kind === 'practice');
  let no = 0;
  const task = (e) => `      <div class="dy-task" data-kit="${e._task.kit}"><p class="dy-rubric"><span class="dy-no" data-ui>${++no}</span><span lang="tr">${esc(e._task.rubric)}</span></p><a-exercise ref="${e.id}"${e.type === 'custom' ? ' data-free' : ''}></a-exercise></div>`;
  const drill = practice.filter((e) => e._task.kit !== 'write' && e._task.kit !== 'dinle').map(task).join('\n');
  const listen = practice.filter((e) => e._task.kit === 'dinle').map(task).join('\n');
  const write = practice.filter((e) => e._task.kit === 'write').map(task).join('\n');
  const checkId = exList.find((e) => e.kind === 'check').id;
  const next = many && L.n < D.lessons.length
    ? `\n      <a class="lx-next" href="lesson-${L.n + 1}.html">Часть ${L.n + 1} →</a>`
    : D._next
      ? `\n      <a class="lx-next" href="../${D._next.id}/" data-next-day="${D._next.id}">День ${D._next.day}: ${esc(D._next.title_ru)} →</a>`
      : '\n      ';
  const cast = [...new Set(L.chapters.flatMap((c) => c.blocks.filter((b) => b.b && b.b.who !== 'Sen').map((b) => b.b.who)))];
  const vizCount = L.chapters.reduce((s, c) => s + c.blocks.filter((b) => b.viz).length, 0) + (L.after_story || []).length + (L.grammar?.viz || []).length + 4;
  const op = L.opener || { skills: [L.can_do], grammar: [], words: [] };
  const hedefLines = (L.hedef?.lines || L.goals.slice(0, 3)).map(goalLi).join('\n');
  const head = (icon, tr, h2, hint = '') => `      <div class="lx-ph">
        ${kicker(icon, tr)}
        <h2>${h2}</h2>${hint ? `\n        <p class="lx-hint">${hint}</p>` : ''}
      </div>`;

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light">
<meta name="alterna:topic" content="${D.id}">
<meta name="alterna:version" content="1">
<meta name="alterna:lesson" content="${L.n}">
<meta name="alterna:kind" content="day">
<title>День ${D.day}. ${esc(D.title_ru)}${part}</title>
<meta name="description" content="Alterna · ${CITY.level} · ${CITY.ru}, день ${D.day}. ${esc(strip(L.hook))}">
<meta name="theme-color" content="${D.design.accent}">
<meta property="og:type" content="article">
<meta property="og:title" content="День ${D.day}. ${esc(D.title_ru)} · Alterna ${CITY.level}">
<meta property="og:description" content="${esc(D.can_do)}">
<meta property="og:image" content="media/og.png">
<link rel="icon" href="${favicon(D.design.accent)}">
<link rel="stylesheet" href="../kit/v1/kit.css">
<link rel="stylesheet" href="../kit/v1/lexicon.css">
<link rel="stylesheet" href="../kit/v1/day.css">
<link rel="stylesheet" href="../kit/v1/story.css">
<link rel="stylesheet" href="../kit/v1/lexicon-fonts.css">
<link rel="stylesheet" href="media/design.css">
</head>
<body class="lx dy st" data-city="${CITY.slug}" data-lessons="${D.lessons.length}" data-design="${D.design.name}">
<!-- Собрано tools/build.mjs из src/days/${D.id}.json. Руками не править. -->
<a class="dy-skip" href="#p-hikaye">К истории дня</a>
<header class="lx-app">
  <span class="lx-app__logo"><span class="lx-app__ico">${IC.map}</span></span>
  <div class="lx-app__t"><b>Alterna · ${CITY.level} · день ${D.day}</b><small>${esc(D.place_ru)} · <span lang="tr">${esc(D.place_tr)}</span></small></div>
  ${nav}
  <div class="lx-app__prog" title="Пройдено разделов урока"><svg class="lx-ring lx-app__ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="lx-ring__bg" cx="18" cy="18" r="15.9155"/><circle class="lx-ring__fg" cx="18" cy="18" r="15.9155" pathLength="100" stroke-dasharray="0 100"/><text x="18" y="21" text-anchor="middle">0%</text></svg></div>
</header>
<main>
  ${sec('intro', words(D.title_ru + ' ' + L.hook) + 8, ' class="lx-hero">')}
      <div class="lx-scene" aria-hidden="true" data-ui>${scene}</div>
      <p class="lx-tag">${CITY.level} · ${CITY.ru} · день ${D.day}</p>
      <h1>${esc(D.title_ru)}</h1>
      <p class="lx-hero__tr" lang="tr">${esc(D.title_tr)}</p>
      <p class="lx-hero__meta"><span class="lx-hero__pin">${IC.pin}</span><span>${esc(D.place_ru)}</span>${many ? ` · часть ${L.n} из ${D.lessons.length}` : ''}</p>
      <p class="lx-hero__intro st-hook">${rich(L.hook)}</p>
      <p class="st-cast"><span>В истории:</span> ${cast.map((c) => `<b lang="tr">${esc(c)}</b>`).join(', ')}</p>
      <ul class="lx-stats" data-ui>
        <li><b>${L.minutes}</b><span>${plural(L.minutes, ['минута', 'минуты', 'минут'])}</span></li><li><b>${L.chapters.length}</b><span>${plural(L.chapters.length, ['глава', 'главы', 'глав'])}</span></li><li><b>${vizCount}</b><span>${plural(vizCount, ['схема', 'схемы', 'схем'])}</span></li><li><b>${practice.length}</b><span>${plural(practice.length, ['задание', 'задания', 'заданий'])}</span></li>
      </ul>
  </section>

  <nav class="st-toc" data-scrollbar aria-label="Разделы урока">
    <ol class="st-toc__l">
      ${toc}
    </ol>
    <span class="st-toc__bar" aria-hidden="true"></span>
  </nav>

  ${sec('acilis', words(op.skills.join(' ') + op.grammar.join(' ') + op.words.join(' ')), ' id="p-acilis" class="st-sec">')}
${head(IC.k_zet, 'Ünite açılışı', 'Что будет сегодня', 'Как в начале юнита учебника: умения, грамматика и слова дня.')}
${opener(op)}
      <div class="vz vz-hedef">
        <p class="vz__h"><span lang="tr">Hedef dil</span> <span>что ты сегодня скажешь</span></p>
        <p class="vz-hedef__forms">${op.grammar.map((g) => `<span class="vz-chip" lang="tr">${esc(g)}</span>`).join('')}</p>
        <ol class="dy-goal">
${hedefLines}
        </ol>
      </div>
  </section>

  ${sec('hazirlik', 20, ' id="p-hazirlik" class="st-sec">')}
${head(IC.k_yasiz, 'Hazırlık çalışması', 'Подготовка', 'До текста: вспомни знакомое и посмотри, где пройдёт день.')}
${prep(L.prep)}${route(L.chapters)}  </section>

  ${sec('hikaye', words(strip(storyText)), ' id="p-hikaye" class="st-sec">')}
      <div class="lx-ph st-head">
        ${kicker(IC.k_hikye, 'Okuma')}
        <h2>История дня</h2>
        <p class="lx-hint">Нажимай на турецкие слова: услышишь их и увидишь перевод. Когда герою нужно ответить, выбирай сам.</p>
      </div>
      <div class="st-chs">
${L.chapters.map(chapter).join('\n')}
      </div>
      <p class="st-end">${rich(L.end)}</p>
${(L.after_story || []).map((v) => '      ' + viz(v, IC)).join('\n')}
  </section>

  ${sec('dilbilgisi', 40, ' id="p-dilbilgisi" class="st-sec">')}
${head(IC.k_altrma, 'Dil bilgisi', esc(L.grammar?.title || 'Грамматика дня'), esc(L.grammar?.hint || 'Разбираем форму по шагам: смотри, как меняется фраза.'))}
${(L.grammar?.viz || []).map((v) => '      ' + viz(v, IC)).join('\n')}
  </section>

  ${sec('sozluk', words(L.words.flat().join(' ')), ' id="p-sozluk" class="st-sec">')}
${head(IC.k_zet, 'Söz varlığı', 'Слова дня', 'Чем крупнее слово, тем чаще оно звучало в истории. Нажми, чтобы услышать.')}
${cloud(L.words, trText)}
      <div class="dy-selfcheck" data-ui><button type="button" class="lx-btn lx-btn--ghost" data-hide-ru aria-pressed="false">Скрыть перевод</button><span>Проверь себя: вспомни перевод, потом нажми на строку.</span></div>
      <ul class="st-words">
${wordsHtml}
      </ul>
  </section>

  ${sec('practice', 12, ' id="p-practice" class="st-sec">')}
${head(IC.k_altrma, 'Alıştırmalar', 'Закрепим', 'Задания пронумерованы подряд через весь урок, как в учебнике.')}
${drill}
  </section>

  ${sec('yasiz', words(L.yasiz.tr + ' ' + L.yasiz.ru + ' ' + L.yasiz.model), ' id="p-yasiz" class="st-sec">')}
${head(IC.k_yasiz, 'Ya siz?', 'А у тебя?', 'Теперь история про тебя. Ответь вслух, потом сравни с образцом.')}
      <div class="dy-you">
        <p class="dy-you__q" lang="tr" data-say="${esc(L.yasiz.tr)}">${esc(L.yasiz.tr)}</p>
        <p>${esc(L.yasiz.ru)}</p>
        <button type="button" class="lx-btn lx-btn--ghost dy-you__btn" data-reveal aria-expanded="false">Показать образец</button>
        <p class="dy-you__model" lang="tr" data-say="${esc(L.yasiz.model)}" hidden>${esc(L.yasiz.model)}</p>
      </div>
${culture(L.culture)}  </section>

  ${sec('dinleme', 12, ' id="p-dinleme" class="st-sec">')}
${head(IC.k_hikye, 'Dinleme', 'Аудирование', 'Слушай фразу и выбирай перевод. Можно переслушать.')}
${listen}
  </section>

  ${sec('yazma', 12, ' id="p-yazma" class="st-sec">')}
${head(IC.k_altrma, 'Yazma', 'Письмо', 'Свой короткий текст по образцу дня.')}
${write}
  </section>

  ${sec('konusma', 30, ' id="p-konusma" class="st-sec">')}
${head(IC.k_yasiz, 'Konuşma', 'Говорение', 'Закрой текст и проговори сцену вслух, как в учебнике: <span lang="tr">Kitabı kapatalım</span>.')}
${L.konusma ? speak(L.konusma, IC) : ''}
  </section>

  ${sec('ozet', words(L.goals.flat().join(' ')), ' id="p-ozet" class="st-sec">')}
${head(IC.k_zet, 'Özet', 'Что ты унёс из истории', esc(L.can_do))}
      <div class="dy-selfcheck" data-ui><button type="button" class="lx-btn lx-btn--ghost" data-hide-ru aria-pressed="false">Скрыть перевод</button><span>Вспомни перевод, потом нажми на строку.</span></div>
      <ol class="dy-goal">
${goals}
      </ol>
${(L.after_ozet || []).map((v) => '      ' + viz(v, IC)).join('\n')}
  </section>

  ${sec('check', 13, ' id="p-check" class="st-sec">')}
      <div class="lx-ph">
        ${kicker(IC.k_snav, 'Sınav')}
        <h2>Проверь себя</h2>
        <p>Вопросы по фразам и словам истории. Нужно 80%, чтобы день засчитался.</p>
      </div>
      <a-quiz ref="${checkId}"></a-quiz>${next}
  </section>
</main>

<template data-achievement data-title="День ${D.day} пройден" data-text="${esc(D.title_ru)}. ${esc(D.can_do)}">
  <svg class="lx-stamp" viewBox="0 0 160 160" aria-hidden="true">
    <defs><path id="lx-ring" d="M80 80m-57 0a57 57 0 1 1 114 0a57 57 0 1 1-114 0"/></defs>
    <circle cx="80" cy="80" r="74" fill="var(--lx-paper)" stroke="var(--lx-accent)" stroke-width="5"/>
    <circle cx="80" cy="80" r="45" fill="none" stroke="var(--lx-accent)" stroke-width="1.5" stroke-dasharray="3 4"/>
    <text font-size="12.5" font-weight="800" letter-spacing="2.6" fill="var(--lx-accent)"><textPath href="#lx-ring">${CITY.ring}</textPath></text>
    <text class="lx-stamp__n" x="80" y="88" text-anchor="middle" font-size="38" font-weight="900" fill="var(--lx-accent)">${D.day}</text>
    <text x="80" y="106" text-anchor="middle" font-size="11" font-weight="800" letter-spacing="2" fill="var(--lx-ink)">GÜN</text>
  </svg>
</template>

<script src="../kit/v1/gsap.min.js"></script>
<script type="module" src="../kit/v1/kit.js"></script>
<script src="../kit/v1/tracker.js" defer></script>
<script src="../kit/v1/day.js" defer></script>
<script src="../kit/v1/story.js" defer></script>
${PAGE_JS}
<script>
${readFileSync(join(ROOT, 'tools/viz.js'), 'utf8').trim()}
</script>
</body>
</html>
`;
}

function design(D) {
  const tpl = readFileSync(join(ROOT, 'tools/design.css'), 'utf8');
  return tpl.replaceAll('__NAME__', D.design.name).replaceAll('__ACCENT__', D.design.accent) + readFileSync(join(ROOT, 'tools/viz.css'), 'utf8') + readFileSync(join(ROOT, 'tools/viz-book.css'), 'utf8');
}

function buildDay(id) {
  const D = JSON.parse(readFileSync(join(ROOT, 'src/days', id + '.json'), 'utf8'));
  const scene = readFileSync(join(ROOT, 'src/scenes', D.design.name + '.svg'), 'utf8').trim();
  const r = rng([...id].reduce((s, c) => s + c.charCodeAt(0), 0));
  const plan = JSON.parse(readFileSync(join(ROOT, 'src/plan.json'), 'utf8'));
  const nx = plan[plan.findIndex((p) => p.id === id) + 1];
  if (nx && existsSync(join(ROOT, 'src/days', nx.id + '.json'))) D._next = nx;
  const out = join(ROOT, id);
  mkdirSync(join(out, 'media'), { recursive: true });

  let n = 0;
  const all = [];
  D.lessons.forEach((L, i) => {
    L.n = i + 1;
    const list = L.practice.map((p) => ({
      id: `${id}.ex${++n}`, lesson: L.n, kind: 'practice', skill: 'situation', difficulty: p.difficulty ?? 2,
      type: p.type, instruction: p.instruction, description: p.rubric, items: p.items, _task: p,
    }));
    const dinle = listening(L, `${id}.ex${++n}`, r);
    dinle._task = { kit: 'dinle', rubric: 'Dinleyelim.' };
    list.push(dinle);
    list.push(check(L, `${id}.check${L.n}`, r));
    all.push(...list);
    writeFileSync(join(out, L.n === 1 ? 'index.html' : `lesson-${L.n}.html`), page(D, L, scene, list));
  });

  const clean = all.map(({ _task, ...e }) => e);
  writeFileSync(join(out, 'exercises.json'), JSON.stringify({ topic: id, exercises: clean }, null, 2) + '\n');
  writeFileSync(join(out, 'media/design.css'), design(D));
  writeFileSync(join(out, 'media/design.json'), JSON.stringify({ name: D.design.name }) + '\n');
  writeFileSync(join(out, 'media/scene.html'), scene + '\n');
  return D;
}

const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(join(ROOT, 'src/days')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
const built = ids.map(buildDay);

// оглавление сайта: дни Анкары по порядку маршрута
const plan = JSON.parse(readFileSync(join(ROOT, 'src/plan.json'), 'utf8'));
const have = new Set(readdirSync(ROOT).filter((d) => /^d\.b2\.\d+$/.test(d) && existsSync(join(ROOT, d, 'index.html'))));
writeFileSync(join(ROOT, 'index.html'), readFileSync(join(ROOT, 'tools/index.tpl.html'), 'utf8')
  .replace('<!--DAYS-->', plan.map((p) => {
    const ok = have.has(p.id);
    return `<li class="${ok ? 'on' : 'off'}">${ok ? `<a href="${p.id}/">` : '<span>'}<b>${p.day}</b><span class="t">${esc(p.title_ru)}<small lang="tr">${esc(p.title_tr)}</small></span><span class="u">${esc(p.unit)}</span>${ok ? '</a>' : '</span>'}</li>`;
  }).join('\n'))
  .replace('<!--COUNT-->', `${have.size} из ${plan.length}`));
console.log('собрано:', built.map((d) => d.id).join(', '), `· в оглавлении ${have.size}/${plan.length}`);
