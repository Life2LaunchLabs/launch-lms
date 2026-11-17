'use client'
import { useOrg } from '@components/Contexts/OrgContext'

/**
 * Whether an organization uses school records and the Education Plan and Profile (PL-6). The API sends it
 * resolved on the org's config (`org.config.config.school_records`); an org read before it existed counts as on.
 */
export function schoolRecordsOn(org: any): boolean {
  return org?.config?.config?.school_records !== false
}

/** The current organization's school records switch. Off, nothing about school records or the EPP shows. */
export function useSchoolRecords(): boolean {
  return schoolRecordsOn(useOrg())
}
