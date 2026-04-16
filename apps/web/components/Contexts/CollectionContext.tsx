'use client'
import { getAPIUrl } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import React, { createContext, useContext, useEffect, useReducer } from 'react'
import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'

export interface Collection {
  id: number
  collection_uuid: string
  name: string
  description: string | null
  public: boolean
  shared: boolean
  thumbnail_image: string | null
  courses: any[]
  creation_date: string
  update_date: string
}

interface CollectionState {
  collection: Collection | null
  isLoading: boolean
  isSaved: boolean
}

type CollectionAction =
  | { type: 'setCollection'; payload: Collection }
  | { type: 'setIsLoaded' }
  | { type: 'setIsSaved' }
  | { type: 'setIsNotSaved' }

export const CollectionContext = createContext<CollectionState | null>(null)
export const CollectionDispatchContext = createContext<React.Dispatch<CollectionAction> | null>(null)

interface CollectionProviderProps {
  children: React.ReactNode
  collectionuuid: string
}

export function CollectionProvider({ children, collectionuuid }: CollectionProviderProps) {
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token

  const fullCollectionUuid = collectionuuid.startsWith('collection_')
    ? collectionuuid
    : `collection_${collectionuuid}`

  const { data: collectionData, error } = useSWR(
    access_token ? `${getAPIUrl()}collections/${fullCollectionUuid}` : null,
    (url) => swrFetcher(url, access_token)
  )

  const initialState: CollectionState = {
    collection: null,
    isLoading: true,
    isSaved: true,
  }

  const [state, dispatch] = useReducer(collectionReducer, initialState)

  useEffect(() => {
    if (collectionData) {
      dispatch({ type: 'setCollection', payload: collectionData })
      dispatch({ type: 'setIsLoaded' })
    }
  }, [collectionData])

  if (error) return <div>Failed to load collection</div>
  if (!collectionData) return null

  return (
    <CollectionContext.Provider value={state}>
      <CollectionDispatchContext.Provider value={dispatch}>
        {children}
      </CollectionDispatchContext.Provider>
    </CollectionContext.Provider>
  )
}

export function useCollection() {
  return useContext(CollectionContext)
}

export function useCollectionDispatch() {
  return useContext(CollectionDispatchContext)
}

function collectionReducer(state: CollectionState, action: CollectionAction): CollectionState {
  switch (action.type) {
    case 'setCollection':
      return { ...state, collection: action.payload }
    case 'setIsLoaded':
      return { ...state, isLoading: false }
    case 'setIsSaved':
      return { ...state, isSaved: true }
    case 'setIsNotSaved':
      return { ...state, isSaved: false }
    default:
      throw new Error(`Unhandled action type`)
  }
}
