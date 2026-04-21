'use client'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { getCoreCapabilities, getUriWithOrg } from '@services/config/config'
import { TextIcon, LucideIcon, LayoutDashboardIcon, CodeIcon, KeyIcon, Palette, School, ToggleRight, Shield, Globe, Search, BarChart3, Layers } from 'lucide-react'
import Link from 'next/link'
import React, { useEffect, use } from 'react';
import { motion } from 'motion/react'
import Image from 'next/image'
import OrgEditGeneral from '@components/Dashboard/Pages/Org/OrgEditGeneral/OrgEditGeneral'
import OrgEditBranding from '@components/Dashboard/Pages/Org/OrgEditBranding/OrgEditBranding'
import OrgEditLanding from '@components/Dashboard/Pages/Org/OrgEditLanding/OrgEditLanding'
import OrgEditOther from '@components/Dashboard/Pages/Org/OrgEditOther/OrgEditOther'
import OrgEditAPIAccess from '@components/Dashboard/Pages/Org/OrgEditAPIAccess/OrgEditAPIAccess'
import OrgEditAI from '@components/Dashboard/Pages/Org/OrgEditAI/OrgEditAI'
import OrgEditFeatures from '@components/Dashboard/Pages/Org/OrgEditFeatures/OrgEditFeatures'
import OrgEditSSO from '@components/Dashboard/Pages/Org/OrgEditSSO/OrgEditSSO'
import OrgEditDomains from '@components/Dashboard/Pages/Org/OrgEditDomains/OrgEditDomains'
import OrgEditSEO from '@components/Dashboard/Pages/Org/OrgEditSEO/OrgEditSEO'
import OrgEditUsage from '@components/Dashboard/Pages/Org/OrgEditUsage/OrgEditUsage'
import OrgEditPlan from '@components/Dashboard/Pages/Org/OrgEditPlan/OrgEditPlan'
import { useTranslation } from 'react-i18next'
import { useOrg } from '@components/Contexts/OrgContext'
import { PlanLevel, planMeetsRequirement } from '@services/plans/plans'
import { usePlan } from '@components/Hooks/usePlan'
import FeatureDisabledView from '@components/Dashboard/Shared/FeatureDisabled/FeatureDisabledView'

export type OrgParams = {
  subpage: string
  orgslug: string
}

interface TabItem {
  id: string
  label: string
  icon?: LucideIcon
  customIcon?: string
  requiredPlan?: PlanLevel
}

const getSettingTabs = (t: any): TabItem[] => [
  { id: 'general', label: t('dashboard.organization.settings.tabs.general'), icon: TextIcon },
  { id: 'branding', label: t('dashboard.organization.settings.tabs.branding'), icon: Palette, requiredPlan: 'enterprise' },
  { id: 'features', label: t('dashboard.organization.settings.tabs.features') || 'Features', icon: ToggleRight, requiredPlan: 'enterprise' },
  { id: 'landing', label: t('dashboard.organization.settings.tabs.landing'), icon: LayoutDashboardIcon, requiredPlan: 'enterprise' },
  { id: 'seo', label: 'SEO', icon: Search, requiredPlan: 'enterprise' },
  { id: 'ai', label: t('dashboard.organization.settings.tabs.ai') || 'AI', customIcon: '/ai_icon.svg', requiredPlan: 'full' },
  { id: 'domains', label: t('dashboard.organization.settings.tabs.domains') || 'Domains', icon: Globe, requiredPlan: 'enterprise' },
  { id: 'api', label: t('dashboard.organization.settings.tabs.api') || 'API Access', icon: KeyIcon, requiredPlan: 'full' },
  { id: 'usage', label: t('dashboard.organization.settings.tabs.usage') || 'Usage', icon: BarChart3 },
  { id: 'plan', label: 'Plan', icon: Layers },
  { id: 'other', label: t('dashboard.organization.settings.tabs.other'), icon: CodeIcon, requiredPlan: 'enterprise' },
]

function TabLink({ tab, isActive, orgslug }: {
  tab: TabItem,
  isActive: boolean,
  orgslug: string,
}) {
  return (
    <Link href={getUriWithOrg(orgslug, '') + `/dash/org/settings/${tab.id}`}>
      <div
        className={`py-2 w-fit text-center border-black transition-all ease-linear ${
          isActive ? 'border-b-4' : 'opacity-50'
        } cursor-pointer`}
      >
        <div className="flex items-center space-x-2.5 mx-2.5">
          {tab.customIcon ? (
            <Image src={tab.customIcon} alt={tab.label} width={16} height={16} />
          ) : tab.icon ? (
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
  const org = useOrg() as any
  const currentPlan = usePlan()
  const capabilities = getCoreCapabilities()
  const [H1Label, setH1Label] = React.useState('')
  const [H2Label, setH2Label] = React.useState('')
  const SETTING_TABS = React.useMemo(() => {
    const tabs = getSettingTabs(t)
    if (capabilities.sso) {
      const usageIndex = tabs.findIndex(tab => tab.id === 'usage')
      tabs.splice(usageIndex, 0, {
        id: 'sso',
        label: t('dashboard.organization.settings.tabs.sso') || 'SSO',
        icon: Shield,
        requiredPlan: 'enterprise' as PlanLevel,
      })
    }
    // Hide tabs the current plan can't access
    return tabs.filter(tab =>
      !tab.requiredPlan || planMeetsRequirement(currentPlan, tab.requiredPlan)
    )
  }, [capabilities.sso, t, currentPlan])

  function handleLabels() {
    if (params.subpage == 'general') {
      setH1Label(t('dashboard.organization.settings.pages.general.title'))
      setH2Label(t('dashboard.organization.settings.pages.general.subtitle'))
    } else if (params.subpage == 'features') {
      setH1Label(t('dashboard.organization.settings.pages.features.title') || 'Features')
      setH2Label(t('dashboard.organization.settings.pages.features.subtitle') || 'Enable or disable features for your organization')
    } else if (params.subpage == 'branding') {
      setH1Label(t('dashboard.organization.settings.pages.branding.title'))
      setH2Label(t('dashboard.organization.settings.pages.branding.subtitle'))
    } else if (params.subpage == 'landing') {
      setH1Label(t('dashboard.organization.settings.pages.landing.title'))
      setH2Label(t('dashboard.organization.settings.pages.landing.subtitle'))
    } else if (params.subpage == 'seo') {
      setH1Label('SEO')
      setH2Label('Manage search engine optimization settings')
    } else if (params.subpage == 'ai') {
      setH1Label(t('dashboard.organization.settings.pages.ai.title') || 'AI Features')
      setH2Label(t('dashboard.organization.settings.pages.ai.subtitle') || 'Configure AI capabilities for your organization')
    } else if (params.subpage == 'domains') {
      setH1Label(t('dashboard.organization.settings.pages.domains.title') || 'Custom Domains')
      setH2Label(t('dashboard.organization.settings.pages.domains.subtitle') || 'Configure custom domains for your organization')
    } else if (params.subpage == 'api') {
      setH1Label(t('dashboard.organization.settings.pages.api.title') || 'API Access')
      setH2Label(t('dashboard.organization.settings.pages.api.subtitle') || 'Manage API tokens and access')
    } else if (params.subpage == 'sso') {
      setH1Label(t('dashboard.organization.settings.pages.sso.title') || 'Single Sign-On')
      setH2Label(
        capabilities.sso
          ? (t('dashboard.organization.settings.pages.sso.subtitle') || 'Configure SSO for your organization')
          : 'SSO is currently disabled in core.'
      )
    } else if (params.subpage == 'usage') {
      setH1Label(t('dashboard.organization.settings.pages.usage.title') || 'Usage')
      setH2Label(t('dashboard.organization.settings.pages.usage.subtitle') || 'Monitor your organization\'s resource usage and plan limits')
    } else if (params.subpage == 'plan') {
      setH1Label('Plan & Packages')
      setH2Label('View your current plan, add-on packages, and request upgrades')
    } else if (params.subpage == 'other') {
      setH1Label(t('dashboard.organization.settings.pages.other.title'))
      setH2Label(t('dashboard.organization.settings.pages.other.subtitle'))
    }
  }

  useEffect(() => {
    handleLabels()
  }, [capabilities.sso, params.subpage, params, t])

  return (
    <div className="h-full w-full bg-[#f8f8f8] flex flex-col">
      <div className="pl-10 pr-10 tracking-tight bg-[#fcfbfc] z-10 nice-shadow flex-shrink-0 relative">
        <div className="pt-6 pb-4">
          <Breadcrumbs items={[
            { label: t('common.organization'), href: '/dash/org/settings/general', icon: <School size={14} /> }
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
        {params.subpage == 'features' ? <OrgEditFeatures /> : ''}
        {params.subpage == 'branding' ? <OrgEditBranding /> : ''}
        {params.subpage == 'landing' ? <OrgEditLanding /> : ''}
        {params.subpage == 'seo' ? <OrgEditSEO /> : ''}
        {params.subpage == 'ai' ? <OrgEditAI /> : ''}
        {params.subpage == 'domains' ? <OrgEditDomains /> : ''}
        {params.subpage == 'api' ? <OrgEditAPIAccess /> : ''}
        {params.subpage == 'sso' ? (
          capabilities.sso ? (
            <OrgEditSSO />
          ) : (
            <FeatureDisabledView featureName="sso" orgslug={params.orgslug} context="dashboard">
              <></>
            </FeatureDisabledView>
          )
        ) : ''}
        {params.subpage == 'usage' ? <OrgEditUsage /> : ''}
        {params.subpage == 'plan' ? <OrgEditPlan orgslug={params.orgslug} /> : ''}
        {params.subpage == 'other' ? <OrgEditOther /> : ''}
      </motion.div>
    </div>
  )
}

export default OrgPage
