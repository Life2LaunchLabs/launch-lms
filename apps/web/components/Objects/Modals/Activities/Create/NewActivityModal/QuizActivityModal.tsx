import FormLayout, {
  ButtonBlack,
  Flex,
  FormField,
  FormLabel,
  FormMessage,
  Input,
} from '@components/Objects/StyledElements/Form/Form'
import React, { useState } from 'react'
import * as Form from '@radix-ui/react-form'
import BarLoader from 'react-spinners/BarLoader'

function QuizActivityModal({ submitActivity, chapterId, course }: any) {
  const [activityName, setActivityName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    setIsSubmitting(true)
    await submitActivity({
      name: activityName,
      chapter_id: chapterId,
      activity_type: 'TYPE_QUIZ',
      activity_sub_type: 'SUBTYPE_QUIZ_STANDARD',
      published_version: 1,
      version: 1,
      course_id: course.id,
    })
    setIsSubmitting(false)
  }

  return (
    <FormLayout onSubmit={handleSubmit}>
      <FormField name="quiz-activity-name">
        <Flex className="items-baseline justify-between">
          <FormLabel>Quiz name</FormLabel>
          <FormMessage match="valueMissing">
            Please provide a name for your quiz
          </FormMessage>
        </Flex>
        <Form.Control asChild>
          <Input
            onChange={e => setActivityName(e.target.value)}
            type="text"
            required
            placeholder="e.g. What kind of learner are you?"
          />
        </Form.Control>
      </FormField>

      <Flex className="mt-6 justify-end">
        <Form.Submit asChild>
          <ButtonBlack type="submit" className="mt-2.5">
            {isSubmitting ? (
              <BarLoader cssOverride={{ borderRadius: 60 }} width={60} color="#ffffff" />
            ) : (
              'Create quiz'
            )}
          </ButtonBlack>
        </Form.Submit>
      </Flex>
    </FormLayout>
  )
}

export default QuizActivityModal
