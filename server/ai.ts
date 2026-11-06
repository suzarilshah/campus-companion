import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { InvokeEndpointCommand, SageMakerRuntimeClient } from '@aws-sdk/client-sagemaker-runtime';
import { fromIni } from '@aws-sdk/credential-providers';
import { AppError } from './attendee.ts';
import type { AttendeeSchedule, LiveSession } from '../src/domain/live.ts';
import { SYSTEM_PROMPT, buildPrompt, fallbackPicks, looksLikeInjection, parseAnswer, scrubQuestion, shortlist, type AiAnswer, type AiMode, type AiRequest } from '../src/domain/ai.ts';
import { venues, type VenueId } from '../src/scene/venues.ts';

/**
 * Model access for the local app only (docs/ai-plan.md). Credentials come from the attendee's own AWS profile via the
 * SDK chain; nothing here sees Builder ID tokens. The provider has no tools and only returns text.
 */
export interface AiProvider { readonly name: string; complete(system: string, user: string, maxTokens: number, signal: AbortSignal): Promise<string> }

const credentials = () => (process.env.AI_AWS_PROFILE ? fromIni({ profile: process.env.AI_AWS_PROFILE }) : undefined);
const region = () => process.env.AI_AWS_REGION || process.env.AWS_REGION || 'us-east-1';

export class BedrockProvider implements AiProvider {
  readonly name: string;
  private client = new BedrockRuntimeClient({ region: region(), credentials: credentials() });
  constructor(private modelId: string, private guardrail?: { id: string; version: string }) { this.name = `Amazon Bedrock · ${modelId}${guardrail ? ' · Guardrail' : ''}`; }
  async complete(system: string, user: string, maxTokens: number, signal: AbortSignal) {
    const output = await this.client.send(new ConverseCommand({
      modelId: this.modelId,
      system: [{ text: system }],
      messages: [{ role: 'user', content: [{ text: user }] }],
      inferenceConfig: { maxTokens, temperature: 0.2 },
      ...(this.guardrail ? { guardrailConfig: { guardrailIdentifier: this.guardrail.id, guardrailVersion: this.guardrail.version } } : {}),
    }), { abortSignal: signal });
    if (output.stopReason === 'guardrail_intervened') throw new Error('Guardrail blocked this request.');
    return output.output?.message?.content?.map((part) => part.text ?? '').join('') ?? '';
  }
}

/** A SageMaker real-time endpoint. `openai` = messages API (vLLM/LMI/SGLang containers); `tgi` = {inputs, parameters}. */
export class SageMakerProvider implements AiProvider {
  readonly name: string;
  private client = new SageMakerRuntimeClient({ region: region(), credentials: credentials() });
  constructor(private endpoint: string, private format: 'openai' | 'tgi' = 'openai') { this.name = `Amazon SageMaker · ${endpoint}`; }
  async complete(system: string, user: string, maxTokens: number, signal: AbortSignal) {
    const body = this.format === 'tgi'
      ? { inputs: `${system}\n\nUser:\n${user}\n\nAssistant:\n`, parameters: { max_new_tokens: maxTokens, temperature: 0.2, return_full_text: false } }
      : { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: maxTokens, temperature: 0.2 };
    const output = await this.client.send(new InvokeEndpointCommand({ EndpointName: this.endpoint, ContentType: 'application/json', Accept: 'application/json', Body: new TextEncoder().encode(JSON.stringify(body)) }), { abortSignal: signal });
    const text = new TextDecoder().decode(output.Body);
    try {
      const value = JSON.parse(text);
      return value?.choices?.[0]?.message?.content ?? value?.generated_text ?? value?.[0]?.generated_text ?? text;
    } catch { return text; }
  }
}

export function providerFromEnv(env = process.env): AiProvider | undefined {
  if (env.AI_PROVIDER === 'bedrock' && env.BEDROCK_MODEL_ID) return new BedrockProvider(env.BEDROCK_MODEL_ID, env.BEDROCK_GUARDRAIL_ID ? { id: env.BEDROCK_GUARDRAIL_ID, version: env.BEDROCK_GUARDRAIL_VERSION || 'DRAFT' } : undefined);
  if (env.AI_PROVIDER === 'sagemaker' && env.SAGEMAKER_ENDPOINT) return new SageMakerProvider(env.SAGEMAKER_ENDPOINT, env.SAGEMAKER_FORMAT === 'tgi' ? 'tgi' : 'openai');
  return undefined;
}

const MODES: AiMode[] = ['concierge', 'guide', 'gaps', 'tldr'];
export const AI_LIMITS = { perMinute: 10, timeoutMs: 20_000, maxTokens: 600 } as const;

/** Validate the browser's request shape. Only enumerated modes, known venue ids and short strings get through. */
export function readRequest(body: unknown): AiRequest {
  const value = (body ?? {}) as Record<string, unknown>;
  const mode = MODES.find((item) => item === value.mode);
  if (!mode) throw new AppError(400, 'Unknown AI request.');
  const text = (key: string, max: number) => (typeof value[key] === 'string' ? (value[key] as string).slice(0, max) : undefined);
  const venueId = venues.find((venue) => venue.id === value.venueId)?.id as VenueId | undefined;
  const day = text('day', 10);
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new AppError(400, 'Unknown day.');
  if (mode === 'guide' && !venueId) throw new AppError(400, 'Choose a building first.');
  const sessionId = text('sessionId', 128);
  if (mode === 'tldr' && !sessionId) throw new AppError(400, 'Choose a session first.');
  return { mode, question: text('question', 600), day, venueId, sessionId };
}

export class AiService {
  private calls = new Map<string, number[]>();
  constructor(private provider?: AiProvider, private log: (entry: Record<string, unknown>) => void = (entry) => console.info(JSON.stringify({ ai: entry }))) {}
  get status() { return { enabled: Boolean(this.provider), provider: this.provider?.name ?? 'off' }; }

  private limit(key: string) {
    const now = Date.now();
    const recent = (this.calls.get(key) ?? []).filter((at) => at > now - 60_000);
    if (recent.length >= AI_LIMITS.perMinute) throw new AppError(429, 'Too many AI requests. Wait a minute and try again.');
    recent.push(now); this.calls.set(key, recent);
  }

  /** `sessions` and `schedule` come from the server's own cached catalog and GetSchedule, never from the browser. */
  async ask(key: string, request: AiRequest, sessions: LiveSession[], schedule?: AttendeeSchedule): Promise<AiAnswer> {
    this.limit(key);
    const question = scrubQuestion(request.question ?? '');
    const { candidates, gaps } = shortlist(sessions, schedule, request);
    const base = { mode: request.mode, shortlisted: candidates.length };
    if (!candidates.length) return { ...base, picks: [], fallback: true, provider: 'none', dropped: 0, note: request.mode === 'gaps' ? 'No free gaps with matching sessions were found for that day.' : 'No loaded sessions match. Try fewer words, another day, or another building.' };
    const started = Date.now();
    const fallback = (reason: string): AiAnswer => {
      this.log({ mode: request.mode, provider: this.provider?.name ?? 'off', ms: Date.now() - started, fallback: reason, shortlisted: candidates.length });
      if (request.mode === 'tldr') return { ...base, picks: [], fallback: true, provider: 'none', dropped: 0, note: 'AI summary unavailable; read the full abstract below.' };
      return { ...base, picks: fallbackPicks(request, candidates, gaps), fallback: true, provider: 'shortlist', dropped: 0, note: this.provider ? 'The AI model did not answer in time, so these are the top matches by keyword.' : 'AI is not configured on this computer, so these are the top matches by keyword.' };
    };
    if (!this.provider) return fallback('not configured');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_LIMITS.timeoutMs);
    try {
      const raw = await this.provider.complete(SYSTEM_PROMPT, buildPrompt(request, question, candidates, gaps), AI_LIMITS.maxTokens, controller.signal);
      const parsed = parseAnswer(raw, request, candidates, gaps);
      this.log({ mode: request.mode, provider: this.provider.name, ms: Date.now() - started, shortlisted: candidates.length, picks: parsed.picks.length, dropped: parsed.dropped, injectionFlag: looksLikeInjection(question) });
      if (request.mode !== 'tldr' && !parsed.picks.length) return fallback('no valid picks');
      return { ...base, ...parsed, fallback: false, provider: this.provider.name };
    } catch (error) {
      return fallback(error instanceof Error ? error.name === 'AbortError' ? 'timeout' : error.message.slice(0, 80) : 'error');
    } finally { clearTimeout(timer); }
  }
}
