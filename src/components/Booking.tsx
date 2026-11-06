import { useEffect, useState } from 'react';
import type { LiveSession } from '../domain/live';
import { REGISTRATION_URL, type AttendeeClient, type Reason } from '../domain/attendeeClient';
import { clashes, describeFailure } from '../domain/planning';
import { describeAvailability } from '../domain/mapData';
import './booking.css';

/** Per AWS docs: reserved seating opens Oct 6, 2026, but through this API only on Oct 8; until then it returns 409. */
export const API_RESERVATIONS_OPEN = '2026-10-08';
export const reservationsNotice = () => new Date().toISOString().slice(0, 10) < API_RESERVATIONS_OPEN
  ? 'Per the AWS Events API guide, reserving through the API opens on 8 October 2026. Until then AWS answers 409 and nothing is booked. Browsing and favorites work now.'
  : undefined;

const TRAY_KEY = 'campus-reservation-tray';
/** The review tray is a per-tab convenience (sessionStorage), shared between the planning desk and the map. */
export function useTray() {
  const [tray, setTray] = useState<string[]>(() => {
    try { const raw = JSON.parse(sessionStorage.getItem(TRAY_KEY) ?? '[]'); return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string').slice(0, 10) : []; } catch { return []; }
  });
  useEffect(() => { try { sessionStorage.setItem(TRAY_KEY, JSON.stringify(tray)); } catch { /* Storage can be unavailable. */ } }, [tray]);
  return {
    tray,
    has: (id: string) => tray.includes(id),
    toggle: (id: string) => setTray((items) => items.includes(id) ? items.filter((item) => item !== id) : items.length >= 10 ? items : [...items, id]),
    remove: (ids: string[]) => setTray((items) => items.filter((item) => !ids.includes(item))),
    clear: () => setTray([]),
  };
}
export type Tray = ReturnType<typeof useTray>;

/** Explains the outcomes that need a different next step instead of a retry. */
export function ConnectionHelp({ client, returnTo }: { client: AttendeeClient; returnTo: '/' | '/map' | '/passport' }) {
  const reason: Reason | undefined = client.reason;
  if (reason === 'notRegistered') return <div className="bk-help" role="alert">
    <strong>You are signed in, but this Builder ID is not registered for re:Invent 2026.</strong>
    <p>The Events API cannot register you (AWS: “It does not register you for an event”). Register on the official site with the <em>same</em> Builder ID, then come back — signing in again will not help until registration is complete.</p>
    <ol><li><a href={REGISTRATION_URL} target="_blank" rel="noreferrer">Open official re:Invent registration ↗</a></li><li>Finish registering with this Builder ID.</li><li><button className="bk-primary" disabled={client.busy} onClick={() => void client.load(true)}>I’ve registered — check again</button></li></ol>
  </div>;
  if (reason === 'signIn') return <div className="bk-help" role="alert"><strong>Your AWS sign-in has ended.</strong><p>Sign in again to continue; nothing was changed.</p><button className="bk-primary" disabled={client.busy} onClick={() => void client.connect(returnTo)}>Sign in with AWS Builder ID ↗</button></div>;
  if (reason === 'closed') return <div className="bk-help" role="status"><strong>AWS says this operation is currently closed (409).</strong><p>No change was made and nothing will be retried automatically. {reservationsNotice() ?? 'Try again later.'}</p></div>;
  if (reason === 'throttled') return <div className="bk-help" role="status"><strong>AWS asked us to slow down (429).</strong><p>{client.error}</p></div>;
  return null;
}

/** Status chips that keep favorited, reserved, walk-up and unavailable distinct. */
export function SessionState({ session, client }: { session: LiveSession; client: AttendeeClient }) {
  const reserved = client.schedule?.reserved.includes(session.id);
  const favorite = client.schedule?.favorites.includes(session.id);
  const availability = describeAvailability(session.availability);
  return <span className="bk-state">
    {reserved ? <b className="bk-reserved">★ Reserved</b> : null}
    {favorite ? <b className="bk-favorite">♥ Favorited</b> : null}
    {availability ? <span className={`bk-seat bk-seat-${session.availability}`}>{availability}</span> : null}
    {session.reservable === false ? <span className="bk-seat">Not reservable</span> : null}
  </span>;
}

/** Favorite, add-to-tray, and cancel controls, each with an explicit review step. */
export function SessionActions({ session, client, tray }: { session: LiveSession; client: AttendeeClient; tray: Tray }) {
  const [review, setReview] = useState<'favorite' | 'cancel'>();
  if (!client.schedule) return null;
  const reserved = client.schedule.reserved.includes(session.id);
  const favorite = client.schedule.favorites.includes(session.id);
  // `unavailable` is the API's "no seats" band: offer a seat re-check instead of a doomed reservation.
  const reservable = session.reservable !== false && session.availability !== 'walkUp' && session.availability !== 'unavailable';
  if (review) return <span className="bk-confirm" role="group" aria-label={review === 'favorite' ? 'Review favorite change' : 'Review cancellation'}>
    <span>{review === 'favorite' ? `${favorite ? 'Remove from' : 'Add to'} your real AWS favorites? A favorite is not a seat.` : `Cancel your real reservation for “${session.title}”? You may not get the seat back.`}</span>
    <button className="bk-primary" disabled={client.busy} onClick={() => { void (review === 'favorite' ? client.favorite(session.id, !favorite) : client.cancel(session.id)); setReview(undefined); }}>{review === 'favorite' ? 'Confirm favorite change' : 'Confirm cancellation'}</button>
    <button disabled={client.busy} onClick={() => setReview(undefined)}>Keep as is</button>
  </span>;
  return <span className="bk-actions">
    <button className="bk-link" disabled={client.busy} onClick={() => setReview('favorite')}>{favorite ? 'Review removing favorite' : 'Review adding favorite'}</button>
    {reserved
      ? <button className="bk-link bk-danger" disabled={client.busy} onClick={() => setReview('cancel')}>Review cancelling reservation</button>
      : reservable ? <button className="bk-link" aria-pressed={tray.has(session.id)} disabled={client.busy || (!tray.has(session.id) && tray.tray.length >= 10)} onClick={() => tray.toggle(session.id)}>{tray.has(session.id) ? '✓ In reservation tray' : '+ Add to reservation tray'}</button>
        : <span className="bk-note">{session.availability === 'walkUp' ? 'Walk-up: no reservation taken' : session.availability === 'unavailable' ? 'No seats available right now — re-check seats later' : 'No reservation offered'}</span>}
  </span>;
}

/** Review up to ten sessions, see local clash hints, confirm once, then see per-session results from GetSchedule. */
export function ReservationTray({ client, tray, compact = false }: { client: AttendeeClient; tray: Tray; compact?: boolean }) {
  const [reviewing, setReviewing] = useState(false);
  const sessions = client.catalog?.sessions ?? [];
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const items = tray.tray.map((id) => byId.get(id)).filter((session): session is LiveSession => Boolean(session));
  const reserved = sessions.filter((session) => client.schedule?.reserved.includes(session.id));
  const notice = reservationsNotice();
  const outcomes = client.outcomes.filter((outcome) => byId.has(outcome.id));
  if (!client.schedule || (!items.length && !outcomes.length)) return null;
  async function submit() {
    const results = await client.reserve(items.map((item) => item.id));
    setReviewing(false);
    if (results) tray.remove(results.filter((result) => result.reserved).map((result) => result.id));
  }
  return <section className={`bk-tray ${compact ? 'bk-compact' : ''}`} aria-label="Reservation tray">
    <header><strong>Reservation tray · {items.length}/10</strong>{items.length ? <button className="bk-link" onClick={() => { tray.clear(); setReviewing(false); }}>Clear</button> : null}</header>
    {notice ? <p className="bk-note">{notice}</p> : null}
    <ul>{items.map((session) => {
      const hints = clashes(session, [...reserved, ...items]);
      return <li key={session.id}><span><b>{session.title}</b><small>{session.date ?? 'Date not provided'} · {session.time ?? 'time not provided'} · {session.venue ?? 'venue not provided'}</small>{hints.length ? <em className="bk-clash">Possible clash by listed local time with {hints.map((hint) => hint.title).join(', ')}. AWS decides.</em> : null}</span><button aria-label={`Remove ${session.title} from tray`} onClick={() => tray.toggle(session.id)}>×</button></li>;
    })}</ul>
    {items.length ? reviewing ? <div className="bk-confirm" role="group" aria-label="Review reservations">
      <span>Reserve {items.length} real seat{items.length === 1 ? '' : 's'} on your AWS account? AWS answers per session; the result is then checked with GetSchedule.</span>
      <button className="bk-primary" disabled={client.busy} onClick={() => void submit()}>Confirm {items.length} reservation{items.length === 1 ? '' : 's'}</button>
      <button disabled={client.busy} onClick={() => setReviewing(false)}>Keep reviewing</button>
    </div> : <button className="bk-primary bk-wide" disabled={client.busy} onClick={() => setReviewing(true)}>Review reservations</button> : null}
    {outcomes.length ? <div className="bk-results" role="status" aria-label="Reservation results"><strong>Last result, confirmed from GetSchedule</strong><ul>{outcomes.map((outcome) => <li key={outcome.id} className={outcome.reserved ? 'ok' : 'no'}>{outcome.reserved ? '✓' : '✕'} {byId.get(outcome.id)?.title ?? outcome.id}{outcome.reserved ? null : <small>{describeFailure(outcome.code)}{outcome.conflictsWith?.length ? ` Clashes with: ${outcome.conflictsWith.map((id) => byId.get(id)?.title ?? id).join(', ')}.` : ''}</small>}</li>)}</ul><button className="bk-link" onClick={client.clearOutcomes}>Dismiss</button></div> : null}
  </section>;
}

/** Floating EXP pop-ups for newly granted awards. */
export function ExpToast({ client }: { client: AttendeeClient }) {
  const { toast, clearToast } = client;
  useEffect(() => { if (!toast.length) return; const id = window.setTimeout(clearToast, 4200); return () => window.clearTimeout(id); }, [toast, clearToast]);
  if (!toast.length) return null;
  return <div className="bk-toast" role="status" aria-live="polite">{toast.map((item) => <span key={item.key}><b>+{item.exp} EXP</b> {item.label}</span>)}</div>;
}
