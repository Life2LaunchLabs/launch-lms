'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'

/**
 * Pins the subtree's surface to light mode by stripping the global `.dark`
 * class while mounted. Used on surfaces that are not yet dark-mode ready
 * (admin dashboard, course/board editors). Re-runs whenever next-themes
 * re-applies the class so the pin survives theme changes.
 */
export default function ForceLightTheme() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('dark')
    root.style.colorScheme = 'light'
    return () => {
      if (resolvedTheme === 'dark') {
        root.classList.add('dark')
        root.style.colorScheme = 'dark'
      }
    }
  }, [resolvedTheme])

  return null
}
