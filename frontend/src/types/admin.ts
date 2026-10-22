export interface ContentRegistryItem {
  id: string
  file_path: string
  root_folder: string
  subfolder: string
  title: string
  subject: string | null
  source_type: string
  question_count: number
  visibility: string
  org_ids?: string[]
  created_at: string
}

export interface SubfolderDetail {
  name: string
  visibility: string
  org_ids: string[]
}

export interface FolderTree {
  root_folder: string
  subfolders: string[]
  subfolder_details?: SubfolderDetail[]
  files: ContentRegistryItem[]
}
