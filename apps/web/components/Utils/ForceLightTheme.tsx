'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'

/**
 * Pins the subtree's surface to light mode by stripping the global `.dark`
 * class while mounted. Used on surfaces that are not yet dark-mode ready
 * (auth pages). Re-runs whenever next-themes
 * re-applies the class so the pin survives theme changes. Onboarding at /auth/start
 * follows the theme like the admin it leads into.
 */
export default function ForceLightTheme() {
  const { resolvedTheme } = useTheme()
  const followsTheme = usePathname()?.startsWith('/auth/start')

  useEffect(() => {
    if (followsTheme) return
    const root = document.documentElement
    root.classList.remove('dark')
    root.style.colorScheme = 'light'
    return () => {
      if (resolvedTheme === 'dark') {
        root.classList.add('dark')
        root.style.colorScheme = 'dark'
      }
    }
  }, [resolvedTheme, followsTheme])

  return null
}
