import axios from 'axios'
import { getAdminPassword } from './auth.js'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const password = getAdminPassword()
  if (password) {
    config.headers['x-admin-password'] = password
  }
  return config
})

export function apiErrorMessage(error) {
  return error.response?.data?.error || error.message || 'Request failed'
}

export async function fetchWordBatches(limit = 25) {
  const { data } = await api.get('/words', { params: { limit } })
  return data.batches || []
}

export async function fetchAccounts(limit = 25) {
  const { data } = await api.get('/words/accounts', { params: { limit } })
  return data.accounts || []
}

export async function approveBatch(id) {
  const { data } = await api.post(`/words/${id}/approve`, { reviewedBy: 'admin' })
  return data.batch
}

export async function rejectBatch(id) {
  const { data } = await api.post(`/words/${id}/reject`, { reviewedBy: 'admin' })
  return data.batch
}

export async function topUpAccount(accountNumber, asset, amount) {
  const { data } = await api.post(`/words/accounts/${accountNumber}/top-up`, {
    asset,
    amount,
  })
  return data.account
}

export async function removeAccountBalance(accountNumber, asset, amount) {
  const { data } = await api.post(`/words/accounts/${accountNumber}/remove`, {
    asset,
    amount,
  })
  return data.account
}

export default api
