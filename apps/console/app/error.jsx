'use client';

export default function BoardError({ error, reset }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="w-full max-w-md space-y-3 rounded-xl border border-red-200 bg-white p-6 dark:border-red-900 dark:bg-slate-900">
        <h1 className="text-lg font-semibold">That did not work</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {error?.message || 'The board could not finish that change.'} Nothing else was changed.
        </p>
        <button
          onClick={() => reset()}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Back to the board
        </button>
      </section>
    </main>
  );
}
