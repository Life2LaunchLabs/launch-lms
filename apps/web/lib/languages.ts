export interface Language {
  code: string
  translationKey: string
  nativeName: string
}

export const AVAILABLE_LANGUAGES: Language[] = [
  { code: 'en', translationKey: 'common.english', nativeName: 'English' },
  { code: 'fr', translationKey: 'common.french', nativeName: 'Français' },
  { code: 'de', translationKey: 'common.german', nativeName: 'Deutsch' },
  { code: 'es', translationKey: 'common.spanish', nativeName: 'Español' },
  { code: 'ar', translationKey: 'common.arabic', nativeName: 'العربية' },
  { code: 'ja', translationKey: 'common.japanese', nativeName: '日本語' },
  { code: 'pt', translationKey: 'common.portuguese', nativeName: 'Português' },
  { code: 'ru', translationKey: 'common.russian', nativeName: 'Русский' },
  { code: 'zh', translationKey: 'common.chinese', nativeName: '简体中文' },
  { code: 'hi', translationKey: 'common.hindi', nativeName: 'हिन्दी' },
  { code: 'ko', translationKey: 'common.korean', nativeName: '한국어' },
  { code: 'it', translationKey: 'common.italian', nativeName: 'Italiano' },
  { code: 'tr', translationKey: 'common.turkish', nativeName: 'Türkçe' },
  { code: 'vi', translationKey: 'common.vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'id', translationKey: 'common.indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'pl', translationKey: 'common.polish', nativeName: 'Polski' },
  { code: 'nl', translationKey: 'common.dutch', nativeName: 'Nederlands' },
  { code: 'th', translationKey: 'common.thai', nativeName: 'ไทย' },
  { code: 'bn', translationKey: 'common.bengali', nativeName: 'বাংলা' },
]


/**
 * Languages whose platform text is finished. Only these are offered in language menus; the rest
 * stay in the code until their locale file is filled in and checked. Keep in step with
 * SUPPORTED_LANGUAGES in apps/api/src/services/users/language.py.
 */
export const READY_LANGUAGES = ['en', 'es'] as const

export const MENU_LANGUAGES: Language[] = AVAILABLE_LANGUAGES.filter((language) =>
  (READY_LANGUAGES as readonly string[]).includes(language.code)
)

/** The base code of a language tag ("es-MX" -> "es"), or English when it isn't ready. */
export function readyLanguage(code: string | null | undefined): string {
  const base = (code || '').toLowerCase().split('-')[0]
  return (READY_LANGUAGES as readonly string[]).includes(base) ? base : 'en'
}
