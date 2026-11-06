import assert from 'node:assert/strict';
import test from 'node:test';
import { BOUNDS, START, canWalkTo, findPath } from '../src/scene/navigation.ts';
import { FOUNTAIN, POND, deltaZ } from '../src/scene/layout.ts';
import { plazaOf, venueIdForName, venues } from '../src/scene/venues.ts';
import { places } from '../src/scene/places.ts';

test('illustrative visitor cannot walk off the diorama or through buildings, water and stalls', () => {
  assert.equal(canWalkTo(0, 0), true);
  assert.equal(canWalkTo(BOUNDS.maxX + 0.1, 0), false);
  assert.equal(canWalkTo(0, BOUNDS.minZ - 0.1), true, 'the loop wraps: there is no end of the Strip');
  assert.equal(canWalkTo(Number.NaN, 0), false);
  for (const venue of venues) assert.equal(canWalkTo(venue.position[0], venue.position[2]), false, venue.name);
  assert.equal(canWalkTo(FOUNTAIN.x, FOUNTAIN.z), false, 'decorative fountain');
  assert.equal(canWalkTo(POND.x, POND.z), false, 'decorative pond');
  assert.equal(canWalkTo(...START), true, 'the visitor starts on walkable ground');
});

test('every venue plaza is reachable and routes never cross an obstacle', () => {
  for (const venue of venues) {
    const [x, , z] = plazaOf(venue);
    assert.equal(canWalkTo(x, z), true, `${venue.name} plaza is walkable`);
    for (const from of [START, [-10.5, 10.5], [10.5, -12.5], [-10.5, -13]] as [number, number][]) {
      const route = findPath(from, [x, z]);
      assert.ok(route, `${venue.name} reachable from ${from}`);
      let previous = { x: from[0], z: from[1] };
      for (const point of route) {
        const dz = deltaZ(previous.z, point.z);
        for (let i = 1; i <= 20; i++) assert.equal(canWalkTo(previous.x + ((point.x - previous.x) * i) / 20, previous.z + (dz * i) / 20), true, `${venue.name}: segment stays walkable`);
        previous = point;
      }
      const end = route[route.length - 1]!;
      assert.ok(Math.hypot(end.x - x, deltaZ(end.z, z)) < 1e-9, `${venue.name}: route ends at the plaza`);
    }
  }
  assert.equal(findPath(START, [venues[0].position[0], venues[0].position[2]]), null, 'the inside of a building is never a destination');
});

test('catalog venue names match the six sourced names exactly or as a leading word, ignoring case, spacing and a leading "The"', () => {
  assert.equal(venueIdForName('  the   VENETIAN '), 'venetian');
  assert.equal(venueIdForName('Wynn'), 'wynn');
  // Prefix matches at a word boundary only (a catalog may append the city or resort name).
  assert.equal(venueIdForName('Wynn Las Vegas'), 'wynn');
  assert.equal(venueIdForName('Encore at Wynn Las Vegas'), 'encore', 'the leading name wins, never the embedded one');
  assert.equal(venueIdForName('The Venetian Resort'), 'venetian');
  assert.equal(venueIdForName('MGM Grand Conference Center'), 'mgm');
  assert.equal(venueIdForName('Encorehall'), undefined, 'no partial-word matches');
  assert.equal(venueIdForName('Caesars'), undefined, 'ambiguous names are never guessed');
  assert.equal(venueIdForName('Harrah’s Las Vegas'), undefined);
  assert.equal(venueIdForName(undefined), undefined);
});

test('every discoverable place (venues, landmarks, illustrative food and shuttle stops) is on walkable, reachable ground', () => {
  for (const place of places) {
    assert.equal(canWalkTo(place.spot[0], place.spot[2]), true, `${place.id} is walkable`);
    assert.ok(findPath(START, [place.spot[0], place.spot[2]]), `${place.id} is reachable`);
    assert.ok(place.source.startsWith('https://'), `${place.id} links its source`);
    if (place.kind === 'food' || place.kind === 'shuttle') assert.equal(place.provenance, 'illustrative', `${place.id} never claims to be official`);
  }
  assert.equal(new Set(places.map((place) => place.id)).size, places.length);
});

test('globe projection round-trips Strip coordinates, so a click on the sphere walks to the right spot', async () => {
  const { toGlobe, fromGlobe, RADIUS } = await import('../src/scene/globe.ts');
  for (const place of places) {
    const back = fromGlobe(toGlobe(place.spot[0], 0.3, place.spot[2]));
    assert.ok(Math.hypot(back.x - place.spot[0], back.z - place.spot[2]) < 1e-6, place.id);
  }
  const top = toGlobe(0, 0, 0);
  assert.ok(Math.abs(top.y - RADIUS) < 1e-9, 'the boulevard origin sits at the top of the planet');
  assert.ok(Math.abs(toGlobe(0, 0, 10).angleTo(top) - 10 / RADIUS) < 1e-9, 'distance along the boulevard is arc length');
});

test('the Strip is a loop round the whole planet: venues are spread evenly and routes can cross the seam', async () => {
  const { LOOP, deltaZ } = await import('../src/scene/layout.ts');
  const order = [...places.filter((place) => place.kind === 'venue' || place.id === 'landmark-replay' || place.id === 'landmark-airport')].map((place) => place.spot[2]).sort((a, b) => a - b);
  const gaps = order.map((z, i) => deltaZ(z, order[(i + 1) % order.length]!) + (i === order.length - 1 ? LOOP : 0)).map((gap) => ((gap % LOOP) + LOOP) % LOOP);
  assert.ok(Math.max(...gaps) < LOOP / 4, `no quarter of the planet is empty (largest gap ${Math.max(...gaps).toFixed(1)} of ${LOOP.toFixed(1)})`);
  const route = findPath([-2.15, LOOP / 2 - 2], [-2.15, -LOOP / 2 + 2]);
  assert.ok(route && route.length <= 3, 'crossing the loop seam is a short walk, not a trip round the planet');
});
