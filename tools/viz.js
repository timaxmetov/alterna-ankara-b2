// Поведение визуализаций дня (вставляется в страницу инлайном, как design.js у дней A1).
(() => {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (r, s) => r.querySelector(s), $$ = (r, s) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const speak = (tr) => { try { const u = new SpeechSynthesisUtterance(tr); u.lang = 'tr-TR'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {} };

  // появление при прокрутке: блок получает is-in один раз
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: 0.35 });
  $$(document, '.vz').forEach((el) => (RM ? el.classList.add('is-in') : io.observe(el)));

  // маршрут дня: текущая глава подсвечивается, полоса прогресса растёт
  const route = $(document, '.vz-route');
  if (route) {
    const links = $$(route, '[data-route]');
    const bar = $(route, '.vz-route__bar');
    const seen = new Set();
    const ro = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) seen.add(e.target.id); });
      let cur = -1;
      links.forEach((a, i) => { const on = seen.has(a.dataset.route); a.classList.toggle('is-done', on); if (on) cur = i; });
      links.forEach((a, i) => a.toggleAttribute('aria-current', i === cur));
      if (bar) bar.style.setProperty('--p', links.length > 1 ? Math.max(0, cur) / (links.length - 1) : 1);
    }, { rootMargin: '0px 0px -55% 0px' });
    links.forEach((a) => { const ch = document.getElementById(a.dataset.route); if (ch) ro.observe(ch); });
  }

  // схема города: точка → подпись внизу
  $$(document, '[data-viz="map"]').forEach((fig) => {
    const pts = JSON.parse(fig.dataset.points);
    const info = $(fig, '.vz-map__info');
    const pick = (g) => {
      const p = pts[g.dataset.pt];
      $$(fig, '.vz-map__pt').forEach((x) => x.classList.toggle('is-on', x === g));
      info.innerHTML = `<b lang="tr">${esc(p.tr)}</b><span>${esc(p.note || p.ru)}</span>`;
      speak(p.tr);
    };
    $$(fig, '.vz-map__pt').forEach((g) => {
      g.addEventListener('click', () => pick(g));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(g); } });
    });
  });

  // разбор слова: части загораются по очереди, под ними — смысл
  $$(document, '[data-viz="anat"]').forEach((fig) => {
    const parts = JSON.parse(fig.dataset.parts);
    const info = $(fig, '.vz-anat__info');
    const btns = $$(fig, '.vz-anat__p');
    btns.forEach((b, i) => b.addEventListener('click', () => {
      btns.forEach((x, k) => { x.classList.toggle('is-lit', k <= i); x.setAttribute('aria-pressed', k === i); });
      const built = parts.slice(0, i + 1).map((x) => x.p).join('');
      info.innerHTML = `<b lang="tr">${esc(built)}</b> · <i>${esc(parts[i].p)}</i> — ${esc(parts[i].ru)}`;
    }));
  });

  // шкала: цифра → фраза, перевод, пояснение
  $$(document, '[data-viz="scale"]').forEach((fig) => {
    const items = JSON.parse(fig.dataset.items);
    const card = $(fig, '.vz-scale__card'), fill = $(fig, '.vz-scale__fill');
    $$(fig, '.vz-scale__m').forEach((m, i) => m.addEventListener('click', () => {
      const it = items[i];
      $$(fig, '.vz-scale__m').forEach((x) => x.setAttribute('aria-pressed', x === m));
      fill.style.setProperty('--x', it.pos + '%');
      $(card, '.vz-scale__tr b').textContent = it.tr;
      $(card, '.vz-scale__tr b').dataset.say = it.tr;
      $(card, '.vz-say').dataset.say = it.tr;
      $(card, '.vz-scale__ru').textContent = it.ru;
      $(card, '.vz-scale__note').textContent = it.note || '';
      speak(it.tr);
    }));
  });

  // столбики: нажатие показывает пояснение
  $$(document, '[data-viz="bars"]').forEach((fig) => {
    const note = $(fig, '.vz-bars__note');
    $$(fig, '.vz-bars__track').forEach((t) => t.addEventListener('click', () => {
      $$(fig, '.vz-bars__i').forEach((li) => li.classList.toggle('is-on', li.contains(t)));
      note.textContent = t.dataset.note;
    }));
  });

  // чек-лист: кольцо заполняется
  $$(document, '[data-viz="tasks"]').forEach((fig) => {
    const cbs = $$(fig, '.vz-tasks__cb');
    const fg = $(fig, '.vz-tasks__fg'), num = $(fig, '.vz-tasks__ring b'), ring = $(fig, '.vz-tasks__ring');
    const upd = () => {
      const k = cbs.filter((c) => c.checked).length, p = Math.round((k / cbs.length) * 100);
      fg.setAttribute('stroke-dasharray', `${p} 100`);
      num.textContent = k;
      ring.setAttribute('aria-label', `Готово ${k} из ${cbs.length}`);
      fig.classList.toggle('is-full', k === cbs.length);
    };
    cbs.forEach((c) => c.addEventListener('change', () => { upd(); if (c.checked) speak(c.closest('label').querySelector('b').textContent); }));
  });

  // пары суффиксов: переключатель формы
  $$(document, '[data-viz="pairs"]').forEach((fig) => {
    $$(fig, '[data-mode]').forEach((b) => b.addEventListener('click', () => {
      const m = b.dataset.mode;
      $$(fig, '[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      fig.classList.toggle('is-b', m === 'b');
      $$(fig, '[data-a]').forEach((el) => { el.textContent = el.dataset[m]; });
    }));
  });

  // пошаговая диаграмма: «Дальше»/«Назад» и клик по номеру шага
  $$(document, '[data-viz="steps"]').forEach((fig) => {
    const items = $$(fig, '.vz-steps__i'), pos = $(fig, '.vz-steps__pos');
    const prev = $(fig, '[data-step="-1"]'), next = $(fig, '[data-step="1"]');
    let cur = 0;
    const go = (i, say = true) => {
      cur = Math.max(0, Math.min(items.length - 1, i));
      items.forEach((li, k) => {
        if (k === cur) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
        li.classList.toggle('is-past', k < cur);
      });
      pos.textContent = `Шаг ${cur + 1} из ${items.length}`;
      prev.disabled = cur === 0;
      next.disabled = cur === items.length - 1;
      if (say) speak($(items[cur], '.vz-steps__tr').dataset.say);
    };
    prev.addEventListener('click', () => go(cur - 1));
    next.addEventListener('click', () => go(cur + 1));
    items.forEach((li, k) => $(li, '.vz-steps__n').addEventListener('click', () => go(k)));
    fig.classList.add('is-js');
    go(0, false);
  });

  // дерево выбора: вопрос → вариант → … → готовая фраза
  $$(document, '[data-viz="flow"]').forEach((fig) => {
    const nodes = JSON.parse(fig.dataset.nodes), icon = fig.dataset.sayIcon;
    const path = $(fig, '.vz-flow__path'), stage = $(fig, '.vz-flow__stage');
    const trail = [];
    const show = (id, say) => {
      const n = nodes[id];
      path.innerHTML = trail.map((t, i) => `<li style="--i:${i}"><span>${esc(t.q)}</span><b>${esc(t.a)}</b></li>`).join('');
      if (n.tr) {
        stage.innerHTML = `<div class="vz-flow__res"><p class="vz-flow__k">Твоя фраза</p><p class="vz-flow__tr"><b lang="tr" data-say="${esc(n.tr)}">${esc(n.tr)}</b><button type="button" class="lx-say vz-say" data-say="${esc(n.tr)}" aria-label="Послушать"><span class="lx-say__ico">${icon}</span></button></p><p>${esc(n.ru)}</p><p class="vz-flow__note">${esc(n.note || '')}</p><button type="button" class="lx-btn lx-btn--ghost vz-flow__again">Пройти заново</button></div>`;
        $(stage, '.vz-flow__again').addEventListener('click', () => { trail.length = 0; show(fig.dataset.start); });
        if (say) speak(n.tr);
      } else {
        stage.innerHTML = `<p class="vz-flow__q">${esc(n.q)}</p><div class="vz-flow__opts">${n.opts.map((o) => `<button type="button" class="vz-flow__o" data-to="${esc(o.to)}">${esc(o.label)}</button>`).join('')}</div>`;
        $$(stage, '.vz-flow__o').forEach((b) => b.addEventListener('click', () => { trail.push({ q: n.q, a: b.textContent }); show(b.dataset.to, true); }));
      }
    };
    fig.classList.add('is-js');
    show(fig.dataset.start, false);
  });

  // карточка говорения: таймер-кольцо и образец диалога
  $$(document, '[data-viz="speak"]').forEach((fig) => {
    const total = Number(fig.dataset.sec);
    const fg = $(fig, '.vz-speak__fg'), num = $(fig, '.vz-speak__ring b'), st = $(fig, '.vz-speak__st'), go = $(fig, '.vz-speak__go');
    let t = null;
    const label = (w) => `${w}: ${total} секунд`;
    go.addEventListener('click', () => {
      if (t) { clearInterval(t); t = null; go.textContent = label('Начать'); st.textContent = 'Остановлено. Можно начать ещё раз.'; return; }
      let left = total;
      go.textContent = 'Стоп';
      st.textContent = 'Говори! Иди по шагам карточки.';
      const tick = () => { num.textContent = left; fg.setAttribute('stroke-dasharray', `${(left / total) * 100} 100`); };
      tick();
      t = setInterval(() => {
        left -= 1; tick();
        if (left <= 0) { clearInterval(t); t = null; go.textContent = label('Ещё раз'); st.textContent = 'Время! Сравни себя с образцом ниже.'; }
      }, 1000);
    });
    const show = $(fig, '.vz-speak__show'), model = $(fig, '.vz-speak__model');
    show.addEventListener('click', () => {
      model.hidden = !model.hidden;
      show.setAttribute('aria-expanded', String(!model.hidden));
      show.textContent = model.hidden ? 'Показать образец диалога' : 'Скрыть образец';
    });
  });
})();
