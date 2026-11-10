import { useEffect } from 'react'
import { Link, Outlet, Route, Routes, useLocation } from 'react-router'
import { AppProvider, useApp } from './components/AppContext'
import { DemoBanner, Header, PhoneBar } from './components/Chrome'
import { IconSprite } from './components/ui'
import Welcome from './pages/Welcome'
import Stage from './pages/Stage'
import Today from './pages/Today'
import SnapStart from './pages/SnapStart'
import SnapReview from './pages/SnapReview'
import Calls from './pages/Calls'
import People from './pages/People'
import KidProfile from './pages/KidProfile'
import FamilyDetail from './pages/FamilyDetail'
import MentorDetail from './pages/MentorDetail'
import Report from './pages/Report'
import Integrations from './pages/Integrations'
import Signup from './pages/Signup'
import EarlyAccess from './pages/EarlyAccess'
import Lab from './pages/Lab'

function Layout() {
  const { pathname } = useLocation()
  const { refreshCounts } = useApp()
  useEffect(() => {
    window.scrollTo(0, 0)
    refreshCounts()
  }, [pathname, refreshCounts])
  return (
    <>
      <DemoBanner />
      <Header />
      <main className="wrap">
        <Outlet />
      </main>
      <PhoneBar />
    </>
  )
}

function NotFound() {
  return (
    <section className="card state">
      <div className="title">Nothing here.</div>
      <div className="sub">That page doesn't exist.</div>
      <Link className="btn dark sm" to="/today">Back to Today</Link>
    </section>
  )
}

export default function App() {
  return (
    <AppProvider>
      <IconSprite />
      <Routes>
        <Route path="/" element={<Stage />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/early-access" element={<EarlyAccess />} />
        <Route element={<Layout />}>
          <Route path="/today" element={<Today />} />
          <Route path="/snap" element={<SnapStart />} />
          <Route path="/snap/:sessionId" element={<SnapReview />} />
          <Route path="/calls" element={<Calls />} />
          <Route path="/calls/:id" element={<Calls />} />
          <Route path="/people" element={<People />} />
          <Route path="/people/kids/:id" element={<KidProfile />} />
          <Route path="/people/families/:id" element={<FamilyDetail />} />
          <Route path="/people/mentors/:id" element={<MentorDetail />} />
          <Route path="/report" element={<Report />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AppProvider>
  )
}
