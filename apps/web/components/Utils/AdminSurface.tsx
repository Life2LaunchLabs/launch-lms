'use client'

import { useEffect } from 'react'

/**
 * Marks <html> with data-surface="admin" while mounted, so the admin dark-mode
 * palette in styles/admin-dark.css applies to admin pages and to the dialogs
 * and menus they portal into <body>.
 */
export default function AdminSurface() {
  useEffect(() => {
    const root = document.documentElement
    root.dataset.surface = 'admin'
    return () => {
      delete root.dataset.surface
    }
  }, [])

  return null
}
