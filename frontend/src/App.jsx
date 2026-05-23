import { Routes, Route } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { useAuth } from './hooks/useAuth.js'
import { PageLayout } from './components/layout/PageLayout.jsx'
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
import { CompleteProfile } from './pages/CompleteProfile.jsx'

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
            <Route path="/complete-profile" element={<CompleteProfile user={user} token={token} onRefreshUser={refreshUser} />} />
          </Routes>
        </PageLayout>
      } />
    </Routes>
    </GoogleOAuthProvider>
  )
}
