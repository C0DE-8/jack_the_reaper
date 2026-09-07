import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiActivity, FiChevronRight, FiEye, FiMonitor, FiRefreshCw, FiUsers } from 'react-icons/fi'
import { apiErrorMessage } from '../api/adminApi.js'
import { fetchVisitor, fetchVisitorAnalytics, fetchVisitors } from '../api/visitorApi.js'
import MetricCard from '../components/MetricCard.jsx'

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function formatDuration(seconds) {
  const total = Number(seconds || 0)
  if (!total) return '—'
  const minutes = Math.floor(total / 60)
  return minutes ? `${minutes}m ${total % 60}s` : `${total}s`
}

function display(value) { return value === null || value === undefined || value === '' ? '—' : String(value) }

function parseEventData(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return null }
}

function DetailField({ label, value, wide = false }) {
  return <div className={wide ? 'detail-field wide' : 'detail-field'}><span>{label}</span><strong>{display(value)}</strong></div>
}

export default function VisitorsPage() {
  const [visitors, setVisitors] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [selectedVisitor, setSelectedVisitor] = useState(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')

  const loadVisitors = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [visitorResponse, analyticsResponse] = await Promise.all([
        fetchVisitors({ limit: 100 }),
        fetchVisitorAnalytics({ period: '30d' }),
      ])
      setVisitors(visitorResponse.data || [])
      setAnalytics(analyticsResponse.data || null)
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(loadVisitors, 0)
    return () => window.clearTimeout(timer)
  }, [loadVisitors])

  async function openVisitor(id) {
    try {
      setDetailLoading(true)
      setError('')
      const data = await fetchVisitor(id)
      setSelectedVisitor(data.data)
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setDetailLoading(false)
    }
  }

  const filteredVisitors = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return visitors
    return visitors.filter((visitor) => [visitor.id, visitor.ip_address, visitor.last_page, visitor.browser, visitor.os, visitor.country]
      .some((value) => String(value || '').toLowerCase().includes(term)))
  }, [query, visitors])

  const overview = analytics?.overview || {}
  const events = selectedVisitor?.events || []

  return (
    <section className="page-stack visitors-page">
      <header className="page-header">
        <div><span className="eyebrow">Intelligence console</span><h1>God’s Eye</h1></div>
        <button className="secondary-button" type="button" onClick={loadVisitors} disabled={loading}><FiRefreshCw aria-hidden="true" /> {loading ? 'Loading…' : 'Refresh data'}</button>
      </header>
      {error ? <p className="alert error" role="alert">{error}</p> : null}
      <div className="metrics-grid">
        <MetricCard icon={FiUsers} label="Unique signals" value={loading ? '…' : Number(overview.unique_visitors || 0).toLocaleString()} detail="Last 30 days" />
        <MetricCard icon={FiEye} label="Total signals" value={loading ? '…' : Number(overview.total_visits || 0).toLocaleString()} detail="Last 30 days" />
        <MetricCard icon={FiActivity} label="Active now" value={loading ? '…' : Number(overview.today_visitors || 0).toLocaleString()} detail={`${Number(overview.yesterday_visitors || 0).toLocaleString()} yesterday`} />
        <MetricCard icon={FiMonitor} label="Returning signals" value={loading ? '…' : Number(analytics?.newVsReturning?.returning_visitors || 0).toLocaleString()} detail={`${Number(analytics?.newVsReturning?.new_visitors || 0).toLocaleString()} new signals`} />
      </div>
      <div className="visitor-insights">
        <article className="panel insight-card"><h2>Devices</h2>{(analytics?.devices || []).slice(0, 3).map((item) => <p key={item.device_type}><span>{display(item.device_type)}</span><strong>{item.count}</strong></p>)}{!analytics?.devices?.length && <p className="muted-text">No device data yet.</p>}</article>
        <article className="panel insight-card"><h2>Browsers</h2>{(analytics?.browsers || []).slice(0, 3).map((item) => <p key={item.browser}><span>{display(item.browser)}</span><strong>{item.count}</strong></p>)}{!analytics?.browsers?.length && <p className="muted-text">No browser data yet.</p>}</article>
        <article className="panel insight-card"><h2>Countries</h2>{(analytics?.countries || []).slice(0, 3).map((item) => <p key={item.country}><span>{display(item.country)}</span><strong>{item.count}</strong></p>)}{!analytics?.countries?.length && <p className="muted-text">No location data yet.</p>}</article>
        <article className="panel insight-card"><h2>Latest daily activity</h2>{(analytics?.daily || []).slice(0, 3).map((item) => <p key={item.date}><span>{String(item.date).slice(0, 10)}</span><strong>{item.visits} visits</strong></p>)}{!analytics?.daily?.length && <p className="muted-text">No daily activity yet.</p>}</article>
      </div>
      <div className="visitors-workspace">
        <article className="panel visitor-list-panel">
          <div className="panel-title visitor-list-header"><div><h2>Live signal stream</h2><p className="muted-text">Select a signal to inspect its full profile and latest events.</p></div><input aria-label="Search signals" className="visitor-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ID, IP, page…" /></div>
          <div className="table-wrap"><table className="visitors-table"><thead><tr><th>Signal</th><th>Last page</th><th>Environment</th><th>Visits</th><th>Last seen</th><th aria-label="Open details" /></tr></thead><tbody>
            {loading ? <tr><td colSpan="6">Loading visitor records…</td></tr> : null}
            {!loading && !filteredVisitors.length ? <tr><td colSpan="6">No matching signals. Open <code>/visitor</code> to create a test visit.</td></tr> : null}
            {!loading && filteredVisitors.map((visitor) => <tr className={selectedVisitor?.id === visitor.id ? 'selected' : ''} key={visitor.id}><td><strong>#{visitor.id}</strong><span className="muted-text">{display(visitor.ip_address)}</span></td><td><span className="page-cell">{display(visitor.last_page || visitor.current_page)}</span></td><td>{display(visitor.device_type)}<span className="muted-text">{[visitor.browser, visitor.os].filter(Boolean).join(' · ') || '—'}</span></td><td>{Number(visitor.visit_count || 0).toLocaleString()}</td><td>{formatDate(visitor.last_visit)}</td><td><button className="icon-button" title={`View signal #${visitor.id}`} type="button" onClick={() => openVisitor(visitor.id)}><FiChevronRight aria-hidden="true" /></button></td></tr>)}
          </tbody></table></div>
        </article>
        <aside className="panel visitor-detail-panel" aria-live="polite">
          {!selectedVisitor && !detailLoading ? <div className="empty-detail"><FiUsers aria-hidden="true" /><h2>Signal details</h2><p>Select a signal to view every captured field and its 50 most recent events.</p></div> : null}
          {detailLoading ? <div className="empty-detail"><p>Loading signal details…</p></div> : null}
          {selectedVisitor && !detailLoading ? <><div className="panel-title"><div><span className="eyebrow">Signal #{selectedVisitor.id}</span><h2>Activity profile</h2></div><span className="visit-count">{selectedVisitor.visit_count} signals</span></div><div className="detail-grid">
            <DetailField label="First visit" value={formatDate(selectedVisitor.first_visit)} /><DetailField label="Last visit" value={formatDate(selectedVisitor.last_visit)} /><DetailField label="IP address" value={selectedVisitor.ip_address} /><DetailField label="Time on site" value={formatDuration(selectedVisitor.total_visit_duration)} /><DetailField label="Browser" value={selectedVisitor.browser} /><DetailField label="Operating system" value={selectedVisitor.os} /><DetailField label="Device" value={selectedVisitor.device_type} /><DetailField label="Screen" value={selectedVisitor.screen_resolution} /><DetailField label="Language" value={selectedVisitor.language} /><DetailField label="Location" value={[selectedVisitor.city, selectedVisitor.region, selectedVisitor.country].filter(Boolean).join(', ')} /><DetailField label="Current page" value={selectedVisitor.current_page} wide /><DetailField label="Last page" value={selectedVisitor.last_page} wide /><DetailField label="Referrer" value={selectedVisitor.referrer} wide /><DetailField label="User agent" value={selectedVisitor.user_agent} wide /><DetailField label="UTM source" value={selectedVisitor.utm_source} /><DetailField label="UTM medium" value={selectedVisitor.utm_medium} /><DetailField label="UTM campaign" value={selectedVisitor.utm_campaign} /><DetailField label="UTM term" value={selectedVisitor.utm_term} /><DetailField label="UTM content" value={selectedVisitor.utm_content} wide />
          </div><div className="event-section"><h3>Recent events</h3>{!events.length ? <p className="muted-text">No events recorded.</p> : <ol className="event-list">{events.map((event) => { const data = parseEventData(event.event_data); return <li key={event.id}><div><strong>{event.event_type}</strong><span>{formatDate(event.created_at)}</span></div><p>{event.page_url || '—'}</p>{data ? <code>{JSON.stringify(data)}</code> : null}</li> })}</ol>}</div></> : null}
        </aside>
      </div>
    </section>
  )
}
