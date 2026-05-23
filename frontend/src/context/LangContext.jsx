import { useEffect, useState } from 'react'
import { useT } from '../i18n/index.js'
import { LangContext } from './useLang.js'

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'fr')

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang)
    localStorage.setItem('lang', lang)
  }, [lang])

  const t = useT(lang)

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  )
}
