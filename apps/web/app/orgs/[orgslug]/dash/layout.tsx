import { Metadata } from 'next'
import React from 'react'
import { redirect } from 'next/navigation'
import ClientAdminLayout from './ClientAdminLayout'
import { getServerSession } from '@/lib/auth/server'
import { hasDashboardAccessForOrg } from '@/lib/auth/orgAccess'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { routePaths } from '@services/config/config'

export const metadata: Metadata = {
  title: 'Launch LMS Dashboard',
}

async function DashboardLayout(
  props: {
    children: React.ReactNode
    params: Promise<{ orgslug: string }>
  }
) {
  const params = await props.params
  const { children } = props
  const session = await getServerSession()

  if (!session) {
    redirect(routePaths.org.welcome())
  }

  const org = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 1800,
    tags: ['organizations'],
  })

  if (
    !hasDashboardAccessForOrg({
      session,
      orgId: org.id,
      orgUuid: org.org_uuid,
    })
  ) {
    redirect(routePaths.org.root())
  }

  return (
    <>
      <ClientAdminLayout
        params={params}>
        {children}
      </ClientAdminLayout>
    </>
  )
}

export default DashboardLayout
