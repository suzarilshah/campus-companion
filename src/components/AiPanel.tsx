import { useId, useState } from 'react';
import type { AiAnswer, AiMode } from '../domain/ai';
import type { AttendeeClient } from '../domain/attendeeClient';
import type { VenueId } from '../scene/venues';
import { SessionActions, SessionState, type Tray } from './Booking';
import './ai.css';

const copy: Record<Exclude<AiMode, 'tldr'>, { title: string; hint: string; placeholder: string; examples: string[]; button: string }> = {
  concierge: { title: 'Plan my day with AI', hint: 'Describe what you want. Suggestions come only from your loaded catalog, skip sessions you’ve reserved or that clash, and nothing is booked until you review it.', placeholder: 'e.g. Beginner-friendly generative AI, Tuesday afternoon', examples: ['Hands-on serverless workshops', 'Security for AI agents, advanced', 'Something about cost optimization'], button: 'Suggest sessions' },
  guide: { title: 'Ask the building guide', hint: 'Answers use only this building’s sessions.', placeholder: 'e.g. What’s good here for a data engineer?', examples: ['Beginner sessions here', 'Anything on containers?'], button: 'Ask' },
  gaps: { title: 'Fill my free time', hint: 'Finds sessions that fit the gaps between your reservations on a day. Times come from the catalog, not the AI.', placeholder: 'Optional: what you’re interested in', examples: [], button: 'Find sessions for my gaps' },
};

/** One panel for the concierge, the building guide and gap filling. Picks reuse the normal review-and-confirm actions. */
export function AiPanel({ client, tray, mode, venueId, days = [], compact = false }: { client: AttendeeClient; tray: Tray; mode: Exclude<AiMode, 'tldr'>; venueId?: VenueId; days?: string[]; compact?: boolean }) {
  const text = copy[mode];
  const id = useId();
  const [question, setQuestion] = useState('');
  const [day, setDay] = useState('');
  const [answer, setAnswer] = useState<AiAnswer>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (!client.connection?.connected || !client.catalog) return null;
  const byId = new Map(client.catalog.sessions.map((session) => [session.id, session]));
  async function submit(value = question) {
    setPending(true); setError('');
    try { setAnswer(await client.ask({ mode, question: value.trim() || undefined, day: day || undefined, venueId })); } catch (cause) { setError(cause instanceof Error ? cause.message : 'AI suggestions are unavailable.'); setAnswer(undefined); }
    setPending(false);
  }
  return <section className={`ai-panel${compact ? ' compact' : ''}`} aria-labelledby={`${id}-title`}>
    <header><span className="ai-badge" aria-hidden="true">AI</span><h2 id={`${id}-title`}>{text.title}</h2></header>
    <p className="ai-hint">{text.hint}</p>
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className="sr-only" htmlFor={`${id}-q`}>{text.title}</label>
      <input id={`${id}-q`} value={question} maxLength={300} onChange={(event) => setQuestion(event.target.value)} placeholder={text.placeholder} autoComplete="off" />
      {mode !== 'guide' && days.length ? <><label className="sr-only" htmlFor={`${id}-day`}>{mode === 'gaps' ? 'Day to fill' : 'Day for AI suggestions'}</label><select id={`${id}-day`} value={day} onChange={(event) => setDay(event.target.value)}><option value="">{mode === 'gaps' ? 'First day with reservations' : 'Any day'}</option>{days.map((item) => <option key={item}>{item}</option>)}</select></> : null}
      <button className="ai-submit" disabled={pending}>{pending ? 'Thinking…' : text.button}</button>
    </form>
    {text.examples.length && !answer ? <div className="ai-examples" aria-label="Example questions">{text.examples.map((example) => <button key={example} type="button" disabled={pending} onClick={() => { setQuestion(example); void submit(example); }}>{example}</button>)}</div> : null}
    <p className="ai-status" role="status">{pending ? 'Asking the model about your shortlisted sessions…' : error}</p>
    {answer ? <div className="ai-results">
      <p className="ai-meta">{answer.fallback ? 'Keyword matches' : `Suggested by ${answer.provider}`} · from {answer.shortlisted} shortlisted session{answer.shortlisted === 1 ? '' : 's'}{answer.dropped ? ` · ${answer.dropped} unverifiable suggestion${answer.dropped === 1 ? '' : 's'} removed` : ''}</p>
      {answer.note ? <p className="ai-note">{answer.note}</p> : null}
      <ol>{answer.picks.map((pick) => { const session = byId.get(pick.id); if (!session) return null; return <li key={pick.id}>
        <small>{pick.gap ? `Free ${pick.gap} · ` : ''}{session.date ?? 'Date not provided'} · {session.allDay ? 'All day' : session.time ?? 'Time not provided'} · {session.venue ?? 'Venue not provided'}</small>
        <strong>{session.title}</strong>
        <span className="ai-reason"><span aria-hidden="true">✦ </span>{pick.reason}</span>
        <SessionState session={session} client={client} />
        <SessionActions session={session} client={client} tray={tray} />
      </li>; })}</ol>
      <p className="ai-fine">AI can be wrong. Session details above come from the AWS Events API; AI wrote only the ✦ reasons. Nothing is reserved or favorited until you review and confirm.</p>
    </div> : null}
  </section>;
}

/** Three-bullet summary of one session's abstract. */
export function AiSummary({ client, sessionId }: { client: AttendeeClient; sessionId: string }) {
  const [answer, setAnswer] = useState<AiAnswer>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (!client.connection?.connected) return null;
  return <div className="ai-summary">
    {answer?.bullets ? <><p className="ai-meta"><span className="ai-badge" aria-hidden="true">AI</span> Summary by {answer.provider} — check the full abstract</p><ul>{answer.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>{answer.audience ? <p className="ai-audience"><b>For:</b> {answer.audience}</p> : null}</>
      : <button className="ai-ghost" disabled={pending} onClick={() => { setPending(true); setError(''); client.ask({ mode: 'tldr', sessionId }).then(setAnswer, (cause) => setError(cause instanceof Error ? cause.message : 'Unavailable.')).finally(() => setPending(false)); }}><span className="ai-badge" aria-hidden="true">AI</span> {pending ? 'Summarising…' : 'Summarise this session'}</button>}
    {answer && !answer.bullets ? <p className="ai-note">{answer.note}</p> : null}
    <p className="ai-status" role="status">{error}</p>
  </div>;
}
