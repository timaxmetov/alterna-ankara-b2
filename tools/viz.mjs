// viz.mjs — интерактивные визуализации дня. Разметка + стили tools/viz.css + поведение tools/viz.js.
// Каждый блок — <figure class="vz ...">: работает с клавиатуры, озвучивает турецкое через data-say kit,
// при prefers-reduced-motion показывает итоговое состояние без анимации.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sayBtn = (tr, icon) => `<button type="button" class="lx-say vz-say" data-say="${esc(tr)}" aria-label="Послушать: ${esc(tr)}" data-ui><span class="lx-say__ico">${icon}</span></button>`;

/** Маршрут дня: главы как остановки. Строится сам из глав, ведёт к главе и подсвечивает текущую. */
export function route(chapters) {
  const stops = chapters.map((c, i) => {
    const [t, ...rest] = c.time.split('·').map((s) => s.trim());
    return `<li class="vz-route__i" style="--i:${i}"><a class="vz-route__s" href="#ch-${i + 1}" data-route="ch-${i + 1}"><span class="vz-route__n">${i + 1}</span><span class="vz-route__t">${esc(t)}</span><span class="vz-route__p" lang="tr">${esc(rest.join(' · ') || c.title)}</span></a></li>`;
  }).join('');
  return `      <nav class="vz vz-route" aria-label="Маршрут дня">
        <p class="vz__h">Маршрут дня <span>нажми на остановку, чтобы перейти к главе</span></p>
        <div class="vz-route__wrap" style="--n:${chapters.length}"><ol class="vz-route__l">${stops}</ol><span class="vz-route__bar" aria-hidden="true"></span></div>
      </nav>\n`;
}

/** Схема города: точки и маршрут между ними. points: {id,tr,ru,x,y,note}; route: [id,...]; legs: [[текст на отрезке], ...]. */
function map(v) {
  const P = Object.fromEntries(v.points.map((p) => [p.id, p]));
  const path = v.route.map((id, i) => `${i ? 'L' : 'M'}${P[id].x} ${P[id].y}`).join(' ');
  const streets = (v.streets || []).map((s) => `<path d="${s}" class="vz-map__st"/>`).join('');
  const areas = (v.areas || []).map((a) => `<g class="vz-map__area"><ellipse cx="${a.x}" cy="${a.y}" rx="${a.rx}" ry="${a.ry}"/><text x="${a.x}" y="${a.y + 6}" text-anchor="middle">${esc(a.label)}</text></g>`).join('');
  const legs = v.route.slice(1).map((id, i) => {
    const a = P[v.route[i]], b = P[id];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, w = (v.legs?.[i] || '').length * 10.5 + 28;
    return v.legs?.[i] ? `<g class="vz-map__leg" style="--i:${i}"><rect x="${mx - w / 2}" y="${my - 17}" width="${w}" height="34" rx="17"/><text x="${mx}" y="${my + 7}" text-anchor="middle">${esc(v.legs[i])}</text></g>` : '';
  }).join('');
  const pts = v.points.map((p, i) => {
    const on = v.route.includes(p.id);
    const est = p.tr.length * 19 + 24;
    const lx = p.lx ?? (p.x + est > 630 ? -22 : 22), anchor = lx < 0 ? 'end' : 'start';
    return `<g class="vz-map__pt${on ? ' is-route' : ''}" data-pt="${i}" tabindex="0" role="button" aria-label="${esc(p.ru)}: ${esc(p.tr)}"><circle class="vz-map__hit" cx="${p.x}" cy="${p.y}" r="30"/><circle class="vz-map__dot" cx="${p.x}" cy="${p.y}" r="${on ? 14 : 10}"/><text x="${p.x + lx}" y="${p.y + 8}" text-anchor="${anchor}" lang="tr">${esc(p.tr)}</text></g>`;
  }).join('');
  const data = esc(JSON.stringify(v.points.map((p) => ({ tr: p.tr, ru: p.ru, note: p.note || '' }))));
  return `<figure class="vz vz-map" data-viz="map" data-points="${data}">
          <figcaption class="vz__h">${esc(v.title)} <span>${esc(v.hint || 'нажми на точку на схеме')}</span></figcaption>
          <svg class="vz-map__svg" viewBox="0 0 640 380" role="group" aria-label="${esc(v.title)}">
            <rect class="vz-map__bg" width="640" height="380" rx="18"/>
            ${areas}${streets}
            <path class="vz-map__route" d="${path}" pathLength="100"/>
            ${legs}${pts}
          </svg>
          ${v.legs ? `<ol class="vz-map__legs">${v.route.slice(1).map((id, i) => `<li><span lang="tr">${esc(P[v.route[i]].tr)} → ${esc(P[id].tr)}</span><b>${esc(v.legs[i] || '')}</b></li>`).join('')}</ol>` : ''}
          <div class="vz-map__info" aria-live="polite"><b lang="tr">${esc(P[v.route[0]].tr)}</b><span>${esc(P[v.route[0]].note || P[v.route[0]].ru)}</span></div>
        </figure>`;
}

/** Разбор слова на части. parts: [[кусочек, значение, роль], ...]. */
function anatomy(v, icon) {
  const parts = v.parts.map(([p, ru, role], i) =>
    `<button type="button" class="vz-anat__p${i === 0 ? ' is-root' : ''}" style="--i:${i}" data-i="${i}" aria-pressed="false"><span class="vz-anat__m" lang="tr">${esc(p)}</span><span class="vz-anat__r">${esc(role)}</span></button>`).join('<span class="vz-anat__plus" aria-hidden="true">+</span>');
  const data = esc(JSON.stringify(v.parts.map(([p, ru, role]) => ({ p, ru, role }))));
  return `<figure class="vz vz-anat" data-viz="anat" data-parts="${data}">
          <figcaption class="vz__h">Разбор слова <span>нажимай на части по очереди</span></figcaption>
          <p class="vz-anat__word"><b lang="tr">${esc(v.word)}</b>${sayBtn(v.word, icon)}</p>
          <p class="vz-anat__ru">${esc(v.ru)}</p>
          <div class="vz-anat__parts">${parts}</div>
          <p class="vz-anat__info" aria-live="polite">Слово собирается слева направо: каждая часть добавляет смысл.</p>
        </figure>`;
}

/** Шкала: от разговорного к официальному или от грубого к вежливому. items: [{tr, ru, pos 0..100, note}]. */
function scale(v, icon) {
  const marks = v.items.map((it, i) =>
    `<button type="button" class="vz-scale__m" style="--x:${it.pos}%;--i:${i}" data-i="${i}" aria-pressed="${i === v.items.length - 1}" aria-label="Вариант ${i + 1}: ${esc(it.ru)}">${i + 1}</button>`).join('');
  const data = esc(JSON.stringify(v.items));
  const last = v.items[v.items.length - 1];
  return `<figure class="vz vz-scale" data-viz="scale" data-items="${data}">
          <figcaption class="vz__h">${esc(v.title)} <span>нажми на цифру на шкале</span></figcaption>
          <div class="vz-scale__track"><span class="vz-scale__fill" style="--x:${last.pos}%"></span>${marks}</div>
          <p class="vz-scale__ends"><span>${esc(v.left)}</span><span>${esc(v.right)}</span></p>
          <div class="vz-scale__card" aria-live="polite"><p class="vz-scale__tr"><b lang="tr" data-say="${esc(last.tr)}">${esc(last.tr)}</b>${sayBtn(last.tr, icon)}</p><p class="vz-scale__ru">${esc(last.ru)}</p><p class="vz-scale__note">${esc(last.note || '')}</p></div>
        </figure>`;
}

/** Столбики: одна величина, одна серия, подписи прямо у столбиков. items: [[подпись, число, пояснение]]. */
function bars(v) {
  const max = Math.max(...v.items.map((x) => x[1]));
  const total = v.items.reduce((s, x) => s + x[1], 0);
  const rows = v.items.map(([lab, val, note], i) =>
    `<li class="vz-bars__i" style="--i:${i}"><span class="vz-bars__lab">${esc(lab)}</span><button type="button" class="vz-bars__track" data-note="${esc(note || '')}" aria-label="${esc(lab)}: ${val} ${esc(v.unit)}"><span class="vz-bars__bar" style="--v:${(val / max).toFixed(3)}"></span></button><span class="vz-bars__val">${val} ${esc(v.unit)}</span></li>`).join('');
  return `<figure class="vz vz-bars" data-viz="bars">
          <figcaption class="vz__h">${esc(v.title)} <span>всего ${total} ${esc(v.unit)} · нажми на столбик</span></figcaption>
          <ul class="vz-bars__l">${rows}</ul>
          <p class="vz-bars__note" aria-live="polite">${esc(v.hint || '')}</p>
        </figure>`;
}

/** Чек-лист с кольцом прогресса: задачи дня, которые герой решает. items: [[tr, ru]]. */
function tasks(v) {
  const n = v.items.length;
  const rows = v.items.map(([tr, ru], i) =>
    `<li><label class="vz-tasks__i"><input type="checkbox" class="vz-tasks__cb"><span class="vz-tasks__box" aria-hidden="true"></span><span class="vz-tasks__w"><b lang="tr">${esc(tr)}</b><small>${esc(ru)}</small></span></label></li>`).join('');
  return `<figure class="vz vz-tasks" data-viz="tasks">
          <figcaption class="vz__h">${esc(v.title)} <span>отмечай, что уже умеешь сказать</span></figcaption>
          <div class="vz-tasks__body">
            <div class="vz-tasks__ring" role="img" aria-label="Готово 0 из ${n}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="vz-tasks__bg" cx="60" cy="60" r="50"/><circle class="vz-tasks__fg" cx="60" cy="60" r="50" pathLength="100" stroke-dasharray="0 100"/></svg><span><b>0</b>из ${n}</span></div>
            <ul class="vz-tasks__l">${rows}</ul>
          </div>
        </figure>`;
}

/** Переключатель пары суффиксов: одно слово в двух формах. items: [[a, b, ru_a, ru_b]]. */
function pairs(v) {
  const rows = v.items.map(([a, b, ra, rb]) =>
    `<li class="vz-pairs__i"><b lang="tr" data-a="${esc(a)}" data-b="${esc(b)}">${esc(a)}</b><span data-a="${esc(ra)}" data-b="${esc(rb)}">${esc(ra)}</span></li>`).join('');
  return `<figure class="vz vz-pairs" data-viz="pairs">
          <figcaption class="vz__h">${esc(v.title)} <span>переключи форму</span></figcaption>
          <div class="vz-pairs__sw" role="group" aria-label="Форма"><button type="button" data-mode="a" aria-pressed="true">${esc(v.a)}</button><button type="button" data-mode="b" aria-pressed="false">${esc(v.b)}</button></div>
          <ul class="vz-pairs__l">${rows}</ul>
        </figure>`;
}

/** Открытие юнита, как в Yeni İstanbul: три колонки BECERİLER / DİL BİLGİSİ / KELİMELER. */
export function opener(op) {
  const col = (tr, ru, items, i) => `<div class="vz-open__c" style="--i:${i}"><p class="vz-open__h"><span lang="tr">${tr}</span><small>${ru}</small></p><ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  return `      <div class="vz vz-open">${col('BECERİLER', 'умения', op.skills, 0)}${col('DİL BİLGİSİ', 'грамматика', op.grammar, 1)}${col('KELİMELER', 'слова', op.words, 2)}</div>`;
}

/** Облако слов: размер — сколько раз слово прозвучало в репликах истории. */
export function cloud(words, text) {
  const low = text.toLocaleLowerCase('tr');
  // основа слова: у составных — вся фраза, у глаголов без -mak/-mek, минимум 4 буквы
  const stem = (w) => { const l = w.toLocaleLowerCase('tr'); if (l.includes(' ')) return l; const s = l.replace(/(mak|mek)$/, ''); return s.length <= 5 ? s : s.slice(0, Math.max(5, s.length - 2)); };
  const counts = words.map(([tr]) => Math.max(1, low.split(stem(tr)).length - 1));
  const max = Math.max(...counts);
  const items = words.map(([tr, ru], i) => {
    const lvl = 1 + Math.round(((counts[i] - 1) / Math.max(1, max - 1)) * 3);
    return `<li style="--i:${i}"><button type="button" class="vz-cloud__w" data-lvl="${lvl}" data-say="${esc(tr)}" title="${esc(ru)} · ${counts[i]}×"><span lang="tr">${esc(tr)}</span><small>${esc(ru)}</small></button></li>`;
  });
  // крупные в середину, мелкие по краям — облако читается как облако, а не как список
  const order = [...items.keys()].sort((a, b) => counts[b] - counts[a]);
  const mid = [];
  order.forEach((k, j) => (j % 2 ? mid.push(items[k]) : mid.unshift(items[k])));
  return `      <div class="vz vz-cloud"><ul class="vz-cloud__l">${mid.join('')}</ul></div>`;
}

/** Konuşma: ролевая карточка, шаги реплик и таймер на минуту. */
export function speak(k, icons) {
  const steps = k.steps.map((s, i) => `<li style="--i:${i}"><span class="vz-speak__n">${i + 1}</span><span>${esc(s)}</span></li>`).join('');
  const model = k.model.map(([who, tr, ru]) => `<li><b>${esc(who)}</b><span lang="tr">${esc(tr)}</span>${sayBtn(tr, icons.say)}<small>${esc(ru)}</small></li>`).join('');
  return `      <figure class="vz vz-speak" data-viz="speak" data-sec="${k.seconds || 60}">
        <figcaption class="vz__h">Ролевая карточка <span>${esc(k.where || '')}</span></figcaption>
        <div class="vz-speak__card">
          <p><b>Ситуация.</b> ${esc(k.situation)}</p>
          <p><b>Твоя цель.</b> ${esc(k.goal)}</p>
        </div>
        <ol class="vz-speak__steps">${steps}</ol>
        <div class="vz-speak__timer">
          <div class="vz-speak__ring" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="vz-speak__bg" cx="60" cy="60" r="50"/><circle class="vz-speak__fg" cx="60" cy="60" r="50" pathLength="100" stroke-dasharray="100 100"/></svg><b>${k.seconds || 60}</b></div>
          <div><button type="button" class="lx-btn vz-speak__go">Начать: ${k.seconds || 60} секунд</button><p class="vz-speak__st" aria-live="polite">Нажми и говори вслух, пока идёт круг.</p></div>
        </div>
        <button type="button" class="lx-btn lx-btn--ghost vz-speak__show" aria-expanded="false">Показать образец диалога</button>
        <ol class="vz-speak__model" hidden>${model}</ol>
      </figure>`;
}

/** Многоступенчатая диаграмма: фраза меняется шаг за шагом, изменённая часть подсвечена. */
function steps(v) {
  const mark = (tr, hl) => (hl && tr.includes(hl) ? esc(tr).replace(esc(hl), `<mark>${esc(hl)}</mark>`) : esc(tr));
  const li = v.steps.map((s, i) => `<li class="vz-steps__i" data-i="${i}" style="--i:${i}"${i ? '' : ' aria-current="step"'}>
            <button type="button" class="vz-steps__n" aria-label="Шаг ${i + 1}">${i + 1}</button>
            <div class="vz-steps__b"><p class="vz-steps__k">${esc(s.label)}</p><p class="vz-steps__tr" lang="tr" data-say="${esc(s.tr)}">${mark(s.tr, s.hl)}</p><p class="vz-steps__ru">${esc(s.ru)}</p><p class="vz-steps__note">${esc(s.note || '')}</p></div>
          </li>`).join('\n          ');
  return `<figure class="vz vz-steps" data-viz="steps">
          <figcaption class="vz__h">${esc(v.title)} <span>шаг за шагом</span></figcaption>
          <ol class="vz-steps__l">
          ${li}
          </ol>
          <div class="vz-steps__ctrl" data-ui><button type="button" class="lx-btn lx-btn--ghost" data-step="-1">← Назад</button><span class="vz-steps__pos" aria-live="polite">Шаг 1 из ${v.steps.length}</span><button type="button" class="lx-btn" data-step="1">Дальше →</button></div>
        </figure>`;
}

/** Дерево выбора: вопрос → вариант → вопрос → готовая фраза. nodes: {id: {q, opts:[{label, to}]} | {tr, ru, note}}. */
function flow(v, icon) {
  const results = Object.entries(v.nodes).filter(([, n]) => n.tr).map(([, n]) => `<li><b lang="tr">${esc(n.tr)}</b> — ${esc(n.ru)}</li>`).join('');
  return `<figure class="vz vz-flow" data-viz="flow" data-nodes="${esc(JSON.stringify(v.nodes))}" data-start="${esc(v.start)}" data-say-icon="${esc(icon)}">
          <figcaption class="vz__h">${esc(v.title)} <span>отвечай на вопросы — получишь фразу</span></figcaption>
          <ol class="vz-flow__path" aria-label="Пройденный путь"></ol>
          <div class="vz-flow__stage" aria-live="polite"></div>
          <ul class="vz-flow__all">${results}</ul>
        </figure>`;
}

export function viz(v, icons) {
  const f = { map, anatomy: (x) => anatomy(x, icons.say), scale: (x) => scale(x, icons.say), bars, tasks, pairs, steps, flow: (x) => flow(x, icons.say) }[v.type];
  if (!f) throw new Error('неизвестная визуализация: ' + v.type);
  return f(v);
}
