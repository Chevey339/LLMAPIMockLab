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

function compareRules(a: RuleListItem, b: RuleListItem): number {
  return b.priority - a.priority || a.id - b.id;
}
