/**
 * Display anchors on an ORIGINAL ILLUSTRATIVE tiny-planet Strip; not geographic coordinates.
 *
 * Sourced: the six venue names and what each hosts (2026 AWS agenda). Editorial/approximate (D-18): the
 * north-to-south order and which side of the boulevard each property sits on. The loop wraps the whole planet and
 * venues are spaced evenly around it (D-29), so distances are NOT to scale. No indoor layout or walking times.
 * Strip coordinates (layout.ts): +x is east of the boulevard, +z runs "south" along the loop.
 */
export type Vec3 = [number, number, number];

export const AGENDA_URL = 'https://aws.amazon.com/events/reinvent/agenda/';
export const VENUE_PAGE_URL = 'https://registration.awsevents.com/flow/awsevents/reinvent2026/venueshotel/page/venuehotel';

export const venues = [
  { id: 'encore', name: 'Encore', position: [6.4, 0, -31.4] as Vec3, side: 'east', color: '#c73b5c', accent: '#ff5c8a', subtitle: 'Crimson towers at the north end', hosts: ['Sessions', 'Activations and community spaces'] },
  { id: 'wynn', name: 'Wynn', position: [6.4, 0, -15.7] as Vec3, side: 'east', color: '#d4a03c', accent: '#f5c542', subtitle: 'Bronze curves and emerald gardens', hosts: ['Sessions', 'Activations and community spaces'] },
  { id: 'venetian', name: 'The Venetian', position: [6.4, 0, 0] as Vec3, side: 'east', color: '#e9b48f', accent: '#ff9f43', subtitle: 'Terracotta arches and a teal-capped campanile', hosts: ['Opening keynote', 'Expo', 'Badge pickup', 'Self-paced learning', 'Sessions', 'Networking receptions'] },
  { id: 'palace', name: 'Caesars Palace', position: [-6.4, 0, 23] as Vec3, side: 'west', color: '#e2c79b', accent: '#3c8dde', subtitle: 'Sandstone columns and blue-glass towers', hosts: ['Sessions', 'Self-paced learning', 'Activations and community spaces'] },
  { id: 'forum', name: 'Caesars Forum', position: [13.4, 0, 14] as Vec3, side: 'east', color: '#39a5a1', accent: '#20c9c0', subtitle: 'A programming-only hall set back from the boulevard', hosts: ['Sessions', 'Self-paced learning', 'Activations and community spaces'] },
  { id: 'mgm', name: 'MGM Grand', position: [6.4, 0, 39] as Vec3, side: 'east', color: '#2fa46a', accent: '#3ddc84', subtitle: 'Emerald glass at the far south end', hosts: ['Sessions', 'Activations and community spaces'] },
] as const;
export type VenueId = typeof venues[number]['id'];
/** Roof height of each illustrative building model (labels and pins float just above it). */
export const roofHeight: Record<VenueId | 'linq' | 'harrahs', number> = { encore: 6.4, wynn: 7.4, venetian: 6.6, palace: 6.2, forum: 2.6, mgm: 6.4, linq: 5, harrahs: 5.2 };
export type Venue = typeof venues[number];

/** Where the visitor stands to "arrive" at a venue: the plaza in front of its door. */
export function plazaOf(venue: { position: Vec3; side: 'east' | 'west' }): Vec3 {
  return [venue.position[0] + (venue.side === 'west' ? 3.3 : -3.3), 0, venue.position[2]];
}
/** Building yaw so its local +z entrance faces the boulevard. */
export function facingOf(venue: { side: 'east' | 'west' }) { return venue.side === 'west' ? Math.PI / 2 : -Math.PI / 2; }

/** Compare against catalog venue names ignoring case, spacing and a leading "The". Unmatched names are never guessed. */
export function normalizeVenueName(name: string | undefined) {
  return (name ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ').replace(/^the /, '');
}
/**
 * Match a catalog venue string to one of the six sourced venues. Exact names match, and so do names that START with
 * a venue name followed by a separator — e.g. "Encore Las Vegas" or "Encore at Wynn Las Vegas" → Encore,
 * "The Venetian Resort" → The Venetian. Nothing else is guessed: "Harrah's" or a bare "Caesars" stays unplaced.
 * The UI always shows the raw venue string the API returned.
 */
export function venueIdForName(name: string | undefined): VenueId | undefined {
  const wanted = normalizeVenueName(name);
  if (!wanted) return undefined;
  const exact = venues.find((venue) => normalizeVenueName(venue.name) === wanted);
  if (exact) return exact.id;
  return venues.find((venue) => {
    const base = normalizeVenueName(venue.name);
    return wanted.startsWith(base) && /^[\s,\-–—|:(/]/.test(wanted.slice(base.length));
  })?.id;
}
