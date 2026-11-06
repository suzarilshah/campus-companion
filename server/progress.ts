import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { EXP, clientAwardValue, labelFor, levelFor, quests, type ProgressView } from '../src/domain/progress.ts';

/**
 * Storage for exploration/planning EXP, keyed by an opaque identity:
 *   `builder:<sha256 of the Builder ID subject>` once signed in, or `guest:<random>` before that.
 * Rows hold only identity, award key, EXP and time — never tokens, email, names or schedule contents.
 */
export type Award = { exp: number; at: string };
export type Awards = Record<string, Award>;

export interface ProgressBackend {
  readonly name: string;
  load(identity: string): Promise<Awards>;
  /** Insert-if-absent, so concurrent or repeated grants can never double count. */
  add(identity: string, entries: [string, Award][]): Promise<void>;
}

export class MemoryBackend implements ProgressBackend {
  readonly name = 'memory (not saved)';
  private profiles = new Map<string, Awards>();
  async load(identity: string) { return structuredClone(this.profiles.get(identity) ?? {}); }
  async add(identity: string, entries: [string, Award][]) {
    const awards = this.profiles.get(identity) ?? {};
    for (const [key, award] of entries) awards[key] ??= award;
    this.profiles.set(identity, awards);
  }
}

export class FileBackend implements ProgressBackend {
  readonly name = 'local file';
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}
  private async read(): Promise<Record<string, Awards>> {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as { version?: number; profiles?: Record<string, Awards> };
      if (parsed.version === 2 && parsed.profiles && typeof parsed.profiles === 'object') return parsed.profiles;
    } catch { /* A missing or unreadable file starts fresh. */ }
    return {};
  }
  async load(identity: string) { return (await this.read())[identity] ?? {}; }
  add(identity: string, entries: [string, Award][]) {
    const work = async () => {
      const profiles = await this.read();
      const awards = profiles[identity] ??= {};
      for (const [key, award] of entries) awards[key] ??= award;
      await mkdir(dirname(this.file), { recursive: true });
      const temporary = `${this.file}.tmp`;
      await writeFile(temporary, JSON.stringify({ version: 2, profiles }, null, 2));
      await rename(temporary, this.file);
    };
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

export const NEON_SCHEMA = `create table if not exists campus_progress (
  identity text not null check (identity ~ '^(builder|guest):[A-Za-z0-9_-]{16,128}$'),
  award_key text not null check (length(award_key) between 1 and 160),
  exp integer not null check (exp between 0 and 1000),
  awarded_at timestamptz not null default now(),
  primary key (identity, award_key)
)`;

/** Neon serverless Postgres over HTTP (works from this local server and from Vercel functions). */
export class NeonBackend implements ProgressBackend {
  readonly name = 'Neon Postgres';
  private sql: ReturnType<typeof neon>;
  private ready?: Promise<unknown>;
  constructor(url: string) { this.sql = neon(url); }
  private schema() { return this.ready ??= this.sql.query(NEON_SCHEMA).catch((error) => { this.ready = undefined; throw error; }); }
  async load(identity: string) {
    await this.schema();
    const rows = await this.sql.query('select award_key, exp, awarded_at from campus_progress where identity = $1', [identity]) as { award_key: string; exp: number; awarded_at: string | Date }[];
    return Object.fromEntries(rows.map((row) => [row.award_key, { exp: row.exp, at: new Date(row.awarded_at).toISOString() }]));
  }
  async add(identity: string, entries: [string, Award][]) {
    if (!entries.length) return;
    await this.schema();
    await this.sql.transaction(entries.map(([key, award]) => this.sql.query('insert into campus_progress (identity, award_key, exp, awarded_at) values ($1, $2, $3, $4) on conflict do nothing', [identity, key, award.exp, award.at])));
  }
}

export class ProgressStore {
  constructor(private backend: ProgressBackend) {}
  get storage() { return this.backend.name; }

  async view(identity: string, recent: string[] = []): Promise<ProgressView> {
    return this.render(await this.backend.load(identity), recent);
  }

  /** Browser-requested exploration awards. Unknown keys are rejected; repeats are no-ops. */
  async award(identity: string, key: string) {
    const awards = await this.backend.load(identity);
    if (awards[key]) return this.render(awards, []);
    const value = clientAwardValue(key, new Set(Object.keys(awards)));
    if (value === undefined) throw new Error('Unknown award.');
    return this.grant(identity, awards, [[key, value]]);
  }

  /** Server-only path: call after GetSchedule has confirmed the favorite/reservation for these sessions. */
  async verifiedPlanning(identity: string, kind: 'favorite' | 'reserve', sessionIds: string[]) {
    const awards = await this.backend.load(identity);
    const fresh = [...new Set(sessionIds)].map((id) => `${kind}:${id}`).filter((key) => !awards[key]);
    return this.grant(identity, awards, fresh.map((key) => [key, EXP[kind]] as [string, number]));
  }

  /** On sign-in, carry this browser's guest progress into the Builder ID profile (existing awards win). */
  async merge(from: string, to: string) {
    if (from === to) return;
    const guest = await this.backend.load(from);
    const entries = Object.entries(guest).filter(([key]) => !key.startsWith('quest:'));
    if (!entries.length) return;
    await this.backend.add(to, entries);
    await this.grant(to, await this.backend.load(to), []);
  }

  private async grant(identity: string, awards: Awards, entries: [string, number][]) {
    const at = new Date().toISOString();
    const added: [string, Award][] = [];
    for (const [key, exp] of entries) if (!awards[key]) { awards[key] = { exp, at }; added.push([key, awards[key]]); }
    const keys = new Set(Object.keys(awards));
    for (const quest of quests) {
      const key = `quest:${quest.id}`;
      if (!keys.has(key) && quest.done(keys)) { awards[key] = { exp: quest.exp, at }; keys.add(key); added.push([key, awards[key]]); }
    }
    if (added.length) await this.backend.add(identity, added);
    return this.render(awards, added.map(([key]) => key));
  }

  private render(awards: Awards, recent: string[]): ProgressView {
    const keys = new Set(Object.keys(awards));
    const exp = Object.values(awards).reduce((sum, award) => sum + award.exp, 0);
    return {
      exp,
      level: levelFor(exp),
      discovered: [...keys].filter((key) => key.startsWith('discover:')).map((key) => key.slice('discover:'.length)),
      quests: quests.map((quest) => ({ id: quest.id, title: quest.title, detail: quest.detail, exp: quest.exp, done: keys.has(`quest:${quest.id}`) })),
      recent: recent.map((key) => ({ key, exp: awards[key]!.exp, label: labelFor(key) })),
      storage: this.backend.name,
    };
  }
}
