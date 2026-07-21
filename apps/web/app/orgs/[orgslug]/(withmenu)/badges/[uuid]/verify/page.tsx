import { notFound } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { getLearningBadgeAward } from '@services/learning/learning'
import CertificatePreview from '@components/Learning/BadgeCertificatePreview'

interface BadgeVerifyPageProps {
  params: Promise<{
    uuid: string;
  }>;
}

const BadgeVerifyPage: React.FC<BadgeVerifyPageProps> = async ({ params }) => {
  const { uuid } = await params
  const session = await getServerSession()
  try {
    const award = await getLearningBadgeAward(uuid, session?.tokens?.access_token)
    const badge = award?.badge || {}
    const learner = award?.user || award?.learner || {}
    return (
      <main className="mx-auto max-w-5xl px-5 py-10">
        <CertificatePreview
          certificationName={badge.name || 'Learning Badge'}
          certificationDescription={badge.description || ''}
          certificationType="badge"
          certificatePattern="modern"
          certificateInstructor={award?.issuer?.name || award?.issuer_name || ''}
          certificateId={award.award_uuid || uuid}
          awardedDate={award.awarded_at ? new Date(award.awarded_at).toLocaleDateString() : ''}
          qrCodeLink={typeof window === 'undefined' ? undefined : window.location.href}
          recipientName={learner.name || learner.username || award?.learner_name || ''}
          badgeImageUrl={badge.thumbnail_image || ''}
        />
      </main>
    )
  } catch {
    notFound()
  }
};

export default BadgeVerifyPage;
