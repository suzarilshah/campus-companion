import { useCallback, useEffect, useRef, useState } from 'react';
import type { AttendeeSchedule, LiveCatalog, LiveSession } from './live';
import type { ProgressView } from './progress';
import { HOSTED, hostedAward, hostedView } from './hosted';
import type { AiAnswer, AiRequest } from './ai';

/**
 * One client for the local attendee server, used by both the planning desk and the map so they show the same
 * connection, catalog, schedule, reservations and EXP. Tokens never reach the browser; only the local server holds them.
 */
export type Reason = 'notRegistered' | 'closed' | 'signIn' | 'throttled';
export type Outcome = { id: string; reserved: boolean; code?: string; conflictsWith?: string[] };
type Local = { connected: boolean; csrf: string };

export class LocalError extends Error {
  constructor(message: string, public reason?: Reason) { super(message); }
}

async function call<T>(path: string, csrf?: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin', cache: 'no-store', method: csrf ? 'POST' : 'GET',
    headers: csrf ? { 'Content-Type': 'application/json', 'X-Campus-Csrf': csrf } : undefined,
    body: csrf ? JSON.stringify(body ?? {}) : undefined,
  });
  let result: { error?: unknown; reason?: Reason } & Record<string, unknown> = {};
  try { result = await response.json(); } catch { /* Edge errors can be empty or HTML. */ }
  if (!response.ok) throw new LocalError(typeof result.error === 'string' ? result.error : 'The local request failed.', result.reason);
  return result as T;
}

export const REGISTRATION_URL = 'https://registration.awsevents.com/flow/awsevents/reinvent2026/reg';
const FOCUS_REFRESH_MS = 60_000;

export function useAttendee() {
  const [connection, setConnection] = useState<Local>();
  const [catalog, setCatalog] = useState<LiveCatalog>();
  const [schedule, setSchedule] = useState<AttendeeSchedule>();
  const [scheduleAt, setScheduleAt] = useState<number>();
  const [progress, setProgress] = useState<ProgressView>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reason, setReason] = useState<Reason>();
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [toast, setToast] = useState<ProgressView['recent']>([]);
  const csrf = useRef('');

  const absorb = useCallback((view?: ProgressView) => {
    if (!view) return;
    setProgress(view);
    // Stack pop-ups so quick successive awards (e.g. a ride, then the stop you land on) are all seen.
    if (view.recent.length) setToast((items) => [...items.filter((item) => !view.recent.some((fresh) => fresh.key === item.key)), ...view.recent].slice(-4));
  }, []);

  useEffect(() => {
    let active = true;
    // Hosted preview: there is no local server, so no session, no sign-in and browser-only exploration EXP.
    if (HOSTED) { setConnection({ connected: false, csrf: '' }); setProgress(hostedView()); return () => { active = false; }; }
    // The session call sets the browser cookie, so progress is read only after it resolves.
    call<Local>('/api/attendee/session').then((value) => {
      if (!active) return;
      setConnection(value); csrf.current = value.csrf;
      call<ProgressView>('/api/progress').then((view) => { if (active) setProgress(view); }).catch(() => undefined);
    }).catch(() => { if (active) setError('The local connection service is unavailable. Start the app locally to connect an attendee account.'); });
    if (new URLSearchParams(location.search).get('connection') === 'failed') setError('Sign-in could not be verified. Please start a fresh sign-in attempt.');
    return () => { active = false; };
  }, []);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true); setError(''); setReason(undefined);
    try { return await action(); } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.');
      setReason(cause instanceof LocalError ? cause.reason : undefined);
      try {
        const state = await call<Local>('/api/attendee/session');
        setConnection(state); csrf.current = state.csrf;
        if (!state.connected) { setCatalog(undefined); setSchedule(undefined); }
      } catch { /* Keep the original error. */ }
      return undefined;
    } finally { setBusy(false); }
  }, []);

  const load = useCallback((force = false) => run(async () => {
    const [nextCatalog, nextSchedule] = await Promise.all([
      call<LiveCatalog>(`/api/attendee/catalog${force ? '?refresh=true' : ''}`),
      call<AttendeeSchedule>('/api/attendee/schedule'),
    ]);
    setCatalog(nextCatalog); setSchedule(nextSchedule); setScheduleAt(Date.now());
    setMessage(`Loaded ${nextCatalog.sessions.length} sessions and your current schedule.`);
  }), [run]);

  const refreshSchedule = useCallback(() => run(async () => {
    setSchedule(await call<AttendeeSchedule>('/api/attendee/schedule')); setScheduleAt(Date.now());
  }), [run]);

  // Re-read GetSchedule when the attendee returns to the tab (e.g. after booking elsewhere), at most once a minute.
  useEffect(() => {
    const onFocus = () => { if (schedule && !busy && Date.now() - (scheduleAt ?? 0) > FOCUS_REFRESH_MS) void refreshSchedule(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [schedule, scheduleAt, busy, refreshSchedule]);

  /** GetSession for up to six sessions to refresh their seat-availability band. Never loops. */
  const refreshSeats = useCallback((ids: string[]) => run(async () => {
    const result = await call<{ sessions: LiveSession[] }>(`/api/attendee/sessions?ids=${ids.slice(0, 6).map(encodeURIComponent).join(',')}`);
    const fresh = new Map(result.sessions.map((session) => [session.id, session]));
    setCatalog((previous) => previous && { ...previous, sessions: previous.sessions.map((session) => fresh.get(session.id) ?? session) });
    setMessage(`Seat availability re-read for ${result.sessions.length} session${result.sessions.length === 1 ? '' : 's'} with GetSession.`);
  }), [run]);

  const inspect = useCallback((id: string) => run(async () => {
    const session = await call<LiveSession>(`/api/attendee/session/${encodeURIComponent(id)}`);
    setCatalog((previous) => previous && { ...previous, sessions: previous.sessions.map((item) => item.id === id ? session : item) });
    call<ProgressView>('/api/progress/award', csrf.current, { key: `inspect:${id}` }).then(absorb).catch(() => undefined);
    return session;
  }), [run, absorb]);

  const favorite = useCallback((id: string, desired: boolean) => run(async () => {
    const result = await call<{ schedule: AttendeeSchedule; message: string; progress?: ProgressView }>('/api/attendee/favorite', csrf.current, { id, desired, confirmed: true });
    setSchedule(result.schedule); setScheduleAt(Date.now()); setMessage(result.message); absorb(result.progress);
  }), [run, absorb]);

  const reserve = useCallback((ids: string[]) => run(async () => {
    const result = await call<{ schedule: AttendeeSchedule; results: Outcome[]; message: string; progress?: ProgressView }>('/api/attendee/reserve', csrf.current, { ids, confirmed: true });
    setSchedule(result.schedule); setScheduleAt(Date.now()); setOutcomes(result.results); setMessage(result.message); absorb(result.progress);
    return result.results;
  }), [run, absorb]);

  const cancel = useCallback((id: string) => run(async () => {
    const result = await call<{ schedule: AttendeeSchedule; results: Outcome[]; message: string }>('/api/attendee/cancel', csrf.current, { id, confirmed: true });
    setSchedule(result.schedule); setScheduleAt(Date.now()); setOutcomes(result.results); setMessage(result.message);
  }), [run]);

  const connect = useCallback((returnTo: '/' | '/map' | '/passport') => run(async () => {
    if (HOSTED) throw new LocalError('AWS sign-in only works when this app runs on your own computer. See the GitHub README to run it locally.');
    const result = await call<{ url: string }>('/api/attendee/connect', csrf.current, { returnTo });
    window.location.assign(result.url);
  }), [run]);

  const disconnect = useCallback(() => run(async () => {
    const result = await call<{ logoutUrl: string }>('/api/attendee/disconnect', csrf.current);
    setCatalog(undefined); setSchedule(undefined); setConnection((previous) => previous && { ...previous, connected: false });
    setMessage('Refresh token revoked and local credentials cleared. Browser-wide Builder ID sign-out is optional below.');
    return result.logoutUrl;
  }), [run]);

  /** Exploration awards (discovery, shuttle ride). The server validates the key and decides the EXP. */
  const award = useCallback((key: string) => {
    if (HOSTED) { absorb(hostedAward(key)); return; }
    if (!csrf.current) return;
    call<ProgressView>('/api/progress/award', csrf.current, { key }).then(absorb).catch(() => undefined);
  }, [absorb]);

  /** AI suggestions from the local server. Never writes: picks only feed the existing review flows. */
  const ask = useCallback(async (request: AiRequest) => {
    if (HOSTED) throw new LocalError('AI suggestions run in the local app, after you sign in and load your catalog.');
    return call<AiAnswer>('/api/ai/ask', csrf.current, request);
  }, []);

  return {
    ask,
    connection, catalog, schedule, scheduleAt, progress, busy, message, error, reason, outcomes, toast,
    setMessage, clearToast: () => setToast([]), clearOutcomes: () => setOutcomes([]),
    load, refreshSchedule, refreshSeats, inspect, favorite, reserve, cancel, connect, disconnect, award,
  };
}
export type AttendeeClient = ReturnType<typeof useAttendee>;
