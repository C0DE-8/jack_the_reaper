import { useEffect, useState } from 'react'
import { FiCheck, FiCopy, FiRefreshCw, FiTrash2, FiX } from 'react-icons/fi'
import { apiErrorMessage, approveBatch, deleteBatch, fetchWordBatches, rejectBatch } from '../api/adminApi.js'
import StatusBadge from '../components/StatusBadge.jsx'

function BatchesPage() {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
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

  async function copyWords(batch) {
    if (!batch.words) return

    try {
      await navigator.clipboard.writeText(batch.words)
      setCopiedId(batch.id)
      window.setTimeout(() => setCopiedId((current) => (current === batch.id ? null : current)), 1500)
    } catch {
      setError('Unable to copy the words. Please try again.')
    }
  }

  async function removeBatch() {
    if (!deleteTarget) return
    const batch = deleteTarget
    try {
      setError('')
      setBusyId(batch.id)
      await deleteBatch(batch.id)
      setBatches((current) => current.filter((item) => item.id !== batch.id))
      setDeleteTarget(null)
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="page-stack">
      {deleteTarget ? (
        <div className="admin-modal-backdrop" role="presentation">
          <section
            className="admin-modal danger-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-batch-title"
            aria-describedby="delete-batch-description"
          >
            <div className="admin-modal-icon" aria-hidden="true">
              <FiTrash2 />
            </div>
            <div className="admin-modal-copy">
              <span className="eyebrow">Permanent action</span>
              <h2 id="delete-batch-title">Delete this word batch?</h2>
              <p id="delete-batch-description">
                <strong>{deleteTarget.title || `Batch #${deleteTarget.id}`}</strong> and its saved words,
                account, and balances will be permanently removed.
              </p>
            </div>
            <div className="admin-modal-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={busyId === deleteTarget.id}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={busyId === deleteTarget.id}
                onClick={removeBatch}
              >
                {busyId === deleteTarget.id ? <span className="button-spinner" aria-hidden="true" /> : <FiTrash2 aria-hidden="true" />}
                {busyId === deleteTarget.id ? 'Deleting…' : 'Delete batch'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

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
                      <button
                        className="muted-text batch-words-copy"
                        type="button"
                        title={batch.words ? 'Copy words' : 'No words to copy'}
                        disabled={!batch.words}
                        onClick={() => copyWords(batch)}
                      >
                        <span>{batch.words || 'No words shown'}</span>
                        {copiedId === batch.id ? <FiCheck aria-label="Copied" /> : <FiCopy aria-label="Copy words" />}
                      </button>
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
                        <button
                          className="icon-button danger"
                          type="button"
                          title="Delete"
                          disabled={busyId === batch.id}
                          onClick={() => setDeleteTarget(batch)}
                        >
                          <FiTrash2 aria-hidden="true" />
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
