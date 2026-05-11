import { describe, expect, it } from "vitest";
import { formatSseEventsInput, parseSseEventsInput } from "../src/client/sseEvents.js";

describe("SSE events editor parsing", () => {
  it("accepts raw SSE data blocks pasted from a streaming response", () => {
    const input = `data: {"id":"f6cbf6f5-90d2-4e37-8338-0cd09a562441","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"","reasoning_content":null},"finish_reason":"stop"}],"usage":{"total_tokens":701}}

data: [DONE]`;

    expect(parseSseEventsInput(input)).toEqual([
      `data: {"id":"f6cbf6f5-90d2-4e37-8338-0cd09a562441","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"","reasoning_content":null},"finish_reason":"stop"}],"usage":{"total_tokens":701}}`,
      "data: [DONE]"
    ]);
  });

  it("keeps supporting JSON arrays for existing saved rules", () => {
    expect(parseSseEventsInput(`["data: first","data: [DONE]"]`)).toEqual(["data: first", "data: [DONE]"]);
  });

  it("formats saved SSE events as paste-friendly raw blocks", () => {
    expect(formatSseEventsInput(["data: first", "data: [DONE]"])).toBe("data: first\n\ndata: [DONE]");
  });
});
