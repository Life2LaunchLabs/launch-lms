// Generated from apps/api/src/services/learning_content/models.py — do not edit.
// Regenerate: cd apps/api && uv run python cli.py generate-learning-types

/** How the player presents an activity (`settings.design`). */
export interface ActivityDesign {
  /** `line` (the default; `bar` is its older name), `segments` (one per page), `dots`, `count` ("3 of 8") or `none`. */
  progress?: "bar" | "line" | "segments" | "dots" | "count" | "none"
  /** Learners can go back a page; on by default. */
  allow_back?: boolean
  /** Reopening continues where they left off; on by default. */
  resume?: boolean
  /** How pages come in; `slide` by default. */
  transition?: "slide" | "fade" | "rise" | "none"
  background?: Record<string, any>
  exit?: Record<string, any>
  /** An ending screen with a message, the score and a celebration. */
  ending?: ActivityEnding
  [key: string]: any
}

/** The screen after the last page. Without it the activity closes straight away. */
export interface ActivityEnding {
  /** Shown when they finish (or pass a graded activity). */
  title?: string
  message?: string
  /** Graded activities they haven't passed yet. */
  not_yet_title?: string
  not_yet_message?: string
  /** Show the score on graded activities; on by default. */
  show_score?: boolean
  /** Confetti when they finish or pass; on by default. */
  celebrate?: boolean
  [key: string]: any
}

/** How an activity is finished (`settings.grading`). */
export interface ActivityGrading {
  /** `complete`: done once answered; `pass` (default): reach the pass mark when questions have points. */
  finish?: "complete" | "pass"
  /** The pass mark; 70 by default. */
  minimum_score_percent?: number
  /** `try_again` (default) starts over, `redo_missed` reopens the pages they missed, `staff_decide` waits in the review queue. */
  if_not_passed?: "try_again" | "redo_missed" | "staff_decide"
  /** Show the score at the end; on by default. */
  show_score?: boolean
  success_message?: string
  failure_message?: string
  [key: string]: any
}

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
  /** How the block enters; blocks rise in, staggered in page order, by default. */
  entrance?: "rise" | "fade" | "none"
  /** Continue buttons only: `footer` draws the button beside Continue as a secondary action. */
  placement?: "inline" | "footer"
  /** Choice questions only: how options are drawn. Cards show each option's `icon` and `description`. */
  style?: "list" | "pills" | "scale" | "cards"
  /** Version 3: how the block comes in. Replaces `entrance`; blocks rise in, staggered in page order, by default. */
  motion?: "rise" | "fade" | "pop" | "slide_left" | "slide_right" | "zoom" | "none"
  /** Version 3: seconds to wait before the block comes in. */
  motion_delay?: number
}

/** Set by the platform on system activities; not editable by admins. */
export interface BlockSystem {
  locked?: boolean
  reason?: string
}

/** One way through a branch. `rule` empty: the Default path, taken when no other rule matches. */
export interface BranchPath {
  id: string
  label?: string
  rule?: Comparison | AllOf | Negation
  /** Page uuids, in order. No branches inside a path. */
  pages?: Array<string>
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

/** A few words shown together, from `start` (seconds) until the next chunk or `end`. */
export interface CaptionChunk {
  id: string
  start: number
  end?: number
  words?: string
  /** The words as Tiptap JSON when some of them are styled. */
  text?: Record<string, any>
}

export interface CaptionPosition {
  /** Percent from the left. */
  x?: number
  /** Percent from the top. */
  y?: number
}

/** Version 3: cards the learner swipes or taps through. */
export interface CardDeckBlock {
  /** Unique within the page. */
  id: string
  design?: BlockDesign
  system?: BlockSystem
  type: "card_deck"
  content: CardDeckContent
}

export interface CardDeckContent {
  cards: Array<DeckCard>
}

/** Bars that grow in, such as steps done each week. */
export interface ChartBlock {
  /** Unique within the page. */
  id: string
  design?: BlockDesign
  system?: BlockSystem
  type: "chart"
  content: ChartContent
}

export interface ChartContent {
  kind?: "bars"
  title?: string
  values?: Array<number>
  labels?: Array<string>
  /** Read the values from a list variable instead, such as `goal.stats.weekly`. */
  binding?: DisplayBinding
}

export interface ChoiceOption {
  id: string
  text?: string
  category?: string
  /** An emoji or short mark shown on pills, scale steps and cards. */
  icon?: string
  /** A line under the option on cards. */
  description?: string
  [key: string]: any
}

/** Version 3: on two-column pages, blocks after it go in the second column. */
export interface ColumnBreakBlock {
  /** Unique within the page. */
  id: string
  design?: BlockDesign
  system?: BlockSystem
  type: "column_break"
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

export interface DeckCard {
  id: string
  title?: string
  body?: string
  image?: string
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

/** Version 3: the page's one heading. Every version 3 page has exactly one. */
export interface HeadingBlock {
  /** Unique within the page. */
  id: string
  design?: BlockDesign
  system?: BlockSystem
  type: "heading"
  content: HeadingContent
}

export interface HeadingContent {
  text?: string
  size?: "s" | "m" | "l" | "xl"
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

/** A medal that lands on the page. */
export interface MedalBlock {
  /** Unique within the page. */
  id: string
  design?: BlockDesign
  system?: BlockSystem
  type: "medal"
  content: MedalContent
}

export interface MedalContent {
  title?: string
  subtitle?: string
  /** An image for the medal's face, such as a badge's; a star when empty. */
  image?: string
}

export interface Negation {
  op: "not"
  condition: Comparison | AllOf | Negation
}

/** Version 3: one big number with a label, such as "3 in 4 teens". */
export interface NumberBlock {
  /** Unique within the page. */
  id: string
  design?: BlockDesign
  system?: BlockSystem
  type: "number"
  content: NumberContent
}

export interface NumberContent {
  /** Counts up as the page opens when it is a number. */
  value?: number | string
  prefix?: string
  suffix?: string
  label?: string
  /** Read the value from a variable or an earlier answer instead. */
  binding?: DisplayBinding
}

/** Where a choice question's options come from when they aren't typed in. */
export interface OptionsSource {
  /** `goal_templates`: plan templates the learner can start from, ranked by the goal's wording, with a search for more. The run must belong to a goal. */
  kind: "goal_templates"
  /** How many options show before "See more". */
  limit?: number
}

/** A page's look (the page's `design`). */
export interface PageDesign {
  /** `color`, `gradient_to`, `image`, `scene`, `intensity`. */
  background?: Record<string, any>
  /** Where the blocks sit; middle by default. */
  valign?: "top" | "middle" | "bottom"
  /** Two columns on wide screens, split at the column break. */
  columns?: 1 | 2
  /** How the page comes in; the activity's when empty. */
  transition?: "slide" | "fade" | "rise" | "none"
  celebrate?: boolean
  auto_advance_ms?: number
  [key: string]: any
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
  /** Options come from this source instead of `options`; bind the choice with `variable_bindings.selected`. */
  options_source?: OptionsSource
  categories?: Array<Record<string, any>>
  inputs?: Array<TextInputField>
  [key: string]: any
}

/** What a learner sees after answering a graded question. */
export interface QuestionFeedback {
  correct?: string
  incorrect?: string
}

/** Choices: `{mode: points, points, score_policy: select_all, correct_option_ids}` or a survey `{mode: off, points: 0}`. Text: `completion | manual | accepted_answers` (+ `accepted_answers`, `rubric`). Image upload: `manual`. */
export interface QuestionScoring {
  mode?: "points" | "off" | "completion" | "manual" | "accepted_answers"
  points?: number
  score_policy?: string
  correct_option_ids?: Array<string>
  accepted_answers?: Array<string>
  /** Accepted answers: the whole answer (default) or any of the words. */
  match?: "exact" | "contains"
  rubric?: string
  /** Several right choices: a share of the points per right pick (default) or all or nothing. */
  partial_credit?: boolean
  /** Shown to the learner after they answer. */
  feedback?: QuestionFeedback
  [key: string]: any
}

/** A pull quote that fades in line by line. */
export interface QuoteBlock {
  /** Unique within the page. */
  id: string
  design?: BlockDesign
  system?: BlockSystem
  type: "quote"
  content: QuoteContent
}

export interface QuoteContent {
  text?: string
  attribution?: string
  /** Read the quote from an earlier answer or a variable, such as `goal.why`. */
  binding?: DisplayBinding
}

/** The order of an activity's pages: a stack of pages and branches, one level deep. At a branch the first path whose rule matches is taken, else the Default path; then the activity carries on after the branch. Replaces `flow` (older activities are converted when they are read). */
export interface Sequence {
  version?: 1
  items?: Array<SequencePage | SequenceBranch>
}

export interface SequenceBranch {
  type: "branch"
  id: string
  label?: string
  /** Editor hint: what the paths' rules look at. */
  on?: ConditionOperand
  paths: Array<BranchPath>
}

export interface SequencePage {
  type: "page"
  page_uuid: string
}

/** Standard page content. Version 2 is the older shape; version 3 adds the page heading (exactly one) and new blocks, with layout in the page's `design` (`PageDesign`). In version 3 buttons only continue and pages have no variants: branches do that job. */
export interface StandardPageContent {
  version?: 2 | 3
  blocks?: Array<TextBlock | ImageBlock | ButtonBlock | QuestionBlock | PortfolioPreviewBlock | StatBlock | QuoteBlock | ChartBlock | MedalBlock | HeadingBlock | NumberBlock | CardDeckBlock | ColumnBreakBlock>
  /** Label for the page's continue action. */
  action_label?: string
  variants?: PageVariants
  [key: string]: any
}

/** A row of up to four numbers that count up as the page opens. */
export interface StatBlock {
  /** Unique within the page. */
  id: string
  design?: BlockDesign
  system?: BlockSystem
  type: "stat"
  content: StatContent
}

export interface StatContent {
  items: Array<StatItem>
}

export interface StatItem {
  /** The number to show; counts up when it is a number. */
  value?: number | string
  label?: string
  /** Read the value from a variable instead, such as `goal.stats.steps_done`. */
  binding?: DisplayBinding
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
  blocks?: Array<TextBlock | ImageBlock | ButtonBlock | QuestionBlock | PortfolioPreviewBlock | StatBlock | QuoteBlock | ChartBlock | MedalBlock | HeadingBlock | NumberBlock | CardDeckBlock | ColumnBreakBlock>
  [key: string]: any
}

export interface VariantSource {
  page_uuid?: string
  block_id?: string
  [key: string]: any
}

export interface VideoCaptions {
  chunks?: Array<CaptionChunk>
  /** Font, size, colour and backdrop shared by every chunk. */
  look?: Record<string, any>
  phone?: CaptionPosition
  desktop?: CaptionPosition
  language?: string
  source?: "generated" | "edited" | "manual"
}

export interface VideoPageContent {
  video_url?: string
  heading?: string
  allow_scrubbing?: boolean
  captions?: VideoCaptions
  [key: string]: any
}

export type Block = TextBlock | ImageBlock | ButtonBlock | QuestionBlock | PortfolioPreviewBlock
/** Every block type, version 3's included. */
export type AnyBlock = Block | StatBlock | QuoteBlock | ChartBlock | MedalBlock | HeadingBlock | NumberBlock | CardDeckBlock | ColumnBreakBlock
export type SequenceItem = SequencePage | SequenceBranch
export type Condition = Comparison | AllOf | Negation
