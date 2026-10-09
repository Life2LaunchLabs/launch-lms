import type { Flow as GeneratedFlow, FlowEdge as GeneratedFlowEdge, FlowNode as GeneratedFlowNode } from '@components/Learning/content.generated'

// The editor's view of the generated API flow types: it always sets a
// priority and edits one comparison per edge.
export type FlowNode = GeneratedFlowNode
export type FlowEdge = Omit<GeneratedFlowEdge, 'priority' | 'condition'> & { priority: number; condition?: any }
export type Flow = Omit<GeneratedFlow, 'version' | 'edges'> & { version: 1; edges: FlowEdge[] }
