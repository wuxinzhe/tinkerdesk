const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBFB24D4F613E6C7F35091D633', { maxPayload: 64 * 1024 * 1024 });
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
  }
});
ws.on('open', async () => {
  try {
    const expr = `(() => {
      const rect = (s) => {
        const e = document.querySelector(s);
        return e ? { w: Math.round(e.getBoundingClientRect().width), l: Math.round(e.getBoundingClientRect().left), r: Math.round(e.getBoundingClientRect().right) } : null;
      };
      return JSON.stringify({
        viewport: innerWidth,
        docScrollW: document.documentElement.scrollWidth,
        bodyScrollW: document.body.scrollWidth,
        app: rect('.app-shell'),
        ws: rect('.workspace'),
        main: rect('.workspace__main'),
        col: rect('.workspace__sidebar-col'),
        inner: rect('.workspace__sidebar-inner'),
        wrap: rect('.workspace__settings-wrap'),
        area: rect('.workspace__area'),
        colgrid: [...document.querySelectorAll('.workspace__main')].map(e => getComputedStyle(e).gridTemplateColumns),
        mainDisplay: document.querySelector('.workspace__main') ? getComputedStyle(document.querySelector('.workspace__main')).display : null,
      }, null, 1);
    })()`;
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    console.log(res.result.value);
    ws.close();
    process.exit(0);
  } catch (e) {
    console.error('ERR', e.message);
    process.exit(1);
  }
});
setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 10000);