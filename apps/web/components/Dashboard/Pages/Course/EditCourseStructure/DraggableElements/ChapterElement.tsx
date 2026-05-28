import ConfirmationModal from '@components/Objects/StyledElements/ConfirmationModal/ConfirmationModal'
import {
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Save,
  Trash2,
} from 'lucide-react'
import React from 'react'
import { Draggable, Droppable } from '@hello-pangea/dnd'
import ActivityElement from './ActivityElement'
import NewActivityButton from '../Buttons/NewActivityButton'
import { deleteChapter, updateChapter } from '@services/courses/chapters'
import { revalidateTags } from '@services/utils/ts/requests'
import { useRouter } from 'next/navigation'
import { getAPIUrl } from '@services/config/config'
import { mutate } from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useCourse } from '@components/Contexts/CourseContext'
import { useTranslation } from 'react-i18next'
import ChapterIconPicker from '@components/Objects/Modals/Chapters/ChapterIconPicker'
import { defaultChapterIconName, getChannelIcon } from '@components/Resources/ResourceChannelStyle'

type ChapterElementProps = {
  chapter: any
  chapterIndex: number
  orgslug: string
  course_uuid: string
}

interface ModifiedChapterInterface {
  chapterId: string
  chapterName: string
  chapterDescription: string
}

function ChapterElement(props: ChapterElementProps) {
  const { t } = useTranslation()
  const activities = props.chapter.activities || []
  const session = useLHSession() as any;
  const access_token = session?.data?.tokens?.access_token;
  const [modifiedChapter, setModifiedChapter] = React.useState<
    ModifiedChapterInterface | undefined
  >(undefined)
  const [selectedChapter, setSelectedChapter] = React.useState<
    string | undefined
  >(undefined)
  const [chapterIconModalOpen, setChapterIconModalOpen] = React.useState(false)
  const course = useCourse() as any;
  const withUnpublishedActivities = course ? course.withUnpublishedActivities : false
  const ChapterIcon = getChannelIcon(props.chapter.icon || defaultChapterIconName)

  const router = useRouter()

  const deleteChapterUI = async () => {
    await deleteChapter(props.chapter.id, access_token)
    mutate(`${getAPIUrl()}courses/${props.course_uuid}/meta?with_unpublished_activities=${withUnpublishedActivities}`)
    await revalidateTags(['courses'], props.orgslug)
    router.refresh()
  }

  async function updateChapterDetails(chapterId: string) {
    if (modifiedChapter?.chapterId === chapterId) {
      let modifiedChapterCopy = {
        name: modifiedChapter.chapterName,
        description: modifiedChapter.chapterDescription,
      }
      await updateChapter(chapterId, modifiedChapterCopy, access_token)
      mutate(`${getAPIUrl()}courses/${props.course_uuid}/meta?with_unpublished_activities=${withUnpublishedActivities}`)
      await revalidateTags(['courses'], props.orgslug)
      router.refresh()
    }
    setSelectedChapter(undefined)
  }

  return (
    <Draggable
      key={props.chapter.chapter_uuid}
      draggableId={props.chapter.chapter_uuid}
      index={props.chapterIndex}
    >
      {(provided, snapshot) => (
        <div
          className={`mx-2 sm:mx-4 md:mx-6 lg:mx-10 bg-white rounded-xl nice-shadow px-3 sm:px-4 md:px-6 pt-4 sm:pt-6 ${
            snapshot.isDragging ? 'shadow-xl ring-2 ring-blue-500/20 rotate-1' : ''
          }`}
          key={props.chapter.chapter_uuid}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          ref={provided.innerRef}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 pb-3">
            <div className="flex grow items-start space-x-2 mb-2 sm:mb-0">
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  setChapterIconModalOpen(true)
                }}
                className="rounded-md bg-neutral-100 p-2 text-neutral-600 transition-colors hover:bg-neutral-200 hover:text-neutral-900"
                aria-label="Edit chapter icon"
              >
                <ChapterIcon strokeWidth={2.5} size={16} />
              </button>
              <div className="flex min-w-0 items-start space-x-2">
                {selectedChapter === props.chapter.id ? (
                  <div className="chapter-modification-zone flex w-full max-w-xl items-start space-x-2 rounded-lg bg-neutral-100 px-2 py-2 sm:px-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <input
                        type="text"
                        className="w-full bg-transparent text-sm text-neutral-700 outline-hidden"
                        placeholder={t('dashboard.courses.structure.chapter_element.chapter_name_placeholder')}
                        value={
                          modifiedChapter
                            ? modifiedChapter.chapterName
                            : props.chapter.name
                        }
                        onChange={(e) =>
                          setModifiedChapter({
                            chapterId: props.chapter.id,
                            chapterName: e.target.value,
                            chapterDescription: modifiedChapter?.chapterDescription ?? props.chapter.description ?? '',
                          })
                        }
                      />
                      <textarea
                        className="min-h-16 w-full resize-none bg-transparent text-xs leading-5 text-neutral-600 outline-hidden placeholder:text-neutral-400"
                        placeholder="Optional chapter description"
                        value={
                          modifiedChapter
                            ? modifiedChapter.chapterDescription
                            : props.chapter.description || ''
                        }
                        onChange={(e) =>
                          setModifiedChapter({
                            chapterId: props.chapter.id,
                            chapterName: modifiedChapter?.chapterName ?? props.chapter.name,
                            chapterDescription: e.target.value,
                          })
                        }
                      />
                    </div>
                    <button
                      onClick={() => updateChapterDetails(props.chapter.id)}
                      className="mt-0.5 bg-transparent text-neutral-700 hover:cursor-pointer hover:text-neutral-900"
                      aria-label="Save chapter details"
                    >
                      <Save size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <p className="text-neutral-700 first-letter:uppercase text-sm sm:text-base">
                      {props.chapter.name}
                    </p>
                    {props.chapter.description ? (
                      <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-500">
                        {props.chapter.description}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-neutral-400">
                        Add chapter description
                      </p>
                    )}
                  </div>
                )}
                <Pencil
                  size={15}
                  onClick={() => {
                    setModifiedChapter({
                      chapterId: props.chapter.id,
                      chapterName: props.chapter.name,
                      chapterDescription: props.chapter.description || '',
                    })
                    setSelectedChapter(props.chapter.id)
                  }}
                  className="mt-0.5 shrink-0 text-neutral-600 hover:cursor-pointer"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <MoreVertical size={15} className="text-gray-300" />
              <ConfirmationModal
                confirmationButtonText={t('dashboard.courses.structure.modals.delete_chapter.button')}
                confirmationMessage={t('dashboard.courses.structure.modals.delete_chapter.message')}
                dialogTitle={t('dashboard.courses.structure.modals.delete_chapter.title', { name: props.chapter.name })}
                dialogTrigger={
                  <button
                    className="hover:cursor-pointer p-1 px-2 sm:px-3 bg-red-600 rounded-md shadow-sm flex items-center text-rose-100 text-sm"
                    rel="noopener noreferrer"
                  >
                    <Trash2 size={15} className="text-rose-200" />
                  </button>
                }
                functionToExecute={() => deleteChapterUI()}
                status="warning"
              />
            </div>
          </div>
          <Droppable
            key={props.chapter.chapter_uuid}
            droppableId={props.chapter.chapter_uuid}
            type="activity"
          >
            {(provided, snapshot) => (
              <div 
                {...provided.droppableProps} 
                ref={provided.innerRef}
                className={`min-h-[60px] rounded-lg transition-colors duration-75 ${
                  snapshot.isDraggingOver ? 'bg-blue-50/50' : ''
                }`}
              >
                {activities.map((activity: any, index: any) => (
                  <ActivityElement
                    key={activity.activity_uuid}
                    orgslug={props.orgslug}
                    course_uuid={props.course_uuid}
                    activityIndex={index}
                    activity={activity}
                  />
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
          <NewActivityButton
            orgslug={props.orgslug}
            chapterId={props.chapter.id}
          />
          <div className="h-6">
            <div className="flex items-center">
              <MoreHorizontal size={19} className="text-gray-300 mx-auto" />
            </div>
          </div>
          <ChapterIconPicker
            open={chapterIconModalOpen}
            onClose={() => setChapterIconModalOpen(false)}
            chapter={props.chapter}
            accessToken={access_token}
            courseUuid={props.course_uuid}
            orgslug={props.orgslug}
            withUnpublishedActivities={withUnpublishedActivities}
          />
        </div>
      )}
    </Draggable>
  )
}

export default ChapterElement
