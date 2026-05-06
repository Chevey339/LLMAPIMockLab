import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { CapturedRequest, MockRule, NewRule } from "./types.js";

export type AppDatabase = {
  sqlite: DatabaseSync;
  insertRule(rule: NewRule): MockRule;
  updateRule(id: number, rule: Partial<NewRule>): MockRule | null;
  deleteRule(id: number): boolean;
  listRules(): MockRule[];
  getRule(id: number): MockRule | null;
  insertRequest(input: Omit<CapturedRequest, "id">): CapturedRequest;
  listRequests(limit?: number): CapturedRequest[];
  getRequest(id: number): CapturedRequest | null;
  clearRequests(): void;
  close(): void;
};

type Row = Record<string, unknown>;

export function createDatabase(path: string): AppDatabase {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  migrate(sqlite);
  return wrapDatabase(sqlite);
}

export function createTestDatabase(): { db: AppDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mocklab-"));
  const db = createDatabase(join(dir, "test.sqlite"));
  return {
    db,
    cleanup: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      method TEXT NOT NULL,
      path_pattern TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      matchers TEXT NOT NULL DEFAULT '[]',
      response_mode TEXT NOT NULL DEFAULT 'json',
      status INTEGER NOT NULL DEFAULT 200,
      response_headers TEXT NOT NULL DEFAULT '{}',
      response_body TEXT NOT NULL DEFAULT 'null',
      sse_events TEXT NOT NULL DEFAULT '[]',
      delay_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      provider TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      query TEXT NOT NULL,
      raw_headers TEXT NOT NULL,
      headers TEXT NOT NULL,
      raw_body TEXT NOT NULL,
      parsed_json TEXT NOT NULL,
      matched_rule_id INTEGER,
      response_status INTEGER NOT NULL,
      response_headers TEXT NOT NULL,
      response_body TEXT NOT NULL,
      duration_ms INTEGER NOT NULL
    );
  `);
}

function wrapDatabase(sqlite: DatabaseSync): AppDatabase {
  return {
    sqlite,
    insertRule(rule) {
      const now = new Date().toISOString();
      const result = sqlite
        .prepare(`
          INSERT INTO rules
          (name, provider, method, path_pattern, priority, enabled, matchers, response_mode, status, response_headers, response_body, sse_events, delay_ms, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          rule.name,
          rule.provider,
          rule.method.toUpperCase(),
          rule.pathPattern,
          rule.priority,
          rule.enabled ? 1 : 0,
          JSON.stringify(rule.matchers ?? []),
          rule.responseMode,
          rule.status,
          JSON.stringify(rule.responseHeaders ?? {}),
          JSON.stringify(rule.responseBody ?? null),
          JSON.stringify(rule.sseEvents ?? []),
          rule.delayMs ?? 0,
          now,
          now
        );
      return this.getRule(Number(result.lastInsertRowid))!;
    },
    updateRule(id, patch) {
      const current = this.getRule(id);
      if (!current) return null;
      const next: NewRule = {
        name: patch.name ?? current.name,
        provider: patch.provider ?? current.provider,
        method: patch.method ?? current.method,
        pathPattern: patch.pathPattern ?? current.pathPattern,
        priority: patch.priority ?? current.priority,
        enabled: patch.enabled ?? current.enabled,
        matchers: patch.matchers ?? current.matchers,
        responseMode: patch.responseMode ?? current.responseMode,
        status: patch.status ?? current.status,
        responseHeaders: patch.responseHeaders ?? current.responseHeaders,
        responseBody: patch.responseBody ?? current.responseBody,
        sseEvents: patch.sseEvents ?? current.sseEvents,
        delayMs: patch.delayMs ?? current.delayMs
      };
      sqlite
        .prepare(`
          UPDATE rules SET
            name = ?, provider = ?, method = ?, path_pattern = ?, priority = ?, enabled = ?,
            matchers = ?, response_mode = ?, status = ?, response_headers = ?, response_body = ?,
            sse_events = ?, delay_ms = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(
          next.name,
          next.provider,
          next.method.toUpperCase(),
          next.pathPattern,
          next.priority,
          next.enabled ? 1 : 0,
          JSON.stringify(next.matchers),
          next.responseMode,
          next.status,
          JSON.stringify(next.responseHeaders),
          JSON.stringify(next.responseBody),
          JSON.stringify(next.sseEvents),
          next.delayMs,
          new Date().toISOString(),
          id
        );
      return this.getRule(id);
    },
    deleteRule(id) {
      return sqlite.prepare("DELETE FROM rules WHERE id = ?").run(id).changes > 0;
    },
    listRules() {
      return sqlite
        .prepare("SELECT * FROM rules ORDER BY priority DESC, id ASC")
        .all()
        .map(ruleFromRow);
    },
    getRule(id) {
      const row = sqlite.prepare("SELECT * FROM rules WHERE id = ?").get(id) as Row | undefined;
      return row ? ruleFromRow(row) : null;
    },
    insertRequest(input) {
      const result = sqlite
        .prepare(`
          INSERT INTO requests
          (timestamp, provider, method, path, query, raw_headers, headers, raw_body, parsed_json, matched_rule_id, response_status, response_headers, response_body, duration_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          input.timestamp,
          input.provider,
          input.method,
          input.path,
          JSON.stringify(input.query),
          JSON.stringify(input.rawHeaders),
          JSON.stringify(input.headers),
          input.rawBody,
          JSON.stringify(input.parsedJson ?? null),
          input.matchedRuleId,
          input.responseStatus,
          JSON.stringify(input.responseHeaders),
          input.responseBody,
          input.durationMs
        );
      return this.getRequest(Number(result.lastInsertRowid))!;
    },
    listRequests(limit = 200) {
      return sqlite
        .prepare("SELECT * FROM requests ORDER BY id DESC LIMIT ?")
        .all(limit)
        .map(requestFromRow);
    },
    getRequest(id) {
      const row = sqlite.prepare("SELECT * FROM requests WHERE id = ?").get(id) as Row | undefined;
      return row ? requestFromRow(row) : null;
    },
    clearRequests() {
      sqlite.prepare("DELETE FROM requests").run();
    },
    close() {
      sqlite.close();
    }
  };
}

function ruleFromRow(row: Row): MockRule {
  return {
    id: Number(row.id),
    name: String(row.name),
    provider: row.provider as MockRule["provider"],
    method: String(row.method),
    pathPattern: String(row.path_pattern),
    priority: Number(row.priority),
    enabled: Boolean(row.enabled),
    matchers: JSON.parse(String(row.matchers)),
    responseMode: row.response_mode as MockRule["responseMode"],
    status: Number(row.status),
    responseHeaders: JSON.parse(String(row.response_headers)),
    responseBody: JSON.parse(String(row.response_body)),
    sseEvents: JSON.parse(String(row.sse_events)),
    delayMs: Number(row.delay_ms),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function requestFromRow(row: Row): CapturedRequest {
  return {
    id: Number(row.id),
    timestamp: String(row.timestamp),
    provider: row.provider as CapturedRequest["provider"],
    method: String(row.method),
    path: String(row.path),
    query: JSON.parse(String(row.query)),
    rawHeaders: JSON.parse(String(row.raw_headers)),
    headers: JSON.parse(String(row.headers)),
    rawBody: String(row.raw_body),
    parsedJson: JSON.parse(String(row.parsed_json)),
    matchedRuleId: row.matched_rule_id === null ? null : Number(row.matched_rule_id),
    responseStatus: Number(row.response_status),
    responseHeaders: JSON.parse(String(row.response_headers)),
    responseBody: String(row.response_body),
    durationMs: Number(row.duration_ms)
  };
}
