"use strict";

// Teaching CRUD example. No authentication: use fictional data only.
// MariaDB connector is supplied by the reviewed teaching runtime base.
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const mariadb = require("mariadb");

const ROOT = __dirname;
const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 2,
  connectTimeout: 3000,
  acquireTimeout: 5000,
  bigIntAsNumber: true,
  insertIdAsNumber: true,
});
const ready = pool.query("CREATE TABLE IF NOT EXISTS todos (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, title VARCHAR(200) NOT NULL, done TINYINT NOT NULL DEFAULT 0)");
// Report initialization failures through /healthz without logging credentials.
ready.catch(() => {});

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

async function todoRows() {
  return pool.query("SELECT id,title,done FROM todos ORDER BY id DESC LIMIT 100");
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
    await pool.query("DELETE FROM todos WHERE id=?", [id]);
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
    if (Number((await pool.query("SELECT count(*) AS count FROM todos"))[0].count) >= 100) {
      respond(response, 409, {error: "demo_limit_100_items"});
      return;
    }
    const result = await pool.query("INSERT INTO todos(title) VALUES(?)", [body.title.trim()]);
    respond(response, 201, {id: Number(result.insertId)});
    return;
  }
  if (request.method === "PATCH" && id !== null) {
    if (Object.keys(body).length !== 1 || typeof body.done !== "boolean") {
      throw Object.assign(new Error("invalid_payload"), {status: 422});
    }
    await pool.query("UPDATE todos SET done=? WHERE id=?", [body.done ? 1 : 0, id]);
    respond(response, 200, {updated: true});
    return;
  }
  respond(response, 404, {error: "not_found"});
}

const server = http.createServer(async (request, response) => {
  try {
    await ready;
    const url = new URL(request.url || "/", "http://runtime.local");
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/app.js")) {
      const file = path.join(ROOT, url.pathname === "/" ? "index.html" : "app.js");
      respond(response, 200, fs.readFileSync(file), url.pathname === "/" ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8");
      return;
    }
    if (request.method === "GET" && url.pathname === "/healthz") {
      await pool.query("SELECT 1");
      respond(response, 200, {status: "ok"});
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/todos") {
      respond(response, 200, {items: await todoRows()});
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
