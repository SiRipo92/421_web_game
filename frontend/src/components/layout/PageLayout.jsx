import { TopBar } from '../shared/TopBar.jsx'
import { Footer } from './Footer.jsx'

export function PageLayout({ user, onLogout, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopBar user={user} onLogout={onLogout} />
      <main style={{ flex: 1 }}>
        {children}
      </main>
      <Footer />
    </div>
  )
}
