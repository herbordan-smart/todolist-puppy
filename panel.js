let todos = [];

function getCurrentWeek() {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function formatMs(ms) {
  if (!ms) return '';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  return remain > 0 ? `${hours}小时${remain}分` : `${hours}小时`;
}

function formatDateLabel(timestamp) {
  const today = new Date();
  const doneDate = new Date(timestamp);
  const todayStr = today.toISOString().split('T')[0];
  const doneStr = doneDate.toISOString().split('T')[0];
  if (todayStr === doneStr) return '今天完成';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.toISOString().split('T')[0] === doneStr) return '昨天完成';
  return `${doneDate.getMonth() + 1}月${doneDate.getDate()}日完成`;
}

const todoList = document.getElementById('todo-list');
const todoInput = document.getElementById('todo-input');
const addBtn = document.getElementById('add-btn');
const emptyState = document.getElementById('empty-state');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const titleDate = document.getElementById('title-date');
const closeBtn = document.getElementById('close-btn');
const reportBtn = document.getElementById('report-btn');

// 拖拽指示线
const dropIndicator = document.createElement('div');
dropIndicator.id = 'drop-indicator';
dropIndicator.style.cssText = 'display:none;position:fixed;height:2px;background:#FFE566;pointer-events:none;z-index:9999;border-radius:2px;';
const leftDot = document.createElement('div');
leftDot.style.cssText = 'position:absolute;left:-3px;top:-2px;width:6px;height:6px;background:#FFE566;border-radius:50%;';
const rightDot = document.createElement('div');
rightDot.style.cssText = 'position:absolute;right:-3px;top:-2px;width:6px;height:6px;background:#FFE566;border-radius:50%;';
dropIndicator.appendChild(leftDot);
dropIndicator.appendChild(rightDot);
document.body.appendChild(dropIndicator);

function updateDate() {
  const now = new Date();
  const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
  titleDate.textContent = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
}
updateDate();

closeBtn.addEventListener('click', (e) => { e.stopPropagation(); window.api.closePanel(); });
reportBtn.addEventListener('click', (e) => { e.stopPropagation(); window.api.openReport(); });

function updateProgress() {
  const done = todos.filter(t => t.status === 'done').length;
  const doing = todos.filter(t => t.status === 'doing').length;
  const total = todos.length;
  const pct = total > 0 ? Math.round((done + doing * 0.5) / total * 100) : 0;
  progressFill.style.width = `${pct}%`;
  progressText.textContent = `${done} / ${total} 完成`;
}

function render() {
  todoList.innerHTML = '';
  const doingTodos = todos.filter(t => t.status === 'doing');
  const todoItems  = todos.filter(t => t.status === 'todo');
  const doneTodos  = todos.filter(t => t.status === 'done');

  if (!doingTodos.length && !todoItems.length && !doneTodos.length) {
    emptyState.classList.remove('hidden');
    updateProgress(); return;
  }
  emptyState.classList.add('hidden');

  if (doingTodos.length) todoList.appendChild(createSection('进行中', 'doing', doingTodos));
  if (todoItems.length)  todoList.appendChild(createSection('待办', 'todo', todoItems));

  if (doneTodos.length) {
    const groups = {};
    doneTodos.forEach(t => {
      const label = formatDateLabel(t.done_at || Date.now());
      if (!groups[label]) groups[label] = [];
      groups[label].push(t);
    });

    const doneSection = document.createElement('li');
    doneSection.className = 'todo-section section-done';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = `<span class="collapse-arrow">▼</span><span class="section-label">完成</span><span class="section-badge">${doneTodos.length}</span>`;
    header.addEventListener('click', e => {
      e.stopPropagation();
      const lists = doneSection.querySelectorAll('.done-sub-list');
      const collapsed = lists[0]?.classList.contains('collapsed');
      lists.forEach(l => l.classList.toggle('collapsed'));
      header.querySelector('.collapse-arrow').textContent = collapsed ? '▼' : '▶';
    });
    doneSection.appendChild(header);

    const groupOrder = ['今天完成','昨天完成'];
    Object.keys(groups).sort((a,b) => {
      const ai = groupOrder.indexOf(a), bi = groupOrder.indexOf(b);
      if (ai>=0&&bi>=0) return ai-bi;
      if (ai>=0) return -1; if (bi>=0) return 1;
      return a.localeCompare(b);
    }).forEach(label => {
      const sh = document.createElement('div');
      sh.className = 'section-header';
      sh.style.paddingLeft = '16px';
      sh.innerHTML = `<span class="section-label" style="color:var(--color-done);font-size:11px;">${label}</span>`;
      sh.addEventListener('click', e => e.stopPropagation());
      doneSection.appendChild(sh);
      const sl = document.createElement('ul');
      sl.className = 'section-list done-sub-list';
      groups[label].forEach(t => sl.appendChild(createItem(t, true)));
      doneSection.appendChild(sl);
    });
    todoList.appendChild(doneSection);
  }
  updateProgress();
}

function createSection(label, status, items) {
  const section = document.createElement('li');
  section.className = `todo-section section-${status}`;
  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `<span class="section-label">${label}</span><span class="section-badge">${items.length}</span>`;
  section.appendChild(header);
  const list = document.createElement('ul');
  list.className = 'section-list draggable-list';
  list.setAttribute('data-section-status', status);
  items.forEach(t => list.appendChild(createItem(t)));
  section.appendChild(list);
  return section;
}

function createItem(todo, isDone = false) {
  const li = document.createElement('li');
  li.className = `todo-item status-${todo.status}`;
  li.setAttribute('data-id', todo.id);

  const statusBtn = document.createElement('button');
  statusBtn.className = 'status-btn';
  statusBtn.innerHTML = '<span class="status-icon"></span>';
  statusBtn.addEventListener('click', (e) => { e.stopPropagation(); cycleStatus(todo.id); });
  li.appendChild(statusBtn);

  const textSpan = document.createElement('span');
  textSpan.className = 'todo-text';
  textSpan.textContent = todo.text;
  textSpan.addEventListener('dblclick', (e) => { e.stopPropagation(); startEdit(todo.id, textSpan); });
  li.appendChild(textSpan);

  if (!isDone) {
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.addEventListener('mousedown', e => { e.stopPropagation(); startDrag(e, li); });
    li.appendChild(handle);
  }

  const del = document.createElement('button');
  del.className = 'delete-btn';
  del.textContent = '✕';
  del.addEventListener('click', (e) => { e.stopPropagation(); removeTodo(todo.id, li); });
  li.appendChild(del);
  return li;
}

async function cycleStatus(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;
  todo.status = { 'todo':'doing', 'doing':'done', 'done':'todo' }[todo.status];
  await window.api.saveTodo({...todo});
  todos = await window.api.loadTodos();
  render();
}

async function startEdit(id, textSpan) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;
  const input = document.createElement('input');
  input.className = 'todo-edit-input';
  input.value = todo.text;
  input.maxLength = 100;
  const save = async () => {
    const newText = input.value.trim();
    if (newText && newText !== todo.text) { todo.text = newText; await window.api.saveTodo(todo); }
    todos = await window.api.loadTodos(); render();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = todo.text; input.blur(); }
  });
  textSpan.replaceWith(input);
  input.focus(); input.select();
}

async function addTodo() {
  const text = todoInput.value.trim();
  if (!text) return;
  await window.api.addTodo(text);
  todoInput.value = '';
  todos = await window.api.loadTodos();
  render();
}
addBtn.addEventListener('click', addTodo);

async function removeTodo(id, li) {
  li.classList.add('removing');
  await new Promise(r => setTimeout(r, 200));
  await window.api.deleteTodo(id);
  todos = await window.api.loadTodos();
  render();
}

// ── 拖拽排序：上半部分→插在前，下半部分→插在后 ──
function startDrag(e, li) {
  e.preventDefault();
  const dragId = parseInt(li.dataset.id);
  const rect = li.getBoundingClientRect();

  const ghost = li.cloneNode(true);
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;opacity:0.6;pointer-events:none;z-index:9998;background:#FFF8E8;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);`;
  document.body.appendChild(ghost);
  li.style.opacity = '0.3';

  const startY = e.clientY;
  const startTop = rect.top;

  // 只在同一个 section 的 draggable-list 中排序
  const parentList = li.closest('.draggable-list');

  function getInsertTarget(clientY) {
    if (!parentList) return { indicatorY: null, insertBeforeEl: null };
    const items = [...parentList.querySelectorAll('.todo-item')].filter(el => el !== li);
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (clientY < mid) {
        // 鼠标在上半部分 → 插在该任务前面
        return { indicatorY: r.top, insertBeforeEl: items[i] };
      }
    }
    // 鼠标在所有任务下方 → 插在最后
    if (items.length > 0) {
      const lastR = items[items.length-1].getBoundingClientRect();
      return { indicatorY: lastR.bottom, insertBeforeEl: null };
    }
    return { indicatorY: null, insertBeforeEl: null };
  }

  function onMove(e2) {
    ghost.style.top = (startTop + e2.clientY - startY) + 'px';
    const { indicatorY } = getInsertTarget(e2.clientY);
    if (indicatorY !== null && parentList) {
      const cr = parentList.getBoundingClientRect();
      dropIndicator.style.display = 'block';
      dropIndicator.style.top = (indicatorY - 1) + 'px';
      dropIndicator.style.left = (cr.left + 8) + 'px';
      dropIndicator.style.width = (cr.width - 16) + 'px';
    } else {
      dropIndicator.style.display = 'none';
    }
  }

  async function onUp(e2) {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    ghost.remove();
    dropIndicator.style.display = 'none';
    li.style.opacity = '';

    const { insertBeforeEl } = getInsertTarget(e2.clientY);
    const dragIdx = todos.findIndex(t => t.id === dragId);
    if (dragIdx === -1) return;
    const [moved] = todos.splice(dragIdx, 1);
    if (insertBeforeEl) {
      const targetId = parseInt(insertBeforeEl.dataset.id);
      const targetIdx = todos.findIndex(t => t.id === targetId);
      todos.splice(targetIdx, 0, moved);
    } else {
      todos.push(moved);
    }
    const orders = todos.map((t, i) => ({ id: t.id, sort_order: i }));
    await window.api.reorderTodos(orders);
    todos = await window.api.loadTodos();
    render();
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

document.addEventListener('contextmenu', e => { e.preventDefault(); window.api.showContextMenu(); });
document.addEventListener('click', e => {
  if (!e.target.closest('#close-btn') && !e.target.closest('#report-btn')) {
    // 点击面板内部不关闭
  }
});

async function init() {
  todos = await window.api.loadTodos();
  render();
}
init();
setInterval(async () => { todos = await window.api.loadTodos(); updateDate(); render(); }, 60000);
