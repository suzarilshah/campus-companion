import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { LiveSession } from './domain/live';
import { applyFilters, byStart, distinct, tally } from './domain/mapData';
import { REGISTRATION_URL, useAttendee, type AttendeeClient } from './domain/attendeeClient';
import { ConnectionHelp, ExpToast, ReservationTray, SessionActions, SessionState, useTray, type Tray } from './components/Booking';
import { CampusView } from './scene/CampusView';
import { BuildingExplorer } from './components/BuildingExplorer';
import { AGENDA_URL, VENUE_PAGE_URL, venueIdForName, venues, type VenueId } from './scene/venues';
import { HOSTED } from './domain/hosted';
import { HostedNotice } from './components/HostedNotice';
import './map.css';
import './map-theme.css';

const when = (session: LiveSession) => `${session.allDay ? 'All day' : session.time ?? 'Time not provided'}${session.minutes ? ` · ${session.minutes} min` : ''}`;
const ago = (at?: number) => at ? `${Math.max(0, Math.round((Date.now() - at) / 60_000))} min ago` : '—';

/** Sign-in / registration steps, shared by the overview and building views. Real data only — nothing is invented. */
function Connect({ client, purpose }: { client: AttendeeClient; purpose: string }) {
  if (HOSTED) return <HostedNotice compact />;
  if (!client.connection || client.reason) return null;
  if (client.connection.connected) return client.catalog ? null : <button className="mp-primary" disabled={client.busy} onClick={() => void client.load()}>{client.busy ? 'Loading your catalog…' : 'Load my re:Invent 2026 catalog'}</button>;
  return <div className="mp-connect"><strong>{purpose}</strong><ol><li>Register for re:Invent 2026 on the <a href={REGISTRATION_URL} target="_blank" rel="noreferrer">official site ↗</a> (the API cannot register you).</li><li>Sign in with the same Builder ID — you’ll come straight back to this map.</li></ol><button className="mp-primary" disabled={client.busy} onClick={() => void client.connect('/map')}>Sign in with AWS Builder ID ↗</button></div>;
}

/** Only the sessions whose catalog venue is exactly this building, grouped by day. */
function BuildingSessions({ client, tray, venueId, onExplore }: { client: AttendeeClient; tray: Tray; venueId: VenueId; onExplore: (sessionId?: string) => void }) {
  const [day, setDay] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const here = useMemo(() => (client.catalog?.sessions ?? []).filter((session) => venueIdForName(session.venue) === venueId).sort(byStart), [client.catalog, venueId]);
  const days = useMemo(() => distinct(here.map((session) => session.date)), [here]);
  useEffect(() => { setDay(undefined); setExpanded(false); }, [venueId]);
  if (!client.catalog) return null;
  const list = day ? here.filter((session) => session.date === day) : here;
  const shown = expanded ? list : list.slice(0, 8);
  return <>
    <p className="map-list-label">Sessions in this building · {here.length}</p>
    {days.length > 1 ? <div className="mp-days" role="group" aria-label="Days in this building"><button aria-pressed={!day} onClick={() => setDay(undefined)}>All days</button>{days.map((item) => <button key={item} aria-pressed={day === item} onClick={() => { setDay(item); setExpanded(false); }}>{item.slice(5)} · {here.filter((session) => session.date === item).length}</button>)}</div> : null}
    {list.length ? <>
      <ul className="mp-sessions">{shown.map((session) => <li key={session.id} className="mp-session">
        <span className="mp-session-when">{session.date ?? 'Date not provided'} · {when(session)} <em>{session.timezone ?? 'timezone not provided'}</em></span>
        <strong>{session.title}</strong>
        <small>{[session.abbreviation, session.format, session.level, session.room].filter(Boolean).join(' · ') || 'Format, level and room not provided'}</small>
        {session.topics?.length ? <span className="mp-chips">{session.topics.slice(0, 3).map((topic) => <span key={topic}>{topic}</span>)}</span> : null}
        <SessionState session={session} client={client} />
        <SessionActions session={session} client={client} tray={tray} />
        <button className="mp-link" onClick={() => onExplore(session.id)}>Route to {session.room ? 'this room' : 'this session'} →</button>
      </li>)}</ul>
      <div className="mp-list-actions">{list.length > 8 ? <button className="mp-link" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer' : `Show all ${list.length}`}</button> : null}<button className="mp-link" disabled={client.busy} onClick={() => void client.refreshSeats(shown.slice(0, 6).map((session) => session.id))}>Re-check seats for the first {Math.min(6, shown.length)}</button></div>
    </> : <p className="map-empty">The loaded catalog has no session whose venue is exactly “{venues.find((venue) => venue.id === venueId)?.name}”. This does not locate booths or indoor rooms.</p>}
    <button className="map-panel-action mp-explore" onClick={() => onExplore()}>Explore inside: floors &amp; rooms <span aria-hidden="true">▦</span></button>
    <a className="map-panel-action" href={`/?connection=ready&venue=${encodeURIComponent(venues.find((venue) => venue.id === venueId)?.name ?? '')}`}>Open these sessions in the planning desk <span aria-hidden="true">↗</span></a>
  </>;
}

export function MapPage() {
  const client = useAttendee();
  const tray = useTray();
  const { connection, catalog, schedule, busy } = client;
  const [selectedVenue, setSelectedVenue] = useState<string>();
  const [arrivedAt, setArrivedAt] = useState<string>();
  /** A venue panel the visitor closed should not pop back open when they arrive at that same venue. */
  const dismissed = useRef<string | undefined>(undefined);
  // Mobile bottom sheet: collapsed to a peek strip, or expanded. Opening a building expands it.
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => { if (selectedVenue) setSheetOpen(true); }, [selectedVenue]);
  const [explorer, setExplorer] = useState<{ venueId: VenueId; session?: string }>();
  const [filters, setFilters] = useState<{ day?: string; topic?: string; format?: string; query?: string }>({});

  useEffect(() => {
    const prior = document.title;
    document.title = 'Explore the Strip globe · Campus companion';
    return () => { document.title = prior; };
  }, []);
  // Once connected (including straight after returning from AWS sign-in), load the real catalog once per visit.
  useEffect(() => {
    if (connection?.connected && !catalog && !client.reason) void client.load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection?.connected]);

  const active = venues.find((venue) => venue.name === selectedVenue);
  const filtered = useMemo(() => (catalog ? applyFilters(catalog.sessions, filters) : []), [catalog, filters]);
  const counts = useMemo(() => tally(filtered, schedule), [filtered, schedule]);
  const markers = useMemo(() => (catalog ? counts.byVenue : {}), [catalog, counts]);
  const days = useMemo(() => distinct(catalog?.sessions.map((session) => session.date) ?? []), [catalog]);
  const topics = useMemo(() => distinct(catalog?.sessions.flatMap((session) => session.topics ?? []) ?? []), [catalog]);
  const formats = useMemo(() => distinct(catalog?.sessions.map((session) => session.format) ?? []), [catalog]);
  const yourDay = useMemo(() => (catalog && schedule ? catalog.sessions.filter((session) => (schedule.reserved.includes(session.id) || schedule.favorites.includes(session.id)) && (!filters.day || session.date === filters.day)).sort(byStart) : []), [catalog, schedule, filters.day]);

  function goTo(id: VenueId) { window.dispatchEvent(new CustomEvent('campus-visit', { detail: id })); }
  const setFilter = (key: keyof typeof filters, value: string) => setFilters((previous) => ({ ...previous, [key]: value || undefined }));
  const status = busy ? 'Working with AWS… please wait.' : client.message || (HOSTED ? 'Hosted preview: explore the globe and collect stamps. Real sessions appear only in the local app. No invented sessions are shown.' : catalog ? 'Real re:Invent 2026 data from the AWS Events API. The globe layout is illustrative.' : 'Sign in to see real re:Invent 2026 sessions. No invented sessions are shown.');

  return <main id="map-content" className="map-page">
    <a className="skip-link" href="#map-details">Skip the world to venue details</a>
    <ExpToast client={client} />
    <header className="map-header">
      <a className="map-brand" href="/"><span className="brand-mark" aria-hidden="true">c</span><span>campus <strong>companion</strong></span><span className="sr-only"> — return to planning desk</span></a>
      <div className="map-header-center"><span className="map-status-light" aria-hidden="true" /> EXPLORATION GLOBE <span aria-hidden="true">/</span> {HOSTED ? 'HOSTED PREVIEW' : catalog ? 'LIVE RE:INVENT 2026 DATA' : 'SIGN IN FOR LIVE SESSIONS'}</div>
      <nav className="map-nav" aria-label="Main navigation"><a href="/passport">Passport</a><a className="map-back map-nav-primary" href="/">Planner <span aria-hidden="true">→</span></a></nav>
    </header>

    <CampusView onSelectVenue={setSelectedVenue} onArrive={(name) => { setArrivedAt(name ?? undefined); if (name !== dismissed.current) setSelectedVenue(name ?? undefined); if (!name) dismissed.current = undefined; }} fullPage markers={markers} progress={client.progress} onAward={client.award} />

    {explorer ? <BuildingExplorer key={`${explorer.venueId}:${explorer.session ?? ''}`} venueId={explorer.venueId} client={client} tray={tray} initialSession={explorer.session} atBuilding={arrivedAt === venues.find((venue) => venue.id === explorer.venueId)?.name} onClose={() => setExplorer(undefined)} onTravel={() => { const id = explorer.venueId; setExplorer(undefined); goTo(id); }} /> : null}
    <aside id="map-details" className={`map-details ${sheetOpen ? 'sheet-open' : 'sheet-peek'}`} aria-label={active ? `${active.name} sessions` : 'Map overview'} tabIndex={-1}>
      <button className="sheet-handle" aria-expanded={sheetOpen} aria-controls="map-details" onClick={() => setSheetOpen(!sheetOpen)}><span aria-hidden="true" />{sheetOpen ? 'Show more map' : active ? `${active.name} · show sessions` : 'Show details'}</button>
      {active ? <>
        <div className="map-details-head"><span className="eyebrow" style={{ color: active.accent } as CSSProperties}>YOU’RE AT</span><button className="map-clear" onClick={() => { dismissed.current = selectedVenue; setSelectedVenue(undefined); }} aria-label="Close venue details">×</button></div>
        <h1>{active.name}</h1>
        <p className="mp-hosts"><b>2026 agenda:</b> {active.hosts.join(' · ')} · <a href={AGENDA_URL} target="_blank" rel="noreferrer">source ↗</a></p>
        <p className="map-mode-status" role="status">{status}</p>
        <ConnectionHelp client={client} returnTo="/map" />
        <Connect client={client} purpose="Sign in to see this building’s real sessions" />
        {tray.tray.length || client.outcomes.length ? <ReservationTray client={client} tray={tray} compact /> : null}
        <BuildingSessions client={client} tray={tray} venueId={active.id} onExplore={(session) => setExplorer({ venueId: active.id, session })} />
      </> : <>
        <div className="map-details-head"><span className="eyebrow">WELCOME TO THE TINY STRIP</span></div>
        <h1>Walk into the week.</h1>
        <p className="map-panel-intro">A tiny-planet Las Vegas Strip with the six real 2026 venues. Walk up to a building to see only its sessions; ride the shuttle and collect EXP.</p>
        <p className="map-mode-status" role="status">{status}</p>
        <ConnectionHelp client={client} returnTo="/map" />
        {client.error && !client.reason ? <p className="mp-error" role="alert">{client.error}</p> : null}
        <Connect client={client} purpose="Use your real re:Invent schedule here" />
        <nav className="mp-quick" aria-label="Go to a venue"><span>Go to a venue</span>{venues.map((venue, index) => <button key={venue.id} style={{ '--venue': venue.accent } as CSSProperties} onClick={() => goTo(venue.id)}>{index + 1} · {venue.name}</button>)}</nav>
        {catalog ? <>
          <p className="mp-event"><strong>{catalog.eventName}</strong>{catalog.event?.city ? ` · ${catalog.event.city}` : ''}<br />{catalog.event?.startDate ? `${catalog.event.startDate.slice(0, 10)} → ${catalog.event.endDate?.slice(0, 10) ?? '?'}` : 'Event dates not provided'}{catalog.event?.timezone ? ` · ${catalog.event.timezone}` : ''} <span>from GetEvent</span></p>
          <div className="mp-summary" aria-label="Your schedule from GetSchedule"><span><b>{schedule?.reserved.length ?? 0}</b>reserved</span><span><b>{schedule?.favorites.length ?? 0}</b>favorited</span><span><b>{schedule?.personalTime.length ?? 0}</b>personal time</span></div>
          <p className="mp-refresh">Catalog {new Date(catalog.refreshedAt).toLocaleTimeString()} · schedule {ago(client.scheduleAt)} <button className="mp-link" disabled={busy} onClick={() => void client.load(true)}>Refresh all</button> <button className="mp-link" disabled={busy} onClick={() => void client.refreshSchedule()}>Refresh schedule</button></p>
          <ReservationTray client={client} tray={tray} compact />
          <div className="mp-filters">
            <label className="mp-search"><span className="sr-only">Search sessions on the map</span><input type="search" placeholder="Search title, code, topic, speaker…" value={filters.query ?? ''} onChange={(event) => setFilter('query', event.target.value)} /></label>
            {days.length ? <div className="mp-days" role="group" aria-label="Filter by day">{days.map((day) => <button key={day} aria-pressed={filters.day === day} onClick={() => setFilter('day', filters.day === day ? '' : day)}>{day.slice(5)}</button>)}</div> : null}
            <div className="mp-selects"><label><span className="sr-only">Topic</span><select value={filters.topic ?? ''} onChange={(event) => setFilter('topic', event.target.value)}><option value="">All topics</option>{topics.map((item) => <option key={item}>{item}</option>)}</select></label><label><span className="sr-only">Session format</span><select value={filters.format ?? ''} onChange={(event) => setFilter('format', event.target.value)}><option value="">All formats</option>{formats.map((item) => <option key={item}>{item}</option>)}</select></label></div>
          </div>
          <p className="map-list-label">Sessions by building · {filtered.length} match</p>
          <ul className="mp-venues">{venues.map((venue) => <li key={venue.id}><button style={{ '--venue': venue.accent } as CSSProperties} aria-label={`Walk to ${venue.name}, ${counts.byVenue[venue.id].sessions} sessions`} onClick={() => goTo(venue.id)}><i />{venue.name}<span>{counts.byVenue[venue.id].sessions}</span>{counts.byVenue[venue.id].reserved ? <b className="is-reserved">★{counts.byVenue[venue.id].reserved}</b> : null}{counts.byVenue[venue.id].favorites ? <b className="is-favorite">♥{counts.byVenue[venue.id].favorites}</b> : null}</button></li>)}</ul>
          {counts.otherVenues.length || counts.noVenue ? <p className="map-more">Not on this map: {counts.otherVenues.map(([name, count]) => `${name} (${count})`).join(', ')}{counts.otherVenues.length && counts.noVenue ? ', ' : ''}{counts.noVenue ? `${counts.noVenue} with no venue` : ''}. These are listed in the planning desk, never placed on the map.</p> : null}
          {yourDay.length ? <><p className="map-list-label">Your reserved &amp; favorited{filters.day ? ` · ${filters.day}` : ''}</p><ul className="mp-day">{yourDay.slice(0, 8).map((session) => { const id = venueIdForName(session.venue); return <li key={session.id}><button disabled={!id} onClick={() => id && goTo(id)}><span>{session.date?.slice(5) ?? '—'} {session.time ?? ''}</span>{session.title}<small>{schedule?.reserved.includes(session.id) ? '★ reserved' : '♥ favorite'} · {session.venue ?? 'venue not provided'}</small></button></li>; })}</ul></> : null}
          {schedule?.personalTime.length ? <p className="map-more">Personal time (UTC, from GetSchedule): {schedule.personalTime.slice(0, 3).map((entry) => `${entry.title} ${entry.start.slice(5, 16)}`).join(' · ')}{schedule.personalTime.length > 3 ? ` · +${schedule.personalTime.length - 3}` : ''}</p> : null}
        </> : <p className="map-empty">Drag to spin the globe. Click a hotel or the ground to walk there, WASD or arrows to steer, Shift to run. Stand at a blue shuttle stop to ride, and collect stamps in your passport.</p>}
        <details className="mp-api">
          <summary>How this map uses the Events API</summary>
          <ul>
            <li><b>GetEvent</b> — event name, dates, timezone and city.</li>
            <li><b>ListSessions</b> — every page until <code>nextToken</code> ends; pins are counts per venue name.</li>
            <li><b>GetSession</b> — opened cards and “Re-check seats” (up to six at a time, never on a loop).</li>
            <li><b>GetSchedule</b> — reserved, favorited and personal time; reread after every change and when you return to the tab.</li>
            <li><b>AssociateFavorites / DisassociateFavorite</b> — only after you confirm; a favorite is not a seat.</li>
            <li><b>ReserveSessions / CancelReservation</b> — 1–10 sessions per confirmed request, read per session, checked with GetSchedule. Uncertain results are never re-sent.</li>
            <li>The API has no catalog search, no registration, no other attendees and no booths, so filters run locally and unmatched venues stay unplaced.</li>
          </ul>
          <a href="https://docs.aws.amazon.com/events/latest/devguide/what-is-events-api.html" target="_blank" rel="noreferrer">Events API guide ↗</a>
        </details>
        <div className="map-source-note">Venue names and what each hosts: <a href={AGENDA_URL} target="_blank" rel="noreferrer">2026 AWS agenda ↗</a>. Shuttles “between all event venues that are not within a walkable distance” and nearby hotels: <a href={VENUE_PAGE_URL} target="_blank" rel="noreferrer">official venue page ↗</a>.<br />The globe, order along the Strip, road sides, shuttle stops, food spots and paths are illustrative.</div>
        <p className="map-indoor-limit">For physical travel and venue access, consult <a href={VENUE_PAGE_URL} target="_blank" rel="noreferrer">official venue information ↗</a>. For Expo details, see <a href="https://aws.amazon.com/events/reinvent/experiences/expo/" target="_blank" rel="noreferrer">official Expo information ↗</a>.</p>
      </>}
    </aside>
  </main>;
}
