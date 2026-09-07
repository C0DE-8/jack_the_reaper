import { useCallback, useEffect, useState } from 'react'
import { FiRefreshCw } from 'react-icons/fi'
import api, { apiErrorMessage } from '../api/adminApi.js'

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export default function VisitorsPage() {
  const [visitors, setVisitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadVisitors = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const { data } = await api.get('/visitors', { params: { limit: 50 } })
      setVisitors(data.data || [])
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

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Monitoring</span>
          <h1>Visitors</h1>
        </div>
        <button className="secondary-button" type="button" onClick={loadVisitors} disabled={loading}>
          <FiRefreshCw aria-hidden="true" /> {loading ? 'Loading…' : 'Refresh'}
        </button>
      </header>
      <article className="panel">
        <div className="panel-title"><h2>Latest visitor activity</h2></div>
        {error ? <p className="alert error" role="alert">{error}</p> : null}
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Last page</th><th>Device</th><th>Browser</th><th>Visits</th><th>Last visit</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="6">Loading visitors…</td></tr> : null}
              {!loading && !visitors.length ? <tr><td colSpan="6">No visits have been recorded yet. Open <code>/visitor</code> to test.</td></tr> : null}
              {!loading && visitors.map((visitor) => (
                <tr key={visitor.id}>
                  <td>#{visitor.id}</td><td>{visitor.last_page || visitor.current_page || '—'}</td>
                  <td>{visitor.device_type || '—'}{visitor.os ? ` · ${visitor.os}` : ''}</td>
                  <td>{visitor.browser || '—'}</td><td>{visitor.visit_count || 0}</td><td>{formatDate(visitor.last_visit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}
