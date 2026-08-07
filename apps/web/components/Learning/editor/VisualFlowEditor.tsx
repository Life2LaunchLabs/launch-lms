'use client'

/* eslint-disable no-unused-vars */

import React from 'react'
import {
  AlertTriangle,
  Check,
  Copy,
  FileText,
  GitBranch,
  GripVertical,
  Link2,
  ListChecks,
  MoreHorizontal,
  Plus,
  Trash2,
  Video,
} from 'lucide-react'
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from '@hello-pangea/dnd'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { findQuestionBlocks } from '@components/Learning/schema'
import { normalizeQuestionInputs, normalizeQuestionOptions } from './utils'
import { VariablePathPicker } from './VariablePathPicker'

export type FlowNode = { id: string; type: 'page' | 'split' | 'join' | 'complete'; page_uuid?: string }
export type FlowEdge = { from: string; to: string; priority: number; condition?: any; merge?: boolean; order?: number }
export type Flow = { version: 1; entry: string; nodes: FlowNode[]; edges: FlowEdge[] }
export type FlowInsertion = { from: string; to?: string | null; priority?: number }

export type FlowIssue = {
  code: 'question_after_split' | 'duplicate_rule' | 'loose_end' | 'invalid_rule' | 'structure'
  message: string
  nodeId?: string
  sourcePageUuid?: string
}

type FlowVariable = {
  target: string
  key: string
  label: string
  path: string
  source: 'answer' | 'variable'
  pageUuid?: string
  pageTitle?: string
  valueType: 'text' | 'number' | 'option' | 'multiple_choice' | 'boolean' | 'image'
  options?: Array<{ value: string; label: string }>
}

export type PathModel = {
  nodes: FlowNode[]
  decisionId?: string
  joinId?: string
  terminal: 'complete' | 'loose' | 'connection'
  terminalId?: string
  terminalEdge?: FlowEdge
}

export type StackContext = PathModel & {
  stackId: string
  startId: string
  entryEdge?: FlowEdge
}

type Connector = { id: string; path: string; tone: 'split' | 'connection' }
type ConnectionDraft = { edge?: FlowEdge; from: string }
type Point = { x: number; y: number }

function outgoing(flow: Flow, nodeId: string) {
  return flow.edges.filter((edge) => edge.from === nodeId)
}

export function displayBranches(flow: Flow, nodeId: string) {
  return outgoing(flow, nodeId).sort((a, b) => (a.order ?? (a.condition ? a.priority + 1 : 0)) - (b.order ?? (b.condition ? b.priority + 1 : 0)))
}

function canonicalJoinInput(flow: Flow, joinId: string) {
  return [...incoming(flow, joinId)].sort((a, b) => Number(Boolean(a.merge)) - Number(Boolean(b.merge)) || edgeKey(a).localeCompare(edgeKey(b)))[0]
}

function incoming(flow: Flow, nodeId: string) {
  return flow.edges.filter((edge) => edge.to === nodeId)
}

function sameEdge(left: FlowEdge | undefined, right: FlowEdge | undefined) {
  if (!left || !right) return false
  return left.from === right.from
    && left.to === right.to
    && left.priority === right.priority
    && JSON.stringify(left.condition || null) === JSON.stringify(right.condition || null)
}

function edgeKey(edge: FlowEdge) {
  return `${edge.from}::${edge.priority}::${edge.to}::${JSON.stringify(edge.condition || null)}`
}

function findEdge(flow: Flow, template: FlowEdge | undefined) {
  if (!template) return undefined
  return flow.edges.find((edge) => edge.from === template.from
    && edge.priority === template.priority
    && JSON.stringify(edge.condition || null) === JSON.stringify(template.condition || null))
}

function collapseSingleInputJoin(flow: Flow, joinId: string): Flow {
  const join = flow.nodes.find((node) => node.id === joinId && node.type === 'join')
  if (!join) return flow
  const inputs = incoming(flow, joinId)
  const exits = outgoing(flow, joinId)
  if (inputs.length !== 1 || exits.length !== 1) return flow
  const input = inputs[0]
  const exit = exits[0]
  return {
    ...flow,
    entry: flow.entry === joinId ? exit.to : flow.entry,
    nodes: flow.nodes.filter((node) => node.id !== joinId),
    edges: [
      ...flow.edges.filter((edge) => edge !== input && edge !== exit),
      { ...input, to: exit.to, merge: undefined },
    ],
  }
}

function collapseSingleInputJoins(flow: Flow): Flow {
  let next = flow
  const redundantJoin = (candidate: FlowNode) => candidate.type === 'join'
    && (incoming(next, candidate.id).length === 0
      || (incoming(next, candidate.id).length === 1 && outgoing(next, candidate.id).length === 1))
  let join = next.nodes.find(redundantJoin)
  while (join) {
    const inputs = incoming(next, join.id)
    const exits = outgoing(next, join.id)
    if (inputs.length === 1 && exits.length === 1) {
      next = collapseSingleInputJoin(next, join.id)
    } else {
      next = {
        ...next,
        nodes: next.nodes.filter((node) => node.id !== join!.id),
        edges: next.edges.filter((edge) => edge.from !== join!.id && edge.to !== join!.id),
      }
    }
    join = next.nodes.find(redundantJoin)
  }
  return next
}

export function normalizeJoinNodes(flow: Flow): Flow {
  return collapseSingleInputJoins(flow)
}

function detachConnection(flow: Flow, draft: ConnectionDraft): { flow: Flow; sourceEdge?: FlowEdge } {
  const sourceEdge = findEdge(flow, draft.edge)
  if (!sourceEdge) return { flow }
  const oldTarget = flow.nodes.find((node) => node.id === sourceEdge.to)
  let next = { ...flow, edges: flow.edges.filter((edge) => edge !== sourceEdge) }
  if (oldTarget?.type === 'join') next = collapseSingleInputJoins(next)
  return { flow: next, sourceEdge }
}

function targetBoundaryAfterDetach(flow: Flow, draft: ConnectionDraft, targetEdge: FlowEdge) {
  const detached = detachConnection(flow, draft).flow
  const exact = findEdge(detached, targetEdge)
  if (exact) return { flow: detached, boundary: exact }
  const fallback = outgoing(detached, targetEdge.from)
  return fallback.length === 1 ? { flow: detached, boundary: fallback[0] } : { flow: detached, boundary: undefined }
}

function canConnectAtJunction(flow: Flow, draft: ConnectionDraft, targetEdge: FlowEdge) {
  const target = targetBoundaryAfterDetach(flow, draft, targetEdge)
  if (!target.boundary || target.boundary.from === draft.from) return false
  return !canReach(target.flow, target.boundary.to, draft.from)
}

function connectAtJunction(flow: Flow, draft: ConnectionDraft, targetEdge: FlowEdge): Flow {
  if (!canConnectAtJunction(flow, draft, targetEdge)) return flow
  const source = detachConnection(flow, draft)
  const target = targetBoundaryAfterDetach(flow, draft, targetEdge)
  const boundary = target.boundary!
  const targetNode = target.flow.nodes.find((node) => node.id === boundary.to)
  const sourceTemplate = source.sourceEdge || { from: draft.from, to: '', priority: 0 }
  if (targetNode?.type === 'join') {
    return {
      ...target.flow,
      edges: [...target.flow.edges, { ...sourceTemplate, from: draft.from, to: targetNode.id, merge: true }],
    }
  }
  const join: FlowNode = { id: createJoinId(target.flow), type: 'join' }
  return {
    ...target.flow,
    nodes: [...target.flow.nodes, join],
    edges: [
      ...target.flow.edges.filter((edge) => edge !== boundary),
      { ...boundary, to: join.id, merge: undefined },
      { from: join.id, to: boundary.to, priority: 0 },
      { ...sourceTemplate, from: draft.from, to: join.id, merge: true },
    ],
  }
}

function connectToFinish(flow: Flow, draft: ConnectionDraft, completionId: string): Flow {
  const detached = detachConnection(flow, draft)
  if (completionId === draft.from || canReach(detached.flow, completionId, draft.from)) return flow
  const sourceTemplate = detached.sourceEdge || { from: draft.from, to: completionId, priority: 0 }
  const finishInput = incoming(detached.flow, completionId)
  const existingJoin = finishInput.length === 1 ? detached.flow.nodes.find((node) => node.id === finishInput[0].from && node.type === 'join') : undefined
  if (existingJoin) {
    return {
      ...detached.flow,
      edges: [...detached.flow.edges, { ...sourceTemplate, from: draft.from, to: existingJoin.id, merge: true }],
    }
  }
  return ensureJoinNodes({
    ...detached.flow,
    edges: [...detached.flow.edges, { ...sourceTemplate, from: draft.from, to: completionId, merge: undefined }],
  })
}

function finishEntryTarget(flow: Flow, completionId: string) {
  const inputs = incoming(flow, completionId)
  const join = inputs.length === 1 ? flow.nodes.find((node) => node.id === inputs[0].from && node.type === 'join') : undefined
  return join?.id || completionId
}

function canReach(flow: Flow, from: string, target: string, seen = new Set<string>()): boolean {
  if (from === target) return true
  if (seen.has(from)) return false
  seen.add(from)
  return outgoing(flow, from).some((edge) => canReach(flow, edge.to, target, new Set(seen)))
}

function reachableNodeIds(flow: Flow) {
  const seen = new Set<string>()
  const visit = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    outgoing(flow, id).forEach((edge) => visit(edge.to))
  }
  visit(flow.entry)
  return seen
}

function createSplitId(flow: Flow) {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  let id = `split:${suffix}`
  while (flow.nodes.some((node) => node.id === id)) id = `split:${id}`
  return id
}

function createJoinId(flow: Flow) {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  let id = `join:${suffix}`
  while (flow.nodes.some((node) => node.id === id)) id = `join:${id}`
  return id
}

function ensureJoinNodes(flow: Flow): Flow {
  let next = flow
  let target = next.nodes.find((node) => node.type !== 'join' && incoming(next, node.id).length > 1)
  while (target) {
    const join: FlowNode = { id: createJoinId(next), type: 'join' }
    next = {
      ...next,
      nodes: [...next.nodes, join],
      edges: [
        ...next.edges.map((edge) => edge.to === target!.id ? { ...edge, to: join.id } : edge),
        { from: join.id, to: target.id, priority: 0 },
      ],
    }
    target = next.nodes.find((node) => node.type !== 'join' && incoming(next, node.id).length > 1)
  }
  return next
}

export function ensureSplitNodes(flow: Flow): Flow {
  let next = flow
  const candidates = flow.nodes.filter((node) => node.type === 'page' && outgoing(flow, node.id).length > 1)
  candidates.forEach((node) => {
    const branches = outgoing(next, node.id)
    if (branches.length < 2) return
    const split: FlowNode = { id: createSplitId(next), type: 'split' }
    next = {
      ...next,
      nodes: [...next.nodes, split],
      edges: [
        ...next.edges.filter((edge) => edge.from !== node.id),
        { from: node.id, to: split.id, priority: 0 },
        ...branches.map((edge) => ({ ...edge, from: split.id })),
      ],
    }
  })
  return ensureJoinNodes(next)
}

function pathSegment(value: string) {
  const clean = value.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  return /^[a-z]/.test(clean) ? clean : `item_${clean || 'variable'}`
}

function activityVariablePath(label: string, uniqueId: string) {
  return `this_activity.${pathSegment(label)}__${pathSegment(uniqueId)}`
}

function localVariables(pages: any[]): FlowVariable[] {
  const variables: FlowVariable[] = []
  pages.forEach((page) => {
    findQuestionBlocks(page).forEach((block: any) => {
      const questionLabel = String(block.content?.label || block.content?.title || 'Question')
      if (['multiple_choice', 'categorized_multi_select'].includes(block.kind)) {
        const key = `${page.page_uuid}.result.questions.${block.id}.option_ids`
        variables.push({
          target: `answer:${key}`,
          key,
          label: questionLabel,
          path: activityVariablePath(questionLabel, String(block.id)),
          source: 'answer',
          pageUuid: page.page_uuid,
          pageTitle: page.title || 'Untitled page',
          valueType: 'multiple_choice',
          options: normalizeQuestionOptions(block.content?.options || []).map((option) => ({ value: option.id, label: option.text })),
        })
        return
      }
      if (block.kind === 'text_input') {
        const inputs = normalizeQuestionInputs(block.content?.inputs || [])
        inputs.forEach((input) => {
          const label = inputs.length > 1 ? `${questionLabel} / ${input.label || 'Response'}` : input.label || questionLabel
          const key = `${page.page_uuid}.result.questions.${block.id}.inputs.${input.id}.${input.input_type === 'number' ? 'value' : 'text'}`
          variables.push({ target: `answer:${key}`, key, label, path: activityVariablePath(label, `${block.id}_${input.id}`), source: 'answer', pageUuid: page.page_uuid, pageTitle: page.title || 'Untitled page', valueType: input.input_type === 'number' ? 'number' : 'text' })
        })
        return
      }
      if (block.kind === 'image_upload') {
        const key = `${page.page_uuid}.result.questions.${block.id}.url`
        variables.push({
          target: `answer:${key}`,
          key,
          label: questionLabel,
          path: activityVariablePath(questionLabel, String(block.id)),
          source: 'answer',
          pageUuid: page.page_uuid,
          pageTitle: page.title || 'Untitled page',
          valueType: 'image',
        })
      }
    })
  })
  return variables
}

const BUILTIN_FLOW_VARIABLES: FlowVariable[] = [
  { target: 'user.username', key: 'user.username', path: 'profile.username', label: 'Username', source: 'variable', valueType: 'text' },
  { target: 'user.email', key: 'user.email', path: 'profile.email', label: 'Email', source: 'variable', valueType: 'text' },
  { target: 'user.email_verified', key: 'user.email_verified', path: 'profile.email_verified', label: 'Email verified', source: 'variable', valueType: 'boolean' },
  { target: 'user.details.variables.age', key: 'user.details.variables.age', path: 'profile.age', label: 'Age', source: 'variable', valueType: 'number' },
  { target: 'user.first_name', key: 'user.first_name', path: 'profile.first_name', label: 'First name', source: 'variable', valueType: 'text' },
  { target: 'user.last_name', key: 'user.last_name', path: 'profile.last_name', label: 'Last name', source: 'variable', valueType: 'text' },
  { target: 'user.bio', key: 'user.bio', path: 'profile.bio', label: 'Bio', source: 'variable', valueType: 'text' },
  { target: 'user.avatar_image', key: 'user.avatar_image', path: 'profile.avatar_image', label: 'Profile photo', source: 'variable', valueType: 'image' },
  { target: 'user.details.onboarding.next_step', key: 'user.details.onboarding.next_step', path: 'profile.onboarding_goal', label: 'Onboarding goal', source: 'variable', valueType: 'text' },
  { target: 'user.portfolio.display_name', key: 'user.portfolio.display_name', path: 'portfolio.display_name', label: 'Display name', source: 'variable', valueType: 'text' },
  { target: 'user.portfolio.headline', key: 'user.portfolio.headline', path: 'portfolio.headline', label: 'Headline', source: 'variable', valueType: 'text' },
  { target: 'user.portfolio.short_bio', key: 'user.portfolio.short_bio', path: 'portfolio.short_bio', label: 'Short bio', source: 'variable', valueType: 'text' },
  { target: 'user.portfolio.location_label', key: 'user.portfolio.location_label', path: 'portfolio.location_label', label: 'Location', source: 'variable', valueType: 'text' },
]

function flowVariables(pages: any[], registry: any[]): FlowVariable[] {
  const custom = registry.map((variable) => {
    const valueType = String(variable.value_type || variable.valueType || 'text') as FlowVariable['valueType']
    return {
      target: `user.details.variables.${variable.key}`,
      key: `user.details.variables.${variable.key}`,
      path: String(variable.key),
      label: String(variable.label || variable.key),
      source: 'variable' as const,
      valueType,
      options: (Array.isArray(variable.options) ? variable.options : []).map((option: any, index: number) => ({ value: String(option?.id || option?.value || `option_${index + 1}`), label: String(option?.text || option?.label || '') })),
    }
  })
  const customTargets = new Set(custom.map((variable) => variable.target))
  return [...localVariables(pages), ...BUILTIN_FLOW_VARIABLES.filter((variable) => !customTargets.has(variable.target)), ...custom]
}

export function createLinearFlow(pages: any[]): Flow {
  const nodes: FlowNode[] = pages.map((page) => ({ id: `page:${page.page_uuid}`, type: 'page', page_uuid: page.page_uuid }))
  nodes.push({ id: 'complete', type: 'complete' })
  return {
    version: 1,
    entry: nodes[0]?.id || 'complete',
    nodes,
    edges: pages.map((page, index) => ({ from: `page:${page.page_uuid}`, to: index + 1 < pages.length ? `page:${pages[index + 1].page_uuid}` : 'complete', priority: 0 })),
  }
}

export function appendPageToFlow(flow: Flow | undefined, page: any): Flow | undefined {
  if (!flow || flow.nodes.some((node) => node.page_uuid === page.page_uuid)) return flow
  const completion = flow.nodes.find((node) => node.type === 'complete')
  if (!completion) return flow
  const pageNode: FlowNode = { id: `page:${page.page_uuid}`, type: 'page', page_uuid: page.page_uuid }
  const completionIds = new Set(flow.nodes.filter((node) => node.type === 'complete').map((node) => node.id))
  return {
    ...flow,
    entry: completionIds.has(flow.entry) ? pageNode.id : flow.entry,
    nodes: [...flow.nodes.filter((node) => node.type !== 'complete'), pageNode, completion],
    edges: [
      ...flow.edges.map((edge) => completionIds.has(edge.to) ? { ...edge, to: pageNode.id } : edge),
      { from: pageNode.id, to: completion.id, priority: 0 },
    ],
  }
}

export function insertPageIntoFlow(flow: Flow, page: any, insertion: FlowInsertion): Flow {
  if (flow.nodes.some((node) => node.page_uuid === page.page_uuid)) return flow
  const node: FlowNode = { id: `page:${page.page_uuid}`, type: 'page', page_uuid: page.page_uuid }
  const edgeIndex = flow.edges.findIndex((edge) => edge.from === insertion.from
    && (insertion.to == null || edge.to === insertion.to)
    && (insertion.priority == null || edge.priority === insertion.priority))
  if (edgeIndex < 0) {
    const completion = flow.nodes.find((item) => item.type === 'complete')
    return {
      ...flow,
      nodes: [...flow.nodes, node],
      edges: [...flow.edges, ...(completion ? [{ from: insertion.from, to: node.id, priority: 0 }, { from: node.id, to: completion.id, priority: 0 }] : [{ from: insertion.from, to: node.id, priority: 0 }])],
    }
  }
  const edge = flow.edges[edgeIndex]
  return {
    ...flow,
    nodes: [...flow.nodes, node],
    edges: [
      ...flow.edges.slice(0, edgeIndex),
      { ...edge, to: node.id },
      { from: node.id, to: edge.to, priority: 0 },
      ...flow.edges.slice(edgeIndex + 1),
    ],
  }
}

export function getFlowIssues(flow: Flow | undefined, pages: any[], registry: any[] = []): FlowIssue[] {
  if (!flow) return []
  const issues: FlowIssue[] = []
  const nodeById = new Map(flow.nodes.map((node) => [node.id, node]))
  const variables = flowVariables(pages, registry)
  const variableByKey = new Map(variables.map((variable) => [`${variable.source}:${variable.key}`, variable]))
  if (flow.version !== 1 || !flow.entry || !nodeById.has(flow.entry)) issues.push({ code: 'structure', message: 'The flow entry is missing.' })
  if (nodeById.size !== flow.nodes.length) issues.push({ code: 'structure', message: 'Two flow blocks have the same ID.' })
  const completeNodes = flow.nodes.filter((node) => node.type === 'complete')
  if (completeNodes.length !== 1) issues.push({ code: 'structure', message: 'The flow needs one unique finish block.' })
  flow.edges.forEach((edge) => {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) issues.push({ code: 'structure', nodeId: edge.from, message: 'A connection points to a missing block.' })
  })
  const reachable = reachableNodeIds(flow)
  flow.nodes.forEach((node) => {
    if (!reachable.has(node.id)) issues.push({ code: 'structure', nodeId: node.id, message: 'This block is not connected to the flow.' })
    if (node.type !== 'complete' && outgoing(flow, node.id).length === 0) issues.push({ code: 'loose_end', nodeId: node.id, message: 'This stack needs a connection.' })
    if (node.type === 'join' && (incoming(flow, node.id).length < 2 || outgoing(flow, node.id).length !== 1)) issues.push({ code: 'structure', nodeId: node.id, message: 'This join needs at least two inputs and one continuation.' })
  })
  pages.filter((page) => page.required !== false).forEach((page) => {
    if (!flow.nodes.some((node) => node.page_uuid === page.page_uuid)) issues.push({ code: 'structure', message: `Required page “${page.title || 'Untitled page'}” is not in the flow.` })
  })
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string) => {
    if (visiting.has(id)) {
      issues.push({ code: 'structure', nodeId: id, message: 'Flows cannot loop back to an earlier block.' })
      return
    }
    if (visited.has(id)) return
    visiting.add(id)
    outgoing(flow, id).forEach((edge) => visit(edge.to))
    visiting.delete(id)
    visited.add(id)
  }
  visit(flow.entry)
  flow.nodes.forEach((node) => {
    const branches = outgoing(flow, node.id)
    if (branches.length < 2) return
    const defaults = branches.filter((edge) => !edge.condition)
    if (defaults.length !== 1) issues.push({ code: 'invalid_rule', nodeId: node.id, message: 'A split needs exactly one default path.' })
    const priorities = new Set<number>()
    const signatures = new Set<string>()
    branches.forEach((edge) => {
      if (priorities.has(edge.priority)) issues.push({ code: 'invalid_rule', nodeId: node.id, message: 'Two paths have the same priority.' })
      priorities.add(edge.priority)
      if (!edge.condition) return
      const condition = edge.condition || {}
      const key = String(condition.left?.key || '')
      if (!key || !condition.op || (condition.op !== 'exists' && (condition.right === '' || condition.right == null))) {
        issues.push({ code: 'invalid_rule', nodeId: node.id, message: 'Finish configuring this rule.' })
      }
      const signature = JSON.stringify([condition.op, key, condition.right])
      if (signatures.has(signature)) issues.push({ code: 'duplicate_rule', nodeId: node.id, message: 'Two paths use the same rule.' })
      signatures.add(signature)
      const source = variableByKey.get(`${condition.left?.source || 'answer'}:${key}`)
      if (source && node.id !== `page:${source.pageUuid}` && canReach(flow, node.id, `page:${source.pageUuid}`)) {
        issues.push({
          code: 'question_after_split',
          nodeId: node.id,
          sourcePageUuid: source.pageUuid,
          message: `“${source.label}” is answered after this split.`,
        })
      }
    })
  })
  return issues.filter((issue, index) => issues.findIndex((candidate) => candidate.code === issue.code && candidate.nodeId === issue.nodeId && candidate.message === issue.message) === index)
}

function defaultCondition(variable?: FlowVariable) {
  const op = variable?.valueType === 'number' ? 'lt' : ['option', 'multiple_choice'].includes(variable?.valueType || '') ? 'contains' : variable?.valueType === 'image' ? 'exists' : 'eq'
  return { op, left: { source: variable?.source || 'answer', key: variable?.key || '' }, ...(op === 'exists' ? {} : { right: '' }) }
}

export function collectPath(flow: Flow, startId: string, entryEdge?: FlowEdge): PathModel {
  const nodeById = new Map(flow.nodes.map((node) => [node.id, node]))
  const nodes: FlowNode[] = []
  const seen = new Set<string>()
  let current = startId
  let previousEdge: FlowEdge | undefined
  if (entryEdge && incoming(flow, startId).length > 1) {
    const canonical = [...incoming(flow, startId)].sort((a, b) => Number(Boolean(a.merge)) - Number(Boolean(b.merge)) || edgeKey(a).localeCompare(edgeKey(b)))[0]
    if (!sameEdge(entryEdge, canonical)) return { nodes, terminal: 'connection', terminalId: startId, terminalEdge: entryEdge }
  }
  while (current && !seen.has(current)) {
    seen.add(current)
    const node = nodeById.get(current)
    if (!node) return { nodes, terminal: 'loose', terminalId: previousEdge?.from }
    if (node.type === 'complete') return { nodes, terminal: 'complete', terminalId: node.id, terminalEdge: previousEdge || entryEdge }
    if (node.type === 'split') return { nodes, decisionId: node.id, terminal: 'connection', terminalId: node.id, terminalEdge: previousEdge }
    if (node.type === 'join') return { nodes, joinId: node.id, terminal: 'connection', terminalId: node.id, terminalEdge: previousEdge || entryEdge }
    if (nodes.length > 0 && incoming(flow, node.id).length > 1) {
      return { nodes, terminal: 'connection', terminalId: node.id, terminalEdge: previousEdge }
    }
    nodes.push(node)
    const edges = outgoing(flow, node.id)
    if (!edges.length) return { nodes, terminal: 'loose', terminalId: node.id }
    previousEdge = edges[0]
    current = previousEdge.to
  }
  return { nodes, terminal: 'loose', terminalId: nodes.at(-1)?.id }
}

function reachableDistances(flow: Flow, startId: string) {
  const distances = new Map<string, number>([[startId, 0]])
  const queue = [startId]
  while (queue.length) {
    const current = queue.shift()!
    const distance = distances.get(current)!
    outgoing(flow, current).forEach((edge) => {
      if (distances.has(edge.to)) return
      distances.set(edge.to, distance + 1)
      queue.push(edge.to)
    })
  }
  return distances
}

export function nearestCommonJoin(flow: Flow, edges: FlowEdge[]) {
  if (edges.length < 2) return undefined
  const distances = edges.map((edge) => reachableDistances(flow, edge.to))
  return flow.nodes
    .filter((node) => node.type === 'join' && distances.every((items) => items.has(node.id)))
    .map((node) => ({ node, max: Math.max(...distances.map((items) => items.get(node.id)!)), total: distances.reduce((sum, items) => sum + items.get(node.id)!, 0) }))
    .sort((left, right) => left.max - right.max || left.total - right.total || left.node.id.localeCompare(right.node.id))[0]?.node.id
}

export function movePage(flow: Flow, nodeId: string, source: StackContext, destination: StackContext, destinationIndex: number): Flow {
  const node = flow.nodes.find((item) => item.id === nodeId)
  if (!node || node.type !== 'page') return flow
  const exits = outgoing(flow, nodeId)
  if (exits.length !== 1) return flow
  const exit = exits[0]
  const parents = incoming(flow, nodeId)
  let edges = flow.edges
    .filter((edge) => edge !== exit)
    .map((edge) => edge.to === nodeId ? { ...edge, to: exit.to } : edge)
  let entry = flow.entry === nodeId ? exit.to : flow.entry
  const detached: Flow = { ...flow, entry, edges }
  const destinationNodes = destination.nodes.map((item) => item.id).filter((id) => id !== nodeId)
  const insertIndex = Math.max(0, Math.min(destinationIndex, destinationNodes.length))
  const nextId = destinationNodes[insertIndex] || destination.decisionId || destination.terminalId
  const previousId = destinationNodes[insertIndex - 1]

  if (previousId) {
    const boundary = edges.find((edge) => edge.from === previousId && edge.to === nextId)
    if (!boundary) return flow
    edges = [
      ...edges.filter((edge) => edge !== boundary),
      { ...boundary, to: nodeId },
      ...(nextId ? [{ from: nodeId, to: nextId, priority: 0 }] : []),
    ]
  } else if (destination.entryEdge) {
    const boundary = findEdge(detached, destination.entryEdge)
    if (!boundary) return flow
    const oldTarget = boundary.to
    edges = [
      ...edges.filter((edge) => edge !== boundary),
      { ...boundary, to: nodeId },
      { from: nodeId, to: oldTarget, priority: 0 },
    ]
  } else {
    const oldTarget = destinationNodes[0] || destination.decisionId || destination.terminalId
    entry = nodeId
    edges = [...edges, ...(oldTarget ? [{ from: nodeId, to: oldTarget, priority: 0 }] : [])]
  }
  return { ...flow, entry, edges }
}

function moveBranch(flow: Flow, splitId: string, sourceIndex: number, destinationIndex: number): Flow {
  const branches = displayBranches(flow, splitId)
  const moved = branches[sourceIndex]
  if (!moved) return flow
  if (sourceIndex === destinationIndex) return flow
  branches.splice(sourceIndex, 1)
  branches.splice(destinationIndex, 0, moved)
  const orders = new Map(branches.map((edge, index) => [edge, index]))
  return { ...flow, edges: flow.edges.map((edge) => orders.has(edge) ? { ...edge, order: orders.get(edge)! } : edge) }
}

function PageCard({ node, page, dragHandleProps, glowing, onSelectPage, connecting }: any) {
  const questionCount = findQuestionBlocks(page || {}).length
  const kind = page?.page_type === 'video' ? 'Video' : questionCount ? 'Question' : 'Info'
  return (
    <button
      type="button"
      data-flow-node-id={node.id}
      data-flow-page-card="true"
      onClick={() => !connecting && page && onSelectPage(page.page_uuid)}
      className={`group flex h-14 w-[280px] items-center gap-3 rounded-lg border bg-white p-2 text-left transition ${glowing ? 'border-amber-400 ring-4 ring-amber-200/70' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
    >
      <span {...dragHandleProps} className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-gray-400 opacity-0 transition hover:bg-gray-100 group-hover:opacity-100 active:cursor-grabbing">
        <GripVertical size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{page?.title || 'Missing page'}</span>
        <span className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
          {page?.page_type === 'video' ? <Video size={12} /> : questionCount ? <ListChecks size={12} /> : <FileText size={12} />}
          {kind}
        </span>
      </span>
    </button>
  )
}

function JunctionMenu({ flow, edge, from, endpoint, stretchHover, alwaysVisible, connectingDraft, onSplit, onAddPage, onStartConnection, onConnectTarget, onComplete }: { flow: Flow; edge?: FlowEdge; from?: string; endpoint?: boolean; stretchHover?: boolean; alwaysVisible?: boolean; connectingDraft?: ConnectionDraft | null; onSplit: (edge: FlowEdge) => void; onAddPage: (edge: FlowEdge | FlowInsertion) => void; onStartConnection?: (draft: ConnectionDraft) => void; onConnectTarget?: (edge: FlowEdge) => void; onComplete?: (draft: ConnectionDraft) => void }) {
  if (!edge && !from) return null
  const eligible = Boolean(connectingDraft && edge && canConnectAtJunction(flow, connectingDraft, edge))
  const junctionSize = endpoint ? 'h-6' : 'h-4'
  const controlPosition = 'top-1/2 -translate-y-1/2'
  if (connectingDraft) {
    return (
      <div className={`group relative flex w-[280px] items-center justify-center ${junctionSize}`} data-flow-junction-source={endpoint ? edge?.from || from : undefined}>
        <div className="absolute inset-y-0 left-1/2 w-px bg-gray-200" />
        {eligible && edge && (
          <button type="button" data-flow-connection-target="true" onClick={() => onConnectTarget?.(edge)} title="Connect here" className={`absolute left-1/2 z-20 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-400 transition hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 ${controlPosition}`}>
            <GitBranch size={12} />
          </button>
        )}
      </div>
    )
  }
  return (
    <div className={`group relative flex w-[280px] items-center justify-center ${junctionSize}`} data-flow-connection-menu="true" data-flow-junction-source={endpoint ? edge?.from || from : undefined}>
      <div className="absolute inset-y-0 left-1/2 w-px bg-gray-200" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" title="Add to flow" className={`absolute left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-400 shadow-sm transition hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 focus:opacity-100 ${controlPosition} ${alwaysVisible || (endpoint && !edge) ? 'opacity-100' : `opacity-0 group-hover:opacity-100 ${stretchHover ? 'group-hover/stack:opacity-100' : ''}`}`}>
            <GitBranch size={12} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          {edge && <DropdownMenuItem onClick={() => onSplit(edge)}><GitBranch size={15} className="mr-2" />Split flow</DropdownMenuItem>}
          {edge && <DropdownMenuItem onClick={() => onAddPage(edge)}><FileText size={15} className="mr-2" />New page</DropdownMenuItem>}
          {!edge && from && <DropdownMenuItem onClick={() => onAddPage({ from })}><FileText size={15} className="mr-2" />New page</DropdownMenuItem>}
          {endpoint && (edge?.from || from) && <DropdownMenuItem onClick={() => onStartConnection?.({ edge, from: edge?.from || from! })}><Link2 size={15} className="mr-2" />Connect</DropdownMenuItem>}
          {endpoint && (edge?.from || from) && <DropdownMenuItem onClick={() => onComplete?.({ edge, from: edge?.from || from! })}><Check size={15} className="mr-2" />Complete activity</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function RuleChip({ edge, variable, onChange, onRemove, dragHandleProps }: { edge: FlowEdge; variable?: FlowVariable; onChange: (patch: Partial<FlowEdge>) => void; onRemove: () => void; dragHandleProps?: any }) {
  if (!edge.condition) return (
    <div data-flow-rule-edge={edgeKey(edge)} className="mb-2 flex h-8 w-[280px] items-center justify-between rounded-full border border-gray-200 bg-gray-50 px-3 text-xs font-bold text-gray-600">
      <span className="flex items-center gap-1"><span {...dragHandleProps} className="flex h-6 w-5 cursor-grab items-center justify-center text-gray-300 hover:text-gray-600 active:cursor-grabbing"><GripVertical size={12} /></span>Default</span>
      <MoreHorizontal size={13} className="text-gray-400" />
    </div>
  )
  const condition = edge.condition
  const operators = variable?.valueType === 'number'
    ? [['lt', '<'], ['lte', '≤'], ['eq', '='], ['gte', '≥'], ['gt', '>']]
    : ['option', 'multiple_choice'].includes(variable?.valueType || '')
      ? [['contains', 'is']]
      : variable?.valueType === 'image'
        ? [['exists', 'exists']]
        : variable?.valueType === 'boolean'
          ? [['eq', 'is']]
          : [['eq', 'is'], ['ne', 'is not'], ['contains', 'contains'], ['exists', 'is set']]
  const setCondition = (patch: any) => onChange({ condition: { ...condition, ...patch } })
  return (
    <div data-flow-rule-edge={edgeKey(edge)} className="mb-2 flex min-h-8 w-[280px] items-center gap-1 rounded-full border border-violet-200 bg-violet-50 py-1 pl-2 pr-1 text-xs text-violet-900">
      <span {...dragHandleProps} className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-violet-300 hover:text-violet-600 active:cursor-grabbing"><GripVertical size={12} /></span>
      {operators.length === 1 ? (
        <span className="px-1 font-bold">{operators[0][1]}</span>
      ) : (
        <select value={condition.op || operators[0][0]} onChange={(event) => setCondition({ op: event.target.value })} className="h-6 rounded-full border-0 bg-transparent px-1 font-bold outline-none">
          {operators.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      )}
      {condition.op !== 'exists' && (variable?.valueType === 'boolean' ? (
        <select value={String(condition.right ?? '')} onChange={(event) => setCondition({ right: event.target.value === 'true' })} className="h-6 min-w-0 flex-1 rounded-full border border-violet-200 bg-white px-2 outline-none">
          <option value="">Choose…</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : variable?.options?.length ? (
        <select value={condition.right ?? ''} onChange={(event) => setCondition({ right: event.target.value })} className="h-6 min-w-0 flex-1 rounded-full border border-violet-200 bg-white px-2 outline-none">
          <option value="">Choose…</option>
          {variable.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : (
        <input type={variable?.valueType === 'number' ? 'number' : 'text'} value={condition.right ?? ''} onChange={(event) => setCondition({ right: variable?.valueType === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value })} placeholder="value" className="h-6 min-w-0 flex-1 rounded-full border border-violet-200 bg-white px-2 outline-none" />
      ))}
      <button type="button" title="Delete path" onClick={onRemove} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-violet-400 hover:bg-white hover:text-red-600"><Trash2 size={12} /></button>
    </div>
  )
}

function JoinMarker({ nodeId }: { nodeId: string }) {
  return (
    <div className="relative h-10 w-[280px]" aria-hidden="true">
      <span data-flow-node-id={nodeId} className="absolute bottom-0 left-1/2 h-px w-px -translate-x-1/2" />
    </div>
  )
}

function splitAtEdge(flow: Flow, edge: FlowEdge, variables: FlowVariable[]): Flow {
  const completion = flow.nodes.find((node) => node.type === 'complete')
  if (!completion) return flow
  const split: FlowNode = { id: createSplitId(flow), type: 'split' }
  const firstVariable = variables.find((variable) => edge.from === `page:${variable.pageUuid}` || !canReach(flow, edge.from, `page:${variable.pageUuid}`)) || variables[0]
  return {
    ...flow,
    nodes: [...flow.nodes, split],
    edges: [
      ...flow.edges.filter((item) => item !== edge),
      { ...edge, to: split.id },
      { from: split.id, to: edge.to, priority: 0 },
      { from: split.id, to: finishEntryTarget(flow, completion.id), priority: 1, condition: defaultCondition(firstVariable) },
    ],
  }
}

function FlowPath({ flow, startId, entryEdge, stackId, pages, variables, issues, glowingPageUuid, setGlowingPageUuid, onChange, onSelectPage, onAddPage, registerStack, connectingDraft, onConnectTarget, onPickUpConnection, learningVariables, onCreateVariableKey, deferJoinContinuation = false, stretch = false, boundaryJoinId }: any) {
  const model = collectPath(flow, startId, entryEdge)
  React.useLayoutEffect(
    () => registerStack(stackId, { ...model, stackId, startId, entryEdge }),
    [entryEdge, flow, model, registerStack, stackId, startId],
  )
  const pageByUuid = new Map(pages.map((page: any) => [page.page_uuid, page]))
  const splitAt = (edge: FlowEdge) => onChange(splitAtEdge(flow, edge, variables))
  const removeBranch = (edge: FlowEdge) => {
    const withoutBranch = { ...flow, edges: flow.edges.filter((item: FlowEdge) => item !== edge) }
    const next = collapseSingleInputJoins(withoutBranch)
    const reachable = reachableNodeIds(next)
    onChange({ ...next, nodes: next.nodes.filter((node: FlowNode) => reachable.has(node.id) || node.type === 'complete') })
  }
  const finalFrom = model.nodes.at(-1)?.id || entryEdge?.from || model.terminalId
  const connectionEdge = model.terminal === 'loose' ? undefined : model.terminalEdge || entryEdge
  const completion = flow.nodes.find((node: FlowNode) => node.type === 'complete')
  const completeActivity = (draft: ConnectionDraft) => {
    if (completion) onChange(connectToFinish(flow, draft, completion.id))
  }
  const endpointMenu = !model.decisionId && model.nodes.length > 0 ? (
    <JunctionMenu flow={flow} edge={connectionEdge} from={finalFrom} endpoint stretchHover={stretch} connectingDraft={connectingDraft} onSplit={splitAt} onAddPage={onAddPage} onStartConnection={onPickUpConnection} onConnectTarget={onConnectTarget} onComplete={completeActivity} />
  ) : null
  const showEmptyJunction = model.nodes.length === 0 && Boolean(entryEdge)
  return (
    <div className={`${model.decisionId ? 'w-max' : 'w-[280px]'} shrink-0 ${stretch ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
      <Droppable droppableId={stackId}>
        {(provided, snapshot) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className={`group/stack w-[280px] rounded-lg transition ${stretch ? 'flex min-h-0 flex-1 flex-col' : ''} ${snapshot.isDraggingOver ? 'bg-violet-50/80 ring-2 ring-violet-200' : ''} ${showEmptyJunction ? 'min-h-6' : ''}`}>
            {model.nodes.map((node, index) => {
              const previous = model.nodes[index - 1]
              const edge = previous ? flow.edges.find((item: FlowEdge) => item.from === previous.id && item.to === node.id) : entryEdge?.to === node.id ? entryEdge : undefined
              return (
                <React.Fragment key={node.id}>
                  {edge && <JunctionMenu flow={flow} edge={edge} connectingDraft={connectingDraft} onSplit={splitAt} onAddPage={onAddPage} onConnectTarget={onConnectTarget} />}
                  <Draggable draggableId={node.id} index={index}>
                    {(dragProvided, dragSnapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        style={{ ...dragProvided.draggableProps.style, zIndex: dragSnapshot.isDragging ? 70 : undefined }}
                        className={dragSnapshot.isDragging ? 'rounded-lg shadow-xl' : 'rounded-lg'}
                      >
                        <PageCard node={node} page={pageByUuid.get(node.page_uuid)} dragHandleProps={dragProvided.dragHandleProps} glowing={node.page_uuid === glowingPageUuid} onSelectPage={onSelectPage} connecting={Boolean(connectingDraft)} />
                      </div>
                    )}
                  </Draggable>
                </React.Fragment>
              )
            })}
            {provided.placeholder}
            {showEmptyJunction && <JunctionMenu flow={flow} edge={entryEdge} alwaysVisible connectingDraft={connectingDraft} onSplit={splitAt} onAddPage={onAddPage} onConnectTarget={onConnectTarget} />}
            {endpointMenu}
            {stretch && !model.decisionId && <div data-flow-persistent-source={finalFrom} className="relative min-h-0 flex-1" aria-hidden="true">{!connectingDraft && model.terminal !== 'complete' && <div className="absolute inset-y-0 left-1/2 w-px bg-gray-200" />}</div>}
          </div>
        )}
      </Droppable>

      {model.decisionId ? (
        <>
          {model.nodes.length > 0 && model.terminalEdge && <JunctionMenu flow={flow} edge={model.terminalEdge} connectingDraft={connectingDraft} onSplit={splitAt} onAddPage={onAddPage} onConnectTarget={onConnectTarget} />}
          <DecisionBlock
            flow={flow}
            nodeId={model.decisionId}
            pages={pages}
            variables={variables}
            issues={issues}
            glowingPageUuid={glowingPageUuid}
            setGlowingPageUuid={setGlowingPageUuid}
            stackId={stackId}
            onChange={onChange}
            onSelectPage={onSelectPage}
            onAddPage={onAddPage}
            onRemoveBranch={removeBranch}
            registerStack={registerStack}
            connectingDraft={connectingDraft}
            onConnectTarget={onConnectTarget}
            onPickUpConnection={onPickUpConnection}
            learningVariables={learningVariables}
            onCreateVariableKey={onCreateVariableKey}
            boundaryJoinId={boundaryJoinId}
          />
        </>
      ) : model.joinId ? (
        <>
          {!deferJoinContinuation && !boundaryJoinId && sameEdge(model.terminalEdge, canonicalJoinInput(flow, model.joinId)) && (
            <>
              <JoinMarker nodeId={model.joinId} />
              {outgoing(flow, model.joinId)[0] && <FlowPath flow={flow} startId={outgoing(flow, model.joinId)[0].to} entryEdge={outgoing(flow, model.joinId)[0]} stackId={`${stackId}/after-${model.joinId}`} pages={pages} variables={variables} issues={issues} setGlowingPageUuid={setGlowingPageUuid} onChange={onChange} onSelectPage={onSelectPage} onAddPage={onAddPage} registerStack={registerStack} connectingDraft={connectingDraft} onConnectTarget={onConnectTarget} onPickUpConnection={onPickUpConnection} learningVariables={learningVariables} onCreateVariableKey={onCreateVariableKey} boundaryJoinId={boundaryJoinId} />}
            </>
          )}
        </>
      ) : null}
    </div>
  )
}

function DecisionBlock({ flow, nodeId, pages, variables, issues, setGlowingPageUuid, stackId, onChange, onSelectPage, onAddPage, onRemoveBranch, registerStack, connectingDraft, onConnectTarget, onPickUpConnection, learningVariables, onCreateVariableKey, boundaryJoinId }: any) {
  const edges = displayBranches(flow, nodeId)
  const branchModels = edges.map((edge: FlowEdge) => collectPath(flow, edge.to, edge))
  const commonJoinId = nearestCommonJoin(flow, edges)
  const ownsCommonJoin = Boolean(commonJoinId && commonJoinId !== boundaryJoinId)
  const sourceCondition = edges.find((edge) => edge.condition)?.condition
  const sourceTarget = sourceCondition?.left?.source === 'answer' ? `answer:${sourceCondition.left.key}` : sourceCondition?.left?.key || ''
  const variable = variables.find((item: FlowVariable) => item.target === sourceTarget)
  const decisionIssues = issues.filter((issue: FlowIssue) => issue.nodeId === nodeId)
  const afterIssue = decisionIssues.find((issue: FlowIssue) => issue.code === 'question_after_split')
  const needsChoiceOperatorMigration = ['option', 'multiple_choice'].includes(variable?.valueType || '') && edges.some((edge: FlowEdge) => edge.condition && edge.condition.op !== 'contains')
  React.useEffect(() => {
    if (!needsChoiceOperatorMigration) return
    onChange({ ...flow, edges: flow.edges.map((edge: FlowEdge) => edge.from === nodeId && edge.condition ? { ...edge, condition: { ...edge.condition, op: 'contains' } } : edge) })
  }, [flow, needsChoiceOperatorMigration, nodeId, onChange])
  const setSource = (target: string) => {
    const nextVariable = variables.find((item: FlowVariable) => item.target === target) || (target ? { target, key: target, path: target, label: target, source: 'variable', valueType: 'text' } as FlowVariable : undefined)
    onChange({ ...flow, edges: flow.edges.map((edge: FlowEdge) => {
      if (edge.from !== nodeId || !edge.condition) return edge
      const condition = defaultCondition(nextVariable)
      if (condition.op !== 'exists') condition.right = edge.condition.right ?? ''
      return { ...edge, condition }
    }) })
  }
  const updateEdge = (target: FlowEdge, patch: Partial<FlowEdge>) => onChange({ ...flow, edges: flow.edges.map((edge: FlowEdge) => edge === target ? { ...edge, ...patch } : edge) })
  const addPath = () => {
    const completion = flow.nodes.find((node: FlowNode) => node.type === 'complete')
    if (!completion) return
    const template = edges.find((edge: FlowEdge) => edge.condition)?.condition
    const priority = Math.max(0, ...edges.map((edge: FlowEdge) => edge.priority)) + 1
    const order = Math.max(-1, ...edges.map((edge: FlowEdge, index: number) => edge.order ?? index)) + 1
    onChange({ ...flow, edges: [...flow.edges, { from: nodeId, to: finishEntryTarget(flow, completion.id), priority, order, condition: template ? structuredClone(template) : defaultCondition(variable) }] })
  }
  return (
    <div className="w-max pt-1">
      <div className={`w-[280px] rounded-xl border bg-white p-2 shadow-sm ${decisionIssues.length ? 'border-amber-300' : 'border-violet-200'}`} data-flow-split-node={nodeId} data-flow-node-id={nodeId}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <VariablePathPicker
              value={sourceTarget}
              variables={variables.map((item: FlowVariable) => ({ key: item.path, path: item.path, target: item.target, label: item.label, value_type: item.valueType }))}
              acceptedTypes={['text', 'number', 'boolean', 'option', 'multiple_choice', 'image']}
              allowCreate={false}
              onBind={setSource}
              onCreateVariableKey={onCreateVariableKey}
            />
          </div>
          {decisionIssues.length > 0 && (
            <span
              title={afterIssue?.message || decisionIssues.map((issue: FlowIssue) => issue.message).join('\n')}
              onMouseEnter={() => afterIssue?.sourcePageUuid && setGlowingPageUuid(afterIssue.sourcePageUuid)}
              onMouseLeave={() => setGlowingPageUuid(null)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"
            >
              <AlertTriangle size={15} />
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><MoreHorizontal size={15} /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuItem onClick={addPath}><Copy size={15} className="mr-2" />Duplicate rule</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="h-8" />
      <Droppable droppableId={`branches:${nodeId}`} direction="horizontal" type={`FLOW_BRANCH:${nodeId}`}>
        {(dropProvided, dropSnapshot) => (
          <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className={`flex items-stretch gap-4 rounded-lg transition ${dropSnapshot.isDraggingOver ? 'bg-violet-50/60 ring-2 ring-violet-100' : ''}`}>
            {edges.map((edge: FlowEdge, index: number) => (
              <Draggable key={edgeKey(edge)} draggableId={`branch:${nodeId}:${edge.priority}`} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} style={{ ...dragProvided.draggableProps.style, zIndex: dragSnapshot.isDragging ? 80 : undefined }} className={`flex min-w-[280px] shrink-0 flex-col self-stretch ${branchModels[index]?.decisionId ? 'w-max' : 'w-[280px]'}`}>
                    <RuleChip edge={edge} variable={variable} dragHandleProps={dragProvided.dragHandleProps} onChange={(patch) => updateEdge(edge, patch)} onRemove={() => onRemoveBranch(edge)} />
                    {!dragSnapshot.isDragging && <FlowPath flow={flow} startId={edge.to} entryEdge={edge} stackId={`${stackId}/branch-${index}-${edge.priority}`} pages={pages} variables={variables} issues={issues} setGlowingPageUuid={setGlowingPageUuid} onChange={onChange} onSelectPage={onSelectPage} onAddPage={onAddPage} registerStack={registerStack} connectingDraft={connectingDraft} onConnectTarget={onConnectTarget} onPickUpConnection={onPickUpConnection} learningVariables={learningVariables} onCreateVariableKey={onCreateVariableKey} deferJoinContinuation={Boolean(commonJoinId)} stretch boundaryJoinId={commonJoinId || boundaryJoinId} />}
                  </div>
                )}
              </Draggable>
            ))}
            {dropProvided.placeholder}
            <button type="button" onClick={addPath} title="Add path" className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-violet-300 bg-white text-violet-600 hover:bg-violet-50"><Plus size={14} /></button>
          </div>
        )}
      </Droppable>
      {commonJoinId && ownsCommonJoin && (
        <div className="w-[280px]">
          <JoinMarker nodeId={commonJoinId} />
          {outgoing(flow, commonJoinId)[0] && <FlowPath flow={flow} startId={outgoing(flow, commonJoinId)[0].to} entryEdge={outgoing(flow, commonJoinId)[0]} stackId={`${stackId}/after-${commonJoinId}`} pages={pages} variables={variables} issues={issues} setGlowingPageUuid={setGlowingPageUuid} onChange={onChange} onSelectPage={onSelectPage} onAddPage={onAddPage} registerStack={registerStack} connectingDraft={connectingDraft} onConnectTarget={onConnectTarget} onPickUpConnection={onPickUpConnection} learningVariables={learningVariables} onCreateVariableKey={onCreateVariableKey} boundaryJoinId={boundaryJoinId} />}
        </div>
      )}
    </div>
  )
}

function roundedOrthogonalPath(startX: number, startY: number, endX: number, endY: number) {
  if (Math.abs(endX - startX) < 1) return `M ${startX} ${startY} V ${endY}`
  const routeY = endY > startY ? startY + (endY - startY) / 2 : startY + 32
  const horizontalDirection = endX > startX ? 1 : -1
  const firstVerticalDirection = routeY > startY ? 1 : -1
  const secondVerticalDirection = endY > routeY ? 1 : -1
  const radius = Math.max(0, Math.min(10, Math.abs(routeY - startY) / 2, Math.abs(endX - startX) / 2, Math.abs(endY - routeY) / 2))
  if (!radius) return `M ${startX} ${startY} V ${routeY} H ${endX} V ${endY}`
  return `M ${startX} ${startY} V ${routeY - firstVerticalDirection * radius} Q ${startX} ${routeY} ${startX + horizontalDirection * radius} ${routeY} H ${endX - horizontalDirection * radius} Q ${endX} ${routeY} ${endX} ${routeY + secondVerticalDirection * radius} V ${endY}`
}

function connectorPath(source: DOMRect, target: DOMRect, parent: DOMRect) {
  const startX = source.left - parent.left + source.width / 2
  const startY = source.bottom - parent.top
  const endX = target.left - parent.left + target.width / 2
  const endY = target.top - parent.top
  return roundedOrthogonalPath(startX, startY, endX, endY)
}

function connectorPathToPoint(source: DOMRect, point: Point, parent: DOMRect) {
  const startX = source.left - parent.left + source.width / 2
  const startY = source.bottom - parent.top
  return roundedOrthogonalPath(startX, startY, point.x, point.y)
}

function ConnectorOverlay({ containerRef, flow, connectingDraft, pointer }: { containerRef: React.RefObject<HTMLDivElement | null>; flow: Flow; connectingDraft: ConnectionDraft | null; pointer: Point | null }) {
  const [layout, setLayout] = React.useState<{ connectors: Connector[]; width: number; height: number }>({ connectors: [], width: 1, height: 1 })
  const layoutSignature = React.useRef('')
  React.useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    let frame = 0
    let settlingFrames = 0
    const measure = () => {
      frame = 0
      const parent = container.getBoundingClientRect()
      const nodes = new Map<string, HTMLElement>()
      container.querySelectorAll<HTMLElement>('[data-flow-node-id]').forEach((element) => nodes.set(element.dataset.flowNodeId || '', element))
      const junctionSources = new Map<string, HTMLElement>()
      container.querySelectorAll<HTMLElement>('[data-flow-junction-source]').forEach((element) => junctionSources.set(element.dataset.flowJunctionSource || '', element))
      const persistentSources = new Map<string, HTMLElement>()
      container.querySelectorAll<HTMLElement>('[data-flow-persistent-source]').forEach((element) => persistentSources.set(element.dataset.flowPersistentSource || '', element))
      const ruleChips = new Map<string, HTMLElement>()
      container.querySelectorAll<HTMLElement>('[data-flow-rule-edge]').forEach((element) => ruleChips.set(element.dataset.flowRuleEdge || '', element))
      const next: Connector[] = []
      container.querySelectorAll<HTMLElement>('[data-flow-split-node]').forEach((split) => {
        const nodeId = split.dataset.flowSplitNode || ''
        displayBranches(flow, nodeId).forEach((edge) => {
          const chip = ruleChips.get(edgeKey(edge))
          if (chip) next.push({ id: `split-${edgeKey(edge)}`, path: connectorPath(split.getBoundingClientRect(), chip.getBoundingClientRect(), parent), tone: 'split' })
        })
      })
      flow.edges.forEach((edge) => {
        if (connectingDraft?.edge && sameEdge(edge, connectingDraft.edge)) return
        const sourceNode = flow.nodes.find((node) => node.id === edge.from)
        const targetNode = flow.nodes.find((node) => node.id === edge.to)
        if (targetNode?.type !== 'join' && targetNode?.type !== 'complete' && sourceNode?.type !== 'join') return
        const source = sourceNode?.type === 'split' ? ruleChips.get(edgeKey(edge)) : persistentSources.get(edge.from) || junctionSources.get(edge.from) || nodes.get(edge.from)
        const target = nodes.get(edge.to)
        if (source && target) next.push({ id: `connection-${edgeKey(edge)}`, path: connectorPath(source.getBoundingClientRect(), target.getBoundingClientRect(), parent), tone: 'connection' })
      })
      const liveSource = connectingDraft ? junctionSources.get(connectingDraft.from) || nodes.get(connectingDraft.from) : undefined
      if (liveSource && pointer) next.push({ id: 'live-connection', path: connectorPathToPoint(liveSource.getBoundingClientRect(), pointer, parent), tone: 'split' })
      const width = Math.max(1, Math.ceil(container.scrollWidth), Math.ceil(parent.width))
      const height = Math.max(1, Math.ceil(container.scrollHeight), Math.ceil(parent.height))
      const signature = JSON.stringify([width, height, next.map((connector) => [connector.id, connector.path, connector.tone])])
      if (signature !== layoutSignature.current) {
        layoutSignature.current = signature
        setLayout({ connectors: next, width, height })
      }
      if (settlingFrames < 2) {
        settlingFrames += 1
        frame = window.requestAnimationFrame(measure)
      }
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure)
    }
    measure()
    const observer = new ResizeObserver(schedule)
    observer.observe(container)
    container.querySelectorAll<HTMLElement>('[data-flow-node-id], [data-flow-rule-edge], [data-flow-junction-source], [data-flow-persistent-source]').forEach((element) => observer.observe(element))
    const mutationObserver = new MutationObserver((records) => {
      if (records.every((record) => record.target instanceof Element && record.target.closest('[data-flow-connectors="true"]'))) return
      schedule()
    })
    mutationObserver.observe(container, { attributes: true, attributeFilter: ['class', 'style'], childList: true, subtree: true })
    document.fonts?.ready.then(schedule)
    const intersectionObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) schedule()
    })
    intersectionObserver.observe(container)
    const delayedMeasures = [50, 150, 400, 1000, 2000].map((delay) => window.setTimeout(schedule, delay))
    const measurementInterval = window.setInterval(schedule, 750)
    window.addEventListener('resize', schedule)
    window.addEventListener('pageshow', schedule)
    document.addEventListener('visibilitychange', schedule)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      observer.disconnect()
      intersectionObserver.disconnect()
      mutationObserver.disconnect()
      delayedMeasures.forEach((timer) => window.clearTimeout(timer))
      window.clearInterval(measurementInterval)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('pageshow', schedule)
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [connectingDraft, containerRef, flow, pointer])
  return (
    <svg data-flow-connectors="true" data-flow-connector-count={layout.connectors.length} width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} className="pointer-events-none absolute left-0 top-0 z-[1] overflow-visible" aria-hidden="true">
      {layout.connectors.map((connector) => <path key={connector.id} d={connector.path} fill="none" stroke={connector.tone === 'split' ? '#8b5cf6' : '#cbd5e1'} strokeDasharray={connector.id === 'live-connection' ? '7 5' : undefined} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
    </svg>
  )
}

export default function VisualFlowEditor({ flow, pages, learningVariables = [], issues: providedIssues, onChange, onSelectPage, onAddPage, onCreateVariableKey }: {
  flow: Flow
  pages: any[]
  learningVariables?: any[]
  issues?: FlowIssue[]
  onChange: (flow: Flow) => void
  onSelectPage: (pageUuid: string) => void
  onAddPage: (insertion: FlowInsertion) => void
  onCreateVariableKey: (key: string, valueType?: string) => Promise<any>
}) {
  const variables = React.useMemo(() => flowVariables(pages, learningVariables), [learningVariables, pages])
  const issues = providedIssues || getFlowIssues(flow, pages, learningVariables)
  const [glowingPageUuid, setGlowingPageUuid] = React.useState<string | null>(null)
  const [connectingDraft, setConnectingDraft] = React.useState<ConnectionDraft | null>(null)
  const [pointer, setPointer] = React.useState<Point | null>(null)
  const [connectorMountReady, setConnectorMountReady] = React.useState(false)
  const displayFlow = React.useMemo(() => connectingDraft ? detachConnection(flow, connectingDraft).flow : flow, [connectingDraft, flow])
  const completion = flow.nodes.find((node) => node.type === 'complete')
  const contentRef = React.useRef<HTMLDivElement | null>(null)
  const stackContextsRef = React.useRef<Map<string, StackContext>>(new Map())
  React.useLayoutEffect(() => {
    let secondFrame = 0
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setConnectorMountReady(true))
    })
    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame) window.cancelAnimationFrame(secondFrame)
    }
  }, [])
  const registerStack = React.useCallback((stackId: string, context: StackContext) => {
    stackContextsRef.current.set(stackId, context)
    return () => {
      if (stackContextsRef.current.get(stackId) === context) stackContextsRef.current.delete(stackId)
    }
  }, [])
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return
    if (result.type.startsWith('FLOW_BRANCH:')) {
      if (result.source.droppableId !== result.destination.droppableId) return
      const splitId = result.source.droppableId.replace(/^branches:/, '')
      onChange(moveBranch(flow, splitId, result.source.index, result.destination.index))
      return
    }
    const source = stackContextsRef.current.get(result.source.droppableId)
    const destination = stackContextsRef.current.get(result.destination.droppableId)
    if (!source || !destination) return
    if (result.source.droppableId === result.destination.droppableId && result.source.index === result.destination.index) return
    onChange(movePage(flow, result.draggableId, source, destination, result.destination.index))
  }
  const startConnection = (draft: ConnectionDraft) => {
    setConnectingDraft(draft)
    setPointer(null)
  }
  const connectTarget = (targetEdge: FlowEdge) => {
    if (!connectingDraft) return
    onChange(connectAtJunction(flow, connectingDraft, targetEdge))
    setConnectingDraft(null)
    setPointer(null)
  }
  const finishConnection = () => {
    if (!connectingDraft || !completion) return
    onChange(connectToFinish(flow, connectingDraft, completion.id))
    setConnectingDraft(null)
    setPointer(null)
  }
  React.useEffect(() => {
    if (!connectingDraft) return
    const cancel = (event: PointerEvent) => {
      const element = event.target instanceof Element ? event.target : null
      if (element?.closest('[data-flow-connection-target="true"], [data-flow-finish-target="true"]')) return
      setConnectingDraft(null)
      setPointer(null)
    }
    const cancelWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConnectingDraft(null)
        setPointer(null)
      }
    }
    document.addEventListener('pointerdown', cancel, true)
    document.addEventListener('keydown', cancelWithEscape)
    return () => {
      document.removeEventListener('pointerdown', cancel, true)
      document.removeEventListener('keydown', cancelWithEscape)
    }
  }, [connectingDraft])
  const trackPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!connectingDraft || !contentRef.current) return
    const rect = contentRef.current.getBoundingClientRect()
    setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top })
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gray-50">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
        <div>
          <div className="flex items-center gap-2"><GitBranch size={17} /><h2 className="text-sm font-bold">Flow</h2></div>
          <p className="mt-0.5 text-xs text-gray-500">Use the last page’s add menu to connect, then click a visible between-page junction. Click elsewhere to cancel.</p>
        </div>
        {issues.length > 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"><AlertTriangle size={14} />{issues.length} {issues.length === 1 ? 'warning' : 'warnings'} · flow not saved</div>
        ) : (
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-700"><Check size={14} />Flow valid</div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-8" onPointerMove={trackPointer}>
        <DragDropContext onDragEnd={onDragEnd}>
          <div ref={contentRef} className="relative isolate w-max min-w-full pb-12">
            <div className="relative z-10 w-max">
              <FlowPath flow={displayFlow} startId={displayFlow.entry} stackId="root" pages={pages} variables={variables} issues={issues} glowingPageUuid={glowingPageUuid} setGlowingPageUuid={setGlowingPageUuid} onChange={onChange} onSelectPage={onSelectPage} onAddPage={onAddPage} registerStack={registerStack} connectingDraft={connectingDraft} onConnectTarget={connectTarget} onPickUpConnection={startConnection} learningVariables={learningVariables} onCreateVariableKey={onCreateVariableKey} />
              {completion && (
                <button type="button" disabled={!connectingDraft} onClick={finishConnection} data-flow-node-id={completion.id} data-flow-finish-target="true" className={`mt-10 flex w-[280px] items-center gap-3 rounded-lg border p-2 text-left ${connectingDraft ? 'border-gray-950 bg-white ring-4 ring-gray-950/10' : 'border-emerald-200 bg-emerald-50'}`}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-100 text-emerald-700"><Check size={17} /></span>
                  <span><span className="block text-sm font-bold text-emerald-900">Activity complete</span><span className="block text-xs text-emerald-700">{connectingDraft ? 'Connect here' : 'Unique finish block'}</span></span>
                </button>
              )}
            </div>
            {connectorMountReady && <ConnectorOverlay containerRef={contentRef} flow={displayFlow} connectingDraft={connectingDraft} pointer={pointer} />}
          </div>
        </DragDropContext>
      </div>
    </div>
  )
}
