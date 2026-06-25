'use client'
import React from 'react'
import LanguageSwitcher from '@components/Utils/LanguageSwitcher'
import AuthBrandingPanel from '@components/Auth/AuthBrandingPanel'
import AuthMobileHeader from '@components/Auth/AuthMobileHeader'

interface AuthLayoutProps {
  org: any
  welcomeText?: string
  children: React.ReactNode
  minimal?: boolean
}

export default function AuthLayout({ org, welcomeText, children, minimal = false }: AuthLayoutProps) {
  if (minimal) {
    return (
      <div className="min-h-screen bg-[#101010] text-white relative overflow-auto">
        <div className="absolute top-4 right-4 z-dropdown">
          <LanguageSwitcher />
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-white lg:grid lg:grid-cols-2">
      <div className="absolute top-4 right-4 z-dropdown">
        <LanguageSwitcher />
      </div>

      {/* Mobile Header - visible only on small screens */}
      <div className="lg:hidden">
        <AuthMobileHeader org={org} />
      </div>

      {/* Left Panel - Content */}
      <div className="relative flex min-h-screen flex-1 flex-col overflow-auto bg-white lg:min-w-[480px]">
        {children}
      </div>

      {/* Right Panel - Branding (hidden on mobile) */}
      <div className="hidden min-h-screen lg:block">
        <AuthBrandingPanel
          org={org}
          welcomeText={welcomeText}
        />
      </div>
    </div>
  )
}
