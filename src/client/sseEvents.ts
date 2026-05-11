export function parseSseEventsInput(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error("SSE events must be a JSON array or raw data: blocks");
    return parsed.map(String);
  }

  return trimmed
    .split(/\n\s*\n/)
    .map((event) => event.trimEnd())
    .filter(Boolean);
}

export function formatSseEventsInput(events: string[]): string {
  return events.join("\n\n");
}
