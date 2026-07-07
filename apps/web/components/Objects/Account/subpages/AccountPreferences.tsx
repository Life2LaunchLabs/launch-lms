'use client'
import React, { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
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
    <div className="bg-card rounded-xl nice-shadow">
      <div className="flex flex-col gap-0">
        <div className="flex flex-col bg-muted -space-y-1 px-5 py-3 mx-3 my-3 rounded-md">
          <h1 className="font-bold text-xl text-foreground">Appearance</h1>
          <h2 className="text-muted-foreground text-md">
            Choose how the app looks to you
          </h2>
        </div>

        <div className="mx-5 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
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
                  <span className="text-sm font-medium">{option.label}</span>
                </button>
              )
            })}
          </div>
          <p className="text-sm text-muted-foreground mt-4 max-w-2xl">
            System follows your device setting. Your choice is saved on this
            browser.
          </p>
        </div>
      </div>
    </div>
  )
}

export default AccountPreferences
