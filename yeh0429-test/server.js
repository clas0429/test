"use strict";

// Teaching CRUD example. No authentication: use fictional data only.
// Node 24 provides node:sqlite; the builder must supply a reviewed immutable
// Node base image and Runtime still overrides the container user/sandbox.
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {DatabaseSync} = require("node:sqlite");

const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, ".local"));
fs.mkdirSync(DATA_DIR, {recursive: true});
const database = new DatabaseSync(path.join(DATA_DIR, "todos.sqlite3"));
database.exec("CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0)");

const CSP = "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

function respond(response, status, body, contentType = "application/json; charset=utf-8") {
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": raw.length,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    "Content-Security-Policy": CSP,
  });
  response.end(raw);
}

function todoRows() {
  return database.prepare("SELECT id,title,done FROM todos ORDER BY id DESC LIMIT 100").all();
}

function todoId(pathname) {
  const match = /^\/api\/todos\/([1-9][0-9]{0,9})$/.exec(pathname);
  return match ? Number(match[1]) : null;
}

function readBody(request) {
  const rawLength = request.headers["content-length"];
  const length = Number(rawLength);
  if (!Number.isInteger(length) || length < 1 || length > 4096) {
    throw Object.assign(new Error("invalid_body_size"), {status: 413});
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 4096) {
        reject(Object.assign(new Error("invalid_body_size"), {status: 413}));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (size !== length) {
        reject(Object.assign(new Error("invalid_body_size"), {status: 413}));
      } else {
        resolve(Buffer.concat(chunks).toString("utf8"));
      }
    });
    request.on("error", reject);
  });
}

async function mutate(request, response, url) {
  if (request.headers["x-teaching-request"] !== "1") {
    respond(response, 403, {error: "same_origin_request_required"});
    return;
  }
  const id = todoId(url.pathname);
  if (request.method === "DELETE" && id !== null) {
    database.prepare("DELETE FROM todos WHERE id=?").run(id);
    respond(response, 200, {deleted: true});
    return;
  }
  if (request.headers["content-type"]?.split(";", 1)[0] !== "application/json") {
    respond(response, 415, {error: "json_required"});
    return;
  }
  const body = JSON.parse(await readBody(request));
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw Object.assign(new Error("invalid_payload"), {status: 422});
  }
  if (request.method === "POST" && url.pathname === "/api/todos") {
    if (Object.keys(body).length !== 1 || typeof body.title !== "string"
        || body.title.trim().length < 1 || body.title.trim().length > 200) {
      throw Object.assign(new Error("invalid_payload"), {status: 422});
    }
    if (database.prepare("SELECT count(*) AS count FROM todos").get().count >= 100) {
      respond(response, 409, {error: "demo_limit_100_items"});
      return;
    }
    const result = database.prepare("INSERT INTO todos(title) VALUES(?)").run(body.title.trim());
    respond(response, 201, {id: Number(result.lastInsertRowid)});
    return;
  }
  if (request.method === "PATCH" && id !== null) {
    if (Object.keys(body).length !== 1 || typeof body.done !== "boolean") {
      throw Object.assign(new Error("invalid_payload"), {status: 422});
    }
    database.prepare("UPDATE todos SET done=? WHERE id=?").run(body.done ? 1 : 0, id);
    respond(response, 200, {updated: true});
    return;
  }
  respond(response, 404, {error: "not_found"});
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://runtime.local");
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/app.js")) {
      const file = path.join(ROOT, url.pathname === "/" ? "index.html" : "app.js");
      respond(response, 200, fs.readFileSync(file), url.pathname === "/" ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8");
      return;
    }
    if (request.method === "GET" && url.pathname === "/healthz") {
      database.prepare("SELECT 1").get();
      respond(response, 200, {status: "ok"});
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/todos") {
      respond(response, 200, {items: todoRows()});
      return;
    }
    if (["POST", "PATCH", "DELETE"].includes(request.method)) {
      await mutate(request, response, url);
      return;
    }
    respond(response, 404, {error: "not_found"});
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : error instanceof SyntaxError ? 422 : 503;
    respond(response, status, {error: status === 422 ? "invalid_payload" : status === 413 ? "invalid_body_size" : "database_unavailable"});
  }
});

server.listen(Number(process.env.PORT || 8080), process.env.HOST || "0.0.0.0");
