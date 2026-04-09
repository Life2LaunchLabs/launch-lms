'use client'
import React, { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Bold, Italic, Heading2, Heading3, List, ListOrdered, Image as ImageIcon, BarChart3 } from 'lucide-react'
import ImageBlock from '@components/Objects/Editor/Extensions/Image/ImageBlock'
import FixableBlocks from '@components/Objects/Editor/Extensions/FixableBlocks/FixableBlocks'
import DragHandle from '@components/Objects/Editor/Extensions/DragHandle/DragHandle'
import EditorOptionsProvider from '@components/Contexts/Editor/EditorContext'
import QuizScoresBlock from './QuizScoresBlock'

// ── Helpers ────────────────────────────────────────────────────────────────────

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Build the displayed document: fixed blocks from template, variable blocks
 * from varOverrides (keyed by varId), falling back to the template node.
 */
export function mergeContent(
  template: any | null,
  varOverrides: Record<string, any> | null
): any {
  if (!template?.content?.length) {
    return { type: 'doc', content: [{ type: 'paragraph', attrs: { isFixed: false, fixedId: null, varId: null } }] }
  }
  return {
    ...template,
    content: template.content.map((node: any) => {
      if (node.attrs?.isFixed) return node
      const varId = node.attrs?.varId
      if (varId && varOverrides?.[varId]) {
        return { ...varOverrides[varId], attrs: { ...varOverrides[varId].attrs, varId } }
      }
      return node // empty variable block placeholder
    }),
  }
}

/**
 * Extract the template: fixed blocks keep their content; variable blocks are
 * stripped to just type+attrs (with a stable varId assigned if missing).
 */
export function extractTemplate(doc: any): any {
  if (!doc?.content) return doc
  return {
    ...doc,
    content: doc.content.map((node: any) => {
      if (node.attrs?.isFixed) return node
      const varId = node.attrs?.varId || genId()
      return { type: node.type, attrs: { ...(node.attrs || {}), varId, isFixed: false, fixedId: null } }
    }),
  }
}

/**
 * Extract per-result variable overrides: all non-fixed blocks keyed by varId.
 */
export function extractVarOverrides(doc: any): Record<string, any> {
  const out: Record<string, any> = {}
  for (const node of doc?.content || []) {
    if (!node.attrs?.isFixed) {
      const varId = node.attrs?.varId || genId()
      out[varId] = { ...node, attrs: { ...node.attrs, varId } }
    }
  }
  return out
}

// ── Fixed-block decoration (grey bg, muted text) ───────────────────────────────

const FIXED_DECORATION_KEY = new PluginKey('fixedDecoration')

const FixedBlockDecoration = Extension.create({
  name: 'fixedBlockDecoration',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: FIXED_DECORATION_KEY,
        props: {
          decorations(state) {
            const decos: Decoration[] = []
            state.doc.forEach((node, offset) => {
              if (node.attrs?.isFixed) {
                decos.push(Decoration.node(offset, offset + node.nodeSize, { class: 'is-fixed-block' }))
              }
            })
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})

// ── Injected CSS ───────────────────────────────────────────────────────────────

const EDITOR_CSS = `
.quiz-result-content-editor .ProseMirror {
  outline: none;
  min-height: 80px;
}
.quiz-result-content-editor .ProseMirror p { margin: 0 0 0.5em; }
.quiz-result-content-editor .ProseMirror h2 { font-size: 1.2rem; font-weight: 700; margin: 0.9em 0 0.35em; }
.quiz-result-content-editor .ProseMirror h3 { font-size: 1rem; font-weight: 600; margin: 0.75em 0 0.3em; }
.quiz-result-content-editor .ProseMirror ul,
.quiz-result-content-editor .ProseMirror ol { padding-left: 1.4em; margin: 0.4em 0; }
.quiz-result-content-editor .ProseMirror li { margin: 0.15em 0; }

/* Fixed block: grey background, muted text */
.quiz-result-content-editor .ProseMirror .is-fixed-block {
  background: #f3f4f6;
  border-radius: 6px;
  padding: 8px 12px;
  color: #9ca3af !important;
  margin-bottom: 4px;
}
.quiz-result-content-editor .ProseMirror .is-fixed-block * { color: inherit; }

/* Variable block: subtle left stripe */
.quiz-result-content-editor .ProseMirror > p,
.quiz-result-content-editor .ProseMirror > h2,
.quiz-result-content-editor .ProseMirror > h3,
.quiz-result-content-editor .ProseMirror > ul,
.quiz-result-content-editor .ProseMirror > ol {
  padding: 4px 0;
}

.quiz-result-toolbar {
  display: flex; align-items: center; gap: 2px; flex-wrap: wrap; margin-bottom: 8px;
  border-bottom: 1px solid #f3f4f6; padding-bottom: 8px;
}
.quiz-result-toolbar button {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  border-radius: 5px; border: none; background: none; color: #6b7280;
  cursor: pointer; transition: background 150ms, color 150ms; outline: none;
}
.quiz-result-toolbar button:hover { background: #f3f4f6; color: #111827; }
.quiz-result-toolbar button.is-active { background: #ede9fe; color: #6d28d9; }
.quiz-result-toolbar .tb-divider { width: 1px; height: 18px; background: #e5e7eb; margin: 0 2px; }
`

function injectEditorStyles() {
  const id = 'quiz-result-editor-styles'
  if (document.getElementById(id)) return
  const el = document.createElement('style')
  el.id = id
  el.textContent = EDITOR_CSS
  document.head.appendChild(el)
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  /** Drives content switching; changing this swaps variable blocks without remount */
  resultUuid: string | null
  template: any | null
  varOverrides: Record<string, any> | null
  activity: any
  vectors: any[]
  scores: Record<string, number>
  onUpdate: (template: any, varOverrides: Record<string, any>) => void
}

export default function QuizResultContentEditor({
  resultUuid,
  template,
  varOverrides,
  activity,
  vectors,
  scores,
  onUpdate,
}: Props) {
  useEffect(() => { injectEditorStyles() }, [])

  const isSettingContent = useRef(false)
  const templateRef = useRef(template)
  const varOverridesRef = useRef(varOverrides)
  const prevResultUuid = useRef(resultUuid)

  // Keep refs current without triggering effects
  templateRef.current = template
  varOverridesRef.current = varOverrides

  const editor = useEditor({
    immediatelyRender: false,
    editable: true,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false }),
      ImageBlock.configure({ activity }),
      QuizScoresBlock.configure({ vectors, scores }),
      FixableBlocks,
      FixedBlockDecoration,
      DragHandle.configure({ showFixedToggle: true }),
    ],
    content: mergeContent(template, varOverrides),
    onUpdate: ({ editor }) => {
      if (isSettingContent.current) return
      const doc = editor.getJSON()
      const newTemplate = extractTemplate(doc)
      const newOverrides = extractVarOverrides(doc)
      templateRef.current = newTemplate
      varOverridesRef.current = newOverrides
      onUpdate(newTemplate, newOverrides)
    },
  })

  // When the selected result changes, swap variable block content without remounting
  useEffect(() => {
    if (!editor || prevResultUuid.current === resultUuid) return
    prevResultUuid.current = resultUuid
    const merged = mergeContent(templateRef.current, varOverridesRef.current)
    isSettingContent.current = true
    editor.commands.setContent(merged, false)
    isSettingContent.current = false
  }, [editor, resultUuid])

  const addImageBlock = () => {
    if (!editor) return
    editor.commands.insertContent({
      type: 'blockImage',
      attrs: { blockObject: null, size: { width: 600 }, alignment: 'center', isFixed: false, fixedId: null, varId: genId() },
    })
  }

  const addScoresBlock = () => {
    if (!editor) return
    editor.commands.insertContent({
      type: 'quizScoresBlock',
      attrs: { isFixed: true, fixedId: genId(), varId: null },
    })
  }

  return (
    <EditorOptionsProvider options={{ isEditable: true }}>
      <div className="quiz-result-content-editor">
        <div className="quiz-result-toolbar">
          <button type="button" onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBold().run() }}
            className={editor?.isActive('bold') ? 'is-active' : ''} title="Bold"><Bold size={13} /></button>
          <button type="button" onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleItalic().run() }}
            className={editor?.isActive('italic') ? 'is-active' : ''} title="Italic"><Italic size={13} /></button>
          <div className="tb-divider" />
          <button type="button" onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleHeading({ level: 2 }).run() }}
            className={editor?.isActive('heading', { level: 2 }) ? 'is-active' : ''} title="Heading 2"><Heading2 size={13} /></button>
          <button type="button" onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleHeading({ level: 3 }).run() }}
            className={editor?.isActive('heading', { level: 3 }) ? 'is-active' : ''} title="Heading 3"><Heading3 size={13} /></button>
          <div className="tb-divider" />
          <button type="button" onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run() }}
            className={editor?.isActive('bulletList') ? 'is-active' : ''} title="Bullet list"><List size={13} /></button>
          <button type="button" onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleOrderedList().run() }}
            className={editor?.isActive('orderedList') ? 'is-active' : ''} title="Numbered list"><ListOrdered size={13} /></button>
        </div>

        <EditorContent editor={editor} />

        <button type="button" onClick={addImageBlock}
          className="mt-3 flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 transition-colors outline-none">
          <ImageIcon size={13} />
          Add image block
        </button>
        <button type="button" onClick={addScoresBlock}
          className="mt-3 ml-4 inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 transition-colors outline-none">
          <BarChart3 size={13} />
          Add scores block
        </button>
      </div>
    </EditorOptionsProvider>
  )
}
