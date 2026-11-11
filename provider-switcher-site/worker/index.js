const GATEWAY_BASE_URL = "https://gate.eduvator.net/LLM/v1";
const PROTOCOL_VERSION = "2026-07-28";

const tools = [
  {
    name: "gateway_chat",
    description:
      "Send a chat request through the user's OpenAI-compatible gateway. Use this only when the user chooses the gateway; when they choose ChatGPT, answer normally with the active ChatGPT account. Requires the site owner to configure GATEWAY_API_KEY in the private Site runtime settings.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        model: { type: "string", description: "Model name exposed by the gateway." },
        messages: {
          type: "array",
          minItems: 1,
          maxItems: 40,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              role: { type: "string", enum: ["system", "user", "assistant"] },
              content: { type: "string", maxLength: 24000 },
            },
            required: ["role", "content"],
          },
        },
        temperature: { type: "number", minimum: 0, maximum: 2 },
        max_tokens: { type: "integer", minimum: 1, maximum: 8192 },
      },
      required: ["messages"],
    },
  },
  {
    name: "gateway_models",
    description:
      "List models available from the configured OpenAI-compatible gateway. Use when the user asks which gateway models are available.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function rpcResult(id, result) {
  return json({ jsonrpc: "2.0", id, result });
}

function rpcError(id, code, message) {
  return json({ jsonrpc: "2.0", id, error: { code, message } });
}

function textResult(text, isError = false) {
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

function gatewayHeaders(env) {
  const headers = { "content-type": "application/json" };
  if (env.GATEWAY_API_KEY) headers.authorization = `Bearer ${env.GATEWAY_API_KEY}`;
  return headers;
}

async function handleTool(name, args, env) {
  if (!env.GATEWAY_API_KEY) {
    return textResult(
      "Gateway is not configured yet. Set GATEWAY_API_KEY as a secret in the Provider Switcher Site runtime environment, then deploy the Site again.",
      true,
    );
  }

  if (name === "gateway_models") {
    const response = await fetch(`${GATEWAY_BASE_URL}/models`, {
      headers: gatewayHeaders(env),
    });
    const body = await response.text();
    if (!response.ok) return textResult(`Gateway returned HTTP ${response.status}: ${body.slice(0, 2000)}`, true);
    return textResult(body);
  }

  if (name !== "gateway_chat") return textResult(`Unknown tool: ${name}`, true);
  if (!Array.isArray(args.messages) || args.messages.length === 0) {
    return textResult("messages must contain at least one chat message.", true);
  }

  const payload = {
    model: args.model || "default",
    messages: args.messages,
  };
  if (typeof args.temperature === "number") payload.temperature = args.temperature;
  if (Number.isInteger(args.max_tokens)) payload.max_tokens = args.max_tokens;

  const response = await fetch(`${GATEWAY_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: gatewayHeaders(env),
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (!response.ok) return textResult(`Gateway returned HTTP ${response.status}: ${body.slice(0, 4000)}`, true);

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return textResult("Gateway returned a response that was not valid JSON.", true);
  }
  const answer = data?.choices?.[0]?.message?.content;
  if (typeof answer !== "string") {
    return textResult(`Gateway response did not contain choices[0].message.content: ${body.slice(0, 4000)}`, true);
  }
  return textResult(answer);
}

async function handleRpc(request, env) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!request.headers.get("oai-authenticated-user-id")) {
    return new Response("ChatGPT sign-in is required", { status: 401 });
  }

  let message;
  try {
    message = await request.json();
  } catch {
    return rpcError(null, -32700, "Invalid JSON");
  }

  const { id, method, params = {} } = message;
  if (method === "server/discover") {
    return rpcResult(id, { supportedVersions: [PROTOCOL_VERSION], capabilities: { tools: {} } });
  }
  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "provider-switcher", version: "1.0.0" },
    });
  }
  if (method === "notifications/initialized") return new Response(null, { status: 202 });
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools });
  if (method === "tools/call") {
    try {
      return rpcResult(id, await handleTool(params.name, params.arguments || {}, env));
    } catch (error) {
      return rpcResult(id, textResult(`Gateway request failed: ${String(error?.message || error)}`, true));
    }
  }
  return rpcError(id ?? null, -32601, `Method not found: ${method}`);
}

const page = `<!doctype html>
<html lang="zh-Hant">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Provider Switcher</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101522; color: #f5f7ff; }
    main { max-width: 42rem; padding: 2.5rem; border: 1px solid #30394c; border-radius: 1.25rem; background: #171f2e; }
    h1 { margin-top: 0; font-size: clamp(2rem, 7vw, 3.5rem); letter-spacing: -.04em; }
    p { color: #c1cbda; line-height: 1.7; }
    code { color: #a8d5ff; }
  </style></head>
  <body><main><h1>Provider Switcher</h1>
    <p>此私人外掛使用 ChatGPT 登入驗證。選擇 ChatGPT 時，直接在目前對話中使用你的 ChatGPT 帳號；選擇 gateway 時，請在對話中要求「使用 gateway」，由 <code>gateway_chat</code> 工具送出請求。</p>
    <p>管理者需在 Site 執行環境設定 <code>GATEWAY_API_KEY</code> 密鑰。此服務不會使用或讀取 ChatGPT 訂閱額度作為 API 金鑰。</p>
  </main></body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") return handleRpc(request, env);
    if (url.pathname === "/") {
      return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return new Response("Not found", { status: 404 });
  },
};
