# School Provider Switcher Local PoC

Local Codex plugin prototype. It reads and updates only user-level `config.toml`; it does not make model requests. The skill explains that a config edit never changes an active Session. Version 0.2 adds opt-in local conversation capture hooks; Gateway upload is not implemented.

## Layout

- `plugin/plugin.json`: portable Agent Plugins manifest with local-executor requirement.
- `plugin/mcp.json`: local stdio MCP server.
- `plugin/skills/switch-codex-provider/SKILL.md`: natural-language routing instructions.
- `plugin/server/index.js`: backup-first configuration helper.
- `plugin/hooks/hooks.json` and `plugin/hooks/record.js`: opt-in local event capture and SessionEnd transcript snapshot.

## Tools

- `provider_status`: shows configured default provider/model and whether the school key is present in the helper process (never reveals the value).
- `set_provider(provider="school_gateway")`: selects `release-chat` and the `school_gateway` Responses configuration.
- `set_provider(provider="openai")`: restores the model and provider value that existed before the first school switch. Existing ChatGPT authentication and sessions are untouched.
- `logging_status`: reports local capture state and log directory without revealing contents.
- `set_logging(enabled=true|false)`: toggles local capture; capture is off by default. It does not upload logs.

Each change creates a timestamped backup next to `config.toml`. The provider switch only edits the root `model` and `model_provider` values and the `[model_providers.school_gateway]` table. It leaves that table in place when returning to OpenAI. The helper stores a non-secret baseline in `school-provider-switcher-state.json` under `CODEX_HOME`.

## Local validation

Run `node tests/mcp-smoke.js` and `node tests/hook-smoke.js` from this directory. Both use isolated temporary folders and never change the real Codex config or session logs.

The local MCP process must run on the student's computer. It must not be submitted as a hosted plugin; local MCP execution is desktop-only. Installing or refreshing a local marketplace plugin requires restarting the Codex desktop app. Whether a provider config edit is picked up by a new Session without restarting the app remains an empirical check.

## Conversation capture boundaries

Codex must load and trust the plugin hooks. The hooks capture user prompts, supported tool call inputs/results, assistant final text and subagent stop events. At SessionEnd they copy the Codex transcript JSONL only when its path is inside `CODEX_HOME`. Capture writes sensitive data locally under `CODEX_HOME/school-provider-switcher-logs/`; the plugin never enables capture automatically.

This version does not upload records to the Gateway. The model endpoint at `/LLM/v1` is not assumed to accept log-only events, and the plugin will not send duplicate model requests. A dedicated log ingestion route and its schema/authentication are required to implement remote delivery, especially for sessions using the personal ChatGPT provider. Hosted tools may be outside local hook coverage; the transcript format is not a stable interface, so complete capture needs host/version testing.
