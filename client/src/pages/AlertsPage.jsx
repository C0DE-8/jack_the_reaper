import { useEffect, useMemo, useState } from 'react'
import api, { apiErrorMessage, fetchAccounts } from '../api/adminApi.js'

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([])
  const [accounts, setAccounts] = useState([])
  const [accountSearch, setAccountSearch] = useState('')
  const [form, setForm] = useState({ title: '', message: '', severity: 'info', targetAccountNumber: '', expiresAt: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    const { data } = await api.get('/alerts')
    setAlerts(data.alerts || [])
  }

  useEffect(() => {
    let active = true
    async function loadInitial() {
      try {
        const [{ data }, accountData] = await Promise.all([api.get('/alerts'), fetchAccounts(100)])
        if (active) {
          setAlerts(data.alerts || [])
          setAccounts(accountData)
        }
      } catch (requestError) {
        if (active) setError(apiErrorMessage(requestError))
      } finally {
        if (active) setLoading(false)
      }
    }
    loadInitial()
    return () => { active = false }
  }, [])

  const filteredAccounts = useMemo(() => {
    const search = accountSearch.trim().toLowerCase()
    if (!search) return accounts
    return accounts.filter(account =>
      String(account.accountNumber || '').toLowerCase().includes(search)
      || String(account.title || '').toLowerCase().includes(search),
    )
  }, [accountSearch, accounts])

  async function sendAlert(event) {
    event.preventDefault()
    try {
      setSaving(true); setError(''); setNotice('')
      await api.post('/alerts', { ...form, targetAccountNumber: form.targetAccountNumber || null, expiresAt: form.expiresAt || null })
      setForm({ title: '', message: '', severity: 'info', targetAccountNumber: '', expiresAt: '' })
      setAccountSearch('')
      await load()
      setNotice('Alert sent. It will appear on the matching user dashboards.')
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally { setSaving(false) }
  }

  async function toggle(alert) {
    try {
      setSaving(true); setError(''); setNotice('')
      await api.patch(`/alerts/${alert.id}`, { active: !alert.active })
      await load()
    } catch (requestError) { setError(apiErrorMessage(requestError)) } finally { setSaving(false) }
  }

  return <section className="page-stack alerts-admin-page">
    <header className="page-header"><div><span className="eyebrow">Messaging</span><h1>User alerts</h1><p>Send a dashboard popup to every user or one account.</p></div></header>
    {error && <div className="alert error" role="alert">{error}</div>}
    {notice && <div className="alert success" role="status">{notice}</div>}
    <form className="panel alert-compose" onSubmit={sendAlert}>
      <div className="panel-title"><h2>Create alert</h2></div>
      <div className="alert-form-grid">
        <label>Title<input required maxLength={120} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Important update" /></label>
        <label>Type<select value={form.severity} onChange={event => setForm({ ...form, severity: event.target.value })}><option value="info">Information</option><option value="success">Success</option><option value="warning">Warning</option><option value="error">Urgent / error</option></select></label>
        <label className="alert-account-picker">Target account (optional)
          <input type="search" value={accountSearch} onChange={event => setAccountSearch(event.target.value)} placeholder="Search by user title or account number…" />
          <select value={form.targetAccountNumber} onChange={event => setForm({ ...form, targetAccountNumber: event.target.value })}>
            <option value="">All users</option>
            {filteredAccounts.map(account => <option key={account.id} value={account.accountNumber}>{account.title || 'Untitled user'} — {account.accountNumber}</option>)}
          </select>
          <small>{loading ? 'Loading users…' : `${filteredAccounts.length} of ${accounts.length} users shown`}</small>
        </label>
        <label>Expires (optional)<input type="datetime-local" value={form.expiresAt} onChange={event => setForm({ ...form, expiresAt: event.target.value })} /></label>
        <label className="alert-message-field">Message<textarea required maxLength={5000} rows={5} value={form.message} onChange={event => setForm({ ...form, message: event.target.value })} placeholder="Write the message users should see…" /></label>
      </div>
      <button className="primary-button" disabled={saving} type="submit">{saving ? 'Sending…' : 'Send alert'}</button>
    </form>
    <article className="panel"><div className="panel-title"><h2>Alert history</h2></div>
      {loading ? <p>Loading alerts…</p> : alerts.length === 0 ? <p>No alerts have been sent.</p> : <div className="table-wrap"><table><thead><tr><th>Alert</th><th>Target</th><th>Type</th><th>Created</th><th>Status</th></tr></thead><tbody>{alerts.map(alert => <tr key={alert.id}><td><strong>{alert.title}</strong><span className="muted-text alert-table-message">{alert.message}</span></td><td>{alert.targetAccountNumber || 'All users'}</td><td>{alert.severity}</td><td>{new Date(alert.createdAt).toLocaleString()}</td><td><button type="button" disabled={saving} onClick={() => toggle(alert)}>{alert.active ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody></table></div>}
    </article>
  </section>
}
