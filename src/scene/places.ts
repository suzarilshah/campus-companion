import { AGENDA_URL, VENUE_PAGE_URL, plazaOf, venues, type Vec3, type VenueId } from './venues';

/**
 * Every discoverable spot on the illustrative Strip, with its provenance spelled out.
 * - `agenda` / `venue-page`: the place and its role are stated by an official 2026 AWS page (link in `source`).
 * - `illustrative`: an editorial marker. Official sources publish no shuttle stops, routes, hours or food
 *   locations, so these only mark that such services exist; they never claim a real stop, menu or time.
 */
export type PlaceKind = 'venue' | 'landmark' | 'food' | 'shuttle';
export type Provenance = 'agenda' | 'venue-page' | 'illustrative';
export type Place = {
  id: string;
  kind: PlaceKind;
  name: string;
  /** Standing spot that counts as "discovered" when the visitor reaches it. */
  spot: Vec3;
  note: string;
  provenance: Provenance;
  source: string;
  venueId?: VenueId;
  color: string;
};

const venuePlaces: Place[] = venues.map((venue) => ({
  id: `venue-${venue.id}`, kind: 'venue', name: venue.name, spot: plazaOf(venue), venueId: venue.id, color: venue.accent,
  note: `2026 agenda: ${venue.hosts.join(', ')}.`, provenance: 'agenda', source: AGENDA_URL,
}));

/** Small hotels drawn as generic buildings; the venue page names them as the hotels nearest Caesars Forum. */
export const landmarkBuildings = [
  { id: 'harrahs', name: 'Harrah’s Las Vegas', position: [6.4, 0, 10.8] as Vec3, side: 'east' as const, color: '#e06d3c' },
  { id: 'linq', name: 'The LINQ Hotel', position: [6.4, 0, 17.2] as Vec3, side: 'east' as const, color: '#7b61d1' },
];

export const places: Place[] = [
  ...venuePlaces,
  { id: 'landmark-replay', kind: 'landmark', name: 'Las Vegas Festival Grounds', spot: [-4.6, 0, -44.6], color: '#b15cff', note: '2026 agenda: re:Play party, Thursday evening. Official shuttles run to re:Play.', provenance: 'agenda', source: AGENDA_URL },
  { id: 'landmark-airport', kind: 'landmark', name: 'Harry Reid International Airport', spot: [4.4, 0, 55], color: '#4cc9f0', note: '2026 agenda: badge pickup and help desk in Terminals 1 and 3.', provenance: 'agenda', source: AGENDA_URL },
  ...landmarkBuildings.map((hotel): Place => ({ id: `landmark-${hotel.id}`, kind: 'landmark', name: hotel.name, spot: plazaOf(hotel), color: hotel.color, note: 'Official venue page: a hotel near Caesars Forum, which is a programming-only venue.', provenance: 'venue-page', source: VENUE_PAGE_URL })),
  ...([
    ['food-encore', 'Encore', [3.3, 0, -27.2]], ['food-wynn', 'Wynn', [3.3, 0, -11.6]], ['food-venetian', 'The Venetian', [3.3, 0, 4.2]],
    ['food-palace', 'Caesars Palace', [-3.3, 0, 27.4]], ['food-forum', 'Caesars Forum', [10.1, 0, 18]], ['food-mgm', 'MGM Grand', [3.3, 0, 43.2]],
    ['food-replay', 'the Festival Grounds', [-3.3, 0, -51]], ['food-airport', 'the airport', [3.3, 0, 59.2]],
  ] as const).map(([id, near, spot]): Place => ({ id, kind: 'food', name: `Food & drink near ${near}`, spot: [...spot], color: '#ff8c42', note: 'Illustrative food spot. Official pages do not list dining locations or menus.', provenance: 'illustrative', source: VENUE_PAGE_URL })),
  ...[...venues.filter((venue) => venue.id !== 'forum').map((venue) => ({ id: venue.id, name: venue.name, spot: [venue.side === 'east' ? 2.35 : -2.35, 0, venue.position[2] - 2.6] as Vec3 })),
    { id: 'forum', name: 'Caesars Forum', spot: [2.35, 0, 12.6] as Vec3 },
    { id: 'replay', name: 'Festival Grounds', spot: [-2.35, 0, -41.6] as Vec3 },
    { id: 'airport', name: 'Airport', spot: [2.35, 0, 51.6] as Vec3 }]
    .map((stop): Place => ({ id: `shuttle-${stop.id}`, kind: 'shuttle', name: `Shuttle stop · ${stop.name}`, spot: stop.spot, color: '#118ab2', note: 'Illustrative stop. Official venue page: complimentary shuttles run between venues not within walking distance and to re:Play; stops and hours are not published.', provenance: 'illustrative', source: VENUE_PAGE_URL })),
];

export const placeById = new Map(places.map((place) => [place.id, place]));
export const shuttleStops = places.filter((place) => place.kind === 'shuttle');
