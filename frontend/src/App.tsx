import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/ui/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { ImageDetectionPage } from './pages/ImageDetectionPage'
import { AudioDetectionPage } from './pages/AudioDetectionPage'
import { VideoDetectionPage } from './pages/VideoDetectionPage'
import { ModelsPage } from './pages/ModelsPage'
import { AboutPage } from './pages/AboutPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="/image" element={<ImageDetectionPage />} />
        <Route path="/audio" element={<AudioDetectionPage />} />
        <Route path="/video" element={<VideoDetectionPage />} />
        <Route path="/models" element={<ModelsPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Route>
    </Routes>
  )
}
