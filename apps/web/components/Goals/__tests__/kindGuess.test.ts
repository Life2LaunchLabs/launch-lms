import { describe, expect, test } from 'bun:test'
import { guessStepKind } from '../edit/kindGuess'

describe('guessing a step kind from its wording', () => {
  test('asking to see something handed in makes an upload step (FEED-145, FEED-153)', () => {
    expect(guessStepKind('Build something in Minecraft and show me')).toBe('upload')
    expect(guessStepKind('Send Mom a picture of your Minecraft build')).toBe('upload')
    expect(guessStepKind('Take a photo of your poster')).toBe('upload')
  })

  test('everything else keeps its old guess', () => {
    expect(guessStepKind('Decide which college to visit')).toBe('decision')
    expect(guessStepKind('Open a savings account')).toBe('task')
    expect(guessStepKind('Visit the career fair')).toBe('event')
  })
})
