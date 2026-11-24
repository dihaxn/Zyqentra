import { githubRef, groupCards, proofSummary, relativeTime } from '../lib/board.mjs';
import { callGateway, listAllCards } from '../lib/gateway.mjs';
import { signOut } from './login/actions';
import { DispatchButton, MoveCardForm, NewCardForm } from './board-controls';

export const dynamic = 'force-dynamic';

const PRIORITY_STYLES = {
  urgent: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  high: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  normal: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  low: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

async function loadBoard() {
  try {
    const [{ cards, complete }, health] = await Promise.all([listAllCards(), callGateway('health', {})]);
    return { cards, complete, health, error: null, now: Date.now() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { cards: [], complete: true, health: null, error: message, now: Date.now() };
  }
}

function Card({ card, now }) {
  const ref = githubRef(card.sourceUrl);
  const proof = proofSummary(card);
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{card.title}</p>
        {card.priority !== 'normal' && (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${PRIORITY_STYLES[card.priority] ?? ''}`}>
            {card.priority}
          </span>
        )}
      </div>
      {card.labels?.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {card.labels.map((label) => (
            <li
              key={label}
              className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
            >
              {label}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {ref ? (
          <a className="font-medium text-indigo-700 hover:underline dark:text-indigo-300" href={card.sourceUrl} target="_blank" rel="noreferrer">
            {ref.kind} #{ref.number}
          </a>
        ) : card.sourceUrl ? (
          <a className="text-indigo-700 hover:underline dark:text-indigo-300" href={card.sourceUrl} target="_blank" rel="noreferrer">
            Link
          </a>
        ) : null}
        {(proof.passed > 0 || proof.failed > 0) && (
          <span title={proof.entries.map((entry) => `${entry.label ?? entry.command}: ${entry.status}`).join('\n')}>
            {proof.passed > 0 && <span className="text-emerald-700 dark:text-emerald-400">✓ {proof.passed}</span>}
            {proof.passed > 0 && proof.failed > 0 && ' · '}
            {proof.failed > 0 && <span className="text-red-700 dark:text-red-400">✗ {proof.failed}</span>}
          </span>
        )}
        {card.agentId && <span>agent: {card.agentId}</span>}
        <span>{relativeTime(card.updatedAt, now)}</span>
      </div>
      <MoveCardForm id={card.id} status={card.status} />
    </li>
  );
}

export default async function BoardPage() {
  const { cards, complete, health, error, now } = await loadBoard();
  const columns = groupCards(cards);
  const active = cards.filter((card) => card.status !== 'done' && !card.metadata?.archivedAt).length;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Zyqentra</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {error
                ? 'Gateway unreachable'
                : `${active} open card${active === 1 ? '' : 's'} · Gateway ${health?.ok ? 'healthy' : 'degraded'}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DispatchButton />
            <form action={signOut}>
              <button className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-4 px-4 py-4 sm:px-6">
        {error ? (
          <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            <p className="font-medium">Cannot reach the OpenClaw Gateway.</p>
            <p className="mt-1">{error}</p>
            <p className="mt-1">Check that it is running and that OPENCLAW_GATEWAY_URL and OPENCLAW_GATEWAY_TOKEN are set for the console.</p>
          </section>
        ) : (
          <>
            <NewCardForm />
            {!complete && (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Showing the first {cards.length} cards. Archive finished work to see the rest.
              </p>
            )}
            <div className="grid gap-3 sm:grid-flow-col sm:auto-cols-[17rem] sm:overflow-x-auto sm:pb-3">
              {columns.map((column) => (
                <section
                  key={column.status}
                  aria-labelledby={`col-${column.status}`}
                  className="min-w-0 rounded-xl bg-slate-100 p-2 dark:bg-slate-900/60"
                >
                  <h2
                    id={`col-${column.status}`}
                    className="flex items-center justify-between px-1 pb-2 text-sm font-semibold text-slate-700 dark:text-slate-300"
                  >
                    {column.label}
                    <span className="rounded-full bg-white px-2 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      {column.cards.length}
                    </span>
                  </h2>
                  {column.cards.length === 0 ? (
                    <p className="hidden rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500 sm:block">
                      Nothing here
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {column.cards.map((card) => (
                        <Card key={card.id} card={card} now={now} />
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
