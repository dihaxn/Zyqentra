'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '../lib/auth.mjs';
import { STATUSES, parseNewCard } from '../lib/board.mjs';
import { callGateway } from '../lib/gateway.mjs';

function failure(error) {
  return { ok: false, message: error instanceof Error ? error.message : 'Something went wrong.' };
}

export async function createCard(_previous, form) {
  try {
    await requireSession();
    const { params, error } = parseNewCard(form);
    if (error) return { ok: false, message: error };
    await callGateway('workboard.cards.create', params);
    revalidatePath('/');
    return { ok: true, message: `Added “${params.title}”.` };
  } catch (error) {
    return failure(error);
  }
}

export async function moveCard(form) {
  await requireSession();
  const id = String(form.get('id') ?? '');
  const status = String(form.get('status') ?? '');
  if (!id || !STATUSES.has(status)) throw new Error('Unknown card or status.');
  await callGateway('workboard.cards.move', { id, status });
  revalidatePath('/');
}

export async function dispatchReady(_previous) {
  try {
    await requireSession();
    const result = await callGateway('workboard.cards.dispatch', {});
    revalidatePath('/');
    const started = Array.isArray(result?.started) ? result.started.length : null;
    return { ok: true, message: started === null ? 'Dispatch requested.' : `Started ${started} card(s).` };
  } catch (error) {
    return failure(error);
  }
}
