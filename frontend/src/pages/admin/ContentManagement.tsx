import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import FolderTree from '../../components/admin/FolderTree'
import ContentTable from '../../components/admin/ContentTable'
import QuestionBankUploader from '../../components/admin/QuestionBankUploader'
import VisibilityEditor from '../../components/admin/VisibilityEditor'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import {
  getContentTree,
  createSubfolder,
  deleteSubfolder,
  uploadQuestionBank,
  setSubfolderVisibility,
  getOrganizations,
  deleteQuestionBank,
} from '../../services/adminApi'
import QuestionBankPreview from '../../components/admin/QuestionBankPreview'
import type { ContentRegistryItem } from '../../types/admin'

interface SubfolderVisibilityTarget {
  root_folder: string
  subfolder: string
  visibility: string
  org_ids: string[]
}

export default function ContentManagement() {
  const queryClient = useQueryClient()
  const { data: tree } = useQuery({ queryKey: ['content-tree'], queryFn: getContentTree })
  const { data: orgs = [] } = useQuery({ queryKey: ['organizations'], queryFn: getOrganizations })

  const [selectedRoot, setSelectedRoot] = useState('')
  const [selectedSub, setSelectedSub] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderRoot, setNewFolderRoot] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [subfolderVisTarget, setSubfolderVisTarget] = useState<SubfolderVisibilityTarget | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ContentRegistryItem | null>(null)

  const createMutation = useMutation({
    mutationFn: createSubfolder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-tree'] })
      setShowNewFolder(false)
      setNewFolderName('')
      toast.success('Subfolder created')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: ({ root, sub }: { root: string; sub: string }) => deleteSubfolder(root, sub),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-tree'] })
      toast.success('Subfolder deleted')
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to delete subfolder'
      toast.error(message)
    },
  })

  const deleteQuestionBankMutation = useMutation({
    mutationFn: (registryId: string) => deleteQuestionBank(registryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-tree'] })
      setDeleteTarget(null)
      toast.success('Question bank deleted successfully')
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to delete question bank'
      toast.error(message)
    },
  })

  const subfolderVisibilityMutation = useMutation({
    mutationFn: setSubfolderVisibility,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-tree'] })
      setSubfolderVisTarget(null)
      toast.success('Subfolder visibility updated for all papers inside!')
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to update subfolder visibility'
      toast.error(message)
    },
  })

  const handleDeleteSubfolder = (root: string, sub: string) => {
    if (window.confirm(`Are you sure you want to delete "${sub}" and all its contents? This cannot be undone.`)) {
      deleteMutation.mutate({ root, sub })
    }
  }

  const handleDeleteQuestionBank = (item: ContentRegistryItem) => {
    setDeleteTarget(item)
  }

  const confirmDeleteQuestionBank = () => {
    if (!deleteTarget) return
    deleteQuestionBankMutation.mutate(deleteTarget.id)
  }

  const selectedFolder = tree?.find((t) => t.root_folder === selectedRoot)
  const files = selectedFolder?.files.filter((f) => !selectedSub || f.subfolder === selectedSub) || []

  const handleUpload = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('root_folder', selectedRoot)
    formData.append('subfolder', selectedSub || 'General')

    try {
      await uploadQuestionBank(formData)
      queryClient.invalidateQueries({ queryKey: ['content-tree'] })
      toast.success('Question bank uploaded successfully')
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to upload question bank'
      toast.error(message, { duration: 5000 })
    }
  }

  const handleSubfolderVisibilitySave = (visibility: string, orgIds: string[]) => {
    if (!subfolderVisTarget) return
    subfolderVisibilityMutation.mutate({
      root_folder: subfolderVisTarget.root_folder,
      subfolder: subfolderVisTarget.subfolder,
      visibility,
      org_ids: orgIds,
    })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Content Management</h1>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="p-4 lg:col-span-1">
          <FolderTree
            tree={tree || []}
            selectedPath={selectedSub ? `${selectedRoot}/${selectedSub}` : selectedRoot}
            onSelectFolder={(root, sub) => {
              setSelectedRoot(root)
              setSelectedSub(sub || '')
            }}
            onCreateSubfolder={(root) => {
              setNewFolderRoot(root)
              setShowNewFolder(true)
            }}
            onDeleteSubfolder={handleDeleteSubfolder}
            onEditSubfolderVisibility={(root, sub, currentVis, currentOrgIds) => {
              setSubfolderVisTarget({
                root_folder: root,
                subfolder: sub,
                visibility: currentVis,
                org_ids: currentOrgIds,
              })
            }}
          />
        </Card>
        <div className="lg:col-span-3 space-y-4">
          {selectedRoot && (
            <QuestionBankUploader
              rootFolder={selectedRoot}
              subfolder={selectedSub || 'General'}
              onUpload={handleUpload}
            />
          )}
          <Card className="overflow-hidden">
            <ContentTable
              items={files}
              onPreview={(id) => setPreviewId(id)}
              onDelete={handleDeleteQuestionBank}
            />
          </Card>
        </div>
      </div>

      {/* Create Subfolder Modal */}
      <Modal isOpen={showNewFolder} onClose={() => setShowNewFolder(false)} title="Create Subfolder">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Creating subfolder in: <strong>{newFolderRoot}</strong>
          </p>
          <Input label="Folder Name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
          <Button
            onClick={() => createMutation.mutate({ root_folder: newFolderRoot, subfolder_name: newFolderName })}
            loading={createMutation.isPending}
          >
            Create
          </Button>
        </div>
      </Modal>

      {/* Subfolder Visibility Modal */}
      <Modal
        isOpen={!!subfolderVisTarget}
        onClose={() => setSubfolderVisTarget(null)}
        title={subfolderVisTarget ? `Edit Subfolder Visibility: "${subfolderVisTarget.subfolder}"` : 'Edit Subfolder Visibility'}
      >
        {subfolderVisTarget && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Configuring visibility for subfolder <strong>{subfolderVisTarget.root_folder} / {subfolderVisTarget.subfolder}</strong>.
              All existing and future question banks in this subfolder will follow these access settings.
            </p>
            <VisibilityEditor
              currentVisibility={subfolderVisTarget.visibility}
              organizations={orgs.map((o) => ({ id: o.id, name: o.name }))}
              selectedOrgIds={subfolderVisTarget.org_ids}
              onSave={handleSubfolderVisibilitySave}
            />
          </div>
        )}
      </Modal>

      {/* Question Bank Preview Modal */}
      <Modal isOpen={!!previewId} onClose={() => setPreviewId(null)} title="Question Bank Preview" className="max-w-4xl">
        {previewId && <QuestionBankPreview registryId={previewId} />}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Question Bank">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                />
              </svg>
              <div>
                <p className="text-sm font-semibold text-red-800">This action cannot be undone.</p>
                <p className="text-sm text-red-700 mt-1">
                  You are about to permanently delete <strong>"{deleteTarget.title}"</strong> ({deleteTarget.question_count} questions).
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteQuestionBankMutation.isPending}
              >
                Cancel
              </Button>
              <button
                onClick={confirmDeleteQuestionBank}
                disabled={deleteQuestionBankMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleteQuestionBankMutation.isPending ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
