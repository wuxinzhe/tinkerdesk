const fs = require('fs');
const path = require('path');
const img = path.join('C:\\Users\\Administrator\\Documents\\tinkerdesk\\media', '20260815_1321_86a3ed28.jpg');
const b = fs.readFileSync(img).toString('base64');
const dataUrl = 'data:image/jpeg;base64,' + b;
const out = path.join('C:\\Users\\Administrator\\Documents\\tinkerdesk\\scripts', 'img_dataurl.txt');
fs.writeFileSync(out, dataUrl);
console.log('written', out, dataUrl.length);
