import { describe, expect, it, vi } from "vitest";
import { copyText } from "../src/client/clipboard.js";

function fakeDocument() {
  const nodes: unknown[] = [];
  const textarea = {
    value: "",
    readOnly: false,
    style: {} as Record<string, string>,
    select: vi.fn()
  };
  return {
    textarea,
    document: {
      body: {
        appendChild: vi.fn((node: unknown) => nodes.push(node)),
        removeChild: vi.fn((node: unknown) => {
          const index = nodes.indexOf(node);
          if (index >= 0) nodes.splice(index, 1);
        })
      },
      createElement: vi.fn(() => textarea),
      execCommand: vi.fn(() => true)
    }
  };
}

describe("copyText", () => {
  it("uses async clipboard when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(copyText("headers", { clipboard: { writeText } })).resolves.toBe("clipboard");

    expect(writeText).toHaveBeenCalledWith("headers");
  });

  it("falls back to legacy textarea copy when clipboard is unavailable", async () => {
    const { document, textarea } = fakeDocument();

    await expect(copyText("body", { document })).resolves.toBe("fallback");

    expect(textarea.value).toBe("body");
    expect(textarea.select).toHaveBeenCalled();
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("falls back when async clipboard rejects", async () => {
    const { document } = fakeDocument();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));

    await expect(copyText("response", { clipboard: { writeText }, document })).resolves.toBe("fallback");
  });
});
