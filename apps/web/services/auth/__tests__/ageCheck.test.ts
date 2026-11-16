import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ageOn, ageRefusalCode, checkBirthDate } from '@services/auth/ageCheck'

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), 'utf8')
const TODAY = new Date(2026, 10, 16) // 16 November 2026, local time

describe('no accounts for anyone under 13 (DEV-38)', () => {
  test('age counts from the birthday', () => {
    expect(ageOn('2013-11-16', TODAY)).toBe(13)
    expect(ageOn('2013-11-17', TODAY)).toBe(12)
    expect(ageOn('2008-02-29', new Date(2021, 1, 28))).toBe(12)
    expect(ageOn('2008-02-29', new Date(2021, 2, 1))).toBe(13)
  })

  test('missing, impossible and future dates are not ages', () => {
    expect(checkBirthDate('', TODAY)).toBe('required')
    for (const date of ['2027-01-01', '2010-02-30', '1850-01-01', '16/11/2010']) expect(checkBirthDate(date, TODAY)).toBe('invalid')
  })

  test('under 13 is refused, 13 and older goes ahead', () => {
    expect(checkBirthDate('2013-11-17', TODAY)).toBe('refused')
    expect(checkBirthDate('2013-11-16', TODAY)).toBe('ok')
  })

  test('reads the API refusal', () => {
    expect(ageRefusalCode({ detail: { code: 'under_13', message: 'x' } })).toBe('under_13')
    expect(ageRefusalCode({ detail: 'Email already exists' })).toBe(null)
  })

  test('every way to create an account asks and sends the date of birth', () => {
    for (const path of ['app/auth/signup/OpenSignup.tsx', 'app/auth/signup/InviteOnlySignUp.tsx', 'components/Onboarding/Start/StartFlow.tsx']) {
      const file = source(path)
      expect(file).toContain('<AgeConfirm')
      expect(file).toContain('birth_date: age.birthDate')
    }
    expect(source('app/auth/signup/OpenSignup.tsx')).toContain('birthDate: age.birthDate')
    expect(source('components/Onboarding/Start/StartFlow.tsx')).toContain('birthDate: age.birthDate')
    expect(source('app/welcome/WelcomeClient.tsx')).toContain('birth_date: rememberedBirthDate()')
    expect(source('app/auth/callback/google/page.tsx')).toContain('birth_date: takeOAuthBirthDate()')
  })

  test('the question does not say what age is needed', () => {
    const en = JSON.parse(source('locales/en.json')).auth
    expect(/13|older/.test(en.birth_date + en.birth_date_help)).toBe(false)
    expect(en.under_13_body).toContain('13 and older')
  })
})
