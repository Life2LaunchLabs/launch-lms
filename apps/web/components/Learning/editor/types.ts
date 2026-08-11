export type SaveState = 'saved' | 'saving' | 'dirty' | 'error'
export type EditorViewMode = 'editor' | 'flow' | 'settings'
export type DeviceMode = 'mobile' | 'desktop'
export type Selection = { pageUuid: string; blockId: string | null }
