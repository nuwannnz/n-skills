const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['chat:message', 'chat:ask', 'chat:ask-cancel', 'docs:changed', 'project:added', 'project:focus', 'git:state', 'app:focus', 'update:available', 'create:progress', 'usage:update', 'usage:context', 'usage:limits', 'models:list'];
const call = channel => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  init: call('app:init'),
  addProject: call('project:add'),
  pickFolder: call('dialog:folder'),
  createProject: call('project:create'),
  removeProject: call('project:remove'),
  docs: call('project:docs'),
  scrumo: call('scrumo'),
  send: call('chat:send'),
  interrupt: call('chat:interrupt'),
  reset: call('chat:reset'),
  chats: call('chats:list'),
  openChat: call('chats:open'),
  answer: call('chat:answer'),
  setTheme: call('settings:theme'),
  usage: call('usage:get'),
  setModel: call('model:set'),
  setUpdates: call('settings:updates'),
  installUpdate: call('update:install'),
  restart: call('app:restart'),
  setPermissions: call('settings:permissions'),
  git: {
    sync: call('git:sync'),
    status: call('git:status'),
    identity: call('git:identity'),
    setIdentity: call('git:set-identity'),
    diff: call('git:diff'),
    fileLog: call('git:file-log'),
    save: call('git:save'),
  },
  openUrl: call('open-url'),
  on: (channel, fn) => {
    if (EVENTS.includes(channel)) ipcRenderer.on(channel, (_e, data) => fn(data));
  },
});
