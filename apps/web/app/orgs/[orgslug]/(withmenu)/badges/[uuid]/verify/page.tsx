import CertificateVerificationPage from '@components/Pages/Certificate/CertificateVerificationPage';
import React from 'react';

interface BadgeVerifyPageProps {
  params: Promise<{
    uuid: string;
  }>;
}

const BadgeVerifyPage: React.FC<BadgeVerifyPageProps> = async ({ params }) => {
  const { uuid } = await params;
  return <CertificateVerificationPage certificateUuid={uuid} />;
};

export default BadgeVerifyPage;
