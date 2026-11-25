'use client'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { updatePassword } from '@services/settings/password'
import { Formik, Form } from 'formik'
import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { PasswordInput } from "@components/ui/password-input"
import { Button } from "@components/ui/button"
import { Label } from "@components/ui/label"
import { toast } from 'react-hot-toast'
import { signOut } from '@components/Contexts/AuthContext'
import { getUriWithoutOrg } from '@services/config/config'
import * as Yup from 'yup'
import { useTranslation } from 'react-i18next'

const validationSchema = Yup.object().shape({
  old_password: Yup.string().required('validation.required'),
  new_password: Yup.string()
    .required('validation.required')
    .min(8, 'validation.password_min_length'),
})

/** Change password (Settings › Sign-in methods, PF-3): the current one, a new one, then sign in again. */
export function ChangePasswordForm({ onCancel }: { onCancel?: () => void }) {
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token;
  const { t } = useTranslation();

  const updatePasswordUI = async (values: any) => {
    const loadingToast = toast.loading(t('user.settings.password.updating'))
    try {
      let user_id = session.data.user.id
      const response = await updatePassword(user_id, values, access_token)

      if (response.success) {
        toast.dismiss(loadingToast)

        toast.success(t('user.settings.password.password_updated'), { duration: 4000 })
        toast(() => (
          <div className="flex items-center gap-2">
            <span>{t('user.settings.password.relogin_message')}</span>
          </div>
        ), {
          duration: 4000,
          icon: '🔑'
        })

        await new Promise(resolve => setTimeout(resolve, 4000))
        signOut({ redirect: true, callbackUrl: getUriWithoutOrg('/') })
      } else {
        toast.error(response.data.detail || t('settings.password_failed'), { id: loadingToast })
      }
    } catch (error: any) {
      const errorMessage = error.data?.detail || t('settings.password_failed_retry')
      toast.error(errorMessage, { id: loadingToast })
      console.error('Password update error:', error)
    }
  }

  return (
    <Formik
      initialValues={{ old_password: '', new_password: '' }}
      validationSchema={validationSchema}
      onSubmit={(values, { setSubmitting }) => {
        setTimeout(() => {
          setSubmitting(false)
          updatePasswordUI(values)
        }, 400)
      }}
    >
      {({ isSubmitting, handleChange, errors, touched }) => (
        <Form className="w-full max-w-2xl space-y-5">
          <div>
            <Label htmlFor="old_password">{t('user.settings.password.current_password')}</Label>
            <PasswordInput autoComplete="current-password" id="old_password" name="old_password" onChange={handleChange} className="mt-1" />
            {touched.old_password && errors.old_password && (
              <p className="text-red-500 text-sm mt-1">{t(errors.old_password as string)}</p>
            )}
          </div>

          <div>
            <Label htmlFor="new_password">{t('user.settings.password.new_password')}</Label>
            <PasswordInput autoComplete="new-password" id="new_password" name="new_password" onChange={handleChange} className="mt-1" />
            {touched.new_password && errors.new_password && (
              <p className="text-red-500 text-sm mt-1">{t(errors.new_password as string)}</p>
            )}
          </div>

          <div className="flex items-center space-x-2 text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15 p-3 rounded-md">
            <AlertTriangle size={16} />
            <span className="text-sm">{t('user.settings.password.logout_warning')}</span>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            {onCancel ? <Button type="button" variant="ghost" onClick={onCancel}>{t('settings.cancel')}</Button> : null}
            <Button type="submit" disabled={isSubmitting} variant="brand">
              {isSubmitting ? t('user.settings.password.updating') : t('user.settings.password.update_password')}
            </Button>
          </div>
        </Form>
      )}
    </Formik>
  )
}
