import { type CorrectionDto, type CreateCorrection, CreateCorrectionSchema } from '@attendance/shared';
import { isApiError } from '../errors';
import type { AppDeps } from '../ports';
import { sendOrQueue } from './common';

export type CorrectionOutcome =
  | { kind: 'SUBMITTED'; correction: CorrectionDto }
  | { kind: 'PENDING_SYNC' }
  | { kind: 'INVALID'; message: string }
  | { kind: 'ERROR'; code: string; message: string };

/** FR09: staff submits a correction request (approved on the Admin Web). Idempotency key = correctionId. */
export async function submitCorrection(
  deps: AppDeps,
  input: Omit<CreateCorrection, 'correctionId'> & { correctionId?: string },
): Promise<CorrectionOutcome> {
  const body = { ...input, correctionId: input.correctionId ?? deps.uuid() };
  const parsed = CreateCorrectionSchema.safeParse(body);
  if (!parsed.success) return { kind: 'INVALID', message: parsed.error.issues[0]?.message ?? 'Invalid correction' };
  try {
    const out = await sendOrQueue<CorrectionDto>(deps, null, parsed.data.correctionId, { kind: 'CORRECTION', body: parsed.data });
    return out.kind === 'SENT' ? { kind: 'SUBMITTED', correction: out.response } : { kind: 'PENDING_SYNC' };
  } catch (e) {
    if (isApiError(e)) return { kind: 'ERROR', code: e.code, message: e.message };
    throw e;
  }
}
