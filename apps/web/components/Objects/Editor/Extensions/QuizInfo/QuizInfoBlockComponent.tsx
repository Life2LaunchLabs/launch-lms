'use client'
import { NodeViewWrapper } from '@tiptap/react'
import React, { useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Upload, Loader2, X, Info, Trash2, Copy, Dice6 } from 'lucide-react'
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { uploadNewImageFile } from '@services/blocks/Image/images'
import { getActivityBlockMediaDirectory } from '@services/media/media'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCourse } from '@components/Contexts/CourseContext'

const HEADER_BG = '#dbeafe'
const HEADER_BORDER = '#bfdbfe'
const ACCENT_COLOR = '#3b82f6'
const OVERLAY_TITLE_STYLE: React.CSSProperties = {
  width: '100%',
  textAlign: 'center',
  background: 'rgba(255,255,255,0.14)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  border: '1px solid rgba(255,255,255,0.24)',
  borderRadius: 999,
  padding: '10px 16px',
  fontSize: 15,
  fontWeight: 800,
  color: '#fff',
  outline: 'none',
  lineHeight: 1.2,
  boxShadow: '0 14px 34px rgba(15,23,42,0.18)',
}

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
  const [gradientSeed, setGradientSeed] = React.useState<string>(attrs.gradient_seed || attrs.slide_uuid || uuidv4())
  const [isLoading, setIsLoading] = React.useState(false)

  const save = (newTitle: string, newBody: string, newBlockObj: any, newSeed?: string) => {
    props.updateAttributes({
      slide_uuid: attrs.slide_uuid || uuidv4(),
      gradient_seed: newSeed ?? gradientSeed,
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
      const blockObj = await uploadNewImageFile(file, props.extension.options.activity?.activity_uuid || '', access_token)
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
      org?.org_uuid, course?.courseStructure?.course_uuid,
      blockObj.content.activity_uuid || props.extension.options.activity?.activity_uuid || '',
      blockObj.block_uuid, fileId, 'imageBlock'
    )
  }

  const handleRerandomizeGradient = () => {
    const newSeed = uuidv4()
    setGradientSeed(newSeed)
    save(title, body, imageBlockObject, newSeed)
  }

  const handleDuplicate = () => {
    const pos = typeof props.getPos === 'function' ? props.getPos() : undefined
    if (pos === undefined) return
    const nodeJSON = props.node.toJSON()
    const newAttrs = { ...nodeJSON.attrs, slide_uuid: uuidv4(), gradient_seed: uuidv4() }
    props.editor.commands.insertContentAt(pos + props.node.nodeSize, { ...nodeJSON, attrs: newAttrs })
  }

  const imageUrl = getImageUrl(imageBlockObject)

  if (!isEditable) return null

  return (
    <NodeViewWrapper className="quiz-info-block my-4 w-full first:mt-0 last:mb-0">
      <div style={{
        border: '1px solid rgba(255,255,255,0.78)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: props.selected
          ? '0 10px 26px rgba(59,130,246,0.16)'
          : '0 2px 10px rgba(0,0,0,0.07)',
        transition: 'box-shadow 0.15s ease',
      }}>
        {/* ── Header bar ── */}
        <div style={{ background: HEADER_BG, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Info size={14} style={{ color: ACCENT_COLOR, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT_COLOR, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>Info Slide</span>
          <div style={{ flex: 1 }} />
          <div style={{ width: 1, height: 16, background: '#bfdbfe', margin: '0 2px' }} />
          <button type="button" onClick={handleDuplicate} title="Duplicate slide"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#93c5fd' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <Copy size={13} />
          </button>
          <button type="button" onClick={() => props.deleteNode()} title="Delete slide"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#f87171' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <Trash2 size={13} />
          </button>
        </div>

        {/* ── Content area ── */}
        <div style={{ padding: '12px', background: '#fff' }}>
          <div
            style={{ width: '100%', height: 420, borderRadius: 12, overflow: 'hidden', position: 'relative', background: imageUrl ? undefined : getGradient(gradientSeed) }}
          >
            {imageUrl && <img src={imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', zIndex: 10, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
              <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  value={title}
                  placeholder="Slide title…"
                  onChange={e => { setTitle(e.target.value); save(e.target.value, body, imageBlockObject) }}
                  style={OVERLAY_TITLE_STYLE}
                />
                <textarea
                  value={body}
                  placeholder="Body text (optional)…"
                  rows={3}
                  onChange={e => { setBody(e.target.value); save(title, e.target.value, imageBlockObject) }}
                  style={{ width: '100%', textAlign: 'center', background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 18, padding: '12px 16px', fontSize: 13, color: 'rgba(255,255,255,0.92)', outline: 'none', resize: 'none', lineHeight: 1.5, boxShadow: '0 14px 34px rgba(15,23,42,0.12)' }}
                />
              </div>
            </div>
            {imageUrl ? (
              <button type="button" onClick={() => { setImageBlockObject(null); save(title, body, null) }}
                style={{ position: 'absolute', top: 8, right: 8, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', cursor: 'pointer', color: '#fff' }}>
                <X size={12} />
              </button>
            ) : (
              <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button type="button" onClick={() => !isLoading && inputRef.current?.click()} title="Upload background"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', border: 'none', cursor: 'pointer', color: '#fff' }}>
                  {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                </button>
                <button type="button" onClick={handleRerandomizeGradient} title="Randomize gradient"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', border: 'none', cursor: 'pointer', color: '#fff' }}>
                  <Dice6 size={12} />
                </button>
                <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  )
}

export default QuizInfoBlockComponent
