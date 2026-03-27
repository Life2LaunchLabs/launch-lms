'use client'
import { NodeViewWrapper } from '@tiptap/react'
import React, { useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Upload, Loader2, X, Info, Trash2 } from 'lucide-react'
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { uploadNewImageFile } from '@services/blocks/Image/images'
import { getActivityBlockMediaDirectory } from '@services/media/media'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCourse } from '@components/Contexts/CourseContext'

function getGradient(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h1 = Math.abs(hash) % 360
  const h2 = (h1 + 60 + (Math.abs(hash >> 8) % 60)) % 360
  return `linear-gradient(135deg, hsl(${h1},55%,50%), hsl(${h2},65%,40%))`
}

function QuizInfoBlockComponent(props: any) {
  const editorState = useEditorProvider() as any
  const isEditable = editorState.isEditable
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const org = useOrg() as any
  const course = useCourse() as any
  const inputRef = useRef<HTMLInputElement>(null)

  const attrs = props.node.attrs
  const [title, setTitle] = React.useState<string>(attrs.title || '')
  const [body, setBody] = React.useState<string>(attrs.body || '')
  const [imageBlockObject, setImageBlockObject] = React.useState<any>(attrs.image_block_object || null)
  const [isLoading, setIsLoading] = React.useState(false)
  const gradientSeed = attrs.gradient_seed || attrs.slide_uuid || uuidv4()

  const save = (newTitle: string, newBody: string, newBlockObj: any) => {
    props.updateAttributes({
      slide_uuid: attrs.slide_uuid || uuidv4(),
      gradient_seed: gradientSeed,
      title: newTitle,
      body: newBody,
      image_block_object: newBlockObj,
      image_file_id: newBlockObj?.content?.file_id
        ? `${newBlockObj.content.file_id}.${newBlockObj.content.file_format}`
        : null,
    })
  }

  const handleUpload = async (file: File) => {
    setIsLoading(true)
    try {
      const blockObj = await uploadNewImageFile(
        file,
        props.extension.options.activity?.activity_uuid || '',
        access_token
      )
      setImageBlockObject(blockObj)
      save(title, body, blockObj)
    } finally {
      setIsLoading(false)
    }
  }

  const getImageUrl = (blockObj: any) => {
    if (!blockObj) return null
    const fileId = `${blockObj.content.file_id}.${blockObj.content.file_format}`
    return getActivityBlockMediaDirectory(
      org?.org_uuid,
      course?.courseStructure?.course_uuid,
      blockObj.content.activity_uuid || props.extension.options.activity?.activity_uuid || '',
      blockObj.block_uuid,
      fileId,
      'imageBlock'
    )
  }

  const imageUrl = getImageUrl(imageBlockObject)

  if (!isEditable) return null

  return (
    <NodeViewWrapper className="quiz-info-block w-full">
      <div className="bg-neutral-50 rounded-xl px-5 py-4 nice-shadow">
        <div className="flex items-center gap-2 mb-4">
          <Info size={14} className="text-blue-500" />
          <span className="uppercase tracking-widest text-xs font-bold text-blue-500">Info Slide</span>
          <button
            type="button"
            onClick={() => props.deleteNode()}
            className="ml-auto p-1 rounded hover:bg-red-50 outline-none transition-colors"
            title="Delete slide"
          >
            <Trash2 size={13} className="text-red-400" />
          </button>
        </div>

        {/* Image / gradient preview */}
        <div
          className="w-full h-28 rounded-xl mb-4 overflow-hidden relative flex items-end"
          style={{ background: imageUrl ? undefined : getGradient(gradientSeed) }}
        >
          {imageUrl && (
            <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <div className="relative z-10 p-3 w-full">
            <p className="text-white text-sm font-bold drop-shadow truncate">{title || 'Slide title…'}</p>
          </div>
          {imageUrl && (
            <button
              type="button"
              onClick={() => { setImageBlockObject(null); save(title, body, null) }}
              className="absolute top-2 right-2 bg-black/50 rounded-full p-1 outline-none hover:bg-black/70 transition-colors"
            >
              <X size={12} className="text-white" />
            </button>
          )}
        </div>

        {/* Image upload */}
        {!imageUrl && (
          <div
            onClick={() => !isLoading && inputRef.current?.click()}
            className="w-full h-10 border-2 border-dashed border-neutral-200 rounded-lg flex items-center justify-center gap-2 cursor-pointer hover:border-neutral-300 hover:bg-neutral-100 transition-colors mb-3"
          >
            {isLoading ? (
              <Loader2 size={14} className="animate-spin text-neutral-400" />
            ) : (
              <>
                <Upload size={13} className="text-neutral-400" />
                <span className="text-xs text-neutral-500">Upload background image (optional)</span>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
            />
          </div>
        )}

        {/* Title */}
        <input
          value={title}
          placeholder="Slide title…"
          onChange={e => { setTitle(e.target.value); save(e.target.value, body, imageBlockObject) }}
          className="w-full text-neutral-800 bg-white border border-neutral-200 rounded-lg px-3 py-2 text-sm font-semibold mb-2 outline-none focus:border-blue-400 transition-colors"
        />

        {/* Body */}
        <textarea
          value={body}
          placeholder="Body text (optional)…"
          rows={2}
          onChange={e => { setBody(e.target.value); save(title, e.target.value, imageBlockObject) }}
          className="w-full text-neutral-700 bg-white border border-neutral-200 rounded-lg px-3 py-2 text-sm mb-0 outline-none focus:border-blue-400 transition-colors resize-none"
        />
      </div>
    </NodeViewWrapper>
  )
}

export default QuizInfoBlockComponent
