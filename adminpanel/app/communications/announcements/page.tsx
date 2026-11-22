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
          text: 'Workflow: write the announcement (audience, optional city, event or membership filter, channels, template key), submit it for approval, and a different admin with the Communications approve permission approves it (a Super Admin for emergencies). Then press "Send now", or move it to Scheduled and the scheduler sends it at that time. Messages go out only on channels whose provider is connected under Channels & Providers; SMS text is not implemented, and push reaches only phones whose app has registered a device, which the apps cannot do until Firebase is added to them. The apps have no in-app announcement inbox.',
        }}
      />
      <AnnouncementActions state={panel} onState={setPanel} onChanged={() => setVersion((v) => v + 1)} />
    </ResourcePage>
  )
}
