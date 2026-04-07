'use client'
import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useOrg } from '@components/Contexts/OrgContext'
import { HeaderProfileBox } from '@components/Security/HeaderProfileBox'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { getMenuColorClasses } from '@services/utils/ts/colorUtils'
import { getUriWithOrg } from '@services/config/config'

export function GuestHeader({ orgslug }: { orgslug: string }) {
  const org = useOrg() as any
  const config = org?.config?.config
  const primaryColor = config?.customization?.general?.color || config?.general?.color || ''
  const colors = getMenuColorClasses(primaryColor)

  return (
    <>
      {/* Spacer so page content doesn't sit under the fixed nav */}
      <div className="h-[60px]" />
      <nav
        aria-label="Top navigation"
        className={`fixed top-0 left-0 right-0 h-[60px] backdrop-blur-lg ${!primaryColor ? 'bg-white/90 nice-shadow' : ''}`}
        style={{ zIndex: 'var(--z-nav)', backgroundColor: primaryColor || undefined }}
      >
        <div className="flex items-center justify-between w-full max-w-(--breakpoint-2xl) mx-auto px-4 sm:px-6 lg:px-8 h-full">
          {/* Logo */}
          <Link href={getUriWithOrg(orgslug, '/welcome')}>
            <div className="flex w-auto h-9 rounded-md items-center py-1 justify-center">
              {org?.logo_image ? (
                <img
                  src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)}
                  alt={org.name || 'Logo'}
                  style={{ width: 'auto', height: '100%' }}
                  className="rounded-md"
                />
              ) : (
                <Image
                  src="/lrn-text.svg"
                  alt="Launch LMS"
                  width={133}
                  height={40}
                  style={{ height: 'auto', filter: colors.logoFilter }}
                />
              )}
            </div>
          </Link>

          {/* Language switcher + Login + Sign Up */}
          <HeaderProfileBox primaryColor={primaryColor} />
        </div>
      </nav>
    </>
  )
}
