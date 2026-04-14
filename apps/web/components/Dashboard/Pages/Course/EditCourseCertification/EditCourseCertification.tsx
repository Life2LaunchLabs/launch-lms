import {
  FormField,
  FormLabelAndMessage,
  Input,
  Textarea,
} from '@components/Objects/StyledElements/Form/Form';
import { useFormik } from 'formik';
import { AlertTriangle, Award, FileText, Settings } from 'lucide-react';
import CertificatePreview from './CertificatePreview';
import * as Form from '@radix-ui/react-form';
import React, { useEffect, useState, useRef } from 'react';
import { useCourseFieldSync, useCourse } from '@components/Contexts/CourseContext';
import { useLHSession } from '@components/Contexts/LHSessionContext';
import { useOrg } from '@components/Contexts/OrgContext';
import { 
  createCertification, 
  deleteCertification 
} from '@services/courses/certifications';
import {
  CustomSelect,
  CustomSelectContent,
  CustomSelectItem,
  CustomSelectTrigger,
  CustomSelectValue,
} from "../EditCourseGeneral/CustomSelect";
import useSWR from 'swr';
import { getAPIUrl } from '@services/config/config';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

type EditCourseCertificationProps = {
  orgslug: string
  course_uuid?: string
}

const validate = (values: any, t: any) => {
  const errors = {} as any;

  if (values.enable_certification && !values.certification_name) {
    errors.certification_name = 'Badge name is required';
  } else if (values.certification_name && values.certification_name.length > 100) {
    errors.certification_name = 'Badge name must be 100 characters or less';
  }

  if (values.enable_certification && !values.certification_description) {
    errors.certification_description = 'Badge description is required';
  } else if (values.certification_description && values.certification_description.length > 500) {
    errors.certification_description = 'Badge description must be 500 characters or less';
  }

  if (values.enable_certification && !values.badge_criteria_text && !values.badge_criteria_url) {
    errors.badge_criteria_text = 'Criteria text or criteria URL is required';
  }

  return errors;
};

function EditCourseCertification(props: EditCourseCertificationProps) {
  const { t } = useTranslation()
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const course = useCourse() as any;
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



  // Create initial values object
  const getInitialValues = () => {
    // Use existing certification data if available, otherwise fall back to course data
    const config = existingCertification?.config || {};
    
    return {
      enable_certification: hasExistingCertification,
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

  // Handle enabling/disabling certification
  const handleCertificationToggle = async (enabled: boolean) => {
    if (enabled && !org?.email) {
      setError('Your organization needs a contact email before you can enable Open Badges. Add one in Organization Settings → General.');
      return;
    }
    if (enabled && !hasExistingCertification) {
      // Create new certification
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

        const result = await createCertification(
          courseStructure.id,
          config,
          org.id,
          access_token
        );



        // createCertification uses errorHandling which returns JSON directly on success
        if (result) {
          toast.success(t('dashboard.courses.certification.toasts.create_success'));
          mutateCertifications();
          formik.setFieldValue('enable_certification', true);
        } else {
          throw new Error('Failed to create certification');
        }
      } catch (e) {
        setError(t('dashboard.courses.certification.errors.create_failed'));
        toast.error(t('dashboard.courses.certification.toasts.create_error'));
        formik.setFieldValue('enable_certification', false);
      } finally {
        setIsCreating(false);
      }
    } else if (!enabled && hasExistingCertification) {
      // Delete existing certification
      try {
        const result = await deleteCertification(
          existingCertification.certification_uuid,
          org.id,
          access_token
        );

        // deleteCertification uses errorHandling which returns JSON directly on success
        if (result) {
          toast.success(t('dashboard.courses.certification.toasts.remove_success'));
          mutateCertifications();
          formik.setFieldValue('enable_certification', false);
        } else {
          throw new Error('Failed to delete certification');
        }
      } catch (e) {
        setError(t('dashboard.courses.certification.errors.remove_failed'));
        toast.error(t('dashboard.courses.certification.toasts.remove_error'));
        formik.setFieldValue('enable_certification', true);
      }
    } else {
      formik.setFieldValue('enable_certification', enabled);
    }
  };

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
    <div>
      {courseStructure && (
        <div>
          <div className="mx-4 sm:mx-10 bg-white rounded-xl shadow-xs px-4 py-4">
            {/* Header Section */}
            <div className="flex items-center justify-between bg-gray-50 px-3 sm:px-5 py-3 rounded-md mb-3">
              <div className="flex flex-col -space-y-1">
                <h1 className="font-bold text-lg sm:text-xl text-gray-800">Course Badge</h1>
                <h2 className="text-gray-500 text-xs sm:text-sm">
                  Configure the Open Badges 2.0 credential learners earn for completing this course.
                </h2>
              </div>
              <div className="flex items-center space-x-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={formik.values.enable_certification}
                    onChange={(e) => handleCertificationToggle(e.target.checked)}
                    disabled={isCreating}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
                {isCreating && (
                  <div className="animate-spin">
                    <Settings size={16} />
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="flex justify-center bg-red-200 rounded-md text-red-950 space-x-2 items-center p-4 mb-6 transition-all shadow-xs">
                <AlertTriangle size={18} />
                <div className="font-bold text-sm">{error}</div>
              </div>
            )}

            {/* Badge Configuration - Only show if enabled and has existing config */}
            {formik.values.enable_certification && hasExistingCertification && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Form Section */}
                <div className="lg:col-span-3">
                  <Form.Root className="space-y-6">
                    {/* Basic Information Section */}
                    <div className="flex flex-col bg-gray-50 -space-y-1 px-3 sm:px-5 py-3 rounded-md mb-3">
                      <h3 className="font-bold text-md text-gray-800 flex items-center gap-2">
                        <FileText size={16} />
                        Badge details
                      </h3>
                      <p className="text-gray-500 text-xs sm:text-sm">
                        Configure the Open Badges 2.0 metadata learners will receive for this course.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Badge Name */}
                      <FormField name="certification_name">
                        <FormLabelAndMessage 
                          label="Badge name"
                          message={formik.errors.certification_name} 
                        />
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

                      {/* Badge Type */}
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

                    {/* Badge Description */}
                    <FormField name="certification_description">
                      <FormLabelAndMessage 
                        label="Badge description"
                        message={formik.errors.certification_description} 
                      />
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

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <FormField name="badge_criteria_text">
                        <FormLabelAndMessage
                          label="Criteria text"
                          message={formik.errors.badge_criteria_text}
                        />
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

                    {/* Badge Presentation Section */}
                    <div className="flex flex-col bg-gray-50 -space-y-1 px-3 sm:px-5 py-3 rounded-md mb-3">
                      <h3 className="font-bold text-md text-gray-800 flex items-center gap-2">
                        <Award size={16} />
                        Badge presentation
                      </h3>
                      <p className="text-gray-500 text-xs sm:text-sm">
                        Choose the visual theme used for the badge page and exported PDF.
                      </p>
                    </div>

                    {/* Pattern Selection */}
                    <FormField name="certificate_pattern">
                      <FormLabelAndMessage label={t('dashboard.courses.certification.form.certificate_pattern_label')} />
                      <Form.Control asChild>
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                          {['royal', 'tech', 'nature', 'geometric', 'vintage', 'waves', 'minimal', 'professional', 'academic', 'modern'].map((patternValue) => (
                            <div
                              key={patternValue}
                              className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                                formik.values.certificate_pattern === patternValue
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                              onClick={() => formik.setFieldValue('certificate_pattern', patternValue)}
                            >
                              <div className="text-center">
                                <div className="text-sm font-medium text-gray-900">{t(`dashboard.courses.certification.patterns.${patternValue}.name`)}</div>
                                <div className="text-xs text-gray-500 mt-1">{t(`dashboard.courses.certification.patterns.${patternValue}.description`)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Form.Control>
                    </FormField>

                  </Form.Root>
                </div>

                {/* Preview Section */}
                <div className="lg:col-span-2">
                  <div className="bg-white rounded-xl shadow-xs border border-gray-200 sticky top-6 min-h-[320px]">
                    <div className="flex flex-col bg-gray-50 -space-y-1 px-3 sm:px-5 py-3 rounded-t-xl mb-3">
                      <h3 className="font-bold text-md text-gray-800 flex items-center gap-2">
                        <Award size={16} />
                        {t('dashboard.courses.certification.sections.preview.title')}
                      </h3>
                      <p className="text-gray-500 text-xs sm:text-sm">
                        {t('dashboard.courses.certification.sections.preview.subtitle')}
                      </p>
                    </div>
                    
                    <div className="p-4">
                      <CertificatePreview
                        certificationName={formik.values.certification_name}
                        certificationDescription={formik.values.certification_description}
                        certificationType={formik.values.certification_type}
                        certificatePattern={formik.values.certificate_pattern}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Disabled State */}
            {!formik.values.enable_certification && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                <Award className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="font-medium text-gray-700 mb-2">Open Badges are disabled for this course</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Enable badge issuing to award an Open Badges 2.0 credential when learners complete every activity.
                </p>
                <button
                  type="button"
                  onClick={() => handleCertificationToggle(true)}
                  disabled={isCreating}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Award size={16} />
                  {isCreating ? 'Creating badge configuration...' : 'Enable Open Badges'}
                </button>
              </div>
            )}

            {/* Creating State - when toggle is on but no certification exists yet */}
            {formik.values.enable_certification && !hasExistingCertification && isCreating && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
                <div className="animate-spin mx-auto mb-4">
                  <Settings className="w-16 h-16 text-blue-500" />
                </div>
                <h3 className="font-medium text-blue-700 mb-2">{t('dashboard.courses.certification.states.creating.title')}</h3>
                <p className="text-sm text-blue-600">
                  {t('dashboard.courses.certification.states.creating.message')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default EditCourseCertification; 
