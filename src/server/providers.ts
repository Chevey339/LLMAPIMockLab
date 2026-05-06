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
  return [
    `data: ${JSON.stringify({ id: "chatcmpl_mock", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] })}`,
    `data: ${JSON.stringify({ id: "chatcmpl_mock", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "Mock response" }, finish_reason: null }] })}`,
    `data: ${JSON.stringify({ id: "chatcmpl_mock", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}`,
    "data: [DONE]"
  ];
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
