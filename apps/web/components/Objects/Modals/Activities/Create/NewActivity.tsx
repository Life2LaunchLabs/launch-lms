import React, { useState } from 'react'
import DynamicPageActivityImage from 'public/activities_types/dynamic-page-activity.png'
import VideoPageActivityImage from 'public//activities_types/video-page-activity.png'
import DocumentPdfPageActivityImage from 'public//activities_types/documentpdf-page-activity.png'
import AssignmentActivityImage from 'public//activities_types/assignment-page-activity.png'

import DynamicCanvaModal from './NewActivityModal/DynamicActivityModal'
import VideoModal from './NewActivityModal/VideoActivityModal'
import Image from 'next/image'
import DocumentPdfModal from './NewActivityModal/DocumentActivityModal'
import Assignment from './NewActivityModal/AssignmentActivityModal'
import QuizModal from './NewActivityModal/QuizActivityModal'
import { useTranslation } from 'react-i18next'

function NewActivityModal({
  closeModal,
  submitActivity,
  submitFileActivity,
  submitExternalVideo,
  chapterId,
  course,
}: any) {
  const { t } = useTranslation()
  const [selectedView, setSelectedView] = useState('home')

  return (
    <>
      {selectedView === 'home' && (
        <div className="grid grid-cols-4 gap-2 mt-2.5 w-full" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <ActivityOption
            onClick={() => {
              setSelectedView('dynamic')
            }}
          >
            <div className="h-20 rounded-lg m-0.5 flex flex-col items-center justify-end text-center bg-white hover:cursor-pointer">
              <Image unoptimized quality={100} alt="Dynamic Page" src={DynamicPageActivityImage}></Image>
            </div>
            <div className="flex text-sm h-5 font-medium text-gray-500 items-center justify-center text-center">
              {t('dashboard.courses.structure.activity.types.dynamic_page')}
            </div>
          </ActivityOption>
          <ActivityOption
            onClick={() => {
              setSelectedView('video')
            }}
          >
            <div className="h-20 rounded-lg m-0.5 flex flex-col items-center justify-end text-center bg-white hover:cursor-pointer">
              <Image unoptimized quality={100} alt="Video Page" src={VideoPageActivityImage}></Image>
            </div>
            <div className="flex text-sm h-5 font-medium text-gray-500 items-center justify-center text-center">
              {t('dashboard.courses.structure.activity.types.video')}
            </div>
          </ActivityOption>
          <ActivityOption
            onClick={() => {
              setSelectedView('documentpdf')
            }}
          >
            <div className="h-20 rounded-lg m-0.5 flex flex-col items-center justify-end text-center bg-white hover:cursor-pointer">
              <Image unoptimized quality={100} alt="Document PDF Page" src={DocumentPdfPageActivityImage}></Image>
            </div>
            <div className="flex text-sm h-5 font-medium text-gray-500 items-center justify-center text-center">
              {t('dashboard.courses.structure.activity.types.document')}
            </div>
          </ActivityOption>
          <ActivityOption
            onClick={() => {
              setSelectedView('assignments')
            }}
          >
            <div className="h-20 rounded-lg m-0.5 flex flex-col items-center justify-end text-center bg-white hover:cursor-pointer">
              <Image unoptimized quality={100} alt="Assignment Page" src={AssignmentActivityImage}></Image>
            </div>
            <div className="flex text-sm h-5 font-medium text-gray-500 items-center justify-center text-center">
              {t('dashboard.courses.structure.activity.types.assignments')}
            </div>
          </ActivityOption>
          <ActivityOption
            onClick={() => {
              setSelectedView('quiz')
            }}
          >
            <div className="h-20 rounded-lg m-0.5 flex flex-col items-center justify-end text-center bg-white hover:cursor-pointer">
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-600">
                    <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                  </svg>
                </div>
              </div>
            </div>
            <div className="flex text-sm h-5 font-medium text-gray-500 items-center justify-center text-center">
              Quiz
            </div>
          </ActivityOption>
        </div>
      )}

      {selectedView === 'dynamic' && (
        <DynamicCanvaModal
          submitActivity={submitActivity}
          chapterId={chapterId}
          course={course}
        />
      )}

      {selectedView === 'video' && (
        <VideoModal
          submitFileActivity={submitFileActivity}
          submitExternalVideo={submitExternalVideo}
          chapterId={chapterId}
          course={course}
        />
      )}

      {selectedView === 'documentpdf' && (
        <DocumentPdfModal
          submitFileActivity={submitFileActivity}
          chapterId={chapterId}
          course={course}
        />
      )}

      {selectedView === 'assignments' && (
        <Assignment
          submitActivity={submitActivity}
          chapterId={chapterId}
          course={course}
          closeModal={closeModal}
        />)
      }

      {selectedView === 'quiz' && (
        <QuizModal
          submitActivity={submitActivity}
          chapterId={chapterId}
          course={course}
        />)
      }
    </>
  )
}

const ActivityOption = ({ onClick, children }: any) => (
  <div
    onClick={onClick}
    className="w-full text-center rounded-xl bg-gray-100 border-4 border-gray-100 mx-auto hover:bg-gray-200 hover:border-gray-200 transition duration-200 ease-in-out cursor-pointer"
  >
    {children}
  </div>
)

export default NewActivityModal
