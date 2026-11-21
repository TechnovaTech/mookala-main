'use client'
import ResourcePage from '@/components/ResourcePage'
import RulesRefundCalculator from '@/components/finance/RulesRefundCalculator'
import RulesRefundPolicy from '@/components/finance/RulesRefundPolicy'
import WaitingApprovals from '@/components/security/WaitingApprovals'

export default function Page() {
  return (
    <ResourcePage resource="refund-rules">
      <WaitingApprovals actions={['refund_rules']} title="Refund rule changes waiting for a second approver" />
      <p className="text-sm text-gray-600 mb-4">
        Each rule gives one service a cancellation window and the share of the payment that is refunded in it, less an optional
        flat charge. A cancellation outside every active window gets no refund. A new rule starts as a draft and has no effect
        until it is made active. Every change needs a written reason; when editing, write a new reason for that change. The rule
        that applied is copied onto each refund and booking, so later edits never alter a refund that was already worked out.
      </p>
      <RulesRefundPolicy />
      <RulesRefundCalculator />
    </ResourcePage>
  )
}
