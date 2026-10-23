'use client'
import AdminFeatureHeader from '@components/Admin/AdminFeatureHeader'
import { getUriWithOrg, routePaths } from '@services/config/config'
import React, { useEffect, use } from 'react';
import { motion } from 'motion/react'
import { useRouter } from 'next/navigation'
import OrgEditGeneral from '@components/Dashboard/Pages/Org/OrgEditGeneral/OrgEditGeneral'
import OrgEditBranding from '@components/Dashboard/Pages/Org/OrgEditBranding/OrgEditBranding'
import OrgEditSSO from '@components/Dashboard/Pages/Org/OrgEditSSO/OrgEditSSO'
import OrgEditMessaging from '@components/Dashboard/Pages/Org/OrgEditMessaging/OrgEditMessaging'
import OrgEditPlan from '@components/Dashboard/Pages/Org/OrgEditPlan/OrgEditPlan'
import DiscoverSettingsPanel from '@components/Badges/discover/DiscoverSettingsPanel'
import { useOrg } from '@components/Contexts/OrgContext'
import { useFeatures } from '@components/Hooks/useFeatures'
import { ADMIN_NAV_ICONS } from '@components/Admin/adminNavIcons'
import { adminLabel, adminTab } from '@/lib/admin/registry'
import { useTranslation } from 'react-i18next'

export type OrgParams = {
  subpage: string
  orgslug: string
}

function OrgPage(props: { params: Promise<OrgParams> }) {
  const { t } = useTranslation()
  const params = use(props.params);
  const router = useRouter()
  const features = useFeatures()
  const org = useOrg() as { id?: number } | null
  // The Organization tab's settings pages; payments has its own page.
  const SETTING_TABS = React.useMemo(
    () => (adminTab('organization').children || []).filter((tab) =>
      tab.href.startsWith('/admin/org/settings/') && features.visibility(tab.requires).state === 'open'
    ),
    [features]
  )
  const enabledSubpages = React.useMemo(
    () => new Set(SETTING_TABS.map((tab) => tab.id)),
    [SETTING_TABS]
  )

  useEffect(() => {
    if (!enabledSubpages.has(params.subpage)) {
      router.replace(getUriWithOrg(params.orgslug, routePaths.org.admin.organization.general()))
      return
    }
  }, [enabledSubpages, params.subpage, params.orgslug, router])

  return (
    <div className="h-full w-full bg-[#f8f8f8] flex flex-col">
      <AdminFeatureHeader
        feature={adminLabel(t, adminTab('organization'))}
        activeTab={params.subpage}
        tabs={SETTING_TABS.map((tab) => {
          const Icon = ADMIN_NAV_ICONS[tab.id]
          return {
            id: tab.id,
            label: adminLabel(t, tab),
            icon: <Icon size={16} />,
            href: getUriWithOrg(params.orgslug, tab.href),
          }
        })}
      />
      <div className="h-6 flex-shrink-0"></div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1, type: 'spring', stiffness: 80 }}
        className="flex-1 overflow-y-auto"
      >
        {params.subpage == 'general' ? <OrgEditGeneral /> : ''}
        {params.subpage == 'branding' ? <OrgEditBranding /> : ''}
        {params.subpage == 'messaging' ? <OrgEditMessaging /> : ''}
        {params.subpage == 'sso' ? <OrgEditSSO /> : ''}
        {params.subpage == 'plan' ? <OrgEditPlan orgslug={params.orgslug} /> : ''}
        {params.subpage == 'discover' && org?.id ? <DiscoverSettingsPanel orgId={org.id} /> : ''}
      </motion.div>
    </div>
  )
}

export default OrgPage
