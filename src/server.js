#!/usr/bin/env node
// Serves the page on localhost and keeps the local cache of your GitHub stars up to date.
//
//   github-stars             start the server (or reuse a running one) and open the page
//   github-stars --no-open   start the server without opening a browser
//   github-stars --refresh   fetch all stars into the cache and exit
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { fetchAllStars, fetchSummary } from './github.js';
import { buildRows, diffRepos } from './rows.js';
import { CACHE_DIR, DATA_DIR, FILES, readJson, writeJson } from './store.js';

const PORT = Number(process.env.PORT) || 7178;
const MAX_AGE_MS = 24 * 3600e3; // star counts and commit dates drift; refetch everything once a day
const PAGE = fileURLToPath(new URL('../public/index.html', import.meta.url));
const ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);

let progress = { running: false, done: 0, total: 0, error: null };
let job = null;

// Single flight: concurrent callers share the same fetch.
function refresh() {
  job ??= (async () => {
    progress = { running: true, done: 0, total: 0, error: null };
    try {
      const before = await readJson(FILES.stars, null);
      const fetched = await fetchAllStars((done, total) => Object.assign(progress, { done, total }));
      await writeJson(FILES.stars, { fetchedAt: new Date().toISOString(), ...fetched });
      return diffRepos(before?.repos, fetched.repos);
    } catch (err) {
      progress.error = err.message;
      throw err;
    } finally {
      progress.running = false;
      job = null;
    }
  })();
  return job;
}

async function payload() {
  const [cache, lists, edits] = await Promise.all([
    readJson(FILES.stars, null),
    readJson(FILES.lists, {}),
    readJson(FILES.edits, {}),
  ]);
  if (!cache) return null;
  const { repos, ...meta } = cache;
  return { ...meta, rows: buildRows(repos, lists), edits };
}

// Compares a one-item query with the cache; refetches everything only when needed.
async function check(force) {
  const cache = await readJson(FILES.stars, null);
  let reason = force ? 'forced' : !cache ? 'no cache' : null;
  if (!reason && Date.now() - Date.parse(cache.fetchedAt) > MAX_AGE_MS) reason = 'older than a day';
  if (!reason) {
    const s = await fetchSummary();
    if (s.login !== cache.login || s.total !== cache.total || s.latest !== cache.latest) reason = 'stars changed';
  }
  if (!reason) return { changed: false };
  const diff = await refresh();
  return { changed: true, reason, ...diff, ...(await payload()) };
}

const routes = {
  'GET /': async (req, res) => send(res, 200, await readFile(PAGE), 'text/html; charset=utf-8'),
  'GET /api/ping': async (req, res) => json(res, 200, { app: 'github-stars' }),
  'GET /api/progress': async (req, res) => json(res, 200, progress),
  'GET /api/stars': async (req, res) => {
    let data = await payload();
    if (!data) {
      await refresh();
      data = await payload();
    }
    json(res, 200, data);
  },
  'POST /api/check': async (req, res) => json(res, 200, await check((await body(req)).force === true)),
  'PUT /api/edits': async (req, res) => {
    const { repo, field, value } = await body(req);
    if (typeof repo !== 'string' || !['topic', 'notes'].includes(field) || typeof value !== 'string') {
      return json(res, 400, { error: 'Expected { repo, field: "topic" | "notes", value: string }' });
    }
    const edits = await readJson(FILES.edits, {});
    (edits[repo] ||= {})[field] = value.slice(0, 5000);
    await writeJson(FILES.edits, edits);
    json(res, 200, { ok: true });
  },
  'DELETE /api/edits': async (req, res) => {
    await writeJson(FILES.edits, {});
    json(res, 200, { ok: true });
  },
};

const server = createServer(async (req, res) => {
  // Only answer this machine's browser: reject other Host names (DNS rebinding) and
  // writes from other sites (they can't send application/json without a preflight we never allow).
  const host = `http://${req.headers.host}`;
  const write = req.method !== 'GET';
  if (
    !ORIGINS.has(host) ||
    (write && req.headers.origin && !ORIGINS.has(req.headers.origin)) ||
    (write && !req.headers['content-type']?.startsWith('application/json'))
  ) {
    return json(res, 403, { error: 'Forbidden' });
  }
  const route = routes[`${req.method} ${new URL(req.url, host).pathname}`];
  if (!route) return json(res, 404, { error: 'Not found' });
  try {
    await route(req, res);
  } catch (err) {
    console.error(err);
    json(res, 500, { error: err.message });
  }
});

function send(res, status, data, type) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(data);
}
const json = (res, status, value) => send(res, status, JSON.stringify(value), 'application/json');

async function body(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  execFile(cmd, [url], () => {});
}

async function alreadyRunning(url) {
  try {
    return (await (await fetch(`${url}/api/ping`)).json()).app === 'github-stars';
  } catch {
    return false;
  }
}

const args = new Set(process.argv.slice(2));
const url = `http://127.0.0.1:${PORT}`;

if (args.has('--refresh')) {
  let shown = -1;
  const timer = setInterval(() => {
    if (progress.total && progress.done !== shown)
      process.stdout.write(`\r${(shown = progress.done)}/${progress.total}`);
  }, 500);
  const { added, removed } = await refresh().finally(() => clearInterval(timer));
  console.log(`\r${progress.total} stars cached in ${FILES.stars} (+${added.length} / -${removed.length})`);
} else if (await alreadyRunning(url)) {
  console.log(`Already running at ${url}`);
  if (!args.has('--no-open')) openBrowser(url);
} else {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`GitHub stars at ${url}  (Ctrl-C to stop)`);
    console.log(`  cache: ${CACHE_DIR}\n  data:  ${DATA_DIR}`);
    if (!args.has('--no-open')) openBrowser(url);
  });
}
