const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['chat:message', 'chat:ask', 'chat:ask-cancel', 'docs:changed'];

contextBridge.exposeInMainWorld('api', {
  init: () => ipcRenderer.invoke('app:init'),
  pickProject: () => ipcRenderer.invoke('project:pick'),
  docs: () => ipcRenderer.invoke('project:docs'),
  scrumo: args => ipcRenderer.invoke('scrumo', args),
  send: text => ipcRenderer.invoke('chat:send', text),
  interrupt: () => ipcRenderer.invoke('chat:interrupt'),
  reset: () => ipcRenderer.invoke('chat:reset'),
  answer: reply => ipcRenderer.invoke('chat:answer', reply),
  setAutoEdits: value => ipcRenderer.invoke('settings:auto-edits', value),
  on: (channel, fn) => {
    if (EVENTS.includes(channel)) ipcRenderer.on(channel, (_e, data) => fn(data));
  },
});
