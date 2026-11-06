import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIndoor, checkpointsTo, levelOf } from '../src/domain/indoor.ts';
import { normalizeSession } from '../src/domain/live.ts';

const session = (id: string, room?: string, extra: Record<string, unknown> = {}) => normalizeSession({ sessionId: id, title: `Session ${id}`, room, ...extra })!;

test('levels are read only when the room string states them', () => {
  assert.equal(levelOf('Venetian | Level 3 | Lido 3001A'), 3);
  assert.equal(levelOf('Floor 2, Room 210'), 2);
  assert.equal(levelOf('L4 - Ballroom'), 4);
  assert.equal(levelOf('Lido 3001A'), null, 'a room number is never turned into a floor');
  assert.equal(levelOf('Palazzo Ballroom'), null);
  assert.equal(levelOf('Lafite 4'), null);
  assert.equal(levelOf(undefined), null);
});

test('sessions are tallied to floors and rooms; missing rooms stay separate', () => {
  const model = buildIndoor([
    session('a', 'Level 2 | Room 201'), session('b', 'Level 2 | Room 201', { type: 'Workshop' }), session('c', 'Level 1 | Hall A'),
    session('d', 'Palazzo Ballroom'), session('e'),
  ]);
  assert.deepEqual(model.floors.map((floor) => floor.label), ['Level 1', 'Level 2', 'Level not listed']);
  assert.deepEqual(model.floors[1]!.rooms.map((room) => [room.name, room.sessions.length, room.formats]), [['Level 2 | Room 201', 2, ['Workshop']]]);
  assert.deepEqual(model.withoutRoom.map((item) => item.id), ['e']);
  assert.equal(model.sessions, 5);
});

test('checkpoints use only the stated level and room, and never invent a corridor route', () => {
  const known = checkpointsTo(session('x', 'Level 3 | Lido 3001A', { sessionTime: { date: '2026-12-01', time: '10:00' } }), 'The Venetian', false);
  assert.deepEqual(known.map((step) => step.id), ['travel', 'enter', 'level', 'room', 'arrive']);
  assert.equal(known[2]!.title, 'Go to Level 3');
  assert.match(known[3]!.detail, /not published/);
  const unknown = checkpointsTo(session('y'), 'Wynn', true);
  assert.deepEqual(unknown.map((step) => step.title), ['Enter Wynn', 'Find the right floor', 'Room not listed yet', 'Arrive for “Session y”']);
});
