import React from 'react'

/**
 * Lays out a standard page's blocks: grouped blocks side by side, and
 * two-column pages split at their column break (on narrow screens the
 * columns stack).
 */
export default function BlockLayout({ blocks, page, renderBlock }: { blocks: any[]; page: any; renderBlock: (block: any) => React.ReactNode }) { // eslint-disable-line no-unused-vars
  const renderStack = (stack: any[]) => stack.map((block: any, index: number) => {
    const group = block.design?.group
    if (!group) return renderBlock(block)
    if (index > 0 && stack[index - 1]?.design?.group === group) return null
    const members = stack.filter((item: any) => item.design?.group === group)
    return <div key={group} className="my-3 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">{members.map(renderBlock)}</div>
  })
  const breakAt = blocks.findIndex((block: any) => block.type === 'column_break')
  const columns = page?.design?.columns === 2 && breakAt >= 0
  const visible = blocks.filter((block: any) => block.type !== 'column_break')

  return (
    <div className="learning-info-block-stack">
      {columns ? (
        <div className="learning-info-reorder-list grid grid-cols-1 gap-6 @3xl:grid-cols-2 @3xl:items-center @3xl:gap-12" data-page-columns="2">
          <div className="flex min-w-0 flex-col gap-4">{renderStack(blocks.slice(0, breakAt))}</div>
          <div className="flex min-w-0 flex-col gap-4">{renderStack(blocks.slice(breakAt + 1).filter((block: any) => block.type !== 'column_break'))}</div>
        </div>
      ) : (
        <div className={`learning-info-reorder-list ${page?.content?.version === 3 ? 'flex flex-col gap-5' : ''}`}>{renderStack(visible)}</div>
      )}
    </div>
  )
}
