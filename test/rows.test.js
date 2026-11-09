import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRows, categorize, diffRepos } from '../src/rows.js';

const repo = (name, extra = {}) => ({ repo: name, desc: '', tags: [], ...extra });

test('GitHub topics win over words in the description', () => {
  assert.equal(categorize(['react'], 'a cli for llm agents'), 'Frontend & Design');
});

test('falls back to the name and description, then to Other', () => {
  assert.equal(categorize([], 'zsh prompt'), 'Terminal & Shell');
  assert.equal(categorize([], 'laptop'), 'Other');
});

test('buildRows adds the topic and the former lists of each repo', () => {
  const rows = buildRows([repo('a/neovim-config'), repo('b/thing')], {
    Shell: ['a/neovim-config'],
    Misc: ['a/neovim-config'],
  });
  assert.deepEqual(
    rows.map((r) => [r.repo, r.topic, r.lists]),
    [
      ['a/neovim-config', 'Terminal & Shell', ['Shell', 'Misc']],
      ['b/thing', 'Other', []],
    ],
  );
});

test('diffRepos lists starred and unstarred repos', () => {
  assert.deepEqual(diffRepos([repo('a/x'), repo('b/y')], [repo('b/y'), repo('c/z')]), {
    added: ['c/z'],
    removed: ['a/x'],
  });
  assert.deepEqual(diffRepos(undefined, [repo('a/x')]), { added: ['a/x'], removed: [] });
});
