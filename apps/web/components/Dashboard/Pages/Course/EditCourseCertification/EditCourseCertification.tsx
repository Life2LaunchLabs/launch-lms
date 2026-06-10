import {
  FormField,
  FormLabelAndMessage,
  Input,
  Textarea,
} from '@components/Objects/StyledElements/Form/Form';
import { useFormik } from 'formik';
import { AlertTriangle, Loader2 } from 'lucide-react';
import CertificatePreview from './CertificatePreview';
import * as Form from '@radix-ui/react-form';
import React, { useEffect, useState, useRef } from 'react';
import { useCourseFieldSync } from '@components/Contexts/CourseContext';
import { useLHSession } from '@components/Contexts/LHSessionContext';
import { useOrg } from '@components/Contexts/OrgContext';
import { createCertification } from '@services/courses/certifications';
import {
  CustomSelect,
  CustomSelectContent,
  CustomSelectItem,
  CustomSelectTrigger,
  CustomSelectValue,
} from "../EditCourseGeneral/CustomSelect";
import useSWR from 'swr';
import { getAPIUrl } from '@services/config/config';
import { getCourseThumbnailMediaDirectory, normalizeMediaUrl } from '@services/media/media';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

type EditCourseCertificationProps = {
  orgslug: string
  course_uuid?: string
}

const validate = (values: any, t: any) => {
  const errors = {} as any;

  if (!values.certification_name) {
    errors.certification_name = 'Badge name is required';
  } else if (values.certification_name && values.certification_name.length > 100) {
    errors.certification_name = 'Badge name must be 100 characters or less';
  }

  if (!values.certification_description) {
    errors.certification_description = 'Badge description is required';
  } else if (values.certification_description && values.certification_description.length > 500) {
    errors.certification_description = 'Badge description must be 500 characters or less';
  }

  if (!values.badge_criteria_text && !values.badge_criteria_url) {
    errors.badge_criteria_text = 'Criteria text or criteria URL is required';
  }

  return errors;
};

function EditCourseCertification(props: EditCourseCertificationProps) {
  void props
  const { t } = useTranslation()
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const session = useLHSession() as any;
  const org = useOrg() as any;
  const access_token = session?.data?.tokens?.access_token;

  // Use the new field sync hook
  const {
    syncChanges,
    cancelPendingSync,
    courseStructure,
    isLoading,
    isSaving,
  } = useCourseFieldSync('editCourseCertification');

  // Track previous values to detect changes
  const previousValuesRef = useRef<any>(null);
  const hasInitializedRef = useRef(false);

  // Fetch existing certifications
  const { data: certifications, error: certificationsError, mutate: mutateCertifications } = useSWR(
    courseStructure?.course_uuid && access_token && org?.id ?
    `certifications/course/${courseStructure.course_uuid}?org_id=${org.id}` : null,
    async () => {
      if (!courseStructure?.course_uuid || !access_token || !org?.id) return null;
      const result = await fetch(
        `${getAPIUrl()}certifications/course/${courseStructure.course_uuid}?org_id=${org.id}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access_token}`,
          },
          credentials: 'include',
        }
      );
      const response = await result.json();
      

      
      if (result.status === 200) {
        return {
          success: true,
          data: response,
          status: result.status,
          HTTPmessage: result.statusText,
        };
      } else {
        return {
          success: false,
          data: response,
          status: result.status,
          HTTPmessage: result.statusText,
        };
      }
    }
  );

  const existingCertification = certifications?.data?.[0]; // Assuming one certification per course
  const hasExistingCertification = !!existingCertification;
  const fallbackBadgeImageUrl = courseStructure?.thumbnail_image && org?.org_uuid && courseStructure?.course_uuid
    ? getCourseThumbnailMediaDirectory(
        org.org_uuid,
        courseStructure.course_uuid,
        courseStructure.thumbnail_image
      )
    : '/empty_thumbnail.png'



  // Create initial values object
  const getInitialValues = () => {
    // Use existing certification data if available, otherwise fall back to course data
    const config = existingCertification?.config || {};
    
    return {
      certification_name: config.badge_name || config.certification_name || courseStructure?.name || '',
      certification_description: config.badge_description || config.certification_description || courseStructure?.description || '',
      certification_type: config.certification_type || 'completion',
      certificate_pattern: config.badge_theme || config.certificate_pattern || 'professional',
      badge_criteria_text: config.badge_criteria_text || 'Complete all required activities in this course.',
      badge_criteria_url: config.badge_criteria_url || '',
      badge_image_url: config.badge_image_url || '',
      badge_support_url: config.badge_support_url || '',
    };
  };

  const formik = useFormik({
    initialValues: getInitialValues(),
    validate: (values) => validate(values, t),
    onSubmit: async values => {
      // This is no longer used - saving is handled by the main Save button
    },
    enableReinitialize: true,
  }) as any;

  const ensureCertification = async () => {
    if (!courseStructure?.id || hasExistingCertification || isCreating) return;
    if (!org?.email) {
      setError('Your organization needs a contact email before you can enable Open Badges. Add one in Organization Settings → General.');
      return;
    }

    setIsCreating(true);
    try {
      const config = {
        badge_name: formik.values.certification_name || courseStructure?.name || '',
        badge_description: formik.values.certification_description || courseStructure?.description || '',
        certification_name: formik.values.certification_name || courseStructure?.name || '',
        certification_description: formik.values.certification_description || courseStructure?.description || '',
        certification_type: formik.values.certification_type || 'completion',
        badge_theme: formik.values.certificate_pattern || 'professional',
        certificate_pattern: formik.values.certificate_pattern || 'professional',
        badge_criteria_text: formik.values.badge_criteria_text || 'Complete all required activities in this course.',
        badge_criteria_url: formik.values.badge_criteria_url || '',
        badge_image_url: formik.values.badge_image_url || '',
        badge_support_url: formik.values.badge_support_url || '',
      };

      const result = await createCertification(courseStructure.id, config, org.id, access_token);

      if (result) {
        toast.success(t('dashboard.courses.certification.toasts.create_success'));
        mutateCertifications();
      } else {
        throw new Error('Failed to create certification');
      }
    } catch (e) {
      setError(t('dashboard.courses.certification.errors.create_failed'));
      toast.error(t('dashboard.courses.certification.toasts.create_error'));
    } finally {
      setIsCreating(false);
    }
  };

  useEffect(() => {
    if (certifications?.success && Array.isArray(certifications.data) && certifications.data.length === 0) {
      void ensureCertification();
    }
  }, [certifications?.success, certifications?.data?.length, courseStructure?.id, org?.email]);

  // Reset form when certifications data changes
  useEffect(() => {
    if (certifications && !isLoading) {
      const newValues = getInitialValues();
      formik.resetForm({ values: newValues });
    }
  }, [certifications, isLoading]);

  // Handle form changes - update course context with certification data
  useEffect(() => {
    // Skip if loading, saving, or no existing certification
    if (isLoading || isSaving || !hasExistingCertification) return;

    // Skip initial mount
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      previousValuesRef.current = formik.values;
      return;
    }

    const formikValues = formik.values as any;
    const prevValues = previousValuesRef.current;

    // Check if values actually changed from previous
    if (!prevValues) {
      previousValuesRef.current = formikValues;
      return;
    }

    const hasChanges = Object.keys(formikValues).some(
      key => formikValues[key] !== prevValues[key]
    );

    if (hasChanges) {
      // Store certification data in course context so it gets saved with the main save button
      const certificationData = {
        _certificationData: {
          certification_uuid: existingCertification.certification_uuid,
          config: {
            badge_name: formikValues.certification_name,
            badge_description: formikValues.certification_description,
            certification_name: formikValues.certification_name,
            certification_description: formikValues.certification_description,
            certification_type: formikValues.certification_type,
            badge_theme: formikValues.certificate_pattern,
            certificate_pattern: formikValues.certificate_pattern,
            badge_criteria_text: formikValues.badge_criteria_text,
            badge_criteria_url: formikValues.badge_criteria_url,
            badge_image_url: formikValues.badge_image_url,
            badge_support_url: formikValues.badge_support_url,
          }
        }
      };

      // Sync changes immediately (certification changes are important)
      syncChanges(certificationData, true);
      previousValuesRef.current = { ...formikValues };
    }
  }, [formik.values, isLoading, isSaving, hasExistingCertification, existingCertification, syncChanges]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelPendingSync();
    };
  }, [cancelPendingSync]);

  if (isLoading || !courseStructure || (courseStructure.course_uuid && access_token && certifications === undefined)) {
    return <div>{t('dashboard.courses.settings.loading')}</div>;
  }

  if (certificationsError) {
    return <div>{t('dashboard.courses.certification.errors.loading')}</div>;
  }

  return (
    <div className="px-10 pb-10 pt-6">
      {courseStructure && (
        <div className="space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm font-semibold text-red-900">
              <AlertTriangle size={18} />
              <div>{error}</div>
            </div>
          )}

          {hasExistingCertification ? (
            <>
              <section className="rounded-xl bg-white p-6 shadow-xs">
                <h2 className="text-lg font-bold text-gray-900">Certificate Preview</h2>
                <div className="mt-5">
                  <CertificatePreview
                    certificationName={formik.values.certification_name}
                    certificationDescription={formik.values.certification_description}
                    certificationType={formik.values.certification_type}
                    certificatePattern={formik.values.certificate_pattern}
                    badgeImageUrl={normalizeMediaUrl(formik.values.badge_image_url) || fallbackBadgeImageUrl}
                  />
                </div>
              </section>

              <section className="rounded-xl bg-white p-6 shadow-xs">
                <h2 className="text-lg font-bold text-gray-900">Details</h2>
                <Form.Root className="mt-5 space-y-6">
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <FormField name="certification_name">
                      <FormLabelAndMessage label="Badge name" message={formik.errors.certification_name} />
                      <Form.Control asChild>
                        <Input
                          style={{ backgroundColor: 'white' }}
                          onChange={formik.handleChange}
                          value={formik.values.certification_name}
                          type="text"
                          placeholder="e.g., Advanced JavaScript Badge"
                          required
                        />
                      </Form.Control>
                    </FormField>

                    <FormField name="certification_type">
                      <FormLabelAndMessage label="Badge type" />
                      <Form.Control asChild>
                        <CustomSelect
                          value={formik.values.certification_type}
                          onValueChange={(value) => {
                            if (!value) return;
                            formik.setFieldValue('certification_type', value);
                          }}
                        >
                          <CustomSelectTrigger className="w-full bg-white">
                            <CustomSelectValue>
                              {t(`dashboard.courses.certification.types.${formik.values.certification_type || 'completion'}`)}
                            </CustomSelectValue>
                          </CustomSelectTrigger>
                          <CustomSelectContent>
                            <CustomSelectItem value="completion">{t('dashboard.courses.certification.types.completion')}</CustomSelectItem>
                            <CustomSelectItem value="achievement">{t('dashboard.courses.certification.types.achievement')}</CustomSelectItem>
                            <CustomSelectItem value="assessment">{t('dashboard.courses.certification.types.assessment')}</CustomSelectItem>
                            <CustomSelectItem value="participation">{t('dashboard.courses.certification.types.participation')}</CustomSelectItem>
                            <CustomSelectItem value="mastery">{t('dashboard.courses.certification.types.mastery')}</CustomSelectItem>
                            <CustomSelectItem value="professional">{t('dashboard.courses.certification.types.professional')}</CustomSelectItem>
                            <CustomSelectItem value="continuing">{t('dashboard.courses.certification.types.continuing')}</CustomSelectItem>
                            <CustomSelectItem value="workshop">{t('dashboard.courses.certification.types.workshop')}</CustomSelectItem>
                            <CustomSelectItem value="specialization">{t('dashboard.courses.certification.types.specialization')}</CustomSelectItem>
                          </CustomSelectContent>
                        </CustomSelect>
                      </Form.Control>
                    </FormField>
                  </div>

                  <FormField name="certification_description">
                    <FormLabelAndMessage label="Badge description" message={formik.errors.certification_description} />
                    <Form.Control asChild>
                      <Textarea
                        style={{ backgroundColor: 'white', height: '120px', minHeight: '120px' }}
                        onChange={formik.handleChange}
                        value={formik.values.certification_description}
                        placeholder="Describe what this badge represents and why it was awarded."
                        required
                      />
                    </Form.Control>
                  </FormField>

                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <FormField name="badge_criteria_text">
                      <FormLabelAndMessage label="Criteria text" message={formik.errors.badge_criteria_text} />
                      <Form.Control asChild>
                        <Textarea
                          style={{ backgroundColor: 'white', height: '120px', minHeight: '120px' }}
                          onChange={formik.handleChange}
                          value={formik.values.badge_criteria_text}
                          placeholder="Explain what learners must do to earn this badge."
                        />
                      </Form.Control>
                    </FormField>

                    <div className="space-y-6">
                      <FormField name="certificate_pattern">
                        <FormLabelAndMessage label="Badge presentation" />
                        <Form.Control asChild>
                          <CustomSelect
                            value={formik.values.certificate_pattern}
                            onValueChange={(value) => {
                              if (!value) return;
                              formik.setFieldValue('certificate_pattern', value);
                            }}
                          >
                            <CustomSelectTrigger className="w-full bg-white">
                              <CustomSelectValue>
                                {t(`dashboard.courses.certification.patterns.${formik.values.certificate_pattern || 'professional'}.name`)}
                              </CustomSelectValue>
                            </CustomSelectTrigger>
                            <CustomSelectContent>
                              {['royal', 'tech', 'nature', 'geometric', 'vintage', 'waves', 'minimal', 'professional', 'academic', 'modern'].map((patternValue) => (
                                <CustomSelectItem key={patternValue} value={patternValue}>
                                  {t(`dashboard.courses.certification.patterns.${patternValue}.name`)}
                                </CustomSelectItem>
                              ))}
                            </CustomSelectContent>
                          </CustomSelect>
                        </Form.Control>
                      </FormField>

                      <FormField name="badge_criteria_url">
                        <FormLabelAndMessage label="Criteria URL" />
                        <Form.Control asChild>
                          <Input
                            style={{ backgroundColor: 'white' }}
                            onChange={formik.handleChange}
                            value={formik.values.badge_criteria_url}
                            type="url"
                            placeholder="https://example.com/badge-criteria"
                          />
                        </Form.Control>
                      </FormField>

                      <FormField name="badge_image_url">
                        <FormLabelAndMessage label="Badge image URL" />
                        <Form.Control asChild>
                          <Input
                            style={{ backgroundColor: 'white' }}
                            onChange={formik.handleChange}
                            value={formik.values.badge_image_url}
                            type="url"
                            placeholder="Optional override for the badge image"
                          />
                        </Form.Control>
                      </FormField>

                      <FormField name="badge_support_url">
                        <FormLabelAndMessage label="Support URL" />
                        <Form.Control asChild>
                          <Input
                            style={{ backgroundColor: 'white' }}
                            onChange={formik.handleChange}
                            value={formik.values.badge_support_url}
                            type="url"
                            placeholder="Optional issuer support or help page"
                          />
                        </Form.Control>
                      </FormField>
                    </div>
                  </div>
                </Form.Root>
              </section>
            </>
          ) : (
            <section className="flex min-h-[240px] items-center justify-center rounded-xl bg-white p-6 text-center shadow-xs">
              <div>
                {error ? (
                  <AlertTriangle className="mx-auto mb-4 h-8 w-8 text-red-400" />
                ) : (
                  <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-gray-400" />
                )}
                <h2 className="text-lg font-bold text-gray-900">{error ? 'Badge setup needs attention' : 'Creating badge'}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {error
                    ? 'Every course includes a badge, but setup cannot continue until the issue above is resolved.'
                    : 'Every course includes a badge. Preparing this course&apos;s badge settings now.'}
                </p>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default EditCourseCertification; 
