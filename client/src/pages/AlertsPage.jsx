import { useEffect, useMemo, useState } from 'react'
import { FiEdit2, FiSave, FiTrash2, FiX } from 'react-icons/fi'
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
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', message: '', severity: 'info', targetAccountNumber: '', expiresAt: '' })

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

  function dateTimeInputValue(value) {
    if (!value) return ''
    const date = new Date(value)
    const offset = date.getTimezoneOffset() * 60000
    return new Date(date.getTime() - offset).toISOString().slice(0, 16)
  }

  function openEditor(alert) {
    setEditTarget(alert)
    setEditForm({
      title: alert.title,
      message: alert.message,
      severity: alert.severity,
      targetAccountNumber: alert.targetAccountNumber || '',
      expiresAt: dateTimeInputValue(alert.expiresAt),
    })
  }

  async function saveAlert(event) {
    event.preventDefault()
    try {
      setSaving(true); setError(''); setNotice('')
      const { data } = await api.put(`/alerts/${editTarget.id}`, {
        ...editForm,
        targetAccountNumber: editForm.targetAccountNumber || null,
        expiresAt: editForm.expiresAt || null,
      })
      setAlerts(current => current.map(alert => alert.id === data.alert.id ? data.alert : alert))
      setEditTarget(null)
      setNotice('Alert information updated successfully.')
    } catch (requestError) { setError(apiErrorMessage(requestError)) } finally { setSaving(false) }
  }

  async function deleteAlert() {
    try {
      setSaving(true); setError(''); setNotice('')
      await api.delete(`/alerts/${deleteTarget.id}`)
      setAlerts(current => current.filter(alert => alert.id !== deleteTarget.id))
      setDeleteTarget(null)
      setNotice('Alert deleted successfully.')
    } catch (requestError) { setError(apiErrorMessage(requestError)) } finally { setSaving(false) }
  }

  return <section className="page-stack alerts-admin-page">
    {editTarget && <div className="admin-modal-backdrop" role="presentation"><form className="admin-modal alert-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-alert-title" onSubmit={saveAlert}>
      <div className="admin-modal-icon edit-icon" aria-hidden="true"><FiEdit2 /></div>
      <div className="admin-modal-copy"><span className="eyebrow">Published alert</span><h2 id="edit-alert-title">Edit alert</h2><p>Update the information users see on their dashboard.</p></div>
      <div className="alert-edit-fields">
        <label>Title<input autoFocus required maxLength={120} value={editForm.title} onChange={event => setEditForm({ ...editForm, title: event.target.value })} /></label>
        <label>Type<select value={editForm.severity} onChange={event => setEditForm({ ...editForm, severity: event.target.value })}><option value="info">Information</option><option value="success">Success</option><option value="warning">Warning</option><option value="error">Urgent / error</option></select></label>
        <label>Target account<select value={editForm.targetAccountNumber} onChange={event => setEditForm({ ...editForm, targetAccountNumber: event.target.value })}><option value="">All users</option>{accounts.map(account => <option key={account.id} value={account.accountNumber}>{account.title || 'Untitled user'} — {account.accountNumber}</option>)}</select></label>
        <label>Expires<input type="datetime-local" value={editForm.expiresAt} onChange={event => setEditForm({ ...editForm, expiresAt: event.target.value })} /></label>
        <label className="alert-edit-message">Message<textarea required maxLength={5000} rows={5} value={editForm.message} onChange={event => setEditForm({ ...editForm, message: event.target.value })} /></label>
      </div>
      <div className="admin-modal-actions"><button className="secondary-button" type="button" disabled={saving} onClick={() => setEditTarget(null)}><FiX aria-hidden="true" /> Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? <span className="button-spinner" aria-hidden="true" /> : <FiSave aria-hidden="true" />}{saving ? 'Saving…' : 'Save changes'}</button></div>
    </form></div>}
    {deleteTarget && <div className="admin-modal-backdrop" role="presentation"><section className="admin-modal danger-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-alert-title">
      <div className="admin-modal-icon" aria-hidden="true"><FiTrash2 /></div><div className="admin-modal-copy"><span className="eyebrow">Permanent action</span><h2 id="delete-alert-title">Delete this alert?</h2><p><strong>{deleteTarget.title}</strong> will be permanently removed from alert history and user dashboards.</p></div>
      <div className="admin-modal-actions"><button className="secondary-button" type="button" disabled={saving} onClick={() => setDeleteTarget(null)}>Cancel</button><button className="danger-button" type="button" disabled={saving} onClick={deleteAlert}>{saving ? <span className="button-spinner" aria-hidden="true" /> : <FiTrash2 aria-hidden="true" />}{saving ? 'Deleting…' : 'Delete alert'}</button></div>
    </section></div>}
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
      {loading ? <p>Loading alerts…</p> : alerts.length === 0 ? <p>No alerts have been sent.</p> : <div className="table-wrap"><table><thead><tr><th>Alert</th><th>Target</th><th>Type</th><th>Created</th><th>Actions</th></tr></thead><tbody>{alerts.map(alert => <tr key={alert.id}><td><strong>{alert.title}</strong><span className="muted-text alert-table-message">{alert.message}</span></td><td>{alert.targetAccountNumber || 'All users'}</td><td>{alert.severity}</td><td>{new Date(alert.createdAt).toLocaleString()}</td><td><div className="alert-row-actions"><button className="secondary-button alert-toggle-button" type="button" disabled={saving} onClick={() => toggle(alert)}>{alert.active ? 'Deactivate' : 'Activate'}</button><button className="icon-button" type="button" title={`Edit ${alert.title}`} disabled={saving} onClick={() => openEditor(alert)}><FiEdit2 aria-hidden="true" /></button><button className="icon-button danger" type="button" title={`Delete ${alert.title}`} disabled={saving} onClick={() => setDeleteTarget(alert)}><FiTrash2 aria-hidden="true" /></button></div></td></tr>)}</tbody></table></div>}
    </article>
  </section>
}
