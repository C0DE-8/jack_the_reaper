import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api, { apiErrorMessage } from '../api/adminApi.js'

export default function ActivityPage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState({ page: 1 })
  const [audit, setAudit] = useState(null)
  const [settings, setSettings] = useState(null)
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    api.get(`/activity${id ? `/${encodeURIComponent(id)}` : ''}`, { params: query }).then(({ data: result }) => { if (active) { setData(result); setError('') } }).catch(e => { if (active) setError(apiErrorMessage(e)) })
    return () => { active = false }
  }, [id, query, revision])
  async function action(fn) { try { setError(''); await fn() } catch (e) { setError(apiErrorMessage(e)) } }
  async function loadSettings() { const result = await api.get('/activity/settings'); setSettings(result.data) }
  async function exportEvents() {
    const result = await api.get('/activity/export', { params: query })
    const url = URL.createObjectURL(new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'activity.json'; link.click(); URL.revokeObjectURL(url)
    setNotice('Export downloaded (maximum 10,000 events). Export recorded in audit log.')
  }
  function filter(name, value) { setQuery(current => ({ ...current, [name]: value, page: 1 })) }
  return <section className="activity-page">
    <h1>God’s Eye</h1><p>Consented public activity · retained for 30 days</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!data && !error && <p>Loading activity…</p>}
    {id ? <><Link to="/admin/activity">Back to activity</Link>{data?.event && <><dl>{Object.entries(data.event).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{String(value ?? 'Unknown')}</dd></div>)}</dl><h2>Telegram deliveries</h2><pre>{JSON.stringify(data.deliveries, null, 2)}</pre></>}</> : <>
      <form className="activity-filters" onSubmit={e => e.preventDefault()}>
        <label>From<input type="date" onChange={e => filter('from', e.target.value)} /></label>
        <label>To<input type="date" onChange={e => filter('to', e.target.value)} /></label>
        <label>Event type<select onChange={e => filter('type', e.target.value)}><option value="">All</option><option value="visit">Visit</option><option value="submission">Submission</option></select></label>
        <label>Referral ID<input onChange={e => filter('referral', e.target.value)} /></label>
        {data?.role === 'level1' && <label>Operator ID<input onChange={e => filter('operator', e.target.value)} /></label>}
        <label>Country code<input maxLength={2} onChange={e => filter('country', e.target.value.toUpperCase())} /></label>
        <label>Delivery<select onChange={e => filter('delivery', e.target.value)}><option value="">All</option>{['pending', 'sending', 'sent', 'failed', 'cancelled'].map(s => <option key={s}>{s}</option>)}</select></label>
      </form>
      {data?.totals && <><p>{data.totals.visits} visits · {data.totals.submissions} submissions · {data.totals.total} events</p><p>Telegram: {data.deliveries.map(d => `${d.total} ${d.status}`).join(' · ') || 'No deliveries'}</p></>}
      <button onClick={() => setRevision(v => v + 1)}>Refresh</button>{' '}
      <button onClick={() => action(async () => setAudit((await api.get('/activity/audit')).data.events))}>Audit log</button>{' '}
      {data?.role === 'level1' && <><button onClick={() => action(exportEvents)}>Export JSON</button>{' '}<button onClick={() => action(loadSettings)}>Operators and referrals</button></>}
      <div className="activity-table"><table><thead><tr><th>Time</th><th>Type</th><th>Referral</th><th>Country</th><th>Device</th><th>Details</th></tr></thead><tbody>
        {data?.events?.map(event => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString()}</td><td>{event.event_type}</td><td>{event.referral_name || 'Direct'}</td><td>{event.country || 'Unknown'}</td><td>{event.device} / {event.browser}</td><td><Link to={`/admin/activity/${event.id}`}>View event</Link></td></tr>)}
      </tbody></table></div>
      {data?.events?.length === 0 && <p>No matching activity.</p>}
      <button disabled={query.page <= 1} onClick={() => setQuery(q => ({ ...q, page: q.page - 1 }))}>Previous</button> Page {query.page} <button disabled={!data?.totals || query.page * 25 >= data.totals.total} onClick={() => setQuery(q => ({ ...q, page: q.page + 1 }))}>Next</button>
      {audit && <><h2>Recent audit events</h2><ul>{audit.map(e => <li key={e.id}>{new Date(e.created_at).toLocaleString()} · {e.action} · {e.target}</li>)}</ul></>}
      {settings && <><h2>Operators</h2><ul>{settings.operators.map(o => <li key={o.id}>{o.name} · {o.role} · {o.active ? 'Active' : 'Inactive'} <button onClick={() => action(async () => setNotice((await api.post('/activity/invitations', { operatorId: o.id })).data.command + ' — send privately to the bot within 15 minutes.'))}>Create Telegram invitation</button> <button onClick={() => action(async () => { await api.post(`/activity/operators/${o.id}/status`, { active: !o.active }); await loadSettings() })}>{o.active ? 'Deactivate' : 'Activate'}</button></li>)}</ul>
        <form className="activity-filters" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const body = Object.fromEntries(new FormData(form)); action(async () => { await api.post('/activity/operators', body); form.reset(); await loadSettings() }) }}>
          <label>Name<input name="name" required /></label><label>Email<input name="email" type="email" required /></label><label>Password<input name="password" type="password" minLength={12} required /></label><label>Role<select name="role"><option value="level2">Level 2</option><option value="level1">Level 1</option></select></label><button>Create operator</button>
        </form><h2>Referral links</h2>
        <form className="activity-filters" onSubmit={e => { e.preventDefault(); const form=e.currentTarget; const body=Object.fromEntries(new FormData(form)); action(async () => { await api.post('/activity/referrals', body); form.reset(); await loadSettings() }) }}><label>Campaign name<input name="name" required maxLength={80} /></label><label>Assigned operator<select name="operatorId"><option value="">Unassigned</option>{settings.operators.filter(o => o.role === 'level2' && o.active).map(o => <option value={o.id} key={o.id}>{o.name}</option>)}</select></label><button>Create referral</button></form>
        <ul>{settings.referrals.map(r => <li key={r.id}>{r.name} · ID {r.id} · <code>/?ref={r.code}</code> <label>Assignment<select value={r.operator_id || ''} onChange={e => action(async () => { await api.put(`/activity/referrals/${r.id}`, { operatorId: e.target.value, active: Boolean(r.active) }); await loadSettings() })}><option value="">Unassigned</option>{settings.operators.filter(o => o.role === 'level2').map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label><button onClick={() => action(async () => { await api.put(`/activity/referrals/${r.id}`, { operatorId: r.operator_id, active: !r.active }); await loadSettings() })}>{r.active ? 'Deactivate' : 'Activate'}</button></li>)}</ul>
      </>}
    </>}
  </section>
}
