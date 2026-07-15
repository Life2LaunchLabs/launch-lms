'use client'

import React from 'react'
import { useOrg } from '@components/Contexts/OrgContext'

export default function OrgThemeVariables({ children }: { children: React.ReactNode }) {
  const org = useOrg() as any
  const general =
    org?.config?.config?.customization?.general || org?.config?.config?.general || {}
  const primaryColor = general?.color || ''
  const darkAccent = general?.dark_color || ''

  const lightPrimary = primaryColor || '#8b5cf6'
  const darkPrimary = darkAccent || lightPrimary

  return (
    <div
      data-org-theme
      style={{
        '--org-page-background-light': '#fafafa',
        '--org-page-background-dark': '#0a0a0a',
        '--org-primary-color-light': lightPrimary,
        '--org-primary-color-dark': darkPrimary,
      } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
