// Where the app keeps its files. Nothing is written inside the repository.
//   cache dir: stars fetched from GitHub; safe to delete, it is fetched again.
//   data dir:  your Topic/Notes edits and the former star lists; not recoverable from GitHub.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const home = homedir();
export const CACHE_DIR =
  process.env.GITHUB_STARS_CACHE_DIR || join(process.env.XDG_CACHE_HOME || join(home, '.cache'), 'github-stars');
export const DATA_DIR =
  process.env.GITHUB_STARS_DATA_DIR || join(process.env.XDG_DATA_HOME || join(home, '.local', 'share'), 'github-stars');

export const FILES = {
  stars: join(CACHE_DIR, 'stars.json'), // { fetchedAt, login, total, latest, repos: [...] }
  edits: join(DATA_DIR, 'edits.json'), // { "owner/name": { topic?, notes? } }
  lists: join(DATA_DIR, 'lists.json'), // { "List name": ["owner/name", ...] }
};

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

// Write to a temp file then rename, so a crash never leaves half a file behind.
export async function writeJson(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 1) + '\n');
  await rename(tmp, file);
}
