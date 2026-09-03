function MetricCard({ label, value, detail, icon: Icon }) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{Icon ? <Icon aria-hidden="true" /> : null}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
    </article>
  )
}

export default MetricCard
