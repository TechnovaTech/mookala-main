'use client'
import React, { useState } from 'react'
import ResourcePage from '@/components/ResourcePage'
import { NoticeBar } from '@/components/ui'
import AnnouncementActions, { EMPTY_ANNOUNCEMENT_PANEL, type AnnouncementPanelState } from '@/components/communications/AnnouncementActions'

export default function Page() {
  // Changing the key reloads the list after a send attempt; the panel state is kept here so it survives that.
  const [version, setVersion] = useState(0)
  const [panel, setPanel] = useState<AnnouncementPanelState>(EMPTY_ANNOUNCEMENT_PANEL)

  return (
    <ResourcePage key={version} resource="announcements">
      <NoticeBar
        notice={{
          type: 'info',
          text: 'No channel can deliver an announcement today: email, WhatsApp and push have no provider integration, and the SMS provider (2Factor) is connected for one-time passwords only. Announcements can be written, previewed and approved; a send attempt records every recipient as "not sent" in the delivery log and marks the announcement Failed. The apps have no in-app announcement inbox either.',
        }}
      />
      <AnnouncementActions state={panel} onState={setPanel} onChanged={() => setVersion((v) => v + 1)} />
    </ResourcePage>
  )
}
