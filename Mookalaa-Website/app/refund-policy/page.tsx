"use client"

import { useCallback, useEffect, useState } from "react"
import { BackButton } from "@/components/back-button"
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
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    const [policyResult, configResult] = await Promise.allSettled([fetchPolicy("refund"), fetchPaymentConfig()])
    setPolicy(policyResult.status === "fulfilled" ? policyResult.value : null)
    setRules(configResult.status === "fulfilled" ? configResult.value.refundPolicy : null)
    setFailed(policyResult.status === "rejected" && configResult.status === "rejected")
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <main className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <BackButton className="mb-6" />
        <h1 className="text-3xl sm:text-4xl font-bold mb-8">Refund Policy</h1>

        {loading && (
          <p className="text-muted-foreground" role="status">
            Loading...
          </p>
        )}

        {!loading && failed && (
          <div>
            <p className="text-muted-foreground mb-4" role="alert">
              The refund policy could not be loaded.
            </p>
            <Button variant="outline" onClick={load}>
              Try again
            </Button>
          </div>
        )}

        {!loading && !failed && (
          <div className="space-y-6">
            <section className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Ticket cancellations</h2>
              {rules === null ? (
                <p className="text-muted-foreground">The current refund rules could not be loaded.</p>
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
                    Outside these periods no refund is given. You can see the exact refund for a booking before you
                    cancel it, under My bookings.
                  </p>
                </>
              )}
            </section>

            {policy && policy.body && (
              <section className="bg-card border border-border rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-1">{policy.title || "Refund policy"}</h2>
                {policy.version && <p className="text-xs text-muted-foreground mb-4">Version {policy.version}</p>}
                <div className="text-muted-foreground leading-relaxed whitespace-pre-line break-words">{policy.body}</div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
