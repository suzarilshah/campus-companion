import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('reviewed public contract fingerprint and adapter field assumptions remain intact', async () => {
  const content = await readFile(new URL('../contracts/aws-events.openapi.json', import.meta.url), 'utf8');
  const provenance = JSON.parse(await readFile(new URL('../contracts/provenance.json', import.meta.url), 'utf8'));
  assert.equal(createHash('sha256').update(content).digest('hex'), provenance.sha256);
  const contract = JSON.parse(content);
  assert.match(contract.openapi, /^3\.1\./);
  assert.equal(contract.paths['/v1/events/{eventId}/sessions'].get.operationId, 'ListSessions');
  const schemas = contract.components.schemas;
  for (const field of ['items', 'nextToken', 'totalCount']) assert.ok(schemas.ListSessionsResponseContent.properties[field]);
  for (const field of ['sessionId', 'sessionTime', 'title', 'venue']) assert.ok(schemas.Session.properties[field]);
  for (const field of ['date', 'time', 'length', 'timezone']) assert.ok(schemas.SessionTime.properties[field]);
  assert.deepEqual([...schemas.Schedule.required].sort(), ['favorites', 'personalTime', 'reserved']);
  assert.deepEqual([...schemas.BulkResult.required].sort(), ['failed', 'successful']);
});
