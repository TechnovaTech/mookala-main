'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AdminShell from '@/components/AdminShell'
import { NoticeBar, Spinner, api, type Notice } from '@/components/ui'
import ChannelCard, { type ChannelView } from '@/components/communications/ChannelCard'
import SchedulerCard from '@/components/communications/SchedulerCard'
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
    <AdminShell title="Channels & Providers" subtitle="SMS, email, WhatsApp and push providers, their status webhooks, and the scheduler">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <NoticeBar
        notice={{
          type: 'info',
          text: `What is built: email through SendGrid or Resend, WhatsApp through the Meta Cloud API (approved templates), push through Firebase Cloud Messaging, and one-time password SMS through 2Factor. Other SMS text is not implemented. A channel sends only when its credentials are saved and it is switched on. The mobile apps do not include Firebase yet, so no phone registers for push until they do. Provider keys can only be changed by a Super Admin${canManage ? '' : ' (you can view this page only)'}, with a reason, and every change and test is in the activity log without the key itself.`,
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

      <SchedulerCard />

      <p className="text-sm text-gray-600 mt-4">
        Every attempt to send, including those that were not sent, and every delivery receipt is listed in the{' '}
        <Link href="/communications/logs" className="text-teal underline">
          delivery log
        </Link>
        .
      </p>
    </AdminShell>
  )
}
