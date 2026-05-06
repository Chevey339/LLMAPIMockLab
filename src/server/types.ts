export type Provider = "openai" | "anthropic" | "gemini" | "unknown";
export type ResponseMode = "json" | "sse";

export type Matcher = {
  source: "header" | "query" | "json" | "body";
  key?: string;
  op: "equals" | "contains";
  value: unknown;
};

export type MockRule = {
  id: number;
  name: string;
  provider: Provider;
  method: string;
  pathPattern: string;
  priority: number;
  enabled: boolean;
  matchers: Matcher[];
  responseMode: ResponseMode;
  status: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  sseEvents: string[];
  delayMs: number;
  createdAt: string;
  updatedAt: string;
};

export type NewRule = Omit<MockRule, "id" | "createdAt" | "updatedAt">;

export type CapturedRequest = {
  id: number;
  timestamp: string;
  provider: Provider;
  method: string;
  path: string;
  query: Record<string, unknown>;
  rawHeaders: string[];
  headers: Record<string, string>;
  rawBody: string;
  parsedJson: unknown;
  matchedRuleId: number | null;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: string;
  durationMs: number;
};

export type RequestContext = {
  provider: Provider;
  method: string;
  path: string;
  query: Record<string, unknown>;
  rawHeaders: string[];
  headers: Record<string, string>;
  rawBody: string;
  json: unknown;
};
