import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Folder, BookOpen, Eye, ChevronRight, Layers, FileText, Search, ChevronDown, CheckCircle2 } from 'lucide-react'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import QuestionBankPreview from '../../components/admin/QuestionBankPreview'
import { getOrgQuestionBankFolders, getOrgQuestionBanks, getOrgSyllabus, QuestionBankFolder, SyllabusSubject } from '../../services/orgApi'

// Colour palette cycled across folder cards
const FOLDER_COLOURS = [
  { bg: 'bg-indigo-50', border: 'border-indigo-100', icon: 'text-indigo-500', badge: 'bg-indigo-100 text-indigo-700' },
  { bg: 'bg-emerald-50', border: 'border-emerald-100', icon: 'text-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
  { bg: 'bg-amber-50', border: 'border-amber-100', icon: 'text-amber-500', badge: 'bg-amber-100 text-amber-700' },
  { bg: 'bg-rose-50', border: 'border-rose-100', icon: 'text-rose-500', badge: 'bg-rose-100 text-rose-700' },
  { bg: 'bg-violet-50', border: 'border-violet-100', icon: 'text-violet-500', badge: 'bg-violet-100 text-violet-700' },
  { bg: 'bg-sky-50', border: 'border-sky-100', icon: 'text-sky-500', badge: 'bg-sky-100 text-sky-700' },
]

export default function QuestionBankPage() {
  const [selectedFolder, setSelectedFolder] = useState<QuestionBankFolder | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'files' | 'syllabus'>('files')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({})

  // ── Folder list query ─────────────────────────────────────────────────────
  const { data: folders, isLoading: foldersLoading } = useQuery({
    queryKey: ['org-question-bank-folders'],
    queryFn: getOrgQuestionBankFolders,
  })

  // ── Banks query — only fetches when a folder is selected ──────────────────
  const { data: banks, isLoading: banksLoading } = useQuery({
    queryKey: ['org-question-banks', selectedFolder?.subfolder],
    queryFn: () => getOrgQuestionBanks(selectedFolder!.subfolder),
    enabled: !!selectedFolder,
  })

  // ── Syllabus query — fetches when folder is selected ──────────────────────
  const { data: syllabus, isLoading: syllabusLoading, isError: syllabusError } = useQuery({
    queryKey: ['org-syllabus', selectedFolder?.subfolder],
    queryFn: () => getOrgSyllabus(selectedFolder!.subfolder),
    enabled: !!selectedFolder,
  })

  const bankColumns = [
    { key: 'title', header: 'Title' },
    { key: 'question_count', header: 'Questions' },
    {
      key: 'actions',
      header: 'Preview',
      render: (item: any) => (
        <button
          onClick={() => setPreviewId(item.id)}
          className="inline-flex items-center gap-1 text-primary-600 text-sm font-medium hover:text-primary-800 hover:underline transition-colors"
        >
          <Eye className="w-3.5 h-3.5" /> View
        </button>
      ),
    },
  ]

  const toggleSubject = (subjectName: string) => {
    setExpandedSubjects(prev => ({
      ...prev,
      [subjectName]: !prev[subjectName]
    }))
  }

  // Filtered syllabus subjects & topics based on search term
  const filteredSubjects = syllabus?.subjects.map(sub => {
    if (!searchTerm.trim()) return sub
    const term = searchTerm.toLowerCase()
    const matchSubj = sub.subject.toLowerCase().includes(term)

    const matchingTopics = sub.topics.filter(t => 
      matchSubj || 
      t.topic.toLowerCase().includes(term) ||
      t.subtopics.some(st => st.name.toLowerCase().includes(term))
    )

    if (matchSubj || matchingTopics.length > 0) {
      return { ...sub, topics: matchingTopics }
    }
    return null
  }).filter(Boolean) as SyllabusSubject[] | undefined

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {selectedFolder && (
            <button
              onClick={() => { setSelectedFolder(null); setActiveTab('files'); }}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-primary-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              All Folders
            </button>
          )}
          <div className="flex items-center gap-2 min-w-0">
            {selectedFolder && <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />}
            <h1 className="text-2xl font-bold text-gray-900 truncate">
              {selectedFolder ? selectedFolder.subfolder : 'Question Banks'}
            </h1>
          </div>
        </div>

        {/* Tab switcher when folder is selected */}
        {selectedFolder && (
          <div className="inline-flex p-1 bg-gray-100 rounded-xl">
            <button
              onClick={() => setActiveTab('files')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'files'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              Question Banks ({banks?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('syllabus')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'syllabus'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Layers className="w-4 h-4 text-primary-600" />
              Syllabus & Topics {syllabus?.total_subjects ? `(${syllabus.total_subjects})` : ''}
            </button>
          </div>
        )}
      </div>

      {/* ── Folder Grid (When no folder is selected) ───────────────────── */}
      {!selectedFolder && (
        <>
          {foldersLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-28 rounded-2xl" />
              ))}
            </div>
          ) : !folders || folders.length === 0 ? (
            <Card className="p-12 text-center text-gray-400">
              <Folder className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p className="font-medium">No question bank folders assigned.</p>
              <p className="text-sm mt-1">Contact your super admin to assign question banks.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {folders.map((folder, idx) => {
                const colours = FOLDER_COLOURS[idx % FOLDER_COLOURS.length]
                return (
                  <button
                    key={folder.subfolder}
                    onClick={() => setSelectedFolder(folder)}
                    className={`group text-left rounded-2xl border-2 p-5 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer ${colours.bg} ${colours.border} hover:scale-[1.02]`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <Folder className={`w-8 h-8 ${colours.icon}`} />
                      <ChevronRight className={`w-4 h-4 ${colours.icon} opacity-0 group-hover:opacity-100 transition-opacity`} />
                    </div>
                    <p className="font-bold text-gray-800 text-sm truncate mb-2" title={folder.subfolder}>
                      {folder.subfolder}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colours.badge}`}>
                        {folder.bank_count} {folder.bank_count === 1 ? 'bank' : 'banks'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {folder.total_questions.toLocaleString()} questions
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Tab 1: Question Bank Files List ────────────────────────────── */}
      {selectedFolder && activeTab === 'files' && (
        <Card className="overflow-hidden">
          {banksLoading ? (
            <div className="p-8 text-center text-gray-400">
              <BookOpen className="w-8 h-8 mx-auto mb-2 text-gray-200 animate-pulse" />
              Loading question banks…
            </div>
          ) : (
            <DataTable
              columns={bankColumns}
              data={banks || []}
              emptyMessage={`No question banks in "${selectedFolder.subfolder}".`}
            />
          )}
        </Card>
      )}

      {/* ── Tab 2: Extracted Syllabus & Topics Tree View ────────────────── */}
      {selectedFolder && activeTab === 'syllabus' && (
        <div className="space-y-4">
          {syllabusLoading ? (
            <Card className="p-8 text-center text-gray-400">
              <Layers className="w-8 h-8 mx-auto mb-2 text-primary-400 animate-bounce" />
              Extracting syllabus & topic breakdown…
            </Card>
          ) : syllabusError || !syllabus ? (
            <Card className="p-8 text-center text-gray-500">
              <p className="font-medium text-red-600 mb-1">Syllabus breakdown not available</p>
              <p className="text-sm">Run <code className="bg-gray-100 px-2 py-0.5 rounded text-gray-700 font-mono">python backend/scripts/extract_syllabus_from_pyq.py --folder {selectedFolder.subfolder}</code> to generate syllabus JSON.</p>
            </Card>
          ) : (
            <>
              {/* Summary Stats Header */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-4 flex items-center gap-3 border-indigo-100 bg-indigo-50/50">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500 text-white flex items-center justify-center font-bold">
                    {syllabus.total_subjects}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Extracted Subjects</p>
                    <p className="text-sm font-bold text-gray-900">{syllabus.total_subjects} Subjects Covered</p>
                  </div>
                </Card>
                <Card className="p-4 flex items-center gap-3 border-emerald-100 bg-emerald-50/50">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold">
                    {syllabus.processed_files_count}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Question Papers Merged</p>
                    <p className="text-sm font-bold text-gray-900">{syllabus.processed_files_count} Papers Processed</p>
                  </div>
                </Card>
                <Card className="p-4 flex items-center gap-3 border-sky-100 bg-sky-50/50">
                  <div className="w-10 h-10 rounded-xl bg-sky-500 text-white flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Status</p>
                    <p className="text-sm font-bold text-emerald-600">Syllabus Up-to-Date</p>
                  </div>
                </Card>
              </div>

              {/* Search Bar & Expand/Collapse Controls */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    placeholder="Search subjects, topics, or subtopics..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  />
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    onClick={() => {
                      const all: Record<string, boolean> = {}
                      syllabus.subjects.forEach(s => { all[s.subject] = true })
                      setExpandedSubjects(all)
                    }}
                    className="text-xs font-semibold text-primary-600 hover:text-primary-800 bg-primary-50 hover:bg-primary-100 px-3 py-2 rounded-lg transition-colors"
                  >
                    Expand All
                  </button>
                  <button
                    onClick={() => setExpandedSubjects({})}
                    className="text-xs font-semibold text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg transition-colors"
                  >
                    Collapse All
                  </button>
                </div>
              </div>

              {/* Subjects Accordion List */}
              <div className="space-y-3">
                {filteredSubjects && filteredSubjects.length > 0 ? (
                  filteredSubjects.map((subjectObj) => {
                    const isExpanded = expandedSubjects[subjectObj.subject] ?? (searchTerm.trim().length > 0)
                    return (
                      <Card key={subjectObj.subject} className="overflow-hidden border border-gray-200 shadow-sm">
                        {/* Subject Header Bar */}
                        <button
                          onClick={() => toggleSubject(subjectObj.subject)}
                          className="w-full px-5 py-4 flex items-center justify-between bg-gray-50/80 hover:bg-gray-100/80 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full bg-primary-500 shrink-0" />
                            <h3 className="font-bold text-gray-900 text-base truncate">{subjectObj.subject}</h3>
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary-100 text-primary-700 shrink-0">
                              {subjectObj.total_questions} Questions
                            </span>
                            <span className="text-xs text-gray-400 shrink-0 hidden sm:inline">
                              • {subjectObj.total_topics} Topics
                            </span>
                          </div>
                          <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Topics & Subtopics List */}
                        {isExpanded && (
                          <div className="p-5 divide-y divide-gray-100 bg-white">
                            {subjectObj.topics.map((t) => (
                              <div key={t.topic} className="py-4 first:pt-0 last:pb-0 space-y-2">
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <h4 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                                      <BookOpen className="w-4 h-4 text-primary-500 shrink-0" />
                                      {t.topic}
                                    </h4>
                                    {t.source_papers && t.source_papers.length > 0 && (
                                      <p className="text-xs text-gray-400 mt-1 pl-6">
                                        Source Papers: {t.source_papers.slice(0, 4).join(', ')}{t.source_papers.length > 4 ? ` +${t.source_papers.length - 4} more` : ''}
                                      </p>
                                    )}
                                  </div>
                                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">
                                    {t.question_count} Qs
                                  </span>
                                </div>

                                {/* Subtopics Pills */}
                                {t.subtopics && t.subtopics.length > 0 && (
                                  <div className="pl-6 flex flex-wrap gap-2 pt-1">
                                    {t.subtopics.map((st) => (
                                      <span
                                        key={st.name}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-100 text-xs text-gray-700"
                                      >
                                        <span className="font-medium">{st.name}</span>
                                        <span className="text-[10px] font-bold text-gray-400 bg-gray-200/60 px-1.5 py-0.2 rounded-full">
                                          {st.count}
                                        </span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    )
                  })
                ) : (
                  <Card className="p-8 text-center text-gray-400">
                    No subjects or topics match your search query "{searchTerm}".
                  </Card>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Preview Modal ───────────────────────────────────────────────── */}
      <Modal isOpen={!!previewId} onClose={() => setPreviewId(null)} title="Question Bank Preview" className="max-w-4xl">
        {previewId && <QuestionBankPreview registryId={previewId} />}
      </Modal>
    </div>
  )
}

