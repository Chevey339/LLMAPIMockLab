import type { Provider, RequestContext } from "./types.js";

export function detectProvider(path: string): Provider {
  if (path === "/v1/messages") return "anthropic";
  if (path.includes(":generateContent") || path.includes(":streamGenerateContent")) return "gemini";
  if (path.startsWith("/v1/")) return "openai";
  return "unknown";
}

export function defaultJsonResponse(ctx: RequestContext): unknown {
  if (ctx.provider === "anthropic") return anthropicMessage(ctx);
  if (ctx.provider === "gemini") return geminiContent(ctx);
  if (ctx.path === "/v1/responses") return openaiResponse(ctx);
  if (ctx.path === "/v1/models") return openaiModels();
  return openaiChatCompletion(ctx);
}

export function defaultSseEvents(ctx: RequestContext): string[] {
  if (ctx.provider === "anthropic") {
    return [
      "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_mock\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"mock-model\",\"stop_reason\":null,\"usage\":{\"input_tokens\":1,\"output_tokens\":0}}}",
      "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Mock response\"}}",
      "event: message_stop\ndata: {\"type\":\"message_stop\"}"
    ];
  }
  if (ctx.provider === "gemini") {
    return [
      `data: ${JSON.stringify(geminiContent(ctx))}`,
      "data: [DONE]"
    ];
  }
  return openaiChatCompletionStream(ctx);
}

export function wantsStream(ctx: RequestContext): boolean {
  if (ctx.path.includes(":streamGenerateContent")) return true;
  if (ctx.json && typeof ctx.json === "object" && "stream" in ctx.json) {
    return Boolean((ctx.json as Record<string, unknown>).stream);
  }
  return false;
}

function modelFromJson(ctx: RequestContext, fallback = "mock-model"): string {
  if (ctx.json && typeof ctx.json === "object" && typeof (ctx.json as Record<string, unknown>).model === "string") {
    return (ctx.json as Record<string, string>).model;
  }
  const match = ctx.path.match(/\/models\/([^:]+):/);
  return match?.[1] ?? fallback;
}

function openaiChatCompletion(ctx: RequestContext): unknown {
  return {
    id: "chatcmpl_mock",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelFromJson(ctx),
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "Mock response from LLM API Mock Lab." },
        finish_reason: "stop"
      }
    ],
    usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }
  };
}

function openaiResponse(ctx: RequestContext): unknown {
  return {
    id: "resp_mock",
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: modelFromJson(ctx),
    output: [
      {
        id: "msg_mock",
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Mock response from LLM API Mock Lab." }]
      }
    ],
    output_text: "Mock response from LLM API Mock Lab.",
    usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 }
  };
}

function anthropicMessage(ctx: RequestContext): unknown {
  return {
    id: "msg_mock",
    type: "message",
    role: "assistant",
    model: modelFromJson(ctx, "claude-mock"),
    content: [{ type: "text", text: "Mock response from LLM API Mock Lab." }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 12, output_tokens: 8 }
  };
}

function geminiContent(ctx: RequestContext): unknown {
  return {
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ text: "Mock response from LLM API Mock Lab." }]
        },
        finishReason: "STOP",
        index: 0
      }
    ],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8, totalTokenCount: 20 },
    modelVersion: modelFromJson(ctx, "gemini-mock")
  };
}

function openaiModels(): unknown {
  return {
    object: "list",
    data: [
      { id: "mock-gpt", object: "model", created: 0, owned_by: "mocklab" },
      { id: "mock-claude", object: "model", created: 0, owned_by: "mocklab" },
      { id: "mock-gemini", object: "model", created: 0, owned_by: "mocklab" }
    ]
  };
}

function openaiChatCompletionStream(ctx: RequestContext): string[] {
  const id = "chatcmpl_mock";
  const created = Math.floor(Date.now() / 1000);
  const model = modelFromJson(ctx);
  const reasoningTokens = [
    "The",
    " user",
    " just",
    " said",
    " \"",
    promptPreview(ctx),
    "\"",
    " -",
    " this",
    " is",
    " a",
    " mock",
    " reasoning",
    " trace",
    "."
  ];
  const answerTokens = [
    "Hello",
    "!",
    " It",
    " looks",
    " like",
    " your",
    " streaming",
    " mock",
    " is",
    " working",
    "."
  ];
  const usage = {
    prompt_tokens: 12,
    completion_tokens: answerTokens.length,
    total_tokens: 12 + answerTokens.length,
    prompt_tokens_details: { cached_tokens: 0 },
    completion_tokens_details: { reasoning_tokens: reasoningTokens.length },
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 12
  };

  return [
    openaiChunk({ id, created, model, delta: { role: "assistant", content: null, reasoning_content: "" }, finishReason: null }),
    ...reasoningTokens.map((token) => openaiChunk({ id, created, model, delta: { content: null, reasoning_content: token }, finishReason: null })),
    ...answerTokens.map((token) => openaiChunk({ id, created, model, delta: { content: token, reasoning_content: null }, finishReason: null })),
    openaiChunk({ id, created, model, delta: { content: "", reasoning_content: null }, finishReason: "stop", usage }),
    "data: [DONE]"
  ];
}

function openaiChunk(input: {
  id: string;
  created: number;
  model: string;
  delta: Record<string, unknown>;
  finishReason: string | null;
  usage?: unknown;
}): string {
  return `data: ${JSON.stringify({
    id: input.id,
    object: "chat.completion.chunk",
    created: input.created,
    model: input.model,
    system_fingerprint: "fp_mocklab",
    choices: [{ index: 0, delta: input.delta, logprobs: null, finish_reason: input.finishReason }],
    usage: input.usage ?? null
  })}`;
}

function promptPreview(ctx: RequestContext): string {
  const json = ctx.json;
  if (!json || typeof json !== "object") return "message";
  const messages = (json as Record<string, unknown>).messages;
  if (!Array.isArray(messages)) return "message";
  const last = [...messages].reverse().find((message) => message && typeof message === "object" && (message as Record<string, unknown>).role === "user");
  const content = last && typeof last === "object" ? (last as Record<string, unknown>).content : null;
  if (typeof content === "string" && content.trim()) return content.trim().slice(0, 40);
  return "message";
}
