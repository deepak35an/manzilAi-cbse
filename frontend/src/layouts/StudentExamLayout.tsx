import { Outlet } from 'react-router-dom'
import TopNav from '@/components/nav/TopNav'
import ExamSidebar from '@/components/nav/ExamSidebar'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/useMediaQuery'

export default function StudentExamLayout() {
  const isLargeScreen = useMediaQuery('(min-width: 1024px)')
  const [sidebarOpen, setSidebarOpen] = useState(isLargeScreen)

  // Collapse sidebar when window/screen is narrowed or sided
  useEffect(() => {
    setSidebarOpen(isLargeScreen)
  }, [isLargeScreen])

  return (
    <div className="min-h-screen bg-surface-secondary flex">
      <ExamSidebar open={sidebarOpen} onToggle={() => setSidebarOpen((p) => !p)} />
      {!isLargeScreen && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className={cn('flex-1 flex flex-col min-w-0 transition-all duration-300', isLargeScreen ? (sidebarOpen ? 'ml-64' : 'ml-16') : 'ml-16')}>
        <TopNav />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
