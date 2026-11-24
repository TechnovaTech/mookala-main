"use client"

import { useCallback, useEffect, useState } from "react"
import { LegalPage } from "@/components/legal"
import { RefundPolicyDocument } from "@/components/refund-policy-document"
import { Button } from "@/components/ui/button"
import { fetchPaymentConfig, fetchPolicy, formatRupees, type PublishedPolicy } from "@/lib/api"
import type { RefundRule } from "@/lib/types"

function ruleWindow(rule: RefundRule): string {
  return rule.maxHoursBefore === null
    ? `${rule.minHoursBefore} hours or more before the event`
    : `${rule.minHoursBefore} to ${rule.maxHoursBefore} hours before the event`
}

export default function RefundPolicyPage() {
  const [policy, setPolicy] = useState<PublishedPolicy | null>(null)
  const [rules, setRules] = useState<RefundRule[] | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [policyResult, configResult] = await Promise.allSettled([fetchPolicy("refund"), fetchPaymentConfig()])
    setPolicy(policyResult.status === "fulfilled" ? policyResult.value : null)
    setRules(configResult.status === "fulfilled" ? configResult.value.refundPolicy : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <LegalPage
      title="Refund & Cancellation Policy"
      intro="How cancellations, refunds and related claims are handled for bookings made on MOOKALAA."
      updated="Policy Version 1.0"
    >
      <section className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4 text-amber-600">Ticket cancellations</h2>
        {loading ? (
          <p className="text-muted-foreground" role="status">
            Loading...
          </p>
        ) : rules === null ? (
          <div>
            <p className="text-muted-foreground mb-4">The current refund rules could not be loaded.</p>
            <Button variant="outline" onClick={load}>
              Try again
            </Button>
          </div>
        ) : rules.length === 0 ? (
          <p className="text-muted-foreground">
            No refund rules are published at the moment, so a cancelled booking may not be refunded.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="py-2 pr-4 font-semibold">When you cancel</th>
                    <th className="py-2 pr-4 font-semibold">Refund</th>
                    <th className="py-2 font-semibold">Fee deducted</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule, index) => (
                    <tr key={index} className="border-b border-border/50">
                      <td className="py-2 pr-4">{ruleWindow(rule)}</td>
                      <td className="py-2 pr-4">{rule.refundPercent}% of the amount paid</td>
                      <td className="py-2">{rule.deductionFlat > 0 ? formatRupees(rule.deductionFlat) : "None"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              Outside these periods no refund is given. You can see the exact refund for a booking before you cancel
              it, under My bookings.
            </p>
          </>
        )}
      </section>

      {/* A version published from the admin panel replaces the policy built into this page. */}
      {policy && policy.body ? (
        <section className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-1 text-amber-600">{policy.title || "Refund policy"}</h2>
          {policy.version && <p className="text-xs text-muted-foreground mb-4">Version {policy.version}</p>}
          <div className="text-muted-foreground leading-relaxed whitespace-pre-line break-words">{policy.body}</div>
        </section>
      ) : (
        <RefundPolicyDocument />
      )}
    </LegalPage>
  )
}
