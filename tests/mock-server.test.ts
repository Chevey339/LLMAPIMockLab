import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../src/server/app.js";
import { createTestDatabase } from "../src/server/db.js";

let app: FastifyInstance;
let cleanup: () => void;

beforeEach(async () => {
  const testDb = createTestDatabase();
  cleanup = testDb.cleanup;
  app = await createApp({ db: testDb.db, seedDefaults: true });
});

afterEach(async () => {
  await app.close();
  cleanup();
});

describe("request capture", () => {
  it("stores raw headers and raw body for provider requests", async () => {
    const body = JSON.stringify({
      model: "gpt-test",
      messages: [{ role: "user", content: "capture this" }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret-token",
        "x-api-key": "visible-key"
      },
      payload: body
    });

    expect(response.statusCode).toBe(200);

    const logs = await app.inject({ method: "GET", url: "/_mock/api/requests" });
    const parsed = logs.json();
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].rawBody).toBe(body);
    expect(parsed.items[0].headers.authorization).toBe("Bearer secret-token");
    expect(parsed.items[0].headers["x-api-key"]).toBe("visible-key");
    expect(parsed.items[0].provider).toBe("openai");
  });
});

describe("rules engine", () => {
  it("marks admin API responses as no-store", async () => {
    const response = await app.inject({ method: "GET", url: "/_mock/api/rules" });

    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("uses the highest-priority enabled matching rule", async () => {
    await app.inject({
      method: "POST",
      url: "/_mock/api/rules",
      payload: {
        name: "priority reply",
        provider: "openai",
        method: "POST",
        pathPattern: "/v1/chat/completions",
        priority: 90,
        enabled: true,
        matchers: [{ source: "json", key: "model", op: "equals", value: "gpt-priority" }],
        responseMode: "json",
        status: 201,
        responseHeaders: { "x-mock-rule": "priority" },
        responseBody: {
          id: "chatcmpl-priority",
          object: "chat.completion",
          choices: [{ index: 0, message: { role: "assistant", content: "matched priority" }, finish_reason: "stop" }]
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "gpt-priority", messages: [{ role: "user", content: "hello" }] }
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers["x-mock-rule"]).toBe("priority");
    expect(response.json().choices[0].message.content).toBe("matched priority");
  });

  it("updates and deletes rules through the admin API", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/_mock/api/rules",
      payload: {
        name: "editable",
        provider: "openai",
        method: "POST",
        pathPattern: "/v1/chat/completions",
        priority: 1,
        enabled: true,
        responseMode: "json",
        status: 200,
        responseBody: { ok: true }
      }
    });
    const created = create.json();

    const update = await app.inject({
      method: "PUT",
      url: `/_mock/api/rules/${created.id}`,
      payload: {
        name: "edited",
        provider: "openai",
        method: "POST",
        pathPattern: "/v1/chat/completions",
        priority: 25,
        enabled: false,
        matchers: [{ source: "body", op: "contains", value: "x" }],
        responseMode: "json",
        status: 202,
        responseHeaders: { "x-edited": "yes" },
        responseBody: { edited: true }
      }
    });

    expect(update.statusCode).toBe(200);
    expect(update.json().name).toBe("edited");
    expect(update.json().enabled).toBe(false);
    expect(update.json().status).toBe(202);

    const del = await app.inject({ method: "DELETE", url: `/_mock/api/rules/${created.id}` });
    expect(del.statusCode).toBe(200);
    const list = (await app.inject({ method: "GET", url: "/_mock/api/rules" })).json();
    expect(list.items.some((item: { id: number }) => item.id === created.id)).toBe(false);
  });
});

describe("provider compatibility", () => {
  it("returns usable text responses for OpenAI Responses, Anthropic Messages, and Gemini generateContent", async () => {
    const openai = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: { model: "gpt-test", input: "hello" }
    });
    expect(openai.statusCode).toBe(200);
    expect(openai.json().output_text).toContain("Mock response");

    const anthropic = await app.inject({
      method: "POST",
      url: "/v1/messages",
      payload: { model: "claude-test", max_tokens: 128, messages: [{ role: "user", content: "hello" }] }
    });
    expect(anthropic.statusCode).toBe(200);
    expect(anthropic.json().content[0].text).toContain("Mock response");

    const gemini = await app.inject({
      method: "POST",
      url: "/v1beta/models/gemini-test:generateContent",
      payload: { contents: [{ role: "user", parts: [{ text: "hello" }] }] }
    });
    expect(gemini.statusCode).toBe(200);
    expect(gemini.json().candidates[0].content.parts[0].text).toContain("Mock response");
  });

  it("supports OpenAI-style tool calls and records multimodal image inputs", async () => {
    const ruleResponse = await app.inject({
      method: "POST",
      url: "/_mock/api/rules",
      payload: {
        name: "tool call",
        provider: "openai",
        method: "POST",
        pathPattern: "/v1/chat/completions",
        priority: 100,
        enabled: true,
        matchers: [{ source: "body", op: "contains", value: "weather" }],
        responseMode: "json",
        status: 200,
        responseBody: {
          id: "chatcmpl-tool",
          object: "chat.completion",
          choices: [
            {
              index: 0,
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: { name: "get_weather", arguments: "{\"city\":\"Shanghai\"}" }
                  }
                ]
              }
            }
          ]
        }
      }
    });
    expect(ruleResponse.statusCode).toBe(201);

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "gpt-test",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "weather" },
              { type: "image_url", image_url: { url: "data:image/png;base64,abc" } }
            ]
          }
        ]
      }
    });

    expect(response.json().choices[0].message.tool_calls[0].function.name).toBe("get_weather");
    const logs = (await app.inject({ method: "GET", url: "/_mock/api/requests" })).json();
    expect(logs.items[0].rawBody).toContain("data:image/png;base64,abc");
  });
});

describe("streaming", () => {
  it("emits and logs SSE events for OpenAI streaming requests", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "gpt-test", stream: true, messages: [{ role: "user", content: "stream" }] }
    });

    expect(response.statusCode).toBe(200);
    expect(String(response.headers["content-type"])).toContain("text/event-stream");
    expect(response.body).toContain("data:");
    expect(response.body).toContain("[DONE]");

    const logs = (await app.inject({ method: "GET", url: "/_mock/api/requests" })).json();
    expect(logs.items[0].responseBody).toContain("[DONE]");
  });

  it("uses OpenAI-compatible reasoning and answer deltas for fallback chat streams", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "deepseek-v4-flash", stream: true, messages: [{ role: "user", content: "my" }] }
    });

    const events = parseSseData(response.body);
    const chunks = events.filter((event) => event !== "[DONE]").map((event) => JSON.parse(event));
    const deltas = chunks.map((chunk) => chunk.choices[0].delta);

    expect(events.at(-1)).toBe("[DONE]");
    expect(deltas[0]).toMatchObject({ role: "assistant", content: null, reasoning_content: "" });
    expect(deltas.some((delta) => delta.content === null && delta.reasoning_content === "The")).toBe(true);
    expect(deltas.some((delta) => delta.content === "Hello" && delta.reasoning_content === null)).toBe(true);
    expect(chunks.at(-1).choices[0].finish_reason).toBe("stop");
    expect(chunks.at(-1).usage.completion_tokens_details.reasoning_tokens).toBeGreaterThan(0);
  });

  it("streams configured SSE rule events over HTTP with per-event delay", async () => {
    await app.inject({
      method: "POST",
      url: "/_mock/api/rules",
      payload: {
        name: "delayed sse",
        provider: "openai",
        method: "POST",
        pathPattern: "/v1/chat/completions",
        priority: 100,
        enabled: true,
        responseMode: "sse",
        status: 200,
        responseHeaders: {},
        responseBody: null,
        sseEvents: ["data: first", "data: second"],
        delayMs: 100
      }
    });

    const baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
    const started = performance.now();
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-test", stream: true, messages: [{ role: "user", content: "stream" }] })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.body).not.toBeNull();

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const first = await reader.read();
    const firstAt = performance.now() - started;
    const second = await reader.read();
    const secondAt = performance.now() - started;
    await reader.cancel();

    expect(decoder.decode(first.value)).toContain("data: first");
    expect(decoder.decode(first.value)).not.toContain("data: second");
    expect(decoder.decode(second.value)).toContain("data: second");
    expect(secondAt - firstAt).toBeGreaterThanOrEqual(70);
  });
});

function parseSseData(body: string): string[] {
  return body
    .split("\n\n")
    .map((event) => event.split("\n").find((line) => line.startsWith("data: "))?.slice("data: ".length))
    .filter((event): event is string => Boolean(event));
}
