import { clientAwardValue, labelFor, levelFor, quests, type ProgressView } from './progress';

/**
 * Hosted preview (e.g. Vercel). AWS attendee sign-in only works with a callback on the attendee's own computer, so
 * the hosted build never calls /api: no sign-in, no sessions, no writes to AWS. Exploration EXP is kept in this
 * browser only, using the same award rules as the local server. Planning EXP needs GetSchedule, so it is never granted here.
 */
export const HOSTED = import.meta.env.VITE_HOSTED === '1';
export const REPO_URL = 'https://github.com/suzarilshah/campus-companion';

const STORE = 'campus-hosted-progress';
type Awards = Record<string, { exp: number; at: string }>;

function read(): Awards {
  try { const value = JSON.parse(localStorage.getItem(STORE) ?? '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; }
}
function write(awards: Awards) { try { localStorage.setItem(STORE, JSON.stringify(awards)); } catch { /* private mode: progress lasts this visit */ } }

let memory: Awards | undefined;
const load = () => (memory ??= read());

function render(awards: Awards, recent: string[]): ProgressView {
  const keys = new Set(Object.keys(awards));
  const exp = Object.values(awards).reduce((sum, award) => sum + award.exp, 0);
  return {
    exp, level: levelFor(exp),
    discovered: [...keys].filter((key) => key.startsWith('discover:')).map((key) => key.slice('discover:'.length)),
    quests: quests.map((quest) => ({ id: quest.id, title: quest.title, detail: quest.detail, exp: quest.exp, done: keys.has(`quest:${quest.id}`) })),
    recent: recent.map((key) => ({ key, exp: awards[key]!.exp, label: labelFor(key) })),
    storage: 'this browser (hosted preview)', profile: 'guest',
  };
}

export function hostedView(): ProgressView { return render(load(), []); }

/** Same validation as the server: unknown keys are ignored, repeats are no-ops, quests complete automatically. */
export function hostedAward(key: string): ProgressView {
  const awards = load();
  if (awards[key]) return render(awards, []);
  const value = clientAwardValue(key, new Set(Object.keys(awards)));
  if (value === undefined) return render(awards, []);
  const at = new Date().toISOString();
  const added = [key];
  awards[key] = { exp: value, at };
  const keys = new Set(Object.keys(awards));
  for (const quest of quests) {
    const id = `quest:${quest.id}`;
    if (!keys.has(id) && quest.done(keys)) { awards[id] = { exp: quest.exp, at }; keys.add(id); added.push(id); }
  }
  write(awards);
  return render(awards, added);
}
