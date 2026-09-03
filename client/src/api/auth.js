const ADMIN_EMAIL = 'admin@admin.com'
const ADMIN_PASSWORD = '123456'
const AUTH_KEY = 'word_admin_auth'

export function saveAdminSession(admin, password) {
  localStorage.setItem(
    AUTH_KEY,
    JSON.stringify({
      email: admin?.email || ADMIN_EMAIL,
      name: admin?.name || 'Admin',
      password: password || ADMIN_PASSWORD,
      loggedInAt: new Date().toISOString(),
    }),
  )
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

export function getAdminEmail() {
  return getAdminSession()?.email || ''
}

export function isAdminAuthenticated() {
  return Boolean(getAdminSession())
}
