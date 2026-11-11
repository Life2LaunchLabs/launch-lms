'use client'
import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useOrg } from '@components/Contexts/OrgContext'
import { HeaderProfileBox } from '@components/Security/HeaderProfileBox'
import { OrgLogo } from '@components/Objects/OrgLogo'
import { getMenuColorClasses } from '@services/utils/ts/colorUtils'
import { getUriWithOrg } from '@services/config/config'
import { useTranslation } from 'react-i18next'

export function GuestHeader({ orgslug }: { orgslug: string }) {
  const org = useOrg() as any
  const colors = getMenuColorClasses('')
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('nav.top_navigation')}
      className="relative h-[60px] border-b border-border bg-card/95 backdrop-blur-lg"
      style={{ zIndex: 'var(--z-nav)' }}
    >
      <div className="flex items-center justify-between w-full max-w-(--breakpoint-2xl) mx-auto px-4 sm:px-6 lg:px-8 h-full">
        {/* Logo */}
        <Link href={getUriWithOrg(orgslug, '/')}>
          <div className="flex w-auto h-9 rounded-md items-center py-1 justify-center">
            {org?.logo_image ? (
              <OrgLogo
                org={org}
                alt={org.name || 'Logo'}
                style={{ width: 'auto', height: '100%' }}
                className="rounded-md"
              />
            ) : (
              <Image
                src="/logo-text.svg"
                alt="Life2Launch"
                width={133}
                height={40}
                style={{ height: 'auto', filter: colors.logoFilter }}
              />
            )}
          </div>
        </Link>

        {/* Language switcher + Login + Sign Up */}
        <HeaderProfileBox primaryColor="" />
      </div>
    </nav>
  )
}
