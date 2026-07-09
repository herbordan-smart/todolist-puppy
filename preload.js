const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  togglePanel: () => ipcRenderer.send('toggle-panel'),

  loadTodos: () => ipcRenderer.invoke('load-todos'),

  addTodo: (text) => ipcRenderer.invoke('add-todo', text),

  saveTodo: (todo) => ipcRenderer.invoke('save-todo', todo),

  deleteTodo: (id) => ipcRenderer.invoke('delete-todo', id),

  reorderTodos: (orders) => ipcRenderer.invoke('reorder-todos', orders),

  movePuppy: (x, y) => ipcRenderer.send('move-puppy', { x, y }),

  closePanel: () => ipcRenderer.send('close-panel'),

  showContextMenu: () => ipcRenderer.send('show-context-menu'),

  openReport: () => ipcRenderer.send('open-report'),

  getStatus: () => ipcRenderer.invoke('get-status'),
});
