// GitHub GraphQL access, authenticated with the token of the GitHub CLI (`gh auth login`).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const BATCH_SIZE = 50; // repositories per details query; 100 makes GitHub time out (502)
const CONCURRENCY = 4;
const RETRYABLE = new Set([502, 503, 504]);

const REPO_FIELDS = `
  nameWithOwner url description stargazerCount isArchived pushedAt
  primaryLanguage { name }
  repositoryTopics(first: 20) { nodes { topic { name } } }
  defaultBranchRef { target { ... on Commit { committedDate } } }`;

let tokenPromise;
function token() {
  tokenPromise ??= process.env.GITHUB_TOKEN
    ? Promise.resolve(process.env.GITHUB_TOKEN)
    : promisify(execFile)('gh', ['auth', 'token']).then(
        ({ stdout }) => stdout.trim(),
        (err) => {
          tokenPromise = undefined;
          throw new Error(`Could not get a GitHub token from the GitHub CLI. Run \`gh auth login\`. (${err.message})`);
        },
      );
  return tokenPromise;
}

async function graphql(query, variables = {}) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { authorization: `bearer ${await token()}`, 'user-agent': 'github-stars' },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      if (attempt >= 4) throw err;
      await sleep(attempt);
      continue;
    }
    if (RETRYABLE.has(res.status) && attempt < 4) {
      await sleep(attempt);
      continue;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.errors) {
      throw new Error(`GitHub API ${res.status}: ${body.errors?.map((e) => e.message).join('; ') || body.message}`);
    }
    return body.data;
  }
}

const sleep = (attempt) => new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));

// Cheap query used on every page load to tell whether the stars changed since the last fetch.
export async function fetchSummary() {
  const { viewer } = await graphql(`
    {
      viewer {
        login
        starredRepositories(first: 1, orderBy: { field: STARRED_AT, direction: DESC }) {
          totalCount
          edges {
            starredAt
            node {
              nameWithOwner
            }
          }
        }
      }
    }
  `);
  const s = viewer.starredRepositories;
  const e = s.edges[0];
  return { login: viewer.login, total: s.totalCount, latest: e ? `${e.node.nameWithOwner}@${e.starredAt}` : null };
}

// The starred-repositories connection is slow (~2 s per page whatever the fields), so it is
// paged for IDs only, and the details are fetched in parallel batches while it pages.
export async function fetchAllStars(onProgress = () => {}) {
  const starred = [];
  const details = new Map();
  const batches = [];
  const limit = limiter(CONCURRENCY);
  let summary;
  let after = null;
  do {
    const { viewer } = await graphql(
      `
        query ($after: String) {
          viewer {
            login
            starredRepositories(first: 100, after: $after, orderBy: { field: STARRED_AT, direction: DESC }) {
              totalCount
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                starredAt
                node {
                  id
                  nameWithOwner
                }
              }
            }
          }
        }
      `,
      { after },
    );
    const s = viewer.starredRepositories;
    if (!summary) {
      const e = s.edges[0];
      summary = {
        login: viewer.login,
        total: s.totalCount,
        latest: e ? `${e.node.nameWithOwner}@${e.starredAt}` : null,
      };
    }
    starred.push(...s.edges);
    for (let i = 0; i < s.edges.length; i += BATCH_SIZE) {
      const ids = s.edges.slice(i, i + BATCH_SIZE).map((e) => e.node.id);
      const batch = limit(async () => {
        const { nodes } = await graphql(
          `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Repository { ${REPO_FIELDS} } } }`,
          {
            ids,
          },
        );
        nodes.forEach((n, j) => details.set(ids[j], n));
        onProgress(details.size, summary.total);
      });
      batch.catch(() => {}); // awaited below; this only avoids an unhandled rejection while paging
      batches.push(batch);
    }
    after = s.pageInfo.hasNextPage ? s.pageInfo.endCursor : null;
  } while (after);
  await Promise.all(batches);
  // A repository that became private or was deleted comes back as null.
  return {
    ...summary,
    repos: starred.filter((e) => details.get(e.node.id)).map((e) => toRepo(e.starredAt, details.get(e.node.id))),
  };
}

function limiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

function toRepo(starredAt, n) {
  const last = n.defaultBranchRef?.target?.committedDate || n.pushedAt || '';
  return {
    repo: n.nameWithOwner,
    url: n.url,
    desc: n.description || '',
    stars: n.stargazerCount,
    last: last.slice(0, 10),
    starred: starredAt.slice(0, 10),
    archived: n.isArchived,
    lang: n.primaryLanguage?.name || '',
    tags: n.repositoryTopics.nodes.map((t) => t.topic.name),
  };
}
