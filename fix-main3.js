const fs = require('fs');
const content = fs.readFileSync('D:/FREE.BOT/FREE.BOT-main/FREE.BOT-main/src/main.jsx', 'utf8');
const lines = content.split('\n');

// Find createSkill line
let createSkillLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim().startsWith('const createSkill = () => {')) {
    console.log('createSkill at line:', i+1);
    break;
  }
}

const missingCode = `  const stopGeneration = () => {
    // BUG-01: aborta somente a geracao atual; o finally dela encerra o estado.
    abortRef.current?.abort();
  };

  const saveMemory = () => {
    if (!memTitle.trim() || !memContent.trim()) return notify('Titulo e conteudo obrigatorios');
    setMemories((value) => [
      {
        id: uid('mem'),
        title: memTitle.trim(),
        content: memContent.trim(),
        createdAt: new Date().toISOString(),
      },
      ...value,
    ]);
    setMemTitle('');
    setMemContent('');
    notify('Memoria salva');
  };`;

const insertAt = 1374; // after line 1373 (0-indexed), before line 1374 (saveMemory body)
const newLines = lines.slice(0, insertAt).concat(missingCode.split('\n')).concat(lines.slice(insertAt));

fs.writeFileSync('D:/FREE.BOT/FREE.BOT-main/FREE.BOT-main/src/main.jsx', newLines.join('\n'));
console.log('Fixed!');