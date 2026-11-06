import { expect, test } from 'bun:test'
import { chunkText, plainForSpeech } from '../speech'
import { joinSpoken } from '../dictation'

test('long text is read a sentence at a time, and each piece knows where it starts', () => {
  const text = 'Hi there! Where do you live right now? A town is plenty.'
  const chunks = chunkText(text)
  expect(chunks.map((chunk) => chunk.text.trim())).toEqual(['Hi there!', 'Where do you live right now?', 'A town is plenty.'])
  for (const chunk of chunks) expect(text.slice(chunk.start, chunk.start + chunk.text.length)).toBe(chunk.text)
})

test('a run-on sentence is broken at a space before Chrome would cut it off', () => {
  const text = Array.from({ length: 80 }, (_, index) => `word${index}`).join(' ')
  const chunks = chunkText(text)
  expect(chunks.length).toBeGreaterThan(1)
  expect(chunks.every((chunk) => chunk.text.length <= 220)).toBe(true)
  expect(chunks.map((chunk) => chunk.text).join('')).toBe(text)
})

test('markdown from Coach is read as plain words', () => {
  expect(plainForSpeech('## Next steps\n\n- **Call** the [school](https://x.org)\n- Try `this`')).toBe('Next steps\nCall the school\nTry this')
})

test('spoken words join typed ones with a space, starting sentences with a capital', () => {
  expect(joinSpoken('', 'i like fixing bikes')).toBe('I like fixing bikes')
  expect(joinSpoken('I like bikes', 'and cars')).toBe('I like bikes and cars')
  expect(joinSpoken('I like bikes.', 'cars too')).toBe('I like bikes. Cars too')
  expect(joinSpoken('Hi  ', '   ')).toBe('Hi  ')
})
