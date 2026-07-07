'use client'

import React from 'react'
import { PodcastEpisode, Podcast } from '@services/podcasts/podcasts'
import { formatDuration } from '@services/podcasts/episodes'
import { usePodcastPlayer } from '@components/Contexts/PodcastPlayerContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getEpisodeThumbnailMediaDirectory, getPodcastThumbnailMediaDirectory } from '@services/media/media'
import { Play, Pause, Clock } from 'lucide-react'

interface EpisodeCardProps {
  episode: PodcastEpisode
  podcast: Podcast
  showThumbnail?: boolean
}

export default function EpisodeCard({ episode, podcast, showThumbnail = true }: EpisodeCardProps) {
  const { state, playEpisode, togglePlay } = usePodcastPlayer()
  const org = useOrg() as any

  const isCurrentEpisode = state.currentEpisode?.episode_uuid === episode.episode_uuid
  const isPlaying = isCurrentEpisode && state.isPlaying

  const handlePlay = () => {
    if (isCurrentEpisode) {
      togglePlay()
    } else {
      playEpisode(episode, podcast)
    }
  }

  // Get thumbnail
  const thumbnailUrl = episode.thumbnail_image && org
    ? getEpisodeThumbnailMediaDirectory(
        org.org_uuid,
        podcast.podcast_uuid,
        episode.episode_uuid,
        episode.thumbnail_image
      )
    : podcast.thumbnail_image && org
    ? getPodcastThumbnailMediaDirectory(org.org_uuid, podcast.podcast_uuid, podcast.thumbnail_image)
    : '/empty_thumbnail.png'

  return (
    <div
      className={`group flex items-center gap-4 p-4 rounded-lg transition-colors cursor-pointer ${
        isCurrentEpisode ? 'bg-muted' : 'hover:bg-muted'
      }`}
      onClick={handlePlay}
    >
      {/* Episode number */}
      <div className="flex-shrink-0 w-8 text-center">
        <span className="text-sm font-bold text-muted-foreground">
          {episode.episode_number}
        </span>
      </div>

      {/* Thumbnail */}
      {showThumbnail && (
        <div className="flex-shrink-0 relative">
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted">
            <img
              src={thumbnailUrl}
              alt={episode.title}
              className="w-full h-full object-cover"
            />
          </div>
          {/* Play overlay */}
          <div className={`absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 transition-opacity ${
            isCurrentEpisode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}>
            <div className="bg-card rounded-full p-2">
              {isPlaying ? (
                <Pause size={16} className="text-foreground" fill="currentColor" />
              ) : (
                <Play size={16} className="text-foreground" fill="currentColor" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Episode info */}
      <div className="flex-1 min-w-0">
        <h4 className={`font-semibold truncate ${isCurrentEpisode ? 'text-foreground' : 'text-foreground'}`}>
          {episode.title}
        </h4>
        {episode.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
            {episode.description}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {formatDuration(episode.duration_seconds || 0)}
          </span>
          {!episode.published && (
            <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[10px] font-medium">
              Unpublished
            </span>
          )}
        </div>
      </div>

      {/* Play button (visible on non-thumbnail view or always visible) */}
      {!showThumbnail && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handlePlay()
          }}
          className={`flex-shrink-0 p-3 rounded-full transition-colors ${
            isCurrentEpisode
              ? 'bg-gray-900 text-white'
              : 'bg-muted text-muted-foreground hover:bg-muted'
          }`}
        >
          {isPlaying ? (
            <Pause size={18} fill="currentColor" />
          ) : (
            <Play size={18} fill="currentColor" />
          )}
        </button>
      )}
    </div>
  )
}
