/**
 * End-to-end verification of the HTTP client against a real socket.
 *
 * A stubbed `fetch` would test the code paths but not the transport, and the
 * transport is where the interesting failures live: a body that never arrives, a
 * non-JSON error page from a proxy, a connection refused because the backend is
 * not running. So this stands up an actual `node:http` server and points the
 * client at it.
 *
 * It also pins the response shapes against what the Spring Boot backend really
 * serves, which is what keeps the TypeScript interfaces honest: a DTO renamed on
 * either side fails here rather than silently becoming `undefined` at runtime.
 *
 * Run with:
 *   node --experimental-transform-types --no-warnings --import ./tools/register.mjs \
 *     tools/apiClient.ts
 */
import { createServer } from 'node:http';
// Types only. Node's builtin modules export these as types, and a value import
// for them fails at runtime with "does not provide an export named ...".
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  ApiRequestError,
  apiBaseUrl,
  createPlayer,
  getCars,
  getHealth,
  getLeaderboard,
  getPlayerRaces,
  getTracks,
  saveRaceResult,
  setApiBaseUrl,
  type BackendCar,
  type BackendHealth,
  type BackendTrack,
  type LeaderboardPage,
  type RaceRecord,
} from '../src/services/api';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (ok) console.log(`  PASS  ${label}`);
  else { failures++; console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`); }
}

/** One row of an ApiError body, shaped exactly as the backend sends it. */
function apiError(status: number, message: string, fieldErrors?: Record<string, string>) {
  return {
    timestamp: '2026-10-19T07:00:00.000000000Z',
    status,
    error: status === 404 ? 'Not Found' : 'Bad Request',
    message,
    path: '/api/test',
    fieldErrors: fieldErrors ?? null,
  };
}

// ---------------------------------------------------------------------------
// Stub server
// ---------------------------------------------------------------------------

/** Requests seen by the stub, so the harness can assert on what was sent. */
const received: { method: string; url: string; body: string; contentType?: string }[] = [];

const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    received.push({
      method: req.method ?? '',
      url: req.url ?? '',
      body,
      contentType: req.headers['content-type'],
    });

    const send = (status: number, payload: unknown, raw?: string) => {
      const text = raw ?? JSON.stringify(payload);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(text);
    };

    // Match on the pathname only. The client appends query strings, and an
    // exact match on req.url would 404 every paginated request.
    const path = (req.url ?? '').split('?')[0];

    switch (path) {
      case '/api/health':
        return send(200, {
          status: 'UP',
          application: 'nitro-run',
          version: '0.5.0-phase5',
          storage: 'mysql',
          persistent: true,
          message: 'MySQL-backed storage. Player-submitted races are still NOT authenticated.',
        } satisfies BackendHealth);

      case '/api/cars':
        return send(200, [
          { id: 'apex-vulcan', name: 'APEX VULCAN', blurb: 'Metallic orange supercar.',
            color: 16747520, speed: 8, acceleration: 7, handling: 6, nitro: 6, unlocked: true },
          { id: 'venom-verde', name: 'VENOM VERDE', blurb: null,
            color: 3800084, speed: 7, acceleration: 8, handling: 8, nitro: 5, unlocked: true },
        ] satisfies BackendCar[]);

      case '/api/tracks':
        return send(200, [
          { id: 'hawkins-streets', name: 'HAWKINS TOWN', description: 'Neon-lit suburban streets.',
            difficulty: 'MEDIUM', weather: 'RAIN', environment: 'TOWN', laps: 3, locked: false },
          { id: 'upside-down', name: 'THE UPSIDE DOWN', description: 'Corrupted earth.',
            difficulty: 'EXTREME', weather: 'SPORES', environment: 'CORRUPTED', laps: 3, locked: false },
        ] satisfies BackendTrack[]);

      case '/api/players':
        if (req.method === 'POST') {
          // Mirrors the backend's real validator: a name under 3 characters is
          // rejected with a per-field message.
          const name = JSON.parse(body).displayName as string;
          if (!name || name.length < 3) {
            return send(400, apiError(400, 'Validation failed', {
              displayName: 'must be 3-24 characters: letters, digits, spaces, underscores or hyphens',
            }));
          }
          return send(201, {
            id: 'plr_abc12345',
            displayName: name,
            selectedCarId: null,
            createdAt: '2026-10-19T07:00:00Z',
          });
        }
        break;

      case '/api/players/plr_abc12345/races':
        return send(200, [
          { id: 'race_1', playerId: 'plr_abc12345', carId: 'apex-vulcan', trackId: 'hawkins-streets',
            position: 1, lapsCompleted: 3, elapsedTimeMs: 134883, bestLapTimeMs: 44321,
            completedAt: '2026-10-19T07:00:00Z' },
        ] satisfies RaceRecord[]);

      // A profile that does not exist. The real backend answers 404 here, and the
      // message is what the results screen would show if a stored player id had
      // gone stale.
      case '/api/players/plr_nope/races':
        return send(404, apiError(404, "No player with id 'plr_nope'"));

      // A proxy answering 200 with nothing, which is a real failure mode and the
      // one most likely to turn into a confusing TypeError downstream.
      case '/api/players/plr_empty/races':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end('');

      case '/api/races':
        // A car the backend has never heard of.
        if (body.includes('"carId":"delorean"')) {
          return send(404, apiError(404, "No car with id 'delorean'"));
        }
        return send(201, {
          id: 'race_generated',
          message: 'Race record stored',
          race: { id: 'race_generated', playerId: 'plr_abc12345', carId: 'apex-vulcan',
            trackId: 'hawkins-streets', position: 1, lapsCompleted: 3, elapsedTimeMs: 120000,
            bestLapTimeMs: 40000, completedAt: '2026-10-19T07:00:00Z' },
        });

      // A gateway returning an HTML error page rather than the API's JSON.
      case '/api/leaderboard':
        if ((req.url ?? '').includes('sortBy=boom')) {
          res.writeHead(502, { 'Content-Type': 'text/html' });
          return res.end('<html><body>502 Bad Gateway</body></html>');
        }
        return send(200, {
          entries: [{ rank: 1, playerId: 'plr_abc12345', displayName: 'MIKE', carId: 'apex-vulcan',
            trackId: 'hawkins-streets', racesCompleted: 2, bestTimeMs: 134883, averageTimeMs: 140000,
            bestPosition: 1, score: 2180 }],
          page: 0, pageSize: 10, totalEntries: 1, totalPages: 1,
          sortBy: 'bestTimeMs', sortDirection: 'asc',
        } satisfies LeaderboardPage);

      // --- failure shapes, reachable only through real client calls -------
      case '/api/missing':
        return send(404, apiError(404, "No player with id 'plr_nope'"));

      default:
        return send(404, apiError(404, 'No endpoint'));
    }
  });
});

async function start(): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

/** Asserts that `fn` rejects with an ApiRequestError, and returns it. */
async function expectApiError(fn: () => Promise<unknown>): Promise<ApiRequestError | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error instanceof ApiRequestError ? error : null;
  }
}

async function main(): Promise<void> {
  const base = await start();
  setApiBaseUrl(base);

  console.log('\n[api-client] happy path returns typed data');
  const health = await getHealth();
  check('health.status is UP', health.status === 'UP');
  check('health.storage is mysql', health.storage === 'mysql', String(health.storage));
  check('health.persistent is true', health.persistent === true);

  const cars = await getCars();
  check('cars parsed as an array', Array.isArray(cars) && cars.length === 2);
  check('car id is the game\'s own literal', cars[0].id === 'apex-vulcan', cars[0]?.id);
  check('car color is a number', typeof cars[0].color === 'number');
  check('a null blurb survives as null', cars[1].blurb === null, String(cars[1].blurb));

  const tracks = await getTracks();
  check('tracks parsed', tracks.length === 2);
  check('track laps is a number', typeof tracks[0].laps === 'number');
  check('track id matches the game', tracks[0].id === 'hawkins-streets', tracks[0].id);

  console.log('\n[api-client] requests are built correctly');
  const listCall = received.find((r) => r.url === '/api/cars');
  check('GET carries no Content-Type header (avoids a needless CORS preflight)',
    listCall?.contentType === undefined, String(listCall?.contentType));

  await createPlayer({ displayName: 'MIKE' });
  const postCall = received.find((r) => r.url === '/api/players' && r.method === 'POST');
  check('POST sends Content-Type: application/json',
    postCall?.contentType === 'application/json', String(postCall?.contentType));
  check('POST body is the display name', postCall?.body.includes('MIKE') === true, postCall?.body);

  const board = await getLeaderboard({ sortBy: 'bestTimeMs', order: 'asc', page: 0, size: 10 });
  const boardCall = received.find((r) => r.url?.startsWith('/api/leaderboard'));
  check('leaderboard query parameters are encoded',
    boardCall?.url === '/api/leaderboard?sortBy=bestTimeMs&order=asc&page=0&size=10', boardCall?.url);
  check('leaderboard entries parsed', board.entries.length === 1);
  check('leaderboard totalPages parsed', board.totalPages === 1);

  await getLeaderboard();
  check('an empty query produces no stray "?"',
    received.some((r) => r.url === '/api/leaderboard'), 'expected a bare /api/leaderboard');

  const history = await getPlayerRaces('plr_abc12345');
  check('race history parsed', history.length === 1);
  check('history time is milliseconds', history[0].elapsedTimeMs === 134883);
  check('history nullable best lap preserved', typeof history[0].bestLapTimeMs === 'number');

  const saved = await saveRaceResult({
    playerId: 'plr_abc12345', carId: 'apex-vulcan', trackId: 'hawkins-streets',
    elapsedTimeMs: 120000, bestLapTimeMs: null, position: 1, lapsCompleted: 3,
  });
  check('save returns the generated id', saved.id === 'race_generated', saved.id);
  check('save echoes the stored record', saved.race.elapsedTimeMs === 120000);

  console.log('\n[api-client] HTTP failures become typed errors');
  // Reached through ordinary client calls, so this exercises the same code path
  // the app uses rather than a bespoke test-only route.
  const notFound = await expectApiError(() => getPlayerRaces('plr_nope'));
  check('404 is reported with its status', notFound?.status === 404, String(notFound?.status));
  check('404 carries the backend message',
    notFound?.message.includes('No player with id') === true, notFound?.message);
  check('404 is not treated as offline', notFound?.isOffline === false);
  check('404 is not retryable (the id will not come back)',
    notFound?.isRetryable === false, String(notFound?.isRetryable));

  const invalid = await expectApiError(() => createPlayer({ displayName: 'x' }));
  check('400 is reported with its status', invalid?.status === 400, String(invalid?.status));
  check('400 surfaces per-field errors',
    invalid?.fieldErrors?.displayName !== undefined, JSON.stringify(invalid?.fieldErrors));
  check('400 is not retryable (retrying would fail identically)',
    invalid?.isRetryable === false);

  // An HTML error page from a proxy: no JSON to read a message from.
  const badGateway = await expectApiError(() => getLeaderboard({ sortBy: 'boom' }));
  check('a non-JSON error body still yields a typed error', badGateway !== null);
  check('a gateway error is retryable', badGateway?.isRetryable === true, String(badGateway?.isRetryable));
  check('a non-JSON error falls back to a generic message, not a crash',
    badGateway?.message.includes('Request failed') === true, badGateway?.message);

  const empty = await expectApiError(() => getPlayerRaces('plr_empty'));
  check('an empty 200 body is rejected rather than returning undefined',
    empty !== null && empty.message.includes('Empty response'), empty?.message);

  const unknownCar = await expectApiError(() => saveRaceResult({
    playerId: 'plr_abc12345', carId: 'delorean', trackId: 'hawkins-streets',
    elapsedTimeMs: 120000, bestLapTimeMs: null, position: 1, lapsCompleted: 3,
  }));
  check('an unknown car surfaces as 404', unknownCar?.status === 404, String(unknownCar?.status));
  check('an unknown car is not retryable',
    unknownCar?.isRetryable === false, String(unknownCar?.isRetryable));

  console.log('\n[api-client] unreachable backend');
  // A port nothing is listening on: the exact state of "backend not started".
  setApiBaseUrl('http://127.0.0.1:1');
  const offline = await expectApiError(() => getHealth());
  check('connection refused becomes an ApiRequestError', offline !== null);
  check('offline is distinguishable (status 0)', offline?.status === 0, String(offline?.status));
  check('offline is flagged', offline?.isOffline === true);
  check('offline IS retryable (the backend may be started later)',
    offline?.isRetryable === true);
  check('offline names the URL it tried', offline?.message.includes('127.0.0.1:1') === true, offline?.message);
  check('offline carries no field errors', Object.keys(offline?.fieldErrors ?? {}).length === 0);

  console.log('\n[api-client] base URL handling');
  setApiBaseUrl(base);
  check('an override is used verbatim', apiBaseUrl() === base, apiBaseUrl());
  setApiBaseUrl(null);
  check('without an override it falls back to configuration',
    apiBaseUrl().startsWith('http'), apiBaseUrl());
  check('no trailing slash is left on the base URL',
    !apiBaseUrl().endsWith('/'), apiBaseUrl());

  server.close();
  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.log('\nSOME CHECKS FAILED');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('harness crashed:', error);
  process.exit(1);
});