'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Formik, Form } from 'formik'
import * as Yup from 'yup'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCollection, useCollectionDispatch } from '@components/Contexts/CollectionContext'
import { updateCollection } from '@services/courses/collections'
import { mutate } from 'swr'
import { getAPIUrl } from '@services/config/config'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import { Switch } from '@components/ui/switch'
import { Button } from '@components/ui/button'

const CollectionEditGeneral: React.FC = () => {
  const router = useRouter()
  const session = useLHSession() as any
  const org = useOrg() as any
  const collectionState = useCollection()
  const dispatch = useCollectionDispatch()
  const collection = collectionState?.collection
  const accessToken = session?.data?.tokens?.access_token

  const [isSubmitting, setIsSubmitting] = useState(false)

  const validationSchema = Yup.object({
    name: Yup.string()
      .required('Collection name is required')
      .min(3, 'Name must be at least 3 characters')
      .max(100, 'Name must be at most 100 characters'),
    description: Yup.string().max(500, 'Description must be at most 500 characters'),
    public: Yup.boolean(),
  })

  if (!collection) return null

  const initialValues = {
    name: collection.name,
    description: collection.description || '',
    public: collection.public,
  }

  const handleSubmit = async (values: typeof initialValues) => {
    setIsSubmitting(true)
    const loadingToast = toast.loading('Updating collection…')

    try {
      const result = await updateCollection(
        collection.collection_uuid,
        {
          name: values.name,
          description: values.description || '',
          public: values.public,
        },
        accessToken
      )

      if (result) {
        mutate(`${getAPIUrl()}collections/${collection.collection_uuid}`)
        if (dispatch) {
          dispatch({ type: 'setCollection', payload: { ...collection, ...values } })
        }
        toast.success('Collection updated', { id: loadingToast })
        router.refresh()
      }
    } catch (error) {
      toast.error('Failed to update collection', { id: loadingToast })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="sm:mx-10 mx-0 bg-white rounded-xl nice-shadow">
        <Formik
          enableReinitialize
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          {({ values, handleChange, errors, touched, setFieldValue, isValid, dirty }) => (
            <Form>
              <div className="flex flex-col gap-0">
                <div className="flex flex-col bg-gray-50 -space-y-1 px-5 py-3 mx-3 my-3 rounded-md">
                  <h1 className="font-bold text-xl text-gray-800">General Settings</h1>
                  <h2 className="text-gray-500 text-md">Update the name, description, and visibility of this collection.</h2>
                </div>

                <div className="flex flex-col lg:flex-row lg:space-x-8 mt-0 mx-5 my-5">
                  <div className="w-full space-y-6">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="name">
                          Name *
                          <span className="text-gray-500 text-sm ml-2">
                            ({100 - (values.name?.length || 0)} characters left)
                          </span>
                        </Label>
                        <Input
                          id="name"
                          name="name"
                          value={values.name}
                          onChange={handleChange}
                          placeholder="Collection name"
                          maxLength={100}
                        />
                        {touched.name && errors.name && (
                          <p className="text-red-500 text-sm mt-1">{errors.name}</p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="description">
                          Description
                          <span className="text-gray-500 text-sm ml-2">
                            ({500 - (values.description?.length || 0)} characters left)
                          </span>
                        </Label>
                        <Textarea
                          id="description"
                          name="description"
                          value={values.description}
                          onChange={handleChange}
                          placeholder="Describe this collection…"
                          className="min-h-[120px]"
                          maxLength={500}
                        />
                        {touched.description && errors.description && (
                          <p className="text-red-500 text-sm mt-1">{errors.description}</p>
                        )}
                      </div>

                      <div className="flex items-center justify-between space-x-2 mt-4 bg-gray-50/50 p-4 rounded-lg nice-shadow">
                        <div className="space-y-0.5">
                          <Label className="text-base">Public</Label>
                          <p className="text-sm text-gray-500">
                            Public collections are visible to all users. Private collections are only accessible to users with explicit access.
                          </p>
                        </div>
                        <Switch
                          name="public"
                          checked={values.public}
                          onCheckedChange={(checked) => setFieldValue('public', checked)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-row-reverse mt-0 mx-5 mb-5">
                  <Button
                    type="submit"
                    disabled={isSubmitting || !isValid || !dirty}
                    className="bg-black text-white hover:bg-black/90"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin mr-2" />
                        Saving…
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                </div>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  )
}

export default CollectionEditGeneral
