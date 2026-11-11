import { Metadata } from 'next'
import { OrgProvider } from '@components/Contexts/OrgContext'
import NextTopLoader from 'nextjs-toploader'
import Toast from '@components/Objects/StyledElements/Toast/Toast'
import '@styles/globals.css'
import Footer from '@components/Footer/Footer'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getOrgFaviconMediaDirectory, getOrgLogoMediaDirectory } from '@services/media/media'
import OrgThemeVariables from './OrgThemeVariables'
import { PageTitleProvider } from '@components/Contexts/PageTitleContext'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgslug: string }>
}): Promise<Metadata> {
  const { orgslug } = await params
  try {
    const org = await getOrganizationContextInfo(orgslug, {
      revalidate: 86400,
      tags: ['organizations'],
    })
    const general = org?.config?.config?.customization?.general
    const faviconImage = general?.favicon_image || org?.config?.config?.general?.favicon_image
    const icon = faviconImage
      ? getOrgFaviconMediaDirectory(org.org_uuid, faviconImage)
      : org?.logo_image ? getOrgLogoMediaDirectory(org.org_uuid, org.logo_image) : null
    // An optional dark-mode favicon: the browser picks it when it is in dark mode.
    const darkIcon = general?.separate_dark_favicon && general?.dark_favicon_image
      ? getOrgFaviconMediaDirectory(org.org_uuid, general.dark_favicon_image)
      : null
    if (icon && darkIcon) {
      return {
        icons: {
          icon: [
            { url: icon, media: '(prefers-color-scheme: light)' },
            { url: darkIcon, media: '(prefers-color-scheme: dark)' },
          ],
        },
      }
    }
    if (icon || darkIcon) return { icons: { icon: (icon || darkIcon)! } }
  } catch {
    return {}
  }
  return {}
}

export default async function RootLayout(props: {
  children: React.ReactNode
  params: Promise<{ orgslug: string }>
}) {
  const params = await props.params

  return (
    <div>
      <OrgProvider orgslug={params.orgslug} loadingShell>
        <PageTitleProvider><OrgThemeVariables>
          <NextTopLoader color="#2e2e2e" initialPosition={0.3} height={4} easing={'ease'} speed={500} showSpinner={false} />
          <Toast />
          {props.children}
          <Footer />
        </OrgThemeVariables></PageTitleProvider>
      </OrgProvider>
    </div>
  )
}
