# CLAUDE.md

Local web page listing the user's GitHub stars. A zero-dependency Node server
(`src/server.js`) serves `public/index.html` and caches the stars outside the repo.
See README.md for usage, file roles and data locations.

## Rules

- Never write star data, edits or lists into the repository. They live in
  `~/.cache/github-stars` and `~/.local/share/github-stars` (`src/store.js`).
- `~/.local/share/github-stars/lists.json` holds the user's former GitHub star lists,
  which were deleted on GitHub: it cannot be fetched again. Don't overwrite it.
- Keep it dependency-free (Node built-ins, `fetch`, `node:test`).
- The starred-repositories GraphQL connection is slow (~2 s a page whatever the
  fields). `fetchAllStars` pages it for IDs only and fetches details with
  `nodes(ids:)` in parallel; details batches of 100 time out (502), keep 50.

## Validating a change

- `npm test`
- `PORT=7179 node src/server.js --no-open`, open the page, check it loads and says
  "up to date"; use temporary `GITHUB_STARS_CACHE_DIR` / `GITHUB_STARS_DATA_DIR` to
  test without touching the real cache and edits.
