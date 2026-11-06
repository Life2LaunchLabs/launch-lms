'use client'

import React from 'react'
import { toast } from 'react-hot-toast'
import { Translate } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import i18next from 'i18next'
import { settingsCard, SettingsHeader } from '@components/Objects/Account/AccountPageShell'
import { useLanguage } from '@components/Utils/useLanguage'
import { MENU_LANGUAGES } from '@/lib/languages'

/** The language the platform's own text is shown in; saved on the account. */
export default function AccountLanguage() {
  const { t } = useTranslation()
  const { language, setLanguage } = useLanguage()

  const choose = async (code: string) => {
    if (code === language) return
    await setLanguage(code)
    // Said in the language just picked.
    toast.success(i18next.t('settings.language.saved'))
  }

  return (
    <div className={`${settingsCard} p-5 sm:p-6`}>
      <SettingsHeader icon={Translate} title={t('settings.language.title')} description={t('settings.language.description')} />
      <div className="mt-5 grid max-w-2xl grid-cols-2 gap-3" role="radiogroup" aria-label={t('settings.language.title')}>
        {MENU_LANGUAGES.map((option) => {
          const active = option.code === language
          return (
            <button
              key={option.code}
              type="button"
              role="radio"
              aria-checked={active}
              lang={option.code}
              onClick={() => void choose(option.code)}
              className={`flex flex-col items-center gap-1 rounded-xl border-2 px-4 py-4 transition-colors ${
                active
                  ? 'border-[var(--org-primary-color)] bg-muted text-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span className="text-base font-extrabold">{option.nativeName}</span>
              <span className="text-xs font-mono uppercase opacity-70">{option.code}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-4 max-w-2xl text-sm text-muted-foreground">{t('settings.language.more_soon')}</p>
    </div>
  )
}
