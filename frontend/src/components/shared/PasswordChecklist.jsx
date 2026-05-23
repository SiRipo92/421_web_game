import { useLang } from '../../context/useLang.js'
import { pwdChecks, pwdStrength } from '../../utils/pwdChecks.js'

const STRENGTH_COLORS = ['var(--ink-fade)', 'var(--rouge)', 'var(--brass)', 'var(--felt-deep)']
const STRENGTH_KEYS = ['pwd_strength_none', 'pwd_strength_weak', 'pwd_strength_fair', 'pwd_strength_strong']

export function PasswordChecklist({ password }) {
  const { t } = useLang()
  const checks = pwdChecks(password)
  const strength = pwdStrength(password)
  const rows = [
    { key: 'length', label: t('pwd_req_length') },
    { key: 'upper', label: t('pwd_req_upper') },
    { key: 'special', label: t('pwd_req_special') },
    { key: 'maxlen', label: t('pwd_req_maxlen') },
  ]
  const color = STRENGTH_COLORS[strength]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
      {/* 3-segment strength meter — visible even before typing (all greyed) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} aria-label={t(STRENGTH_KEYS[strength])}>
        <div style={{ display: 'flex', gap: 3, flex: 1 }}>
          {[1, 2, 3].map(level => (
            <div
              key={level}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: strength >= level ? color : 'var(--rule)',
                transition: 'background 0.18s',
              }}
            />
          ))}
        </div>
        <span
          className="serif"
          style={{ fontSize: '0.72rem', color, fontStyle: 'italic', minWidth: 50, textAlign: 'right' }}
        >
          {password ? t(STRENGTH_KEYS[strength]) : ''}
        </span>
      </div>

      {/* Requirements checklist — always visible so the user knows what's expected */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {rows.map(r => (
          <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
            <span style={{ color: checks[r.key] ? 'var(--felt-deep)' : 'var(--ink-fade)', fontWeight: 700, lineHeight: 1 }}>
              {checks[r.key] ? '✓' : '○'}
            </span>
            <span style={{ color: checks[r.key] ? 'var(--ink-soft)' : 'var(--ink-fade)' }} className="serif">
              {r.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
