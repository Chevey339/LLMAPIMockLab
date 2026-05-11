import { describe, expect, it } from "vitest";
import { mergeRulesPreservingPending, removeRuleImmediately, settlePendingRuleIds, upsertRuleImmediately } from "../src/client/ruleState.js";

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

  it("keeps locally created rules when a stale refresh returns without them", () => {
    const current: Rule[] = [
      { id: 3, priority: 100, name: "created" },
      { id: 2, priority: 50, name: "high" },
      { id: 1, priority: 10, name: "low" }
    ];
    const staleServerRules: Rule[] = [
      { id: 2, priority: 50, name: "high" },
      { id: 1, priority: 10, name: "low" }
    ];

    const next = mergeRulesPreservingPending(current, staleServerRules, new Set([3]));

    expect(next.map((rule) => rule.id)).toEqual([3, 2, 1]);
  });

  it("keeps locally deleted rules removed when a stale refresh still includes them", () => {
    const current: Rule[] = [
      { id: 2, priority: 50, name: "high" },
      { id: 1, priority: 10, name: "low" }
    ];
    const staleServerRules: Rule[] = [
      { id: 3, priority: 100, name: "deleted" },
      { id: 2, priority: 50, name: "high" },
      { id: 1, priority: 10, name: "low" }
    ];

    const next = mergeRulesPreservingPending(current, staleServerRules, new Set(), new Set([3]));

    expect(next.map((rule) => rule.id)).toEqual([2, 1]);
  });

  it("settles pending rule ids once the server confirms the mutation", () => {
    const settled = settlePendingRuleIds([{ id: 3, priority: 100, name: "created" }], new Set([3]), new Set([4]));

    expect([...settled.pendingUpsertIds]).toEqual([]);
    expect([...settled.pendingDeletedIds]).toEqual([]);
  });
});
