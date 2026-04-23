'use client'
import React from 'react'
import Link from 'next/link'
import { User, Lock, ShoppingBag, Settings, Building2, Award } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { useTranslation } from 'react-i18next'

interface AccountActionsMobileProps {
  orgslug: string
  currentSubpage: string
}

const NAV_ITEMS = [
  { id: 'general', icon: Settings, labelKey: 'account.general' },
  { id: 'profile', icon: User, labelKey: 'account.profile' },
  { id: 'security', icon: Lock, labelKey: 'account.security' },
  { id: 'purchases', icon: ShoppingBag, labelKey: 'account.purchases' },
  { id: 'organizations', icon: Building2, label: 'Organizations' },
  { id: 'badges', icon: Award, label: 'Badges' },
]

export function AccountActionsMobile({ orgslug, currentSubpage }: AccountActionsMobileProps) {
  const { t } = useTranslation()

  return (
    <nav aria-label="Account mobile actions" className="md:hidden">
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-2 rounded-2xl bg-white p-2 nice-shadow">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = currentSubpage === item.id
            return (
              <Link
                key={item.id}
                href={getUriWithOrg(orgslug, routePaths.org.account.page(item.id))}
                className={`flex min-w-[84px] flex-col items-center gap-1 rounded-xl px-3 py-2 transition-colors ${
                  isActive
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon size={18} />
                <span className="text-[10px] font-medium truncate max-w-[60px]">
                  {item.labelKey ? t(item.labelKey) : item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

export default AccountActionsMobile
