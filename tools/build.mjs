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
  // сцены: «Сцена N →» и остановки маршрута открывают вкладку Diyalog на нужной сцене
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const toPanel = () => {
    const p = document.getElementById('p-diyalog');
    if (p) window.scrollTo({ top: p.getBoundingClientRect().top + scrollY - 70, behavior: RM ? 'auto' : 'smooth' });
  };
  const scene = (i) => {
    const t = document.getElementById('t-diyalog');
    if (t && t.getAttribute('aria-selected') !== 'true') t.click();
    setTimeout(() => { const b = document.querySelector('[data-dlg="' + i + '"]'); if (b) b.click(); toPanel(); }, 60);
  };
  document.querySelectorAll('[data-dlg-go]').forEach((b) => b.addEventListener('click', () => scene(Number(b.dataset.dlgGo))));
  document.querySelectorAll('.vz-route [data-route]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    scene(Number(a.dataset.route.replace('ch-', '')) - 1);
  }));
  if (RM || !window.gsap) return;
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

/** Диалог главы: реплики появляются по одной (lx-chat из kit, как в днях A1). Повествование — одна строка-подпись. */
function dlgBox(ch, i, all) {
  const lines = ch.blocks.filter((b) => b.b).map((b, k) => {
    const me = b.b.who === 'Sen';
    return `          <div class="lx-msg${me ? ' lx-msg--me' : ''}" data-line="${k}"><span class="lx-msg__ava" aria-hidden="true" data-ui>${esc(b.b.ava || ava(b.b.who))}</span><span class="lx-msg__who" lang="tr">${esc(b.b.who)}</span><p class="lx-msg__tr" lang="tr" data-say="${esc(b.b.tr)}">${esc(b.b.tr)}</p><p class="lx-msg__ru">${esc(b.b.ru)}</p></div>`;
  }).join('\n');
  const [t, ...pl] = ch.time.split('·').map((s) => s.trim());
  const cap = ch.caption || '';
  const quirks = ch.blocks.filter((b) => b.quirk).map((b) => `        <details class="vz-more"><summary><span class="vz-more__ico">${IC.quirk}</span>Кстати</summary><p>${rich(b.quirk)}</p></details>`).join('\n');
  const vizs = ch.blocks.filter((b) => b.viz && ['map', 'scale', 'bars'].includes(b.viz.type)).map((b) => '        ' + viz(b.viz, IC)).join('\n');
  return `      <div class="lx-dlg${i === 0 ? ' is-on' : ''}" data-dlg-box="${i}" id="ch-${i + 1}">
        <div class="lx-dlg__head"><h3>${esc(ch.title)}</h3><span class="lx-badge">${esc(t)}</span></div>
        <p class="lx-place"><span class="lx-ico">${IC.place}</span><span lang="tr">${esc(pl.join(' · '))}</span></p>${cap ? `\n        <p class="vz-cap">${rich(cap)}</p>` : ''}
        <div class="lx-chat" data-chat="${i}">
${lines}
        </div>
        ${IC.chat_ctrl}
${vizs}${vizs ? '\n' : ''}${quirks}
        ${i < all.length - 1 ? `<button type="button" class="lx-btn lx-btn--ghost vz-scene-next" data-dlg-go="${i + 1}">Сцена ${i + 2}: ${esc(all[i + 1].title)} →</button>` : ''}
      </div>`;
}

/** Переключатель сцен над диалогами: kit сам ставит aria-pressed и is-on по data-dlg. */
const scenes = (chapters) => `      <div class="vz-scenes" role="group" aria-label="Сцены дня" data-ui>${chapters.map((c, i) => `<button type="button" class="vz-scenes__b" data-dlg="${i}" aria-pressed="${i === 0}"><b>${i + 1}</b><span>${esc(c.time.split('·')[0].trim())}</span></button>`).join('')}</div>`;

/** Карточка-подсказка: заголовок и примеры видны, объяснение свёрнуто. */
function tipCard(n) {
  const ex = (n.ex || []).map(([tr, ru]) => `<li><b lang="tr" data-say="${esc(tr)}">${esc(tr)}</b><span>${esc(ru)}</span></li>`).join('');
  return `      <article class="vz vz-tip"><p class="vz-tip__h"><span class="vz-tip__ico">${IC.note}</span>${esc(n.h.charAt(0).toLocaleUpperCase('ru') + n.h.slice(1))}</p>${ex ? `<ul class="vz-tip__ex">${ex}</ul>` : ''}<details class="vz-more"><summary>Почему так</summary><p>${rich(n.text)}</p></details></article>`;
}

/** Карточки слов с примером из урока на обороте (lx-cards из kit). */
function wordCards(L) {
  const lines = L.chapters.flatMap((c) => c.blocks.filter((b) => b.b).map((b) => b.b));
  const cards = L.words.map(([tr, ru]) => {
    const key = tr.toLocaleLowerCase('tr').split(' ')[0].slice(0, 5);
    const ex = lines.find((b) => b.tr.toLocaleLowerCase('tr').includes(key)) || { tr: L.goals[0][0], ru: L.goals[0][1] };
    return `        <article class="lx-card" data-word="${esc(tr)}" data-g="0" tabindex="0">
          <div class="lx-card__face">
            <div class="lx-card__top"><span class="lx-ico">${IC.card}</span><div class="lx-card__w"><b class="lx-card__tr" lang="tr">${esc(tr)}</b><span class="lx-card__ru">${esc(ru)}</span></div><button type="button" class="lx-say" data-say="${esc(tr)}" aria-label="Послушать" data-ui><span class="lx-say__ico">${IC.say}</span></button></div>
          </div>
          <div class="lx-card__back">
            <div class="lx-ex"><p class="lx-ex__tr"><a-say>${esc(ex.tr)}</a-say></p><p class="lx-ex__ru">${esc(ex.ru)}</p></div>
          </div>
          <div class="lx-card__acts" data-ui><button type="button" class="lx-card__flip" aria-expanded="false">Пример</button><button type="button" class="lx-card__know" aria-pressed="false">Знаю</button></div>
        </article>`;
  }).join('\n');
  return `      <p class="lx-empty" data-ui hidden>Ничего не нашлось</p>
      <div class="lx-cards" data-g="0">
${cards}
      </div>`;
}

const TABS = [
  ['hedef', 'Hedef', 'цель'], ['diyalog', 'Diyalog', 'сцены'], ['dilbilgisi', 'Dil bilgisi', 'схемы'], ['sozluk', 'Sözlük', 'слова'],
  ['yasiz', 'Ya siz?', 'а у тебя'], ['practice', 'Alıştırma', 'практика'], ['simulator', 'Simülatör', 'квест'],
  ['konusma', 'Konuşma', 'говорение'], ['check', 'Sınav', 'тест'], ['cheat', 'Özet', 'итог'],
];
const TAB_ICON = { hedef: 'tab_hedef', diyalog: 'tab_diyalog', dilbilgisi: 'note', sozluk: 'tab_sozluk', yasiz: 'tab_yasiz', practice: 'tab_practice', simulator: 'tab_simulator', konusma: 'quirk', check: 'tab_check', cheat: 'tab_cheat' };

function page(D, L, scene, exList) {
  const many = D.lessons.length > 1;
  const part = many ? ` · часть ${L.n}` : '';
  const nav = many
    ? `<nav class="lx-lessons" aria-label="Части дня">${D.lessons.map((x) => `<a href="${x.n === 1 ? 'index.html' : `lesson-${x.n}.html`}"${x.n === L.n ? ' aria-current="page"' : ''}>${x.n}</a>`).join('')}</nav>`
    : '';
  const tabs = TABS.map(([k, tr, ru], i) => `    <button type="button" class="lx-tab" role="tab" id="t-${k}" aria-controls="p-${k}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-tab="${k}"><span class="lx-tab__ico">${IC[TAB_ICON[k]]}</span><b lang="tr">${tr}</b><small>${ru}</small><span class="lx-tab__ok" aria-hidden="true"></span></button>`).join('\n');
  const nextOf = (k) => { const i = TABS.findIndex((t) => t[0] === k); const n = TABS[i + 1]; return n ? `      <div class="lx-foot" data-ui><button type="button" class="lx-btn lx-foot__next" data-tab-go="${n[0]}">Дальше: ${n[1]} (${n[2]})</button></div>` : ''; };
  const panel = (k, kick, h2, hint, body) => `  <section data-section="${k}" data-words="${Math.max(8, words(strip(body)))}" id="p-${k}" class="lx-panel" role="tabpanel" aria-labelledby="t-${k}">
      <div class="lx-ph">
        ${kicker(IC[TAB_ICON[k]], kick)}
        <h2>${h2}</h2>${hint ? `\n        <p class="lx-hint">${hint}</p>` : ''}
      </div>
${body}
${nextOf(k)}
  </section>`;
  const goalLi = ([tr, ru], i, tag = '') => `        <li class="dy-goal__i" style="--i:${i}"><span class="dy-goal__n" data-ui>${tag}${i + 1}</span><span class="dy-goal__w"><b lang="tr" data-say="${esc(tr)}">${esc(tr)}</b><span>${esc(ru)}</span></span><button type="button" class="lx-say" data-say="${esc(tr)}" aria-label="Послушать" data-ui><span class="lx-say__ico">${IC.say}</span></button></li>`;
  const op = L.opener || { skills: [L.can_do], grammar: [], words: [] };
  const trText = [
    ...L.chapters.flatMap((c) => c.blocks.map((b) => [b.b?.tr, b.note?.text, ...(b.note?.ex || []).map((x) => x[0]), b.quirk, ...(b.choice?.opts || []).map((o) => o.tr)].filter(Boolean).join(' '))),
    ...L.goals.map((g) => g[0]), L.yasiz.tr, L.yasiz.model, ...(L.konusma?.model || []).map((m) => m[1]),
  ].join(' ');
  const practice = exList.filter((e) => e.kind === 'practice' && !e._sim);
  const sim = exList.find((e) => e._sim);
  let no = 0;
  const task = (e) => `      <div class="dy-task" data-kit="${e._task.kit}"><p class="dy-rubric"><span class="dy-no" data-ui>${++no}</span><span lang="tr">${esc(e._task.rubric)}</span></p><a-exercise ref="${e.id}"${e.type === 'custom' ? ' data-free' : ''}></a-exercise></div>`;
  const checkId = exList.find((e) => e.kind === 'check').id;
  const nextDay = many && L.n < D.lessons.length
    ? `      <a class="lx-next" href="lesson-${L.n + 1}.html">Часть ${L.n + 1} →</a>`
    : D._next ? `      <a class="lx-next" href="../${D._next.id}/" data-next-day="${D._next.id}">День ${D._next.day}: ${esc(D._next.title_ru)} →</a>` : '';
  const notes = L.chapters.flatMap((c) => c.blocks.filter((b) => b.note).map((b) => b.note));
  const storyViz = L.chapters.flatMap((c) => c.blocks.filter((b) => b.viz && ['anatomy', 'pairs'].includes(b.viz.type)).map((b) => b.viz));
  const cheat = [...L.goals, ...L.words].map(([tr, ru]) => `        <tr><td lang="tr" data-say="${esc(tr)}">${esc(tr)}</td><td>${esc(ru)}</td></tr>`).join('\n');
  const vizCount = 1 + L.chapters.reduce((s, c) => s + c.blocks.filter((b) => b.viz).length, 0) + (L.grammar?.viz || []).length + (L.after_story || []).length + (L.after_ozet || []).length + 2;

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
<link rel="stylesheet" href="../kit/v1/lexicon-fonts.css">
<link rel="stylesheet" href="media/design.css">
</head>
<body class="lx dy" data-city="${CITY.slug}" data-lessons="${D.lessons.length}" data-read="hedef diyalog dilbilgisi sozluk yasiz konusma cheat" data-design="${D.design.name}">
<!-- Собрано tools/build.mjs из src/days/${D.id}.json в вкладочном формате дней платформы (как d.a1.NN). Руками не править. -->
<header class="lx-app">
  <span class="lx-app__logo"><span class="lx-app__ico">${IC.map}</span></span>
  <div class="lx-app__t"><b>Alterna · ${CITY.level} · день ${D.day}</b><small>${esc(D.place_ru)} · <span lang="tr">${esc(D.place_tr)}</span></small></div>
  ${nav}
  <div class="lx-app__prog" title="Пройдено разделов урока"><svg class="lx-ring lx-app__ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="lx-ring__bg" cx="18" cy="18" r="15.9155"/><circle class="lx-ring__fg" cx="18" cy="18" r="15.9155" pathLength="100" stroke-dasharray="0 100"/><text x="18" y="21" text-anchor="middle">0%</text></svg></div>
</header>
<main>
  <section data-section="intro" data-words="${words(D.title_ru + ' ' + L.hook)}" class="lx-hero">
      <div class="lx-scene" aria-hidden="true" data-ui>${scene}</div>
      <p class="lx-tag">${CITY.level} · ${CITY.ru} · день ${D.day}</p>
      <h1>${esc(D.title_ru)}</h1>
      <p class="lx-hero__tr" lang="tr">${esc(D.title_tr)}</p>
      <p class="lx-hero__meta"><span class="lx-hero__pin">${IC.pin}</span><span>${esc(D.place_ru)}</span>${many ? ` · часть ${L.n} из ${D.lessons.length}` : ''}</p>
      <p class="lx-hero__intro">${rich(L.hook)}</p>
      <ul class="lx-stats" data-ui>
        <li><b>${L.minutes}</b><span>${plural(L.minutes, ['минута', 'минуты', 'минут'])}</span></li><li><b>${L.chapters.length}</b><span>${plural(L.chapters.length, ['сцена', 'сцены', 'сцен'])}</span></li><li><b>${vizCount}</b><span>${plural(vizCount, ['схема', 'схемы', 'схем'])}</span></li><li><b>${TABS.length}</b><span>разделов</span></li>
      </ul>
  </section>

  <nav class="lx-tabs" data-scrollbar role="tablist" aria-label="Разделы урока">
${tabs}
    <span class="lx-tabs__line" aria-hidden="true"></span>
  </nav>

${panel('hedef', 'Hedef', 'Что ты скажешь сегодня', esc(L.can_do), `${opener(op)}
      <ol class="dy-goal">
${(L.hedef?.lines || L.goals.slice(0, 3)).map((g, i) => goalLi(g, i, 'B')).join('\n')}
      </ol>
${prep(L.prep)}${route(L.chapters)}`)}

${panel('diyalog', 'Diyalog', 'Сцены дня', 'Реплики появляются по одной. Нажми на турецкую фразу, чтобы услышать её.', `${scenes(L.chapters)}
${L.chapters.map(dlgBox).join('\n')}
${(L.after_story || []).map((v) => '      ' + viz(v, IC)).join('\n')}`)}

${panel('dilbilgisi', 'Dil bilgisi', esc(L.grammar?.title || 'Грамматика дня'), 'Листай шаги и нажимай на части схем.', `${(L.grammar?.viz || []).map((v) => '      ' + viz(v, IC)).join('\n')}
${storyViz.map((v) => '      ' + viz(v, IC)).join('\n')}
${notes.map(tipCard).join('\n')}`)}

${panel('sozluk', 'Sözlük', 'Слова дня', 'Крупнее — чаще звучало. Карточка переворачивается и показывает пример из сцены.', `${cloud(L.words, trText)}
      <div class="lx-tools" data-ui><input type="search" class="lx-search" placeholder="Поиск слова или перевода" aria-label="Поиск слова или перевода" autocomplete="off" spellcheck="false"></div>
      <div class="lx-learn" data-ui>${IC.learn}<p>Выучено <b data-known>0</b> из <b>${L.words.length}</b></p><label class="lx-switch"><input type="checkbox" data-hide-ru> Скрыть перевод</label></div>
${wordCards(L)}`)}

${panel('yasiz', 'Ya siz?', 'А у тебя?', 'Ответь вслух, потом сравни с образцом.', `      <div class="dy-you">
        <p class="dy-you__q" lang="tr" data-say="${esc(L.yasiz.tr)}">${esc(L.yasiz.tr)}</p>
        <p>${esc(L.yasiz.ru)}</p>
        <button type="button" class="lx-btn lx-btn--ghost dy-you__btn" data-reveal aria-expanded="false">Показать образец</button>
        <p class="dy-you__model" lang="tr" data-say="${esc(L.yasiz.model)}" hidden>${esc(L.yasiz.model)}</p>
      </div>
${culture(L.culture)}`)}

${panel('practice', 'Alıştırma', 'Практика', '', practice.map(task).join('\n'))}

${panel('simulator', 'Simülatör', 'Сыграй сцену сам', 'Ты на месте героя. Ошибёшься — будет подсказка.', sim ? `      <a-exercise ref="${sim.id}" data-sim></a-exercise>` : '')}

${panel('konusma', 'Konuşma', 'Говорение', 'Закрой текст и проговори сцену за минуту.', L.konusma ? speak(L.konusma, IC) : '')}

  <section data-section="check" data-words="11" id="p-check" class="lx-panel" role="tabpanel" aria-labelledby="t-check">
      <div class="lx-ph">
        ${kicker(IC.tab_check, 'Sınav')}
        <h2>Тест</h2>
        <p>Вопросы по фразам и словам дня. Нужно 80%, чтобы урок засчитался.</p>
      </div>
      <a-quiz ref="${checkId}"></a-quiz>
      <div class="lx-res" data-ui hidden></div>
${nextOf('check')}
  </section>

  <section data-section="cheat" data-words="${words(cheat)}" id="p-cheat" class="lx-panel" role="tabpanel" aria-labelledby="t-cheat">
      <div class="lx-ph">
        ${kicker(IC.tab_cheat, 'Özet')}
        <h2>Шпаргалка дня</h2>
        <div class="lx-cheat__ctrl" data-ui><label class="lx-switch"><input type="checkbox" data-hide-ru> Скрыть перевод</label></div>
      </div>
${(L.after_ozet || []).map((v) => '      ' + viz(v, IC)).join('\n')}
      <table class="lx-table"><tbody>
${cheat}
      </tbody></table>
${nextDay}
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
<script src="../kit/v1/lexicon.js" defer></script>
<script src="../kit/v1/day.js" defer></script>
${PAGE_JS}
<script>
${readFileSync(join(ROOT, 'tools/viz.js'), 'utf8').trim()}
</script>
</body>
</html>
`;
}

/** Симулятор (как ex4 у дней A1): реплика собеседника → выбери свой ответ. Строится из реплик и выборов глав. */
function simulator(D, L, id) {
  const all = L.chapters.flatMap((c) => c.blocks);
  const mine = all.filter((b) => b.b && b.b.who === 'Sen').map((b) => b.b);
  const items = [];
  for (const c of L.chapters) {
    const bl = c.blocks;
    bl.forEach((b, k) => {
      const prev = bl.slice(0, k).reverse().find((x) => x.b && x.b.who !== 'Sen');
      if (b.choice && prev) {
        const ok = b.choice.opts.findIndex((o) => o.ok);
        items.push({ bot: { tr: prev.b.tr, ru: prev.b.ru }, options: b.choice.opts.map((o) => ({ tr: o.tr, ru: o.ru, ...(o.ok ? {} : { hint: strip(o.then).replace(/«|»/g, '') }) })), answer: ok, reply: null });
      } else if (b.b && b.b.who === 'Sen' && prev && bl[k - 1] === prev) {
        const others = mine.filter((m) => m.tr !== b.b.tr).slice(0, 2);
        if (others.length < 2) return;
        const opts = [b.b, ...others];
        const rot = items.length % 3;
        const order = [...opts.slice(rot), ...opts.slice(0, rot)];
        items.push({ bot: { tr: prev.b.tr, ru: prev.b.ru }, options: order.map((o) => ({ tr: o.tr, ru: o.ru, ...(o === b.b ? {} : { hint: 'Эта реплика из другого места разговора' }) })), answer: order.indexOf(b.b), reply: null });
      }
    });
  }
  const pick = items.slice(0, 5).map((it, i) => ({ id: String(i + 1), ...it, explanation: `Подходит: ${it.options[it.answer].tr} — ${it.options[it.answer].ru}` }));
  const last = [...all].reverse().find((b) => b.b && b.b.who !== 'Sen');
  const who = {};
  all.filter((b) => b.b && b.b.who !== 'Sen').forEach((b) => (who[b.b.who] = (who[b.b.who] || 0) + 1));
  return {
    id, lesson: L.n, kind: 'practice', skill: 'situation', type: 'custom', difficulty: 3,
    instruction: D.title_tr, description: D.place_ru, items: pick,
    final: { tr: last.b.tr, ru: last.b.ru },
    character: { name: D.place_tr, role: D.place_ru },
  };
}

function design(D) {
  const tpl = readFileSync(join(ROOT, 'tools/design.css'), 'utf8');
  return tpl.replaceAll('__NAME__', D.design.name).replaceAll('__ACCENT__', D.design.accent) + readFileSync(join(ROOT, 'tools/viz.css'), 'utf8') + readFileSync(join(ROOT, 'tools/viz-book.css'), 'utf8') + readFileSync(join(ROOT, 'tools/design-scenes.css'), 'utf8');
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
    const sim = simulator(D, L, `${id}.ex${++n}`);
    sim._sim = true;
    list.push(sim);
    list.push(check(L, `${id}.check${L.n}`, r));
    all.push(...list);
    writeFileSync(join(out, L.n === 1 ? 'index.html' : `lesson-${L.n}.html`), page(D, L, scene, list));
  });

  const clean = all.map(({ _task, _sim, ...e }) => e);
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
