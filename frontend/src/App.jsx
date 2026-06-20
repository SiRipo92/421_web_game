import { Routes, Route } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { useAuth } from './hooks/useAuth.js'
import { PageLayout } from './components/layout/PageLayout.jsx'
import { CookieBanner } from './components/shared/CookieBanner.jsx'
import { Home } from './pages/Home.jsx'
import { Login } from './pages/Login.jsx'
import { ForgotPassword } from './pages/ForgotPassword.jsx'
import { ResetPassword } from './pages/ResetPassword.jsx'
import { CreateRoom } from './pages/CreateRoom.jsx'
import { Waiting } from './pages/Waiting.jsx'
import { Game } from './pages/Game.jsx'
import { Lobby } from './pages/Lobby.jsx'
import { Rankings } from './pages/Rankings.jsx'
import { Profile } from './pages/Profile.jsx'
import { HowToPlay } from './pages/HowToPlay.jsx'
import { Privacy } from './pages/Privacy.jsx'
import { TermsAndConditions } from './pages/TermsAndConditions.jsx'
import { CompleteProfile } from './pages/CompleteProfile.jsx'
import { Contact } from './pages/Contact.jsx'
import { Unsubscribed } from './pages/Unsubscribed.jsx'
import { AdminDashboard } from './pages/AdminDashboard.jsx'
import { AdminUsers } from './pages/AdminUsers.jsx'
import { AdminUserDetail } from './pages/AdminUserDetail.jsx'
import { AdminAudit } from './pages/AdminAudit.jsx'
import { AdminRooms } from './pages/AdminRooms.jsx'
import { AdminRoomDetail } from './pages/AdminRoomDetail.jsx'

export default function App() {
  const { user, token, loading, login, register, googleLogin, refreshUser, logout } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="display" style={{ fontSize: '2rem', color: 'var(--ink-mute)', fontStyle: 'italic' }}>
          Le bistrot ouvre ses portes…
        </div>
      </div>
    )
  }

  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''}>
    <CookieBanner />
    <Routes>
      {/* Game uses full viewport — no layout chrome */}
      <Route path="/game/:gameId" element={<Game token={token} />} />
      <Route path="*" element={
        <PageLayout user={user} onLogout={logout}>
          <Routes>
            <Route path="/" element={<Home user={user} token={token} />} />
            <Route path="/login" element={<Login onLogin={login} onRegister={register} onGoogleLogin={googleLogin} />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/create" element={<CreateRoom token={token} />} />
            <Route path="/waiting/:gameId" element={<Waiting token={token} />} />
            <Route path="/lobby" element={<Lobby token={token} />} />
            <Route path="/rankings" element={<Rankings user={user} />} />
            <Route path="/profile" element={<Profile user={user} token={token} onRefreshUser={refreshUser} onLogout={logout} />} />
            <Route path="/how-to-play" element={<HowToPlay />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<TermsAndConditions />} />
            <Route path="/complete-profile" element={<CompleteProfile user={user} token={token} onRefreshUser={refreshUser} />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/unsubscribed" element={<Unsubscribed />} />
            <Route path="/admin" element={<AdminDashboard user={user} token={token} />} />
            <Route path="/admin/users" element={<AdminUsers user={user} token={token} />} />
            <Route path="/admin/users/:userId" element={<AdminUserDetail user={user} token={token} />} />
            <Route path="/admin/audit" element={<AdminAudit user={user} token={token} />} />
            <Route path="/admin/rooms" element={<AdminRooms user={user} token={token} />} />
            <Route path="/admin/rooms/:gameId" element={<AdminRoomDetail user={user} token={token} />} />
          </Routes>
        </PageLayout>
      } />
    </Routes>
    </GoogleOAuthProvider>
  )
}
