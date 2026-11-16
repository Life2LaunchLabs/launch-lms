import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ownServerImage } from './ownServerImage.ts'

test('an outside picture is shown through our own image route, so the other site never sees the learner', () => {
  const src = 'https://cdn.example.org/cover.jpg?x=1&y=2'
  assert.equal(ownServerImage(src), `/_next/image?url=${encodeURIComponent(src)}&w=1080&q=75`)
  assert.equal(ownServerImage('http://img.example.com/a.png')?.startsWith('/_next/image?url=http%3A%2F%2F'), true)
})

test('our own and missing pictures are left alone', () => {
  assert.equal(ownServerImage('/content/orgs/o/resources/r/thumb.png'), '/content/orgs/o/resources/r/thumb.png')
  assert.equal(ownServerImage(null), null)
  assert.equal(ownServerImage(undefined), undefined)
  assert.equal(ownServerImage(''), '')
  assert.equal(ownServerImage('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA')
})

test('every place that shows an outside resource picture goes through it', () => {
  for (const file of [
    'components/Discover/ResourceCover.tsx',
    'components/Discover/DiscoverHero.tsx',
    'components/Hub/resources/HubResourceContext.tsx',
    'components/Hub/resources/HubResourceLibrary.tsx',
    'components/Hub/conversation/HubQuickSearch.tsx',
    'components/Resources/ResourceNotes.tsx',
  ]) {
    assert.match(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /ownServerImage\(/, file)
  }
})
