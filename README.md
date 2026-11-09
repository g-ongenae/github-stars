# GitHub stars

A local page listing every repository you starred on GitHub, with a topic, its star
count and how alive it is (date of the last commit on the default branch). You can
search, filter, sort, edit the topic and add notes.

## Requirements

- Node.js 20 or later. No dependencies to install.
- The [GitHub CLI](https://cli.github.com/), logged in (`gh auth login`). Its token is
  used to call the GitHub API; set `GITHUB_TOKEN` to use another token instead.

## Usage

```sh
npm start              # start the server on http://127.0.0.1:7178 and open the page
npm run refresh        # fetch all stars into the cache, without the page
```

Running `npm start` again while the server runs just opens the page. To get a
`github-stars` command available everywhere, run `npm link` once.

## Where the data lives

Nothing is stored in this repository.

| File                                     | Content                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `~/.cache/github-stars/stars.json`       | Your stars as last fetched from GitHub. Safe to delete.                                                    |
| `~/.local/share/github-stars/edits.json` | Your Topic and Notes edits.                                                                                |
| `~/.local/share/github-stars/lists.json` | Optional: former GitHub star lists, `{ "List name": ["owner/repo"] }`. Shown in the "Former lists" column. |

`XDG_CACHE_HOME` and `XDG_DATA_HOME` are honoured, and `GITHUB_STARS_CACHE_DIR` /
`GITHUB_STARS_DATA_DIR` override the folders. `PORT` changes the port.

## How the page stays up to date

1. The page shows the cached stars right away. On the very first run there is no
   cache, so it waits for a full fetch (about a minute for 2,000 stars).
2. It then asks the server to check GitHub. One small query compares your star count
   and most recent star with the cache.
3. If they differ, or the cache is more than a day old (star counts and commit dates
   drift), the server fetches everything again and the page updates, saying which
   repositories were starred or unstarred.

The **Refresh** button forces a full fetch.

Topics are guessed from each repository's GitHub topics, then from words in its name
and description (rules in [`src/rows.js`](src/rows.js)). Anything unmatched is
"Other"; your edits always win over the guess.

## Development

```sh
npm test
```

| File                | Role                                                       |
| ------------------- | ---------------------------------------------------------- |
| `src/server.js`     | HTTP server, cache check and refresh, CLI flags            |
| `src/github.js`     | GraphQL queries through the GitHub CLI's token             |
| `src/rows.js`       | Topic guessing, former lists, diff between two fetches     |
| `src/store.js`      | Cache and data folders, JSON read/write                    |
| `public/index.html` | The page (no build step; reload the browser after editing) |
