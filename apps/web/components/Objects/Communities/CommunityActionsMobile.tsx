'use client'
import React from 'react'
import { Plus, MessageCircle } from 'lucide-react'
import { Community } from '@services/communities/communities'
import { useCommunityRights } from '@components/Hooks/useCommunityRights'

interface CommunityActionsMobileProps {
  community: Community
  orgslug: string
  onCreateDiscussion?: () => void
}

export function CommunityActionsMobile({
  community,
  onCreateDiscussion,
}: CommunityActionsMobileProps) {
  const { canCreateDiscussion } = useCommunityRights(community.community_uuid)

  return (
    <nav aria-label="Community mobile actions" className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      <div className="mx-3 mb-4 bg-card/95 backdrop-blur-sm rounded-xl nice-shadow p-3">
        <div className="flex items-center gap-3">
          {/* Community Icon */}
          <div className="flex-shrink-0 w-9 h-9 bg-muted rounded-lg flex items-center justify-center">
            <MessageCircle size={18} className="text-muted-foreground" />
          </div>

          {/* Community Name */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground truncate text-sm">{community.name}</p>
            <p className="text-xs text-muted-foreground">
              {community.public ? 'Public' : 'Private'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {canCreateDiscussion && onCreateDiscussion && (
              <button
                onClick={onCreateDiscussion}
                className="flex items-center gap-1.5 px-3 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg transition-colors text-sm font-medium"
              >
                <Plus size={14} />
                New
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}

export default CommunityActionsMobile
