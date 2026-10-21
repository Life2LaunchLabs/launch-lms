'use client'
import React, { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor, Palette } from 'lucide-react'
import { settingsCard, SettingsHeader } from '@components/Objects/Account/AccountPageShell'
import { useTranslation } from 'react-i18next'

const THEME_OPTIONS = [
  { id: 'light', icon: Sun, label: 'Light' },
  { id: 'dark', icon: Moon, label: 'Dark' },
  { id: 'system', icon: Monitor, label: 'System' },
]

function AccountPreferences() {
  const { theme, setTheme } = useTheme()
  const { t } = useTranslation()
  // Theme is only known client-side; render the picker after mount to avoid
  // a hydration mismatch on the selected state.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className={`${settingsCard} p-5 sm:p-6`}>
      <SettingsHeader icon={Palette} title="Appearance" description="Choose how the app looks to you." />
      <div className="mt-5">
        <div className="grid max-w-2xl grid-cols-3 gap-3">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon
            const isActive = mounted && theme === option.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setTheme(option.id)}
                aria-pressed={isActive}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 px-4 py-5 transition-colors ${
                  isActive
                    ? 'border-[var(--org-primary-color)] bg-muted text-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon size={22} />
                <span className="text-sm font-bold">{option.label}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
          System follows your device setting. Your choice is saved on this
          browser.
        </p>
      </div>
    </div>
  )
}

export default AccountPreferences
