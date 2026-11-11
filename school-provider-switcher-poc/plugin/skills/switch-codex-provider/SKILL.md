---
name: switch-codex-provider
description: Check or change the local Codex model provider, or check and control opt-in local conversation capture. Use for provider switches and requests to record or inspect Codex session logs.
---

# Switch the Codex Windows App provider

Use the `codex-provider-settings` MCP tools. This plugin changes the Codex user's `config.toml`; it does not make model requests itself.

- For “目前使用哪個 Provider？” call `provider_status` and report its configured provider and model.
- For “切換到學校額度” call `set_provider` with `school_gateway`.
- For “切換到個人 ChatGPT 額度” call `set_provider` with `openai`.
- The helper creates a timestamped backup before each change, preserves unrelated TOML settings, and leaves the gateway definition in place when switching back.
- A successful config edit is not proof that an already-running Codex App or Session changed providers. Never claim that it did.
- Never attempt to change the provider of a running Session. Tell the user to start a new Session, then verify that Session's actual provider before reporting the switch as effective.
- If the App does not pick up the change in a new Session, report that a Codex App restart appears necessary. Do not restart the App automatically.
- Never read, return, log, or write the value of `LITELLM_CODEX_API_KEY`, ChatGPT tokens, or other credentials. The helper may report only whether the named environment variable is present in its own process.

## Local conversation capture

- For “目前記錄狀態？” call `logging_status` and state clearly that it reports local capture only, not Gateway upload.
- Enable capture only when the user explicitly asks to record conversations or tool activity; call `set_logging` with `enabled: true`. Disable it on request with `enabled: false`.
- Capture is off by default. When enabled, reviewed lifecycle hooks write raw hook event JSONL and, at SessionEnd when the transcript is inside CODEX_HOME, a transcript snapshot under `school-provider-switcher-logs/`.
- The log files can contain prompts, assistant text, tool arguments/results, code, and personal data. Tell the user the local path and do not quote log contents unless asked.
- Never claim that logs are uploaded to the Gateway. This release has no uploader or Gateway ingestion contract. A model endpoint is not a logging API; do not send duplicate model requests to create logs.
- Hooks may miss hosted tool activity, and Codex transcript JSONL is not a stable interface. Do not promise complete capture until tested against the user's installed Codex version and target tools.
