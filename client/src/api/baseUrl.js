function normalizeApiBaseUrl(value) {
  const baseUrl = String(value || '/api').replace(/\/+$/, '')

  // Development already proxies `/api` to the backend. The hosted API value
  // is a bare origin, while the backend exposes its routes under `/api`.
  if (baseUrl === '/api' || /\/api$/i.test(baseUrl)) return baseUrl
  return `${baseUrl}/api`
}

export const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL)
