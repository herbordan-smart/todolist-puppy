const container = document.getElementById('puppy-container');
const puppyImg = document.getElementById('puppy-img');

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let windowStartX = 0;
let windowStartY = 0;
let hasMoved = false;
let mouseDownTime = 0;

// 状态缓存
let lastState = null;

// 右键菜单
container.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.api.showContextMenu();
});

container.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  isDragging = true;
  hasMoved = false;
  mouseDownTime = Date.now();
  dragStartX = e.screenX;
  dragStartY = e.screenY;

  windowStartX = window.screenX;
  windowStartY = window.screenY;

  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const dx = e.screenX - dragStartX;
  const dy = e.screenY - dragStartY;

  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    hasMoved = true;
  }

  if (hasMoved) {
    const newX = windowStartX + dx;
    const newY = windowStartY + dy;
    window.api.movePuppy(newX, newY);
  }
});

document.addEventListener('mouseup', (e) => {
  if (!isDragging) return;
  isDragging = false;

  const elapsed = Date.now() - mouseDownTime;
  if (!hasMoved && elapsed < 300) {
    window.api.togglePanel();
  }
  hasMoved = false;
});

// 状态切换（带淡入淡出动画）
const stateMap = {
  working:  `assets/dog-working.png?t=${Date.now()}`,
  playing:  `assets/dog-playing.png?t=${Date.now()}`,
  ready:    `assets/dog-ready.png?t=${Date.now()}`,
  waiting:  `assets/dog-waiting.png?t=${Date.now()}`,
};

function switchDogImage(state) {
  if (lastState === state) return;
  lastState = state;

  puppyImg.style.transition = 'opacity 0.3s ease';
  puppyImg.style.opacity = '0';

  setTimeout(() => {
    puppyImg.src = stateMap[state];
    puppyImg.style.opacity = '1';
  }, 300);
}

// 每 1 秒查询状态
async function refreshStatus() {
  try {
    const status = await window.api.getStatus();

    if (status.doingCount > 0) {
      switchDogImage('working');
    } else if (status.todoCount > 0) {
      switchDogImage('ready');
    } else if (status.todayDoneCount > 0) {
      switchDogImage('playing');
    } else {
      switchDogImage('waiting');
    }
  } catch (e) {
    console.error('[puppy-todo] Failed to fetch status:', e);
  }
}

refreshStatus();
setInterval(refreshStatus, 1000);
