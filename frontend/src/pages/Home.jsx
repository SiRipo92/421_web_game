import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Die } from '../components/shared/Die.jsx'
import { ChipStack } from '../components/shared/ChipStack.jsx'
import { ComboTable } from '../components/shared/ComboTable.jsx'
import { useLang } from '../context/LangContext.jsx'
import { joinGame } from '../api/game.js'

export function Home({ user, token }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [name, setName] = useState(user?.username || '')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const handleCreate = () => {
    if (!name.trim()) { setError(t('err_name_required')); return }
    sessionStorage.setItem('playerName', name.trim())
    navigate('/create')
  }

  const handleJoinCode = async () => {
    if (!name.trim()) { setError(t('err_name_required')); return }
    if (!code.trim()) { setError(t('err_code_required')); return }
    setError('')
    try {
      const res = await joinGame(code.trim().toUpperCase(), name.trim(), token)
      if (res.error) { setError(t('err_game_not_found')); return }
      sessionStorage.setItem('playerName', name.trim())
      navigate(`/waiting/${res.game_id}?pid=${res.player_id}`)
    } catch {
      setError(t('err_game_not_found'))
    }
  }

  const handleQuickMatch = () => {
    if (!name.trim()) { setError(t('err_name_required')); return }
    sessionStorage.setItem('playerName', name.trim())
    navigate('/lobby')
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2.5rem 1.5rem 4rem' }}>

      {/* Hero */}
      <section style={{
        display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '3rem',
        alignItems: 'center', marginBottom: '3.5rem',
      }} className="hero-grid">
        <div>
          <div className="eyebrow" style={{ marginBottom: 16 }}>
            <span style={{ color: 'var(--rouge)' }}>❦</span> {t('tagline')}
          </div>
          <h1 className="display" style={{ fontSize: 'clamp(3.5rem, 8vw, 5.5rem)', margin: '0 0 1.5rem', lineHeight: 0.92 }}>
            {t('hero_h1_pre')}<br />
            <span style={{ color: 'var(--rouge)', fontStyle: 'italic' }}>{t('hero_h1_em')}</span><br />
            {t('hero_h1_post')}
          </h1>
          <p className="serif" style={{ fontSize: '1.2rem', color: 'var(--ink-soft)', maxWidth: 480, marginBottom: '2rem', lineHeight: 1.5 }}>
            {t('hero_desc')}
          </p>

          <form onSubmit={(e) => { e.preventDefault(); handleCreate() }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 460 }}>
            <div>
              <label className="field-label" htmlFor="player-name">{t('your_name')}</label>
              <input
                id="player-name"
                className="input"
                placeholder="Marcel, Yvette, Jean-Luc…"
                value={name}
                onChange={e => { setName(e.target.value); setError('') }}
                maxLength={20}
                autoComplete="nickname"
              />
            </div>
            {error && <p style={{ color: 'var(--rouge)', fontSize: '0.9rem', margin: 0 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primary">
                ❦ {t('create_room')}
              </button>
              <button type="button" onClick={handleQuickMatch} className="btn btn-rouge">
                ⚡ {t('quick_match')}
              </button>
            </div>
            <div className="hr-orn" style={{ marginTop: 8, marginBottom: 8 }}>
              <span style={{ fontSize: '0.75rem', fontStyle: 'italic' }}>{t('or')}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label className="field-label" htmlFor="game-code">{t('game_code')}</label>
                <input
                  id="game-code"
                  className="input mono"
                  placeholder="A4FB9X2E"
                  maxLength={8}
                  style={{ textTransform: 'uppercase', letterSpacing: '0.2em' }}
                  value={code}
                  onChange={e => { setCode(e.target.value.toUpperCase()); setError('') }}
                />
              </div>
              <button type="button" onClick={handleJoinCode} className="btn btn-ghost">
                {t('join_code')}
              </button>
            </div>
          </form>

          <div style={{ marginTop: '2rem', fontSize: '0.95rem', color: 'var(--ink-mute)' }} className="serif">
            <span style={{ fontStyle: 'italic' }}>{t('new_to_421')}</span>
            <button className="btn-link" onClick={() => navigate('/login?tab=register')}>{t('register')}</button>
            <span style={{ margin: '0 0.6rem', color: 'var(--rule)' }}>·</span>
            <span style={{ fontStyle: 'italic' }}>{t('already_account')}</span>
            <button className="btn-link" onClick={() => navigate('/login')}>{t('login')}</button>
          </div>
        </div>

        {/* Hero illustration */}
        <div style={{ position: 'relative', aspectRatio: '1/1', maxWidth: 480, margin: '0 auto', width: '100%' }}>
          <div className="piste" style={{ position: 'absolute', inset: 0 }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', display: 'flex', gap: 18 }}>
              <Die value={4} /><Die value={2} /><Die value={1} />
            </div>
            <div style={{ position: 'absolute', bottom: '14%', left: '50%', transform: 'translateX(-50%)' }}>
              <ChipStack count={11} />
            </div>
            <div style={{
              position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)',
              fontFamily: 'var(--display)', fontStyle: 'italic', color: 'var(--paper-deep)',
              fontSize: '1.1rem', letterSpacing: '0.12em', whiteSpace: 'nowrap',
            }}>❦ Le Tapis ❦</div>
          </div>
          <div className="stamp" style={{ position: 'absolute', top: '6%', right: '-2%', background: 'var(--paper-soft)' }}>
            Maison<br />de jeu
          </div>
        </div>
      </section>

      <div className="divider-fleuron"><span>❦</span></div>

      {/* Option cards */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginTop: '2rem' }} className="opt-grid">
        <OptionCard number="I" title={t('private_room')} subtitle={t('card_private_sub')}
          desc={t('card_private_desc')} accent="var(--rouge)" icon="🗝️" />
        <OptionCard number="II" title={t('quick_match')} subtitle={t('card_quick_sub')}
          desc={t('card_quick_desc')} accent="var(--brass-deep)" icon="⚡" />
        <OptionCard number="III" title={t('register')} subtitle={t('card_account_sub')}
          desc={t('card_account_desc')} accent="var(--felt-deep)" icon="📒" />
      </section>

      {/* Combo hierarchy teaser */}
      <section style={{ marginTop: '3.5rem', display: 'grid', gridTemplateColumns: '2fr 3fr', gap: '3rem', alignItems: 'start' }} className="rules-grid">
        <div>
          <div className="eyebrow">{t('combo_memo')}</div>
          <h2 className="display" style={{ fontSize: '2.4rem', margin: '0.5rem 0 1rem' }}>
            {t('combo_hier_title')}
          </h2>
          <p className="note">{t('combo_hier_sub')}</p>
        </div>
        <div className="ticket" style={{ padding: '0 0.5rem' }}>
          <ComboTable />
        </div>
      </section>

      <style>{`
        @media (max-width: 900px) {
          .hero-grid, .rules-grid { grid-template-columns: 1fr !important; }
          .opt-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          .hero-grid { gap: 2rem !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .die-tumble { animation: none !important; }
        }
      `}</style>
    </div>
  )
}

function OptionCard({ number, title, subtitle, desc, accent, icon }) {
  return (
    <div className="card card-stamp" style={{ padding: '1.8rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div className="display" style={{ fontSize: '3rem', color: accent, opacity: 0.3, lineHeight: 0.8 }}>{number}</div>
        <div style={{ fontSize: '1.6rem' }} aria-hidden="true">{icon}</div>
      </div>
      <div className="eyebrow" style={{ color: accent }}>{subtitle}</div>
      <h3 className="display" style={{ fontSize: '1.6rem', margin: '0 0 0.25rem' }}>{title}</h3>
      <p className="serif" style={{ margin: 0, color: 'var(--ink-soft)', lineHeight: 1.5 }}>{desc}</p>
    </div>
  )
}
