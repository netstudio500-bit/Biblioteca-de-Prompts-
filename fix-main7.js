const fs = require('fs');
const content = fs.readFileSync('D:/FREE.BOT/FREE.BOT-main/FREE.BOT-main/src/main.jsx', 'utf8');
const lines = content.split('\n');
const newLines = lines.slice(0, 1846).concat(lines.slice(2051));
fs.writeFileSync('D:/FREE.BOT/FREE.BOT-main/FREE.BOT-main/src/main.jsx', newLines.join('\n'));
console.log('Removed second return block! New line count:', newLines.length);