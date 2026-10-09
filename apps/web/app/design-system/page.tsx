import { notFound } from 'next/navigation'
import DesignSystemCatalog from '@components/DesignSystem/DesignSystemCatalog'

export const metadata = {
  title: 'Launch LMS design system',
  robots: { index: false, follow: false },
}

export default function DesignSystemPage() {
  if (process.env.NODE_ENV !== 'development' && process.env.LAUNCHLMS_DESIGN_SYSTEM_ENABLED !== 'true') {
    notFound()
  }
  return <DesignSystemCatalog />
}
