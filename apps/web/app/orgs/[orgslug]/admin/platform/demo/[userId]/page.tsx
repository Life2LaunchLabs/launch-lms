'use client'
import { use } from 'react'
import StudioUserDetail from '@components/Demo/Studio/StudioUserDetail'

export default function DemoUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params)
  return <StudioUserDetail userId={Number(userId)} />
}
