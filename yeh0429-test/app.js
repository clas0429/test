"use strict";

const STORAGE_KEY = "my-little-day.todos.v1";
const form = document.querySelector("#todo-form");
const input = document.querySelector("#title");
const list = document.querySelector("#items");
const message = document.querySelector("#message");
const emptyState = document.querySelector("#empty-state");
const count = document.querySelector("#task-count");
const clearDoneButton = document.querySelector("#clear-done");
const dateLabel = document.querySelector("#today-label");

function readTodos() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value)
      ? value.filter((item) => item && Number.isSafeInteger(item.id)
        && typeof item.title === "string" && typeof item.done === "boolean")
      : [];
  } catch {
    message.textContent = "無法讀取本機清單；請確認瀏覽器允許此網站使用儲存空間。";
    return [];
  }
}

let todos = readTodos();
dateLabel.textContent = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric", month: "long", day: "numeric", weekday: "long",
}).format(new Date());

function saveTodos() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    message.textContent = "已儲存到這個瀏覽器";
    return true;
  } catch {
    message.textContent = "瀏覽器儲存空間無法使用，變更可能不會保留。";
    return false;
  }
}

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
      saveTodos();
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
      saveTodos();
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
  todos.unshift({id: Date.now() + Math.floor(Math.random() * 1000), title, done: false});
  saveTodos();
  render();
  input.value = "";
  input.focus();
});

clearDoneButton.addEventListener("click", () => {
  todos = todos.filter((todo) => !todo.done);
  saveTodos();
  render();
});

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY || event.key === null) {
    todos = readTodos();
    render();
  }
});

render();

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