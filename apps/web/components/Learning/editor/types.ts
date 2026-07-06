export type SaveState = 'saved' | 'saving' | 'dirty' | 'error'
export type EditorViewMode = 'editor' | 'settings'
export type ActivityGradingMode = 'completion' | 'pass_fail'
export type DeviceMode = 'mobile' | 'desktop'
export type Selection = { pageUuid: string; blockId: string | null }
