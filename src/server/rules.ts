import type { AppDatabase } from "./db.js";
import type { MockRule, RequestContext } from "./types.js";

export function findMatchingRule(db: AppDatabase, ctx: RequestContext): MockRule | null {
  return db
    .listRules()
    .filter((rule) => rule.enabled)
    .filter((rule) => rule.provider === ctx.provider || rule.provider === "unknown")
    .filter((rule) => rule.method.toUpperCase() === ctx.method.toUpperCase())
    .filter((rule) => pathMatches(rule.pathPattern, ctx.path))
    .find((rule) => rule.matchers.every((matcher) => matcherMatches(matcher, ctx))) ?? null;
}

export function pathMatches(pattern: string, path: string): boolean {
  if (pattern === path || pattern === "*") return true;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*").replace(/:[A-Za-z0-9_]+/g, "[^/]+");
  return new RegExp(`^${escaped}$`).test(path);
}

function matcherMatches(matcher: MockRule["matchers"][number], ctx: RequestContext): boolean {
  const expected = String(matcher.value);
  let actual: unknown;
  if (matcher.source === "body") actual = ctx.rawBody;
  if (matcher.source === "header") actual = ctx.headers[String(matcher.key ?? "").toLowerCase()];
  if (matcher.source === "query") actual = ctx.query[String(matcher.key ?? "")];
  if (matcher.source === "json") actual = getJsonPath(ctx.json, String(matcher.key ?? ""));

  if (matcher.op === "equals") return String(actual) === expected;
  if (matcher.op === "contains") return String(actual ?? "").includes(expected);
  return false;
}

function getJsonPath(value: unknown, path: string): unknown {
  if (!path) return value;
  return path.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, value);
}
