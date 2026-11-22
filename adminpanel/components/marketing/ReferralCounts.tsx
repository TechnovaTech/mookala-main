'use client'
import React, { useEffect, useState } from 'react'
import { Badge, Card, NoticeBar, Spinner, api, formatMoney, type Notice } from '@/components/ui'

interface ProgrammeRow {
  id: string
  name: string
  status: string
  referrerReward: number
  refereeReward: number
  total: number
  signedUp: number
  qualified: number
  rejected: number
  rewarded: number
  withheld: number
}

interface Summary {
  programmes: ProgrammeRow[]
  rewardCoupons: { issued: number; used: number; value: number }
  activeProgrammeId: string | null
}

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'gray'> = { active: 'green', paused: 'amber', ended: 'red', draft: 'gray' }

/** Referral counts per programme, from the `referrals` collection. */
export default function ReferralCounts() {
  const [data, setData] = useState<Summary | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  useEffect(() => {
    api<Summary>('/api/admin/marketing/referrals/summary')
      .then(setData)
      .catch((e) => setNotice({ type: 'error', text: e.message || 'Could not load the referral figures.' }))
  }, [])

  return (
    <Card className="p-5 mb-4">
      <h2 className="text-base font-semibold text-deep-blue">Referrals by programme</h2>
      <p className="text-sm text-gray-600 mt-1 mb-3">
        Counted from the referrals customers recorded in the app. Only the programme that is Active and inside its dates when a code
        is entered receives new referrals.
      </p>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      {!data && !notice && <Spinner />}
      {data && (
        <>
          {data.programmes.length === 0 ? (
            <p className="text-sm text-gray-600">No programmes yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="py-2 pr-4">Programme</th>
                    <th className="py-2 pr-4 text-right">Codes entered</th>
                    <th className="py-2 pr-4 text-right">Waiting for first paid booking</th>
                    <th className="py-2 pr-4 text-right">Qualified</th>
                    <th className="py-2 pr-4 text-right">Rewards given</th>
                    <th className="py-2 pr-4 text-right">Rewards withheld</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.programmes.map((p) => (
                    <tr key={p.id} data-testid="programme-count-row">
                      <td className="py-2 pr-4">
                        <span className="font-medium text-gray-900">{p.name}</span>{' '}
                        <Badge tone={STATUS_TONE[p.status] || 'gray'}>{p.status}</Badge>
                        {data.activeProgrammeId === p.id && <span className="ml-2 text-xs text-green-700">receiving new referrals</span>}
                        <span className="block text-xs text-gray-500">
                          Rewards: {formatMoney(p.referrerReward)} to the referrer, {formatMoney(p.refereeReward)} to the new customer
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right">{p.total}</td>
                      <td className="py-2 pr-4 text-right">{p.signedUp}</td>
                      <td className="py-2 pr-4 text-right">{p.qualified}</td>
                      <td className="py-2 pr-4 text-right">{p.rewarded}</td>
                      <td className="py-2 pr-4 text-right">{p.withheld}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-sm text-gray-700 mt-3">
            Reward coupons issued: <strong>{data.rewardCoupons.issued}</strong> worth {formatMoney(data.rewardCoupons.value)}, of which{' '}
            <strong>{data.rewardCoupons.used}</strong> used.
          </p>
        </>
      )}
    </Card>
  )
}
