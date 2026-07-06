import React from 'react'
import { ChevronDown, Copy, FileText, GripVertical, ListChecks, Plus, Trash2, Video } from 'lucide-react'
import ReorderableList from '@components/Objects/ReorderableList'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { findQuestionBlock, type LearningPageType } from '@components/Learning/schema'

type PageListPanelProps = {
  pages: any[]
  selectedPage: any
  onSelectPage: (pageUuid: string) => void
  onAddPage: (pageType: LearningPageType) => void
  onDuplicatePage: (page: any) => void
  onRemovePage: (page: any) => void
  onReorderPages: (pages: any[]) => void
}

export function PageListPanel({
  pages,
  selectedPage,
  onSelectPage,
  onAddPage,
  onDuplicatePage,
  onRemovePage,
  onReorderPages,
}: PageListPanelProps) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-100 px-4">
        <div>
          <p className="text-[11px] font-bold uppercase text-gray-500">Pages</p>
          <p className="text-xs text-gray-400">{pages.length} total</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50" title="Add page">
              <Plus size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onAddPage('standard')}>
              <FileText size={16} className="mr-2" />
              Standard page
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddPage('video')}>
              <Video size={16} className="mr-2" />
              Video page
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <ReorderableList
          droppableId="learning-pages"
          items={pages}
          getId={(page: any) => page.page_uuid}
          onReorder={onReorderPages}
          className="space-y-2"
          itemClassName={(_page: any, _index: number, isDragging: boolean) => isDragging ? 'rounded-lg shadow-xl' : 'rounded-lg'}
          renderItem={({ item: page, index, dragHandleProps }) => (
            <button
              type="button"
              onClick={() => onSelectPage(page.page_uuid)}
              className={`group flex w-full items-center gap-3 rounded-lg border p-2 text-left transition ${
                selectedPage?.page_uuid === page.page_uuid
                  ? 'border-[var(--org-primary-color)] bg-[color-mix(in_srgb,var(--org-primary-color)_8%,white)]'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-sm font-bold text-gray-700">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{page.title || 'Untitled page'}</span>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                  {page.page_type === 'video' ? <Video size={12} /> : findQuestionBlock(page) ? <ListChecks size={12} /> : <FileText size={12} />}
                  {page.page_type === 'video' ? 'Video' : findQuestionBlock(page) ? 'Question page' : 'Standard'}
                </span>
              </span>
              <span className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <span {...dragHandleProps} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-gray-100">
                  <GripVertical size={15} />
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <span className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-gray-100">
                      <ChevronDown size={15} />
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(event) => { event.stopPropagation(); onDuplicatePage(page) }}>
                      <Copy size={16} className="mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(event) => { event.stopPropagation(); onRemovePage(page) }} className="text-red-600">
                      <Trash2 size={16} className="mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </button>
          )}
        />
      </div>
      <div className="border-t border-gray-100 p-3">
        <button onClick={() => onAddPage('standard')} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 text-sm font-bold text-gray-600 hover:border-gray-400 hover:bg-gray-50">
          <Plus size={16} />
          Add page
        </button>
      </div>
    </aside>
  )
}
