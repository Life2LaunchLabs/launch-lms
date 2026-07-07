'use client'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { TextIcon, LucideIcon, Palette, School, Sparkles, Shield } from 'lucide-react'
import Link from 'next/link'
import React, { useEffect, use } from 'react';
import { motion } from 'motion/react'
import { useRouter } from 'next/navigation'
import OrgEditGeneral from '@components/Dashboard/Pages/Org/OrgEditGeneral/OrgEditGeneral'
import OrgEditBranding from '@components/Dashboard/Pages/Org/OrgEditBranding/OrgEditBranding'
import OrgEditOnboarding from '@components/Dashboard/Pages/Org/OrgEditOnboarding/OrgEditOnboarding'
import OrgEditSSO from '@components/Dashboard/Pages/Org/OrgEditSSO/OrgEditSSO'
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
]

function TabLink({ tab, isActive, orgslug }: {
  tab: TabItem,
  isActive: boolean,
  orgslug: string,
}) {
  return (
    <Link href={getUriWithOrg(orgslug, routePaths.org.dash.orgSettings[tab.id as keyof typeof routePaths.org.dash.orgSettings]())}>
      <div
        className={`py-2 w-fit text-center border-black transition-all ease-linear ${
          isActive ? 'border-b-4' : 'opacity-50'
        } cursor-pointer`}
      >
        <div className="flex items-center space-x-2.5 mx-2.5">
          {tab.icon ? (
            <tab.icon size={16} />
          ) : null}
          <span>{tab.label}</span>
        </div>
      </div>
    </Link>
  )
}

function OrgPage(props: { params: Promise<OrgParams> }) {
  const { t } = useTranslation()
  const params = use(props.params);
  const router = useRouter()
  const [H1Label, setH1Label] = React.useState('')
  const [H2Label, setH2Label] = React.useState('')
  const SETTING_TABS = React.useMemo(() => getSettingTabs(t), [t])
  const enabledSubpages = React.useMemo(
    () => new Set(SETTING_TABS.map((tab) => tab.id)),
    [SETTING_TABS]
  )

  function handleLabels() {
    if (params.subpage == 'general') {
      setH1Label(t('dashboard.organization.settings.pages.general.title'))
      setH2Label(t('dashboard.organization.settings.pages.general.subtitle'))
    } else if (params.subpage == 'branding') {
      setH1Label(t('dashboard.organization.settings.pages.branding.title'))
      setH2Label(t('dashboard.organization.settings.pages.branding.subtitle'))
    } else if (params.subpage == 'onboarding') {
      setH1Label('Onboarding')
      setH2Label('Set portfolio presets and recommended badges for new learners')
    } else if (params.subpage == 'sso') {
      setH1Label('Single Sign-On')
      setH2Label('Configure SSO providers for your organization')
    }
  }

  useEffect(() => {
    if (!enabledSubpages.has(params.subpage)) {
      router.replace(getUriWithOrg(params.orgslug, routePaths.org.dash.orgSettings.general()))
      return
    }
    handleLabels()
  }, [enabledSubpages, params.subpage, params.orgslug, router, t])

  return (
    <div className="h-full w-full bg-[#f8f8f8] flex flex-col">
      <div className="pl-10 pr-10 tracking-tight bg-[#fcfbfc] z-10 nice-shadow flex-shrink-0 relative">
        <div className="pt-6 pb-4">
          <Breadcrumbs items={[
            { label: t('common.organization'), href: routePaths.org.dash.orgSettings.general(), icon: <School size={14} /> }
          ]} />
        </div>
        <div className="my-2  py-2">
          <div className="w-100 flex flex-col space-y-1">
            <div className="pt-3 flex font-bold text-4xl tracking-tighter">
              {H1Label}
            </div>
            <div className="flex font-medium text-gray-400 text-md">
              {H2Label}{' '}
            </div>
          </div>
        </div>
        <div className="flex space-x-0.5 font-black text-sm">
          {SETTING_TABS.map((tab) => (
            <TabLink
              key={tab.id}
              tab={tab}
              isActive={params.subpage === tab.id}
              orgslug={params.orgslug}
            />
          ))}
        </div>
      </div>
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
      </motion.div>
    </div>
  )
}

export default OrgPage
