'use client'
import React, { useEffect, useState } from 'react'
import ResourcePage from '@/components/ResourcePage'
import { useCan } from '@/components/AdminShell'
import { NoticeBar, type Notice } from '@/components/ui'
import ArtistAssign from '@/components/wishes/ArtistAssign'
import OrderTimeline from '@/components/wishes/OrderTimeline'
import WishTabs from '@/components/wishes/WishTabs'

function CustomWishDetail({ item, onAssigned }: { item: Record<string, any>; onAssigned: (id: string, message: string) => void }) {
  const canManage = useCan('wishes:manage')
  return (
    <div className="space-y-4">
      <ArtistAssign item={item} canManage={canManage} onAssigned={onAssigned} />
      <OrderTimeline item={item} />
    </div>
  )
}

export default function Page() {
  // The list screen is rebuilt after an artist is assigned, so the list and
  // the open record both show the new artist.
  const [version, setVersion] = useState(0)
  const [notice, setNotice] = useState<Notice>(null)

  useEffect(() => {
    // The record to reopen was passed in the address; it is not kept there.
    if (version > 0) window.history.replaceState(null, '', '/wishes/custom')
  }, [version])

  const onAssigned = (id: string, message: string) => {
    window.history.replaceState(null, '', '/wishes/custom?id=' + encodeURIComponent(id))
    setNotice({ type: 'success', text: message })
    setVersion((current) => current + 1)
  }

  return (
    <ResourcePage
      key={version}
      resource="custom-wishes"
      detailActions={(item) => <CustomWishDetail item={item} onAssigned={onAssigned} />}
    >
      <WishTabs current="/wishes/custom" refreshKey={version} />
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
    </ResourcePage>
  )
}
