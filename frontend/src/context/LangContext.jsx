import { createContext, useContext, useEffect, useState } from 'react'
import { useT } from '../i18n/index.js'

const LangContext = createContext(null)

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

export function useLang() {
  return useContext(LangContext)
}
