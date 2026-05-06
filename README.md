# LLM API Mock Lab

LLM API Mock Lab is a local mock server for testing clients that integrate with OpenAI, Anthropic, Gemini, and OpenAI-compatible APIs. It accepts provider-style requests, stores every request header and body in SQLite, and returns configurable fixed responses.

The default port is `7394` for local runs and Docker.

## Features

- Captures raw request headers and raw request bodies.
- Stores request logs and mock rules in SQLite.
- Serves provider-compatible JSON and streaming responses.
- Includes a web UI for inspecting requests and managing rules.
- Supports rule matching by provider, method, path, headers, query, JSON fields, or raw body text.
- Keeps secrets exactly as received. No redaction is applied by default.

## Supported Endpoints

- OpenAI Chat Completions: `POST /v1/chat/completions`
- OpenAI Responses: `POST /v1/responses`
- OpenAI Models: `GET /v1/models`
- Anthropic Messages: `POST /v1/messages`
- Gemini generateContent: `POST /v1beta/models/{model}:generateContent`
- Gemini streamGenerateContent: `POST /v1beta/models/{model}:streamGenerateContent`

Admin API and UI routes live under `/_mock/*`.

## Quick Start

Install dependencies:

```bash
npm install --ignore-scripts
```

Run the API server locally:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:7394
```

Production build:

```bash
npm run build
npm start
```

## Docker

```bash
docker compose up --build
```

Open:

```text
http://127.0.0.1:7394
```

SQLite data is stored in the `mocklab-data` Docker volume.

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `HOST` | `127.0.0.1` locally, `0.0.0.0` in Docker | Bind host. |
| `PORT` | `7394` | HTTP port. |
| `DATABASE_PATH` | `./data/mocklab.sqlite` locally, `/data/mocklab.sqlite` in Docker | SQLite database path. |
| `MAX_BODY_BYTES` | `52428800` | Maximum request body size. |

## Point a Client at Mock Lab

OpenAI-compatible clients:

```text
baseURL=http://127.0.0.1:7394/v1
```

Anthropic-style clients:

```text
baseURL=http://127.0.0.1:7394
```

Gemini-style clients:

```text
baseURL=http://127.0.0.1:7394
```

The mock server does not validate API keys. If your client requires one, any placeholder value can be used. The value will be captured and shown in the request log.

## Rules

Rules decide which fixed response a request receives. Higher `priority` rules match first.

A rule can match by provider, method, path pattern, and optional matchers. Example matcher:

```json
[
  { "source": "body", "op": "contains", "value": "weather" }
]
```

That rule matches any request whose raw body contains `weather`.

JSON field matcher example:

```json
[
  { "source": "json", "key": "model", "op": "equals", "value": "gpt-test" }
]
```

Response body example for OpenAI Chat Completions:

```json
{
  "id": "chatcmpl_custom",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Custom mock response" },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 1, "completion_tokens": 3, "total_tokens": 4 }
}
```

For streaming rules, set mode to `sse` and provide an array of SSE event strings.

## Development

Run tests:

```bash
npm test
```

Build:

```bash
npm run build
```

Frontend-only Vite dev server:

```bash
npm run dev
```

The Vite dev server runs on `5173` and proxies API calls to `127.0.0.1:7394`.

## Security

This tool is intended for local development or trusted networks. By default:

- No authentication is enabled.
- Request headers and bodies are saved exactly as received.
- Secrets such as `Authorization` and `x-api-key` are visible in the UI.

Do not expose this service publicly unless you add authentication or place it behind a trusted reverse proxy.
