"use strict";
const message = document.querySelector("#message");
async function api(path, method = "GET", body) {
  const response = await fetch(path, {method, headers: {"Content-Type": "application/json", "X-Teaching-Request": "1"},
    body: body === undefined ? undefined : JSON.stringify(body)});
  if (!response.ok) throw new Error(`操作失敗（HTTP ${response.status}）`);
  return response.json();
}
async function load() {
  const data = await api("/api/todos");
  const list = document.querySelector("#items");
  list.replaceChildren();
  for (const item of data.items) {
    const li = document.createElement("li");
    const label = document.createElement("label");
    const check = document.createElement("input");
    check.type = "checkbox"; check.checked = Boolean(item.done);
    check.addEventListener("change", () => task(async () => {
      await api(`/api/todos/${item.id}`, "PATCH", {done: check.checked}); await load();
    }));
    label.append(check, document.createTextNode(item.title));
    const remove = document.createElement("button");
    remove.type = "button"; remove.textContent = "刪除";
    remove.setAttribute("aria-label", `刪除：${item.title}`);
    remove.addEventListener("click", () => task(async () => { await api(`/api/todos/${item.id}`, "DELETE"); await load(); }));
    li.append(label, " ", remove); list.append(li);
  }
}
async function task(action) {
  try { await action(); message.textContent = "操作完成"; }
  catch (error) { message.textContent = error.message; }
}
document.querySelector("#todo-form").addEventListener("submit", (event) => {
  event.preventDefault();
  task(async () => { const input = document.querySelector("#title"); await api("/api/todos", "POST", {title: input.value}); input.value = ""; await load(); });
});
task(load);
