'use client'
import React, { useState } from 'react'
import ResourcePage from '@/components/ResourcePage'
import CampaignActions, { EMPTY_CAMPAIGN_PANEL, type CampaignPanelState } from '@/components/marketing/CampaignActions'

export default function Page() {
  // Changing the key reloads the list after a send; the panel state is kept here so it survives that.
  const [version, setVersion] = useState(0)
  const [panel, setPanel] = useState<CampaignPanelState>(EMPTY_CAMPAIGN_PANEL)

  return (
    <ResourcePage key={version} resource="push-campaigns">
      <CampaignActions state={panel} onState={setPanel} onChanged={() => setVersion((v) => v + 1)} />
    </ResourcePage>
  )
}
