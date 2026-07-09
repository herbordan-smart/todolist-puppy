const { app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { WebSocketServer } = require('ws');

let wss = null;
function broadcastDataChanged() {
  if (!wss) return;
  const msg = JSON.stringify({ type: 'data-changed', timestamp: Date.now() });
  wss.clients.forEach(client => { if (client.readyState === 1) client.send(msg); });
}

let puppyWindow = null;
let panelWindow = null;
let reportWindow = null;
let isPanelVisible = false;
let db = null;

function getDbPath() {
  return path.join(app.getPath('userData'), 'puppy-todo-data.json');
}

function loadDb() {
  const dbPath = getDbPath();
  const defaultDb = { todos: [], status_logs: [], daily_reports: [], _nextId: 1 };
  if (!fs.existsSync(dbPath)) { fs.writeFileSync(dbPath, JSON.stringify(defaultDb, null, 2)); return defaultDb; }
  try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch (e) { return defaultDb; }
}

function saveDb() { fs.writeFileSync(getDbPath(), JSON.stringify(db, null, 2)); }
function nextId() { const id = db._nextId; db._nextId++; saveDb(); return id; }
function initDatabase() { db = loadDb(); console.log('[puppy-todo] Database loaded from', getDbPath()); }

function getWeekString(date) {
  const d = new Date(date);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
function getCurrentWeek() { return getWeekString(Date.now()); }
function dateStr(ts) { return new Date(ts).toISOString().split('T')[0]; }

function generateDailyReport() {
  const today = dateStr(Date.now());
  if (db.daily_reports.find(r => r.date === today)) return;
  const stats = { total: db.todos.length, byStatus: { todo: db.todos.filter(t => t.status === 'todo').length, doing: db.todos.filter(t => t.status === 'doing').length, done: db.todos.filter(t => t.status === 'done').length }, todayDone: db.todos.filter(t => t.status === 'done' && t.done_at && dateStr(t.done_at) === today).length };
  db.daily_reports.push({ id: nextId(), date: today, generated_at: Date.now(), data_json: JSON.stringify({ stats, todos: db.todos, logs: db.status_logs.slice(-200) }) });
  saveDb();
}

function startReportScheduler() {
  setInterval(() => { const now = new Date(); if (now.getHours() === 23 && now.getMinutes() >= 59) generateDailyReport(); }, 60000);
  generateDailyReport();
}

function createPuppyWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  puppyWindow = new BrowserWindow({
    width: 120, height: 120, x: width - 150, y: height - 150,
    frame: false, transparent: true, alwaysOnTop: true, resizable: false, skipTaskbar: true, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  puppyWindow.loadFile('puppy.html');
}

function createPanelWindow() {
  panelWindow = new BrowserWindow({
    width: 320, height: 500, frame: false, transparent: true, alwaysOnTop: true, resizable: false, skipTaskbar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  panelWindow.loadFile('panel.html');
}

function createReportWindow() {
  if (reportWindow && !reportWindow.isDestroyed()) { reportWindow.focus(); return; }
  reportWindow = new BrowserWindow({ width: 1200, height: 800, frame: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  reportWindow.loadURL('http://localhost:3000');
  reportWindow.once('ready-to-show', () => reportWindow.show());
  reportWindow.on('closed', () => { reportWindow = null; });
}

function updatePanelPosition() {
  if (!puppyWindow || !panelWindow) return;
  const [gx, gy] = puppyWindow.getPosition();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const panelW = 320, panelH = 500, margin = 12;
  let px = gx - panelW - margin;
  let py = gy + 120 - panelH;
  if (px < 0) px = gx + 120 + margin;
  if (py < 0) py = 0;
  if (py + panelH > sh) py = sh - panelH;
  panelWindow.setPosition(Math.round(px), Math.round(py));
}

function showContextMenu() {
  const menu = Menu.buildFromTemplate([
    { label: '📋 打开任务栏', click: () => { if (isPanelVisible) { panelWindow.hide(); isPanelVisible = false; } else { updatePanelPosition(); panelWindow.show(); isPanelVisible = true; } } },
    { label: '📔 打开报告', click: () => createReportWindow() },
    { type: 'separator' },
    { label: '🐾 小狗拜拜', click: () => app.quit() },
  ]);
  menu.popup({ window: puppyWindow });
}

function computeStats(view, queryDate, queryMonth) {
  const now = new Date();
  const today = dateStr(now.getTime());
  const weekStr = getCurrentWeek();
  const year = now.getFullYear();
  const monthStr = queryMonth || `${year}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const doneTodos = db.todos.filter(t => t.status === 'done' && t.done_at);
  const stats = {
    today: { date: today, doneCount: doneTodos.filter(t => dateStr(t.done_at) === today).length, doingCount: db.todos.filter(t => t.status === 'doing').length, todoCount: db.todos.filter(t => t.status === 'todo' && t.week === weekStr).length, todos: doneTodos.filter(t => dateStr(t.done_at) === today).sort((a, b) => b.done_at - a.done_at) },
    thisWeek: { week: weekStr, doneCount: db.todos.filter(t => t.status === 'done' && t.week === weekStr).length, totalCount: db.todos.filter(t => t.week === weekStr).length },
    thisMonth: { month: monthStr, doneCount: doneTodos.filter(t => dateStr(t.done_at).startsWith(monthStr)).length },
    total: db.todos.length, totalDone: doneTodos.length,
  };
  stats.last7days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const dStr = dateStr(d.getTime());
    const dayTodos = doneTodos.filter(t => dateStr(t.done_at) === dStr && t.doing_at);
    stats.last7days.push({ date: dStr, count: doneTodos.filter(t => dateStr(t.done_at) === dStr).length, avgDoingMs: dayTodos.length > 0 ? Math.round(dayTodos.reduce((s, t) => s + (t.done_at - t.doing_at), 0) / dayTodos.length) : 0, totalAvgMs: dayTodos.length > 0 ? Math.round(dayTodos.reduce((s, t) => s + (t.done_at - t.created_at), 0) / dayTodos.length) : 0 });
  }
  if (view === 'year') {
    const heatMap = {};
    doneTodos.filter(t => new Date(t.done_at).getFullYear() === year).forEach(t => { const d = dateStr(t.done_at); if (!heatMap[d]) heatMap[d] = { count: 0, tasks: [] }; heatMap[d].count++; heatMap[d].tasks.push({ id: t.id, text: t.text, doingMs: t.doing_at ? t.done_at - t.doing_at : null, totalMs: t.done_at - t.created_at }); });
    stats.heatMap = heatMap; stats.year = year;
  }
  if (view === 'month') {
    const calendarData = {};
    doneTodos.filter(t => dateStr(t.done_at).startsWith(monthStr || today.substring(0,7))).forEach(t => { const d = dateStr(t.done_at); if (!calendarData[d]) calendarData[d] = { count: 0, tasks: [] }; calendarData[d].count++; calendarData[d].tasks.push({ id: t.id, text: t.text, doingMs: t.doing_at ? t.done_at - t.doing_at : null, totalMs: t.done_at - t.created_at }); });
    stats.calendarData = calendarData; stats.month = monthStr;
  }
  if (view === 'day') {
    const targetDay = queryDate || today;
    const dayTodos = doneTodos.filter(t => dateStr(t.done_at) === targetDay);
    stats.day = { date: targetDay, count: dayTodos.length, tasks: dayTodos.sort((a, b) => (a.doing_at || a.created_at) - (b.doing_at || b.created_at)).map(t => ({ id: t.id, text: t.text, status: t.status, created_at: t.created_at, doing_at: t.doing_at, done_at: t.done_at, doingMs: t.doing_at ? t.done_at - t.doing_at : null, totalMs: t.done_at - t.created_at })) };
  }
  return stats;
}

function startReportServer() {
  const serverApp = express();
  serverApp.use(express.static(path.join(__dirname, 'report')));
  serverApp.get('/api/todos/history', (_req, res) => res.json({ success: true, data: db.todos }));
  serverApp.get('/api/reports/daily', (_req, res) => res.json({ success: true, data: db.daily_reports.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 90).map(({ id, date, generated_at }) => ({ id, date, generated_at })) }));
  serverApp.get('/api/stats', (req, res) => { try { res.json({ success: true, data: computeStats(req.query.view || 'dashboard', req.query.date, req.query.month) }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
  serverApp.listen(3000, '127.0.0.1', () => console.log('[puppy-todo] Report server at http://localhost:3000'));
  wss = new WebSocketServer({ port: 3001, host: '127.0.0.1' });
  wss.on('connection', ws => { ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() })); });
  console.log('[puppy-todo] WebSocket server at ws://localhost:3001');
}

app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: true });
  initDatabase();
  createPuppyWindow();
  createPanelWindow();
  startReportServer();
  startReportScheduler();

  ipcMain.on('toggle-panel', () => { if (isPanelVisible) { panelWindow.hide(); isPanelVisible = false; } else { updatePanelPosition(); panelWindow.show(); isPanelVisible = true; } });
  ipcMain.on('show-context-menu', () => showContextMenu());
  ipcMain.on('open-report', () => createReportWindow());
  ipcMain.on('close-panel', () => { if (isPanelVisible) { panelWindow.hide(); isPanelVisible = false; } });
  ipcMain.on('move-puppy', (_event, { x, y }) => { puppyWindow.setPosition(Math.round(x), Math.round(y)); if (isPanelVisible) updatePanelPosition(); });

  ipcMain.handle('load-todos', () => {
    const week = getCurrentWeek();
    const statusOrder = { doing: 0, todo: 1, done: 2 };
    return db.todos.filter(t => t.week === week).sort((a, b) => { const so = statusOrder[a.status] - statusOrder[b.status]; if (so !== 0) return so; if (a.status === 'done') return (b.done_at || 0) - (a.done_at || 0); return a.sort_order - b.sort_order; });
  });

  ipcMain.handle('add-todo', (_event, text) => {
    const now = Date.now(); const week = getCurrentWeek();
    const maxOrder = db.todos.filter(t => t.week === week && t.status === 'todo').reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
    const todo = { id: nextId(), text, status: 'todo', created_at: now, doing_at: null, done_at: null, sort_order: maxOrder + 1, week };
    db.todos.push(todo); saveDb(); broadcastDataChanged(); return todo;
  });

  ipcMain.handle('save-todo', (_event, todo) => {
    const idx = db.todos.findIndex(t => t.id === todo.id);
    if (idx === -1) return null;
    const existing = db.todos[idx]; const now = Date.now();
    if (todo.status !== existing.status) {
      db.status_logs.push({ id: nextId(), todo_id: todo.id, from_status: existing.status, to_status: todo.status, changed_at: now });
      if (todo.status === 'doing' && !existing.doing_at) existing.doing_at = now;
      if (todo.status === 'done') existing.done_at = now;
      existing.status = todo.status;
    }
    if (todo.text !== undefined) existing.text = todo.text;
    saveDb(); broadcastDataChanged(); return existing;
  });

  ipcMain.handle('delete-todo', (_event, id) => {
    db.todos = db.todos.filter(t => t.id !== id);
    db.status_logs = db.status_logs.filter(l => l.todo_id !== id);
    saveDb(); broadcastDataChanged(); return { success: true };
  });

  ipcMain.handle('get-status', () => {
    const today = new Date().toISOString().slice(0, 10);
    const todos = db.todos.filter(t => t.week === getCurrentWeek());
    const todayDoneCount = db.todos.filter(t => t.status === 'done' && t.done_at && new Date(t.done_at).toISOString().slice(0, 10) === today).length;
    return { doingCount: todos.filter(t => t.status === 'doing').length, todoCount: todos.filter(t => t.status === 'todo').length, doneCount: todos.filter(t => t.status === 'done').length, todayDoneCount };
  });

  ipcMain.handle('reorder-todos', (_event, orders) => {
    orders.forEach(({ id, sort_order }) => { const todo = db.todos.find(t => t.id === id); if (todo) todo.sort_order = sort_order; });
    saveDb(); broadcastDataChanged(); return { success: true };
  });
});

app.on('window-all-closed', () => app.quit());
