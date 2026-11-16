import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

// DEV-50: a district reviewer must find each of these on the public pages, stated, not hedged.
test('the student data page states the AI companies, retention, deletion, memory, uploads and outside images', () => {
  const page = read('app/data/page.tsx')
  for (const fact of ['AI_PROVIDERS.summary', 'AI_PROVIDERS.terms', 'COACH_MEMORY', 'LOG_RETENTION', 'DELETION.how', 'DELETION.effect', 'UPLOAD_LINKS', 'OUTSIDE_IMAGES', 'SELF_EXPORT']) {
    assert.ok(page.includes(fact), fact)
  }
  const facts = read('lib/legal/facts.ts')
  assert.match(facts, /OpenAI and Anthropic/)
  assert.match(facts, /up to 90 days/)
  assert.match(facts, /within 30 days/)
  assert.match(facts, /team@life2launch\.com/)
  assert.match(facts, /uploaded files, Coach conversations/)
})

test('the legal pages make no vague promises and are not marked draft', () => {
  for (const file of ['app/data/page.tsx', 'lib/legal/privacy.tsx', 'components/Legal/LegalPage.tsx']) {
    const text = read(file)
    assert.doesNotMatch(text, /limited time/i, file)
    assert.doesNotMatch(text, /Draft, pending legal review/, file)
  }
})
