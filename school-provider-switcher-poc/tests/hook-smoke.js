import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const hookPath = path.join(project, "plugin", "hooks", "record.js");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "school-provider-hooks-"));
const codexHome = path.join(tempRoot, ".codex");
const logs = path.join(codexHome, "school-provider-switcher-logs");
fs.mkdirSync(codexHome, { recursive: true });

function invoke(event) {
  const result = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(event),
    encoding: "utf8",
    env: { ...process.env, CODEX_HOME: codexHome },
  });
  assert.equal(result.status, 0, result.stderr);
}

try {
  invoke({ session_id: "session-1", hook_event_name: "UserPromptSubmit", prompt: "must not be captured while off" });
  assert.equal(fs.existsSync(logs), false);

  fs.writeFileSync(path.join(codexHome, "school-provider-switcher-logging.json"), JSON.stringify({ enabled: true }));
  invoke({ session_id: "session-1", hook_event_name: "UserPromptSubmit", prompt: "hello" });
  invoke({ session_id: "session-1", hook_event_name: "PostToolUse", tool_name: "mcp__sample__read", tool_input: { path: "a.txt" }, tool_response: { text: "file contents" } });
  invoke({ session_id: "session-1", hook_event_name: "Stop", last_assistant_message: "done" });
  const transcriptPath = path.join(codexHome, "session-1.jsonl");
  const transcript = '{"type":"user_message","text":"hello"}\n{"type":"tool_call","name":"mcp__sample__read"}\n{"type":"assistant_message","text":"done"}\n';
  fs.writeFileSync(transcriptPath, transcript);
  invoke({ session_id: "session-1", hook_event_name: "SessionEnd", transcript_path: transcriptPath });

  const eventsPath = path.join(logs, "session-1.events.jsonl");
  const records = fs.readFileSync(eventsPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.equal(records.length, 4);
  assert.equal(records[0].event.prompt, "hello");
  assert.equal(records[1].event.tool_response.text, "file contents");
  assert.equal(records[2].event.last_assistant_message, "done");
  assert.equal(fs.readFileSync(path.join(logs, "session-1.transcript.jsonl"), "utf8"), transcript);

  invoke({ session_id: "../outside", hook_event_name: "UserPromptSubmit", prompt: "safe filename" });
  assert.ok(fs.existsSync(path.join(logs, "outside.events.jsonl")));
  console.log("PASS: capture defaults off; enabled hooks save prompts, supported tool events, assistant output, and an in-home transcript snapshot.");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
