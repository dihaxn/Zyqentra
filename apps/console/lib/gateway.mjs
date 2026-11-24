import 'server-only';
import { GatewayClient } from '@openclaw/gateway-client';
import { PROTOCOL_VERSION } from '@openclaw/gateway-protocol/version';
import { assertAllowedMethod } from './gateway-methods.mjs';

const CONNECT_TIMEOUT_MS = 10_000;

/**
 * One Gateway connection per server process, reused across requests. The token
 * stays on the server: browsers only ever talk to this app.
 */
function connect() {
  const url = process.env.OPENCLAW_GATEWAY_URL ?? 'ws://127.0.0.1:18789';
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  if (!token) throw new Error('OPENCLAW_GATEWAY_TOKEN is not set for the console.');

  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const client = new GatewayClient({
    url,
    token,
    minProtocol: PROTOCOL_VERSION,
    maxProtocol: PROTOCOL_VERSION,
    onHelloOk: () => readyResolve(),
    onConnectError: (error) => readyReject(error),
  });
  client.start();
  const timer = setTimeout(() => readyReject(new Error(`Gateway at ${url} did not answer.`)), CONNECT_TIMEOUT_MS);
  ready.finally(() => clearTimeout(timer)).catch(() => undefined);
  return { client, ready };
}

function connection() {
  const cache = globalThis;
  if (!cache.__crewloomGateway) {
    cache.__crewloomGateway = connect();
    cache.__crewloomGateway.ready.catch(() => {
      // Let the next request try a fresh connection.
      cache.__crewloomGateway?.client.stop();
      cache.__crewloomGateway = undefined;
    });
  }
  return cache.__crewloomGateway;
}

export async function callGateway(method, params = {}) {
  assertAllowedMethod(method);
  const { client, ready } = connection();
  await ready;
  return client.request(method, params);
}

/** Every card on a board, following the Workboard's cursor pages (bounded). */
export async function listAllCards(boardId, maxPages = 10) {
  const cards = [];
  let after;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await callGateway('workboard.cards.list', {
      ...(boardId ? { boardId } : {}),
      ...(after ? { after } : {}),
    });
    cards.push(...(result.cards ?? []));
    if (!result.nextCursor) return { cards, complete: true };
    after = result.nextCursor;
  }
  return { cards, complete: false };
}
