import { useState } from 'react'
import { useLang } from '../../context/LangContext.jsx'

export function ShareButtons({ code, plugins = [] }) {
  const { t } = useLang()
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard?.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button type="button" onClick={handleCopy} className="btn btn-ghost" aria-label={t('copy')}>
        {copied ? `✓ ${t('copied')}` : `📋 ${t('copy')}`}
      </button>
      {plugins.map((plugin) => (
        <a
          key={plugin.name}
          href={plugin.url_template.replace('{code}', encodeURIComponent(code))}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost"
        >
          {plugin.icon} {plugin.name}
        </a>
      ))}
    </div>
  )
}
