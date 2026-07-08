'use client'
import AdminFeatureHeader from '@components/Admin/AdminFeatureHeader'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { TextIcon, LucideIcon, Palette, Sparkles, Shield, CreditCard } from 'lucide-react'
import React, { useEffect, use } from 'react';
import { motion } from 'motion/react'
import { useRouter } from 'next/navigation'
import OrgEditGeneral from '@components/Dashboard/Pages/Org/OrgEditGeneral/OrgEditGeneral'
import OrgEditBranding from '@components/Dashboard/Pages/Org/OrgEditBranding/OrgEditBranding'
import OrgEditOnboarding from '@components/Dashboard/Pages/Org/OrgEditOnboarding/OrgEditOnboarding'
import OrgEditSSO from '@components/Dashboard/Pages/Org/OrgEditSSO/OrgEditSSO'
import OrgEditPlan from '@components/Dashboard/Pages/Org/OrgEditPlan/OrgEditPlan'
import { useTranslation } from 'react-i18next'

export type OrgParams = {
  subpage: string
  orgslug: string
}

interface TabItem {
  id: string
  label: string
  icon?: LucideIcon
}

const getSettingTabs = (t: any): TabItem[] => [
  { id: 'general', label: t('dashboard.organization.settings.tabs.general'), icon: TextIcon },
  { id: 'branding', label: t('dashboard.organization.settings.tabs.branding'), icon: Palette },
  { id: 'onboarding', label: 'Onboarding', icon: Sparkles },
  { id: 'sso', label: 'Single Sign-On', icon: Shield },
  { id: 'plan', label: 'Plan & Packages', icon: CreditCard },
]

function OrgPage(props: { params: Promise<OrgParams> }) {
  const { t } = useTranslation()
  const params = use(props.params);
  const router = useRouter()
  const SETTING_TABS = React.useMemo(() => getSettingTabs(t), [t])
  const enabledSubpages = React.useMemo(
    () => new Set(SETTING_TABS.map((tab) => tab.id)),
    [SETTING_TABS]
  )

  useEffect(() => {
    if (!enabledSubpages.has(params.subpage)) {
      router.replace(getUriWithOrg(params.orgslug, routePaths.org.dash.orgSettings.general()))
      return
    }
  }, [enabledSubpages, params.subpage, params.orgslug, router, t])

  return (
    <div className="h-full w-full bg-[#f8f8f8] flex flex-col">
      <AdminFeatureHeader
        feature={t('common.organization')}
        activeTab={params.subpage}
        tabs={SETTING_TABS.map((tab) => {
          const Icon = tab.icon
          return {
            id: tab.id,
            label: tab.label,
            icon: Icon ? <Icon size={16} /> : undefined,
            href: getUriWithOrg(params.orgslug, routePaths.org.dash.orgSettings[tab.id as keyof typeof routePaths.org.dash.orgSettings]()),
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
        {params.subpage == 'onboarding' ? <OrgEditOnboarding /> : ''}
        {params.subpage == 'sso' ? <OrgEditSSO /> : ''}
        {params.subpage == 'plan' ? <OrgEditPlan orgslug={params.orgslug} /> : ''}
      </motion.div>
    </div>
  )
}

export default OrgPage
