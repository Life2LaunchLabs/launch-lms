import { Metadata } from 'next'
import React from 'react'
import { redirect } from 'next/navigation'
import ClientAdminLayout from './ClientAdminLayout'
import AdminSurface from '@components/Utils/AdminSurface'
import '@/styles/admin-dark.css'
import { getServerSession } from '@/lib/auth/server'
import { hasDashboardAccessForOrg } from '@/lib/auth/orgAccess'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { routePaths } from '@services/config/config'
import { formatAppPageTitle } from '@services/routing/pageTitles'

/** The tab names the organization being run, not the software behind it. */
export async function generateMetadata({ params }: { params: Promise<{ orgslug: string }> }): Promise<Metadata> {
  const { orgslug } = await params
  try {
    const org = await getOrganizationContextInfo(orgslug, { revalidate: 1800, tags: ['organizations'] })
    // The same "Admin | …" shape as every admin page's own title, so tabs read alike.
    return { title: formatAppPageTitle({ section: 'Admin', detail: org?.name || undefined }) }
  } catch {
    return { title: 'Admin' }
  }
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
    redirect(routePaths.org.root())
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
      <AdminSurface />
      <ClientAdminLayout
        params={params}>
        {children}
      </ClientAdminLayout>
    </>
  )
}

export default DashboardLayout
