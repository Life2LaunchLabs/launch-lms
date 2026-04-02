'use client'
import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import BarLoader from 'react-spinners/BarLoader'
import {
  CheckCircle2,
  ChevronRight,
  AlertCircle,
  FileJson,
  ArrowLeft,
  BookOpen,
  Layers,
  ScrollText,
} from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { revalidateTags } from '@services/utils/ts/requests'
import { useRouter } from 'next/navigation'
import {
  analyzeTutorImportFiles,
  getTutorImportProgress,
  importTutorCourses,
  ImportAnalysisResponse,
  TutorImportProgressResponse,
} from '@services/courses/transfer'

interface CourseSelection {
  course_uuid: string
  name: string
  description: string | null
  chapters_count: number
  activities_count: number
  has_thumbnail: boolean
  media_count?: number
  include: boolean
}

interface TutorCourseImportProps {
  orgId: number
  orgslug: string
  closeModal: () => void
}

function TutorCourseImport({
  orgId,
  orgslug,
  closeModal,
}: TutorCourseImportProps) {
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const router = useRouter()

  const [step, setStep] = useState<'upload' | 'configure' | 'importing' | 'complete'>('upload')
  const [importFiles, setImportFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<ImportAnalysisResponse | null>(null)
  const [courseSelections, setCourseSelections] = useState<CourseSelection[]>([])
  const [namePrefix, setNamePrefix] = useState('')
  const [setPrivate, setSetPrivate] = useState(true)
  const [setUnpublished, setSetUnpublished] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState<TutorImportProgressResponse | null>(null)
  const [showLogs, setShowLogs] = useState(false)
  const [importResult, setImportResult] = useState<{
    successful: number
    failed: number
    courses: { name: string; uuid: string; success: boolean; error?: string }[]
  } | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const setFiles = (files: FileList | File[]) => {
    const nextFiles = Array.from(files).filter((file) => file.name.toLowerCase().endsWith('.json'))
    if (!nextFiles.length) {
      setUploadError('Tutor import expects one or more Tutor LMS `.json` export files.')
      return
    }
    setImportFiles(nextFiles)
    setUploadError(null)
  }

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!importFiles.length || !orgId) return

    setIsAnalyzing(true)
    setUploadError(null)

    try {
      const result = await analyzeTutorImportFiles(importFiles, orgId, access_token)
      setAnalysisResult(result)
      setCourseSelections(result.courses.map((course) => ({ ...course, include: true })))
      setStep('configure')
    } catch (error: any) {
      setUploadError(error.message || 'Failed to analyze Tutor LMS files')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleImport = async () => {
    if (!analysisResult || !orgId) return

    const selectedCourses = courseSelections.filter((course) => course.include)
    if (!selectedCourses.length) {
      setImportError('Select at least one Tutor course to import.')
      return
    }

    setIsImporting(true)
    setImportError(null)
    setStep('importing')
    setImportProgress({
      status: 'running',
      total_media: selectedCourses.reduce((sum, course) => sum + (course.media_count || 0), 0),
      completed_media: 0,
      current_media_name: null,
      current_course_name: null,
      message: 'Preparing Tutor LMS import',
      logs: [],
    })

    try {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
      progressIntervalRef.current = setInterval(async () => {
        try {
          const progress = await getTutorImportProgress(
            analysisResult.temp_id,
            orgId,
            access_token
          )
          setImportProgress(progress)
        } catch {
          // Ignore polling failures while the import request is still in flight.
        }
      }, 800)

      const result = await importTutorCourses(
        analysisResult.temp_id,
        orgId,
        {
          course_uuids: selectedCourses.map((course) => course.course_uuid),
          name_prefix: namePrefix || null,
          set_private: setPrivate,
          set_unpublished: setUnpublished,
        },
        access_token
      )

      try {
        const progress = await getTutorImportProgress(
          analysisResult.temp_id,
          orgId,
          access_token
        )
        setImportProgress(progress)
      } catch {
        // Ignore final progress refresh failure after import completes.
      }

      setImportResult({
        successful: result.successful,
        failed: result.failed,
        courses: result.courses.map((course) => ({
          name: course.name || selectedCourses.find((selected) => selected.course_uuid === course.original_uuid)?.name || 'Unknown',
          uuid: course.new_uuid,
          success: course.success,
          error: course.error || undefined,
        })),
      })

      setStep('complete')
      await revalidateTags(['courses'], orgslug)
    } catch (error: any) {
      setImportError(error.message || 'Failed to import Tutor LMS courses')
      setStep('configure')
    } finally {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
      setIsImporting(false)
    }
  }

  const resetToUpload = () => {
    setStep('upload')
    setImportFiles([])
    setAnalysisResult(null)
    setCourseSelections([])
    setNamePrefix('')
    setUploadError(null)
    setImportError(null)
    setImportProgress(null)
    setImportResult(null)
    setShowLogs(false)
  }

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [])

  const selectedCount = courseSelections.filter((course) => course.include).length
  const progressLogs = importProgress?.logs || []

  const renderLogs = () => (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
          <ScrollText size={16} />
          Import log
        </div>
        <div className="text-xs text-gray-500">{progressLogs.length} entries</div>
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto p-3">
        {progressLogs.length === 0 ? (
          <div className="text-sm text-gray-500">No log entries yet.</div>
        ) : (
          progressLogs.map((entry, index) => (
            <div
              key={`${entry.timestamp}-${index}`}
              className={`rounded-md border px-3 py-2 text-sm ${
                entry.level === 'error'
                  ? 'border-red-200 bg-red-50'
                  : entry.level === 'warning'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-gray-800">{entry.message}</div>
                <div className="shrink-0 text-xs text-gray-500">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </div>
              </div>
              {(entry.course_name || entry.activity_name) && (
                <div className="mt-1 text-xs text-gray-600">
                  {entry.course_name && <span>Course: {entry.course_name}</span>}
                  {entry.course_name && entry.activity_name && <span> · </span>}
                  {entry.activity_name && <span>Activity: {entry.activity_name}</span>}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )

  return (
    <div className="min-w-[500px]">
      {step === 'upload' && (
        <form onSubmit={handleAnalyze} className="space-y-5">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              setIsDragging(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              setFiles(e.dataTransfer.files)
            }}
            className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              isDragging ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-gray-50'
            }`}
          >
            <Input
              id="tutor-files"
              type="file"
              multiple
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => e.target.files && setFiles(e.target.files)}
            />
            <label htmlFor="tutor-files" className="cursor-pointer">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <FileJson className="text-emerald-700" size={28} />
              </div>
              <p className="font-medium text-gray-900">Choose Tutor LMS course JSON files</p>
              <p className="mt-1 text-sm text-gray-500">Select one or more exported Tutor course `.json` files from your folder.</p>
            </label>
          </div>

          {importFiles.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-800">
                <CheckCircle2 size={16} className="text-green-600" />
                {importFiles.length} file{importFiles.length === 1 ? '' : 's'} selected
              </div>
              <div className="max-h-40 space-y-1 overflow-y-auto text-sm text-gray-500">
                {importFiles.map((file) => (
                  <div key={`${file.name}-${file.size}`}>{file.name}</div>
                ))}
              </div>
            </div>
          )}

          {uploadError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
            This importer preserves Tutor lesson and quiz content as LearnHouse dynamic pages. It does not convert Tutor exports into SCORM packages.
          </div>

          <Button type="submit" disabled={!importFiles.length || isAnalyzing} className="w-full">
            {isAnalyzing ? 'Analyzing Tutor files...' : 'Analyze Tutor Courses'}
          </Button>
        </form>
      )}

      {step === 'configure' && analysisResult && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <button onClick={resetToUpload} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
              <ArrowLeft size={16} />
              Choose different files
            </button>
            <div className="text-sm text-gray-500">{selectedCount} of {courseSelections.length} selected</div>
          </div>

          <div className="space-y-3">
            {courseSelections.map((course) => (
              <label key={course.course_uuid} className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-4">
                <input
                  type="checkbox"
                  checked={course.include}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setCourseSelections((prev) =>
                      prev.map((item) => item.course_uuid === course.course_uuid ? { ...item, include: checked } : item)
                    )
                  }}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-900">{course.name}</div>
                  {course.description && <div className="mt-1 text-sm text-gray-500">{course.description}</div>}
                  <div className="mt-2 flex gap-4 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1"><BookOpen size={12} /> {course.chapters_count} chapters</span>
                    <span className="inline-flex items-center gap-1"><Layers size={12} /> {course.activities_count} activities</span>
                    {!!course.media_count && <span>{course.media_count} media downloads</span>}
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tutor-name-prefix">Course name prefix</Label>
              <Input
                id="tutor-name-prefix"
                value={namePrefix}
                onChange={(e) => setNamePrefix(e.target.value)}
                placeholder="Imported"
              />
            </div>
            <div className="space-y-3 rounded-lg border border-gray-200 p-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={setPrivate} onChange={(e) => setSetPrivate(e.target.checked)} />
                Import courses as private
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={setUnpublished} onChange={(e) => setSetUnpublished(e.target.checked)} />
                Keep imported course content unpublished
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Supported Tutor-hosted videos, PDFs, and thumbnails will be downloaded into LearnHouse when possible. Unsupported or external media stays as a link inside the imported lesson page.
          </div>

          {importError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          <Button onClick={handleImport} className="w-full">
            Import Selected Tutor Courses
            <ChevronRight size={16} className="ml-2" />
          </Button>
        </div>
      )}

      {step === 'importing' && (
        <div className="space-y-4 py-4">
          <div className="space-y-4 text-center">
            <BarLoader width="100%" color="#111827" />
            <p className="text-sm text-gray-500">
              {importProgress?.message || 'Downloading media and creating LearnHouse courses from Tutor LMS content...'}
            </p>
            <div className="space-y-1 text-sm text-gray-600">
              <div>
                Media progress: {importProgress?.completed_media ?? 0} / {importProgress?.total_media ?? 0}
              </div>
              {importProgress?.current_course_name && (
                <div>Course: {importProgress.current_course_name}</div>
              )}
              {importProgress?.current_media_name && (
                <div className="truncate">Current media: {importProgress.current_media_name}</div>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowLogs((prev) => !prev)}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              {showLogs ? 'Hide import log' : 'Show import log'}
            </button>
          </div>
          {showLogs && renderLogs()}
        </div>
      )}

      {step === 'complete' && importResult && (
        <div className="space-y-5">
          <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-center">
            <CheckCircle2 className="mx-auto mb-3 text-green-600" size={36} />
            <div className="text-lg font-semibold text-gray-900">Tutor import finished</div>
            <div className="mt-1 text-sm text-gray-600">
              {importResult.successful} successful, {importResult.failed} failed
            </div>
          </div>

          <div className="max-h-56 space-y-2 overflow-y-auto">
            {importResult.courses.map((course, index) => (
              <div key={`${course.uuid}-${index}`} className={`rounded-lg border p-3 text-sm ${course.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                <div className="font-medium text-gray-900">{course.name}</div>
                {!course.success && course.error && <div className="mt-1 text-red-700">{course.error}</div>}
              </div>
            ))}
          </div>

          {renderLogs()}

          <Button
            onClick={() => {
              closeModal()
              router.refresh()
            }}
            className="w-full"
          >
            Done
          </Button>
        </div>
      )}
    </div>
  )
}

export default TutorCourseImport
