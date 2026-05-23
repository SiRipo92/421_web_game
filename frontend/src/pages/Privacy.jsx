import { Link } from 'react-router-dom'
import { useLang } from '../context/useLang.js'
import { clearCookieConsent, getCookieConsent } from '../utils/consent.js'

export function Privacy() {
  const { t } = useLang()
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <div className="eyebrow">RGPD</div>
      <h1 className="display" style={{ fontSize: 'clamp(2.4rem, 5vw, 3.2rem)', margin: '0.3rem 0 1.5rem' }}>
        {t('privacy_title')}
      </h1>

      <div className="ticket" style={{ padding: '2rem', lineHeight: 1.7 }}>
        <Section title="1. Responsable du traitement">
          <p>421 Bistro</p>
        </Section>
        <Section title="2. Données collectées">
          <ul>
            <li>Nom d'utilisateur, adresse e-mail, date de naissance (lors de l'inscription)</li>
            <li>Historique des parties, score Elo, statistiques de jeu</li>
            <li>Adresse IP lors de la création du compte (conservée dans les journaux d'audit)</li>
          </ul>
        </Section>
        <Section title="3. Finalités">
          <ul>
            <li>Gestion du compte et authentification</li>
            <li>Classement et statistiques de jeu</li>
            <li>Envoi d'e-mails transactionnels (réinitialisation de mot de passe)</li>
            <li>E-mails promotionnels (uniquement si vous y avez consenti)</li>
          </ul>
        </Section>
        <Section title="4. Durée de conservation">
          <p>Les données sont conservées pendant la durée du compte, puis supprimées 30 jours après la demande de suppression.</p>
        </Section>
        <Section title="5. Vos droits">
          <p>
            Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement et de portabilité de vos données.
            Pour exercer ces droits, utilisez le <Link to="/contact" style={{ color: 'var(--rouge)' }}>formulaire de contact</Link> en bas de page.
          </p>
        </Section>
        <Section title="6. Cookies & stockage local">
          <p>
            Aucun cookie tiers, aucun script de suivi publicitaire. Le site utilise
            uniquement le <code>localStorage</code> de votre navigateur pour des fonctions
            essentielles : votre jeton d'authentification, votre langue et votre thème.
          </p>
          <p style={{ marginTop: '0.5rem' }}>
            Si nous ajoutons à l'avenir des outils statistiques anonymes, ils ne se
            chargeront que si vous avez accepté via la bannière de consentement.
            État actuel de votre choix :{' '}
            <strong>{getCookieConsent() ?? 'non défini'}</strong>.{' '}
            <button
              type="button"
              onClick={() => { clearCookieConsent(); window.location.reload() }}
              className="btn-link"
              style={{ fontSize: '0.9rem' }}
            >
              Modifier mon choix
            </button>
          </p>
        </Section>
        <Section title="7. Contact DPO">
          <p>Pour toute question relative à vos données, utilisez le <Link to="/contact" style={{ color: 'var(--rouge)' }}>formulaire de contact</Link>.</p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: '1.5rem' }}>
      <h2 className="display" style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>{title}</h2>
      <div className="serif" style={{ color: 'var(--ink-soft)' }}>{children}</div>
    </section>
  )
}
