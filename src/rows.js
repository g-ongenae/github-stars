// Turns cached repositories into the rows shown by the page: a topic guessed from
// keywords, and the former star lists each repository belonged to.

// Ordered: the first category whose keywords hit the repo's GitHub topics wins;
// otherwise fall back to words in the name and description.
const RULES = [
  [
    'Awesome lists & Learning',
    'awesome awesome-list list lists curated tutorial tutorials book books learning learn interview interview-questions roadmap cheatsheet cheat-sheet education course guide resources',
  ],
  [
    'AI & LLM',
    'ai llm llms machine-learning deep-learning gpt chatgpt openai claude claude-code anthropic ai-agents agent agents mcp rag nlp neural-network pytorch tensorflow gemini ollama copilot',
  ],
  [
    'Security & Privacy',
    'sbom compliance soc2 gdpr fuzzing backdoor censorship dpi vpn audit security privacy pentest pentesting encryption cryptography password passwords vulnerability vulnerabilities hacking infosec secrets authentication auth oauth',
  ],
  [
    'DevOps & Cloud',
    'kubectl kubectl-plugin airflow dbt queue queues dashboard wayland compositor kubernetes k8s docker devops terraform ci cd ci-cd github-actions helm aws gcp azure cloud containers container monitoring observability infrastructure ansible serverless deployment prometheus grafana nginx',
  ],
  [
    'Data & Databases',
    'json jsonrepair graph database databases postgresql postgres sql mysql sqlite mongodb redis data analytics visualization etl elasticsearch orm dataviz charts chart spreadsheet csv',
  ],
  [
    'Testing & Code quality',
    'testing test tests unit-testing e2e linter lint linting eslint static-analysis formatter prettier code-quality code-review refactoring benchmark mocking',
  ],
  [
    'APIs & Backend',
    'api apis openapi openapi3 swagger graphql rest rest-api http nestjs express fastify server backend microservices grpc webhook websocket json-schema',
  ],
  [
    'Frontend & Design',
    'react reactjs vue vuejs css frontend ui ux svelte nextjs components animation design svg html tailwind tailwindcss icons font fonts web-components design-system browser chrome firefox extension',
  ],
  [
    'Terminal & Shell',
    'cli terminal command-line shell zsh bash fish dotfiles tmux vim neovim nvim prompt tui console',
  ],
  ['Git & GitHub', 'git github gitlab github-app pull-requests commit'],
  [
    'Dev tools & Editors',
    'semver versioning monorepo package-manager packaging cargo cargo-plugin build cursor plugins keyboard keyboard-firmware editor vscode vscode-extension ide developer-tools devtools productivity markdown documentation docs debugger debugging',
  ],
  [
    'Languages & Compilers',
    'tc39 proposal ecmascript rust rust-lang python golang go cpp type-checking compiler programming-language language parser interpreter type-system haskell ocaml wasm webassembly functional-programming lisp elixir type-checker',
  ],
  [
    'Desktop & Mobile apps',
    'macos mac osx windows linux electron desktop app apps menubar android ios mobile swift raycast alfred',
  ],
  [
    'Media & Fun',
    'chess chess-engine emulation synthesizers emulator sdk music audio video image images game games photo photography spotify youtube podcast',
  ],
  ['JS/Node libraries', 'javascript nodejs node npm typescript library js'],
].map(([name, words]) => [name, new Set(words.split(' '))]);

export function categorize(tags, text) {
  for (const [name, kw] of RULES) if (tags.some((t) => kw.has(t))) return name;
  const words = text.toLowerCase().match(/[a-z0-9+#-]+/g) || [];
  for (const [name, kw] of RULES) if (words.some((w) => kw.has(w))) return name;
  return 'Other';
}

export function buildRows(repos, lists = {}) {
  const member = {};
  for (const [list, names] of Object.entries(lists)) for (const n of names) (member[n] ||= []).push(list);
  return repos.map((r) => ({
    ...r,
    topic: categorize(r.tags, `${r.repo.split('/')[1].replaceAll('-', ' ')} ${r.desc}`),
    lists: member[r.repo] || [],
    notes: '',
  }));
}

// What changed between two fetches, for the "updated" message on the page.
export function diffRepos(before = [], after = []) {
  const old = new Set(before.map((r) => r.repo));
  const now = new Set(after.map((r) => r.repo));
  return {
    added: after.filter((r) => !old.has(r.repo)).map((r) => r.repo),
    removed: before.filter((r) => !now.has(r.repo)).map((r) => r.repo),
  };
}
