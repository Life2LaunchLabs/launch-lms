'use client'

import React from 'react'
import { useOrg } from '@components/Contexts/OrgContext'

const hexToTintedWhite = (hex: string, amount: number): string => {
  if (!hex || hex.length < 7) return '#ffffff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const mix = (channel: number) => Math.round(255 - (255 - channel) * amount)
  return `rgb(${mix(r)} ${mix(g)} ${mix(b)})`
}

export default function OrgThemeVariables({ children }: { children: React.ReactNode }) {
  const org = useOrg() as any
  const primaryColor = org?.config?.config?.customization?.general?.color || org?.config?.config?.general?.color || ''
  const orgPrimaryColor = primaryColor || '#8b5cf6'
  const pageBackgroundColor = primaryColor ? hexToTintedWhite(primaryColor, 0.05) : '#ffffff'

  return (
    <div
      style={{
        '--org-page-background': pageBackgroundColor,
        '--org-primary-color': orgPrimaryColor,
      } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
