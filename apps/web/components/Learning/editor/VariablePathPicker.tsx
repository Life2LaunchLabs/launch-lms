'use client'

import React from 'react'
import { AlertCircle, Check, ChevronRight, CornerDownLeft, FolderPlus, Plus, Variable, X } from 'lucide-react'

// Hierarchical variable target picker. The tree is built from the org's custom
// variable registry (dot-path keys) plus a built-in `profile` folder that maps
// onto user record fields. Folders are implied by key prefixes; "adding a
// folder" only extends the path being typed — it materialises once a variable
// is created beneath it.

const PROFILE_LEAVES: Array<{ name: string; label: string; target: string }> = [
  { name: 'first_name', label: 'First name', target: 'user.first_name' },
  { name: 'last_name', label: 'Last name', target: 'user.last_name' },
  { name: 'bio', label: 'Bio', target: 'user.bio' },
  { name: 'onboarding_goal', label: 'Onboarding goal', target: 'user.details.onboarding.next_step' },
]

const SEGMENT_PATTERN = /^[a-z][a-z0-9_]*$/

type PathNode = {
  name: string
  path: string
  target?: string
  builtin?: boolean
  isLeaf: boolean
  children: Map<string, PathNode>
}

function buildTree(variables: any[], sessionFolders: Set<string>): PathNode {
  const root: PathNode = { name: '', path: '', isLeaf: false, children: new Map() }

  const ensureFolder = (parent: PathNode, name: string): PathNode => {
    let node = parent.children.get(name)
    if (!node) {
      node = {
        name,
        path: parent.path ? `${parent.path}.${name}` : name,
        isLeaf: false,
        children: new Map(),
      }
      parent.children.set(name, node)
    }
    return node
  }

  const profile = ensureFolder(root, 'profile')
  profile.builtin = true
  PROFILE_LEAVES.forEach((leaf) => {
    profile.children.set(leaf.name, {
      name: leaf.name,
      path: `profile.${leaf.name}`,
      target: leaf.target,
      builtin: true,
      isLeaf: true,
      children: new Map(),
    })
  })

  variables.forEach((variable: any) => {
    const segments = String(variable.key || '').split('.').filter(Boolean)
    if (!segments.length) return
    let parent = root
    segments.slice(0, -1).forEach((segment) => {
      parent = ensureFolder(parent, segment)
    })
    const name = segments[segments.length - 1]
    const existing = parent.children.get(name)
    const leaf: PathNode = existing || {
      name,
      path: parent.path ? `${parent.path}.${name}` : name,
      isLeaf: false,
      children: new Map(),
    }
    leaf.isLeaf = true
    leaf.target = `user.details.variables.${variable.key}`
    parent.children.set(name, leaf)
  })

  sessionFolders.forEach((folderPath) => {
    let parent = root
    folderPath.split('.').filter(Boolean).forEach((segment) => {
      parent = ensureFolder(parent, segment)
    })
  })

  return root
}

function resolveFolder(root: PathNode, prefixSegments: string[]): PathNode | null {
  let node = root
  for (const segment of prefixSegments) {
    const next = node.children.get(segment)
    if (!next || (next.isLeaf && next.children.size === 0)) return null
    node = next
  }
  return node
}

export function targetToDisplayPath(target: string): string {
  if (!target) return ''
  const profileLeaf = PROFILE_LEAVES.find((leaf) => leaf.target === target)
  if (profileLeaf) return `profile.${profileLeaf.name}`
  return String(target).replace(/^user\.details\.variables\./, '')
}

export function VariablePathPicker({ value, variables = [], onBind, onCreateVariableKey }: {
  value: string
  variables: any[]
  onBind: (target: string) => void
  onCreateVariableKey: (key: string) => Promise<any>
}) {
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState(() => targetToDisplayPath(value))
  const [highlight, setHighlight] = React.useState(0)
  const [creating, setCreating] = React.useState(false)
  const [dropUp, setDropUp] = React.useState(false)
  const [sessionFolders, setSessionFolders] = React.useState<Set<string>>(new Set())
  const wrapperRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  // Open upward when there isn't room below (e.g. bindings at the bottom of
  // the inspector) instead of stretching the sidebar scroll area.
  React.useLayoutEffect(() => {
    if (!open) return
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) return
    const dropdownHeight = 300
    setDropUp(window.innerHeight - rect.bottom < dropdownHeight && rect.top > dropdownHeight)
  }, [open, text])

  React.useEffect(() => {
    if (!open) setText(targetToDisplayPath(value))
  }, [value, open])

  React.useEffect(() => {
    if (!open) return
    // Capture phase: runs before React re-renders swap out clicked rows, so
    // the contains() check still sees them; detached targets are ignored.
    const onDocDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!target.isConnected) return
      if (!wrapperRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown, true)
    return () => document.removeEventListener('mousedown', onDocDown, true)
  }, [open])

  const root = React.useMemo(() => buildTree(variables, sessionFolders), [variables, sessionFolders])

  const lastDot = text.lastIndexOf('.')
  const prefixText = lastDot >= 0 ? text.slice(0, lastDot) : ''
  const term = lastDot >= 0 ? text.slice(lastDot + 1) : text
  const prefixSegments = prefixText.split('.').filter(Boolean)
  const folder = resolveFolder(root, prefixSegments)

  const nodes = folder
    ? Array.from(folder.children.values())
      .filter((node) => node.name.toLowerCase().startsWith(term.toLowerCase()))
      .sort((a, b) => Number(a.isLeaf) - Number(b.isLeaf) || a.name.localeCompare(b.name))
    : []
  const exactNode = folder?.children.get(term) || null
  const termIsValidSegment = SEGMENT_PATTERN.test(term)
  const canCreateHere = Boolean(folder) && !folder?.builtin && !exactNode && termIsValidSegment && term.length > 0
  const boundDisplay = targetToDisplayPath(value)

  React.useEffect(() => {
    setHighlight(0)
  }, [text])

  const setPath = (path: string, descend: boolean) => {
    setText(descend ? `${path}.` : path)
    inputRef.current?.focus()
  }

  const pickNode = (node: PathNode) => {
    if (node.isLeaf && node.children.size === 0) setPath(node.path, false)
    else setPath(node.path, true)
  }

  const bindNode = (node: PathNode) => {
    if (!node.target) return
    onBind(node.target)
    setOpen(false)
  }

  const autocomplete = () => {
    const node = nodes[highlight]
    if (node) pickNode(node)
  }

  const addFolder = () => {
    const path = prefixSegments.concat(term).join('.')
    setSessionFolders((current) => new Set(current).add(path))
    setPath(path, true)
  }

  const addVariable = async () => {
    const key = prefixSegments.concat(term).join('.')
    setCreating(true)
    try {
      const variable = await onCreateVariableKey(key)
      if (variable) {
        onBind(`user.details.variables.${key}`)
        setOpen(false)
      }
    } finally {
      setCreating(false)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) setOpen(true)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((current) => Math.min(nodes.length - 1, current + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((current) => Math.max(0, current - 1))
    } else if (event.key === 'Tab') {
      if (nodes.length) {
        event.preventDefault()
        autocomplete()
      }
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (exactNode?.target) bindNode(exactNode)
      else autocomplete()
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className={`flex h-9 items-center gap-1 rounded-lg border bg-white pl-2 pr-1 ${folder || !open ? 'border-gray-200 focus-within:border-[var(--org-primary-color)]' : 'border-red-300'}`}>
        <Variable size={14} className="shrink-0 text-gray-400" />
        <input
          ref={inputRef}
          value={text}
          onFocus={() => setOpen(true)}
          onChange={(event) => setText(event.target.value.toLowerCase())}
          onKeyDown={onKeyDown}
          placeholder="Choose or create a variable"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-gray-400"
        />
        {exactNode?.target && open && (
          <button
            type="button"
            title={`Bind to ${exactNode.path}`}
            onMouseDown={(event) => { event.preventDefault(); bindNode(exactNode) }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
          >
            <Check size={14} strokeWidth={3} />
          </button>
        )}
        {value && !open && (
          <button
            type="button"
            title="Remove binding"
            onMouseDown={(event) => { event.preventDefault(); onBind(''); setText('') }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {value && !open && boundDisplay === text && (
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600">Bound</p>
      )}

      {open && (
        <div className={`absolute left-0 right-0 z-40 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl ${dropUp ? 'bottom-10' : 'top-10'}`}>
          {!folder ? (
            <div className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-red-600">
              <AlertCircle size={13} />
              “{prefixText}” isn’t a folder
            </div>
          ) : (
            <>
              <div className="max-h-56 overflow-y-auto py-1">
                {nodes.map((node, index) => (
                  <div
                    key={node.path}
                    onMouseEnter={() => setHighlight(index)}
                    onMouseDown={(event) => { event.preventDefault(); pickNode(node) }}
                    className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs ${index === highlight ? 'bg-gray-100' : ''}`}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{node.name}</span>
                    {node.builtin && !node.isLeaf && <span className="text-[9px] font-bold uppercase text-gray-300">built-in</span>}
                    {!node.isLeaf || node.children.size > 0 ? (
                      <ChevronRight size={13} className="shrink-0 text-gray-400" />
                    ) : (
                      <button
                        type="button"
                        title={`Bind to ${node.path}`}
                        onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); bindNode(node) }}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-300 text-gray-500 hover:border-[var(--org-primary-color)] hover:text-[var(--org-primary-color)]"
                      >
                        <Plus size={11} />
                      </button>
                    )}
                  </div>
                ))}
                {!nodes.length && !canCreateHere && (
                  <div className="px-3 py-2.5 text-xs font-medium text-gray-400">
                    {term && !termIsValidSegment ? 'Use lowercase letters, digits and underscores' : 'Nothing here yet'}
                  </div>
                )}
              </div>
              {canCreateHere && (
                <div className="border-t border-gray-100 p-1">
                  <button
                    type="button"
                    disabled={creating}
                    onMouseDown={(event) => { event.preventDefault(); addFolder() }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    <FolderPlus size={13} />
                    Add folder “{term}”
                  </button>
                  <button
                    type="button"
                    disabled={creating}
                    onMouseDown={(event) => { event.preventDefault(); void addVariable() }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    <CornerDownLeft size={13} />
                    {creating ? 'Creating…' : `Add variable “${term}” and bind`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
