import { useMemo, type CSSProperties } from 'react';
import { REGISTRATION_URL, useAttendee } from './domain/attendeeClient';
import { ConnectionHelp, ExpToast } from './components/Booking';
import { places } from './scene/places';
import { AGENDA_URL, venueIdForName, venues, type VenueId } from './scene/venues';
import { HOSTED } from './domain/hosted';
import { HostedNotice } from './components/HostedNotice';
import './passport.css';

/**
 * The event passport: a booklet view of the attendee's EXP, venue stamps, quests and real reservations.
 * Stamps come only from the server's EXP record (exploring the illustrated globe); session stamps come only from
 * GetSchedule plus the loaded catalog. Nothing here records real-world attendance.
 */
export function PassportPage() {
  const client = useAttendee();
  const { connection, catalog, schedule, progress, busy } = client;
  const found = useMemo(() => new Set(progress?.discovered ?? []), [progress]);
  const level = progress?.level;
  const extras = places.filter((place) => place.kind !== 'venue');
  const reservedHere = useMemo(() => {
    const counts = new Map<VenueId, number>();
    for (const session of catalog?.sessions ?? []) {
      if (!schedule?.reserved.includes(session.id)) continue;
      const id = venueIdForName(session.venue);
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [catalog, schedule]);
  const reserved = (catalog?.sessions ?? []).filter((session) => schedule?.reserved.includes(session.id))
    .sort((a, b) => `${a.date ?? '9'} ${a.time ?? '99'}`.localeCompare(`${b.date ?? '9'} ${b.time ?? '99'}`));
  const venueStamps = venues.filter((venue) => found.has(`venue-${venue.id}`)).length;
  const questsDone = progress?.quests.filter((quest) => quest.done).length ?? 0;
  const holder = progress?.profile === 'builder' ? 'BUILDER ID HOLDER' : 'GUEST EXPLORER';

  return <section className="pp" aria-labelledby="pp-title">
    <ExpToast client={client} />
    <div className="pp-hero">
      <p className="eyebrow">re:Invent 2026 · Las Vegas</p>
      <h1 id="pp-title">Your event <em>passport.</em></h1>
      <p className="pp-intro">Collect a stamp at every venue on the Strip globe, finish quests and turn real reservations into session stamps. Your passport follows your Builder ID, or this browser if you haven’t signed in.</p>
      <div className="pp-actions"><a className="pp-cta" href="/map">Collect stamps on the globe <span aria-hidden="true">→</span></a><a className="pp-ghost" href="/">Plan sessions</a><button className="pp-ghost" onClick={() => window.print()}>Print passport</button></div>
    </div>

    {!progress ? <p className="pp-loading" role="status">{client.error ? 'Your passport could not be loaded from the local server. Is it running?' : 'Opening your passport…'}</p> : <>
      <div className="pp-book">
        <article className="pp-page pp-id" aria-labelledby="pp-id-title">
          <header><span>PASSPORT · PASSE-PORT</span><span>CAMPUS COMPANION</span></header>
          <h2 id="pp-id-title" className="sr-only">Identity page</h2>
          <div className="pp-id-body">
            <div className="pp-photo" aria-hidden="true"><i className="pp-head" /><i className="pp-body" /><i className="pp-badge" /></div>
            <dl className="pp-fields">
              <div><dt>Holder</dt><dd>{holder}</dd></div>
              <div><dt>Level</dt><dd>LV {level!.level} · {level!.title}</dd></div>
              <div><dt>Event</dt><dd>re:Invent 2026</dd></div>
              <div><dt>Valid</dt><dd>Nov 30 – Dec 4, 2026</dd></div>
              <div><dt>Place of issue</dt><dd>Las Vegas, NV</dd></div>
              <div><dt>Saved to</dt><dd>{progress.storage}</dd></div>
            </dl>
          </div>
          <div className="pp-exp"><div><strong>{progress.exp}</strong> EXP</div><span className="pp-bar" role="progressbar" aria-label="Progress to the next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level!.progress * 100)}><i style={{ width: `${Math.round(level!.progress * 100)}%` }} /></span><small>{level!.next ? `${level!.next - progress.exp} EXP to level ${level!.level + 1}` : 'Max level reached'}</small></div>
          <div className="pp-mrz" aria-hidden="true">{`P<REINVENT2026<<${holder.replace(/ /g, '<')}<<<<<<<<`}<br />{`LV${String(level!.level).padStart(2, '0')}<EXP${String(progress.exp).padStart(5, '0')}<<STAMPS${String(found.size).padStart(2, '0')}<<<<<<<`}</div>
        </article>

        <article className="pp-page pp-visas" aria-labelledby="pp-visa-title">
          <header><span>VENUE STAMPS</span><span>{venueStamps}/{venues.length}</span></header>
          <h2 id="pp-visa-title" className="sr-only">Venue stamps</h2>
          <ul className="pp-stamps">{venues.map((venue, index) => {
            const done = found.has(`venue-${venue.id}`);
            const seats = reservedHere.get(venue.id);
            return <li key={venue.id} className={done ? 'stamped' : ''} style={{ '--stamp': venue.accent, '--tilt': `${[-8, 6, -4, 9, -10, 5][index]}deg` } as CSSProperties}>
              <span className="pp-stamp" aria-hidden="true"><b>{venue.name.replace(/^The /, '').toUpperCase()}</b><i>★ RE:INVENT 2026 ★</i><small>{done ? 'VISITED' : 'NOT YET'}</small></span>
              <span className="pp-stamp-text"><strong>{venue.name}</strong>{done ? 'Stamped' : 'Walk there on the globe to stamp'}{seats ? ` · ${seats} reserved here` : ''}</span>
            </li>;
          })}</ul>
          <p className="pp-source">Venues and what each hosts: <a href={AGENDA_URL} target="_blank" rel="noreferrer">2026 AWS agenda ↗</a></p>
        </article>
      </div>

      <div className="pp-grid">
        <section className="pp-card" aria-labelledby="pp-quests">
          <h2 id="pp-quests">Quests <span>{questsDone}/{progress.quests.length}</span></h2>
          <ul className="pp-quests">{progress.quests.map((quest) => <li key={quest.id} className={quest.done ? 'done' : ''}><span aria-hidden="true">{quest.done ? '✓' : ''}</span><div><b>{quest.title}</b><small>{quest.detail}</small></div><em>+{quest.exp}</em><span className="sr-only">{quest.done ? 'complete' : 'not complete'}</span></li>)}</ul>
        </section>

        <section className="pp-card" aria-labelledby="pp-extras">
          <h2 id="pp-extras">Landmarks &amp; stops <span>{extras.filter((place) => found.has(place.id)).length}/{extras.length}</span></h2>
          <ul className="pp-mini">{extras.map((place) => { const done = found.has(place.id); return <li key={place.id} className={done ? 'done' : ''} style={{ '--stamp': place.color } as CSSProperties}><i aria-hidden="true">{place.kind === 'food' ? '●' : place.kind === 'shuttle' ? '■' : '◆'}</i>{done ? place.name : <span>Undiscovered {place.kind === 'landmark' ? 'landmark' : place.kind === 'food' ? 'food spot' : 'shuttle stop'}</span>}</li>; })}</ul>
          <p className="pp-source">Food spots and shuttle stops on the globe are illustrative; official pages do not publish them.</p>
        </section>
      </div>

      <section className="pp-card pp-sessions" aria-labelledby="pp-sessions">
        <h2 id="pp-sessions">Session stamps <span>{schedule ? `${schedule.reserved.length} reserved · ${schedule.favorites.length} favorited` : 'from GetSchedule'}</span></h2>
        <ConnectionHelp client={client} returnTo="/passport" />
        {HOSTED ? <HostedNotice /> : !connection ? <p className="pp-muted">Checking your local connection…</p>
          : !connection.connected ? <div className="pp-signin"><p>Sign in with the Builder ID you registered with, and every reservation AWS confirms becomes a session stamp here.</p><button className="primary-button" disabled={busy} onClick={() => void client.connect('/passport')}>Sign in with AWS Builder ID ↗</button><a href={REGISTRATION_URL} target="_blank" rel="noreferrer">Not registered yet? Official registration ↗</a></div>
          : !catalog ? <button className="primary-button pp-load" disabled={busy} onClick={() => void client.load()}>{busy ? 'Loading your catalog…' : 'Load my sessions to stamp them'}</button>
          : reserved.length === 0 ? <p className="pp-muted">No reservations were returned by GetSchedule yet. Reserve seats on the <a href="/">planner</a> and they’ll appear here as stamps.</p>
          : <ul className="pp-tickets">{reserved.map((session) => { const venue = venues.find((item) => item.id === venueIdForName(session.venue)); return <li key={session.id} style={{ '--stamp': venue?.accent ?? '#7b5cff' } as CSSProperties}>
            <div className="pp-ticket-when"><b>{session.date?.slice(5) ?? '—'}</b><span>{session.allDay ? 'All day' : session.time ?? 'Time TBA'}</span></div>
            <div className="pp-ticket-body"><small>{session.abbreviation ?? session.format ?? 'Session'}</small><strong>{session.title}</strong><span>{session.venue ?? 'Venue not provided'}{session.room ? ` · ${session.room}` : ''}</span></div>
            <div className="pp-ticket-stamp" aria-label="Reserved, confirmed by GetSchedule">RESERVED</div>
          </li>; })}</ul>}
      </section>

      {progress.recent.length ? <section className="pp-card" aria-labelledby="pp-recent"><h2 id="pp-recent">Recent activity</h2><ul className="pp-recent">{progress.recent.slice(0, 8).map((item) => <li key={item.key}><span>{item.label}</span><em>+{item.exp} EXP</em></li>)}</ul></section> : null}

      <p className="pp-note">Stamps and EXP come from exploring this illustrated globe, and from favorites and reservations that GetSchedule confirms. They are not a record of real-world attendance, and this is not an official AWS document.</p>
    </>}
  </section>;
}
