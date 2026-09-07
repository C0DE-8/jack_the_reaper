import { useEffect, useState } from 'react'
import { apiErrorMessage } from '../api/adminApi.js'
import { trackVisitorEvent, trackVisitorOnce, visitorDetails } from '../api/visitorApi.js'

export default function VisitorPage() {
  const [visitor, setVisitor] = useState(null)
  const [message, setMessage] = useState('Recording this test visit…')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function recordVisit() {
      try {
        const result = await trackVisitorOnce(visitorDetails())
        if (!active) return
        setVisitor(result.data)
        setMessage(result.isNew ? 'Test visit recorded.' : 'Returning test visit recorded.')
      } catch (requestError) {
        if (active) setError(apiErrorMessage(requestError))
      }
    }

    recordVisit()
    return () => { active = false }
  }, [])

  async function recordTestEvent() {
    if (!visitor?.id) return
    setError('')
    try {
      await trackVisitorEvent({
        visitor_id: visitor.id,
        event_type: 'test_button_click',
        event_data: { label: 'Record test interaction' },
        page_url: `${window.location.pathname}${window.location.search}`,
      })
      setMessage('Test interaction recorded. Refresh the admin Visitors page to see it.')
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    }
  }

  return (
    <main className="visitor-page">
      <section className="visitor-card">
        <span className="eyebrow">Visitor route</span>
        <h1>Visitor tracking test</h1>
        <p>Opening this page records a visit. The captured result is available in the admin Visitors page.</p>
        {error ? <p className="alert error" role="alert">{error}</p> : null}
        {!error ? <p className="alert success" role="status">{message}</p> : null}
        {visitor ? (
          <dl className="visitor-result">
            <div><dt>Visitor ID</dt><dd>#{visitor.id}</dd></div>
            <div><dt>Visits</dt><dd>{visitor.visit_count}</dd></div>
            <div><dt>Last page</dt><dd>{visitor.last_page}</dd></div>
          </dl>
        ) : null}
        <button className="primary-button" type="button" disabled={!visitor?.id} onClick={recordTestEvent}>
          Record test interaction
        </button>
      </section>
    </main>
  )
}
