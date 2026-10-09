'use client'

import { Monitor } from 'lucide-react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useMediaQuery } from 'usehooks-ts'
import AdminFeatureHeader from '@components/Admin/AdminFeatureHeader'
import UsersOverview from '@components/Admin/Users/UsersOverview'
import { usePlan } from '@components/Hooks/usePlan'
import { planMeetsRequirement } from '@services/plans/plans'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg } from '@services/config/config'
import { getUserAdminPages } from '@components/Admin/adminFeaturePages'

export default function UsersAdminPage({ orgslug, section }: { orgslug: string; section: string }) {
  const { t } = useTranslation()
  const currentPlan = usePlan()
  const org = useOrg() as any
  const resolvedFeatures = org?.config?.config?.resolved_features
  const isMobile = useMediaQuery('(max-width: 767px)')
  const hasUserGroups =
    planMeetsRequirement(currentPlan, 'full')
    && (resolvedFeatures?.usergroups?.enabled ?? true)
  const tabs = getUserAdminPages().map((tab) => {
    const Icon = tab.icon
    return { ...tab, icon: <Icon size={16} />, href: getUriWithOrg(orgslug, tab.href) }
  })

  if (isMobile) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#f8f8f8] p-4">
        <div className="rounded-lg bg-white p-6 text-center shadow-md">
          <h2 className="mb-4 text-xl font-bold">{t('dashboard.users.settings.mobile.title')}</h2>
          <Monitor className="mx-auto my-5" size={60} />
          <p>{t('dashboard.users.settings.mobile.message1')}</p>
          <p>{t('dashboard.users.settings.mobile.message2')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid h-screen w-full grid-rows-[auto_1fr] bg-[#f8f8f8]">
      <AdminFeatureHeader
        feature={t('common.users')}
        activeTab={section}
        tabs={tabs}
      />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 overflow-y-auto">
        {section === 'overview' && <UsersOverview hasUserGroups={hasUserGroups} />}
      </motion.div>
    </div>
  )
}
