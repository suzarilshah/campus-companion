import { createHmac } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { GUIDE_LIMITS, GUIDE_SYSTEM, REFUSAL, cleanQuestion, parseGuide, type GuideAnswer } from '../src/domain/guide.ts';

/**
 * Public Strip guide: the same service runs in the Vercel function and the local server.
 * Cost and abuse controls (all enforced server-side, failing closed):
 *  - per visitor (salted hash of the IP, never stored raw): 5 questions / 10 min and 20 / day
 *  - whole site: 30 / minute and 500 / day (Kimi K2.5 ≈ $0.0023 per capped request → ≤ ≈ $1.15/day)
 *  - 280-character questions, 350 output tokens, 15 s timeout, identical questions served from cache
 *  - if the usage store is unreachable, no model call is made
 */
export const GUIDE_QUOTA = { visitorPer10Min: 5, visitorPerDay: 20, sitePerMinute: 30, sitePerDay: 500 } as const;

export interface GuideModel { complete(system: string, user: string, maxTokens: number, signal: AbortSignal): Promise<string> }
export interface UsageStore { hit(buckets: { key: string; ttlSeconds: number }[]): Promise<Record<string, number>> }

export class GuideError extends Error { constructor(public status: number, message: string, public retryAfter?: number) { super(message); } }

export class MemoryUsage implements UsageStore {
  private counts = new Map<string, { hits: number; expires: number }>();
  async hit(buckets: { key: string; ttlSeconds: number }[]) {
    const now = Date.now(), out: Record<string, number> = {};
    for (const { key, ttlSeconds } of buckets) {
      const current = this.counts.get(key);
      const next = current && current.expires > now ? { hits: current.hits + 1, expires: current.expires } : { hits: 1, expires: now + ttlSeconds * 1000 };
      this.counts.set(key, next); out[key] = next.hits;
    }
    return out;
  }
}

/** Atomic counters in Neon Postgres, so limits hold across every serverless instance. */
export class NeonUsage implements UsageStore {
  private sql;
  private ready?: Promise<unknown>;
  constructor(url: string) { this.sql = neon(url); }
  async hit(buckets: { key: string; ttlSeconds: number }[]) {
    this.ready ??= this.sql.query('create table if not exists guide_usage (bucket text primary key, hits integer not null, expires_at timestamptz not null)');
    await this.ready;
    const values = buckets.map((_, i) => `($${i * 2 + 1}, 1, now() + make_interval(secs => $${i * 2 + 2}))`).join(', ');
    const rows = await this.sql.query(`insert into guide_usage (bucket, hits, expires_at) values ${values}
      on conflict (bucket) do update set hits = case when guide_usage.expires_at < now() then 1 else guide_usage.hits + 1 end,
        expires_at = case when guide_usage.expires_at < now() then excluded.expires_at else guide_usage.expires_at end
      returning bucket, hits`, buckets.flatMap((bucket) => [bucket.key, bucket.ttlSeconds])) as { bucket: string; hits: number }[];
    if (Math.random() < 0.02) void this.sql.query('delete from guide_usage where expires_at < now() - interval \'1 day\'').catch(() => undefined);
    return Object.fromEntries(rows.map((row) => [row.bucket, Number(row.hits)]));
  }
}

export class GuideService {
  private cache = new Map<string, { answer: GuideAnswer; expires: number }>();
  constructor(private model: GuideModel | undefined, private usage: UsageStore, private salt: string, private log: (entry: Record<string, unknown>) => void = (entry) => console.info(JSON.stringify({ guide: entry }))) {}
  get enabled() { return Boolean(this.model); }

  async ask(clientAddress: string, rawQuestion: unknown): Promise<GuideAnswer & { cached?: boolean }> {
    if (!this.model) throw new GuideError(503, 'The Strip guide is turned off right now.');
    const question = cleanQuestion(rawQuestion);
    if (question.length < 3) throw new GuideError(400, 'Ask a question about the venues, the globe or the passport.');
    const key = question.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return { ...cached.answer, cached: true };

    const visitor = createHmac('sha256', this.salt).update(clientAddress || 'unknown').digest('hex').slice(0, 24);
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10), minute = Math.floor(now / 60_000), tenMin = Math.floor(now / 600_000);
    const buckets = [
      { key: `v:${visitor}:10m:${tenMin}`, ttlSeconds: 600, limit: GUIDE_QUOTA.visitorPer10Min, retry: 600 - Math.floor((now / 1000) % 600) },
      { key: `v:${visitor}:d:${day}`, ttlSeconds: 86_400, limit: GUIDE_QUOTA.visitorPerDay, retry: 3600 },
      { key: `site:m:${minute}`, ttlSeconds: 60, limit: GUIDE_QUOTA.sitePerMinute, retry: 60 },
      { key: `site:d:${day}`, ttlSeconds: 86_400, limit: GUIDE_QUOTA.sitePerDay, retry: 3600 },
    ];
    let counts: Record<string, number>;
    try { counts = await this.usage.hit(buckets.map(({ key: bucket, ttlSeconds }) => ({ key: bucket, ttlSeconds }))); } catch {
      throw new GuideError(503, 'The Strip guide is busy. Please try again later.');
    }
    const over = buckets.find((bucket) => (counts[bucket.key] ?? Infinity) > bucket.limit);
    if (over) {
      this.log({ limited: over.key.startsWith('site') ? 'site' : 'visitor' });
      throw new GuideError(429, over.key.startsWith('site') ? 'The Strip guide has reached today’s limit. Please try again tomorrow.' : 'You’ve asked a lot of questions. Please wait a little and try again.', over.retry);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const started = Date.now();
    try {
      const raw = await this.model.complete(GUIDE_SYSTEM, JSON.stringify({ question }), GUIDE_LIMITS.maxTokens, controller.signal);
      const answer = parseGuide(raw);
      this.log({ ms: Date.now() - started, refused: answer.refused, places: answer.places.length });
      if (this.cache.size > 200) this.cache.clear();
      this.cache.set(key, { answer, expires: Date.now() + 3_600_000 });
      return answer;
    } catch {
      this.log({ ms: Date.now() - started, error: true });
      throw new GuideError(503, 'The Strip guide could not answer right now. Please try again later.');
    } finally { clearTimeout(timer); }
  }
}

export { REFUSAL };
