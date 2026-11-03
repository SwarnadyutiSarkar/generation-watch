// Vercel serverless entry. Bundled into api/index.js by `npm run build:api`.
import type { IncomingMessage, ServerResponse } from 'http';
import { buildApp } from '../server';

let appPromise: ReturnType<typeof buildApp> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  appPromise ??= buildApp();
  const app = await appPromise;
  (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
