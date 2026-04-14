import { NodeViewWrapper } from '@tiptap/react'
import React, { useState } from 'react'
import { RotateCcw, ArrowRight, CheckCircle, GitBranch } from 'lucide-react'
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCourse } from '@components/Contexts/CourseContext'
import ScenariosModal from './ScenariosModal'
import { getActivityBlockMediaDirectory } from '@services/media/media'

interface ScenarioOption {
  id: string
  text: string
  nextScenarioId: string | null
}

interface Scenario {
  id: string
  text: string
  imageUrl?: string
  imageBlockObject?: any
  responseMode?: 'basic' | 'full'
  options: ScenarioOption[]
}

const normalizeScenario = (scenario: Scenario): Scenario => ({
  ...scenario,
  responseMode: scenario.responseMode ?? 'full',
})

const ScenariosExtension: React.FC = (props: any) => {
  const [title, setTitle] = useState(props.node.attrs.title)
  const [scenarios, setScenarios] = useState<Scenario[]>(
    (props.node.attrs.scenarios || []).map((scenario: Scenario) => normalizeScenario(scenario))
  )
  const [startScenarioId, setStartScenarioId] = useState(props.node.attrs.currentScenarioId)
  const [activeScenarioId, setActiveScenarioId] = useState(props.node.attrs.currentScenarioId)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [scenarioComplete, setScenarioComplete] = useState(false)
  const editorState = useEditorProvider() as any
  const org = useOrg() as any
  const course = useCourse() as any
  const isEditable = editorState?.isEditable ?? true

  const getCurrentScenario = (scenarioId: string = activeScenarioId): Scenario | null => {
    return scenarios.find(s => s.id === scenarioId) || null
  }

  const handleSave = (newTitle: string, newScenarios: Scenario[], newCurrentScenarioId: string) => {
    const normalizedScenarios = newScenarios.map((scenario) => normalizeScenario(scenario))
    setTitle(newTitle)
    setScenarios(normalizedScenarios)
    setStartScenarioId(newCurrentScenarioId)
    setActiveScenarioId(newCurrentScenarioId)
    setScenarioComplete(false)

    props.updateAttributes({
      title: newTitle,
      scenarios: normalizedScenarios,
      currentScenarioId: newCurrentScenarioId,
    })
  }

  const handleOptionClick = (nextScenarioId: string | null) => {
    if (nextScenarioId) {
      setActiveScenarioId(nextScenarioId)
      setScenarioComplete(false)
    } else {
      setScenarioComplete(true)
    }
  }

  const handleSequentialNavigation = (direction: 'back' | 'next') => {
    const currentIndex = scenarios.findIndex((scenario) => scenario.id === activeScenarioId)
    if (currentIndex === -1) return

    const nextIndex = direction === 'back' ? currentIndex - 1 : currentIndex + 1
    const targetScenario = scenarios[nextIndex]

    if (!targetScenario) return

    setActiveScenarioId(targetScenario.id)
    setScenarioComplete(false)
  }

  const resetScenario = () => {
    setActiveScenarioId(startScenarioId || scenarios[0]?.id || '1')
    setScenarioComplete(false)
  }

  const getOptionLetter = (index: number) => {
    return String.fromCharCode('A'.charCodeAt(0) + index)
  }

  const getScenarioImageUrl = (scenario: Scenario) => {
    if (scenario.imageBlockObject?.content?.file_id && scenario.imageBlockObject?.content?.file_format) {
      const fileId = `${scenario.imageBlockObject.content.file_id}.${scenario.imageBlockObject.content.file_format}`

      return getActivityBlockMediaDirectory(
        org?.org_uuid,
        course?.courseStructure?.course_uuid,
        scenario.imageBlockObject.content.activity_uuid || props.extension.options.activity?.activity_uuid,
        scenario.imageBlockObject.block_uuid,
        fileId,
        'imageBlock'
      )
    }

    return scenario.imageUrl || ''
  }

  const renderBasicNavigation = (scenario: Scenario) => {
    const currentIndex = scenarios.findIndex((item) => item.id === scenario.id)
    const hasPrevious = currentIndex > 0
    const hasNext = currentIndex < scenarios.length - 1

    if (!hasPrevious && !hasNext) {
      return null
    }

    return (
      <div className="grid grid-cols-2 gap-2">
        {hasPrevious ? (
          <button
            onClick={() => handleSequentialNavigation('back')}
            className="w-full bg-white border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-100 rounded-lg px-4 py-3 transition-all nice-shadow"
          >
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-neutral-700">
              <RotateCcw size={14} className="text-neutral-500" />
              Back
            </div>
          </button>
        ) : (
          <div aria-hidden="true" />
        )}

        {hasNext ? (
          <button
            onClick={() => handleSequentialNavigation('next')}
            className="w-full bg-blue-600 border border-blue-600 hover:bg-blue-700 hover:border-blue-700 rounded-lg px-4 py-3 transition-all nice-shadow"
          >
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-white group">
              Next
              <ArrowRight size={14} className="text-white" />
            </div>
          </button>
        ) : (
          <div aria-hidden="true" />
        )}
      </div>
    )
  }

  const renderScenarioActions = (scenario: Scenario) => {
    if (scenario.responseMode === 'basic') {
      return renderBasicNavigation(scenario)
    }

    return (
      <div className="space-y-2">
        {scenario.options.map((option, index) => (
          <button
            key={option.id}
            onClick={() => handleOptionClick(option.nextScenarioId)}
            className="w-full bg-white border border-neutral-200 hover:border-blue-300 hover:bg-blue-50 rounded-lg p-3 transition-all group text-left nice-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-neutral-100 group-hover:bg-blue-100 rounded-md flex items-center justify-center flex-shrink-0 transition-colors">
                <span className="text-sm font-bold text-neutral-600 group-hover:text-blue-600">
                  {getOptionLetter(index)}
                </span>
              </div>
              <div className="flex-1 text-neutral-700 font-medium group-hover:text-blue-900 transition-colors">
                {option.text}
              </div>
              <ArrowRight size={16} className="text-neutral-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
            </div>
          </button>
        ))}
      </div>
    )
  }

  return (
    <NodeViewWrapper className="block-scenarios">
      <div className={isEditable ? "bg-neutral-50 rounded-xl px-5 py-4 nice-shadow transition-all ease-linear" : ""}>
        {isEditable && (
          <div className="flex flex-wrap gap-2 items-center text-sm mb-3">
            <div className="flex items-center gap-2">
              <GitBranch className="text-neutral-400" size={16} />
              <span className="uppercase tracking-widest text-xs font-bold text-neutral-400">
                Interactive Scenario
              </span>
            </div>

            <div className="grow"></div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-medium py-1.5 px-3 rounded-lg text-xs transition-colors outline-none"
            >
              Edit Scenarios
            </button>
          </div>
        )}

        {/* Scenario content */}
        {isEditable ? (
          <div className="bg-white rounded-lg p-4 nice-shadow">
            <input
              value={title}
              placeholder="Scenario Title"
              onChange={(e) => {
                setTitle(e.target.value)
                props.updateAttributes({ title: e.target.value })
              }}
              className="text-neutral-800 bg-transparent border-2 border-dashed border-neutral-200 rounded-lg text-base font-semibold w-full p-2 focus:border-neutral-300 outline-none transition-colors mb-3"
            />

            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
              <p className="text-neutral-600 text-sm text-center">
                {scenarios.length}/40 scenarios configured
              </p>
              <p className="text-neutral-500 text-xs text-center mt-1">
                Click "Edit Scenarios" to configure your interactive branching story
              </p>
            </div>
          </div>
        ) : scenarioComplete ? (
          <div className="bg-white rounded-lg p-6 nice-shadow text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={28} className="text-emerald-600" />
            </div>
            <h4 className="text-xl font-bold text-neutral-900 mb-2">Scenario Complete!</h4>
            <p className="text-neutral-600 mb-6 leading-relaxed max-w-md mx-auto">
              You've successfully navigated through this interactive scenario.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {(() => {
              const currentScenario = getCurrentScenario()
              if (!currentScenario) {
                return (
                  <div className="bg-white rounded-lg p-6 nice-shadow text-center">
                    <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <GitBranch size={20} className="text-neutral-400" />
                    </div>
                    <h3 className="text-base font-medium text-neutral-900 mb-2">Scenario Not Found</h3>
                    <p className="text-neutral-500 text-sm">Please check your scenario configuration and try again.</p>
                  </div>
                )
              }

              return (
                <>
                  {/* Scenario Text */}
                  <div className="bg-white rounded-lg p-5 nice-shadow overflow-hidden">
                    {getScenarioImageUrl(currentScenario) && (
                      <div className="-mx-5 -mt-5 mb-4 aspect-[4/3] w-[calc(100%+2.5rem)] max-w-none overflow-hidden bg-neutral-50">
                        <img
                          src={getScenarioImageUrl(currentScenario)}
                          alt="Scenario illustration"
                          className="h-full w-full object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      </div>
                    )}
                    <p className="text-base text-neutral-800 leading-relaxed font-medium">
                      {currentScenario.text}
                    </p>
                    <div className="mt-4">
                      {renderScenarioActions(currentScenario)}
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {!isEditable && (
          <div className="flex justify-end">
            <button
              onClick={resetScenario}
              className="text-xs font-medium text-neutral-500 hover:text-neutral-700 px-2.5 py-1.5 rounded-md hover:bg-neutral-200/70 transition-colors"
            >
              Reset
            </button>
          </div>
        )}

        <ScenariosModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={title}
          scenarios={scenarios}
          currentScenarioId={startScenarioId}
          activityUuid={props.extension.options.activity?.activity_uuid || ''}
          onSave={handleSave}
        />
      </div>
    </NodeViewWrapper>
  )
}

export default ScenariosExtension
