const fs = require('fs');
const path = require('path');
const dir = 'C:\\Users\\Administrator\\Documents\\tinkerdesk';
const target = path.join(dir, 'media');
console.log('target:', target);
try {
  const st = fs.lstatSync(target);
  console.log('lstat:', JSON.stringify({ isDir: st.isDirectory(), isSymlink: st.isSymbolicLink(), size: st.size }));
  if (st.isSymbolicLink()) {
    console.log('symlink target:', fs.readlinkSync(target));
  }
  const entries = fs.readdirSync(target);
  console.log('entries:', entries.length);
  for (const e of entries) {
    const p = path.join(target, e);
    let s;
    try { s = fs.statSync(p); } catch (err) { s = { err: err.message }; }
    console.log(e, s.err ? s.err : s.size, s.isDirectory ? '(dir)' : '');
  }
} catch (e) {
  console.log('ERROR:', e.message);
  // fallback: list cwd entries
  console.log('--- cwd entries ---');
  const all = fs.readdirSync(dir);
  for (const a of all) {
    console.log(a);
  }
}
