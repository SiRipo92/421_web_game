import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Segment } from '../components/shared/Segment.jsx'
import { Stepper } from '../components/shared/Stepper.jsx'
import { useLang } from '../context/useLang.js'
import { createGame, joinGame } from '../api/game.js'

export function CreateRoom({ token }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [isPublic, setIsPublic] = useState(false)
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [bankRule, setBankRule] = useState('sec')
  const [afkSec, setAfkSec] = useState(45)
  const [afkBot, setAfkBot] = useState(true)
  const [allowSpectators, setAllowSpectators] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    const name = sessionStorage.getItem('playerName') || 'Joueur'
    setLoading(true)
    setError('')
    try {
      const { game_id } = await createGame(
        { is_public: isPublic, max_players: maxPlayers, bank_rule: bankRule, afk_seconds: afkSec, afk_bot: afkBot, allow_spectators: allowSpectators },
        token,
      )
      const res = await joinGame(game_id, name, token)
      navigate(`/waiting/${game_id}?pid=${res.player_id}`)
    } catch {
      setError(t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <button type="button" onClick={() => navigate('/')} className="btn-link" style={{ marginBottom: 16 }}>
        ← {t('back_home')}
      </button>
      <div className="eyebrow">Nouvelle table</div>
      <h1 className="display" style={{ fontSize: 'clamp(2.4rem, 5vw, 3.2rem)', margin: '0.4rem 0 0.5rem' }}>
        Préparez le <em style={{ color: 'var(--rouge)' }}>tapis</em>.
      </h1>
      <p className="note">Choisissez vos règles. Les habitués savent que la maison ne tranche pas — c'est vous qui décidez.</p>

      <div className="card" style={{ marginTop: '2.2rem', padding: '1.5rem 2rem' }}>
        <ConfigRow title="Type de partie" hint="Privée : code à partager. Publique : visible au comptoir.">
          <Segment
            value={isPublic ? 'public' : 'private'}
            onChange={v => setIsPublic(v === 'public')}
            ariaLabel="Type de partie"
            options={[
              { value: 'private', label: t('private_room') },
              { value: 'public', label: t('public_room') },
            ]}
          />
        </ConfigRow>

        <ConfigRow title={t('max_players')} hint={`${t('set_max_players')} · 2 à 5 joueurs`}>
          <Stepper value={maxPlayers} onChange={setMaxPlayers} min={2} max={5}
            suffix="joueurs" ariaLabel={t('max_players')} />
        </ConfigRow>

        <ConfigRow title={t('bank_rules')} hint="Comment la banque (11 fiches) est distribuée pendant la charge.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} role="radiogroup" aria-label={t('bank_rules')}>
            <RadioRow value={bankRule} setVal={setBankRule} k="sec"
              label={t('sec_jusqu_banque')} desc={t('sec_desc')} />
            <RadioRow value={bankRule} setVal={setBankRule} k="one"
              label={t('one_throw')} desc={t('one_desc')} />
            <RadioRow value={bankRule} setVal={setBankRule} k="free"
              label={t('free_play')} desc={t('free_desc')} />
          </div>
        </ConfigRow>

        <ConfigRow title={t('afk_timer')} hint={t('afk_takeover')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Stepper value={afkSec} onChange={setAfkSec} min={15} max={120}
              suffix={t('seconds')} ariaLabel={t('afk_timer')} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <div
                className="toggle"
                data-on={String(afkBot)}
                onClick={() => setAfkBot(!afkBot)}
                role="switch"
                aria-checked={afkBot}
                aria-label="L'ordi prend la main"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAfkBot(!afkBot) } }}
              />
              <span className="serif" style={{ fontStyle: 'italic', color: 'var(--ink-soft)' }}>
                L'ordi prend la main
              </span>
            </label>
          </div>
        </ConfigRow>

        <ConfigRow title={t('spectators')} hint={t('spectators_hint')}>
          <div
            className="toggle"
            data-on={String(allowSpectators)}
            onClick={() => setAllowSpectators(!allowSpectators)}
            role="switch"
            aria-checked={allowSpectators}
            aria-label={t('spectators')}
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAllowSpectators(!allowSpectators) } }}
          />
        </ConfigRow>
      </div>

      {error && <p style={{ color: 'var(--rouge)', marginTop: 16 }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div className="note">Vous pouvez modifier ces réglages dans la salle d'attente.</div>
        <button type="button" disabled={loading} className="btn btn-rouge" onClick={handleCreate}>
          {loading ? '…' : `❦ ${t('open_table')}`}
        </button>
      </div>
    </div>
  )
}

function ConfigRow({ title, hint, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '2rem', padding: '1.2rem 0', borderBottom: '1px dashed var(--rule)' }}
      className="config-row">
      <div>
        <div className="display" style={{ fontSize: '1.2rem' }}>{title}</div>
        <div className="note" style={{ marginTop: 4, fontSize: '0.9rem' }}>{hint}</div>
      </div>
      <div>{children}</div>
      <style>{`@media (max-width: 720px) { .config-row { grid-template-columns: 1fr !important; gap: 0.8rem !important; } }`}</style>
    </div>
  )
}

function RadioRow({ value, setVal, k, label, desc }) {
  const sel = value === k
  return (
    <button
      type="button"
      role="radio"
      aria-checked={sel}
      onClick={() => setVal(k)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 14, padding: '0.8rem 1rem',
        border: sel ? '1.5px solid var(--rouge)' : '1px solid var(--rule)',
        borderRadius: 3,
        background: sel ? 'rgba(168,48,42,0.06)' : 'var(--paper)',
        textAlign: 'left', cursor: 'pointer',
        minHeight: 44,
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        border: `1.5px solid ${sel ? 'var(--rouge)' : 'var(--ink-soft)'}`,
        flexShrink: 0, marginTop: 3,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {sel && <div style={{ width: 8, height: 8, background: 'var(--rouge)', borderRadius: '50%' }} />}
      </div>
      <div>
        <div className="display" style={{ fontSize: '1.05rem' }}>{label}</div>
        <div className="note" style={{ fontSize: '0.88rem', marginTop: 2 }}>{desc}</div>
      </div>
    </button>
  )
}
