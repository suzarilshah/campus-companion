import type { IncomingMessage, ServerResponse } from 'node:http';
import { fromWebToken } from '@aws-sdk/credential-providers';
import { BedrockGuideModel } from './guide-model.ts';
import { GuideError, GuideService, NeonUsage } from './guide.ts';

/**
 * Vercel serverless entry for POST /api/guide (bundled by scripts/build-vercel.mjs).
 * No AWS keys exist anywhere: Vercel's per-request OIDC token is exchanged with STS for a role that may only call
 * one Bedrock model. Env (set in Vercel, never in git): GUIDE_ROLE_ARN, GUIDE_MODEL_ID, GUIDE_REGION,
 * GUIDE_SALT, GUIDE_ALLOWED_ORIGINS, DATABASE_URL. Unset GUIDE_ENABLED=1 to switch the guide off.
 */
const env = process.env;
const allowed = new Set((env.GUIDE_ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean));
const configured = env.GUIDE_ENABLED === '1' && env.GUIDE_ROLE_ARN && env.GUIDE_MODEL_ID && env.DATABASE_URL && env.GUIDE_SALT && allowed.size;
const usage = configured ? new NeonUsage(env.DATABASE_URL!) : undefined;
let current: { token: string; service: GuideService } | undefined;

function serviceFor(token: string) {
  // One service per OIDC token (tokens rotate); keeps the per-instance answer cache between requests.
  if (current?.token === token) return current.service;
  try { // Public identity claims only (issuer, audience, subject) — the token itself is never logged.
    const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
    console.info(JSON.stringify({ guide: { oidc: { iss: claims.iss, aud: claims.aud, sub: claims.sub } } }));
  } catch { /* not a JWT */ }
  const credentials = fromWebToken({ roleArn: env.GUIDE_ROLE_ARN!, webIdentityToken: token, roleSessionName: 'campus-companion-guide', durationSeconds: 900 });
  const model = new BedrockGuideModel(env.GUIDE_MODEL_ID!, env.GUIDE_REGION || 'us-east-1', credentials);
  current = { token, service: new GuideService(model, usage!, env.GUIDE_SALT!) };
  return current.service;
}

function send(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage) {
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) { size += (chunk as Buffer).length; if (size > 2048) throw new GuideError(413, 'Question too long.'); chunks.push(chunk as Buffer); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new GuideError(400, 'Invalid request.'); }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const origin = String(req.headers.origin ?? '');
    // Browsers always send Origin on POST; scripts that omit or fake it still hit the same quotas below.
    if (!allowed.has(origin) || req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: 'Not allowed.' });
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return send(res, 415, { error: 'Send JSON.' });
    if (!configured) return send(res, 503, { error: 'The Strip guide is turned off right now.' });
    const token = String(req.headers['x-vercel-oidc-token'] ?? env.VERCEL_OIDC_TOKEN ?? '');
    if (!token) return send(res, 503, { error: 'The Strip guide is not available right now.' });
    const body = await readBody(req);
    const address = String(req.headers['x-real-ip'] ?? String(req.headers['x-forwarded-for'] ?? '').split(',')[0] ?? '').trim();
    const answer = await serviceFor(token).ask(address, body?.question);
    return send(res, 200, answer);
  } catch (error) {
    if (error instanceof GuideError) return send(res, error.status, { error: error.message }, error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {});
    console.error(JSON.stringify({ guide: { unhandled: true } }));
    return send(res, 500, { error: 'Something went wrong.' });
  }
}
