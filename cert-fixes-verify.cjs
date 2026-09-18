// Quick verification of the two fixes
const path = require('node:path');
const os = require('node:os');
const fsp = require('node:fs/promises');

const aud = require('D:/FREE.BOT/FREE.BOT-main/FREE.BOT-main/electron/fs-audit.cjs');

const sizeOf = (bytes) =>
  bytes < 1024 ? `${bytes}B` : bytes < 1048576 ? `${(bytes/1024).toFixed(1)}KB` : `${(bytes/1048576).toFixed(1)}MB`;

// Simulate the FIXED preload normalization
function normalizeDrives(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((d) => {
    const letterMatch = typeof d === 'string' ? d.match(/^([A-Za-z]):/) : null;
    const letter = letterMatch ? letterMatch[1].toUpperCase() : '?';
    return {
      letter,
      label: `Disco Local (${letter}:)`,
      path: d,
      available: true
    };
  });
}

// Simulate the FIXED router regex (updated to match main.jsx)
function isDrivesIntent(t) {
  return /(^|\s)(unidades|drives|discos)\b/.test(t) &&
    /(quais\s+(?:unidades|drives|discos)\s+(?:existem|dispon[íi]veis)|mostre\s+(?:as\s+)?(?:unidades|drives|discos)\s*(?:dispon[íi]veis)?|liste\s+(?:as\s+)?(?:minhas\s+)?(?:unidades|drives|discos)\s*(?:dispon[íi]veis)?|liste\s+os\s+discos|quais\s+(?:unidades|drives|discos)\s+(?:existem|dispon[íi]veis))\b/.test(t);
}

// Test cases for regex
const driveTests = [
  ['unidades', false],           // só "unidades" - não é pergunta
  ['drives', false],             // só "drives" - não é pergunta
  ['discos', false],             // só "discos" - não é pergunta
  ['Quais unidades existem?', true],
  ['Quais drives existem?', true],
  ['Quais discos existem?', true],
  ['Mostre as unidades disponíveis', true],
  ['Liste minhas unidades', true],
  ['Liste os discos', true],
  ['Mostre unidades', true],
  ['Quais unidades devo usar na música?', false], // false positive
  ['Tenho uma unidade para esse projeto', false], // false positive
  ['Essa unidade está boa', false], // false positive
];

console.log('=== TESTE REGEX DRIVES ===');
let regexPass = 0, regexFail = 0;
for (const [input, expected] of driveTests) {
  const result = isDrivesIntent(input.toLowerCase());
  const ok = result === expected;
  console.log(`${ok ? '[PASS]' : '[FAIL]'} "${input}" -> ${result} (esperado: ${expected})`);
  if (ok) regexPass++; else regexFail++;
}

console.log(`\nRegex: ${regexPass} PASS, ${regexFail} FAIL`);

// Test normalization
console.log('\n=== TESTE NORMALIZAÇÃO DRIVES ===');
const mockModuleResult = ["C:\\", "D:\\", "E:\\"];
const normalized = normalizeDrives(mockModuleResult);
console.log('Entrada:', JSON.stringify(mockModuleResult));
console.log('Saída:', JSON.stringify(normalized, null, 2));

const normOk = normalized.every(d =>
  typeof d.letter === 'string' &&
  d.letter.match(/^[A-Z]$/) &&
  typeof d.label === 'string' &&
  d.label.includes(d.letter) &&
  typeof d.path === 'string' &&
  d.path.startsWith(d.letter + ':') &&
  d.available === true
);
console.log(`\nNormalização: ${normOk ? 'PASS' : 'FAIL'}`);

// Test full integration: mock the preload API
const mockApi = {
  drives: async () => {
    const raw = await aud.detectDrives();
    return normalizeDrives(raw);
  },
  inspect: async (p) => await aud.inspectPath(p),
};

console.log('\n=== TESTE INTEGRADO DRIVES ===');
async function testDrivesIntegration() {
  const res = await normalizeDrives(await aud.detectDrives());
  console.log('Resultado final:', JSON.stringify(res, null, 2));
  const ok = res.length >= 1 && res.every(d => d.letter && d.label && d.path);
  console.log(`Integração drives: ${ok ? 'PASS' : 'FAIL'}`);
  return ok;
}

(function() {
  testDrivesIntegration().then(ok => {
    console.log('\n=== RESULTADO FINAL ===');
    console.log(`Regex: ${regexPass}/${driveTests.length} PASS`);
    console.log(`Normalização: ${normOk ? 'PASS' : 'FAIL'}`);
    console.log(`Integração: ${ok ? 'PASS' : 'FAIL'}`);
    if (regexFail > 0 || !normOk || !ok) process.exit(1);
  }).catch(e => { console.error(e); process.exit(1); });
})();