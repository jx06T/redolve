import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { BatchJob, InlinedRequest } from '@google/genai';
import { buildCorrectionPrompt, buildCorrectionSchema } from './correctionPrompts';
import type { CorrectionContext } from './correctionPrompts';
import { DEFAULT_GEMINI_STUDY_MODEL } from './models';

export interface CorrectionBatchProvider {
  create(id: string, model: string, inputs: { key: string; image: ArrayBuffer; context: CorrectionContext }[]): Promise<BatchJob>;
  get(name: string): Promise<BatchJob>;
  find(id: string): Promise<BatchJob | undefined>;
  remove(name: string): Promise<void>;
}
const displayName = (id: string) => `redolve-correction-${id}`;
export function geminiCorrectionBatch(apiKey: string): CorrectionBatchProvider {
  // No automatic POST retries: a timeout may already have created a billable job.
  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 25000, retryOptions: { attempts: 1 } } });
  return {
    async create(id, model, inputs) {
      const src: InlinedRequest[] = inputs.map(input => {
        let binary = ''; const bytes = new Uint8Array(input.image);
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return { metadata: { key: input.key }, contents: [{ role: 'user', parts: [
          { text: buildCorrectionPrompt(input.context) }, { inlineData: { mimeType: 'image/jpeg', data: btoa(binary) } },
        ] }], config: { responseMimeType: 'application/json', responseSchema: buildCorrectionSchema(), temperature: 0.2, maxOutputTokens: 12000,
          ...(model === DEFAULT_GEMINI_STUDY_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}) } };
      });
      if (new TextEncoder().encode(JSON.stringify(src)).length > 18000000) throw Error('Batch input exceeds budget');
      return client.batches.create({ model, src, config: { displayName: displayName(id) } });
    },
    get: name => client.batches.get({ name }),
    async find(id) {
      // Bounded recovery after an ambiguous create response. Never blindly resubmit.
      const pager = await client.batches.list({ config: { pageSize: 100 } });
      let count = 0;
      for await (const job of pager) {
        if (job.displayName === displayName(id)) return job;
        if (++count >= 300) break;
      }
      return undefined;
    },
    async remove(name) {
      try { await client.batches.delete({ name }); } catch (error) {
        if (!(error && typeof error === 'object' && 'status' in error && Number(error.status) === 404)) throw error;
      }
    },
  };
}
