const ADMIN_EMAIL = 'admin@admin.com'
const ADMIN_PASSWORD = '123456'
const AUTH_KEY = 'word_admin_auth'

export function loginAdmin(email, password) {
  const validEmail = String(email || '').trim().toLowerCase() === ADMIN_EMAIL
  const validPassword = String(password || '') === ADMIN_PASSWORD

  if (!validEmail || !validPassword) {
    return { ok: false, error: 'Invalid admin email or password' }
  }

  localStorage.setItem(
    AUTH_KEY,
    JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      loggedInAt: new Date().toISOString(),
    }),
  )

  return { ok: true }
}

export function logoutAdmin() {
  localStorage.removeItem(AUTH_KEY)
}

export function getAdminSession() {
  try {
    const session = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null')
    return session?.email === ADMIN_EMAIL && session?.password === ADMIN_PASSWORD
      ? session
      : null
  } catch {
    return null
  }
}

export function getAdminPassword() {
  return getAdminSession()?.password || ''
}

export function isAdminAuthenticated() {
  return Boolean(getAdminSession())
}
