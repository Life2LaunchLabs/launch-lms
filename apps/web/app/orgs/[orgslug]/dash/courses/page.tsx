import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { Metadata } from 'next'
import React from 'react'
import CoursesHome from './client'
import { getServerSession } from '@/lib/auth/server'
import { getOrgCourses } from '@services/courses/courses'
import { getOrgCollections } from '@services/courses/collections'

type MetadataProps = {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params;
  // Get Org context information
  const org = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 1800,
    tags: ['organizations'],
  })

  // SEO
  return {
    title: 'Courses — ' + org.name,
    description: org.description,
    keywords: `${org.name}, ${org.description}, courses, learning, education, online learning, edu, online courses, ${org.name} courses`,
    robots: {
      index: true,
      follow: true,
      nocache: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
      },
    },
    openGraph: {
      title: 'Courses — ' + org.name,
      description: org.description,
      type: 'website',
    },
  }
}

async function CoursesPage(params: any) {
  const orgslug = (await params.params).orgslug
  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 1800,
    tags: ['organizations'],
  })
  const session = await getServerSession()
  const access_token = session?.tokens?.access_token

  let courses: any[] = []
  try {
    courses = await getOrgCourses(
      orgslug,
      { revalidate: 0, tags: ['courses'] },
      access_token ?? undefined,
      true // include_unpublished for dashboard
    )
  } catch (error: any) {
    if (error?.status === 403) {
      courses = []
    } else {
      throw error
    }
  }

  let collections: any[] = []
  try {
    collections = await getOrgCollections(String(org.id), access_token ?? undefined, { revalidate: 0, tags: ['collections'] })
  } catch {
    collections = []
  }

  return <CoursesHome org_id={org.id} orgslug={orgslug} courses={courses} collections={collections} />
}

export default CoursesPage
