'use client'
import React from 'react'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { cn } from '@/lib/utils'

/** The org's dark-mode logo, when it has chosen to keep one apart from its main logo. */
export function orgDarkLogo(org: any): string {
  const general = org?.config?.config?.customization?.general
  return general?.separate_dark_logo && general?.dark_logo_image ? general.dark_logo_image : ''
}

// `surface` says what the logo sits on: the page theme, or a surface that is always dark (the admin sidebar).
type OrgLogoProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & { org: any; surface?: 'theme' | 'dark' }

/** The org's logo, swapped for its dark-mode logo on dark backgrounds when it has one. */
export const OrgLogo = React.forwardRef<HTMLImageElement, OrgLogoProps>(function OrgLogo({ org, surface = 'theme', className, alt, ...rest }, ref) {
  const light = getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)
  const dark = orgDarkLogo(org)
  if (!dark) return <img ref={ref} src={light} alt={alt} className={className} {...rest} />
  if (surface === 'dark') return <img ref={ref} src={getOrgLogoMediaDirectory(org.org_uuid, dark)} alt={alt} className={className} {...rest} />
  // Both load so a theme switch never waits; the light one carries ref and onLoad for anyone measuring it.
  return <>
    <img ref={ref} src={light} alt={alt} className={cn(className, 'dark:hidden')} {...rest} />
    <img src={getOrgLogoMediaDirectory(org.org_uuid, dark)} alt={alt} className={cn(className, 'hidden dark:block')} style={rest.style} />
  </>
})
