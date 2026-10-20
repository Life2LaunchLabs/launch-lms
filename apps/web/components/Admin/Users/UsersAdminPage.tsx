'use client'

import { Monitor } from 'lucide-react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useMediaQuery } from 'usehooks-ts'
import AdminFeatureHeader from '@components/Admin/AdminFeatureHeader'
import UsersOverview from '@components/Admin/Users/UsersOverview'
import { useFeatures } from '@components/Hooks/useFeatures'
import { adminLabel, adminTab } from '@/lib/admin/registry'

export default function UsersAdminPage({ section }: { orgslug: string; section: string }) {
  const { t } = useTranslation()
  const features = useFeatures()
  const isMobile = useMediaQuery('(max-width: 767px)')
  const hasUserGroups = features.planAtLeast('full') && features.has('usergroups')

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
        feature={adminLabel(t, adminTab('people'))}
        activeTab={section}
        tabs={[]}
      />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 overflow-y-auto">
        {section === 'overview' && <UsersOverview hasUserGroups={hasUserGroups} />}
      </motion.div>
    </div>
  )
}
