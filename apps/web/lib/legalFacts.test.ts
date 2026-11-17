import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
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

test('legal pages: one age wording, no organization scripts, services listed above (DEV-99)', () => {
  const data = read('app/data/page.tsx')
  const privacy = read('lib/legal/privacy.tsx')
  assert.match(data, /\{AGE_CHECK\}/)
  assert.match(privacy, /\{AGE_CHECK\}/)
  assert.match(read('lib/legal/facts.ts'), /single sign-on/)
  assert.doesNotMatch(data, /add its own scripts/)
  assert.doesNotMatch(data, /services listed below/)
  assert.ok(!existsSync(new URL('../components/OrgScripts', import.meta.url)), 'the organization script loader is gone')
})

// DEV-125: the Coach retention schedule is published on the data page, and the privacy policy states it and links there.
test('the Coach retention schedule is on the data page and the privacy policy links to it', () => {
  const facts = read('lib/legal/facts.ts')
  for (const period of ['12 months after Coach last used them', '24 months after their last message', '60 days after they leave', 'within 30 days']) {
    assert.ok(facts.includes(period), period)
  }
  assert.match(facts, /erased, not hidden/)
  assert.match(read('app/data/page.tsx'), /<Rows rows=\{COACH_RETENTION\} \/>/)
  const privacy = read('lib/legal/privacy.tsx')
  assert.match(privacy, /COACH_RETENTION\.map/)
  assert.match(privacy, /href="\/data#retention"/)
})

// DEV-139: the date of birth is kept, and sign-up, the Privacy Policy and the Data page all say so in the same words.
test('the kept date of birth is stated once and shown on both pages and at sign-up', () => {
  const facts = read('lib/legal/facts.ts')
  assert.match(facts, /keeps the date of birth/)
  assert.doesNotMatch(facts, /never stored/)
  assert.match(read('app/data/page.tsx'), /\{BIRTH_DATE\}/)
  assert.match(read('lib/legal/privacy.tsx'), /\{BIRTH_DATE\}/)
  assert.doesNotMatch(read('lib/legal/privacy.tsx'), /date of birth beyond/)
  const en = JSON.parse(read('locales/en.json'))
  assert.match(en.auth.birth_date_help, /keep it/)
  assert.doesNotMatch(en.auth.birth_date_help, /don’t keep/)
})

// DEV-141: services that receive no personal data are not listed.
test('Judge0 and Pexels are off the outside services list', () => {
  const list = read('lib/legal/subprocessors.ts')
  assert.doesNotMatch(list, /name: 'Judge0'/)
  assert.doesNotMatch(list, /name: 'Pexels'/)
})

// DEV-140: every policy page sits in the front page's signed-out frame.
test('the policy pages use the signed-out header and footer', () => {
  const shell = read('components/Legal/LegalShell.tsx')
  assert.match(shell, /<GuestHeader /)
  assert.match(shell, /<LegalFooter \/>/)
  assert.match(read('components/Legal/LegalPage.tsx'), /<LegalShell /)
  assert.match(read('app/data/page.tsx'), /<LegalShell /)
})
