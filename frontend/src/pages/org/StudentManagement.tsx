import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, GraduationCap, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import StudentTable from '../../components/org/StudentTable'
import Modal from '../../components/ui/Modal'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { getOrgStudents, addStudent, removeStudent, getOrgAvailableExams, OrgStudent } from '../../services/orgApi'

// ── One-time credentials reveal modal ──────────────────────────────────────
function CredentialsModal({ student, onClose }: { student: OrgStudent; onClose: () => void }) {
  const [copiedUser, setCopiedUser] = useState(false)
  const [copiedPass, setCopiedPass] = useState(false)

  const copy = (text: string, setDone: (v: boolean) => void) => {
    navigator.clipboard.writeText(text)
    setDone(true)
    setTimeout(() => setDone(false), 2000)
  }

  return (
    <Modal isOpen onClose={onClose} title="Student Added Successfully">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{student.name}</span> has been registered.
          Share these credentials with the student — the password won't be shown again.
        </p>

        {/* Username */}
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">Username</p>
              <p className="text-lg font-bold text-gray-900 font-mono mt-0.5">{student.username}</p>
            </div>
            <button
              onClick={() => copy(student.username!, setCopiedUser)}
              className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium px-3 py-1.5 rounded-lg hover:bg-primary-50 transition-all"
            >
              {copiedUser ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedUser ? 'Copied!' : 'Copy'}
            </button>
          </div>

          <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">Password</p>
              <p className="text-lg font-bold text-gray-900 font-mono mt-0.5">{student.plain_password}</p>
            </div>
            <button
              onClick={() => copy(student.plain_password!, setCopiedPass)}
              className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium px-3 py-1.5 rounded-lg hover:bg-primary-50 transition-all"
            >
              {copiedPass ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedPass ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          ⚠️ Save the password now — it cannot be recovered. You can reset it later from the student's detail page.
        </p>

        <Button className="w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  )
}

export default function StudentManagement() {
  const queryClient = useQueryClient()
  const { data: students = [], isLoading } = useQuery({
    queryKey: ['org-students'],
    queryFn: getOrgStudents,
  })

  const { data: availableExams = [] } = useQuery({
    queryKey: ['org-available-exams'],
    queryFn: getOrgAvailableExams,
  })

  const [search, setSearch] = useState('')
  const [selectedBatch, setSelectedBatch] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [newStudent, setNewStudent] = useState<OrgStudent | null>(null)

  const [phone, setPhone] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [className, setClassName] = useState('')
  const [section, setSection] = useState('')
  const [allocatedExams, setAllocatedExams] = useState<string[]>([])

  const toggleExam = (exam: string) => {
    setAllocatedExams((prev) =>
      prev.includes(exam) ? prev.filter((e) => e !== exam) : [...prev, exam]
    )
  }

  const resetForm = () => {
    setPhone('')
    setFirstName('')
    setLastName('')
    setEmail('')
    setClassName('')
    setSection('')
    setAllocatedExams([])
  }

  const addMutation = useMutation({
    mutationFn: addStudent,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['org-students'] })
      queryClient.invalidateQueries({ queryKey: ['org-dashboard'] })
      setShowAdd(false)
      resetForm()
      setNewStudent(data)  // show credentials modal
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to add student'
      toast.error(message)
    },
  })

  const removeMutation = useMutation({
    mutationFn: removeStudent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-students'] })
      queryClient.invalidateQueries({ queryKey: ['org-dashboard'] })
      toast.success('Student removed')
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to remove student'
      toast.error(message)
    },
  })

  const handleDelete = (student: any) => {
    if (window.confirm(`Are you sure you want to remove ${student.name} from your organization?`)) {
      removeMutation.mutate(student.id)
    }
  }

  const filtered = students.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.phone.includes(search)

    if (selectedBatch === 'all') return matchesSearch
    if (selectedBatch === 'none') {
      return matchesSearch && (!s.all_batches || s.all_batches.length === 0)
    }

    const batchNum = parseInt(selectedBatch, 10)
    return matchesSearch && s.all_batches?.includes(batchNum)
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Student Management</h1>
          <p className="text-sm text-gray-500">Monitor and manage student enrollments, batches, and details.</p>
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Batch Dropdown */}
          <div className="relative min-w-[210px]">
            <select
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 pr-10 text-sm font-semibold text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all cursor-pointer"
            >
              <option value="all">All Batches</option>
              <option value="3">Batch - 3 Months</option>
              <option value="6">Batch - 6 Months</option>
              <option value="9">Batch - 9 Months</option>
              <option value="12">Batch - 12 Months</option>
              <option value="none">Not Registered in Any Batch</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>

          {/* Search Input */}
          <div className="flex-1 max-w-md">
            <Input
              placeholder="Search by student name or phone number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-50 border-gray-200 focus:bg-white"
            />
          </div>
        </div>

        {/* Add Student Button */}
        <Button
          onClick={() => setShowAdd(true)}
          className="bg-primary-600 hover:bg-primary-700 text-white rounded-xl px-5 py-2 text-sm font-semibold shadow-sm transition-all"
        >
          Add Student
        </Button>
      </div>

      <Card className="overflow-hidden border border-gray-100 shadow-sm">
        {isLoading ? (
          <div className="text-center py-10 text-gray-400">Loading students...</div>
        ) : filtered.length > 0 ? (
          <StudentTable students={filtered} onDelete={handleDelete} availableExams={availableExams} />
        ) : (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg font-medium">No students found</p>
            <p className="text-sm mt-1">Try resetting filters or adding a new student.</p>
          </div>
        )}
      </Card>

      {/* Add Student Modal */}
      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); resetForm() }} title="Add Student">
        <div className="space-y-4">
          <Input
            label="Phone"
            placeholder="10-digit phone number"
            value={phone}
            maxLength={10}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          />
          {phone.length > 0 && phone.length !== 10 && (
            <p className="text-xs text-red-500 -mt-2">Phone number must be exactly 10 digits.</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" placeholder="e.g. John" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <Input label="Last Name" placeholder="e.g. Smith" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>

          <Input label="Email (optional — for receiving credentials)" type="email" placeholder="student@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          {email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && (
            <p className="text-xs text-red-500 -mt-2">Please enter a valid email address.</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input label="Class (optional)" placeholder="e.g. 11, 12, UG" value={className} onChange={(e) => setClassName(e.target.value)} />
            <Input label="Section (optional)" placeholder="e.g. A, B" value={section} onChange={(e) => setSection(e.target.value)} />
          </div>

          {/* Exam Allocation */}
          {availableExams.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Allocate Exams
                <span className="ml-1 text-xs text-gray-400 font-normal">(leave empty to allow all)</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {availableExams.map((exam) => (
                  <label
                    key={exam}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                      allocatedExams.includes(exam)
                        ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 accent-primary-600"
                      checked={allocatedExams.includes(exam)}
                      onChange={() => toggleExam(exam)}
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
            loading={addMutation.isPending}
            disabled={
              phone.length !== 10 ||
              !firstName.trim() ||
              (email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
            }
            onClick={() => addMutation.mutate({
              phone,
              first_name: firstName.trim(),
              last_name: lastName.trim() || undefined,
              email: email.trim() || undefined,
              class_name: className || undefined,
              section: section || undefined,
              allocated_exams: allocatedExams.length > 0 ? allocatedExams : undefined,
            })}
          >
            Add Student
          </Button>
        </div>
      </Modal>

      {/* Credentials reveal modal (shown once after student creation) */}
      {newStudent && (
        <CredentialsModal student={newStudent} onClose={() => setNewStudent(null)} />
      )}
    </div>
  )
}
