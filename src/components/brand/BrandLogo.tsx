import './BrandLogo.css'

type BrandLogoProps = {
  compact?: boolean
  stacked?: boolean
}

export function BrandLogo({ compact = false, stacked = false }: BrandLogoProps) {
  const className = [
    'brand-logo',
    compact ? 'brand-logo--compact' : '',
    stacked ? 'brand-logo--stacked' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={className} aria-label="AIOS NOVA">
      <img
        className="brand-logo__mark"
        src="/brand/aios-nova-mark.png"
        alt=""
        width={64}
        height={41}
      />
      <span className="brand-logo__wordmark">AIOS NOVA</span>
    </span>
  )
}
