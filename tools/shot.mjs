// shot.mjs — снимки разделов урока через Chrome DevTools Protocol (для проверки вёрстки).
// node tools/shot.mjs <url> <outdir> <width> <selector> [<selector> ...]
// Каждый селектор: прокрутка к элементу, все .vz получают is-in, снимок области элемента.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [url, out, width, ...sels] = process.argv.slice(2);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 500);
mkdirSync(out, { recursive: true });
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`,
  `--window-size=${width},900`, `--user-data-dir=${join(out, '.chrome')}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

try {
  let target;
  for (let k = 0; k < 40 && !target; k++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } };
  await send('Emulation.setDeviceMetricsOverride', { width: Number(width), height: 900, deviceScaleFactor: 1, mobile: Number(width) < 600 });
  await send('Page.navigate', { url });
  await sleep(3500);
  for (const [n, sel] of sels.entries()) {
    const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `(async () => {
      document.documentElement.style.scrollBehavior = 'auto';
      document.querySelectorAll('.vz').forEach((v) => v.classList.add('is-in'));
      const e = document.querySelector(${JSON.stringify(sel)});
      if (!e) return null;
      window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 10);
      await new Promise((r) => setTimeout(r, 1600));
      const b = e.getBoundingClientRect();
      return { x: b.left, y: b.top + scrollY, w: b.width, h: Math.min(b.height, 2400) };
    })()` });
    const box = r.result.value;
    if (!box) { console.log('нет', sel); continue; }
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 } });
    const f = join(out, `${String(n + 1).padStart(2, '0')}.png`);
    writeFileSync(f, Buffer.from(shot.data, 'base64'));
    console.log(f, sel);
  }
} finally {
  try { ws?.close(); } catch {}
  proc.kill();
}
