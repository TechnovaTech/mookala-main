'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { Badge, Button, Card, ConfirmDialog, NoticeBar, Spinner, api, formatDate, type Notice } from '@/components/ui'

function describe(part: any, kind: 'announcements' | 'push' | 'retries' | 'reminders'): string {
  if (!part) return '—'
  if (part.error) return `Error: ${part.error}`
  if (part.skipped) return part.skipped
  if (kind === 'announcements') {
    if (!part.due) return 'Nothing due'
    const done = (part.runs || []).filter((r: any) => r.ok)
    const refused = (part.runs || []).filter((r: any) => !r.ok)
    return `${part.due} due: ${done.map((r: any) => `"${r.title}" ${r.processed} recipients, now ${r.status}`).join('; ')}${refused.length ? `${done.length ? '; ' : ''}${refused.map((r: any) => `"${r.title}" not sent (${r.error})`).join('; ')}` : ''}`
  }
  if (kind === 'push') return part.attempted ? `${part.attempted} messages, ${part.sent} accepted, ${part.failed} not accepted` : 'Nothing due'
  if (kind === 'retries') return part.attempted || part.skipped ? `${part.attempted} retried: ${part.accepted} accepted, ${part.failed} failed, ${part.notSent} not sent` : 'Nothing to retry'
  return part.attempted !== undefined ? `${part.due} due, ${part.attempted} sent: ${part.accepted} accepted, ${part.failed} failed, ${part.notSent} not sent` : '—'
}

/** What the notification scheduler did, "Run now", and automatic membership reminders. */
export default function SchedulerCard() {
  const [data, setData] = useState<any>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState(false)
  const [confirmRun, setConfirmRun] = useState(false)
  const [toggle, setToggle] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await api<any>('/api/admin/communications/scheduler'))
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message || 'Could not load the scheduler status.' })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const runNow = async () => {
    setBusy(true)
    try {
      const result = await api<any>('/api/admin/communications/scheduler', { method: 'POST', body: {} })
      setNotice(
        result.skipped
          ? { type: 'info', text: result.skipped }
          : { type: 'success', text: `Scheduler run finished. Announcements: ${describe(result.announcements, 'announcements')}. Push campaigns: ${describe(result.pushCampaigns, 'push')}. Retries: ${describe(result.retries, 'retries')}. Membership reminders: ${describe(result.membershipReminders, 'reminders')}.` }
      )
      await load()
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message || 'The scheduler run failed.' })
    } finally {
      setBusy(false)
      setConfirmRun(false)
    }
  }

  const saveToggle = async (reason: string) => {
    if (toggle === null) return
    setBusy(true)
    try {
      await api('/api/admin/communications/scheduler', { method: 'PUT', body: { reminderAutoSend: toggle, reason } })
      setNotice({ type: 'success', text: `Automatic membership expiry reminders are now ${toggle ? 'on' : 'off'}.` })
      await load()
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message || 'Could not save the setting.' })
    } finally {
      setBusy(false)
      setToggle(null)
    }
  }

  const reminders = data?.membershipReminders

  return (
    <Card className="p-5 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-deep-blue">Scheduler</h2>
        {data?.canRun && (
          <Button variant="secondary" onClick={() => setConfirmRun(true)} disabled={busy}>
            <Play size={16} />
            Run now
          </Button>
        )}
      </div>
      <p className="text-sm text-gray-600 mt-1">
        Every 15 minutes the host calls the scheduler, which sends scheduled announcements that are due, continues announcements part way through,
        sends due push campaigns, retries messages that failed with a temporary provider error (up to 3 attempts, after 10 and then 30 minutes),
        and sends due membership expiry reminders when they are switched on below. On the Vercel Hobby plan cron jobs run at most once a day (and a
        15-minute schedule is refused at deployment): the Pro plan, or an outside scheduler calling the cron address with the secret, is needed for
        every 15 minutes.
      </p>
      <div className="mt-3">
        <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      </div>
      {!data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Scheduler secret (CRON_SECRET) on this server:{' '}
            <Badge tone={data.cronSecretConfigured ? 'green' : 'red'}>{data.cronSecretConfigured ? 'set' : 'missing: every scheduled call is refused'}</Badge>
          </p>

          <div className="rounded-lg border border-gray-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-gray-800">Automatic membership expiry reminders</p>
              <Badge tone={reminders?.autoSend ? 'green' : 'gray'}>{reminders?.autoSend ? 'On' : 'Off'}</Badge>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Uses the settings under Memberships, Expiry Reminders: {reminders?.reminderDays?.length ? `${reminders.reminderDays.join(', ')} days before expiry` : 'no reminder days saved'}, by{' '}
              {reminders?.channel}, template &ldquo;{reminders?.templateKey}&rdquo; ({reminders?.templateApproved ? 'approved' : 'not approved'}).{' '}
              {reminders?.channelBlocker ? `Nothing can be sent now: ${reminders.channelBlocker}.` : 'The channel can send.'}
              {reminders?.changedBy ? ` Last changed by ${reminders.changedBy} on ${formatDate(reminders.changedAt, true)}.` : ''}
            </p>
            {data.canToggleReminders && (
              <Button className="mt-2" variant="secondary" onClick={() => setToggle(!reminders?.autoSend)} disabled={busy}>
                {reminders?.autoSend ? 'Switch off' : 'Switch on'}
              </Button>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-gray-800 mb-2">Recent runs</p>
            {data.runs.length === 0 ? (
              <p className="text-sm text-gray-500">The scheduler has not run yet on this database.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th scope="col" className="px-3 py-2 font-medium">Started</th>
                      <th scope="col" className="px-3 py-2 font-medium">By</th>
                      <th scope="col" className="px-3 py-2 font-medium">Announcements</th>
                      <th scope="col" className="px-3 py-2 font-medium">Push campaigns</th>
                      <th scope="col" className="px-3 py-2 font-medium">Retries</th>
                      <th scope="col" className="px-3 py-2 font-medium">Membership reminders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.runs.map((run: any) => (
                      <tr key={run._id} className="align-top">
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDate(run.startedAt, true)}</td>
                        <td className="px-3 py-2 text-gray-700">{run.trigger === 'cron' ? 'Cron' : run.by}</td>
                        <td className="px-3 py-2 text-gray-700">{describe(run.result?.announcements, 'announcements')}</td>
                        <td className="px-3 py-2 text-gray-700">{describe(run.result?.pushCampaigns, 'push')}</td>
                        <td className="px-3 py-2 text-gray-700">{describe(run.result?.retries, 'retries')}</td>
                        <td className="px-3 py-2 text-gray-700">{describe(run.result?.membershipReminders, 'reminders')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmRun}
        title="Run the scheduler now"
        message="This sends everything that is due right now: scheduled announcements, push campaigns, automatic retries and (if switched on) membership expiry reminders. Real messages go to real recipients."
        confirmLabel="Run now"
        busy={busy}
        onConfirm={runNow}
        onClose={() => setConfirmRun(false)}
      />
      <ConfirmDialog
        open={toggle !== null}
        title={toggle ? 'Switch on automatic expiry reminders' : 'Switch off automatic expiry reminders'}
        message={
          toggle
            ? 'From the next scheduler run, members whose subscription reaches a reminder day are sent the expiry reminder automatically (at most once a day each), through the channel and approved template in the membership reminder settings.'
            : 'Expiry reminders will only be sent when someone presses a button under Memberships, Expiry Reminders.'
        }
        confirmLabel={toggle ? 'Switch on' : 'Switch off'}
        askReason
        reasonRequired
        busy={busy}
        onConfirm={saveToggle}
        onClose={() => setToggle(null)}
      />
    </Card>
  )
}
