'use client'

import { Monitor, ScanEye, Shield, ShieldAlert, SquareUserRound, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useMediaQuery } from 'usehooks-ts'
import AdminFeatureHeader from '@components/Admin/AdminFeatureHeader'
import OrgAccess from '@components/Dashboard/Pages/Users/OrgAccess/OrgAccess'
import OrgAuditLogs from '@components/Dashboard/Pages/Org/OrgAuditLogs/OrgAuditLogs'
import OrgRoles from '@components/Dashboard/Pages/Users/OrgRoles/OrgRoles'
import OrgUserGroups from '@components/Dashboard/Pages/Users/OrgUserGroups/OrgUserGroups'
import UsersTable from '@components/Admin/Platform/UsersTable'
import { usePlan } from '@components/Hooks/usePlan'
import { planMeetsRequirement } from '@services/plans/plans'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'

export default function UsersAdminPage({ orgslug, section }: { orgslug: string; section: string }) {
  const { t } = useTranslation()
  const currentPlan = usePlan()
  const org = useOrg() as any
  const resolvedFeatures = org?.config?.config?.resolved_features
  const isMobile = useMediaQuery('(max-width: 767px)')
  const hasUserGroups =
    planMeetsRequirement(currentPlan, 'full')
    && (resolvedFeatures?.usergroups?.enabled ?? true)
  const hasAuditLogs = resolvedFeatures?.audit_logs?.enabled ?? planMeetsRequirement(currentPlan, 'enterprise')

  const tabs = [
    { id: 'users', label: t('dashboard.users.settings.tabs.users'), icon: <Users size={16} />, href: getUriWithOrg(orgslug, routePaths.org.dash.users.users()) },
    ...(hasUserGroups ? [{ id: 'groups', label: t('dashboard.users.settings.tabs.usergroups'), icon: <SquareUserRound size={16} />, href: getUriWithOrg(orgslug, routePaths.org.dash.users.usergroups()) }] : []),
    { id: 'roles', label: t('dashboard.users.settings.tabs.roles'), icon: <Shield size={16} />, href: getUriWithOrg(orgslug, routePaths.org.dash.users.roles()) },
    { id: 'signups', label: t('dashboard.users.settings.tabs.signups'), icon: <ScanEye size={16} />, href: getUriWithOrg(orgslug, routePaths.org.dash.users.signups()) },
    ...(hasAuditLogs ? [{ id: 'audit-logs', label: t('dashboard.users.settings.tabs.audit_logs'), icon: <ShieldAlert size={16} />, href: getUriWithOrg(orgslug, routePaths.org.dash.users.auditLogs()) }] : []),
  ]

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
        {section === 'users' && <UsersTable scope="organization" />}
        {section === 'signups' && <OrgAccess />}
        {section === 'groups' && hasUserGroups && <><div className="h-6" /><OrgUserGroups /></>}
        {section === 'roles' && <><div className="h-6" /><OrgRoles /></>}
        {section === 'audit-logs' && <><div className="h-6" /><OrgAuditLogs /></>}
      </motion.div>
    </div>
  )
}
