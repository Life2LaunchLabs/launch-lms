import React from 'react'
import { getUserByUsername } from '@services/users/users'
import { Metadata } from 'next'
import { getServerSession } from '@/lib/auth/server'
import { PublicProfilePageClient } from '@components/Objects/Portfolio/ProfilePageClient'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUriWithOrg, routePaths } from '@services/config/config'

interface UserPageParams {
  username: string;
  orgslug: string;
}

interface UserPageProps {
  params: Promise<UserPageParams>;
}

function normalizeProfileValue(profile: any) {
  if (!profile) return {}
  if (typeof profile === 'string') {
    try {
      return JSON.parse(profile)
    } catch {
      return {}
    }
  }
  return { ...profile }
}

function getPublicUserData(userData: any) {
  const profile = normalizeProfileValue(userData.profile)

  if (profile.featured?.publicVisible === false) {
    profile.featured = { ...profile.featured, enabled: false }
  }

  if (profile.timelinePublicVisible === false) {
    profile.timelineEnabled = false
  }

  if (profile.achievements?.publicVisible === false) {
    profile.achievements = { ...profile.achievements, enabled: false }
  }

  if (Array.isArray(profile.sections)) {
    profile.sections = profile.sections.filter((section: any) => section?.publicVisible !== false)
  }

  return {
    ...userData,
    profile,
  }
}

export async function generateMetadata({ params }: UserPageProps): Promise<Metadata> {
  try {
    const resolvedParams = await params
    const session = await getServerSession()
    const access_token = session?.tokens?.access_token

    // If no session, return basic metadata (SEO will show generic title)
    if (!access_token) {
      return {
        title: 'User Portfolio',
        description: 'View user profile',
      }
    }

    const userData = await getUserByUsername(resolvedParams.username, access_token)
    return {
      title: `${userData.first_name} ${userData.last_name} | Portfolio`,
      description: userData.bio || `Portfolio page of ${userData.first_name} ${userData.last_name}`,
    }
  } catch {
    return {
      title: 'User Portfolio',
    }
  }
}

async function UserPage({ params }: UserPageProps) {
  const resolvedParams = await params;
  const { username, orgslug } = resolvedParams;

  // Get session for authentication
  const session = await getServerSession()
  const access_token = session?.tokens?.access_token

  // Require authentication to view user profiles
  if (!access_token) {
    redirect(`/orgs/${orgslug}/login?redirect=/orgs/${orgslug}/user/${username}`)
  }

  let userData
  try {
    userData = await getUserByUsername(username, access_token)
  } catch (err) {
    console.error('Error fetching user data:', err)
    return (
      <div className="container mx-auto py-8">
        <div className="bg-card rounded-xl nice-shadow p-6">
          <p className="text-red-600">Error loading user profile. The user may not exist or you may not have permission to view this profile.</p>
        </div>
      </div>
    )
  }

  const isSelf =
    String(session?.user?.id ?? '') === String(userData.id ?? '') ||
    session?.user?.username === userData.username
  const publicUserData = getPublicUserData(userData)

  return (
    <div>
      {isSelf ? (
        <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-muted-foreground">
              You are viewing your public profile.
            </p>
            <Link
              href={getUriWithOrg(orgslug, routePaths.org.portfolio())}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              View full profile
            </Link>
          </div>
        </div>
      ) : null}
      <PublicProfilePageClient
        initialUser={publicUserData}
        orgslug={orgslug}
        profileUsername={publicUserData.username}
        isSelf={false}
      />
    </div>
  )
}

export default UserPage
