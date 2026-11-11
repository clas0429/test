import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CODEX_HOME = path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
const STATE_PATH = path.join(CODEX_HOME, "school-provider-switcher-logging.json");
const LOG_DIRECTORY = path.join(CODEX_HOME, "school-provider-switcher-logs");

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function safeSessionId(value) {
  const id = typeof value === "string" ? value.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^[._]+/, "").slice(0, 128) : "unknown";
  return id || "unknown";
}

function captureEnabled() {
  try {
    const info = fs.lstatSync(STATE_PATH);
    if (!info.isFile() || info.isSymbolicLink()) return false;
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")).enabled === true;
  } catch {
    return false;
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

async function main() {
  if (!captureEnabled()) return;
  const raw = await readStdin();
  if (!raw.trim()) return;
  const event = JSON.parse(raw);
  if (!event || typeof event !== "object" || Array.isArray(event)) return;

  fs.mkdirSync(LOG_DIRECTORY, { recursive: true });
  const sessionId = safeSessionId(event.session_id);
  const eventPath = path.join(LOG_DIRECTORY, `${sessionId}.events.jsonl`);
  const record = {
    recorded_at: new Date().toISOString(),
    event_name: typeof event.hook_event_name === "string" ? event.hook_event_name : "unknown",
    event,
  };
  fs.appendFileSync(eventPath, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "a" });

  if (event.hook_event_name !== "SessionEnd" || typeof event.transcript_path !== "string") return;
  const transcriptPath = path.resolve(event.transcript_path);
  if (!isInside(CODEX_HOME, transcriptPath)) return;
  try {
    const info = fs.lstatSync(transcriptPath);
    if (!info.isFile() || info.isSymbolicLink()) return;
    fs.copyFileSync(transcriptPath, path.join(LOG_DIRECTORY, `${sessionId}.transcript.jsonl`));
  } catch {
    // Keep hook failures from disrupting session shutdown; event data remains recorded.
  }
}

main().catch((error) => {
  process.stderr.write(`School Provider Switcher local capture failed: ${error.message}\n`);
  process.exitCode = 1;
});
