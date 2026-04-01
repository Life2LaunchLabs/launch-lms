import React from 'react'
import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import Trail from '../trail/trail'
import { getServerSession } from '@/lib/auth/server'

type MetadataProps = {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params
  const session = await getServerSession()
  const access_token = session?.tokens?.access_token
  const org = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 1800,
    tags: ['organizations'],
  }, access_token)

  return {
    title: 'Certificates — ' + org.name,
    description: 'Review your in-progress courses and earned certificates.',
  }
}

const CertificatePage = async (params: any) => {
  const orgslug = (await params.params).orgslug

  return (
    <div>
      <Trail orgslug={orgslug} />
    </div>
  )
}

export default CertificatePage
