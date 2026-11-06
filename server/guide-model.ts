import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { AwsCredentialIdentityProvider } from '@aws-sdk/types';
import type { GuideModel } from './guide.ts';

/** Bedrock Converse with no tools and a hard output-token cap. Credentials are supplied by the caller. */
export class BedrockGuideModel implements GuideModel {
  private client: BedrockRuntimeClient;
  constructor(private modelId: string, region: string, credentials?: AwsCredentialIdentityProvider) {
    this.client = new BedrockRuntimeClient({ region, credentials, maxAttempts: 2 });
  }
  async complete(system: string, user: string, maxTokens: number, signal: AbortSignal) {
    const output = await this.client.send(new ConverseCommand({
      modelId: this.modelId,
      system: [{ text: system }],
      messages: [{ role: 'user', content: [{ text: user }] }],
      inferenceConfig: { maxTokens, temperature: 0.1 },
    }), { abortSignal: signal });
    return output.output?.message?.content?.map((part) => part.text ?? '').join('') ?? '';
  }
}
