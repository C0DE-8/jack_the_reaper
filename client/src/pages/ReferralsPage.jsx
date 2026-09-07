import { useEffect, useState } from 'react'
import api, { apiErrorMessage } from '../api/adminApi.js'

const publicUrl = (import.meta.env.VITE_PUBLIC_URL || 'https://truxhubline.space').replace(/\/+$/, '')

function referralUrl(referral) {
  const path = referral.path || `/?ref=${referral.code}`
  return `${publicUrl}${path.startsWith('/') ? path : `/${path}`}`
}

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState([])
  const [telegramUsers, setTelegramUsers] = useState([])
  const [assignments, setAssignments] = useState([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    const [{ data }, { data: telegram }] = await Promise.all([api.get('/referrals'), api.get('/referrals/telegram-users')])
    setReferrals(data.referrals || []); setTelegramUsers(telegram.telegramUsers || []); setAssignments(telegram.assignments || [])
    setError('')
  }

  useEffect(() => {
    let active = true
    Promise.all([api.get('/referrals'), api.get('/referrals/telegram-users')])
      .then(([{ data }, { data: telegram }]) => {
        if (!active) return
        setReferrals(data.referrals || [])
        setTelegramUsers(telegram.telegramUsers || []); setAssignments(telegram.assignments || [])
        setError('')
      })
      .catch(requestError => { if (active) setError(apiErrorMessage(requestError)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function createReferral(event) {
    event.preventDefault()
    if (!name.trim()) return setError('Enter a campaign name for the referral link.')
    try {
      setSaving(true); setError(''); setNotice('')
      const { data } = await api.post('/referrals', { name: name.trim() })
      setName(''); await load(); setNotice(`Referral link created: ${referralUrl(data)}`)
    } catch (requestError) { setError(apiErrorMessage(requestError)) } finally { setSaving(false) }
  }

  async function updateReferral(referral, changes) {
    try {
      setSaving(true); setError(''); setNotice('')
      await api.put(`/referrals/${referral.id}`, { active: Boolean(referral.active), ...changes })
      await load(); setNotice(`${referral.name} updated.`)
    } catch (requestError) { setError(apiErrorMessage(requestError)) } finally { setSaving(false) }
  }

  async function updateTelegramUser(user, alertLevel, referralIds) {
    try {
      setSaving(true); setError(''); setNotice('')
      await api.put(`/referrals/telegram-users/${encodeURIComponent(user.chat_id)}`, { alertLevel, authorized: Boolean(user.authorized), referralIds })
      await load(); setNotice('Telegram access updated.')
    } catch (requestError) { setError(apiErrorMessage(requestError)) } finally { setSaving(false) }
  }

  return <section className="referrals-page">
    <header className="page-header"><div><h1>Referral links</h1><p>Create and manage campaign URLs.</p></div><button type="button" disabled={loading || saving} onClick={() => { setLoading(true); load().finally(() => setLoading(false)) }}>Refresh</button></header>
    {error && <p role="alert">{error}</p>}{notice && <p className="operator-notice" role="status">{notice}</p>}
    <form className="operator-link-creator" onSubmit={createReferral}>
      <div><h2>Create referral link</h2><p>Links are stable and can be assigned after creation.</p></div>
      <label>Campaign name<input value={name} maxLength={80} placeholder="Jane Morgan campaign" onChange={event => setName(event.target.value)} /></label>
      <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create link'}</button>
    </form>
    {loading && <p>Loading referral links…</p>}
    {!loading && referrals.length === 0 && <p>No referral links yet.</p>}
    {referrals.length > 0 && <div className="referral-table"><table><thead><tr><th>Campaign</th><th>Link</th><th>Status</th></tr></thead><tbody>{referrals.map(referral => <tr key={referral.id}><td>{referral.name}</td><td><a href={referralUrl(referral)} target="_blank" rel="noreferrer">{referralUrl(referral)}</a></td><td><button type="button" disabled={saving} onClick={() => updateReferral(referral, { active: !referral.active })}>{referral.active ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody></table></div>}
    <h2>Telegram alert access</h2><p>Level 1 receives all alerts. Level 2 receives alerts only for assigned referral links.</p>
    {telegramUsers.length === 0 && <p>No Telegram users yet. Ask them to message the bot first.</p>}
    {telegramUsers.map(user => { const assigned = assignments.filter(item => item.chat_id === user.chat_id).map(item => String(item.referral_id)); return <form key={user.chat_id} className="operator-link-creator" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); updateTelegramUser(user, form.get('alertLevel'), form.getAll('referralIds')) }}><div><h2>{[user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || `Telegram ${user.chat_id}`}</h2><p>{user.username ? `@${user.username}` : user.chat_id}</p></div><label>Access level<select name="alertLevel" defaultValue={user.alert_level || 'level1'}><option value="level1">Level 1 — all alerts</option><option value="level2">Level 2 — assigned links</option></select></label><label>Assigned links<select name="referralIds" multiple defaultValue={assigned}>{referrals.map(referral => <option key={referral.id} value={referral.id}>{referral.name}</option>)}</select></label><button type="submit" disabled={saving}>Save access</button></form> })}
  </section>
}
