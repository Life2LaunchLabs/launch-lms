import { OrgProvider } from '@components/Contexts/OrgContext'
import { getHostOrgSlug } from '@services/org/orgResolution'

export default async function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const orgslug = await getHostOrgSlug()

    // If no org slug found, let the page components handle it
    // (they show OrgNotFound appropriately)
    if (!orgslug) {
        return <>{children}</>
    }

    return <OrgProvider orgslug={orgslug}>{children}</OrgProvider>
}
