import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  child
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-database.js";

// 🔧 Firebase 設定
const firebaseConfig = {
  apiKey: "AIzaSyASsEV44jIDHdguu3GdpTeEE-r8tSRGAT0",
  authDomain: "test-b2b60.firebaseapp.com",
  databaseURL: "https://test-b2b60-default-rtdb.firebaseio.com",
  projectId: "test-b2b60",
  storageBucket: "test-b2b60.firebasestorage.app",
  messagingSenderId: "969704209980",
  appId: "1:969704209980:web:bac9ffc5b5ac66892c4d39"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// ✅ 分數寫入邏輯（若新分數更高才寫入）
function saveScoreToFirebase(name, score) {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    console.warn("❗ 無效的名稱，已略過儲存。");
    return;
  }
  if (typeof score !== 'number' || isNaN(score)) {
    console.warn("❗ 分數錯誤，已略過儲存。");
    return;
  }

  const userRef = ref(database, 'leaderboard/' + name.trim());
  get(userRef).then(snapshot => {
    const oldScore = snapshot.exists() ? snapshot.val().score : null;

    if (oldScore === null || score > oldScore) {
      set(userRef, { name: name.trim(), score });
      console.log("✅ 分數已寫入/更新");
    } else {
      console.log("⚠️ 舊分數較高，未更新");
    }
  });
}

// ✅ 取得排行榜（前 10 名）
async function getLeaderboardFromFirebase() {
  const snapshot = await get(child(ref(database), 'leaderboard'));
  if (snapshot.exists()) {
    const data = snapshot.val();
    return Object.values(data).sort((a, b) => b.score - a.score).slice(0, 10);
  } else {
    return [];
  }
}

// -------------------- 遊戲邏輯 --------------------

let canvas, ctx;
let box = 20;
let snake = [], computerSnake = [];
let direction = "RIGHT", computerDirection = "LEFT";
let food = {}, score = 0, computerScore = 0;
let gameInterval, isPaused = false;
let speed = 200, minSpeed = 60, speedStep = 10;
let playerName = "";

window.onload = function () {
  document.getElementById("startBtn").addEventListener("click", startGame);
};

function startGame() {
  playerName = document.getElementById("playerName").value.trim();
  if (!playerName) {
    alert("請輸入玩家名稱！");
    return;
  }

  document.getElementById("start-screen").style.display = "none";
  document.getElementById("game-container").style.display = "block";

  canvas = document.getElementById("gameCanvas");
  ctx = canvas.getContext("2d");

  snake = [{ x: 8 * box, y: 10 * box }];
  computerSnake = [{ x: 12 * box, y: 10 * box }];
  direction = "RIGHT";
  computerDirection = "LEFT";
  score = 0;
  computerScore = 0;
  speed = 200;

  document.getElementById("score").innerText = "分數：" + score;

  placeFood();
  clearInterval(gameInterval);
  gameInterval = setInterval(draw, speed);
  document.removeEventListener("keydown", changeDirection);
  document.addEventListener("keydown", changeDirection);
}

function placeFood() {
  const maxCols = canvas.width / box;
  const maxRows = canvas.height / box;
  let newFood, overlapping;

  do {
    overlapping = false;
    newFood = {
      x: Math.floor(Math.random() * maxCols) * box,
      y: Math.floor(Math.random() * maxRows) * box
    };
    for (let s of snake.concat(computerSnake)) {
      if (s.x === newFood.x && s.y === newFood.y) {
        overlapping = true;
        break;
      }
    }
  } while (overlapping);

  food = newFood;
}

function changeDirection(event) {
  const key = event.keyCode;
  if (key === 37 && direction !== "RIGHT") direction = "LEFT";
  else if (key === 38 && direction !== "DOWN") direction = "UP";
  else if (key === 39 && direction !== "LEFT") direction = "RIGHT";
  else if (key === 40 && direction !== "UP") direction = "DOWN";
}

function togglePause() {
  if (isPaused) {
    gameInterval = setInterval(draw, speed);
    document.getElementById("pauseBtn").innerText = "暫停";
  } else {
    clearInterval(gameInterval);
    document.getElementById("pauseBtn").innerText = "繼續";
  }
  isPaused = !isPaused;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  snake.forEach((s, i) => {
    ctx.fillStyle = i === 0 ? "#0f0" : "#fff";
    ctx.fillRect(s.x, s.y, box, box);
  });

  computerSnake.forEach((s, i) => {
    ctx.fillStyle = i === 0 ? "#f00" : "#fff";
    ctx.fillRect(s.x, s.y, box, box);
  });

  ctx.fillStyle = "red";
  ctx.fillRect(food.x, food.y, box, box);

  let headX = snake[0].x, headY = snake[0].y;
  if (direction === "LEFT") headX -= box;
  if (direction === "RIGHT") headX += box;
  if (direction === "UP") headY -= box;
  if (direction === "DOWN") headY += box;

  if (headX === food.x && headY === food.y) {
    score++;
    document.getElementById("score").innerText = "分數：" + score;
    placeFood();
    if (speed > minSpeed) {
      speed -= speedStep;
      clearInterval(gameInterval);
      gameInterval = setInterval(draw, speed);
    }
  } else {
    snake.pop();
  }
  snake.unshift({ x: headX, y: headY });

  let compX = computerSnake[0].x, compY = computerSnake[0].y;
  if (computerDirection === "LEFT") compX -= box;
  if (computerDirection === "RIGHT") compX += box;
  if (computerDirection === "UP") compY -= box;
  if (computerDirection === "DOWN") compY += box;

  if (compX === food.x && compY === food.y) {
    computerScore++;
    placeFood();
  } else {
    computerSnake.pop();
  }
  computerSnake.unshift({ x: compX, y: compY });

  if (
    collision(headX, headY, snake) ||
    headX < 0 || headX >= canvas.width ||
    headY < 0 || headY >= canvas.height
  ) {
    clearInterval(gameInterval);
    alert(`遊戲結束！你的分數是：${score}`);
    saveScore();
    return;
  }

  if (collision(headX, headY, computerSnake)) {
    clearInterval(gameInterval);
    alert(`你被電腦撞到了！你的分數是：${score}`);
    saveScore();
    return;
  }

  const directions = ["LEFT", "RIGHT", "UP", "DOWN"];
  computerDirection = directions[Math.floor(Math.random() * directions.length)];
}

function collision(x, y, arr) {
  return arr.slice(1).some(s => s.x === x && s.y === y);
}

function saveScore() {
  saveScoreToFirebase(playerName, score);
  displayLeaderboard();
}

function displayLeaderboard() {
  getLeaderboardFromFirebase().then(data => {
    const list = document.getElementById("leaderboard-list");
    list.innerHTML = "";
    data.forEach(entry => {
      const li = document.createElement("li");
      li.textContent = `${entry.name}: ${entry.score}`;
      list.appendChild(li);
    });
    document.getElementById("leaderboard").style.display = "block";
    document.getElementById("game-container").style.display = "none";
  });
}

function backToStart() {
  document.getElementById("leaderboard").style.display = "none";
  document.getElementById("start-screen").style.display = "block";
}
window.backToStart = backToStart; // 讓 onclick 能呼叫

