type RuleListItem = {
  id: number;
  priority: number;
};

export function upsertRuleImmediately<T extends RuleListItem>(rules: T[], rule: T): T[] {
  return [...rules.filter((item) => item.id !== rule.id), rule].sort(compareRules);
}

export function removeRuleImmediately<T extends RuleListItem>(
  rules: T[],
  deletedId: number,
  selectedRuleId: number | null
): { rules: T[]; selectedRuleId: number | null } {
  const nextRules = rules.filter((rule) => rule.id !== deletedId);
  return {
    rules: nextRules,
    selectedRuleId: selectedRuleId === deletedId ? (nextRules[0]?.id ?? null) : selectedRuleId
  };
}

export function mergeRulesPreservingPending<T extends RuleListItem>(
  currentRules: T[],
  serverRules: T[],
  pendingUpsertIds: Set<number>,
  pendingDeletedIds: Set<number> = new Set()
): T[] {
  const mergedById = new Map(serverRules.filter((rule) => !pendingDeletedIds.has(rule.id)).map((rule) => [rule.id, rule]));
  for (const rule of currentRules) {
    if (pendingUpsertIds.has(rule.id) && !pendingDeletedIds.has(rule.id)) {
      mergedById.set(rule.id, rule);
    }
  }
  return [...mergedById.values()].sort(compareRules);
}

export function settlePendingRuleIds<T extends RuleListItem>(
  serverRules: T[],
  pendingUpsertIds: Set<number>,
  pendingDeletedIds: Set<number>
): { pendingUpsertIds: Set<number>; pendingDeletedIds: Set<number> } {
  const serverIds = new Set(serverRules.map((rule) => rule.id));
  return {
    pendingUpsertIds: new Set([...pendingUpsertIds].filter((id) => !serverIds.has(id))),
    pendingDeletedIds: new Set([...pendingDeletedIds].filter((id) => serverIds.has(id)))
  };
}

function compareRules(a: RuleListItem, b: RuleListItem): number {
  return b.priority - a.priority || a.id - b.id;
}
