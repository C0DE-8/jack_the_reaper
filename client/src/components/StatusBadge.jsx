function StatusBadge({ status }) {
  const value = String(status || 'pending').toLowerCase()
  return <span className={`status-badge ${value}`}>{value}</span>
}

export default StatusBadge
