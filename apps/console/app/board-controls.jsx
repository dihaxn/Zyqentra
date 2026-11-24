'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { COLUMNS } from '../lib/board.mjs';
import { createCard, dispatchReady, moveCard } from './actions';

const INPUT =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500';

function SubmitButton({ children, pendingText }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
    >
      {pending ? pendingText : children}
    </button>
  );
}

function Message({ state }) {
  if (!state?.message) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
      {state.message}
    </p>
  );
}

export function NewCardForm() {
  const [state, action] = useActionState(createCard, null);
  return (
    <details className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">New card</summary>
      <form
        action={action}
        className="grid gap-3 border-t border-slate-200 p-4 dark:border-slate-800 sm:grid-cols-2"
      >
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Title</span>
          <input name="title" required maxLength={200} className={INPUT} placeholder="Receipts print twice on Android" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Column</span>
          <select name="status" defaultValue="triage" className={INPUT}>
            {COLUMNS.map((column) => (
              <option key={column.status} value={column.status}>
                {column.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Priority</span>
          <select name="priority" defaultValue="normal" className={INPUT}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Labels</span>
          <input name="labels" className={INPUT} placeholder="bug, pos" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">GitHub issue or PR link</span>
          <input name="sourceUrl" type="url" className={INPUT} placeholder="https://github.com/dihaxn/Zyora-erp/issues/12" />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Notes</span>
          <textarea name="notes" rows={3} className={INPUT} placeholder="What, why, and how we will know it is done." />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <SubmitButton pendingText="Adding…">Add card</SubmitButton>
          <Message state={state} />
        </div>
      </form>
    </details>
  );
}

export function MoveCardForm({ id, status }) {
  return (
    <form action={moveCard} className="mt-2">
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`move-${id}`}>
        Move card
      </label>
      <select
        id={`move-${id}`}
        name="status"
        defaultValue={status === 'scheduled' ? 'todo' : status}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="w-full rounded border border-slate-200 bg-transparent px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"
      >
        {COLUMNS.map((column) => (
          <option key={column.status} value={column.status}>
            {column.label}
          </option>
        ))}
      </select>
    </form>
  );
}

export function DispatchButton() {
  const [state, action] = useActionState(dispatchReady, null);
  return (
    <form action={action} className="flex items-center gap-2">
      <Message state={state} />
      <SubmitButton pendingText="Starting…">Start ready cards</SubmitButton>
    </form>
  );
}
