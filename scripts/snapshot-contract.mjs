import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = 'https://api.awsevents.com/v1/openapi.json';
const response = await fetch(source, { redirect: 'error', signal: AbortSignal.timeout(20000) });
if (!response.ok) throw new Error(`Contract retrieval failed: ${response.status}`);
const text = await response.text();
const contract = JSON.parse(text);
if (!String(contract.openapi).startsWith('3.1.') || !contract.paths || !contract.components?.schemas?.Session) {
  throw new Error('Unexpected contract. Existing snapshot retained.');
}
const content = JSON.stringify(contract, null, 2) + '\n';
await writeFile(new URL('../contracts/aws-events.openapi.json', import.meta.url), content);
await writeFile(new URL('../contracts/provenance.json', import.meta.url), JSON.stringify({
  source, retrievedAt: new Date().toISOString(), sha256: createHash('sha256').update(content).digest('hex'),
}, null, 2) + '\n');
console.info('Public contract snapshot written; review the schema diff before adopting changes.');
