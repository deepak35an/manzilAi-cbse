import { useState } from 'react'
import { Trash2, Pencil, GraduationCap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import DataTable from '../ui/DataTable'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import type { OrgStudent } from '../../services/orgApi'
import { updateStudent } from '../../services/orgApi'

interface StudentTableProps {
  students: OrgStudent[]
  onDelete: (student: OrgStudent) => void
  availableExams: string[]
}

export default function StudentTable({ students, onDelete, availableExams }: StudentTableProps) {
  const queryClient = useQueryClient()

  const [editTarget, setEditTarget] = useState<OrgStudent | null>(null)
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editClass, setEditClass] = useState('')
  const [editSection, setEditSection] = useState('')
  const [editExams, setEditExams] = useState<string[]>([])

  const openEdit = (s: OrgStudent) => {
    setEditTarget(s)
    setEditPhone(s.phone ?? '')
    setEditEmail(s.email ?? '')
    setEditClass(s.class_name ?? '')
    setEditSection(s.section ?? '')
    setEditExams(s.allocated_exams ?? [])
  }

  const closeEdit = () => setEditTarget(null)

  const editMutation = useMutation({
    mutationFn: (data: { phone?: string; email?: string; class_name?: string; section?: string; allocated_exams?: string[] }) =>
      updateStudent(editTarget!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-students'] })
      queryClient.invalidateQueries({ queryKey: ['org-dashboard'] })
      toast.success('Student updated successfully')
      closeEdit()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update student')
    },
  })

  const toggleEditExam = (exam: string) => {
    setEditExams((prev) =>
      prev.includes(exam) ? prev.filter((e) => e !== exam) : [...prev, exam]
    )
  }

  const handleUpdate = () => {
    if (editPhone.length !== 10) {
      toast.error('Phone number must be exactly 10 digits')
      return
    }
    editMutation.mutate({
      phone: editPhone,
      email: editEmail || undefined,
      class_name: editClass || undefined,
      section: editSection || undefined,
      allocated_exams: editExams,
    })
  }

  const columns = [
    {
      key: 'name',
      header: 'Student',
      render: (s: OrgStudent) => (
        <div className="font-semibold text-gray-900">{s.name}</div>
      ),
    },
    { key: 'phone', header: 'Phone' },
    { key: 'tests_taken', header: 'Total Tests' },
    { key: 'avg_score', header: 'Average Score', render: (s: OrgStudent) => `${s.avg_score.toFixed(1)}%` },
    {
      key: 'detailed_review',
      header: 'Detailed Review',
      render: (s: OrgStudent) => (
        <Link to={`/org/student/${s.id}`}>
          <Button
            variant="outline"
            size="sm"
            className="text-primary-600 border-primary-200 hover:bg-primary-50 px-4 py-1 h-8 rounded-lg font-medium text-xs shadow-sm transition-all"
          >
            View
          </Button>
        </Link>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (s: OrgStudent) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEdit(s)}
            className="text-gray-400 hover:text-primary-600 transition-colors"
            title="Edit student"
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(s)}
            className="text-gray-400 hover:text-red-600 transition-colors"
            title="Remove student"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <DataTable columns={columns} data={students} />

      {/* Edit Student Modal */}
      <Modal isOpen={!!editTarget} onClose={closeEdit} title="Edit Student">
        <div className="space-y-4">
          {/* Name – read-only */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <div className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-500 cursor-not-allowed select-none">
              {editTarget?.name}
            </div>
            <p className="text-xs text-gray-400 mt-1">Name cannot be changed.</p>
          </div>

          {/* Phone */}
          <div>
            <Input
              label="Phone"
              value={editPhone}
              maxLength={10}
              onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit phone number"
            />
            {editPhone.length > 0 && editPhone.length !== 10 && (
              <p className="text-xs text-red-500 mt-1">Phone number must be exactly 10 digits.</p>
            )}
          </div>

          {/* Email */}
          <Input
            label="Email (optional)"
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
            placeholder="email@example.com"
          />

          {/* Class & Section */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Class (optional)"
              value={editClass}
              onChange={(e) => setEditClass(e.target.value)}
              placeholder="e.g. 11, 12, UG"
            />
            <Input
              label="Section (optional)"
              value={editSection}
              onChange={(e) => setEditSection(e.target.value)}
              placeholder="e.g. A, B"
            />
          </div>

          {/* Exam Allocation */}
          {availableExams.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Allocated Exams
                <span className="ml-1 text-xs text-gray-400 font-normal">(empty = allow all)</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {availableExams.map((exam) => (
                  <label
                    key={exam}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                      editExams.includes(exam)
                        ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 accent-primary-600"
                      checked={editExams.includes(exam)}
                      onChange={() => toggleEditExam(exam)}
                    />
                    <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{exam.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <Button
            className="w-full"
            loading={editMutation.isPending}
            disabled={editPhone.length !== 10}
            onClick={handleUpdate}
          >
            Update Student
          </Button>
        </div>
      </Modal>
    </>
  )
}
