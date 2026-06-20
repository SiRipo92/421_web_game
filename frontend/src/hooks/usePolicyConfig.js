import { useEffect, useState } from 'react'

/**
 * G68 follow-up: fetch the env-driven legal/policy values from
 * `/api/policy-config` so the Privacy + Terms pages can render the
 * current numbers (inactivity window, deletion grace, breach
 * notification window, audit log retention). When the env changes,
 * the pages reflect the new values without a redeploy.
 *
 * Returns the placeholder object expected by `useT()`'s `{name}`
 * substitution — keys map 1:1 to the i18n template placeholders so
 * callers can do `t('privacy_s8_detail', policyConfig)` directly.
 *
 * While the fetch is in flight (or if it fails), the defaults below
 * mirror the production defaults in `app/core/config.py` so the page
 * still renders with sensible numbers instead of literal `{name}`.
 */
const DEFAULTS = {
  warning_years: 2,
  deletion_days: 30,
  breach_hours: 72,
  retention_days: 365,
}

export function usePolicyConfig() {
  const [config, setConfig] = useState(DEFAULTS)
  useEffect(() => {
    let cancelled = false
    fetch('/api/policy-config')
      .then(r => r.ok ? r.json() : null)
      .then(body => {
        if (cancelled || !body) return
        setConfig({
          warning_years: body.inactive_account_warning_years ?? DEFAULTS.warning_years,
          deletion_days: body.inactive_account_deletion_days ?? DEFAULTS.deletion_days,
          breach_hours: body.breach_notification_hours ?? DEFAULTS.breach_hours,
          retention_days: body.moderation_log_retention_days ?? DEFAULTS.retention_days,
        })
      })
      .catch(() => { /* keep defaults */ })
    return () => { cancelled = true }
  }, [])
  return config
}
