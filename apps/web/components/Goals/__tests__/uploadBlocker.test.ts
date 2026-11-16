import { describe, expect, test } from 'bun:test'
import { inSentence } from '../steps/upload'

describe('inSentence', () => {
  test('lowercases a label that starts a sentence, and keeps acronyms', () => {
    expect(inSentence('Your poster')).toBe('your poster')
    expect(inSentence('PDF of your essay')).toBe('PDF of your essay')
    expect(inSentence('résumé')).toBe('résumé')
  })
})
