'use client'

import React, { useEffect } from 'react'
import { useOrg } from '@components/Contexts/OrgContext'

function onAccent(color: string) {
  const value = color.trim()
  let channels: number[] | null = null
  const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1]
  if (hex) {
    const normalized = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex
    channels = [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16))
  } else {
    const rgb = value.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/i)
    if (rgb) channels = rgb.slice(1, 4).map(Number)
  }
  if (!channels) return '#ffffff'
  const [red, green, blue] = channels.map((channel) => {
    const value = Math.min(255, Math.max(0, channel)) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  return luminance > 0.179 ? '#000000' : '#ffffff'
}

export default function OrgThemeVariables({ children }: { children: React.ReactNode }) {
  const org = useOrg() as any
  const general =
    org?.config?.config?.customization?.general || org?.config?.config?.general || {}
  const primaryColor = general?.color || ''
  const darkAccent = general?.dark_color || ''

  const lightPrimary = primaryColor || '#8b5cf6'
  const darkPrimary = darkAccent || lightPrimary
  const themeVariables = {
    '--org-page-background-light': '#fafafa',
    '--org-page-background-dark': '#0a0a0a',
    '--org-primary-color-light': lightPrimary,
    '--org-primary-color-dark': darkPrimary,
    '--org-on-primary-color-light': onAccent(lightPrimary),
    '--org-on-primary-color-dark': onAccent(darkPrimary),
  } as React.CSSProperties

  useEffect(() => {
    const root = document.documentElement
    const variables = Object.entries(themeVariables) as [string, string][]
    const previous = variables.map(([name]) => [name, root.style.getPropertyValue(name)] as const)

    variables.forEach(([name, value]) => root.style.setProperty(name, value))
    return () => previous.forEach(([name, value]) => value
      ? root.style.setProperty(name, value)
      : root.style.removeProperty(name))
  }, [lightPrimary, darkPrimary])

  return (
    <div
      data-org-theme
      style={themeVariables}
    >
      {children}
    </div>
  )
}
