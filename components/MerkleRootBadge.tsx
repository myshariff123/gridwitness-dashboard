import { Lock, Copy } from 'lucide-react'

interface Props {
  hash:     string
  tenantId: string
}

export default function MerkleRootBadge({ hash, tenantId }: Props) {
  const copy = () => navigator.clipboard.writeText(hash)

  return (
    <div className="bg-gw-panel border border-gw-green/30 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Lock className="w-4 h-4 text-gw-green" />
        <span className="font-semibold text-white">Ledger Merkle Root</span>
        <span className="ml-auto text-xs border border-gw-green/30 text-gw-green px-2 py-0.5 rounded">
          WORM VERIFIED
        </span>
      </div>

      <div className="bg-gw-dark border border-gw-border rounded-lg p-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gw-muted mb-1">SHA-256 Ledger Root · Tenant {tenantId}</div>
          <div className="font-mono text-gw-green text-xs break-all leading-relaxed">
            {hash}
          </div>
        </div>
        <button
          onClick={copy}
          className="flex-shrink-0 p-2 rounded hover:bg-gw-border transition-colors"
          title="Copy hash"
        >
          <Copy className="w-4 h-4 text-gw-muted hover:text-white" />
        </button>
      </div>

      <p className="text-xs text-gw-muted mt-3 leading-relaxed">
        This hash is derived from every telemetry record in your WORM ledger for the selected period.
        Any Big 4 auditor can verify this independently without accessing live systems.
        Stored in S3 Object Lock COMPLIANCE mode — legally immutable for 7 years.
      </p>
    </div>
  )
}
