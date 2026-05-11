import { describe, expect, it } from "vitest";
import { removeRuleImmediately, upsertRuleImmediately } from "../src/client/ruleState.js";

type Rule = {
  id: number;
  priority: number;
  name: string;
};

describe("rule state helpers", () => {
  it("adds a newly created rule immediately in server ordering", () => {
    const current: Rule[] = [
      { id: 1, priority: 10, name: "low" },
      { id: 2, priority: 50, name: "high" }
    ];

    const next = upsertRuleImmediately(current, { id: 3, priority: 100, name: "created" });

    expect(next.map((rule) => rule.id)).toEqual([3, 2, 1]);
  });

  it("removes a deleted rule immediately and moves selection to a remaining rule", () => {
    const current: Rule[] = [
      { id: 3, priority: 100, name: "created" },
      { id: 2, priority: 50, name: "high" },
      { id: 1, priority: 10, name: "low" }
    ];

    const next = removeRuleImmediately(current, 3, 3);

    expect(next.rules.map((rule) => rule.id)).toEqual([2, 1]);
    expect(next.selectedRuleId).toBe(2);
  });
});
