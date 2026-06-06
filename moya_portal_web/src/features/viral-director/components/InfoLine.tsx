export function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="viral-info-line">
      <strong>{label}</strong>
      <span>{value}</span>
    </div>
  )
}
