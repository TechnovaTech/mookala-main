'use client'
import React, { useState } from 'react'
import ResourcePage from '@/components/ResourcePage'
import DeletionReview, { EMPTY_DELETION_PANEL, type DeletionPanelState } from '@/components/platform/DeletionReview'

export default function Page() {
  // Changing the key reloads the list after an outcome is recorded; the panel state is kept here so it survives that.
  const [version, setVersion] = useState(0)
  const [panel, setPanel] = useState<DeletionPanelState>(EMPTY_DELETION_PANEL)

  return (
    <ResourcePage key={version} resource="deletion-requests">
      <DeletionReview state={panel} onState={setPanel} onChanged={() => setVersion((v) => v + 1)} />
    </ResourcePage>
  )
}
