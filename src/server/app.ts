import cors from "@fastify/cors";
import staticFiles from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import type { AppDatabase } from "./db.js";
import { createDatabase } from "./db.js";
import { defaultJsonResponse, defaultSseEvents, detectProvider, wantsStream } from "./providers.js";
import { findMatchingRule } from "./rules.js";
import type { NewRule, RequestContext } from "./types.js";

type AppOptions = {
  db?: AppDatabase;
  seedDefaults?: boolean;
};

export async function createApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const db = options.db ?? createDatabase(process.env.DATABASE_PATH ?? "./data/mocklab.sqlite");
  const app = Fastify({ logger: false, bodyLimit: Number(process.env.MAX_BODY_BYTES ?? 50 * 1024 * 1024) });

  await app.register(cors, { origin: true });

  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) => {
    const raw = Buffer.isBuffer(body) ? body.toString("utf8") : String(body ?? "");
    done(null, raw);
  });

  if (options.seedDefaults) seedDefaultRules(db);

  app.decorate("mockDb", db);
  app.addHook("onClose", async () => {
    if (!options.db) db.close();
  });

  registerAdminRoutes(app, db);
  await registerStaticUi(app);
  registerProviderRoutes(app, db);

  return app;
}

async function registerStaticUi(app: FastifyInstance): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const clientDir = join(here, "../client");
  if (!existsSync(join(clientDir, "index.html"))) return;
  await app.register(staticFiles, {
    root: clientDir,
    prefix: "/",
    index: "index.html",
    wildcard: false
  });
}

function registerAdminRoutes(app: FastifyInstance, db: AppDatabase): void {
  app.get("/_mock/api/requests", async (request) => {
    const limit = Number((request.query as Record<string, unknown>).limit ?? 200);
    return { items: db.listRequests(limit) };
  });
  app.get("/_mock/api/requests/:id", async (request, reply) => {
    const item = db.getRequest(Number((request.params as { id: string }).id));
    if (!item) return reply.status(404).send({ error: "Request not found" });
    return item;
  });
  app.delete("/_mock/api/requests", async () => {
    db.clearRequests();
    return { ok: true };
  });
  app.get("/_mock/api/rules", async () => ({ items: db.listRules() }));
  app.post("/_mock/api/rules", async (request, reply) => {
    const rule = normalizeRule(request.body);
    return reply.status(201).send(db.insertRule(rule));
  });
  app.put("/_mock/api/rules/:id", async (request, reply) => {
    const updated = db.updateRule(Number((request.params as { id: string }).id), normalizeRulePatch(request.body));
    if (!updated) return reply.status(404).send({ error: "Rule not found" });
    return updated;
  });
  app.delete("/_mock/api/rules/:id", async (request, reply) => {
    if (!db.deleteRule(Number((request.params as { id: string }).id))) return reply.status(404).send({ error: "Rule not found" });
    return { ok: true };
  });
  app.get("/_mock/api/providers", async () => ({
    providers: [
      { name: "OpenAI", endpoints: ["POST /v1/chat/completions", "POST /v1/responses", "GET /v1/models"] },
      { name: "Anthropic", endpoints: ["POST /v1/messages"] },
      { name: "Gemini", endpoints: ["POST /v1beta/models/:model:generateContent", "POST /v1beta/models/:model:streamGenerateContent"] }
    ]
  }));
}

function registerProviderRoutes(app: FastifyInstance, db: AppDatabase): void {
  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url.startsWith("/_mock/")) return reply.status(404).send({ error: "Not found" });
    const started = Date.now();
    const ctx = makeContext(request);
    const rule = findMatchingRule(db, ctx);
    const stream = rule?.responseMode === "sse" || wantsStream(ctx);
    const status = rule?.status ?? 200;
    const responseHeaders = {
      ...(stream ? { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" } : { "content-type": "application/json; charset=utf-8" }),
      ...(rule?.responseHeaders ?? {})
    };
    const hasStaticBody = rule && rule.responseBody !== null && rule.responseBody !== undefined;
    const sseEvents = stream ? (rule?.sseEvents?.length ? rule.sseEvents : defaultSseEvents(ctx)) : [];
    const body = stream ? buildSse(sseEvents) : JSON.stringify(hasStaticBody ? rule.responseBody : defaultJsonResponse(ctx));

    Object.entries(responseHeaders).forEach(([key, value]) => reply.header(key, value));
    reply.status(status);
    db.insertRequest({
      timestamp: new Date().toISOString(),
      provider: ctx.provider,
      method: ctx.method,
      path: ctx.path,
      query: ctx.query,
      rawHeaders: ctx.rawHeaders,
      headers: ctx.headers,
      rawBody: ctx.rawBody,
      parsedJson: ctx.json,
      matchedRuleId: rule?.id ?? null,
      responseStatus: status,
      responseHeaders,
      responseBody: body,
      durationMs: Date.now() - started
    });
    if (stream) {
      return reply.send(streamSse(sseEvents, rule?.delayMs ?? 0));
    }
    return reply.send(body);
  };
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
    app.route({ method, url: "/*", handler });
  }
}

function makeContext(request: FastifyRequest): RequestContext {
  const url = new URL(request.url, "http://mocklab.local");
  const rawBody = typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? "");
  const json = parseJson(rawBody);
  return {
    provider: detectProvider(url.pathname),
    method: request.method.toUpperCase(),
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    rawHeaders: request.raw.rawHeaders,
    headers: lowerHeaders(request.headers),
    rawBody,
    json
  };
}

function lowerHeaders(headers: FastifyRequest["headers"]): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value ?? "")])
  );
}

function parseJson(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildSse(events: string[]): string {
  return events.map((event) => event.trimEnd()).join("\n\n") + "\n\n";
}

function streamSse(events: string[], delayMs: number): Readable {
  const queue = events.map((event) => `${event.trimEnd()}\n\n`);
  return Readable.from(
    (async function* () {
      for (const [index, event] of queue.entries()) {
        if (index > 0 && delayMs > 0) {
          await sleep(delayMs);
        }
        yield event;
      }
    })()
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeRule(body: unknown): NewRule {
  const value = parseBodyObject(body);
  return {
    name: String(value.name ?? "Untitled rule"),
    provider: (value.provider as NewRule["provider"]) ?? "unknown",
    method: String(value.method ?? "POST").toUpperCase(),
    pathPattern: String(value.pathPattern ?? "*"),
    priority: Number(value.priority ?? 0),
    enabled: value.enabled !== false,
    matchers: Array.isArray(value.matchers) ? (value.matchers as NewRule["matchers"]) : [],
    responseMode: (value.responseMode as NewRule["responseMode"]) ?? "json",
    status: Number(value.status ?? 200),
    responseHeaders: recordOfStrings(value.responseHeaders),
    responseBody: value.responseBody ?? null,
    sseEvents: Array.isArray(value.sseEvents) ? value.sseEvents.map(String) : [],
    delayMs: Number(value.delayMs ?? 0)
  };
}

function normalizeRulePatch(body: unknown): Partial<NewRule> {
  return normalizeRule(body);
}

function parseBodyObject(body: unknown): Record<string, unknown> {
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function recordOfStrings(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, String(item)]));
}

function seedDefaultRules(db: AppDatabase): void {
  if (db.listRules().length > 0) return;
  const base = {
    priority: -100,
    enabled: true,
    matchers: [],
    responseMode: "json" as const,
    status: 200,
    responseHeaders: {},
    responseBody: null,
    sseEvents: [],
    delayMs: 0
  };
  db.insertRule({ ...base, name: "OpenAI Chat fallback", provider: "openai", method: "POST", pathPattern: "/v1/chat/completions" });
  db.insertRule({ ...base, name: "OpenAI Responses fallback", provider: "openai", method: "POST", pathPattern: "/v1/responses" });
  db.insertRule({ ...base, name: "Anthropic Messages fallback", provider: "anthropic", method: "POST", pathPattern: "/v1/messages" });
  db.insertRule({ ...base, name: "Gemini generateContent fallback", provider: "gemini", method: "POST", pathPattern: "/v1beta/models/:model:generateContent" });
}
