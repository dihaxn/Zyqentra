// Pure board logic shared by the pages, the server actions and the tests.

export const COLUMNS = [
  { status: 'triage', label: 'Inbox' },
  { status: 'backlog', label: 'Backlog' },
  { status: 'todo', label: 'To do' },
  { status: 'ready', label: 'Ready for an agent' },
  { status: 'running', label: 'In progress' },
  { status: 'review', label: 'In review' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'done', label: 'Done' },
];

export const STATUSES = new Set([...COLUMNS.map((column) => column.status), 'scheduled']);
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };

export function statusLabel(status) {
  if (status === 'scheduled') return 'Scheduled';
  return COLUMNS.find((column) => column.status === status)?.label ?? status;
}

/** Proof counts and the latest result per label, newest first. */
export function proofSummary(card) {
  const proof = card?.metadata?.proof ?? [];
  const latest = new Map();
  for (const entry of [...proof].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))) {
    const key = entry.label ?? entry.command ?? entry.id;
    if (!latest.has(key)) latest.set(key, entry);
  }
  const entries = [...latest.values()];
  return {
    passed: entries.filter((entry) => entry.status === 'passed').length,
    failed: entries.filter((entry) => entry.status === 'failed').length,
    entries,
  };
}

export function githubRef(url) {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(issues|pull)\/(\d+)/.exec(url ?? '');
  if (!match) return null;
  return { repository: match[1], kind: match[2] === 'pull' ? 'PR' : 'Issue', number: Number(match[3]) };
}

/** Group cards into the board's columns: priority first, then the board's own order. */
export function groupCards(cards) {
  const byStatus = new Map(COLUMNS.map((column) => [column.status, []]));
  for (const card of cards) {
    if (card?.metadata?.archivedAt) continue;
    const status = card.status === 'scheduled' ? 'todo' : card.status;
    (byStatus.get(status) ?? byStatus.get('triage')).push(card);
  }
  return COLUMNS.map((column) => ({
    ...column,
    cards: byStatus
      .get(column.status)
      .sort(
        (a, b) =>
          (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || (a.position ?? 0) - (b.position ?? 0),
      ),
  }));
}

/** Validate the "new card" form into Workboard create params. */
export function parseNewCard(form) {
  const title = String(form.get('title') ?? '').trim();
  if (title === '') return { error: 'Give the card a title.' };
  if (title.length > 200) return { error: 'Keep the title under 200 characters.' };
  const status = String(form.get('status') ?? 'triage');
  if (!STATUSES.has(status)) return { error: 'Unknown status.' };
  const priority = String(form.get('priority') ?? 'normal');
  if (!PRIORITIES.includes(priority)) return { error: 'Unknown priority.' };
  const labels = String(form.get('labels') ?? '')
    .split(',')
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
  const sourceUrl = String(form.get('sourceUrl') ?? '').trim();
  if (sourceUrl !== '' && !/^https:\/\//.test(sourceUrl)) return { error: 'The link must start with https://.' };
  const notes = String(form.get('notes') ?? '').trim().slice(0, 10_000);
  return {
    params: {
      title,
      status,
      priority,
      labels,
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(notes ? { notes } : {}),
    },
  };
}

export function relativeTime(timestamp, now = Date.now()) {
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.floor((now - timestamp) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
