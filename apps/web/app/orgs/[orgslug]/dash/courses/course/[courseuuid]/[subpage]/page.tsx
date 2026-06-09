'use client'
import React, { use, useEffect } from 'react';
import { CourseProvider } from '../../../../../../../../components/Contexts/CourseContext'
import Link from 'next/link'
import { motion } from 'motion/react'
import { GalleryVerticalEnd, Info, Award, Lock, Settings } from 'lucide-react'
import { ChartBar } from '@phosphor-icons/react'
import EditCourseStructure from '@components/Dashboard/Pages/Course/EditCourseStructure/EditCourseStructure'
import EditCourseCertification from '@components/Dashboard/Pages/Course/EditCourseCertification/EditCourseCertification'
import { useCourseRights } from '@hooks/useCourseRights'
import { useRouter } from 'next/navigation'
import ToolTip from '@components/Objects/StyledElements/Tooltip/Tooltip'
import { getDefaultOrg, getUriWithOrg, routePaths } from '@services/config/config';
import { useTranslation } from 'react-i18next';
import { PlanLevel } from '@services/plans/plans';
import PlanBadge from '@components/Dashboard/Shared/PlanRestricted/PlanBadge';
import PlanRestrictedFeature from '@components/Dashboard/Shared/PlanRestricted/PlanRestrictedFeature';
import CourseAnalyticsTab from '@components/Dashboard/Analytics/Course/CourseAnalyticsTab';
import { usePlan } from '@components/Hooks/usePlan'
import CourseEditorHeader from '@components/Dashboard/Pages/Course/CourseEditorHeader'
import EditCourseAbout from '@components/Dashboard/Pages/Course/EditCourseAbout/EditCourseAbout'
import CourseSettingsTab from '@components/Dashboard/Pages/Course/CourseSettingsTab'
import CourseAutoSave from '@components/Dashboard/Pages/Course/CourseAutoSave'

export type CourseOverviewParams = {
  orgslug: string
  courseuuid: string
  subpage: string
}

function CourseOverviewPage(props: { params: Promise<CourseOverviewParams> }) {
  const { t } = useTranslation()
  const params = use(props.params);
  const router = useRouter();
  const currentPlan = usePlan();
  const canConfigureCoreCourse = params.orgslug === getDefaultOrg()

  function getEntireCourseUUID(courseuuid: string) {
    return courseuuid.startsWith('course_') ? courseuuid : `course_${courseuuid}`
  }

  const courseuuid = getEntireCourseUUID(params.courseuuid)
  const { hasPermission, isLoading: rightsLoading } = useCourseRights(courseuuid)
  const activeSubpage = getActiveSubpage(params.subpage)

  // Define tab configurations with their required permissions
  const tabs = [
    {
      key: 'content',
      label: t('dashboard.courses.settings.tabs.content'),
      icon: GalleryVerticalEnd,
      href: routePaths.org.dash.courseSettings(params.courseuuid, 'content'),
      requiredPermission: 'update_content' as const
    },
    {
      key: 'about',
      label: 'About',
      icon: Info,
      href: routePaths.org.dash.courseSettings(params.courseuuid, 'about'),
      requiredPermission: 'update' as const
    },
    {
      key: 'settings',
      label: 'Settings',
      icon: Settings,
      href: routePaths.org.dash.courseSettings(params.courseuuid, 'settings'),
      requiredPermission: 'update' as const
    },
    {
      key: 'certification',
      label: t('dashboard.courses.settings.tabs.certification'),
      icon: Award,
      href: routePaths.org.dash.courseSettings(params.courseuuid, 'certification'),
      requiredPermission: 'create_certifications' as const,
      requiresPlan: 'enterprise' as PlanLevel
    },
    {
      key: 'analytics',
      label: t('dashboard.courses.settings.tabs.analytics'),
      icon: ChartBar,
      href: routePaths.org.dash.courseSettings(params.courseuuid, 'analytics'),
      requiredPermission: 'update' as const,
      requiresPlan: 'enterprise' as PlanLevel
    }
  ]

  // Filter tabs based on permissions
  const tabHasAccess = (tab: typeof tabs[number]) => {
    if (tab.key === 'settings') {
      return hasPermission('update') || hasPermission('manage_access') || hasPermission('manage_contributors')
    }
    return hasPermission(tab.requiredPermission)
  }

  const visibleTabs = tabs.filter(tab => tabHasAccess(tab))

  // Check if current subpage is accessible
  const currentTab = tabs.find(tab => tab.key === activeSubpage)
  const hasAccessToCurrentPage = currentTab ? tabHasAccess(currentTab) : false

  // Redirect to first available tab if current page is not accessible
  useEffect(() => {
    if (!rightsLoading && !hasAccessToCurrentPage && visibleTabs.length > 0) {
      const firstAvailableTab = visibleTabs[0]
      router.replace(getUriWithOrg(params.orgslug, firstAvailableTab.href))
    }
  }, [rightsLoading, hasAccessToCurrentPage, visibleTabs, router, params.orgslug])

  // Show loading state while rights are being fetched
  if (rightsLoading) {
    return (
      <div className="h-screen w-full bg-[#f8f8f8] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  // Show access denied if no tabs are available
  if (!rightsLoading && visibleTabs.length === 0) {
    return (
      <div className="h-screen w-full bg-[#f8f8f8] flex items-center justify-center">
        <div className="text-center">
          <Lock className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t('dashboard.courses.settings.access_denied.title')}</h3>
          <p className="text-gray-500">{t('dashboard.courses.settings.access_denied.message')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full w-full bg-[#f8f8f8]">
      <CourseProvider courseuuid={courseuuid} withUnpublishedActivities={true}>
        <CourseAutoSave orgslug={params.orgslug} />
        <div className="pl-10 pr-10 text-sm tracking-tight bg-[#fcfbfc] z-10 nice-shadow relative">
          <CourseEditorHeader orgslug={params.orgslug} courseuuid={params.courseuuid} />
          <div className="flex space-x-3 font-black text-sm">
            {tabs.map((tab) => {
              const IconComponent = tab.icon
              const isActive = activeSubpage === tab.key
              const hasAccess = tabHasAccess(tab)
              
              if (!hasAccess) {
                // Show disabled tab with subtle visual cues and tooltip
                return (
                  <ToolTip
                    key={tab.key}
                    content={
                      <div className="text-center">
                        <div className="font-medium text-gray-900">{t('dashboard.courses.settings.access_restricted.title')}</div>
                        <div className="text-sm text-gray-600">
                          {t('dashboard.courses.settings.access_restricted.message', { tab: tab.label })}
                        </div>
                      </div>
                    }
                  >
                    <div className="flex space-x-4 py-2 w-fit text-center border-black transition-all ease-linear opacity-30 cursor-not-allowed">
                      <div className="flex items-center space-x-2.5 mx-2">
                        <IconComponent size={16} />
                        <div>{tab.label}</div>
                      </div>
                    </div>
                  </ToolTip>
                )
              }
              
              return (
                <Link
                  key={tab.key}
                  href={getUriWithOrg(params.orgslug, tab.href)}
                  replace
                >
                  <div
                    className={`flex space-x-4 py-2 w-fit text-center border-black transition-all ease-linear ${
                      isActive ? 'border-b-4' : 'opacity-50 hover:opacity-75'
                    } cursor-pointer`}
                  >
                    <div className="flex items-center space-x-2.5 mx-2">
                      <IconComponent size={16} />
                      <div>{tab.label}</div>
                      {(tab as any).requiresPlan && (
                        <PlanBadge currentPlan={currentPlan} requiredPlan={(tab as any).requiresPlan} size="sm" noMargin />
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1, type: 'spring', stiffness: 80 }}
          className="overflow-x-hidden"
        >
          <div>
            {activeSubpage == 'content' && hasPermission('update_content') ? (
              <EditCourseStructure orgslug={params.orgslug} />
            ) : null}
            {activeSubpage == 'about' && hasPermission('update') ? (
              <EditCourseAbout />
            ) : null}
            {activeSubpage == 'settings' && (hasPermission('update') || hasPermission('manage_access') || hasPermission('manage_contributors')) ? (
              <CourseSettingsTab
                orgslug={params.orgslug}
                canConfigureCoreCourse={canConfigureCoreCourse}
                permissions={{
                  canManageAccess: hasPermission('manage_access'),
                  canManageContributors: hasPermission('manage_contributors'),
                  canUpdate: hasPermission('update'),
                }}
              />
            ) : null}
            {activeSubpage == 'certification' && hasPermission('create_certifications') ? (
              <div className="h-6" />
            ) : null}
            {activeSubpage == 'certification' && hasPermission('create_certifications') ? (
              <PlanRestrictedFeature
                currentPlan={currentPlan}
                requiredPlan="enterprise"
                icon={Award}
                titleKey="common.plans.feature_restricted.certifications.title"
                descriptionKey="common.plans.feature_restricted.certifications.description"
              >
                <EditCourseCertification orgslug={params.orgslug} />
              </PlanRestrictedFeature>
            ) : null}
            {activeSubpage == 'analytics' && hasPermission('update') ? (
              <PlanRestrictedFeature
                currentPlan={currentPlan}
                requiredPlan="enterprise"
                icon={ChartBar}
                titleKey="common.plans.feature_restricted.course_analytics.title"
                descriptionKey="common.plans.feature_restricted.course_analytics.description"
              >
                <CourseAnalyticsTab courseUUID={courseuuid} />
              </PlanRestrictedFeature>
            ) : null}
          </div>
        </motion.div>
      </CourseProvider>
    </div>
  )
}

export default CourseOverviewPage

function getActiveSubpage(subpage: string) {
  if (subpage === 'general' || subpage === 'seo') return 'about'
  if (subpage === 'access' || subpage === 'contributors' || subpage === 'core') return 'settings'
  return subpage
}
