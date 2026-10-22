import { useState } from 'react'
import { Folder, FolderOpen, Lock, Plus, Trash2, Globe, Building2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { FolderTree as FolderTreeType } from '../../types/admin'

interface FolderTreeProps {
  tree: FolderTreeType[]
  onSelectFolder: (root: string, subfolder?: string) => void
  onCreateSubfolder: (root: string) => void
  onDeleteSubfolder: (root: string, subfolder: string) => void
  onEditSubfolderVisibility: (root: string, subfolder: string, currentVisibility: string, currentOrgIds: string[]) => void
  selectedPath?: string
}

export default function FolderTree({
  tree,
  onSelectFolder,
  onCreateSubfolder,
  onDeleteSubfolder,
  onEditSubfolderVisibility,
  selectedPath,
}: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(tree.map((t) => t.root_folder)))

  const toggle = (root: string) => {
    const next = new Set(expanded)
    if (next.has(root)) next.delete(root)
    else next.add(root)
    setExpanded(next)
  }

  return (
    <div className="space-y-1">
      {tree.map((node) => (
        <div key={node.root_folder}>
          <button
            onClick={() => {
              toggle(node.root_folder)
              onSelectFolder(node.root_folder)
            }}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-gray-100 transition-colors',
              selectedPath === node.root_folder && 'bg-primary-50 text-primary-700 font-semibold'
            )}
          >
            <Lock className="w-3.5 h-3.5 text-gray-400" />
            {expanded.has(node.root_folder) ? (
              <FolderOpen className="w-4 h-4 text-amber-500" />
            ) : (
              <Folder className="w-4 h-4 text-amber-500" />
            )}
            <span className="font-medium truncate">{node.root_folder}</span>
          </button>
          {expanded.has(node.root_folder) && (
            <div className="ml-6 space-y-1 my-1">
              {node.subfolders.map((sf) => {
                const detail = node.subfolder_details?.find((d) => d.name === sf)
                const vis = detail?.visibility || 'global'
                const orgIds = detail?.org_ids || []
                const isSelected = selectedPath === `${node.root_folder}/${sf}`

                return (
                  <div
                    key={sf}
                    className={cn(
                      'flex items-center justify-between group rounded-lg hover:bg-gray-100 pr-1.5 transition-colors',
                      isSelected && 'bg-primary-50 text-primary-700'
                    )}
                  >
                    <button
                      onClick={() => onSelectFolder(node.root_folder, sf)}
                      className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-gray-700 flex-1 min-w-0"
                    >
                      <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="truncate font-medium">{sf}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {/* Visibility indicator & edit button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditSubfolderVisibility(node.root_folder, sf, vis, orgIds)
                        }}
                        title={`Visibility: ${vis === 'global' ? 'Global' : 'Org-specific'}. Click to edit.`}
                        className={cn(
                          'flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold border transition-colors',
                          vis === 'global'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                        )}
                      >
                        {vis === 'global' ? <Globe className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                        <span className="capitalize hidden xl:inline">{vis === 'global' ? 'Global' : 'Org'}</span>
                      </button>

                      {/* Delete subfolder button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteSubfolder(node.root_folder, sf)
                        }}
                        title="Delete Subfolder"
                        className="p-1 opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
              <button
                onClick={() => onCreateSubfolder(node.root_folder)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-primary-600 hover:bg-primary-50 font-medium rounded-lg w-full mt-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Subfolder</span>
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
