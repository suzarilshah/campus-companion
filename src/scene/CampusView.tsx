import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { roofHeight, venues, type VenueId } from './venues';
import { BOUNDS, LOOP } from './layout';
import { placeById, places, shuttleStops, type PlaceKind } from './places';
import type { LabelAnchor, Marker, Outfit, TimeOfDay } from './CampusCanvas';
import type { ProgressView } from '../domain/progress';
import './campus.css';

const CampusCanvas = lazy(() => import('./CampusCanvas'));

function Unavailable() {
  return <div className="scene-unavailable" role="status"><span aria-hidden="true">◈</span><h3>A different way to explore.</h3><p>3D is unavailable on this device. The session catalog is still available on the planning desk.</p><a href="/">Explore the session list ↗</a></div>;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Unavailable /> : this.props.children; }
}

type CampusProps = {
  onSelectVenue: (name: string) => void;
  /** The visitor stopped at a venue plaza (not just passing through on an automatic route), or left it. */
  onArrive?: (name: string | null) => void;
  fullPage?: boolean;
  markers?: Partial<Record<VenueId, Marker>>;
  progress?: ProgressView;
  onAward?: (key: string) => void;
};

const times: { id: TimeOfDay; label: string; glyph: string }[] = [
  { id: 'day', label: 'Day', glyph: '☀' },
  { id: 'sunset', label: 'Sunset', glyph: '◐' },
  { id: 'night', label: 'Night', glyph: '☾' },
];
const outfits: (Outfit & { name: string })[] = [
  { name: 'Builder', shirt: '#ff7a59', pants: '#3a4a7a', hat: '#ffcf40', skin: '#f1c27d' },
  { name: 'Night owl', shirt: '#6c5ce7', pants: '#2d3436', hat: '#00cec9', skin: '#c68642' },
  { name: 'Keynote', shirt: '#0984e3', pants: '#2d3436', hat: '#e84393', skin: '#8d5524' },
  { name: 'Cactus', shirt: '#00b894', pants: '#6d4c41', hat: '#fdcb6e', skin: '#e0ac69' },
];
const kindLabel: Record<PlaceKind, string> = { venue: 'Venue', landmark: 'Landmark', food: 'Food & drink', shuttle: 'Shuttle' };
const provenanceLabel = { agenda: 'From the 2026 AWS agenda', 'venue-page': 'From the official venue page', illustrative: 'Illustrative — not an official location' } as const;
const landmarkLabels = places.filter((place) => place.kind === 'landmark');

function readOutfit() {
  try { const index = Number(localStorage.getItem('campus-outfit')); return Number.isInteger(index) && index >= 0 && index < outfits.length ? index : 0; } catch { return 0; }
}

export function CampusView({ onSelectVenue, onArrive, fullPage = false, markers = {}, progress, onAward }: CampusProps) {
  const [enabled, setEnabled] = useState(() => new URLSearchParams(window.location.search).get('view') !== '2d');
  const [focus, setFocus] = useState<{ venue: VenueId | null; revision: number }>({ venue: null, revision: 0 });
  const [lost, setLost] = useState(false);
  const labelRefs = useRef(new Map<string, HTMLElement>());
  const youRef = useRef<HTMLSpanElement>(null);
  const onUnavailable = useCallback(() => setLost(true), []);
  const [lighter, setLighter] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Follow the OS setting if it changes while the page is open; the toggle below still lets people override it.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const [settings, setSettings] = useState(false);
  const [about, setAbout] = useState(false);
  const passportRef = useRef<HTMLDivElement>(null);
  const passportOpener = useRef<HTMLButtonElement>(null);
  const [walking, setWalking] = useState(fullPage);
  const [time, setTime] = useState<TimeOfDay>('day');
  const [ambient, setAmbient] = useState(false);
  const [near, setNear] = useState<string | null>(null);
  const [passport, setPassport] = useState(false);
  const [outfit, setOutfit] = useState(readOutfit);
  const [localFound, setLocalFound] = useState<string[]>([]);
  const heldControl = useRef<ReturnType<typeof setInterval> | null>(null);
  const current = venues.find((venue) => venue.id === focus.venue);
  const nearby = near ? placeById.get(near) : undefined;
  useEffect(() => () => { if (heldControl.current) clearInterval(heldControl.current); }, []);
  useEffect(() => { try { localStorage.setItem('campus-outfit', String(outfit)); } catch { /* Per-viewer convenience only. */ } }, [outfit]);
  // Lets panels outside the scene (for example the map's venue list) walk the visitor to a venue.
  const visitRef = useRef<(id: VenueId) => void>(() => undefined);
  useEffect(() => {
    const handler = (event: Event) => visitRef.current((event as CustomEvent<VenueId>).detail);
    window.addEventListener('campus-visit', handler);
    return () => window.removeEventListener('campus-visit', handler);
  }, []);

  const discovered = useMemo(() => [...new Set([...(progress?.discovered ?? []), ...localFound])], [progress, localFound]);
  const anchors = useMemo<LabelAnchor[]>(() => [
    ...venues.map((venue) => ({ id: venue.id, x: venue.position[0], y: Math.min(roofHeight[venue.id] + 0.6, 5.5), z: venue.position[2] })),
    ...landmarkLabels.map((place) => ({ id: place.id, x: place.spot[0], y: 3.1, z: place.spot[2] })),
  ], []);
  const onDiscover = useCallback((id: string) => { setLocalFound((items) => items.includes(id) ? items : [...items, id]); onAward?.(`discover:${id}`); }, [onAward]);
  const onNear = useCallback((id: string | null) => setNear(id), []);
  const onRideEnd = useCallback((stopId: string) => { onAward?.('ride:shuttle'); setNear(stopId); }, [onAward]);
  const arriveRef = useRef(onArrive);
  arriveRef.current = onArrive;
  const onArrived = useCallback((id: VenueId | null) => arriveRef.current?.(id ? venues.find((venue) => venue.id === id)!.name : null), []);

  function visit(venueId: VenueId) {
    const venue = venues.find((item) => item.id === venueId)!;
    setFocus((previous) => ({ venue: venueId, revision: previous.revision + 1 }));
    setGlobeView(false);
    onSelectVenue(venue.name);
  }
  visitRef.current = visit;
  const walkTo = (x: number, z: number) => window.dispatchEvent(new CustomEvent('campus-goto', { detail: { x, z } }));
  const ride = (stopId: string) => window.dispatchEvent(new CustomEvent('campus-ride', { detail: stopId }));

  function stopControl() { if (heldControl.current) clearInterval(heldControl.current); heldControl.current = null; }
  function moveFromControl(direction: string) {
    window.dispatchEvent(new CustomEvent('campus-step', { detail: direction }));
  }
  const padButton = (direction: string, label: string, glyph: string) => <button aria-label={label} onPointerDown={() => { moveFromControl(direction); stopControl(); heldControl.current = setInterval(() => moveFromControl(direction), 110); }} onPointerUp={stopControl} onPointerCancel={stopControl} onPointerLeave={stopControl}>{glyph}</button>;
  const nextTime = times[(times.findIndex((item) => item.id === time) + 1) % times.length]!;
  const currentTime = times.find((item) => item.id === time)!;
  const describe = (id: VenueId, name: string) => {
    const marker = markers[id];
    // Accessible names start with the visible text (WCAG 2.5.3 Label in Name).
    if (!marker) return `${name}: inspect illustrative venue`;
    return `${name} ${marker.sessions}: inspect illustrative venue, ${marker.sessions} sessions in your catalog, ${marker.reserved} reserved, ${marker.favorites} favorited`;
  };
  /** The minimap is a ring: the Strip loops round the planet, so position along it is an angle, east/west a radius. */
  const ringAt = (x: number, z: number) => {
    const angle = (z / LOOP) * Math.PI * 2;
    const radius = 38 + (x / BOUNDS.maxX) * 9;
    return { left: `calc(50% + ${(Math.sin(angle) * radius).toFixed(1)}px)`, top: `calc(50% - ${(Math.cos(angle) * radius).toFixed(1)}px)` };
  };
  const [globeView, setGlobeView] = useState(true);
  const [hint, setHint] = useState(() => { try { return localStorage.getItem('campus-hint-seen') !== '1'; } catch { return true; } });
  const dismissHint = () => { setHint(false); try { localStorage.setItem('campus-hint-seen', '1'); } catch { /* per-viewer convenience */ } };
  const zoom = (mode: 'globe' | 'street') => { setGlobeView(mode === 'globe'); window.dispatchEvent(new CustomEvent('campus-zoom', { detail: mode })); };
  const level = progress?.level;
  // Passport behaves like a dialog: focus moves in, Escape closes it, and focus returns to the EXP button.
  useEffect(() => {
    if (!passport) return;
    passportRef.current?.querySelector<HTMLElement>('h3')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setPassport(false); passportOpener.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [passport]);
  useEffect(() => {
    if (!settings && !about) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSettings(false); setAbout(false); } };
    // Close on a click/tap outside the popover and its toggle buttons.
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.hud-popover, [aria-controls="view-settings"], [aria-controls="about-map"]')) return;
      setSettings(false); setAbout(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onPointer); };
  }, [settings, about]);

  return <section className={`campus-section ${fullPage ? 'campus-full-page' : ''}`} aria-labelledby="campus-heading">
    {!fullPage ? <div className="campus-heading"><div><p className="eyebrow">SIX VENUE NAMES. ILLUSTRATIVE POSITIONS.</p><h2 id="campus-heading">Take the scenic route.</h2></div><button className="view-switch" aria-pressed={enabled} onClick={() => setEnabled(!enabled)}>{enabled ? 'Use 2D list ↓' : 'Explore 3D campus ↗'}</button></div> : <h2 id="campus-heading" className="sr-only">Illustrative miniature Las Vegas Strip</h2>}
    {enabled ? <>
      <div className="campus-stage" data-time={time} role="region" aria-label="Illustrative 3D Las Vegas Strip">
        <div className="scene-title"><span className="eyebrow">{fullPage ? 'AN ORIGINAL MINIATURE STRIP · LAS VEGAS INSPIRED' : 'YOUR MINIATURE CAMPUS'}</span><strong>{current?.name ?? 'A world worth wandering.'}</strong><span>{current?.subtitle ?? 'Click a hotel or the ground to walk there. WASD or arrows to steer, Shift to run.'}</span></div>
        {progress && level ? <button ref={passportOpener} className="exp-hud" aria-expanded={passport} aria-controls="passport" onClick={() => setPassport(!passport)}>
          <span className="exp-level">LV {level.level}</span><span className="exp-body"><strong>{level.title}</strong><span className="exp-bar"><i style={{ width: `${Math.round(level.progress * 100)}%` }} /></span><small>{progress.exp} EXP{level.next ? ` · ${level.next - progress.exp} to next` : ' · max level'}</small></span><span className="exp-passport" aria-hidden="true">🗺</span><span className="sr-only"> — open passport</span>
        </button> : null}
        {passport && progress ? <div id="passport" ref={passportRef} className="passport" role="dialog" aria-modal="false" aria-labelledby="passport-title">
          <header><h3 id="passport-title" tabIndex={-1}>Exploration passport</h3><button aria-label="Close passport" onClick={() => { setPassport(false); passportOpener.current?.focus(); }}>×</button></header>
          <p className="passport-note">EXP is for exploring this illustrated map and for favorites and reservations that GetSchedule confirms. It is not a record of real attendance. Saved to: {progress.storage}.</p>
          <h4>Quests</h4>
          <ul className="passport-quests">{progress.quests.map((quest) => <li key={quest.id} className={quest.done ? 'done' : ''}><span>{quest.done ? '✓' : '○'}</span><b>{quest.title}</b><small>{quest.detail}</small><em>+{quest.exp}</em></li>)}</ul>
          <h4>Stamps · {discovered.length}/{places.length}</h4>
          <div className="passport-stamps">{places.map((place) => { const done = discovered.includes(place.id); return <button key={place.id} className={done ? 'done' : ''} style={{ '--stamp': place.color } as CSSProperties} onClick={() => { walkTo(place.spot[0], place.spot[2]); setPassport(false); }} aria-label={`${done ? 'Discovered' : 'Not yet discovered'}: ${place.name}. Walk there`}><span>{place.kind === 'venue' ? '★' : place.kind === 'food' ? '●' : place.kind === 'shuttle' ? '■' : '◆'}</span>{done ? place.name : '???'}</button>; })}</div><a className="passport-full" href="/passport">Open your full event passport →</a>
        </div> : null}
        {lost ? <Unavailable /> : <SceneBoundary><Suspense fallback={<div className="scene-unavailable" role="status"><span aria-hidden="true">◈</span><h3>Setting out the little buildings…</h3><p>The session list is ready on the planning desk while the world loads.</p></div>}><CampusCanvas focus={focus} onVisit={visit} lighter={lighter} reducedMotion={reducedMotion} walking={walking} onUnavailable={onUnavailable} labelRefs={labelRefs} anchors={anchors} fallback={<span>3D is unavailable on this device.</span>} time={time} ambient={ambient} markers={markers} youRef={youRef} discovered={discovered} outfit={outfits[outfit]!} onDiscover={onDiscover} onNear={onNear} onArrive={onArrived} onRideEnd={onRideEnd} /></Suspense></SceneBoundary>}
        {!lost ? <>
          {venues.map((venue) => {
            const marker = markers[venue.id];
            return <button key={venue.id} ref={(node) => { if (node) labelRefs.current.set(venue.id, node); else labelRefs.current.delete(venue.id); }} style={{ '--venue': venue.accent } as CSSProperties} className={`landmark-label projected ${focus.venue === venue.id ? 'chosen' : ''}`} tabIndex={-1} onClick={() => visit(venue.id)} aria-label={describe(venue.id, venue.name)}><span className="landmark-dot" />{venue.name}{marker ? <span className="landmark-badges" aria-hidden="true"><span className="badge-sessions">{marker.sessions}</span>{marker.reserved ? <span className="badge-reserved">★{marker.reserved}</span> : null}{marker.favorites ? <span className="badge-favorite">♥{marker.favorites}</span> : null}</span> : <span aria-hidden="true">↗</span>}</button>;
          })}
          {landmarkLabels.map((place) => <button key={place.id} ref={(node) => { if (node) labelRefs.current.set(place.id, node); else labelRefs.current.delete(place.id); }} style={{ '--venue': place.color } as CSSProperties} className="landmark-label projected minor" tabIndex={-1} onClick={() => walkTo(place.spot[0], place.spot[2])} aria-label={`${place.name}: walk there`}><span className="landmark-dot" />{place.name}</button>)}
        </> : null}
        {nearby ? <aside className={`postcard kind-${nearby.kind}`} aria-label={`Here: ${nearby.name}`}>
          <span className="postcard-kind" style={{ background: nearby.color }}>{kindLabel[nearby.kind]}</span>
          <strong>{nearby.name}</strong>
          <p>{nearby.note}</p>
          <small className={`postcard-source ${nearby.provenance}`}>{provenanceLabel[nearby.provenance]} · <a href={nearby.source} target="_blank" rel="noreferrer">source ↗</a></small>
          {nearby.kind === 'venue' && nearby.venueId ? <button className="postcard-action" onClick={() => visit(nearby.venueId!)}>Show sessions here</button> : null}
          {nearby.kind === 'shuttle' ? <div className="postcard-rides" role="group" aria-label="Ride the illustrative shuttle to"><span>Ride to:</span>{shuttleStops.filter((stop) => stop.id !== nearby.id).map((stop) => <button key={stop.id} onClick={() => ride(stop.id)}>{stop.name.replace('Shuttle stop · ', '')}</button>)}</div> : null}
        </aside> : null}
        <div className="scene-controls" aria-label="Campus settings">
          <button onClick={() => { setGlobeView(true); setFocus((previous) => ({ venue: null, revision: previous.revision + 1 })); }}>↖ Overview</button>
          <button aria-pressed={!globeView} onClick={() => zoom(globeView ? 'street' : 'globe')}>{globeView ? '🔍 Street view' : '🌐 Globe view'}</button>
          <button aria-pressed={walking} onClick={() => setWalking(!walking)}>{walking ? 'Walking · ON' : 'Walk as person'}</button>
          <button aria-expanded={settings} aria-controls="view-settings" onClick={() => { setSettings(!settings); setAbout(false); }}>⚙ View</button>
          <button aria-expanded={about} aria-controls="about-map" onClick={() => { setAbout(!about); setSettings(false); }} aria-label="About this map and legend">ⓘ</button>
          <button onClick={() => setHint(true)} aria-label="How to play">?</button>
        </div>
        {settings ? <div id="view-settings" className="hud-popover" role="group" aria-label="View settings">
          <button aria-label={`Time of day: ${currentTime.label}. Switch to ${nextTime.label}`} onClick={() => setTime(nextTime.id)}>{currentTime.glyph} {currentTime.label}</button>
          <button aria-pressed={ambient} onClick={() => setAmbient(!ambient)} title="Animates traffic, the shuttle and floating tokens. Off by default to save battery.">Ambient life</button>
          <button onClick={() => setOutfit((outfit + 1) % outfits.length)} aria-label={`Outfit: ${outfits[outfit]!.name}. Change outfit`}>👕 {outfits[outfit]!.name}</button>
          <button aria-pressed={lighter} onClick={() => setLighter(!lighter)}>Lighter graphics</button>
          <button aria-pressed={reducedMotion} onClick={() => setReducedMotion(!reducedMotion)}>Reduce motion</button>
        </div> : null}
        {about ? <div id="about-map" className="hud-popover about" role="group" aria-label="About this map">
          <p><strong>Illustrative geography, not a wayfinding map.</strong> Venue names and what each hosts come from the 2026 AWS agenda; positions, distances, shuttle stops and food spots are illustrative.</p>
          <div className="map-legend-items"><span><i className="lg-walk" />Walkways</span><span><i className="lg-shuttle" />Shuttle (illustrative)</span><span><i className="lg-food" />Food (illustrative)</span><span><i className="lg-landmark" />Official places</span>{Object.keys(markers).length ? <><span><i className="pin-teal" />Sessions</span><span><i className="pin-gold" />Reserved</span><span><i className="pin-pink" />Favorited</span></> : null}</div>
        </div> : null}
        {walking ? <div className="walk-pad" aria-label="On-screen walking controls">{padButton('w', 'Walk forward', '↑')}<div>{padButton('a', 'Walk left', '←')}{padButton('s', 'Walk backward', '↓')}{padButton('d', 'Walk right', '→')}</div></div> : null}
        <div className="mini-map" aria-label="Illustrative Strip minimap"><span>THE STRIP LOOP · ILLUSTRATIVE</span><div className="mini-ring"><i className="mini-road-ring" aria-hidden="true" />
          {places.filter((place) => place.kind !== 'venue').map((place) => <i key={place.id} className={`mini-dot mini-${place.kind} ${discovered.includes(place.id) ? 'found' : ''}`} style={ringAt(place.spot[0], place.spot[2])} aria-hidden="true" />)}
          {venues.map((venue, index) => <button key={venue.id} style={{ ...ringAt(venue.position[0], venue.position[2]), '--venue': venue.accent } as CSSProperties} aria-label={`${index + 1} · Jump to ${venue.name}`} aria-pressed={focus.venue === venue.id} onClick={() => visit(venue.id)}>{index + 1}</button>)}
          <span ref={youRef} className="mini-you" title="You are here" aria-hidden="true" /></div><small><i className="mini-you-key" aria-hidden="true" /> You are here · not to scale</small></div>
        {hint && !lost ? <div className="controls-hint" role="note" aria-label="How to play"><strong>How to play</strong><ul><li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <kbd>Shift</kbd> run</li><li>Drag to look around · scroll to zoom · <kbd>Q</kbd><kbd>E</kbd> turn</li><li>Click a building or the ground to walk there</li><li>Stand at a blue ■ stop to ride the shuttle</li></ul><button onClick={dismissHint}>Let’s go</button></div> : null}
        <span className="illustration-label">Illustrative map · not to scale</span>
      </div>
      {!fullPage ? <div className="venue-shortcuts" aria-label="Choose a campus venue">{venues.map((venue, index) => <button key={venue.id} aria-pressed={focus.venue === venue.id} onClick={() => visit(venue.id)}><span className="venue-number" style={{ color: venue.accent }}>0{index + 1}</span><span><strong>{venue.name}</strong><small>{venue.subtitle}</small></span><span aria-hidden="true">↗</span></button>)}</div> : null}
      {!fullPage ? <p className="world-help">Drag to orbit · scroll to zoom · right-drag to pan. Use WASD or arrows in Walk mode. All miniature paths are illustrative.</p> : null}
    </> : <div className="list-mode-note"><span aria-hidden="true">▤</span> 3D is off. <a href="/">Browse the accessible catalog on the planning desk ↗</a></div>}
    <span className="sr-only" role="status">{current ? `Showing ${current.name}. Only this building's live sessions are listed; none has been automatically selected.` : 'Campus overview.'}</span>
  </section>;
}
