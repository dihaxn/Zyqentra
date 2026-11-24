import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLUMNS, githubRef, groupCards, parseNewCard, proofSummary, relativeTime } from '../lib/board.mjs';
import { ALLOWED_METHODS, assertAllowedMethod } from '../lib/gateway-methods.mjs';
import { createSessionToken, passwordMatches, verifySessionToken } from '../lib/session.mjs';

const SECRET = 'x'.repeat(40);

function form(values) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

test('a fresh session token verifies, then expires after 12 hours', () => {
  const now = Date.UTC(2026, 10, 24, 12);
  const token = createSessionToken(SECRET, now);
  assert.equal(verifySessionToken(token, SECRET, now), true);
  assert.equal(verifySessionToken(token, SECRET, now + 11 * 3600_000), true);
  assert.equal(verifySessionToken(token, SECRET, now + 12 * 3600_000 + 1000), false);
});

test('tampered, foreign or malformed tokens are rejected', () => {
  const token = createSessionToken(SECRET);
  const [payload, signature] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ v: 1, exp: 9999999999 })).toString('base64url');
  assert.equal(verifySessionToken(`${forged}.${signature}`, SECRET), false);
  assert.equal(verifySessionToken(token, 'y'.repeat(40)), false);
  assert.equal(verifySessionToken(`${payload}.${signature}.x`, SECRET), false);
  assert.equal(verifySessionToken(undefined, SECRET), false);
  assert.equal(verifySessionToken(token, 'short'), false);
});

test('short session secrets are refused', () => {
  assert.throws(() => createSessionToken('too-short'), /at least 32/);
});

test('password check needs the exact password and a configured one', () => {
  assert.equal(passwordMatches('correct horse battery', 'correct horse battery'), true);
  assert.equal(passwordMatches('correct horse batter', 'correct horse battery'), false);
  assert.equal(passwordMatches('', ''), false);
  assert.equal(passwordMatches('short', 'short'), false);
});

test('the console can only call board and health methods', () => {
  assert.doesNotThrow(() => assertAllowedMethod('workboard.cards.move'));
  for (const method of ['config.set', 'tools.invoke', 'workboard.cards.delete', 'plugins.install', 'exec']) {
    assert.throws(() => assertAllowedMethod(method), /may not call/);
  }
  assert.equal([...ALLOWED_METHODS].some((method) => /delete|config|exec|install/.test(method)), false);
});

test('cards land in their columns, urgent first, archived ones hidden', () => {
  const columns = groupCards([
    { id: 'a', status: 'todo', priority: 'normal', position: 1 },
    { id: 'b', status: 'todo', priority: 'urgent', position: 2 },
    { id: 'c', status: 'scheduled', priority: 'low', position: 0 },
    { id: 'd', status: 'done', priority: 'normal', metadata: { archivedAt: 1 } },
    { id: 'e', status: 'mystery', priority: 'normal' },
  ]);
  assert.deepEqual(columns.map((column) => column.status), COLUMNS.map((column) => column.status));
  const byStatus = Object.fromEntries(columns.map((column) => [column.status, column.cards.map((card) => card.id)]));
  assert.deepEqual(byStatus.todo, ['b', 'a', 'c']);
  assert.deepEqual(byStatus.triage, ['e']);
  assert.deepEqual(byStatus.done, []);
});

test('proof summary keeps only the latest result per check', () => {
  const summary = proofSummary({
    metadata: {
      proof: [
        { id: '1', label: 'npm run verify', status: 'failed', createdAt: 1 },
        { id: '2', label: 'npm run verify', status: 'passed', createdAt: 2 },
        { id: '3', label: 'smoke preview', status: 'failed', createdAt: 3 },
      ],
    },
  });
  assert.equal(summary.passed, 1);
  assert.equal(summary.failed, 1);
});

test('GitHub links become short references', () => {
  assert.deepEqual(githubRef('https://github.com/dihaxn/Zyora-erp/pull/8'), {
    repository: 'dihaxn/Zyora-erp',
    kind: 'PR',
    number: 8,
  });
  assert.equal(githubRef('https://github.com/dihaxn/Zyora-erp/issues/12').kind, 'Issue');
  assert.equal(githubRef('https://example.com/x'), null);
});

test('new card form is validated into Workboard params', () => {
  assert.deepEqual(
    parseNewCard(
      form({ title: '  Fix receipts ', status: 'todo', priority: 'high', labels: 'Bug, POS,,', sourceUrl: '', notes: '' }),
    ),
    { params: { title: 'Fix receipts', status: 'todo', priority: 'high', labels: ['bug', 'pos'] } },
  );
  assert.match(parseNewCard(form({ title: ' ' })).error, /title/);
  assert.match(parseNewCard(form({ title: 'x', status: 'deleted' })).error, /status/);
  assert.match(parseNewCard(form({ title: 'x', priority: 'asap' })).error, /priority/);
  assert.match(parseNewCard(form({ title: 'x', sourceUrl: 'javascript:alert(1)' })).error, /https/);
});

test('relative times read naturally', () => {
  const now = 10 * 86_400_000;
  assert.equal(relativeTime(now - 30_000, now), 'just now');
  assert.equal(relativeTime(now - 5 * 60_000, now), '5 min ago');
  assert.equal(relativeTime(now - 3 * 3600_000, now), '3 h ago');
  assert.equal(relativeTime(now - 2 * 86_400_000, now), '2 d ago');
});
