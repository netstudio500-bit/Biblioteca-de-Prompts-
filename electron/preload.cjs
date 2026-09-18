const { contextBridge, ipcRenderer } = require('electron');

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

contextBridge.exposeInMainWorld('botiaDesktop', {
  inspectOllama: () => ipcRenderer.invoke('ollama:inspect'),
  startOllama: () => ipcRenderer.invoke('ollama:start'),
  filesystem: {
    drives: async () => {
      const raw = await ipcRenderer.invoke('filesystem:drives');
      return normalizeDrives(raw.drives ?? raw);
    },
    inspect: (payload) => ipcRenderer.invoke('filesystem:inspect', payload),
    list: (payload) => ipcRenderer.invoke('filesystem:list', payload),
    search: (payload) => ipcRenderer.invoke('filesystem:search', payload),
    discover: (payload) => ipcRenderer.invoke('filesystem:discover', payload),
    hash: (payload) => ipcRenderer.invoke('filesystem:hash', payload),
    cancel: (payload) => ipcRenderer.invoke('filesystem:cancel', payload),
  },
});
