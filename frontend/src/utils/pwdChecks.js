// Shared password-strength logic. Mirrored by app/schemas/auth.py::password_strong.

export function pwdChecks(pwd) {
  return {
    length: pwd.length >= 8,
    upper: /[A-Z]/.test(pwd),
    special: /[\d\W]/.test(pwd),
    maxlen: new TextEncoder().encode(pwd).length <= 72,
  }
}

export function isPwdValid(pwd) {
  const c = pwdChecks(pwd)
  return c.length && c.upper && c.special && c.maxlen
}

// 0 (none/invalid length), 1 (weak), 2 (fair), 3 (strong)
export function pwdStrength(pwd) {
  if (!pwd) return 0
  const c = pwdChecks(pwd)
  if (!c.maxlen) return 0
  const score = [c.length, c.upper, c.special].filter(Boolean).length
  return score // 0..3
}
