import {initializeApp} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {getFirestore, collection, doc, onSnapshot, writeBatch, getDocs} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const FIREBASE_CONFIG = (() => {
  try {
    return __FIREBASE_CONFIG__;
  } catch {
    return null;
  }
})();
const firebaseConfigured = Boolean(FIREBASE_CONFIG?.apiKey && FIREBASE_CONFIG?.authDomain
  && FIREBASE_CONFIG?.projectId && FIREBASE_CONFIG?.appId);
let auth = null;
let database = null;
let currentUser = null;
let stopListening = null;
let saveQueue = Promise.resolve();
let localTodos = [];
let todos = [];
let authReady = false;
let remoteTodosReady = false;

if (firebaseConfigured) {
  const app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  database = getFirestore(app);
}

const STORAGE_KEY = "my-little-day.todos.v1";
const signInButton = document.querySelector("#sign-in");
const signOutButton = document.querySelector("#sign-out");
const accountInfo = document.querySelector("#account-info");
const accountName = document.querySelector("#account-name");
const form = document.querySelector("#todo-form");
const input = document.querySelector("#title");
const list = document.querySelector("#items");
const message = document.querySelector("#message");
const emptyState = document.querySelector("#empty-state");
const count = document.querySelector("#task-count");
const clearDoneButton = document.querySelector("#clear-done");
const dateLabel = document.querySelector("#today-label");

function readLocalTodos() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value)
      ? value.filter((item) => item && (typeof item.id === "string" || Number.isSafeInteger(item.id))
        && typeof item.title === "string" && typeof item.done === "boolean")
        .map((item) => ({...item, id: String(item.id)}))
      : [];
  } catch {
    return [];
  }
}

function saveLocalTodos() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localTodos));
    return true;
  } catch {
    return false;
  }
}

function reportFirebaseError(error) {
  console.error("Firebase operation failed", error);
  const messages = {
    "auth/popup-closed-by-user": "已關閉 Google 登入視窗。",
    "auth/popup-blocked": "瀏覽器封鎖了登入視窗，請允許彈出視窗後重試。",
    "auth/unauthorized-domain": "這個網站網域尚未加入 Firebase 授權網域。",
    "permission-denied": "Firebase 權限不足，請檢查 Firestore 安全性規則。",
  };
  message.textContent = messages[error.code] || "Firebase 連線失敗，請確認設定與網路後再試。";
}

function connectUser(user) {
  stopListening?.();
  stopListening = null;
  currentUser = user;
  todos = [];
  remoteTodosReady = false;
  saveQueue = Promise.resolve();
  input.disabled = Boolean(user);
  form.querySelector("button[type=submit]").disabled = Boolean(user);
  signInButton.hidden = Boolean(user);
  accountInfo.hidden = !user;
  accountName.textContent = user ? (user.displayName || user.email || "Google 使用者") : "";
  if (!user) {
    todos = readLocalTodos();
    localTodos = todos.map((todo) => ({...todo}));
    render();
    return;
  }

  message.textContent = "正在載入雲端清單……";
  stopListening = onSnapshot(collection(database, "users", user.uid, "todos"), async (snapshot) => {
    if (currentUser?.uid !== user.uid) return;
    const isFirstServerSnapshot = !snapshot.metadata.fromCache && !remoteTodosReady;
    todos = snapshot.docs.map((entry) => ({id: entry.id, ...entry.data()}))
      .filter((todo) => typeof todo.title === "string" && typeof todo.done === "boolean");
    if (isFirstServerSnapshot) {
      if (snapshot.empty && localTodos.length) {
        todos = localTodos.map((todo) => ({...todo}));
        await persistTodos();
        if (currentUser?.uid !== user.uid) return;
        localTodos = [];
        saveLocalTodos();
      }
      remoteTodosReady = true;
      if (!snapshot.empty) {
        localTodos = [];
        saveLocalTodos();
      }
    }
    render();
    message.textContent = "清單已與 Firebase 同步";
  }, reportFirebaseError);
}

async function persistTodos() {
  if (!currentUser && auth && !authReady) {
    message.textContent = "正在確認登入狀態，請稍候再試。";
    return;
  }
  if (!currentUser) localTodos = todos.map((todo) => ({...todo}));
  if (!currentUser) {
    message.textContent = saveLocalTodos() ? "已儲存到這個瀏覽器" : "瀏覽器儲存空間無法使用，變更可能不會保留。";
    return;
  }

  const user = currentUser;
  const snapshot = todos.map((todo) => ({...todo}));
  const write = saveQueue.then(async () => {
    if (currentUser?.uid !== user.uid || !remoteTodosReady) return;
    const reference = collection(database, "users", user.uid, "todos");
    const existing = await getDocs(reference);
    if (currentUser?.uid !== user.uid) return;
    const batch = writeBatch(database);
    const keep = new Set(snapshot.map((todo) => todo.id));
    snapshot.forEach((todo) => batch.set(doc(reference, todo.id), {
      title: todo.title, done: todo.done, updatedAt: Date.now(),
    }));
    existing.docs.filter((entry) => !keep.has(entry.id)).forEach((entry) => batch.delete(entry.ref));
    if (snapshot.length || existing.size) await batch.commit();
    if (currentUser?.uid === user.uid) message.textContent = "清單已與 Firebase 同步";
  });
  saveQueue = write.catch(reportFirebaseError);
  await saveQueue;
}

dateLabel.textContent = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric", month: "long", day: "numeric", weekday: "long",
}).format(new Date());

function render() {
  list.replaceChildren();
  for (const todo of todos) {
    const item = document.createElement("li");
    item.className = `todo-item${todo.done ? " is-done" : ""}`;
    const checkbox = document.createElement("input");
    checkbox.className = "todo-check";
    checkbox.type = "checkbox";
    checkbox.checked = todo.done;
    checkbox.setAttribute("aria-label", `標記完成：${todo.title}`);
    checkbox.addEventListener("change", () => {
      todo.done = checkbox.checked;
      void persistTodos();
      render();
    });
    const title = document.createElement("span");
    title.className = "todo-title";
    title.textContent = todo.title;
    const remove = document.createElement("button");
    remove.className = "delete-button";
    remove.type = "button";
    remove.textContent = "刪除";
    remove.setAttribute("aria-label", `刪除：${todo.title}`);
    remove.addEventListener("click", () => {
      todos = todos.filter((entry) => entry.id !== todo.id);
      void persistTodos();
      render();
    });
    item.append(checkbox, title, remove);
    list.append(item);
  }
  const remaining = todos.filter((todo) => !todo.done).length;
  count.textContent = `${remaining} 件待辦`;
  emptyState.hidden = todos.length !== 0;
  list.hidden = todos.length === 0;
  clearDoneButton.hidden = !todos.some((todo) => todo.done);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = input.value.trim();
  if (!title) {
    message.textContent = "請先輸入待辦事項。";
    input.focus();
    return;
  }
  todos.unshift({id: crypto.randomUUID(), title, done: false});
  void persistTodos();
  render();
  input.value = "";
  input.focus();
});

clearDoneButton.addEventListener("click", () => {
  todos = todos.filter((todo) => !todo.done);
  void persistTodos();
  render();
});

signInButton.addEventListener("click", async () => {
  if (!auth) {
    message.textContent = "Firebase 尚未設定；請依 README 完成 Firebase 設定後重新部署。";
    return;
  }
  signInButton.disabled = true;
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    reportFirebaseError(error);
  } finally {
    signInButton.disabled = false;
  }
});

signOutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    reportFirebaseError(error);
  }
});

if (auth) {
  onAuthStateChanged(auth, (user) => {
    authReady = true;
    connectUser(user);
  }, reportFirebaseError);
} else {
  todos = readLocalTodos();
  localTodos = todos.map((todo) => ({...todo}));
  message.textContent = "尚未設定 Firebase；登入功能目前停用，待辦仍會保存在本機。";
  render();
}

const bmiForm = document.querySelector("#bmi-form");
const bmiResult = document.querySelector("#bmi-result");

bmiForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const heightCm = Number(bmiForm.elements.height.value);
  const weightKg = Number(bmiForm.elements.weight.value);
  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg)
      || heightCm < 50 || heightCm > 250 || weightKg < 10 || weightKg > 500) {
    bmiResult.textContent = "請輸入有效的身高（50–250 公分）與體重（10–500 公斤）。";
    return;
  }

  const bmi = weightKg / ((heightCm / 100) ** 2);
  let category;
  if (bmi < 18.5) category = "體重過輕";
  else if (bmi < 24) category = "正常範圍";
  else if (bmi < 27) category = "過重";
  else if (bmi < 30) category = "輕度肥胖";
  else if (bmi < 35) category = "中度肥胖";
  else category = "重度肥胖";
  bmiResult.textContent = `你的 BMI 是 ${bmi.toFixed(1)}（${category}）`;
});