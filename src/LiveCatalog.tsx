import { useEffect, useMemo, useState } from 'react';
import type { LiveSession } from './domain/live';
import { REGISTRATION_URL, useAttendee } from './domain/attendeeClient';
import { clashes } from './domain/planning';
import { ConnectionHelp, ExpToast, ReservationTray, SessionState, reservationsNotice, useTray } from './components/Booking';
import { normalizeVenueName, venueIdForName } from './scene/venues';
import { HOSTED } from './domain/hosted';
import { HostedNotice } from './components/HostedNotice';
import './live.css';

const ago = (at?: number) => at ? `${Math.max(0, Math.round((Date.now() - at) / 60_000))} min ago` : 'not yet';

export function LiveCatalog() {
  const client = useAttendee();
  const tray = useTray();
  const { connection, catalog, schedule, busy, message, error } = client;
  // Filters live in the URL, so a filtered view survives a reload and can be shared.
  const initial = new URLSearchParams(window.location.search);
  const [query, setQuery] = useState(initial.get('q') ?? '');
  const [topic, setTopic] = useState(initial.get('topic') ?? 'All topics');
  const [day, setDay] = useState(initial.get('day') ?? '');
  const [format, setFormat] = useState(initial.get('format') ?? '');
  const [venueFilter, setVenueFilter] = useState(() => new URLSearchParams(window.location.search).get('venue') ?? '');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  const [pending, setPending] = useState<{ id: string; desired: boolean }>();
  const [cancelling, setCancelling] = useState<string>();
  const [logoutUrl, setLogoutUrl] = useState('');
  const selected: LiveSession | undefined = catalog?.sessions.find((session) => session.id === selectedId);
  // Signed in (e.g. arriving from the map with ?venue=…): load the real catalog once, as the map does.
  useEffect(() => {
    if (connection?.connected && !catalog && !client.reason) void client.load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection?.connected]);
  // Same matcher as the map, so "Encore" also finds catalog venues such as "Encore Las Vegas".
  const filterVenueId = venueIdForName(venueFilter);
  const inVenue = (session: LiveSession) => !venueFilter || (filterVenueId ? venueIdForName(session.venue) === filterVenueId : normalizeVenueName(session.venue) === normalizeVenueName(venueFilter));
  /** The venue strings the API actually returned, for when a filter finds nothing. */
  const venueNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const session of catalog?.sessions ?? []) { const name = session.venue?.trim() || 'Venue not provided'; counts.set(name, (counts.get(name) ?? 0) + 1); }
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [catalog]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of [['q', query.trim()], ['topic', topic === 'All topics' ? '' : topic], ['day', day], ['format', format], ['venue', venueFilter]] as const) {
      if (value) params.set(key, value); else params.delete(key);
    }
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
  }, [query, topic, day, format, venueFilter]);

  const filtered = (catalog?.sessions ?? []).filter((session) =>
    inVenue(session) &&
    (!day || session.date === day) &&
    (!format || session.format === format) &&
    (topic === 'All topics' || session.topics.includes(topic)) &&
    [session.title, session.abbreviation, session.abstract, session.venue, session.format, session.level, ...(session.topics ?? []), ...(session.speakers ?? [])].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const topics = [...new Set(catalog?.sessions.flatMap((session) => session.topics) ?? [])].sort();
  const days = [...new Set((catalog?.sessions ?? []).map((session) => session.date).filter((value): value is string => Boolean(value)))].sort();
  const formats = [...new Set((catalog?.sessions ?? []).map((session) => session.format).filter((value): value is string => Boolean(value)))].sort();
  const active = [
    ...(query.trim() ? [{ label: `“${query.trim()}”`, clear: () => setQuery('') }] : []),
    ...(topic !== 'All topics' ? [{ label: topic, clear: () => setTopic('All topics') }] : []),
    ...(day ? [{ label: day, clear: () => setDay('') }] : []),
    ...(format ? [{ label: format, clear: () => setFormat('') }] : []),
    ...(venueFilter ? [{ label: venueFilter, clear: () => setVenueFilter('') }] : []),
  ];
  // "My schedule": reserved and favorited sessions from GetSchedule, grouped by listed local date, with clash hints.
  const mine = (catalog?.sessions ?? []).filter((session) => schedule?.reserved.includes(session.id) || schedule?.favorites.includes(session.id));
  const reservedSessions = mine.filter((session) => schedule?.reserved.includes(session.id));
  const byDay = [...mine.reduce((map, session) => map.set(session.date ?? 'Date not provided', [...(map.get(session.date ?? 'Date not provided') ?? []), session]), new Map<string, LiveSession[]>())]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => [date, list.sort((a, b) => `${a.time ?? '99'}`.localeCompare(`${b.time ?? '99'}`))] as const);
  const pageSize = 30;
  const shown = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const notice = reservationsNotice();

  return <section className="live-section" aria-labelledby="live-title">
    <ExpToast client={client} />
    <div className="live-hero">
    <p className="eyebrow">re:Invent 2026 · Planning desk</p>
    <h1 id="live-title">Plan what’s next.<br /><em>Build your week.</em></h1>
    <p className="live-intro">Sign in with your registered AWS Builder ID to browse the real re:Invent 2026 catalog, favorite sessions and reserve seats. Your tokens stay in this local server’s memory, and no AI service receives them.</p>
    <ol className="live-steps" aria-label="How live mode works">
      <li className={connection?.connected ? 'done' : ''}><b>1</b><span>Register for re:Invent 2026 on the <a href={REGISTRATION_URL} target="_blank" rel="noreferrer">official site ↗</a>. The API cannot register you.</span></li>
      <li className={connection?.connected ? 'done' : ''}><b>2</b><span>Sign in here with the same AWS Builder ID.</span></li>
      <li className={catalog ? 'done' : ''}><b>3</b><span>Load your catalog and schedule, then favorite or reserve with a review step.</span></li>
    </ol>
    <p className="hero-meta"><span><b>Nov 30 – Dec 4, 2026</b> · Las Vegas</span><span><a href="/map">Explore the Strip globe →</a></span><span><a href="/passport">Open your passport →</a></span></p>
    </div>
    <div className="connection-status"><span>{connection ? connection.connected ? 'AWS account connected locally' : 'No attendee connected' : error ? 'Connection status unavailable' : 'Checking local connection…'}</span><span>Schedule refreshed {ago(client.scheduleAt)}</span></div>
    <ConnectionHelp client={client} returnTo="/" />
    {error && !client.reason ? <p className="error-message" role="alert">{error}</p> : null}
    <p className="live-message" role="status">{busy ? 'Working with AWS… please wait.' : message}</p>
    {HOSTED ? <HostedNotice /> : null}
    {HOSTED ? null : !connection?.connected ? <div className="connect-card"><h2>A personal connection.</h2><p>Sign-in opens the official AWS page in this browser and returns to this computer. After signing in, choose “Load my catalog and schedule” to read your data. Favorites and reservations each require a separate confirmation.</p><button className="primary-button" disabled={!connection || busy} onClick={() => void client.connect('/')}>Sign in with AWS Builder ID ↗</button><p className="fine-print">Requires re:Invent 2026 registration. This does not register you for the event.</p><a href={REGISTRATION_URL} target="_blank" rel="noreferrer">Official event registration ↗</a></div> : <>
      <div className="live-actions"><button className="primary-button" disabled={busy} onClick={() => { setPage(0); setPending(undefined); setSelectedId(undefined); void client.load(Boolean(catalog)); }}>{catalog ? 'Refresh catalog and schedule' : 'Load my catalog and schedule'}</button>{schedule ? <button className="view-switch" disabled={busy} onClick={() => void client.refreshSchedule()}>Refresh my schedule</button> : null}<button className="view-switch" disabled={busy} onClick={() => void client.disconnect().then((url) => { if (url) setLogoutUrl(url); })}>Disconnect this app</button></div>
      <p className="catalog-note"><a href="/map">Open the Strip globe ↗</a> — it shares this connection, schedule and reservation tray.</p>
    </>}
    {logoutUrl ? <p className="logout-note">Also want to end the Builder ID browser session? <a href={logoutUrl}>Sign out of Builder ID in this browser ↗</a></p> : null}
    {catalog && schedule ? <>
      <div className="live-summary"><div><span>EVENT</span><strong>{catalog.eventName}</strong></div><div><span>RESERVED</span><strong>{schedule.reserved.length} seats</strong></div><div><span>FAVORITED</span><strong>{schedule.favorites.length} sessions</strong></div><div><span>PERSONAL TIME</span><strong>{schedule.personalTime.length} blocks</strong></div></div>
      <p className="catalog-note">Catalog refreshed {new Date(catalog.refreshedAt).toLocaleString()}. Favorites and reservations are distinct. Availability is a coarse band, not a guaranteed seat.{notice ? ` ${notice}` : ''}</p>
      <ReservationTray client={client} tray={tray} />
      {venueFilter ? <p className="catalog-note">Venue filter: {venueFilter}{filterVenueId ? ' (also matches catalog names that start with it, e.g. “' + venueFilter + ' Las Vegas”)' : ''}. <button className="text-button" onClick={() => { setVenueFilter(''); setPage(0); }}>Clear venue filter</button></p> : null}
      {catalog.sessions.length !== catalog.expectedCount ? <p className="error-message">The catalog reports {catalog.expectedCount} entries; {catalog.sessions.length} unique records were received. Refresh to reconcile this discrepancy.</p> : null}
      <div id="session-list" className="workspace"><div><div className="filters"><label className="search"><span>Search live sessions</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Title, code, speaker, venue or topic…" /></label><label className="topic"><span>Topic</span><select value={topic} onChange={(event) => { setTopic(event.target.value); setPage(0); }}><option>All topics</option>{topics.map((item) => <option key={item}>{item}</option>)}</select></label><label className="topic"><span>Day</span><select value={day} onChange={(event) => { setDay(event.target.value); setPage(0); }}><option value="">All days</option>{days.map((item) => <option key={item}>{item}</option>)}</select></label><label className="topic"><span>Format</span><select value={format} onChange={(event) => { setFormat(event.target.value); setPage(0); }}><option value="">All formats</option>{formats.map((item) => <option key={item}>{item}</option>)}</select></label></div>
        {active.length ? <div className="active-filters" aria-label="Active filters">{active.map((item) => <button key={item.label} onClick={() => { item.clear(); setPage(0); }} aria-label={`Remove filter ${item.label}`}>{item.label} <span aria-hidden="true">×</span></button>)}{active.length > 1 ? <button className="text-button" onClick={() => { setQuery(''); setTopic('All topics'); setDay(''); setFormat(''); setVenueFilter(''); setPage(0); }}>Clear all</button> : null}</div> : null}
        <p className="result-count" role="status">{filtered.length} live sessions match</p>
        <div className="session-list">{shown.map((session) => <button className={`session-card ${selectedId === session.id ? 'selected' : ''}`} key={session.id} disabled={busy} onClick={() => { setPending(undefined); setCancelling(undefined); void client.inspect(session.id).then((fresh) => { if (fresh) setSelectedId(fresh.id); }); }}><span className="session-summary"><span className="session-meta">{session.format ?? 'Format not provided'}{session.abbreviation ? ` · ${session.abbreviation}` : ''}</span><strong>{session.title}</strong><span className="venue-line">{session.venue ?? 'Venue not provided'}{schedule.favorites.includes(session.id) ? ' · Favorited' : ''}{schedule.reserved.includes(session.id) ? ' · Reserved' : ''}{tray.has(session.id) ? ' · In tray' : ''}</span></span><span className="card-arrow" aria-hidden="true">↗</span></button>)}</div>
        {filtered.length === 0 ? <div className="empty-venue"><p>No sessions match these filters.</p>{venueFilter && !catalog.sessions.some(inVenue) ? <><p>The loaded catalog has no session at “{venueFilter}”. These are the venue names AWS returned ({catalog.sessions.length} sessions):</p><ul>{venueNames.slice(0, 12).map(([name, count]) => <li key={name}>{name === 'Venue not provided' ? <span>{name} · {count}</span> : <button className="text-button" onClick={() => { setVenueFilter(name); setPage(0); }}>{name} · {count}</button>}</li>)}</ul></> : null}</div> : null}
        <div className="live-pagination"><button disabled={page === 0} onClick={() => { setPage(page - 1); document.getElementById('session-list')?.scrollIntoView({ block: 'start' }); }}>Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(filtered.length / pageSize))}</span><button disabled={(page + 1) * pageSize >= filtered.length} onClick={() => { setPage(page + 1); document.getElementById('session-list')?.scrollIntoView({ block: 'start' }); }}>Next</button></div>
      </div><aside className="detail-panel live-detail" aria-label="Live session details">{selected ? <div className="detail-body"><p className="eyebrow">LIVE AWS SESSION · {selected.abbreviation ?? selected.id}</p><h2>{selected.title}</h2><p className="detail-description">{selected.abstract ?? 'Abstract not provided'}</p><dl><div><dt>When</dt><dd>{selected.date ?? 'Date not provided'} · {selected.allDay ? 'All day' : selected.time ?? 'Time not provided'}<span>{selected.timezone ?? 'Timezone not provided'}{selected.minutes ? ` · ${selected.minutes} minutes` : ''}</span></dd></div><div><dt>Where</dt><dd>{selected.venue ?? 'Venue not provided'}<span>{selected.room ?? 'Room not provided'}</span></dd></div><div><dt>Status</dt><dd>{schedule.reserved.includes(selected.id) ? 'Reserved in GetSchedule' : 'Not reserved in GetSchedule'}<span><SessionState session={selected} client={client} /></span></dd></div>{selected.speakers?.length ? <div><dt>Speakers</dt><dd>{selected.speakers.join(', ')}</dd></div> : null}</dl>
        {pending ? <div className="favorite-confirm" role="group" aria-label="Review favorite change"><h3>Confirm this AWS change?</h3><p>{pending.desired ? 'Add' : 'Remove'} “{selected.title}” {pending.desired ? 'to' : 'from'} your actual AWS favorites. This does not reserve or cancel a seat.</p><button className="primary-button" disabled={busy} onClick={() => void client.favorite(pending.id, pending.desired).then(() => setPending(undefined))}>Confirm favorite change</button><button className="text-button" disabled={busy} onClick={() => setPending(undefined)}>Keep current state</button></div>
          : cancelling === selected.id ? <div className="favorite-confirm" role="group" aria-label="Review cancellation"><h3>Cancel this real reservation?</h3><p>You may not get the seat back. The result is checked with GetSchedule.</p><button className="primary-button" disabled={busy} onClick={() => void client.cancel(selected.id).then(() => setCancelling(undefined))}>Confirm cancellation</button><button className="text-button" disabled={busy} onClick={() => setCancelling(undefined)}>Keep my reservation</button></div>
          : <div className="detail-actions"><button className="primary-button" disabled={busy || !connection?.connected} onClick={() => setPending({ id: selected.id, desired: !schedule.favorites.includes(selected.id) })}>{schedule.favorites.includes(selected.id) ? 'Review removing AWS favorite' : 'Review adding AWS favorite'}</button>
            {schedule.reserved.includes(selected.id) ? <button className="text-button" disabled={busy} onClick={() => setCancelling(selected.id)}>Review cancelling reservation</button>
              : selected.reservable !== false && selected.availability !== 'walkUp' && selected.availability !== 'unavailable' ? <button className="text-button" aria-pressed={tray.has(selected.id)} disabled={busy} onClick={() => tray.toggle(selected.id)}>{tray.has(selected.id) ? '✓ In reservation tray' : '+ Add to reservation tray'}</button> : <span className="fine-print">{selected.availability === 'walkUp' ? 'Walk-up session: no reservation taken.' : (selected.availability === 'unavailable' ? 'No seats available right now — use Re-check seats later.' : 'This session does not take reservations.')}</span>}
            <button className="text-button" disabled={busy} onClick={() => void client.refreshSeats([selected.id])}>Re-check seats</button></div>}
      </div> : <div className="detail-body"><h2>Choose a live session.</h2><p className="detail-description">Its details will be checked with GetSession before you review a favorite or reservation.</p></div>}</aside></div>
      <section className="coming-next my-schedule" aria-labelledby="my-schedule-title"><h2 id="my-schedule-title">My schedule</h2>
        {byDay.length === 0 && schedule.personalTime.length === 0 ? <p>No reservations, favorites or personal-time blocks were returned by GetSchedule.</p> : <>
          {byDay.map(([date, list]) => <div key={date} className="schedule-day"><h3>{date}</h3><ul>{list.map((session) => {
            const reserved = schedule.reserved.includes(session.id);
            const clash = clashes(session, reservedSessions.filter((other) => other.id !== session.id));
            return <li key={session.id}><button className="text-button" onClick={() => setSelectedId(session.id)}>{session.time ?? 'Time not provided'} · {session.title}</button><span className={reserved ? 'tag-reserved' : 'tag-favorite'}>{reserved ? '★ Reserved' : '♥ Favorite'}</span><small>{session.venue ?? 'Venue not provided'}{session.room ? ` · ${session.room}` : ''}</small>{clash.length ? <em className="clash-note">Possible clash by listed local time with {clash.map((item) => item.title).join(', ')}. AWS decides.</em> : null}</li>;
          })}</ul></div>)}
          {schedule.reserved.filter((id) => !catalog.sessions.some((session) => session.id === id)).map((id) => <p key={id}>Reserved session {id} — details absent from the loaded catalog.</p>)}
          {schedule.personalTime.length ? <div className="schedule-day"><h3>Personal time (UTC)</h3><ul>{schedule.personalTime.map((entry) => <li key={entry.id}>{entry.title} · {entry.start}–{entry.end}</li>)}</ul></div> : null}
        </>}
        <p>From GetSchedule; favorites are interest only, not seats. Personal-time editing is part of the next slice.</p></section>
    </> : null}
  </section>;
}
