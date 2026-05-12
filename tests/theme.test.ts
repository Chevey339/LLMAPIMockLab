import { describe, expect, it } from "vitest";
import { nextTheme, resolveInitialTheme } from "../src/client/theme.js";

describe("theme preference", () => {
  it("uses a valid saved theme before system preference", () => {
    expect(resolveInitialTheme("dark", false)).toBe("dark");
    expect(resolveInitialTheme("light", true)).toBe("light");
  });

  it("falls back to system preference when saved theme is missing or invalid", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
    expect(resolveInitialTheme("system", false)).toBe("light");
  });

  it("toggles between light and dark", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });
});
