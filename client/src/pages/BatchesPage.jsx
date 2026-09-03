import { useEffect, useState } from 'react'
import { FiCheck, FiRefreshCw, FiX } from 'react-icons/fi'
import { apiErrorMessage, approveBatch, fetchWordBatches, rejectBatch } from '../api/adminApi.js'
import StatusBadge from '../components/StatusBadge.jsx'

function BatchesPage() {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  async function loadBatches() {
    try {
      setError('')
      setLoading(true)
      setBatches(await fetchWordBatches(50))
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true

    async function loadInitialBatches() {
      try {
        const batchData = await fetchWordBatches(50)
        if (active) setBatches(batchData)
      } catch (requestError) {
        if (active) setError(apiErrorMessage(requestError))
      } finally {
        if (active) setLoading(false)
      }
    }

    loadInitialBatches()

    return () => {
      active = false
    }
  }, [])

  async function updateBatch(id, action) {
    try {
      setError('')
      setBusyId(id)
      const updated = action === 'approve' ? await approveBatch(id) : await rejectBatch(id)
      setBatches((current) => current.map((batch) => (batch.id === id ? updated : batch)))
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Moderation</span>
          <h1>Word Batches</h1>
        </div>
        <button className="secondary-button" type="button" onClick={loadBatches}>
          <FiRefreshCw aria-hidden="true" />
          Refresh
        </button>
      </header>

      {error ? <div className="alert error">{error}</div> : null}

      <article className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Words</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6">Loading batches...</td></tr>
              ) : batches.length ? (
                batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>#{batch.id}</td>
                    <td>
                      <strong>{batch.title || 'Untitled'}</strong>
                      <span className="muted-text">{batch.words || 'No words shown'}</span>
                    </td>
                    <td>{batch.wordCount}</td>
                    <td><StatusBadge status={batch.approvalStatus} /></td>
                    <td>{batch.createdAt ? new Date(batch.createdAt).toLocaleString() : 'N/A'}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button success"
                          type="button"
                          title="Approve"
                          disabled={busyId === batch.id || batch.approvalStatus === 'approved'}
                          onClick={() => updateBatch(batch.id, 'approve')}
                        >
                          <FiCheck aria-hidden="true" />
                        </button>
                        <button
                          className="icon-button danger"
                          type="button"
                          title="Reject"
                          disabled={busyId === batch.id || batch.approvalStatus === 'rejected'}
                          onClick={() => updateBatch(batch.id, 'reject')}
                        >
                          <FiX aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="6">No word batches found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}

export default BatchesPage
