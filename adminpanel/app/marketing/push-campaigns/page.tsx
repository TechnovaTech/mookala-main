'use client'
import React, { useState } from 'react'
import ResourcePage from '@/components/ResourcePage'
import { NoticeBar } from '@/components/ui'
import CampaignActions, { EMPTY_CAMPAIGN_PANEL, type CampaignPanelState } from '@/components/marketing/CampaignActions'

export default function Page() {
  // Changing the key reloads the list after a send attempt; the panel state is kept here so it survives that.
  const [version, setVersion] = useState(0)
  const [panel, setPanel] = useState<CampaignPanelState>(EMPTY_CAMPAIGN_PANEL)

  return (
    <ResourcePage key={version} resource="push-campaigns">
      <NoticeBar
        notice={{
          type: 'info',
          text: 'Push notifications are not connected: no push provider integration exists and the mobile apps do not register device tokens. Campaigns can be written, previewed against the real audience and approved, but a send attempt is recorded as "not sent" and the campaign is marked Failed. Open, click and delivery figures are not available for the same reason.',
        }}
      />
      <CampaignActions state={panel} onState={setPanel} onChanged={() => setVersion((v) => v + 1)} />
    </ResourcePage>
  )
}
