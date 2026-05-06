import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 7394);
const host = process.env.HOST ?? "127.0.0.1";

const app = await createApp({ seedDefaults: true });
await app.listen({ port, host });
console.log(`LLM API Mock Lab listening on http://${host}:${port}`);
