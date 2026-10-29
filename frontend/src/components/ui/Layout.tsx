import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function Layout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main
        className="flex-1 min-h-screen overflow-y-auto"
        style={{ marginLeft: 'var(--sidebar-width)' }}
      >
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
