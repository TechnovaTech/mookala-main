'use client'
import React, { useState } from 'react'
import ResourcePage from '@/components/ResourcePage'
import ReferralCounts from '@/components/marketing/ReferralCounts'

const VIEWS = [
  { value: 'referral-programmes', label: 'Programmes' },
  { value: 'referrals', label: 'Recorded referrals' },
]

export default function Page() {
  const [view, setView] = useState('referral-programmes')

  return (
    <ResourcePage key={view} resource={view}>
      <div className="flex gap-2 mb-4" role="tablist" aria-label="Referral views">
        {VIEWS.map((option) => (
          <button
            key={option.value}
            role="tab"
            aria-selected={view === option.value}
            onClick={() => setView(option.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              view === option.value ? 'bg-deep-blue text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {view === 'referral-programmes' && <ReferralCounts />}
    </ResourcePage>
  )
}
