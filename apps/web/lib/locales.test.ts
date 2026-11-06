import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/*
 * Every language in READY_LANGUAGES must have every English entry, with the same {{placeholders}},
 * so a new screen can't ship half translated. Keep this list in step with lib/languages.ts.
 */
const READY = ['es']

type Tree = { [key: string]: string | Tree }
const load = (code: string): Tree => JSON.parse(readFileSync(new URL(`../locales/${code}.json`, import.meta.url), 'utf8'))
const flatten = (tree: Tree, prefix = ''): Map<string, string> => {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') out.set(prefix + key, value)
    else for (const [k, v] of flatten(value, `${prefix}${key}.`)) out.set(k, v)
  }
  return out
}
const placeholders = (text: string) => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort().join(',')

const english = flatten(load('en'))

for (const code of READY) {
  test(`${code} has every English entry with the same placeholders`, () => {
    const other = flatten(load(code))
    const missing = [...english.keys()].filter((key) => !other.has(key))
    assert.deepEqual(missing, [], `${code}.json is missing ${missing.length} entries`)
    const mismatched = [...english].filter(([key, text]) => placeholders(text) !== placeholders(other.get(key) || '')).map(([key]) => key)
    assert.deepEqual(mismatched, [], `${code}.json has different {{placeholders}} in these entries`)
    const empty = [...other].filter(([key, text]) => english.has(key) && english.get(key) !== '' && !text.trim()).map(([key]) => key)
    assert.deepEqual(empty, [], `${code}.json has empty entries`)
  })
}
