'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import {
  X,
} from '@phosphor-icons/react'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg } from '@services/config/config'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { getMenuColorClasses } from '@services/utils/ts/colorUtils'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { useTranslation } from 'react-i18next'
import { getPrimaryOrgMenuItems } from './OrgMenuLinks'

interface OrgMenuSidebarProps {
  orgslug: string
  isOpen: boolean
  onClose: () => void
}

export function OrgMenuSidebar({ orgslug, isOpen, onClose }: OrgMenuSidebarProps) {
  const { t } = useTranslation()
  const org = useOrg() as any
  const pathname = usePathname()
  const config = org?.config?.config
  const rf = config?.resolved_features
  const primaryColor = config?.customization?.general?.color || config?.general?.color || ''
  const colors = getMenuColorClasses(primaryColor)

  // Close sidebar on route change
  useEffect(() => {
    onClose()
  }, [pathname])


  const navItems = getPrimaryOrgMenuItems({
    pathname,
    resolvedFeatures: rf,
    t,
  })

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ zIndex: 51, backgroundColor: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <div
        className={`fixed top-0 left-0 bottom-0 w-80 bg-card rounded-r-2xl shadow-2xl flex flex-col transition-transform duration-300 ease-in-out overflow-hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ zIndex: 52 }}
        aria-label="Navigation menu"
      >
        {/* Header — matches nav bar height and color */}
        <div
          className={`h-[60px] flex items-center justify-between px-5 shrink-0 ${!primaryColor ? 'bg-card/90 border-b border-border' : ''}`}
          style={{ backgroundColor: primaryColor || undefined }}
        >
          <Link href={getUriWithOrg(orgslug, '/')} onClick={onClose} className="flex items-center">
            {org?.logo_image ? (
              <img
                src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)}
                alt="Logo"
                className="h-8 w-auto rounded-md"
              />
            ) : (
              <Image
                src="/logo-text.svg"
                alt="Launch LMS"
                width={110}
                height={33}
                style={{ height: '30px', width: 'auto', filter: colors.logoFilter }}
              />
            )}
          </Link>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${colors.iconBtn}`}
            aria-label="Close menu"
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        {/* Scrollable content — white below the header when primary color is set */}
        <div
          className="flex-1 overflow-y-auto bg-card"
        >
          {/* Nav links */}
          <nav className="px-3 py-3 flex flex-col gap-0.5">
            {navItems.filter(item => item.show).map((item) => (
              <Link
                key={item.href}
                href={getUriWithOrg(orgslug, item.href || '/')}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  item.active
                    ? 'bg-muted text-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground font-medium'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* Divider */}
          <hr className="mx-4 border-border" />

        </div>
      </div>
    </>
  )
}
