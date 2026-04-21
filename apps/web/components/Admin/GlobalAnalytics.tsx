'use client'
import React from 'react'
import useSWR from 'swr'
import { getAPIUrl } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import { ChartBar } from '@phosphor-icons/react'

export default function GlobalAnalytics({
  days = 30,
  lightTheme = false,
}: {
  days?: number
  lightTheme?: boolean
}) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token

  const { data, isLoading, error } = useSWR(
    accessToken
      ? `${getAPIUrl()}superadmin/analytics/global?days=${days}`
      : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )

  if (isLoading) return <PageLoading />

  if (error || !data) {
    return (
      <div className={lightTheme ? 'platform-analytics-light' : ''}>
        <div className="flex flex-col items-center justify-center py-20 text-white/40">
          <ChartBar size={48} weight="fill" />
          <p className="mt-4 text-lg">
            {error ? 'Failed to load analytics' : 'No analytics data available'}
          </p>
          <p className="text-sm text-white/25 mt-1">
            Ensure Tinybird analytics is configured
          </p>
        </div>
        {lightTheme && (
          <style jsx global>{`
            .platform-analytics-light [class~="text-white/40"] { color: rgb(107 114 128) !important; }
            .platform-analytics-light [class~="text-white/25"] { color: rgb(156 163 175) !important; }
          `}</style>
        )}
      </div>
    )
  }

  const queryNames = Object.keys(data)

  return (
    <div className={lightTheme ? 'platform-analytics-light' : ''}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {queryNames.map((queryName) => {
          const queryData = data[queryName]
          const rows = queryData?.data || []
          const firstRow = rows[0] || {}
          const values = Object.entries(firstRow)

          return (
            <div
              key={queryName}
              className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5"
            >
              <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">
                {queryName.replace(/_/g, ' ')}
              </h3>
              {values.length > 0 ? (
                <div className="space-y-2">
                  {values.map(([key, val]) => (
                    <div key={key} className="flex justify-between items-center">
                      <span className="text-sm text-white/50">
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span className="text-sm font-medium text-white">
                        {typeof val === 'number'
                          ? val.toLocaleString()
                          : String(val)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-white/25">No data</p>
              )}
            </div>
          )
        })}
      </div>
      {lightTheme && (
        <style jsx global>{`
          .platform-analytics-light [class~="text-white"] { color: rgb(17 24 39) !important; }
          .platform-analytics-light [class~="text-white/50"] { color: rgb(107 114 128) !important; }
          .platform-analytics-light [class~="text-white/40"] { color: rgb(107 114 128) !important; }
          .platform-analytics-light [class~="text-white/25"] { color: rgb(156 163 175) !important; }
          .platform-analytics-light [class~="bg-white/[0.03]"] { background-color: rgb(255 255 255) !important; }
          .platform-analytics-light [class~="border-white/[0.08]"] { border-color: rgb(229 231 235) !important; }
        `}</style>
      )}
    </div>
  )
}
