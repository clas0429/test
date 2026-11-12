import {initializeApp} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {getAuth, GoogleAuthProvider, OAuthProvider, onAuthStateChanged, signInWithPopup, linkWithPopup, signOut} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {getFirestore, collection, doc, onSnapshot, writeBatch, getDocs} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const FIREBASE_CONFIG = await (async () => {
  try {
    return __FIREBASE_CONFIG__;
  } catch {
    try {
      const response = await fetch("./firebase-config.json", {cache: "no-store"});
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
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
let loadTimeout = null;
let editingTodoId = null;
let editingDraft = "";

if (firebaseConfigured) {
  const app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  database = getFirestore(app);
}

const STORAGE_KEY = "my-little-day.todos.v1";
const signInPanel = document.querySelector("#sign-in");
const signInButtons = [...document.querySelectorAll("[data-auth-provider]")];
const signOutButton = document.querySelector("#sign-out");
const accountInfo = document.querySelector("#account-info");
const accountName = document.querySelector("#account-name");
const linkGoogleButton = document.querySelector("#link-google");
const linkLineButton = document.querySelector("#link-line");
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
    "auth/popup-closed-by-user": "已關閉登入視窗。",
    "auth/popup-blocked": "瀏覽器封鎖了登入視窗，請允許彈出視窗後重試。",
    "auth/unauthorized-domain": "這個網站網域尚未加入 Firebase 授權網域。",
    "auth/operation-not-allowed": "此登入方式尚未在 Firebase Authentication 啟用。",
    "auth/invalid-oauth-provider": "LINE 登入尚未完成 Firebase OIDC 設定。",
    "auth/account-exists-with-different-credential": "此電子郵件已使用另一種登入方式；請先登入原帳號，再連結另一種登入方式。",
    "auth/credential-already-in-use": "這個登入方式已連結至另一個清單帳號，請使用該登入方式登入。",
    "permission-denied": "Firebase 權限不足，請檢查 Firestore 安全性規則。",
    "unavailable": "暫時無法連上 Firestore，請檢查網路後重試。",
    "failed-precondition": "Firestore 尚未準備好，請檢查資料庫設定。",
  };
  message.textContent = messages[error.code]
    || `Firebase 連線失敗${error.code ? `（${error.code}）` : ""}，請確認設定與網路後再試。`;
}

function createAuthProvider(providerName) {
  if (providerName === "line") {
    const provider = new OAuthProvider("oidc.line");
    provider.addScope("profile");
    return provider;
  }
  return new GoogleAuthProvider();
}

function updateLinkedProviderButtons(user) {
  const providerIds = new Set((user?.providerData || []).map((provider) => provider.providerId));
  linkGoogleButton.hidden = !user || providerIds.has("google.com");
  linkLineButton.hidden = !user || providerIds.has("oidc.line");
}

function clearLoadTimeout() {
  if (loadTimeout !== null) clearTimeout(loadTimeout);
  loadTimeout = null;
}

function connectUser(user) {
  clearLoadTimeout();
  stopListening?.();
  stopListening = null;
  currentUser = user;
  todos = [];
  remoteTodosReady = false;
  saveQueue = Promise.resolve();
  input.disabled = Boolean(user);
  form.querySelector("button[type=submit]").disabled = Boolean(user);
  signInPanel.hidden = Boolean(user);
  accountInfo.hidden = !user;
  accountName.textContent = user ? (user.displayName || user.email || "已登入使用者") : "";
  updateLinkedProviderButtons(user);
  if (!user) {
    todos = readLocalTodos();
    localTodos = todos.map((todo) => ({...todo}));
    render();
    return;
  }

  localTodos = readLocalTodos();
  message.textContent = "正在載入雲端清單……";
  loadTimeout = setTimeout(() => {
    if (currentUser?.uid === user.uid && !remoteTodosReady) {
      message.textContent = "雲端清單載入逾時，請檢查網路與 Firestore 設定後重新整理。";
    }
  }, 15000);
  stopListening = onSnapshot(collection(database, "users", user.uid, "todos"),
    {includeMetadataChanges: true}, (snapshot) => {
      if (currentUser?.uid !== user.uid) return;
      try {
        const fromServer = !snapshot.metadata.fromCache;
        const firstServerSnapshot = fromServer && !remoteTodosReady;
        const remoteTodos = snapshot.docs.map((entry) => ({id: entry.id, ...entry.data()}))
          .filter((todo) => typeof todo.title === "string" && typeof todo.done === "boolean");
        if (firstServerSnapshot) {
          remoteTodosReady = true;
          clearLoadTimeout();
          input.disabled = false;
          form.querySelector("button[type=submit]").disabled = false;
          if (snapshot.empty && localTodos.length) {
            todos = localTodos.map((todo) => ({...todo}));
            render();
            message.textContent = "正在將本機清單匯入雲端……";
            void persistTodos().then((saved) => {
              if (saved && currentUser?.uid === user.uid) {
                localTodos = [];
                saveLocalTodos();
              }
            });
            return;
          }
          if (!snapshot.empty) {
            localTodos = [];
            saveLocalTodos();
          }
        }
        todos = remoteTodos;
        render();
        message.textContent = fromServer && !snapshot.metadata.hasPendingWrites
          ? "清單已與 Firebase 同步"
          : remoteTodosReady ? "正在同步雲端清單……" : "已顯示快取清單，正在連接雲端……";
      } catch (error) {
        clearLoadTimeout();
        reportFirebaseError(error);
      }
    }, (error) => {
      clearLoadTimeout();
      reportFirebaseError(error);
    });
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
    if (currentUser?.uid !== user.uid || !remoteTodosReady) return false;
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
    return true;
  });
  saveQueue = write.catch((error) => {
    reportFirebaseError(error);
    return false;
  });
  return await saveQueue;
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
    if (editingTodoId === todo.id) {
      const editForm = document.createElement("form");
      editForm.className = "edit-form";
      const editInput = document.createElement("input");
      editInput.className = "todo-edit-input";
      editInput.type = "text";
      editInput.maxLength = 200;
      editInput.required = true;
      editInput.value = editingDraft;
      editInput.setAttribute("aria-label", `編輯待辦事項：${todo.title}`);
      editInput.addEventListener("input", () => {
        editingDraft = editInput.value;
      });
      editInput.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          editingTodoId = null;
          editingDraft = "";
          render();
        }
      });
      const save = document.createElement("button");
      save.className = "save-button";
      save.type = "submit";
      save.textContent = "儲存";
      const cancel = document.createElement("button");
      cancel.className = "cancel-button";
      cancel.type = "button";
      cancel.textContent = "取消";
      cancel.addEventListener("click", () => {
        editingTodoId = null;
        editingDraft = "";
        render();
      });
      editForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const title = editInput.value.trim();
        if (!title) {
          message.textContent = "待辦事項不能留白。";
          editInput.focus();
          return;
        }
        const currentTodo = todos.find((entry) => entry.id === todo.id);
        if (currentTodo) currentTodo.title = title;
        editingTodoId = null;
        editingDraft = "";
        void persistTodos();
        render();
      });
      editForm.append(editInput, save, cancel);
      item.append(checkbox, editForm);
    } else {
      const title = document.createElement("span");
      title.className = "todo-title";
      title.textContent = todo.title;
      const actions = document.createElement("div");
      actions.className = "todo-actions";
      const edit = document.createElement("button");
      edit.className = "edit-button";
      edit.type = "button";
      edit.textContent = "編輯";
      edit.setAttribute("aria-label", `編輯：${todo.title}`);
      edit.addEventListener("click", () => {
        editingTodoId = todo.id;
        editingDraft = todo.title;
        render();
        const editInput = list.querySelector(".todo-edit-input");
        editInput?.focus();
        editInput?.select();
      });
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
      actions.append(edit, remove);
      item.append(checkbox, title, actions);
    }
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

signInButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (!auth) {
      message.textContent = "Firebase 尚未設定；請依 README 完成 Firebase 設定後重新部署。";
      return;
    }
    signInButtons.forEach((entry) => { entry.disabled = true; });
    try {
      await signInWithPopup(auth, createAuthProvider(button.dataset.authProvider));
    } catch (error) {
      reportFirebaseError(error);
    } finally {
      signInButtons.forEach((entry) => { entry.disabled = false; });
    }
  });
});

async function linkAccountProvider(providerName, button) {
  if (!auth?.currentUser) return;
  button.disabled = true;
  try {
    const result = await linkWithPopup(auth.currentUser, createAuthProvider(providerName));
    updateLinkedProviderButtons(result.user);
    message.textContent = `${providerName === "line" ? "LINE" : "Google"} 已連結至目前帳號。`;
  } catch (error) {
    reportFirebaseError(error);
  } finally {
    button.disabled = false;
  }
}

linkGoogleButton.addEventListener("click", () => {
  void linkAccountProvider("google", linkGoogleButton);
});

linkLineButton.addEventListener("click", () => {
  void linkAccountProvider("line", linkLineButton);
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
