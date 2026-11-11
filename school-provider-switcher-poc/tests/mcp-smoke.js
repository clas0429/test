import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const project = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const pluginRoot = path.join(project, "plugin");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "school-provider-switcher-"));
const codexHome = path.join(tempRoot, ".codex");
fs.mkdirSync(codexHome, { recursive: true });
const original = `model = "gpt-6-luna"\n\n[mcp_servers.github]\nurl = "https://example.test/mcp"\nenabled = true\n\n[plugins."existing-plugin"]\nenabled = true\n`;
fs.writeFileSync(path.join(codexHome, "config.toml"), original);

const child = spawn(process.execPath, [path.join(pluginRoot, "server", "index.js")], {
  cwd: pluginRoot,
  env: { ...process.env, CODEX_HOME: codexHome, LITELLM_CODEX_API_KEY: "fixture-secret-never-output" },
  stdio: ["pipe", "pipe", "pipe"],
});
const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
const stderr = [];
child.stderr.on("data", (chunk) => stderr.push(chunk.toString("utf8")));
const queue = [];
const waiters = [];
lines.on("line", (line) => {
  const waiter = waiters.shift();
  if (waiter) waiter(JSON.parse(line));
  else queue.push(JSON.parse(line));
});

function rpc(id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}; ${stderr.join("")}`)), 3000);
    const settle = (value) => { clearTimeout(timer); resolve(value); };
    if (queue.length) settle(queue.shift());
    else waiters.push(settle);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

function callTool(id, name, args = {}) {
  return rpc(id, "tools/call", { name, arguments: args }).then((response) => {
    const result = response.result;
    assert.equal(result.isError, undefined, result.content?.[0]?.text);
    return JSON.parse(result.content[0].text);
  });
}

try {
  const init = await rpc(1, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "smoke", version: "1" } });
  assert.equal(init.result.serverInfo.name, "school-provider-switcher");
  const list = await rpc(2, "tools/list");
  assert.deepEqual(list.result.tools.map((tool) => tool.name), ["provider_status", "set_provider", "logging_status", "set_logging"]);

  const before = await callTool(3, "provider_status");
  assert.equal(before.provider, "openai");
  assert.equal(before.model, "gpt-6-luna");
  assert.equal(before.gatewayKeyAvailableToHelper, true);

  const loggingBefore = await callTool(6, "logging_status");
  assert.equal(loggingBefore.enabled, false);
  assert.equal(loggingBefore.uploadsEnabled, false);
  const loggingOn = await callTool(7, "set_logging", { enabled: true });
  assert.equal(loggingOn.enabled, true);
  assert.equal(loggingOn.uploadsEnabled, false);
  const loggingOff = await callTool(8, "set_logging", { enabled: false });
  assert.equal(loggingOff.enabled, false);

  const school = await callTool(9, "set_provider", { provider: "school_gateway" });
  assert.equal(school.provider, "school_gateway");
  assert.equal(school.model, "release-chat");
  assert.equal(school.newSessionRequired, true);
  assert.ok(fs.existsSync(school.backupPath));
  let config = fs.readFileSync(path.join(codexHome, "config.toml"), "utf8");
  assert.match(config, /^model = "release-chat"/m);
  assert.match(config, /^model_provider = "school_gateway"/m);
  assert.match(config, /^\[model_providers\.school_gateway\]$/m);
  assert.match(config, /^wire_api = "responses"$/m);
  assert.match(config, /^env_key = "LITELLM_CODEX_API_KEY"$/m);
  assert.match(config, /^requires_openai_auth = false$/m);
  assert.ok(config.includes('[mcp_servers.github]\nurl = "https://example.test/mcp"\nenabled = true'));
  assert.ok(config.includes('[plugins."existing-plugin"]\nenabled = true'));
  assert.ok(!config.includes("fixture-secret-never-output"));

  const personal = await callTool(10, "set_provider", { provider: "openai" });
  assert.equal(personal.provider, "openai");
  assert.equal(personal.model, "gpt-6-luna");
  config = fs.readFileSync(path.join(codexHome, "config.toml"), "utf8");
  assert.match(config, /^model = "gpt-6-luna"/m);
  assert.doesNotMatch(config, /^model_provider\s*=/m);
  assert.match(config, /^\[model_providers\.school_gateway\]$/m);
  assert.ok(config.includes('[mcp_servers.github]\nurl = "https://example.test/mcp"\nenabled = true'));
  assert.ok(config.includes('[plugins."existing-plugin"]\nenabled = true'));
  assert.equal(fs.readdirSync(codexHome).filter((name) => name.includes(".bak.provider-switcher.")).length, 2);

  console.log("PASS: MCP discovery, status, school switch, personal restore, timestamped backups, unrelated settings preserved, and secret value absent from config/output.");
} finally {
  child.kill();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
