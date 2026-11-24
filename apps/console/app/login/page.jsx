'use client';

import { useActionState } from 'react';
import { signIn } from './actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        action={action}
        className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div>
          <h1 className="text-lg font-semibold">Zyqentra</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Your team and its AI agents on one board.</p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Team password</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        {state?.message && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {state.message}
          </p>
        )}
        <button
          disabled={pending}
          className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
