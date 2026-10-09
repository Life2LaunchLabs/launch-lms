'use client';
import { updateProfile } from '@services/settings/portfolio'
import { getUser } from '@services/users/users'
import React, { useEffect, useState } from 'react'
import { Formik, Form } from 'formik'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import {
  ArrowBigUpDash,
  Check,
  FileWarning,
  Info,
  ImageIcon,
  AlertTriangle,
} from 'lucide-react'
import UserAvatar from '@components/Objects/UserAvatar'
import * as Yup from 'yup'
import { Input } from "@components/ui/input"
import { Textarea } from "@components/ui/textarea"
import { Button } from "@components/ui/button"
import { Label } from "@components/ui/label"
import { toast } from 'react-hot-toast'
import { signOut } from '@components/Contexts/AuthContext'
import { getUriWithoutOrg } from '@services/config/config';
import { useTranslation } from 'react-i18next';
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { MediaAsset, applyMediaAssetToUserAvatar } from '@services/media/library'

interface FormValues {
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  bio: string;
}

const validationSchema = Yup.object().shape({
  email: Yup.string().email('Invalid email').required('Email is required'),
  username: Yup.string().required('Username is required'),
  first_name: Yup.string().required('First name is required'),
  last_name: Yup.string().required('Last name is required'),
  bio: Yup.string().max(400, 'Bio must be 400 characters or less'),
});

const UserEditForm = ({
  values,
  handleChange,
  errors,
  touched,
  isSubmitting,
  profilePicture
}: {
  values: FormValues;
  handleChange: React.ChangeEventHandler<any>;
  errors: any;
  touched: any;
  isSubmitting: boolean;
  profilePicture: {
    error: string | undefined;
    success: string;
    isLoading: boolean;
    openMediaPicker: () => void;
  };
}) => {
  const { t } = useTranslation();

  return (
    <Form>
      <div className="flex flex-col gap-0">
        <div className="flex flex-col bg-muted -space-y-1 px-5 py-3 mx-3 my-3 rounded-md">
          <h1 className="font-bold text-xl text-foreground">
            {t('user.settings.general.title')}
          </h1>
          <h2 className="text-muted-foreground text-md">
            {t('user.settings.general.subtitle')}
          </h2>
        </div>

        <div className="flex flex-col lg:flex-row mt-0 mx-5 my-5 gap-8">
          {/* Portfolio Information Section */}
          <div className="flex-1 min-w-0 space-y-4">
            <div>
              <Label htmlFor="email">{t('user.settings.general.email')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={values.email}
                onChange={handleChange}
                placeholder={t('user.settings.general.email_placeholder')}
              />
              {touched.email && errors.email && (
                <p className="text-red-500 text-sm mt-1">{errors.email}</p>
              )}
              {values.email !== values.email && (
                <div className="flex items-center space-x-2 mt-2 text-amber-600 bg-amber-50 p-2 rounded-md">
                  <AlertTriangle size={16} />
                  <span className="text-sm">{t('user.settings.general.logout_warning')}</span>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="username">{t('user.settings.general.username')}</Label>
              <Input
                id="username"
                name="username"
                value={values.username}
                onChange={handleChange}
                placeholder={t('user.settings.general.username_placeholder')}
              />
              {touched.username && errors.username && (
                <p className="text-red-500 text-sm mt-1">{errors.username}</p>
              )}
            </div>

            <div>
              <Label htmlFor="first_name">{t('user.settings.general.first_name')}</Label>
              <Input
                id="first_name"
                name="first_name"
                value={values.first_name}
                onChange={handleChange}
                placeholder={t('user.settings.general.first_name_placeholder')}
              />
              {touched.first_name && errors.first_name && (
                <p className="text-red-500 text-sm mt-1">{errors.first_name}</p>
              )}
            </div>

            <div>
              <Label htmlFor="last_name">{t('user.settings.general.last_name')}</Label>
              <Input
                id="last_name"
                name="last_name"
                value={values.last_name}
                onChange={handleChange}
                placeholder={t('user.settings.general.last_name_placeholder')}
              />
              {touched.last_name && errors.last_name && (
                <p className="text-red-500 text-sm mt-1">{errors.last_name}</p>
              )}
            </div>

            <div>
              <Label htmlFor="bio">
                {t('user.settings.general.bio')}
                <span className="text-muted-foreground text-sm ml-2">
                  ({t('user.settings.general.characters_left', { count: 400 - (values.bio?.length || 0) })})
                </span>
              </Label>
              <Textarea
                id="bio"
                name="bio"
                value={values.bio}
                onChange={handleChange}
                placeholder={t('user.settings.general.bio_placeholder')}
                className="min-h-[150px]"
                maxLength={400}
              />
              {touched.bio && errors.bio && (
                <p className="text-red-500 text-sm mt-1">{errors.bio}</p>
              )}
            </div>

          </div>

          {/* Portfolio Picture Section */}
          <div className="lg:w-80 w-full">
            <div className="bg-muted/50 p-6 rounded-lg nice-shadow h-full">
              <div className="flex flex-col items-center space-y-6">
                <Label className="font-bold">{t('user.settings.general.profile_picture')}</Label>
                {profilePicture.error && (
                  <div className="flex items-center bg-red-200 rounded-md text-red-950 px-4 py-2 text-sm">
                    <FileWarning size={16} className="mr-2" />
                    <span className="font-semibold first-letter:uppercase">{profilePicture.error}</span>
                  </div>
                )}
                {profilePicture.success && (
                  <div className="flex items-center bg-green-200 rounded-md text-green-950 px-4 py-2 text-sm">
                    <Check size={16} className="mr-2" />
                    <span className="font-semibold first-letter:uppercase">{profilePicture.success}</span>
                  </div>
                )}
                <UserAvatar border="border-8" width={120} />
                {profilePicture.isLoading ? (
                  <div className="font-bold animate-pulse antialiased bg-green-200 text-gray text-sm rounded-md px-4 py-2 flex items-center">
                    <ArrowBigUpDash size={16} className="mr-2" />
                    <span>{t('user.settings.general.uploading')}</span>
                  </div>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={profilePicture.openMediaPicker}
                      className="w-full"
                    >
                      <ImageIcon size={16} className="mr-2" />
                      {t('user.settings.general.change_avatar')}
                    </Button>
                  </>
                )}
                <div className="flex items-center text-xs text-muted-foreground">
                  <span className="flex items-center">
                    <Info size={13} className="mr-2" />
                    <p>{t('user.settings.general.recommended_size')}</p>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-row-reverse mt-0 mx-5 mb-5">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-black text-white hover:bg-black/90"
          >
            {isSubmitting ? t('user.settings.general.saving') : t('user.settings.general.save_changes')}
          </Button>
        </div>
      </div>
    </Form>
  );
};

function AccountGeneral() {
  const session = useLHSession() as any;
  const access_token = session?.data?.tokens?.access_token;
  const [isLoading, setIsLoading] = React.useState(false) as any
  const [error, setError] = React.useState() as any
  const [success, setSuccess] = React.useState('') as any
  const [userData, setUserData] = useState<any>(null);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const fetchUserData = async () => {
      if (session?.data?.user?.id) {
        try {
          const data = await getUser(session.data.user.id, access_token);
          setUserData(data);
        } catch (error) {
          console.error('Error fetching user data:', error);
          setError('Failed to load user data');
        }
      }
    };

    fetchUserData();
  }, [session?.data?.user?.id, access_token]);

  const handleMediaAssetSave = async (asset: MediaAsset) => {
    if (!access_token) return
    setIsLoading(true)
    setError('')
    try {
      await applyMediaAssetToUserAvatar(asset.asset_uuid, access_token)
      await session.update(true)
      setSuccess(t('user.settings.general.avatar_updated'))
    } catch (err: any) {
      setError(err?.message || 'Failed to update avatar')
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const handleEmailChange = async (newEmail: string) => {
    toast.success(t('user.settings.general.profile_updated'), { duration: 4000 })

    toast(() => (
      <div className="flex items-center gap-2">
        <span>{t('user.settings.general.relogin_message', { email: newEmail })}</span>
      </div>
    ), {
      duration: 4000,
      icon: '📧'
    })

    await new Promise(resolve => setTimeout(resolve, 4000))
    signOut({ redirect: true, callbackUrl: getUriWithoutOrg('/') })
  }

  if (!userData) {
    return (
      <div className="bg-card rounded-xl nice-shadow p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl nice-shadow">
      <Formik<FormValues>
        enableReinitialize
        initialValues={{
          username: userData.username,
          first_name: userData.first_name,
          last_name: userData.last_name,
          email: userData.email,
          bio: userData.bio || '',
        }}
        validationSchema={validationSchema}
        onSubmit={(values, { setSubmitting }) => {
          const isEmailChanged = values.email !== userData.email
          const loadingToast = toast.loading(t('user.settings.general.saving'))

          setTimeout(() => {
            setSubmitting(false)
            updateProfile(values, userData.id, access_token)
              .then(() => {
                toast.dismiss(loadingToast)
                if (isEmailChanged) {
                  handleEmailChange(values.email)
                } else {
                  toast.success(t('user.settings.general.profile_updated'))
                }
                getUser(userData.id, access_token).then(setUserData);
              })
              .catch(() => {
                toast.error('Failed to update profile', { id: loadingToast })
              })
          }, 400)
        }}
      >
        {(formikProps) => (
          <UserEditForm
            {...formikProps}
            profilePicture={{
              error,
              success,
              isLoading,
              openMediaPicker: () => setIsMediaPickerOpen(true)
            }}
          />
        )}
      </Formik>
      <MediaPickerDialog
        open={isMediaPickerOpen}
        onOpenChange={setIsMediaPickerOpen}
        title="Update your profile image"
        description="Upload an image, paste a media link, or choose from your library."
        owner={{ type: 'user', id: Number(session?.data?.user?.id || 0) }}
        mediaType="image"
        accessToken={access_token}
        onSave={handleMediaAssetSave}
      />
    </div>
  );
}

export default AccountGeneral
