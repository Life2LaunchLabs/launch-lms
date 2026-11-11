'use client'
import React from 'react'
import { Form, Formik } from 'formik'
import {
  updateOrganization,
  updateOrgFooterTextConfig,
  updateOrgPeopleWords,
} from '@services/settings/org'
import { peopleWordsOf } from '@/lib/people'
import { revalidateTags } from '@services/utils/ts/requests'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { toast } from 'react-hot-toast'
import { Input } from "@components/ui/input"
import { Textarea } from "@components/ui/textarea"
import { Button } from "@components/ui/button"
import { Label } from "@components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components/ui/select"
import { mutate } from 'swr'
import { getAPIUrl } from '@services/config/config'
import { useTranslation } from 'react-i18next'
import { ORG_LABELS } from '@/lib/orgLabels'
import { blockedSaveMessage, orgGeneralSchema } from './orgGeneralForm'


interface OrganizationValues {
  name: string
  description: string
  about: string
  label: string
  email: string
}

const OrgEditGeneral: React.FC = () => {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const org = useOrg() as any
  // Footer text state
  const [footerText, setFooterText] = React.useState<string>(org?.config?.config?.customization?.general?.footer_text || org?.config?.config?.general?.footer_text || '')
  // What the org calls the people it supports; the app says it wherever it would say "learners".
  const [peopleOne, setPeopleOne] = React.useState<string>(() => peopleWordsOf(org).one)
  const [peopleMany, setPeopleMany] = React.useState<string>(() => peopleWordsOf(org).many)

  const initialValues: OrganizationValues = {
    name: org?.name,
    description: org?.description || '',
    about: org?.about || '',
    label: org?.label || '__none__',
    email: org?.email || '',
  }

  const updateOrg = async (values: OrganizationValues) => {
    const loadingToast = toast.loading(t('dashboard.organization.settings.updating'))
    try {
      await updateOrganization(org.id, { ...values, label: values.label === '__none__' ? '' : values.label }, access_token)
      // Also save footer text
      await updateOrgFooterTextConfig(org.id, footerText, access_token)
      const words = peopleWordsOf(org)
      if (peopleOne.trim() && peopleMany.trim() && (peopleOne.trim() !== words.one || peopleMany.trim() !== words.many)) {
        await updateOrgPeopleWords(org.id, { one: peopleOne.trim(), many: peopleMany.trim() }, access_token)
      }
      await revalidateTags(['organizations'], org.slug)
      mutate(`${getAPIUrl()}orgs/slug/${org.slug}`)
      toast.success(t('dashboard.organization.settings.update_success'), { id: loadingToast })
    } catch (err) {
      toast.error(t('dashboard.organization.settings.update_error'), { id: loadingToast })
    }
  }

  return (
    <div className="sm:mx-10 mx-0 bg-white rounded-xl nice-shadow ">
      <Formik
        enableReinitialize
        initialValues={initialValues}
        validationSchema={orgGeneralSchema}
        onSubmit={(values, { setSubmitting }) => {
          setTimeout(() => {
            setSubmitting(false)
            updateOrg(values)
          }, 400)
        }}
      >
        {({ isSubmitting, values, handleChange, errors, touched, setFieldValue, submitCount }) => (
          <Form>
            <div className="flex flex-col gap-0">
              <div className="flex flex-col bg-gray-50 -space-y-1 px-5 py-3 mx-3 my-3 rounded-md">
                <h1 className="font-bold text-xl text-gray-800">
                  {t('dashboard.organization.settings.title')}
                </h1>
                <h2 className="text-gray-500 text-md">
                  {t('dashboard.organization.settings.subtitle')}
                </h2>
              </div>

              <div className="flex flex-col lg:flex-row lg:space-x-8 mt-0 mx-5 my-5">
                <div className="w-full space-y-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="name">
                        {t('dashboard.organization.settings.name')}
                        <span className="text-gray-500 text-sm ml-2">
                          ({60 - (values.name?.length || 0)} characters left)
                        </span>
                      </Label>
                      <Input
                        id="name"
                        name="name"
                        value={values.name}
                        onChange={handleChange}
                        placeholder={t('dashboard.organization.settings.name_placeholder')}
                        maxLength={60}
                      />
                      {touched.name && errors.name && (
                        <p className="text-red-500 text-sm mt-1">{errors.name}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="description">
                        {t('dashboard.organization.settings.short_description')}
                        <span className="text-gray-500 text-sm ml-2">
                          ({100 - (values.description?.length || 0)} characters left)
                        </span>
                      </Label>
                      <Input
                        id="description"
                        name="description"
                        value={values.description}
                        onChange={handleChange}
                        placeholder={t('dashboard.organization.settings.short_description_placeholder')}
                        maxLength={100}
                      />
                      {touched.description && errors.description && (
                        <p className="text-red-500 text-sm mt-1">{errors.description}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="label">{t('dashboard.organization.settings.label')}</Label>
                      <Select
                        value={values.label}
                        onValueChange={(value) => setFieldValue('label', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('dashboard.organization.settings.label_placeholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No label</SelectItem>
                          {ORG_LABELS.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {touched.label && errors.label && (
                        <p className="text-red-500 text-sm mt-1">{errors.label}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="email">Contact email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={values.email}
                        onChange={handleChange}
                        placeholder="contact@yourorganization.com"
                      />
                      {touched.email && errors.email && (
                        <p className="text-red-500 text-sm mt-1">{errors.email}</p>
                      )}
                      <p className="text-gray-500 text-sm mt-1">Used as the issuer contact for Open Badges credentials.</p>
                    </div>

                    <div>
                      <Label htmlFor="about">
                        {t('dashboard.organization.settings.about')}
                        <span className="text-gray-500 text-sm ml-2">
                          ({1500 - (values.about?.length || 0)} characters left)
                        </span>
                      </Label>
                      <Textarea
                        id="about"
                        name="about"
                        value={values.about}
                        onChange={handleChange}
                        placeholder={t('dashboard.organization.settings.about_placeholder')}
                        className="min-h-[250px]"
                        maxLength={1500}
                      />
                      {touched.about && errors.about && (
                        <p className="text-red-500 text-sm mt-1">{errors.about}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="footerText">
                        {t('dashboard.organization.settings.footer_text')}
                        <span className="text-gray-500 text-sm ml-2">
                          ({100 - (footerText?.length || 0)} characters left)
                        </span>
                      </Label>
                      <Input
                        id="footerText"
                        name="footerText"
                        value={footerText}
                        onChange={(e) => setFooterText(e.target.value)}
                        placeholder={t('dashboard.organization.settings.footer_text_placeholder')}
                        maxLength={100}
                      />
                      <p className="text-gray-500 text-sm mt-1">{t('dashboard.organization.settings.footer_text_desc')}</p>
                    </div>

                    <fieldset>
                      <legend className="text-sm font-medium">{t('dashboard.organization.settings.people_words', 'What you call the people you support')}</legend>
                      <div className="mt-2 grid grid-cols-2 gap-3">
                        <label className="text-xs text-gray-500">{t('dashboard.organization.settings.people_one', 'One')}
                          <Input value={peopleOne} onChange={(e) => setPeopleOne(e.target.value)} maxLength={30} placeholder="participant" className="mt-1" />
                        </label>
                        <label className="text-xs text-gray-500">{t('dashboard.organization.settings.people_many', 'Several')}
                          <Input value={peopleMany} onChange={(e) => setPeopleMany(e.target.value)} maxLength={30} placeholder="participants" className="mt-1" />
                        </label>
                      </div>
                      <p className="text-gray-500 text-sm mt-1">{t('dashboard.organization.settings.people_words_desc', 'Staff screens use these words, like students, trainees, campers or team members.')}</p>
                    </fieldset>

                  </div>
                </div>
              </div>
              <div className="flex flex-row-reverse items-center gap-3 mt-0 mx-5 mb-5">
                {submitCount > 0 && blockedSaveMessage(errors) && (
                  <p role="alert" className="text-red-500 text-sm">{blockedSaveMessage(errors)}</p>
                )}
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="bg-black text-white hover:bg-black/90"
                >
                  {isSubmitting ? t('dashboard.organization.settings.saving') : t('dashboard.organization.settings.save_changes')}
                </Button>
              </div>
            </div>
          </Form>
        )}
      </Formik>
    </div>
  )
}

export default OrgEditGeneral
