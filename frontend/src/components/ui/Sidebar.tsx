import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Image,
  Music,
  Video,
  Settings,
  HelpCircle,
  Shield,
} from 'lucide-react'
import { cn } from '../../utils/format'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/image', icon: Image, label: 'Image Detection' },
  { to: '/audio', icon: Music, label: 'Audio Detection' },
  { to: '/video', icon: Video, label: 'Video Detection' },
  { to: '/models', icon: Settings, label: 'Models & Config' },
  { to: '/about', icon: HelpCircle, label: 'About / Help' },
]

export function Sidebar() {
  return (
    <aside className="fixed top-0 left-0 h-screen w-[var(--sidebar-width)] flex flex-col bg-gray-900 border-r border-gray-800 z-20">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-800">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-600/20 border border-brand-700/30">
          <Shield className="w-4 h-4 text-brand-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-tight">Deepfake</p>
          <p className="text-xs text-gray-500 leading-tight">Detection Studio</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {nav.map(({ to, icon: Icon, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150',
                isActive
                  ? 'bg-brand-600/15 text-brand-400 border border-brand-700/20'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
              )
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-gray-800">
        <p className="text-xs text-gray-600">v1.0.0 · Local mode</p>
      </div>
    </aside>
  )
}
