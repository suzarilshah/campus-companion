import { useId, useState } from 'react';
import { placeById } from '../scene/places';
import { venues } from '../scene/venues';
import { plazaOf } from '../scene/venues';
import type { GuideAnswer } from '../domain/guide';
import './ai.css';

type Turn = { question: string; answer?: GuideAnswer; error?: string };
const examples = ['Where is the opening keynote?', 'How do I earn passport stamps?', 'Which venues have self-paced learning?'];

function spotOf(id: string): [number, number] | undefined {
  const venue = venues.find((item) => `venue-${item.id}` === id);
  if (venue) { const [x, , z] = plazaOf(venue); return [x, z]; }
  const place = placeById.get(id);
  return place ? [place.spot[0], place.spot[2]] : undefined;
}
const nameOf = (id: string) => venues.find((item) => `venue-${item.id}` === id)?.name ?? placeById.get(id)?.name ?? id;

/** The public Strip guide. Answers only about this site's venues, globe and passport; the server enforces quotas. */
export function GuideChat({ onMap = false, compact = false }: { onMap?: boolean; compact?: boolean }) {
  const id = useId();
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  async function ask(value: string) {
    const text = value.trim();
    if (text.length < 3 || pending) return;
    setPending(true); setQuestion('');
    let turn: Turn = { question: text };
    try {
      const response = await fetch('/api/guide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text }), credentials: 'same-origin', cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      turn = response.ok ? { question: text, answer: body as GuideAnswer } : { question: text, error: typeof body.error === 'string' ? body.error : 'The Strip guide is unavailable right now.' };
    } catch { turn = { question: text, error: 'The Strip guide is unavailable right now.' }; }
    setTurns((previous) => [...previous, turn].slice(-3));
    setPending(false);
  }
  return <section className={`ai-panel guide-chat${compact ? ' compact' : ''}`} aria-labelledby={`${id}-title`}>
    <header><span className="ai-badge" aria-hidden="true">AI</span><h2 id={`${id}-title`}>Ask the Strip guide</h2></header>
    <p className="ai-hint">Questions about the six venues, the globe, the passport or using this site. It knows only Campus Companion’s published facts: no session times or rooms.</p>
    <ol className="guide-turns" aria-live="polite">{turns.map((turn, index) => <li key={index}>
      <p className="guide-q"><span className="sr-only">You asked: </span>{turn.question}</p>
      {turn.error ? <p className="ai-status">{turn.error}</p> : turn.answer ? <>
        <p className={`guide-a${turn.answer.refused ? ' refused' : ''}`}><span aria-hidden="true">✦ </span>{turn.answer.answer}</p>
        {turn.answer.places.length ? <div className="guide-places">{turn.answer.places.map((placeId) => {
          const spot = spotOf(placeId);
          return onMap && spot ? <button key={placeId} type="button" onClick={() => window.dispatchEvent(new CustomEvent('campus-goto', { detail: { x: spot[0], z: spot[1] } }))}>Walk to {nameOf(placeId)} →</button>
            : <a key={placeId} href="/map">{nameOf(placeId)} on the globe →</a>;
        })}</div> : null}
      </> : null}
    </li>)}</ol>
    <form onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
      <label className="sr-only" htmlFor={`${id}-q`}>Ask the Strip guide</label>
      <input id={`${id}-q`} value={question} maxLength={280} onChange={(event) => setQuestion(event.target.value)} placeholder="e.g. Where can I pick up my badge?" autoComplete="off" />
      <button className="ai-submit" disabled={pending || question.trim().length < 3}>{pending ? 'Thinking…' : 'Ask'}</button>
    </form>
    {!turns.length ? <div className="ai-examples" aria-label="Example questions">{examples.map((example) => <button key={example} type="button" disabled={pending} onClick={() => void ask(example)}>{example}</button>)}</div> : null}
    <p className="ai-fine">AI (Kimi K2.5 on Amazon Bedrock) can be wrong; check official AWS pages. Limited to a few questions per visitor. Questions are not stored.</p>
  </section>;
}
