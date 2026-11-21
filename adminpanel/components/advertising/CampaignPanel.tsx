'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useCan } from '@/components/AdminShell'
import { Button, ConfirmDialog, NoticeBar, api, formatDate, formatMoney, inputClass, type Notice } from '@/components/ui'
import { MediaUpload } from '@/components/catalogue/shared'
import { INVOICE_STATUS, PLACEMENT_SCREEN, linkClass } from './shared'

/**
 * Shown inside the campaign view on the Campaigns screen: the campaign's
 * creative (upload, replace, remove, click-through link), where it is shown,
 * its invoice and links to the records it belongs to.
 */

interface Creative {
  image: string
  mediaType: string | null
  uploadedAt: string | null
  uploadedBy: string | null
  creativeUrl: string | null
  clickUrl: string | null
}

interface Invoice {
  _id: string
  invoiceNumber: string
  amount: number
  gstAmount: number
  total?: number
  status: string
  dueDate?: string | null
}

export default function CampaignPanel({ campaign }: { campaign: Record<string, any> }) {
  const canManage = useCan('ads:manage')
  // Invoices are Ad Payments records, which Finance records ('finance:manage').
  const canRaiseInvoice = useCan('finance:manage')
  const id = String(campaign._id)

  const [creative, setCreative] = useState<Creative | null>(null)
  const [picked, setPicked] = useState('')
  const [clickUrl, setClickUrl] = useState('')
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [gstPercent, setGstPercent] = useState('18')
  const [notice, setNotice] = useState<Notice>(null)
  const [saving, setSaving] = useState(false)
  const [raising, setRaising] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const load = useCallback(async () => {
    try {
      const [creativeData, invoiceData] = await Promise.all([
        api<Creative>(`/api/admin/advertising/campaigns/${id}/creative`),
        api<{ items: Invoice[] }>(`/api/admin/r/ad-payments?f_campaign=${id}&limit=50`),
      ])
      setCreative(creativeData)
      setClickUrl(creativeData.clickUrl || '')
      setPicked('')
      setInvoices(invoiceData.items || [])
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not load the creative.' })
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    const body: Record<string, any> = {}
    if (picked) body.image = picked
    if (clickUrl.trim() !== (creative?.clickUrl || '')) body.clickUrl = clickUrl.trim()
    if (Object.keys(body).length === 0) return setNotice({ type: 'info', text: 'Nothing has changed.' })
    if (body.clickUrl && !/^https?:\/\//i.test(body.clickUrl)) return setNotice({ type: 'error', text: 'The click-through link must start with http:// or https://' })

    setSaving(true)
    try {
      await api(`/api/admin/advertising/campaigns/${id}/creative`, { method: 'PUT', body })
      setNotice({ type: 'success', text: picked ? 'The creative was uploaded.' : 'The click-through link was saved.' })
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not save the creative.' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (reason: string) => {
    setRemoving(true)
    try {
      await api(`/api/admin/advertising/campaigns/${id}/creative`, { method: 'DELETE', body: { reason } })
      setNotice({ type: 'success', text: 'The uploaded creative was removed.' })
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not remove the creative.' })
    } finally {
      setRemoving(false)
      setConfirmRemove(false)
    }
  }

  const raiseInvoice = async () => {
    setRaising(true)
    try {
      const data = await api<{ invoice: Invoice }>(`/api/admin/advertising/campaigns/${id}/invoice`, { method: 'POST', body: { gstPercent } })
      setNotice({
        type: 'success',
        text: `Invoice ${data.invoice.invoiceNumber} was raised for ${formatMoney(data.invoice.amount)} plus ${formatMoney(data.invoice.gstAmount)} GST.`,
      })
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not raise the invoice.' })
    } finally {
      setRaising(false)
    }
  }

  const shown = picked || creative?.image || ''
  const linked = !shown && creative?.creativeUrl ? creative.creativeUrl : ''
  const screen = PLACEMENT_SCREEN[String(campaign.placement)]
  const openInvoice = (invoices || []).find((invoice) => invoice.status !== 'refunded')

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-4 bg-gray-50" data-campaign-panel={id}>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {campaign.advertiser && (
          <Link href={`/advertising/advertisers/${campaign.advertiser}`} className={linkClass}>
            Advertiser account
          </Link>
        )}
        {campaign.application && (
          <Link href={`/advertising/applications?id=${campaign.application}`} className={linkClass}>
            Application
          </Link>
        )}
        <Link href={`/advertising/payments?f_campaign=${id}`} className={linkClass}>
          Invoices for this campaign
        </Link>
        <Link href="/advertising/scheduling" className={linkClass}>
          Campaign scheduling
        </Link>
      </div>

      <p className={`text-sm ${screen ? 'text-gray-700' : 'text-amber-700'}`} data-placement-note>
        {screen
          ? `${screen} It appears there only while the campaign is live, inside its dates and has a creative${
              Array.isArray(campaign.targetLocations) && campaign.targetLocations.length
                ? `, and only to people in ${campaign.targetLocations.join(', ')}.`
                : ', in every city.'
            }`
          : 'No screen in the apps shows this placement yet, so this campaign is recorded and billed but is not displayed anywhere. Use "Home banner" or "Sponsored card" for a campaign that should be seen.'}
      </p>

      <section>
        <h3 className="text-sm font-semibold text-deep-blue mb-2">Creative</h3>
        {creative === null ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : canManage ? (
          <div className="space-y-3">
            <MediaUpload
              id={`campaign-creative-${id}`}
              label="Banner image or short video"
              value={shown}
              onChange={(value) => setPicked(value)}
              onError={(message) => setNotice({ type: 'error', text: message })}
              allowVideo
              required
            />
            {picked && <p className="text-xs text-amber-700">This file is not saved yet. Press "Save creative".</p>}
            {!shown && linked && (
              <p className="text-sm text-gray-600 break-all">
                No file is uploaded. The campaign uses its creative link:{' '}
                <a href={linked} target="_blank" rel="noreferrer" className={linkClass}>
                  {linked}
                </a>
              </p>
            )}
            {!shown && !linked && <p className="text-sm text-amber-700" data-no-creative>This campaign has no creative yet, so it cannot be approved or shown.</p>}
            {creative.uploadedAt && !picked && (
              <p className="text-xs text-gray-500">
                Uploaded {formatDate(creative.uploadedAt, true)}
                {creative.uploadedBy ? ` by ${creative.uploadedBy}` : ''}
              </p>
            )}
            <div>
              <label htmlFor={`campaign-click-${id}`} className="block text-sm font-medium text-gray-700 mb-1">
                Click-through link
              </label>
              <input
                id={`campaign-click-${id}`}
                type="url"
                value={clickUrl}
                placeholder="https://"
                maxLength={2000}
                onChange={(e) => setClickUrl(e.target.value)}
                className={inputClass}
              />
              <p className="text-xs text-gray-500 mt-1">Where a person is taken when they tap the advertisement. Without it the advertisement cannot be tapped.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={save} loading={saving}>
                Save creative
              </Button>
              {creative.image && (
                <Button variant="secondary" onClick={() => setConfirmRemove(true)} disabled={saving}>
                  Remove uploaded creative
                </Button>
              )}
            </div>
          </div>
        ) : shown || linked ? (
          <div className="space-y-2">
            {creative.mediaType === 'video' ? (
              <video src={shown} className="h-24 w-40 object-cover rounded-lg bg-gray-100" controls />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shown || linked} alt="Campaign creative" className="h-24 w-40 object-cover rounded-lg bg-gray-100" />
            )}
            <p className="text-sm text-gray-600 break-all">Click-through link: {creative.clickUrl || 'none'}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No creative has been uploaded.</p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-deep-blue mb-2">Invoice</h3>
        {invoices === null ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          <div className="space-y-2">
            {invoices.length === 0 && <p className="text-sm text-gray-600">No invoice has been raised for this campaign.</p>}
            {invoices.length > 0 && (
              <ul className="text-sm space-y-1" data-campaign-invoices>
                {invoices.map((invoice) => (
                  <li key={invoice._id}>
                    <Link href={`/advertising/payments?id=${invoice._id}`} className={linkClass}>
                      {invoice.invoiceNumber}
                    </Link>{' '}
                    · {formatMoney((Number(invoice.amount) || 0) + (Number(invoice.gstAmount) || 0))} incl. GST ·{' '}
                    {INVOICE_STATUS[invoice.status]?.label || invoice.status}
                    {invoice.dueDate && (invoice.status === 'invoiced' || invoice.status === 'overdue') ? ` · due ${formatDate(invoice.dueDate)}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {canRaiseInvoice && !openInvoice && (
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor={`campaign-gst-${id}`} className="block text-sm font-medium text-gray-700 mb-1">
                    GST %
                  </label>
                  <input
                    id={`campaign-gst-${id}`}
                    type="number"
                    min={0}
                    max={28}
                    step="0.01"
                    value={gstPercent}
                    onChange={(e) => setGstPercent(e.target.value)}
                    className={inputClass.replace('w-full ', 'w-24 ')}
                  />
                </div>
                <Button variant="secondary" onClick={raiseInvoice} loading={raising}>
                  Raise invoice from the package price
                </Button>
                <p className="text-xs text-gray-500 basis-full">
                  The invoice is for the price of the campaign&apos;s package plus GST, numbered automatically and due in 15 days.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmRemove}
        title="Remove the uploaded creative"
        message="The uploaded file is deleted. An approved campaign must keep a creative, so pause it first or upload the replacement instead."
        confirmLabel="Remove"
        danger
        askReason
        reasonRequired
        busy={removing}
        onConfirm={remove}
        onClose={() => setConfirmRemove(false)}
      />
    </div>
  )
}
