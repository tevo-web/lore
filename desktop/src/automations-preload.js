const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('autos', {
  list: () => ipcRenderer.invoke('auto:list'),
  template: () => ipcRenderer.invoke('auto:template'),
  edit: (id, drafts) => ipcRenderer.invoke('auto:edit', String(id), Array.isArray(drafts) ? drafts.map(String) : []),
  approve: (id) => ipcRenderer.invoke('auto:approve', String(id)),
  pause: (id, on) => ipcRenderer.invoke('auto:pause', String(id), !!on),
  remove: (id) => ipcRenderer.invoke('auto:remove', String(id)),
  runNow: (id) => ipcRenderer.invoke('auto:runNow', String(id)),
  testCreate: (spec) => ipcRenderer.invoke('auto:testcreate', spec),
  onUpdate: (fn) => ipcRenderer.on('auto:update', (_e, items) => fn(items))
});
