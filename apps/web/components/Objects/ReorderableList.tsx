'use client'

/* eslint-disable no-unused-vars */

import React from 'react'
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DraggableProvidedDragHandleProps,
  type DropResult,
} from '@hello-pangea/dnd'

export type ReorderableListRenderItem<T> = {
  item: T
  index: number
  isDragging: boolean
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined
}

type ReorderableListItemClassName<T> = string | ((_item: T, _index: number, _isDragging: boolean) => string)

export function reorderItems<T>(items: T[], startIndex: number, endIndex: number) {
  const next = Array.from(items)
  const [removed] = next.splice(startIndex, 1)
  next.splice(endIndex, 0, removed)
  return next
}

export default function ReorderableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  className,
  itemClassName,
  droppableId,
}: {
  items: T[]
  getId(item: T, index: number): string
  onReorder(items: T[]): void
  renderItem(props: ReorderableListRenderItem<T>): React.ReactNode
  className?: string
  itemClassName?: ReorderableListItemClassName<T>
  droppableId?: string
}) {
  const generatedId = React.useId()

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return
    onReorder(reorderItems(items, result.source.index, result.destination.index))
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId={droppableId || generatedId}>
        {(droppableProvided) => (
          <div ref={droppableProvided.innerRef} {...droppableProvided.droppableProps} className={className}>
            {items.map((item, index) => {
              const id = getId(item, index)
              return (
                <Draggable key={id} draggableId={id} index={index}>
                  {(draggableProvided, draggableSnapshot) => {
                    const isDragging = draggableSnapshot.isDragging
                    const resolvedItemClassName = typeof itemClassName === 'function'
                      ? itemClassName(item, index, isDragging)
                      : itemClassName

                    return (
                      <div
                        ref={draggableProvided.innerRef}
                        {...draggableProvided.draggableProps}
                        style={{
                          ...draggableProvided.draggableProps.style,
                          zIndex: isDragging ? 60 : undefined,
                        }}
                        className={resolvedItemClassName}
                      >
                        {renderItem({
                          item,
                          index,
                          isDragging,
                          dragHandleProps: draggableProvided.dragHandleProps,
                        })}
                      </div>
                    )
                  }}
                </Draggable>
              )
            })}
            {droppableProvided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  )
}
