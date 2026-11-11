import { describe, expect, test } from 'bun:test'
import { blockedSaveMessage, orgGeneralSchema } from '../orgGeneralForm'

const values = { name: 'Riverside', description: '', about: '', label: '__none__', email: '' }

describe('Settings > General save', () => {
  test('an org without a short description can save', async () => {
    expect(await orgGeneralSchema.isValid(values)).toBe(true)
  })

  test('limits still hold', async () => {
    expect(await orgGeneralSchema.isValid({ ...values, description: 'x'.repeat(101) })).toBe(false)
    expect(await orgGeneralSchema.isValid({ ...values, name: '' })).toBe(false)
    expect(await orgGeneralSchema.isValid({ ...values, email: 'nope' })).toBe(false)
  })

  test('a blocked save names the fields to fix', () => {
    expect(blockedSaveMessage({})).toBe(null)
    expect(blockedSaveMessage({ name: 'Name is required', email: 'Must be a valid email address' }))
      .toBe('Not saved. Check Name, Contact email above.')
  })
})
