'use client'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { getUriWithOrg } from '@services/config/config'
import { TextIcon, LucideIcon, Image as ImageIcon, Users, BookCopy, BookOpen } from 'lucide-react'
import Link from 'next/link'
import React, { use } from 'react'
import { motion } from 'motion/react'
import { CollectionProvider, useCollection } from '@components/Contexts/CollectionContext'
import CollectionEditGeneral from '@components/Dashboard/Pages/Collection/CollectionEditGeneral'
import CollectionEditThumbnail from '@components/Dashboard/Pages/Collection/CollectionEditThumbnail'
import CollectionEditAccess from '@components/Dashboard/Pages/Collection/CollectionEditAccess'
import CollectionEditContent from '@components/Dashboard/Pages/Collection/CollectionEditContent'

export type CollectionParams = {
  subpage: string
  orgslug: string
  collectionuuid: string
}

interface TabItem {
  id: string
  label: string
  icon: LucideIcon
}

const SETTING_TABS: TabItem[] = [
  { id: 'general', label: 'General', icon: TextIcon },
  { id: 'thumbnail', label: 'Cover Photo', icon: ImageIcon },
  { id: 'access', label: 'Access', icon: Users },
  { id: 'content', label: 'Courses', icon: BookCopy },
]

function TabLink({
  tab,
  isActive,
  orgslug,
  collectionuuid,
}: {
  tab: TabItem
  isActive: boolean
  orgslug: string
  collectionuuid: string
}) {
  return (
    <Link href={getUriWithOrg(orgslug, '') + `/dash/courses/collection/${collectionuuid}/${tab.id}`}>
      <div
        className={`py-2 w-fit text-center border-black transition-all ease-linear ${
          isActive ? 'border-b-4' : 'opacity-50'
        } cursor-pointer`}
      >
        <div className="flex items-center space-x-2.5 mx-2.5">
          <tab.icon size={16} />
          <div className="flex items-center">{tab.label}</div>
        </div>
      </div>
    </Link>
  )
}

const SUBPAGE_TITLES: Record<string, { h1: string; h2: string }> = {
  general: { h1: 'General Settings', h2: 'Update name, description, and visibility.' },
  thumbnail: { h1: 'Cover Photo', h2: 'Upload a custom cover photo for this collection.' },
  access: { h1: 'Access Control', h2: 'Control who can view this collection.' },
  content: { h1: 'Courses', h2: 'Add or remove courses from this collection.' },
}

function CollectionSettingsContent({ params }: { params: CollectionParams }) {
  const collectionState = useCollection()
  const collection = collectionState?.collection

  const labels = SUBPAGE_TITLES[params.subpage] ?? { h1: '', h2: '' }

  if (!collection) return null

  return (
    <div className="h-full w-full bg-[#f8f8f8] flex flex-col">
      <div className="pl-10 pr-10 tracking-tight bg-[#fcfbfc] z-10 nice-shadow flex-shrink-0 relative">
        <div className="pt-6 pb-4">
          <Breadcrumbs items={[
            { label: 'Courses', href: '/dash/courses', icon: <BookOpen size={14} /> },
            { label: 'Collections', href: '/dash/courses', icon: <BookCopy size={14} /> },
            { label: collection.name },
          ]} />
        </div>
        <div className="my-2 py-2">
          <div className="w-100 flex flex-col space-y-1">
            <div className="pt-3 flex font-bold text-4xl tracking-tighter">{labels.h1}</div>
            <div className="flex font-medium text-gray-400 text-md">{labels.h2}</div>
          </div>
        </div>
        <div className="flex space-x-0.5 font-black text-sm">
          {SETTING_TABS.map((tab) => (
            <TabLink
              key={tab.id}
              tab={tab}
              isActive={params.subpage === tab.id}
              orgslug={params.orgslug}
              collectionuuid={params.collectionuuid}
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
        {params.subpage === 'general' && <CollectionEditGeneral />}
        {params.subpage === 'thumbnail' && <CollectionEditThumbnail />}
        {params.subpage === 'access' && <CollectionEditAccess />}
        {params.subpage === 'content' && <CollectionEditContent />}
      </motion.div>
    </div>
  )
}

function CollectionSettingsPage(props: { params: Promise<CollectionParams> }) {
  const params = use(props.params)

  return (
    <CollectionProvider collectionuuid={params.collectionuuid}>
      <CollectionSettingsContent params={params} />
    </CollectionProvider>
  )
}

export default CollectionSettingsPage
