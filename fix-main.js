const fs = require('fs');
const content = fs.readFileSync('D:/FREE.BOT/FREE.BOT-main/FREE.BOT-main/src/main.jsx', 'utf8');
const lines = content.split('\n');

const missingFunctions = `  const stopGeneration = () => {
    // BUG-01: aborta somente a geração atual; o finally dela encerra o estado.
    abortRef.current?.abort();
  };

  const saveMemory = () => {
    if (!memTitle.trim() || !memContent.trim()) return notify('Título e conteúdo obrigatórios');
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
    notify('Memória salva');
  };`;

const lines = content.split('\n');
const insertAt = 1374; // after line 1373 (0-indexed)
const newLines = lines.slice(0, insertAt).concat(missingFunctions.split('\n')).concat(lines.slice(insertAt));

fs.writeFileSync('D:/FREE.BOT/FREE.BOT-main/FREE.BOT-main/src/main.jsx', newLines.join('\n'));
console.log('Fixed!');