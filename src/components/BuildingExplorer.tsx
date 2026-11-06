import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { LiveSession } from '../domain/live';
import { buildIndoor, checkpointsTo } from '../domain/indoor';
import type { AttendeeClient } from '../domain/attendeeClient';
import { SessionActions, SessionState, type Tray } from './Booking';
import { venueIdForName, venues, type VenueId } from '../scene/venues';
import { ChunkBoundary } from './ChunkBoundary';
import './explorer.css';

const BuildingCanvas = lazy(() => import('../scene/BuildingCanvas'));

/** Official Expo zones (2026 Expo page). Their position inside the Expo and its level are not published. */
const EXPO_URL = 'https://aws.amazon.com/events/reinvent/experiences/expo/';
const SPONSORS_URL = 'https://registration.awsevents.com/flow/awsevents/reinvent2026/sponsorcatalog/page/sponsors';
const expoZones = [
  { name: 'AWS Village', color: '#ff9f43' }, { name: 'Lightning Theaters', color: '#ffd166' }, { name: 'AWS for Industries Zone', color: '#4cc9f0' },
  { name: 'Builder Community Zone', color: '#06d6a0' }, { name: 'Global Impact Zone', color: '#90be6d' }, { name: 'Partner Advantage Zone', color: '#c77dff' },
];

const when = (session: LiveSession) => [session.date?.slice(5), session.allDay ? 'all day' : session.time].filter(Boolean).join(' · ') || 'time not provided';

export function BuildingExplorer({ venueId, client, tray, initialSession, atBuilding, onClose, onTravel }: {
  venueId: VenueId; client: AttendeeClient; tray: Tray; initialSession?: string; atBuilding: boolean;
  onClose: () => void; onTravel: () => void;
}) {
  const venue = venues.find((item) => item.id === venueId)!;
  const sessions = useMemo(() => (client.catalog?.sessions ?? []).filter((session) => venueIdForName(session.venue) === venueId), [client.catalog, venueId]);
  const model = useMemo(() => buildIndoor(sessions), [sessions]);
  const formats = useMemo(() => [...new Set(sessions.map((session) => session.format).filter((format): format is string => Boolean(format)))].sort().slice(0, 6), [sessions]);
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState<string>();
  const [active, setActive] = useState<number | 'all'>('all');
  const [room, setRoom] = useState<string>();
  const [chosen, setChosen] = useState<string | undefined>(initialSession);
  const [step, setStep] = useState(0);
  const labelRef = useRef<HTMLDivElement>(null);
  const session = sessions.find((item) => item.id === chosen);
  const steps = useMemo(() => (session ? checkpointsTo(session, venue.name, atBuilding) : []), [session, venue.name, atBuilding]);
  const extra = venueId === 'venetian' ? { label: 'Expo · level not published', zones: expoZones } : undefined;

  useEffect(() => {
    if (!session?.room) return;
    setRoom(session.room);
    const index = model.floors.findIndex((floor) => floor.rooms.some((item) => item.name === session.room));
    if (index >= 0) setActive(index);
  }, [session, model.floors]);
  useEffect(() => { setStep(0); }, [chosen]);
  // Modal dialog behaviour: focus moves to the heading, Tab stays inside, Escape closes, focus returns to the opener.
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>('h2')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const keep = dialogRef.current?.querySelector<HTMLButtonElement>('.bk-confirm button:last-of-type');
        if (keep) { keep.click(); return; }
        onClose(); return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button, a[href], input, select, [tabindex="0"]')].filter((element) => !element.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); opener?.focus(); };
  }, [onClose]);

  const needle = query.trim().toLocaleLowerCase();
  const matches = sessions.filter((item) => (!format || item.format === format) && (!needle || [item.title, item.room, item.abbreviation, ...(item.speakers ?? [])].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle)));
  const roomSessions = room ? sessions.filter((item) => item.room?.trim() === room) : [];
  const current = steps[step];

  return <section ref={dialogRef} className="explorer" role="dialog" aria-modal="true" aria-label={`${venue.name} explorer`} style={{ '--accent': venue.accent } as React.CSSProperties}>
    <header className="ex-head">
      <div><span className="ex-eyebrow">INSIDE THE BUILDING · ROOMS FROM THE AWS EVENTS API</span><h2 tabIndex={-1}>{venue.name} <em>explorer</em></h2></div>
      <button className="ex-close" onClick={onClose} aria-label="Close building explorer">×</button>
    </header>
    <aside className="ex-side">
      {!client.catalog ? <p className="ex-note">Sign in and load your catalog to see which rooms and floors are used here. Nothing is shown until real data arrives.</p> : <>
        <label className="ex-search"><span className="sr-only">Search rooms and sessions</span><input type="search" placeholder="Search a room, session or speaker…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        {formats.length ? <div className="ex-chips" role="group" aria-label="Session format"><button aria-pressed={!format} onClick={() => setFormat(undefined)}>All</button>{formats.map((item) => <button key={item} aria-pressed={format === item} onClick={() => setFormat(format === item ? undefined : item)}>{item}</button>)}</div> : null}
        <p className="ex-count">{matches.length} of {model.sessions} sessions · {model.floors.reduce((sum, floor) => sum + floor.rooms.length, 0)} rooms</p>
        <ul className="ex-list">{matches.slice(0, 40).map((item) => <li key={item.id}><button aria-pressed={chosen === item.id} onClick={() => setChosen(item.id)}><b>{item.title}</b><small>{when(item)} · {item.room ?? 'room not listed'}</small></button></li>)}</ul>
        {matches.length > 40 ? <p className="ex-note">Showing 40. Narrow the search to see more.</p> : null}
      </>}
    </aside>
    <div className="ex-stage">
      {client.catalog && model.floors.length + (extra ? 1 : 0) > 0 ? <>
        <ChunkBoundary label="The building view" compact><Suspense fallback={<p className="ex-note ex-center">Stacking the floors…</p>}><BuildingCanvas floors={model.floors} extra={extra} active={active} selectedRoom={room} accent={venue.accent} onSelectRoom={(name) => { setRoom(name); setChosen(undefined); }} labelRef={labelRef} /></Suspense></ChunkBoundary>
        <div ref={labelRef} className="ex-pin-label" aria-hidden="true">{room}</div>
        <nav className="ex-floors" aria-label="Floors">
          <button aria-pressed={active === 'all'} onClick={() => setActive('all')}>All</button>
          {[...model.floors.map((floor) => floor.level === null ? '?' : String(floor.level)), ...(extra ? ['Expo'] : [])].map((label, index) => <button key={`${label}-${index}`} aria-pressed={active === index} aria-label={index < model.floors.length ? model.floors[index]!.label : extra!.label} onClick={() => setActive(index)}>{label}</button>).reverse()}
        </nav>
        <p className="ex-legend">Floors and room names: AWS Events API. Room positions on each floor are illustrative. {extra ? <>Expo zones: <a href={EXPO_URL} target="_blank" rel="noreferrer">official Expo page ↗</a>; booth numbers are not published yet (<a href={SPONSORS_URL} target="_blank" rel="noreferrer">sponsor catalog ↗</a>).</> : null}</p>
      </> : <p className="ex-note ex-center">{client.catalog ? `The loaded catalog has no room data for ${venue.name}.` : 'Your building view appears here after you sign in.'}</p>}
      {room && !session && roomSessions.length ? <div className="ex-room" role="region" aria-label={`Sessions in ${room}`}><strong>{room}</strong><ul>{roomSessions.slice(0, 6).map((item) => <li key={item.id}><button onClick={() => setChosen(item.id)}>{when(item)} · {item.title}</button></li>)}</ul></div> : null}
      {session && current ? <div className="ex-step" role="status" aria-label="Your next stop">
        <span className="ex-step-num">{String(step + 1).padStart(2, '0')}</span>
        <span className="ex-eyebrow">STEP {step + 1} OF {steps.length}</span>
        <strong>{current.title}</strong>
        <p>{current.detail}</p>
        {step === steps.length - 1 ? <div className="ex-final"><SessionState session={session} client={client} /><SessionActions session={session} client={client} tray={tray} /></div> : null}
        <div className="ex-step-actions">
          {current.action === 'travel' ? <button className="ex-primary" onClick={onTravel}>Take me there on the globe</button> : null}
          {step < steps.length - 1 ? <button className={current.action === 'travel' ? '' : 'ex-primary'} onClick={() => setStep(step + 1)}>I’m at this checkpoint ✓</button> : <button onClick={() => setChosen(undefined)}>Choose another session</button>}
          {step > 0 ? <button onClick={() => setStep(step - 1)}>Back</button> : null}
        </div>
        <ol className="ex-steps">{steps.map((item, index) => <li key={item.id} className={index < step ? 'done' : index === step ? 'now' : ''}>{item.title}</li>)}</ol>
      </div> : null}
    </div>
  </section>;
}
