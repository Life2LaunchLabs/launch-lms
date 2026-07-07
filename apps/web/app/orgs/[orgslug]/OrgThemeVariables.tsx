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

const hexToTintedBlack = (hex: string, amount: number): string => {
  if (!hex || hex.length < 7) return '#0a0a0a'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const base = 10 // near-black base channel
  const mix = (channel: number) => Math.round(base + (channel - base) * amount)
  return `rgb(${mix(r)} ${mix(g)} ${mix(b)})`
}

export default function OrgThemeVariables({ children }: { children: React.ReactNode }) {
  const org = useOrg() as any
  const general =
    org?.config?.config?.customization?.general || org?.config?.config?.general || {}
  const primaryColor = general?.color || ''
  const darkAccent = general?.dark_color || ''

  const lightPrimary = primaryColor || '#8b5cf6'
  const darkPrimary = darkAccent || lightPrimary
  const lightBackground = primaryColor ? hexToTintedWhite(primaryColor, 0.05) : '#ffffff'
  const darkBackground = hexToTintedBlack(darkPrimary, 0.06)

  return (
    <div
      data-org-theme
      style={{
        '--org-page-background-light': lightBackground,
        '--org-page-background-dark': darkBackground,
        '--org-primary-color-light': lightPrimary,
        '--org-primary-color-dark': darkPrimary,
      } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
