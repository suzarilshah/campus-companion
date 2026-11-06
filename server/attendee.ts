import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { normalizeEvent, normalizeSession, normalizeSchedule, object, text, type LiveCatalog, type LiveSession, type AttendeeSchedule } from '../src/domain/live.ts';

const CLIENT_ID = '7vmom55m1qstvq8i71ph127bfq';
const OAUTH = 'https://oauth.awsevents.com';
const API = 'https://api.awsevents.com/v1/events/reinvent2026';
type Transport = (url: string, init?: RequestInit) => Promise<Response>;
type Tokens = { access: string; refresh: string; expires: number; subject?: string };
/** `reason` is a stable, UI-branchable label for the few AWS outcomes that need a distinct flow. */
export type ErrorReason = 'notRegistered' | 'closed' | 'signIn' | 'throttled';
export class AppError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number, public reason?: ErrorReason) { super(message); }
}
export type ReturnPath = '/' | '/map' | '/passport';
export type ReservationOutcome = { id: string; reserved: boolean; code?: string; conflictsWith?: string[] };
export type ReservationResult = { schedule: AttendeeSchedule; results: ReservationOutcome[]; verified: boolean; message: string };
export function secret() { return randomBytes(32).toString('base64url'); }
export function equalSecret(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The ID token "describes who signed in, for your application's own use" (AWS guide). It arrives directly from the
 * token endpoint over TLS, so its payload is read without re-verifying the signature (OIDC Core §3.1.3.7). Only a
 * one-way hash of `sub` leaves this function; the ID token itself is never stored or sent anywhere.
 */
export function subjectHash(idToken: unknown) {
  if (typeof idToken !== 'string') return undefined;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { sub?: unknown };
    return typeof payload.sub === 'string' && payload.sub ? createHash('sha256').update(`aws-builder-id:${payload.sub}`).digest('base64url') : undefined;
  } catch { return undefined; }
}

export class Attendee {
  readonly csrf = secret();
  /** Pseudonymous progress identity for this browser session before (or without) sign-in. */
  readonly guest = `guest:${secret()}`;
  private tokens?: Tokens;
  private pending?: { state: string; verifier: string; origin: string; expires: number; returnTo: ReturnPath };
  private refreshing?: Promise<void>;
  private catalog?: LiveCatalog;
  private loading?: Promise<LiveCatalog>;
  private epoch = 0;
  private nextRequest = new Map<string, number>();
  private mutationInFlight = false;
  constructor(private transport: Transport = fetch, private wait: (ms: number) => Promise<unknown> = sleep) {}
  get connected() { return !!this.tokens; }
  /** Progress identity: the hashed Builder ID subject when signed in, otherwise this browser's guest id. */
  get identity() { return this.tokens?.subject ? `builder:${this.tokens.subject}` : this.guest; }

  start(origin: string, returnTo: ReturnPath = '/') {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname) || !['8484', '8485', '8486', '8487', '8488', '8489'].includes(parsed.port)) {
      throw new AppError(400, 'AWS sign-in requires this app on a registered loopback port, 8484–8489.');
    }
    const verifier = secret();
    const state = secret();
    this.pending = { state, verifier, origin, expires: Date.now() + 5 * 60_000, returnTo: returnTo === '/map' || returnTo === '/passport' ? returnTo : '/' };
    const url = new URL(`${OAUTH}/oauth2/authorize`);
    url.search = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID,
      redirect_uri: `${origin}/callback`, scope: 'openid email events/access', identity_provider: 'AWSBuilderID',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state }).toString();
    return url.toString();
  }

  /** Where the browser should land after the callback; never taken from the callback URL itself. */
  get returnTo(): ReturnPath { return this.pending?.returnTo ?? '/'; }

  async callback(code: string, state: string, origin: string): Promise<ReturnPath> {
    const pending = this.pending;
    this.pending = undefined;
    if (!pending || pending.expires < Date.now() || pending.origin !== origin || !equalSecret(pending.state, state) || !code || code.length > 4096) {
      throw new AppError(400, 'Sign-in could not be verified. Start a new sign-in attempt.');
    }
    const epoch = ++this.epoch;
    const tokens = await this.exchange({ grant_type: 'authorization_code', code, code_verifier: pending.verifier, redirect_uri: `${origin}/callback` });
    if (epoch !== this.epoch) throw new AppError(409, 'Sign-in was superseded. Try again.');
    this.tokens = tokens;
    this.catalog = undefined;
    return pending.returnTo;
  }

  private async exchange(values: Record<string, string>): Promise<Tokens> {
    const response = await this.transport(`${OAUTH}/oauth2/token`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, ...values }),
    });
    if (!response.ok) throw new AppError(401, 'AWS sign-in expired or failed. Please sign in again.');
    const result = object(await response.json());
    const access = text(result.access_token);
    const refresh = text(result.refresh_token) ?? (values.grant_type === 'refresh_token' ? this.tokens?.refresh : undefined);
    if (!access || !refresh || typeof result.expires_in !== 'number' || result.expires_in <= 0) throw new AppError(502, 'AWS returned an unexpected sign-in response.');
    // A refresh response may omit the ID token; keep the subject established at sign-in.
    const subject = subjectHash(result.id_token) ?? (values.grant_type === 'refresh_token' ? this.tokens?.subject : undefined);
    return { access, refresh, expires: Date.now() + result.expires_in * 1000, subject };
  }

  private async refresh() {
    if (this.refreshing) return this.refreshing;
    const refreshToken = this.tokens?.refresh;
    if (!refreshToken) throw new AppError(401, 'Sign in with AWS Builder ID first.');
    const epoch = this.epoch;
    this.refreshing = (async () => {
      try {
        const tokens = await this.exchange({ grant_type: 'refresh_token', refresh_token: refreshToken });
        if (epoch !== this.epoch) throw new AppError(401, 'The connection changed. Sign in again.');
        this.tokens = tokens;
      } catch {
        if (epoch === this.epoch) this.tokens = undefined;
        throw new AppError(401, 'AWS sign-in expired. Please reconnect.');
      } finally { this.refreshing = undefined; }
    })();
    return this.refreshing;
  }

  private async request(path: string, operation: string, method = 'GET', body?: unknown, retryAuth = true, weight = 1): Promise<unknown> {
    if (!this.tokens) throw new AppError(401, 'Sign in with AWS Builder ID first.', undefined, 'signIn');
    if (this.tokens.expires <= Date.now() + 30_000) await this.refresh();
    const epoch = this.epoch;
    // Documented quotas: GetSchedule 60/min; favorites and reservations 30 session IDs/min (weighted by batch size).
    const interval = operation === 'GetSchedule' ? 1050 : /Favorite|Reserv/.test(operation) ? 2100 * weight : 550;
    const slot = Math.max(Date.now(), this.nextRequest.get(operation) ?? 0);
    this.nextRequest.set(operation, slot + interval);
    await this.wait(Math.max(0, slot - Date.now()));
    if (epoch !== this.epoch || !this.tokens) throw new AppError(401, 'The connection changed. Reconnect to continue.');
    const response = await this.transport(`${API}${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${this.tokens.access}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (epoch !== this.epoch) throw new AppError(401, 'The connection changed. Refresh this page.');
    if (response.status === 401 && retryAuth) {
      await this.refresh();
      return this.request(path, operation, method, body, false, weight);
    }
    if (!response.ok) {
      if (response.status === 401) { this.tokens = undefined; this.catalog = undefined; }
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : 60;
        this.nextRequest.set(operation, Date.now() + seconds * 1000);
        throw new AppError(429, `AWS is rate limiting requests. Wait ${seconds} seconds before trying again.`, seconds, 'throttled');
      }
      const messages: Record<number, string> = {
        401: 'AWS sign-in expired. Please reconnect.',
        403: response.headers.get('content-type')?.includes('json') ? 'This Builder ID is not registered for re:Invent 2026.' : 'The AWS edge refused this request. Wait before trying again.',
        404: 'The requested event or session was not found.',
        409: 'This AWS operation is currently closed. Try again when it opens.',
      };
      const notRegistered = response.status === 403 && Boolean(response.headers.get('content-type')?.includes('json'));
      const reason: ErrorReason | undefined = notRegistered ? 'notRegistered' : response.status === 409 ? 'closed' : response.status === 401 ? 'signIn' : undefined;
      throw new AppError(response.status, messages[response.status] ?? 'AWS could not complete this request. Refresh before retrying a change.', undefined, reason);
    }
    return response.status === 204 ? null : response.json();
  }

  async getCatalog(force = false): Promise<LiveCatalog> {
    if (!this.tokens) throw new AppError(401, 'Sign in with AWS Builder ID first.');
    if (this.loading) return this.loading;
    if (!force && this.catalog && Date.now() - Date.parse(this.catalog.refreshedAt) < 300_000) return this.catalog;
    this.loading = (async () => {
      const event = object(object(await this.request('', 'GetEvent')).event);
      const sessions = new Map<string, NonNullable<ReturnType<typeof normalizeSession>>>();
      const seen = new Set<string>();
      let token: string | undefined;
      let expectedCount = 0;
      do {
        const query = new URLSearchParams({ includeAbstracts: 'true', ...(token ? { nextToken: token } : {}) });
        const page = object(await this.request(`/sessions?${query}`, 'ListSessions'));
        if (!Array.isArray(page.items) || typeof page.totalCount !== 'number') throw new AppError(502, 'Unexpected catalog response; no partial catalog was substituted.');
        expectedCount = page.totalCount;
        for (const item of page.items) {
          const session = normalizeSession(item);
          if (!session) throw new AppError(502, 'A session has no usable identifier. Catalog loading stopped.');
          sessions.set(session.id, session);
        }
        token = text(page.nextToken);
        if (token) {
          if (seen.has(token) || seen.size >= 1000) throw new AppError(502, 'Catalog pagination did not finish normally. Please try again later.');
          seen.add(token);
        }
      } while (token);
      const result = { sessions: [...sessions.values()], expectedCount, refreshedAt: new Date().toISOString(), eventName: text(event.name) ?? 're:Invent 2026', event: normalizeEvent(event) };
      this.catalog = result;
      return result;
    })();
    try { return await this.loading; } finally { this.loading = undefined; }
  }

  async getSession(id: string) {
    if (!id || id.length > 128) throw new AppError(400, 'Invalid session identifier.');
    const result = normalizeSession(object(await this.request(`/sessions/${encodeURIComponent(id)}`, 'GetSession')).session);
    if (!result || result.id !== id) throw new AppError(502, 'Session details could not be verified.');
    return result;
  }
  async schedule(): Promise<AttendeeSchedule> { return normalizeSchedule(await this.request('/schedule', 'GetSchedule')); }

  async favorite(id: string, desired: boolean) {
    if (!this.catalog?.sessions.some((session) => session.id === id)) throw new AppError(400, 'Load the live catalog and choose a session first.');
    if (this.mutationInFlight) throw new AppError(409, 'A change is already being verified. Please wait.');
    this.mutationInFlight = true;
    try {
      const before = await this.schedule();
      if (before.favorites.includes(id) === desired) return { schedule: before, verified: true, message: 'Your schedule already has this favorite state.' };
      let warning: string | undefined;
      try {
        const raw = await this.request(desired ? '/favorites' : `/favorites/${encodeURIComponent(id)}`, desired ? 'AssociateFavorites' : 'DisassociateFavorite', desired ? 'POST' : 'DELETE', desired ? { sessionIds: [id] } : undefined);
        if (desired) {
          const result = object(object(raw).result);
          if (!Array.isArray(result.failed) || !Array.isArray(result.successful)) throw new Error('Unexpected bulk result.');
          const refused = result.failed.find((entry) => object(entry).sessionId === id);
          if (refused) warning = `AWS refused this change (${text(object(refused).code) ?? 'unknown reason'}).`;
        }
      } catch (error) {
        warning = error instanceof AppError ? error.message : 'The change response was uncertain; no write was retried.';
      }
      const schedule = await this.schedule();
      const verified = schedule.favorites.includes(id) === desired;
      return { schedule, verified, message: [warning, verified ? 'Current favorite state confirmed from GetSchedule.' : 'The requested favorite state is not present in GetSchedule.'].filter(Boolean).join(' ') };
    } finally { this.mutationInFlight = false; }
  }

  private catalogIds(ids: string[]) {
    const known = new Set(this.catalog?.sessions.map((session) => session.id));
    if (!ids.length || ids.some((id) => !known.has(id))) throw new AppError(400, 'Load the live catalog and choose sessions from it first.');
  }

  /**
   * ReserveSessions for 1–10 distinct catalog sessions. The result is read per session, then every claim is
   * checked against a fresh GetSchedule. An uncertain outcome is never re-sent: the attendee sees what is confirmed.
   */
  async reserve(requested: string[]): Promise<ReservationResult> {
    const ids = [...new Set(requested)];
    if (ids.length !== requested.length || ids.length < 1 || ids.length > 10) throw new AppError(400, 'Choose between 1 and 10 different sessions to reserve.');
    this.catalogIds(ids);
    if (this.mutationInFlight) throw new AppError(409, 'A change is already being verified. Please wait.');
    this.mutationInFlight = true;
    try {
      const before = await this.schedule();
      const toSend = ids.filter((id) => !before.reserved.includes(id));
      const failures = new Map<string, { code: string; conflictsWith?: string[] }>();
      let warning: string | undefined;
      if (toSend.length) {
        try {
          const raw = await this.request('/reservations', 'ReserveSessions', 'POST', { sessionIds: toSend }, true, toSend.length);
          const result = object(object(raw).result);
          if (!Array.isArray(result.failed) || !Array.isArray(result.successful)) throw new Error('Unexpected bulk result.');
          for (const entry of result.failed) {
            const failure = object(entry);
            const id = text(failure.sessionId);
            if (!id) continue;
            const conflicts = Array.isArray(failure.conflictsWith) ? failure.conflictsWith.filter((item): item is string => typeof item === 'string') : undefined;
            failures.set(id, { code: text(failure.code) ?? 'other', conflictsWith: conflicts?.length ? conflicts : undefined });
          }
        } catch (error) {
          // A refusal that performed no write needs no reconciliation and must not be presented as uncertain.
          if (error instanceof AppError && [400, 403, 409, 429].includes(error.status)) throw error;
          warning = error instanceof AppError ? error.message : 'The reservation response was uncertain; nothing was re-sent.';
        }
      }
      const schedule = await this.schedule();
      const results = ids.map((id): ReservationOutcome => {
        const reserved = schedule.reserved.includes(id);
        const failure = failures.get(id);
        return reserved ? { id, reserved } : { id, reserved, code: failure?.code ?? (warning ? 'unconfirmed' : 'other'), conflictsWith: failure?.conflictsWith };
      });
      const confirmed = results.filter((result) => result.reserved).length;
      return { schedule, results, verified: true, message: [warning, `${confirmed} of ${ids.length} reservations confirmed from GetSchedule.`].filter(Boolean).join(' ') };
    } finally { this.mutationInFlight = false; }
  }

  /** CancelReservation for one session. A 404 means it is already gone; GetSchedule decides what is shown. */
  async cancel(id: string): Promise<ReservationResult> {
    this.catalogIds([id]);
    if (this.mutationInFlight) throw new AppError(409, 'A change is already being verified. Please wait.');
    this.mutationInFlight = true;
    try {
      const before = await this.schedule();
      if (!before.reserved.includes(id)) return { schedule: before, results: [{ id, reserved: false }], verified: true, message: 'GetSchedule shows no reservation for this session, so nothing was cancelled.' };
      let warning: string | undefined;
      try {
        await this.request(`/reservations/${encodeURIComponent(id)}`, 'CancelReservation', 'DELETE');
      } catch (error) {
        if (error instanceof AppError && error.status === 404) warning = undefined;
        else if (error instanceof AppError && [400, 403, 409, 429].includes(error.status)) throw error;
        else warning = error instanceof AppError ? error.message : 'The cancellation response was uncertain; nothing was re-sent.';
      }
      const schedule = await this.schedule();
      const reserved = schedule.reserved.includes(id);
      return { schedule, results: [{ id, reserved, code: reserved ? 'stillReserved' : undefined }], verified: true, message: [warning, reserved ? 'GetSchedule still shows this reservation.' : 'Cancellation confirmed from GetSchedule.'].filter(Boolean).join(' ') };
    } finally { this.mutationInFlight = false; }
  }

  /** Re-read up to six sessions with GetSession to refresh their availability band, updating the cached catalog. */
  async refreshSessions(ids: string[]) {
    const unique = [...new Set(ids)].slice(0, 6);
    this.catalogIds(unique);
    const fresh: LiveSession[] = [];
    for (const id of unique) fresh.push(await this.getSession(id));
    if (this.catalog) {
      const byId = new Map(fresh.map((session) => [session.id, session]));
      this.catalog = { ...this.catalog, sessions: this.catalog.sessions.map((session) => byId.get(session.id) ?? session) };
    }
    return { sessions: fresh, refreshedAt: new Date().toISOString() };
  }

  async disconnect(origin: string) {
    // Invalidate in-flight reads/refreshes first; retain tokens on revoke failure so retry is possible.
    this.epoch++;
    this.pending = undefined;
    if (this.tokens) {
      const response = await this.transport(`${OAUTH}/oauth2/revoke`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: CLIENT_ID, token: this.tokens.refresh }) });
      if (!response.ok) throw new AppError(502, 'AWS token revocation failed. Retry disconnect; it has not been reported as complete.');
    }
    this.tokens = undefined;
    this.catalog = undefined;
    const inner = new URL(`${OAUTH}/logout`);
    inner.search = new URLSearchParams({ client_id: CLIENT_ID, logout_uri: `${origin}/logout` }).toString();
    const logout = new URL('https://idp.awsevents.com/oidc/logout');
    logout.searchParams.set('redirect_uri', inner.toString());
    return logout.toString();
  }
}
