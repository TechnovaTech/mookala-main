'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AdminShell from '@/components/AdminShell'
import { NoticeBar, Spinner, api, type Notice } from '@/components/ui'
import ChannelCard, { type ChannelView } from '@/components/communications/ChannelCard'
import WaitingApprovals from '@/components/security/WaitingApprovals'

export default function Page() {
  const [channels, setChannels] = useState<ChannelView[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)

  const load = useCallback(async () => {
    try {
      const data = await api<any>('/api/admin/communications/channels')
      setChannels(data.channels || [])
      setCanManage(Boolean(data.canManage))
      setNotice(null)
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message || 'Could not load the channel settings.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <AdminShell title="Channels & Providers" subtitle="SMS, email, WhatsApp and push settings, and what each channel can really send today">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <NoticeBar
        notice={{
          type: 'info',
          text: 'Only one thing is implemented: one-time password SMS through 2Factor, once its API key is saved and the channel is switched on. The sign-in screens of the apps do not use it yet; that is being connected separately. Email, WhatsApp and push have no provider integration, so saving details for them does not make anything send. Every change here is written to the activity log without the key itself.',
        }}
      />

      <WaitingApprovals actions={['notification_keys']} title="Channel changes waiting for a second approver" />

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {channels.map((channel) => (
            <ChannelCard key={channel.channel} channel={channel} canManage={canManage} onSaved={load} />
          ))}
        </div>
      )}

      <p className="text-sm text-gray-600 mt-4">
        Every attempt to send, including those that were not sent, is listed in the{' '}
        <Link href="/communications/logs" className="text-teal underline">
          delivery log
        </Link>
        .
      </p>
    </AdminShell>
  )
}
