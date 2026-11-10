/* Puppy Todo — browser demo data layer.
 * Replaces the Electron main process for the GitHub Pages demo:
 *  - window.api        -> what preload.js exposes to panel.js
 *  - fetch('/api/stats') -> what the Express server in main.js serves to the report page
 *  - WebSocket         -> "data-changed" broadcast, implemented with the localStorage `storage` event
 * computeStats() below is copied verbatim from main.js. All data lives in this browser's localStorage.
 */
(() => {
  const KEY = 'puppy-todo-demo-db-v1';
  let db = null;

  function dateStr(ts) { return new Date(ts).toISOString().split('T')[0]; }
  function getWeekString(date) {
    const d = new Date(date);
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }
  function getCurrentWeek() { return getWeekString(Date.now()); }

  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  function nextId() { const id = db._nextId; db._nextId++; return id; }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  // ---------- sample data (generated relative to today, reset daily) ----------
  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const POOL = ['整理用户访谈纪要', '撰写需求文档 PRD', '竞品分析：滴答清单', '评审交互原型', '跟进数据埋点方案',
    '复盘上周数据', '梳理功能优先级', '绘制用户旅程图', '写周报', '学习 SQL 查询', '健身 30 分钟', '阅读 20 页',
    '约谈设计同学', '整理会议纪要', '优化引导流程', '回复用户反馈', '准备产品评审材料', '设计小狗表情状态', '核对上线清单', '更新路线图'];

  function seedDb() {
    const rand = rng(20261111);
    const now = Date.now();
    const n = new Date(now);
    const d0 = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    const out = { todos: [], status_logs: [], daily_reports: [], _nextId: 1, seedDate: dateStr(now) };
    db = out;
    const curWeek = getCurrentWeek();
    const H = 3600000, M = 60000;
    function add(day, text, h, m, dur, withDoing, week) {
      const created = day + 1 * H;
      const doing = day + h * H + m * M;
      out.todos.push({ id: nextId(), text, status: 'done', created_at: created, doing_at: withDoing ? doing : null, done_at: doing + dur * M, sort_order: out.todos.length + 1, week: week || getWeekString(created) });
    }
    // history: ~11 months, UTC hours 2..10 (≈ 10:00-18:00 in UTC+8)
    for (let i = 330; i >= 3; i--) {
      const day = d0 - i * 86400000;
      const dd = new Date(day);
      const wd = dd.getUTCDay();
      const month = dd.getUTCMonth() + 1;
      const weekend = wd === 0 || wd === 6;
      if (rand() > (weekend ? 0.25 : 0.8)) continue;
      const maxN = weekend ? 2 : Math.min(6, 2 + Math.floor(month / 3));
      const cnt = 1 + Math.floor(rand() * maxN);
      let h = 2;
      for (let k = 0; k < cnt; k++) {
        add(day, POOL[Math.floor(rand() * POOL.length)], h, Math.floor(rand() * 4) * 15, 20 + Math.floor(rand() * 8) * 15, rand() > 0.15);
        h += 1;
        if (h > 9) break;
      }
    }
    // the last two days: shown in the panel's "昨天完成" group and in the month view
    const y2 = d0 - 2 * 86400000, y1 = d0 - 86400000;
    add(y2, '整理用户访谈纪要', 2, 0, 70, true, curWeek);
    add(y2, '梳理功能优先级', 4, 0, 90, true, curWeek);
    add(y1, '绘制用户旅程图', 2, 15, 80, true, curWeek);
    add(y1, '评审交互原型', 4, 0, 60, true, curWeek);
    add(y1, '写周报', 7, 30, 30, true, curWeek);
    // today: done a few minutes ago, so it always lands on "today"
    [['整理会议纪要', 55, 30], ['设计小狗表情状态', 35, 22], ['核对上线清单', 12, 9]].forEach(([text, agoMin, dur]) => {
      const done = now - agoMin * M;
      out.todos.push({ id: nextId(), text, status: 'done', created_at: now - 4 * H, doing_at: done - dur * M, done_at: done, sort_order: out.todos.length + 1, week: curWeek });
    });
    out.todos.push({ id: nextId(), text: '撰写作品集文案', status: 'doing', created_at: now - 4 * H, doing_at: now - 8 * M, done_at: null, sort_order: 1, week: curWeek });
    out.todos.push({ id: nextId(), text: '预约周五产品评审', status: 'todo', created_at: now - 4 * H, doing_at: null, done_at: null, sort_order: 2, week: curWeek });
    out.todos.push({ id: nextId(), text: '整理下周访谈提纲', status: 'todo', created_at: now - 4 * H, doing_at: null, done_at: null, sort_order: 3, week: curWeek });
    save();
    return out;
  }

  function sync() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) db = JSON.parse(raw);
    } catch (e) { db = null; }
    if (!db || db.seedDate !== dateStr(Date.now())) seedDb();
  }

  // ---------- copied verbatim from main.js ----------
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


  // ---------- window.api (what preload.js exposes) ----------
  const api = {
    loadTodos: async () => {
      sync();
      const week = getCurrentWeek();
      const statusOrder = { doing: 0, todo: 1, done: 2 };
      return clone(db.todos.filter(t => t.week === week).sort((a, b) => {
        const so = statusOrder[a.status] - statusOrder[b.status];
        if (so !== 0) return so;
        if (a.status === 'done') return (b.done_at || 0) - (a.done_at || 0);
        return a.sort_order - b.sort_order;
      }));
    },
    addTodo: async (text) => {
      sync();
      const now = Date.now(); const week = getCurrentWeek();
      const maxOrder = db.todos.filter(t => t.week === week && t.status === 'todo').reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
      const todo = { id: nextId(), text, status: 'todo', created_at: now, doing_at: null, done_at: null, sort_order: maxOrder + 1, week };
      db.todos.push(todo); save(); return clone(todo);
    },
    saveTodo: async (todo) => {
      sync();
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
      save(); return clone(existing);
    },
    deleteTodo: async (id) => {
      sync();
      db.todos = db.todos.filter(t => t.id !== id);
      db.status_logs = db.status_logs.filter(l => l.todo_id !== id);
      save(); return { success: true };
    },
    getStatus: async () => {
      sync();
      const today = new Date().toISOString().slice(0, 10);
      const todos = db.todos.filter(t => t.week === getCurrentWeek());
      const todayDoneCount = db.todos.filter(t => t.status === 'done' && t.done_at && new Date(t.done_at).toISOString().slice(0, 10) === today).length;
      return { doingCount: todos.filter(t => t.status === 'doing').length, todoCount: todos.filter(t => t.status === 'todo').length, doneCount: todos.filter(t => t.status === 'done').length, todayDoneCount };
    },
    reorderTodos: async (orders) => {
      sync();
      orders.forEach(({ id, sort_order }) => { const todo = db.todos.find(t => t.id === id); if (todo) todo.sort_order = sort_order; });
      save(); return { success: true };
    },
    closePanel: () => { try { if (parent !== window) parent.postMessage({ type: 'puppy:close-panel' }, '*'); } catch (e) {} },
    openReport: () => { window.open('report.html', '_blank'); },
    showContextMenu: () => { try { if (parent !== window) parent.postMessage({ type: 'puppy:context-menu' }, '*'); } catch (e) {} },
    togglePanel: () => {},
    movePuppy: () => {},
    resetDemo: () => { try { localStorage.removeItem(KEY); } catch (e) {} seedDb(); },
  };
  window.api = api;

  // ---------- fetch('/api/stats') -> computeStats ----------
  const realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (/\/api\/stats/.test(url)) {
      sync();
      const u = new URL(url, location.href);
      const data = computeStats(u.searchParams.get('view') || 'dashboard', u.searchParams.get('date'), u.searchParams.get('month'));
      return Promise.resolve(new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } }));
    }
    return realFetch ? realFetch(input, init) : Promise.reject(new Error('fetch unavailable'));
  };

  // ---------- WebSocket "data-changed" via the storage event ----------
  window.WebSocket = class {
    constructor() {
      this.readyState = 1;
      this._h = (e) => { if (e.key === KEY && typeof this.onmessage === 'function') this.onmessage({ data: JSON.stringify({ type: 'data-changed', timestamp: Date.now() }) }); };
      window.addEventListener('storage', this._h);
      setTimeout(() => { if (typeof this.onopen === 'function') this.onopen({}); }, 0);
    }
    send() {}
    close() { window.removeEventListener('storage', this._h); this.readyState = 3; }
  };
})();
