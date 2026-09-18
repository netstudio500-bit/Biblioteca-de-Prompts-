const fs = require('fs');
const content = fs.readFileSync('D:/FREE.BOT/FREE.BOT-main/FREE.BOT-main/src/main.jsx', 'utf8');
const lines = content.split('\n');

// Remove line 1374 (the orphaned 'createdAt: new Date().toISOString(),' line)
// and lines 1395-1408 (duplicate saveMemory body and createSkill start)
// Keep lines 0-1373 (sendMessage end)
// Keep lines 1375-1394 (my new functions: stopGeneration and saveMemory)
// Skip line 1374 (the orphaned createdAt line)
// Skip lines 1395-1408 (duplicate saveMemory body and createSkill start)
// Keep from createSkill onwards (line 1409+)

const newLines = [
  ...lines.slice(0, 1374),    // lines 0-1373 (sendMessage end)
  ...lines.slice(1375, 1395), // my new functions (stopGeneration and saveMemory)
  ...lines.slice(1410)        // from createSkill onwards
);

fs.writeFileSync('D:/FREE.BOT/FREE.BOT-main/FREE.BOT-main/src/main.jsx', newLines.join('\n'));
console.log('Fixed!');