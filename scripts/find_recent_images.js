const fs = require('fs');
const path = require('path');

const roots = [
  'C:\\Users\\Administrator\\Documents\\tinkerdesk\\media',
  'C:\\Users\\Administrator\\AppData\\Local\\Temp',
  'C:\\Users\\Administrator\\AppData\\Roaming',
  'C:\\Users\\Administrator\\AppData\\Local',
  'C:\\Users\\Administrator\\Pictures',
  'C:\\Users\\Administrator\\Downloads',
  'C:\\Users\\Administrator\\Desktop',
];

const since = Date.parse('2026-08-15T12:00:00');
const results = [];

function walk(dir, depth) {
  if (depth > 5) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { return; }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full, depth + 1);
    } else if (/\.(png|jpe?g|webp|gif)$/i.test(ent.name)) {
      try {
        const st = fs.statSync(full);
        if (st.mtimeMs >= since) {
          results.push({ file: full, size: st.size, mtime: new Date(st.mtimeMs).toISOString() });
        }
      } catch (e) {}
    }
  }
}

for (const r of roots) walk(r, 0);
results.sort((a, b) => b.mtime.localeCompare(a.mtime));
console.log('found:', results.length);
for (const r of results.slice(0, 30)) {
  console.log(r.mtime, r.size, r.file);
}
