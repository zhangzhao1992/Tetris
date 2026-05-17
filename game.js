const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const STORAGE_KEY = "classic-tetris-best";

const COLORS = {
  I: "#45d7ff",
  J: "#5b7cfa",
  L: "#ff9f43",
  O: "#ffd166",
  S: "#48db8b",
  T: "#c77dff",
  Z: "#ff6b6b"
};

const SHAPES = {
  I: [[1, 1, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  T: [[0, 1, 0], [1, 1, 1]],
  Z: [[1, 1, 0], [0, 1, 1]]
};

const boardCanvas = document.querySelector("#board");
const boardCtx = boardCanvas.getContext("2d");
const nextCanvas = document.querySelector("#next");
const nextCtx = nextCanvas.getContext("2d");
const scoreEl = document.querySelector("#score");
const levelEl = document.querySelector("#level");
const linesEl = document.querySelector("#lines");
const bestEl = document.querySelector("#best");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlayTitle");
const startButton = document.querySelector("#startButton");
const pauseButton = document.querySelector("#pauseButton");
const restartButton = document.querySelector("#restartButton");
const soundToggle = document.querySelector(".sound-toggle");

let arena;
let current;
let next;
let score = 0;
let lines = 0;
let level = 1;
let dropCounter = 0;
let dropInterval = 850;
let lastTime = 0;
let running = false;
let paused = false;
let gameOver = false;
let soundOn = true;
let best = Number(localStorage.getItem(STORAGE_KEY) || 0);
let audioContext;
let musicTimer;
let musicStep = 0;
let repeatTimer;
let repeatDelayTimer;
let gestureStartX = 0;
let gestureStartY = 0;
let gestureLastX = 0;
let gestureLastY = 0;
let gestureMoved = false;

boardCtx.scale(BLOCK, BLOCK);
bestEl.textContent = best;

function createArena() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function createPiece() {
  const types = Object.keys(SHAPES);
  const type = types[Math.floor(Math.random() * types.length)];
  const matrix = SHAPES[type].map((row) => row.slice());

  return {
    type,
    matrix,
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: 0
  };
}

function drawCell(ctx, x, y, color, size = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(x + 0.08, y + 0.08, size - 0.16, 0.12);
  ctx.strokeStyle = "rgba(0,0,0,0.24)";
  ctx.lineWidth = 0.04;
  ctx.strokeRect(x + 0.02, y + 0.02, size - 0.04, size - 0.04);
}

function drawMatrix(ctx, matrix, offset, color) {
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        drawCell(ctx, x + offset.x, y + offset.y, color);
      }
    });
  });
}

function drawBoard() {
  boardCtx.fillStyle = "#0d141b";
  boardCtx.fillRect(0, 0, COLS, ROWS);

  boardCtx.strokeStyle = "rgba(255,255,255,0.055)";
  boardCtx.lineWidth = 0.025;
  for (let x = 0; x <= COLS; x += 1) {
    boardCtx.beginPath();
    boardCtx.moveTo(x, 0);
    boardCtx.lineTo(x, ROWS);
    boardCtx.stroke();
  }
  for (let y = 0; y <= ROWS; y += 1) {
    boardCtx.beginPath();
    boardCtx.moveTo(0, y);
    boardCtx.lineTo(COLS, y);
    boardCtx.stroke();
  }

  arena.forEach((row, y) => {
    row.forEach((color, x) => {
      if (color) {
        drawCell(boardCtx, x, y, color);
      }
    });
  });

  if (current) {
    drawGhost();
    drawMatrix(boardCtx, current.matrix, current, COLORS[current.type]);
  }
}

function drawGhost() {
  const ghost = { ...current, y: current.y };
  while (!collides(ghost)) {
    ghost.y += 1;
  }
  ghost.y -= 1;

  boardCtx.globalAlpha = 0.22;
  drawMatrix(boardCtx, current.matrix, ghost, "#ffffff");
  boardCtx.globalAlpha = 1;
}

function drawNext() {
  nextCtx.setTransform(1, 0, 0, 1, 0, 0);
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  nextCtx.fillStyle = "rgba(0,0,0,0.16)";
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  nextCtx.scale(24, 24);

  const matrix = next.matrix;
  const offset = {
    x: (5 - matrix[0].length) / 2,
    y: (5 - matrix.length) / 2
  };
  drawMatrix(nextCtx, matrix, offset, COLORS[next.type]);
}

function collides(piece) {
  return piece.matrix.some((row, y) => {
    return row.some((value, x) => {
      if (!value) {
        return false;
      }

      const boardY = y + piece.y;
      const boardX = x + piece.x;
      return boardX < 0 || boardX >= COLS || boardY >= ROWS || (boardY >= 0 && arena[boardY][boardX]);
    });
  });
}

function merge() {
  current.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        arena[y + current.y][x + current.x] = COLORS[current.type];
      }
    });
  });
}

function rotate(matrix) {
  return matrix[0].map((_, index) => matrix.map((row) => row[index]).reverse());
}

function rotatePiece() {
  if (!running || paused) {
    return;
  }

  const rotated = rotate(current.matrix);
  const originalX = current.x;
  current.matrix = rotated;

  const kicks = [0, -1, 1, -2, 2];
  const validKick = kicks.find((kick) => {
    current.x = originalX + kick;
    return !collides(current);
  });

  if (validKick === undefined) {
    current.matrix = rotate(rotate(rotate(rotated)));
    current.x = originalX;
  } else {
    playTone(440, 0.045);
  }
}

function movePiece(direction) {
  if (!running || paused) {
    return;
  }

  current.x += direction;
  if (collides(current)) {
    current.x -= direction;
  } else {
    playTone(180, 0.035);
  }
}

function softDrop() {
  if (!running || paused) {
    return;
  }

  current.y += 1;
  if (collides(current)) {
    current.y -= 1;
    lockPiece();
  } else {
    score += 1;
    updateStats();
  }
  dropCounter = 0;
}

function hardDrop() {
  if (!running || paused) {
    return;
  }

  let distance = 0;
  while (!collides(current)) {
    current.y += 1;
    distance += 1;
  }
  current.y -= 1;
  score += Math.max(0, distance - 1) * 2;
  lockPiece();
  dropCounter = 0;
}

function lockPiece() {
  merge();
  clearLines();
  current = next;
  next = createPiece();

  if (collides(current)) {
    endGame();
    return;
  }

  drawNext();
  updateStats();
}

function clearLines() {
  let cleared = 0;

  outer: for (let y = arena.length - 1; y >= 0; y -= 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!arena[y][x]) {
        continue outer;
      }
    }

    arena.splice(y, 1);
    arena.unshift(Array(COLS).fill(null));
    cleared += 1;
    y += 1;
  }

  if (cleared > 0) {
    const points = [0, 100, 300, 500, 800][cleared] * level;
    score += points;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(120, 850 - (level - 1) * 68);
    playTone(620, 0.08);
  }
}

function updateStats() {
  scoreEl.textContent = score;
  levelEl.textContent = level;
  linesEl.textContent = lines;
  if (score > best) {
    best = score;
    localStorage.setItem(STORAGE_KEY, String(best));
    bestEl.textContent = best;
  }
}

function startGame() {
  arena = createArena();
  current = createPiece();
  next = createPiece();
  score = 0;
  lines = 0;
  level = 1;
  dropCounter = 0;
  dropInterval = 850;
  running = true;
  paused = false;
  gameOver = false;
  pauseButton.textContent = "暂停";
  overlay.classList.add("is-hidden");
  updateStats();
  drawNext();
  playTone(330, 0.07);
  startMusic();
}

function endGame() {
  running = false;
  gameOver = true;
  stopMusic();
  overlayTitle.textContent = "游戏结束";
  startButton.textContent = "再玩一次";
  overlay.classList.remove("is-hidden");
  playTone(110, 0.16);
}

function togglePause() {
  if (!running || gameOver) {
    return;
  }

  paused = !paused;
  if (paused) {
    stopMusic();
  } else {
    startMusic();
  }
  pauseButton.textContent = paused ? "继续" : "暂停";
  overlayTitle.textContent = "已暂停";
  startButton.textContent = "继续";
  overlay.classList.toggle("is-hidden", !paused);
}

function update(time = 0) {
  const deltaTime = time - lastTime;
  lastTime = time;

  if (running && !paused) {
    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
      softDrop();
    }
  }

  drawBoard();
  requestAnimationFrame(update);
}

function playTone(frequency, duration) {
  if (!soundOn) {
    return;
  }

  ensureAudio();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = "triangle";
  gain.gain.setValueAtTime(0.045, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function ensureAudio() {
  audioContext ||= new AudioContext();
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function playMusicNote(frequency, duration, volume) {
  ensureAudio();
  const start = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "square";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.014);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function startMusic() {
  if (!soundOn || musicTimer || !running || paused || gameOver) {
    return;
  }

  const melody = [659, 494, 523, 587, 523, 494, 440, 440, 523, 659, 587, 523, 494, 523, 587, 659];
  const bass = [165, 165, 196, 196, 220, 220, 196, 196];

  const playBeat = () => {
    if (!soundOn || !running || paused || gameOver) {
      stopMusic();
      return;
    }

    playMusicNote(melody[musicStep % melody.length], 0.15, 0.024);
    if (musicStep % 2 === 0) {
      playMusicNote(bass[(musicStep / 2) % bass.length], 0.24, 0.014);
    }
    musicStep += 1;
  };

  playBeat();
  musicTimer = window.setInterval(playBeat, 185);
}

function stopMusic() {
  window.clearInterval(musicTimer);
  musicTimer = undefined;
}

function handleAction(action) {
  if (!running && action !== "start") {
    startGame();
    return;
  }

  if (action === "left") movePiece(-1);
  if (action === "right") movePiece(1);
  if (action === "rotate") rotatePiece();
  if (action === "down") softDrop();
  if (action === "drop") hardDrop();
}

function startRepeatingAction(action) {
  stopRepeatingAction();
  handleAction(action);

  if (!["left", "right", "down"].includes(action)) {
    return;
  }

  repeatDelayTimer = window.setTimeout(() => {
    repeatTimer = window.setInterval(() => handleAction(action), action === "down" ? 55 : 85);
  }, 170);
}

function stopRepeatingAction() {
  window.clearTimeout(repeatDelayTimer);
  window.clearInterval(repeatTimer);
  repeatDelayTimer = undefined;
  repeatTimer = undefined;
}

document.addEventListener("keydown", (event) => {
  const keyMap = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "rotate",
    ArrowDown: "down",
    " ": "drop",
    Enter: "start",
    p: "pause",
    P: "pause"
  };

  const action = keyMap[event.key];
  if (!action) {
    return;
  }

  event.preventDefault();
  if (action === "pause") {
    togglePause();
  } else if (action === "start") {
    paused ? togglePause() : startGame();
  } else {
    handleAction(action);
  }
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    startRepeatingAction(button.dataset.action);
  });

  button.addEventListener("pointerup", (event) => {
    event.preventDefault();
    stopRepeatingAction();
  });

  button.addEventListener("pointercancel", stopRepeatingAction);
  button.addEventListener("lostpointercapture", stopRepeatingAction);
});

startButton.addEventListener("click", () => {
  if (paused) {
    togglePause();
  } else {
    startGame();
  }
});

pauseButton.addEventListener("click", togglePause);
restartButton.addEventListener("click", startGame);
soundToggle.addEventListener("click", () => {
  soundOn = !soundOn;
  soundToggle.classList.toggle("is-off", !soundOn);
  if (soundOn) {
    startMusic();
  } else {
    stopMusic();
  }
});

boardCanvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  boardCanvas.setPointerCapture(event.pointerId);
  gestureStartX = event.clientX;
  gestureStartY = event.clientY;
  gestureLastX = event.clientX;
  gestureLastY = event.clientY;
  gestureMoved = false;
});

boardCanvas.addEventListener("pointermove", (event) => {
  if (!boardCanvas.hasPointerCapture(event.pointerId)) {
    return;
  }

  event.preventDefault();
  const dx = event.clientX - gestureLastX;
  const dy = event.clientY - gestureLastY;

  if (Math.abs(dx) >= 28 && Math.abs(dx) > Math.abs(dy)) {
    handleAction(dx > 0 ? "right" : "left");
    gestureLastX = event.clientX;
    gestureMoved = true;
  }

  if (dy >= 34 && Math.abs(dy) > Math.abs(dx)) {
    handleAction("down");
    gestureLastY = event.clientY;
    gestureMoved = true;
  }
});

boardCanvas.addEventListener("pointerup", (event) => {
  event.preventDefault();
  const totalX = event.clientX - gestureStartX;
  const totalY = event.clientY - gestureStartY;

  if (!gestureMoved && Math.abs(totalX) < 18 && Math.abs(totalY) < 18) {
    handleAction("rotate");
  } else if (totalY > 90 && Math.abs(totalY) > Math.abs(totalX) * 1.25) {
    handleAction("drop");
  }

  if (boardCanvas.hasPointerCapture(event.pointerId)) {
    boardCanvas.releasePointerCapture(event.pointerId);
  }
});

boardCanvas.addEventListener("pointercancel", (event) => {
  if (boardCanvas.hasPointerCapture(event.pointerId)) {
    boardCanvas.releasePointerCapture(event.pointerId);
  }
});

document.addEventListener("gesturestart", (event) => event.preventDefault());

arena = createArena();
current = createPiece();
next = createPiece();
drawNext();
updateStats();
update();
