import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const CODEX_HOME = path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
const CONFIG_PATH = path.join(CODEX_HOME, "config.toml");
const STATE_PATH = path.join(CODEX_HOME, "school-provider-switcher-state.json");
const LOGGING_STATE_PATH = path.join(CODEX_HOME, "school-provider-switcher-logging.json");
const LOG_DIRECTORY = path.join(CODEX_HOME, "school-provider-switcher-logs");
const SCHOOL_PROVIDER = "school_gateway";
const SCHOOL_MODEL = "release-chat";
const SCHOOL_BLOCK = {
  name: '"葉大佛"',
  base_url: '"https://gate.eduvator.net/LLM/v1"',
  wire_api: '"responses"',
  env_key: '"LITELLM_CODEX_API_KEY"',
  requires_openai_auth: "false",
};

const toolList = [
  {
    name: "provider_status",
    description: "Read the active default model/provider from this Windows user's Codex config.toml. Also report only whether LITELLM_CODEX_API_KEY exists in this helper process; never return its value.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "set_provider",
    description: "Back up and change only the Codex user's default model/provider settings. This never changes a running Session and never calls a model API. After success, a new Session is required; verify its actual provider separately.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { provider: { type: "string", enum: ["school_gateway", "openai"] } },
      required: ["provider"],
    },
  },
  {
    name: "logging_status",
    description: "Report whether local Codex conversation capture is enabled and where its private local log files are stored. Never returns log contents or credentials. Capture is local only; it does not upload data to the gateway.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "set_logging",
    description: "Enable or disable local Codex conversation and tool-activity capture by the plugin's reviewed hooks. Enabling writes full hook event inputs and outputs to files under CODEX_HOME. It does not upload logs to any server.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { enabled: { type: "boolean" } },
      required: ["enabled"],
    },
  },
];

function parseScalar(raw) {
  const value = raw.trim();
  if (value.startsWith('"')) {
    try { return JSON.parse(value); } catch { return value; }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

function rootSectionEnd(text) {
  const match = /^(?:\s*\[[^\]]+\]|\s*\[\[[^\]]+\]\])\s*(?:#.*)?$/m.exec(text);
  return match ? match.index : text.length;
}

function getRootValue(text, key) {
  const root = text.slice(0, rootSectionEnd(text));
  const re = new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*(.*?)[ \\t]*(?:#.*)?$`, "m");
  const match = re.exec(root);
  return match ? { value: parseScalar(match[1]), rawLine: match[0].trim() } : null;
}

function setRootValue(text, key, rawValue) {
  const end = rootSectionEnd(text);
  const root = text.slice(0, end);
  const rest = text.slice(end);
  const re = new RegExp(`^[ \\t]*${key}[ \\t]*=[^\\r\\n]*(?:\\r?\\n|$)`, "m");
  if (re.test(root)) {
    return root.replace(re, rawValue === null ? "" : `${key} = ${rawValue}\n`) + rest;
  }
  if (rawValue === null) return text;
  const prefix = root.length && !root.endsWith("\n") ? `${root}\n` : root;
  return `${prefix}${key} = ${rawValue}\n${rest}`;
}

function updateProviderTable(text) {
  const header = `[model_providers.${SCHOOL_PROVIDER}]`;
  const headerRe = new RegExp(`^\\[model_providers\\.${SCHOOL_PROVIDER}\\]\\s*$`, "m");
  const found = headerRe.exec(text);
  if (!found) {
    const suffix = text.endsWith("\n") ? "" : "\n";
    return `${text}${suffix}\n${header}\n${Object.entries(SCHOOL_BLOCK).map(([k, v]) => `${k} = ${v}`).join("\n")}\n`;
  }
  const start = found.index + found[0].length;
  const nextTable = /^(?:\[[^\]]+\]|\[\[[^\]]+\]\])\s*$/m.exec(text.slice(start));
  const end = nextTable ? start + nextTable.index : text.length;
  let block = text.slice(start, end);
  for (const [key, value] of Object.entries(SCHOOL_BLOCK)) {
    const keyRe = new RegExp(`^[ \\t]*${key}[ \\t]*=[^\\r\\n]*(?:\\r?\\n|$)`, "m");
    if (keyRe.test(block)) block = block.replace(keyRe, `${key} = ${value}\n`);
    else block += `${block.length && !block.endsWith("\n") ? "\n" : ""}${key} = ${value}\n`;
  }
  return text.slice(0, start) + block + text.slice(end);
}

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) throw new Error(`Codex config.toml was not found at ${CONFIG_PATH}`);
  const info = fs.lstatSync(CONFIG_PATH);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error("Refusing to edit config.toml because it is not a regular file.");
  return fs.readFileSync(CONFIG_PATH, "utf8");
}

function backupConfig() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${CONFIG_PATH}.bak.provider-switcher.${stamp}`;
  fs.copyFileSync(CONFIG_PATH, backupPath, fs.constants.COPYFILE_EXCL);
  return backupPath;
}

function atomicWrite(filePath, contents) {
  const tempPath = `${filePath}.provider-switcher-${process.pid}.tmp`;
  try {
    fs.writeFileSync(tempPath, contents, { encoding: "utf8", flag: "wx" });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try { fs.rmSync(tempPath, { force: true }); } catch {}
    throw error;
  }
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw new Error("Provider switch state is unreadable; refusing to guess the original model."); }
}

function writeState(state) {
  const tempPath = `${STATE_PATH}.provider-switcher-${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2) + "\n", { encoding: "utf8" });
  fs.renameSync(tempPath, STATE_PATH);
}

function readLoggingState() {
  try {
    const state = JSON.parse(fs.readFileSync(LOGGING_STATE_PATH, "utf8"));
    return { enabled: state.enabled === true };
  } catch (error) {
    if (error.code === "ENOENT") return { enabled: false };
    throw new Error("Conversation logging state is unreadable; refusing to guess whether capture is enabled.");
  }
}

function loggingStatus() {
  const state = readLoggingState();
  let sessionFiles = 0;
  try {
    sessionFiles = fs.readdirSync(LOG_DIRECTORY).filter((name) => name.endsWith(".events.jsonl") || name.endsWith(".transcript.jsonl")).length;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return {
    enabled: state.enabled,
    localLogDirectory: LOG_DIRECTORY,
    sessionFileCount: sessionFiles,
    uploadsEnabled: false,
    note: "Full content is stored locally only. Upload to the gateway is not implemented or enabled.",
  };
}

function setLogging(enabled) {
  if (typeof enabled !== "boolean") throw new Error("enabled must be a boolean.");
  fs.mkdirSync(CODEX_HOME, { recursive: true });
  fs.mkdirSync(LOG_DIRECTORY, { recursive: true });
  const tempPath = `${LOGGING_STATE_PATH}.provider-switcher-${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify({ enabled, updatedAt: new Date().toISOString() }, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  fs.renameSync(tempPath, LOGGING_STATE_PATH);
  return loggingStatus();
}

function statusFor(text) {
  const model = getRootValue(text, "model")?.value ?? null;
  const configured = getRootValue(text, "model_provider")?.value ?? "openai";
  return {
    model,
    provider: configured,
    providerName: configured === SCHOOL_PROVIDER ? "葉大佛" : configured === "openai" ? "OpenAI / ChatGPT account" : configured,
    gatewayKeyAvailableToHelper: Boolean(process.env.LITELLM_CODEX_API_KEY),
    configPath: CONFIG_PATH,
    note: "This reports user-level configuration, not the provider already loaded by an existing Session.",
  };
}

function switchProvider(provider) {
  const original = readConfig();
  const current = statusFor(original);
  if (provider === current.provider) {
    return { changed: false, ...current, note: "Configuration already selects this provider. Existing Sessions are not changed." };
  }

  let next = original;
  let state = readState();
  if (provider === SCHOOL_PROVIDER) {
    if (!state || !state.active) {
      state = {
        active: true,
        originalModel: getRootValue(original, "model")?.rawLine ?? null,
        originalModelProvider: getRootValue(original, "model_provider")?.rawLine ?? null,
      };
    } else {
      state.active = true;
    }
    next = setRootValue(next, "model", JSON.stringify(SCHOOL_MODEL));
    next = setRootValue(next, "model_provider", JSON.stringify(SCHOOL_PROVIDER));
    next = updateProviderTable(next);
  } else if (provider === "openai") {
    if (state?.active) {
      const modelValue = state.originalModel?.replace(/^model\s*=\s*/, "") ?? null;
      const providerValue = state.originalModelProvider?.replace(/^model_provider\s*=\s*/, "") ?? null;
      next = setRootValue(next, "model", modelValue);
      next = setRootValue(next, "model_provider", providerValue);
      state.active = false;
    } else {
      if (current.provider === SCHOOL_PROVIDER) {
        throw new Error("Cannot safely restore personal mode because the original model was not recorded. Restore from the timestamped backup or switch to school mode once to capture a baseline first.");
      }
      next = setRootValue(next, "model_provider", null);
    }
  } else {
    throw new Error("Supported providers are school_gateway and openai.");
  }

  const backupPath = backupConfig();
  try {
    atomicWrite(CONFIG_PATH, next);
    writeState(state || { active: false });
  } catch (error) {
    atomicWrite(CONFIG_PATH, original);
    throw error;
  }

  return {
    changed: true,
    backupPath,
    ...statusFor(next),
    newSessionRequired: true,
    note: "Only the default provider/model and school provider table were changed. No running Session was modified; start a new Session and verify its actual provider.",
  };
}

function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function fail(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
}

async function handle(message) {
  const { id, method, params = {} } = message;
  if (method === "notifications/initialized" || method === "notifications/cancelled") return;
  if (method === "initialize") {
    reply(id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "school-provider-switcher", version: "0.1.0" },
    });
    return;
  }
  if (method === "ping") return reply(id, {});
  if (method === "tools/list") return reply(id, { tools: toolList });
  if (method !== "tools/call") return fail(id ?? null, -32601, `Method not found: ${method}`);

  try {
    let result;
    if (params.name === "provider_status") result = statusFor(readConfig());
    else if (params.name === "set_provider") result = switchProvider(params.arguments?.provider);
    else if (params.name === "logging_status") result = loggingStatus();
    else if (params.name === "set_logging") result = setLogging(params.arguments?.enabled);
    else throw new Error(`Unknown tool: ${params.name}`);
    reply(id, { content: [{ type: "text", text: JSON.stringify(result) }] });
  } catch (error) {
    reply(id, { content: [{ type: "text", text: error.message }], isError: true });
  }
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (!line.trim()) return;
  try { void handle(JSON.parse(line)); }
  catch { fail(null, -32700, "Invalid JSON"); }
});
