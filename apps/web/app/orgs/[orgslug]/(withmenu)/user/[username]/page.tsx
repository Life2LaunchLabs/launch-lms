import React from 'react'
import { getUserByUsername } from '@services/users/users'
import { Metadata } from 'next'
import { getServerSession } from '@/lib/auth/server'
import ProfilePageClient from '@components/Objects/Profile/ProfilePageClient'
import { redirect } from 'next/navigation'

interface UserPageParams {
  username: string;
  orgslug: string;
}

interface UserPageProps {
  params: Promise<UserPageParams>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: UserPageProps): Promise<Metadata> {
  try {
    const resolvedParams = await params
    const session = await getServerSession()
    const access_token = session?.tokens?.access_token

    // If no session, return basic metadata (SEO will show generic title)
    if (!access_token) {
      return {
        title: 'User Profile',
        description: 'View user profile',
      }
    }

    const userData = await getUserByUsername(resolvedParams.username, access_token)
    return {
      title: `${userData.first_name} ${userData.last_name} | Profile`,
      description: userData.bio || `Profile page of ${userData.first_name} ${userData.last_name}`,
    }
  } catch {
    return {
      title: 'User Profile',
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
        <div className="bg-white rounded-xl nice-shadow p-6">
          <p className="text-red-600">Error loading user profile. The user may not exist or you may not have permission to view this profile.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <ProfilePageClient
        initialUser={userData}
        orgslug={orgslug}
        profileUsername={userData.username}
        canEdit={session?.user?.username === userData.username}
      />
    </div>
  )
}

export default UserPage
