import { useState } from 'react'
import { ChevronRight, ChevronDown, CheckSquare, Square } from 'lucide-react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import type { PyqSubtopicHierarchy } from '../../services/quizApi'

interface Props {
  hierarchy: PyqSubtopicHierarchy[]
  onStart: (selectedSubtopics: string[]) => void
  isLoading?: boolean
}

export default function PyqSubtopicSelector({ hierarchy, onStart, isLoading }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpand = (path: string) => {
    const next = new Set(expanded)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setExpanded(next)
  }

  const toggleSelect = (subtopic: string) => {
    const next = new Set(selected)
    if (next.has(subtopic)) next.delete(subtopic)
    else next.add(subtopic)
    setSelected(next)
  }

  const toggleTopic = (topic: { name: string, subtopics: string[] }) => {
    const allSelected = topic.subtopics.every(s => selected.has(s))
    const next = new Set(selected)
    topic.subtopics.forEach(s => {
      if (allSelected) next.delete(s)
      else next.add(s)
    })
    setSelected(next)
  }

  const toggleSubject = (subj: PyqSubtopicHierarchy) => {
    const allSubs = subj.topics.flatMap(t => t.subtopics)
    const allSelected = allSubs.every(s => selected.has(s))
    const next = new Set(selected)
    allSubs.forEach(s => {
      if (allSelected) next.delete(s)
      else next.add(s)
    })
    setSelected(next)
  }

  return (
    <div className="space-y-4">
      <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
        {!hierarchy || hierarchy.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
            <p className="text-gray-400">No practice subtopics found in the current question pool.</p>
            <p className="text-xs text-gray-300 mt-2">Try refreshing the page or contacting support if this persists.</p>
          </div>
        ) : hierarchy.map((subj) => {
          const topics = subj.topics || []
          const allSubs = topics.flatMap(t => t.subtopics || [])
          const selectedInSubj = allSubs.filter(s => selected.has(s)).length
          const isAllSelected = selectedInSubj === allSubs.length && allSubs.length > 0

          return (
            <Card key={subj.subject} className="overflow-hidden border-gray-100">
              <div 
                className="flex items-center p-4 bg-gray-50/50 cursor-pointer hover:bg-gray-100/50 transition-colors"
                onClick={() => toggleExpand(subj.subject)}
              >
                <div 
                  className="mr-3 text-primary-600"
                  onClick={(e) => { e.stopPropagation(); toggleSubject(subj); }}
                >
                  {isAllSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">{subj.subject}</h3>
                  <p className="text-[10px] text-gray-500">{selectedInSubj} of {allSubs.length} selected</p>
                </div>
                {expanded.has(subj.subject) ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
              </div>

              {expanded.has(subj.subject) && (
                <div className="p-2 space-y-1 bg-white border-t border-gray-50">
                  {subj.topics.map((topic) => {
                    const selectedInTopic = topic.subtopics.filter(s => selected.has(s)).length
                    const isTopicAllSelected = selectedInTopic === topic.subtopics.length

                    return (
                      <div key={topic.name} className="ml-2">
                        <div 
                          className="flex items-center p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                          onClick={() => toggleExpand(`${subj.subject}:${topic.name}`)}
                        >
                          <div 
                            className="mr-3 text-gray-400"
                            onClick={(e) => { e.stopPropagation(); toggleTopic(topic); }}
                          >
                            {isTopicAllSelected ? <CheckSquare className="w-4 h-4 text-primary-500" /> : <Square className="w-4 h-4" />}
                          </div>
                          <span className="flex-1 text-sm font-medium text-gray-700">{topic.name}</span>
                          {expanded.has(`${subj.subject}:${topic.name}`) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>

                        {expanded.has(`${subj.subject}:${topic.name}`) && (
                          <div className="ml-9 mt-1 grid grid-cols-1 sm:grid-cols-2 gap-1 pb-2">
                            {topic.subtopics.map((sub) => (
                              <div 
                                key={sub}
                                className="flex items-center p-1.5 rounded-md hover:bg-primary-50 group cursor-pointer transition-colors"
                                onClick={() => toggleSelect(sub)}
                              >
                                {selected.has(sub) ? (
                                  <CheckSquare className="w-3.5 h-3.5 text-primary-600 mr-2" />
                                ) : (
                                  <Square className="w-3.5 h-3.5 text-gray-300 mr-2 group-hover:text-primary-300" />
                                )}
                                <span className={`text-xs ${selected.has(sub) ? 'text-primary-900 font-medium' : 'text-gray-600'}`}>
                                  {sub}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <div className="pt-4 border-t flex items-center justify-between">
        <div className="text-sm text-gray-500">
          <span className="font-bold text-primary-600">{selected.size}</span> subtopics selected
        </div>
        <Button 
          disabled={selected.size === 0} 
          onClick={() => onStart(Array.from(selected))}
          loading={isLoading}
        >
          Start Practice Quiz
        </Button>
      </div>
    </div>
  )
}
