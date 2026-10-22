import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useUiStore } from '../../store/uiStore'
import { cn } from '../../lib/utils'
import { useMediaQuery } from '../../hooks/useMediaQuery'

export default function AppShell() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen)
  const isLargeScreen = useMediaQuery('(min-width: 1024px)')

  // Collapse sidebar when window/screen is narrowed or sided
  useEffect(() => {
    setSidebarOpen(isLargeScreen)
  }, [isLargeScreen, setSidebarOpen])

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      {!isLargeScreen && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className={cn('transition-all duration-300', isLargeScreen ? (sidebarOpen ? 'ml-64' : 'ml-16') : 'ml-16')}>
        <TopBar />
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
