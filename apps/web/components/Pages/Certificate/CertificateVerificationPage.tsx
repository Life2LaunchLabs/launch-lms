'use client';

import React, { useEffect, useState } from 'react';
import { getCertificateByUuid } from '@services/courses/certifications';
import { getLearningBadgeAward } from '@services/learning/learning';
import CertificatePreview from '@components/Dashboard/Pages/Course/EditCourseCertification/CertificatePreview';
import { Award, XCircle } from 'lucide-react';
import Link from 'next/link';
import { getUriWithOrg, routePaths } from '@services/config/config';
import { getCourseThumbnailMediaDirectory, normalizeMediaUrl } from '@services/media/media';
import { useOrg } from '@components/Contexts/OrgContext';
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper';
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader';
import CourseShare from '@components/Objects/Courses/CourseShare/CourseShare';

interface CertificateVerificationPageProps {
  certificateUuid: string;
}

const CertificateVerificationPage: React.FC<CertificateVerificationPageProps> = ({ certificateUuid }) => {
  const [certificateData, setCertificateData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const org = useOrg() as any;

  // Fetch certificate data
  useEffect(() => {
    const fetchCertificate = async () => {
      if (!org?.id) {
        return; // Wait for org to be available
      }

      try {
        let result = await getCertificateByUuid(certificateUuid, org.id);

        if (result.success && result.data) {
          setCertificateData(result.data);
        } else {
          const award = await getLearningBadgeAward(certificateUuid).catch(() => null);
          if (award?.award && award?.badge) {
            setCertificateData(normalizeLearningAwardForCertificate(award));
          } else {
            setError('Badge not found');
          }
        }
      } catch (error) {
        console.error('Error fetching certificate:', error);
        setError('Failed to verify badge. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCertificate();
  }, [certificateUuid, org?.id]);

  if (isLoading) {
    return (
      <GeneralWrapperStyled>
        <ContentPageHeader orgslug={org?.org_slug || ''} />
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
          <div className="space-y-4">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-gray-900" />
            <p className="text-sm font-medium text-gray-500">Loading certificate...</p>
          </div>
        </div>
      </GeneralWrapperStyled>
    );
  }

  if (error) {
    return (
      <GeneralWrapperStyled>
        <ContentPageHeader orgslug={org?.org_slug || ''} />
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
          <div className="max-w-md space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
              <XCircle className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-950">Badge not found</h1>
            <p className="text-sm leading-6 text-gray-500">{error}</p>
          </div>
        </div>
      </GeneralWrapperStyled>
    );
  }

  if (!certificateData) {
    return null;
  }

  const orgslug = org?.org_slug || ''
  const cleanCourseUuid = certificateData.course.course_uuid.replace('course_', '').replace('badge_', '')
  const qrCodeLink = getUriWithOrg(orgslug, `/badges/${certificateData.certificate_user.user_certification_uuid}/verify`);
  const badgeDetailsHref = getUriWithOrg(orgslug, routePaths.org.badgeStatus(cleanCourseUuid))
  const certificateOrgUuid = certificateData.org?.org_uuid || org?.org_uuid
  const courseThumbnailUrl = certificateData.course?.thumbnail_image && certificateOrgUuid
    ? getCourseThumbnailMediaDirectory(
        certificateOrgUuid,
        certificateData.course.course_uuid,
        certificateData.course.thumbnail_image
      )
    : ''
  const badgeImageUrl = normalizeMediaUrl(certificateData.badge_class?.image)
    || normalizeMediaUrl(certificateData.certification?.config?.badge_image_url)
    || courseThumbnailUrl

  return (
    <GeneralWrapperStyled>
      <ContentPageHeader orgslug={orgslug} />
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-5">
        <div className="w-full" id="certificate-preview">
          <CertificatePreview
            certificationName={certificateData.badge_class?.name || certificateData.certification.config.badge_name || certificateData.certification.config.certification_name}
            certificationDescription={certificateData.badge_class?.description || certificateData.certification.config.badge_description || certificateData.certification.config.certification_description}
            certificationType={certificateData.certification.config.certification_type}
            certificatePattern={certificateData.certification.config.badge_theme || certificateData.certification.config.certificate_pattern}
            certificateInstructor={certificateData.issuer?.name}
            certificateId={certificateData.certificate_user.user_certification_uuid}
            awardedDate={new Date(certificateData.certificate_user.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
            qrCodeLink={qrCodeLink}
            badgeImageUrl={badgeImageUrl}
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <CourseShare
            courseName={certificateData.course.name}
            courseUrl={qrCodeLink}
            label="Share"
            shareText={`I earned the ${certificateData.course.name} badge`}
          />
          <Link
            href={badgeDetailsHref}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-neutral-600 nice-shadow transition-colors hover:text-neutral-800"
          >
            <Award size={14} />
            Badge details
          </Link>
        </div>
      </div>
    </GeneralWrapperStyled>
  );
};

export default CertificateVerificationPage; 

function normalizeLearningAwardForCertificate(award: any) {
  const badgeUuid = award.badge?.badge_uuid || ''
  return {
    kind: 'learning',
    org: award.org,
    course: {
      course_uuid: badgeUuid,
      name: award.badge?.name || award.badge_class?.name || 'Badge',
      description: award.badge?.description || award.badge_class?.description || '',
      thumbnail_image: award.badge?.thumbnail_image || '',
    },
    certificate_user: {
      user_certification_uuid: award.award?.award_uuid,
      created_at: award.award?.issued_at,
    },
    certification: {
      config: {
        badge_name: award.badge_class?.name || award.badge?.name || 'Badge',
        badge_description: award.badge_class?.description || award.badge?.description || '',
        certification_name: award.badge_class?.name || award.badge?.name || 'Badge',
        certification_description: award.badge_class?.description || award.badge?.description || '',
        certification_type: 'completion',
        badge_theme: award.badge?.badge_metadata?.badge_theme || 'default',
        badge_image_url: award.badge_class?.image || award.badge?.thumbnail_image || '',
      },
    },
    badge_class: award.badge_class,
    badge_assertion: award.badge_assertion,
    issuer: award.open_badges?.issuer,
  }
}
