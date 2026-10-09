// Generated from apps/api/src/services/learning_content/models.py — do not edit.
// Regenerate: cd apps/api && uv run python cli.py generate-learning-types

export interface AllOf {
  op: "and" | "or"
  conditions: Array<Comparison | AllOf | Negation>
}

export interface BlockDesign {
  width?: number
  align?: "left" | "center" | "right"
  height?: number
  fit?: "contain" | "cover"
  text_color?: string
  shape?: "rounded" | "circle"
  variant?: "primary" | "secondary"
  /** Buttons sharing a group render side by side. */
  group?: string
}

/** Set by the platform on system activities; not editable by admins. */
export interface BlockSystem {
  locked?: boolean
  reason?: string
}

export interface ButtonBlock {
  /** Unique within the page. */
  id: string
  design?: BlockDesign
  system?: BlockSystem
  type: "button"
  content?: ButtonContent
}

/** `continue` completes the page (the flow can route on `<page_uuid>.button`); `revisit` jumps back to an earlier page. */
export interface ButtonContent {
  label?: string
  action?: "continue" | "revisit"
  /** revisit only: an earlier page on the route (uuid or new-page placeholder). */
  revisit_page_uuid?: string
}

export interface ChoiceOption {
  id: string
  text?: string
  category?: string
  [key: string]: any
}

export interface Comparison {
  op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "contains" | "exists"
  left: ConditionOperand
  right?: any
}

export interface ConditionOperand {
  source: "answer" | "variable" | "fact" | "context"
  /** Answer keys start with the page uuid, e.g. `<page>.result.option_ids`, `<page>.result.questions.<block>.inputs.<input>.text` or `<page>.button`. */
  key: string
}

/** Shows a learner's earlier answer or a profile variable in place. */
export interface DisplayBinding {
  source: "answer" | "variable"
  /** Answer path (`<page>.result…`) or variable key. May be empty while drafting. */
  path?: string
  fallback?: string
  fallback_binding?: DisplayBinding
}

/** Optional branching graph. Without it pages run in order. Must be acyclic with exactly one `complete` node; a node with several outgoing edges needs exactly one edge without a condition (the default) and distinct priorities (higher wins). */
export interface Flow {
  version?: 1
  entry: string
  nodes: Array<FlowNode>
  edges: Array<FlowEdge>
}

export interface FlowEdge {
  from: string
  to: string
  priority?: number
  condition?: Comparison | AllOf | Negation
  /** Editor hint: the edge rejoins a branch. */
  merge?: boolean
  /** Editor hint: branch display order. */
  order?: number
}

export interface FlowNode {
  id: string
  type: "page" | "split" | "join" | "complete"
  page_uuid?: string
}

export interface ImageBlock {
  /** Unique within the page. */
  id: string
  design?: BlockDesign
  system?: BlockSystem
  type: "image"
  content?: ImageContent
}

export interface ImageContent {
  src?: string
  alt?: string
  binding?: DisplayBinding
  [key: string]: any
}

export interface Negation {
  op: "not"
  condition: Comparison | AllOf | Negation
}

/** Show different blocks depending on an earlier question's answer. */
export interface PageVariants {
  source?: VariantSource
  /** Keyed by option id, `correct` or `incorrect`. */
  overrides?: Record<string, VariantOverride>
  [key: string]: any
}

export interface PortfolioPreviewBlock {
  /** Unique within the page. */
  id: string
  design?: BlockDesign
  system?: BlockSystem
  type: "portfolio_preview"
  content: PortfolioPreviewContent
}

/** Restricted to trusted system activities. */
export interface PortfolioPreviewContent {
  variant: "timeline_card" | "project_card" | "identity_header" | "traits_panel" | "links_strip" | "portfolio_frame" | "share_panel"
  bindings?: Record<string, DisplayBinding>
}

export interface QuestionBlock {
  /** Unique within the page. */
  id: string
  design?: BlockDesign
  system?: BlockSystem
  type: "question"
  kind: "multiple_choice" | "categorized_multi_select" | "text_input" | "image_upload"
  content?: QuestionContent
  scoring?: QuestionScoring
  completion?: QuestionCompletion
}

/** `min_selections`/`max_selections` for choices; `inputs` keyed by input id for text; `required` for image upload. `variable_bindings` copy answers into learner variables. */
export interface QuestionCompletion {
  required?: boolean
  min_selections?: number
  max_selections?: number
  question_mode?: string
  inputs?: Record<string, Record<string, any>>
  variable_bindings?: Record<string, any>
  [key: string]: any
}

/** Choice kinds use `options` (+ `categories` for categorized selection); `text_input` uses `inputs`; `image_upload` only a label. */
export interface QuestionContent {
  label?: string
  options?: Array<ChoiceOption>
  categories?: Array<Record<string, any>>
  inputs?: Array<TextInputField>
  [key: string]: any
}

/** Choices: `{mode: points, points, score_policy: select_all, correct_option_ids}` or a survey `{mode: off, points: 0}`. Text: `completion | manual | accepted_answers` (+ `accepted_answers`, `rubric`). Image upload: `manual`. */
export interface QuestionScoring {
  mode?: "points" | "off" | "completion" | "manual" | "accepted_answers"
  points?: number
  score_policy?: string
  correct_option_ids?: Array<string>
  accepted_answers?: Array<string>
  rubric?: string
  [key: string]: any
}

/** Standard page content (version 2). */
export interface StandardPageContent {
  version?: 2
  blocks?: Array<TextBlock | ImageBlock | ButtonBlock | QuestionBlock | PortfolioPreviewBlock>
  /** Label for the page's continue action. */
  action_label?: string
  variants?: PageVariants
  [key: string]: any
}

export interface TextBlock {
  /** Unique within the page. */
  id: string
  design?: BlockDesign
  system?: BlockSystem
  type: "text"
  content?: TextContent
}

/** Tiptap/ProseMirror JSON. `nodes` is the list of top-level nodes (paragraph, heading, bulletList, …); inline `displayBinding` nodes insert answers or variables. */
export interface TextContent {
  nodes?: Array<Record<string, any>>
  node?: Record<string, any>
  [key: string]: any
}

export interface TextInputField {
  id: string
  label?: string
  placeholder?: string
  variant?: "short_answer" | "long_answer" | "single_line"
  input_type?: "text" | "number" | "email" | "url" | "tel" | "month" | "select"
  section_id?: string
  width?: "full" | "half"
  height?: number
  [key: string]: any
}

export interface VariantOverride {
  blocks?: Array<TextBlock | ImageBlock | ButtonBlock | QuestionBlock | PortfolioPreviewBlock>
  [key: string]: any
}

export interface VariantSource {
  page_uuid?: string
  block_id?: string
  [key: string]: any
}

export interface VideoPageContent {
  video_url?: string
  heading?: string
  allow_scrubbing?: boolean
  [key: string]: any
}

export type Block = TextBlock | ImageBlock | ButtonBlock | QuestionBlock | PortfolioPreviewBlock
export type Condition = Comparison | AllOf | Negation
