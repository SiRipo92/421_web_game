import { useMemo } from 'react'

const HEADLINE_KEYS = new Set([
  'log_match_lost',
  'log_round_point',
  'log_tiebreak_start',
  'log_player_left',
  'log_player_kicked',
  'log_afk_takeover',
  'log_round_all_tie',
  'log_player_sits_out',
  'log_pool_empty',
  'log_new_set',
])

const MAX_CARDS = 5

function eventFingerprint(ev, idx) {
  if (!ev) return `idx-${idx}`
  const parts = [ev.key, ev.name, ev.names, ev.count, ev.num, ev.rank]
    .filter((v) => v !== undefined && v !== null)
    .join(':')
  return parts || `idx-${idx}`
}

export function CommentaryTicker({ events, t }) {
  // Pure derivation of the last MAX_CARDS headline events. No internal timer:
  // older cards naturally cycle out as newer headlines push them off the slice,
  // and the CSS slideIn animation gives each fresh card a visual "arrival".
  const cards = useMemo(() => {
    if (!events?.length) return []
    const out = []
    for (let i = events.length - 1; i >= 0 && out.length < MAX_CARDS; i--) {
      const ev = events[i]
      if (!HEADLINE_KEYS.has(ev?.key)) continue
      const params = { ...ev }
      delete params.key
      if (Array.isArray(params.dice)) params.dice = `[${params.dice.join('-')}]`
      out.push({
        id: eventFingerprint(ev, i),
        key: ev.key,
        text: t(ev.key, params),
      })
    }
    return out
  }, [events, t])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '1.2rem 1rem',
        height: '100%',
        overflow: 'hidden',
      }}
      aria-live="polite"
      aria-label={t('ticker_aria')}
    >
      <div>
        <div className="eyebrow">{t('ticker_eyebrow')}</div>
        <div className="display" style={{ fontSize: '1.2rem', marginTop: 4 }}>
          {t('ticker_title')}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
        {cards.length === 0 && (
          <p className="note" style={{ fontStyle: 'italic', fontSize: '0.82rem', margin: 0 }}>
            {t('ticker_empty')}
          </p>
        )}
        {cards.map((c) => (
          <TickerCard key={c.id} card={c} t={t} />
        ))}
      </div>
    </div>
  )
}

const TONE_BY_KEY = {
  log_match_lost: { accent: 'var(--rouge)', labelKey: 'ticker_label_match' },
  log_round_point: { accent: 'var(--rouge)', labelKey: 'ticker_label_match' },
  log_tiebreak_start: { accent: 'var(--brass-deep)', labelKey: 'ticker_label_tiebreak' },
  log_round_all_tie: { accent: 'var(--brass-deep)', labelKey: 'ticker_label_tiebreak' },
  log_player_left: { accent: 'var(--ink-mute)', labelKey: 'ticker_label_player' },
  log_player_kicked: { accent: 'var(--ink-mute)', labelKey: 'ticker_label_player' },
  log_player_sits_out: { accent: 'var(--ink-mute)', labelKey: 'ticker_label_player' },
  log_afk_takeover: { accent: 'var(--brass)', labelKey: 'ticker_label_afk' },
  log_pool_empty: { accent: 'var(--felt)', labelKey: 'ticker_label_phase' },
  log_new_set: { accent: 'var(--felt-deep)', labelKey: 'ticker_label_round' },
}

const DEFAULT_TONE = { accent: 'var(--ink-mute)', labelKey: 'ticker_label_event' }

function TickerCard({ card, t }) {
  const tone = TONE_BY_KEY[card.key] || DEFAULT_TONE
  return (
    <div
      style={{
        padding: '0.6rem 0.8rem',
        background: 'var(--paper)',
        borderLeft: `3px solid ${tone.accent}`,
        border: '1px solid var(--rule)',
        borderLeftWidth: '3px',
        borderRadius: 3,
        boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
        animation: 'tickerSlideIn 0.32s ease-out',
      }}
    >
      <div
        className="eyebrow"
        style={{ fontSize: '0.58rem', color: tone.accent, marginBottom: 2 }}
      >
        {t(tone.labelKey)}
      </div>
      <div className="serif" style={{ fontSize: '0.88rem', color: 'var(--ink)', lineHeight: 1.35 }}>
        {card.text}
      </div>
      <style>{`
        @keyframes tickerSlideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export function ScoreToBeatBanner({ plays, t }) {
  if (!plays?.length) return null
  const best = plays.reduce((acc, p) => {
    if (!acc) return p
    if ((p.rank ?? 0) > (acc.rank ?? 0)) return p
    if ((p.rank ?? 0) === (acc.rank ?? 0) && (p.fiches ?? 0) > (acc.fiches ?? 0)) return p
    return acc
  }, null)
  if (!best || !best.combo) return null
  const throws = (best.rolls_used ?? 0) + (best.is_starter ? 0 : 0) || 1
  return (
    <div
      style={{
        position: 'absolute',
        top: '17%',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: '0.5rem 1.1rem',
        background: 'rgba(0,0,0,0.55)',
        border: '1px solid rgba(212,171,103,0.45)',
        borderRadius: 4,
        color: 'var(--paper)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        maxWidth: '78%',
        whiteSpace: 'nowrap',
      }}
      role="status"
      aria-label={t('score_to_beat_aria', { name: best.name, combo: best.combo, fiches: best.fiches })}
    >
      <span
        className="eyebrow"
        style={{ fontSize: '0.58rem', color: 'var(--brass-soft)', letterSpacing: '0.16em' }}
      >
        {t('score_to_beat_label')}
      </span>
      <span
        className="display"
        style={{
          fontSize: '1.05rem',
          color: best.combo === '421' ? 'var(--brass-soft)' : 'var(--paper)',
          letterSpacing: '0.02em',
        }}
      >
        <em style={{ fontStyle: 'italic', color: 'var(--brass-soft)' }}>{best.name}</em>
        {' · '}
        {best.combo} <span className="mono" style={{ fontSize: '0.85rem' }}>({best.fiches}f)</span>
        {throws > 1 ? ` · ${t('score_to_beat_in_throws', { n: throws })}` : ''}
      </span>
    </div>
  )
}
