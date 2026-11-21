'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Edit2, ExternalLink, Plus, Power, Trash2 } from 'lucide-react'
import { useCan } from '@/components/AdminShell'
import { Button, Card, ConfirmDialog, EmptyState, Modal, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { Field, MediaUpload, PlacementBadge, SearchInput, matches, toDateInput } from './shared'

/**
 * Manager for the two kinds of placement the user app shows on its home
 * screen: homepage banners and sponsored ads. Both are stored with their
 * picture or short video inside the record.
 */

interface Placement {
  _id: string
  title: string
  image: string
  mediaType: string
  link: string
  order: number
  status: string
  state: 'active' | 'inactive' | 'scheduled' | 'expired'
  startDate: string | null
  endDate: string | null
  sponsor?: string
  duration?: number
  createdAt: string
  /** Set on items that are an advertiser campaign, which is managed on the Campaigns screen. */
  campaignId?: string
}

const CONFIG = {
  banner: {
    api: '/api/banners',
    listKey: 'banners',
    singular: 'banner',
    plural: 'banners',
    emptyHint: 'Banners are the sliding pictures at the top of the user app home screen.',
  },
  ad: {
    api: '/api/ads',
    listKey: 'ads',
    singular: 'ad',
    plural: 'ads',
    emptyHint: 'Sponsored ads are shown in rotation on the user app home screen between their start and end dates.',
  },
} as const

const EMPTY = { title: '', image: '', link: '', order: '1', sponsor: '', startDate: '', endDate: '', minutes: '0', seconds: '5', status: 'active' }

type Pending = { item: Placement; kind: 'delete' | 'activate' | 'deactivate' }

export default function PlacementManager({ kind }: { kind: 'banner' | 'ad' }) {
  const config = CONFIG[kind]
  const isAd = kind === 'ad'
  const canManage = useCan('ads:manage')

  const [items, setItems] = useState<Placement[]>([])
  const [campaigns, setCampaigns] = useState<Placement[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [search, setSearch] = useState('')
  const [state, setState] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Placement | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [formError, setFormError] = useState('')
  const [formReason, setFormReason] = useState('')
  const [saving, setSaving] = useState(false)

  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<any>(config.api)
      const all: Placement[] = data[config.listKey] || []
      // The same list also carries live advertiser campaigns for this placement. They are not edited here.
      setItems(all.filter((item) => !item.campaignId))
      setCampaigns(all.filter((item) => item.campaignId))
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || `Could not load ${config.plural}.` })
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => {
    load()
  }, [load])

  const visible = useMemo(
    () => items.filter((item) => (!state || item.state === state) && matches(search, item.title, item.sponsor, item.link)),
    [items, search, state]
  )

  const counts = useMemo(() => {
    const out: Record<string, number> = { active: 0, scheduled: 0, inactive: 0, expired: 0 }
    for (const item of items) out[item.state] = (out[item.state] || 0) + 1
    return out
  }, [items])

  const openForm = (item: Placement | null) => {
    setEditing(item)
    setForm(
      item
        ? {
            title: item.title || '',
            image: item.image || '',
            link: item.link || '',
            order: String(item.order || 1),
            sponsor: item.sponsor || '',
            startDate: toDateInput(item.startDate),
            endDate: toDateInput(item.endDate),
            minutes: String(Math.floor((item.duration || 0) / 60)),
            seconds: String((item.duration || 0) % 60),
            status: item.status || 'active',
          }
        : EMPTY
    )
    setFormError('')
    setFormReason('')
    setShowForm(true)
  }

  const save = async () => {
    if (!form.title.trim()) return setFormError('Enter a title.')
    if (isAd && !form.sponsor.trim()) return setFormError('Enter the sponsor.')
    if (!form.image) return setFormError('Upload an image or a short video.')
    if (isAd && (!form.startDate || !form.endDate)) return setFormError('Choose the start date and the end date.')
    if (form.startDate && form.endDate && form.endDate < form.startDate) return setFormError('The end date cannot be before the start date.')
    if (form.link.trim() && !/^https?:\/\//i.test(form.link.trim())) return setFormError('The link must start with http:// or https://')
    if (formReason.trim().length < 5) return setFormError('Write a reason for this change (at least 5 characters). It is saved in the activity log.')

    const body: Record<string, any> = {
      title: form.title.trim(),
      link: form.link.trim(),
      order: parseInt(form.order, 10) || 1,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      status: form.status,
      reason: formReason.trim(),
    }
    if (isAd) {
      body.sponsor = form.sponsor.trim()
      body.duration = (parseInt(form.minutes, 10) || 0) * 60 + (parseInt(form.seconds, 10) || 0)
    }
    // An unchanged file is not uploaded again.
    if (!editing || form.image !== editing.image) body.image = form.image

    setSaving(true)
    setFormError('')
    try {
      await api(editing ? `${config.api}/${editing._id}` : config.api, { method: editing ? 'PUT' : 'POST', body })
      setNotice({ type: 'success', text: `"${body.title}" was ${editing ? 'updated' : 'added'}.` })
      setShowForm(false)
      await load()
    } catch (error: any) {
      setFormError(error.message || `Could not save the ${config.singular}.`)
    } finally {
      setSaving(false)
    }
  }

  const confirm = async (reason: string) => {
    if (!pending) return
    const { item, kind: what } = pending
    setBusy(true)
    try {
      if (what === 'delete') {
        await api(`${config.api}/${item._id}`, { method: 'DELETE', body: { reason } })
        setNotice({ type: 'success', text: `"${item.title}" was deleted.` })
      } else {
        await api(`${config.api}/${item._id}`, { method: 'PUT', body: { status: what === 'activate' ? 'active' : 'inactive', reason } })
        setNotice({
          type: 'success',
          text:
            what === 'activate'
              ? `"${item.title}" is active.${item.state === 'expired' ? ' Its end date has passed, so it stays hidden until the dates are changed.' : ''}`
              : `"${item.title}" is inactive and hidden from the app.`,
        })
      }
      setPending(null)
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: `"${item.title}" was not changed. ${error.message || ''}` })
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <Card>
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by state">
            {[
              { value: '', label: `All (${items.length})` },
              { value: 'active', label: `Active (${counts.active})` },
              { value: 'scheduled', label: `Scheduled (${counts.scheduled})` },
              { value: 'inactive', label: `Inactive (${counts.inactive})` },
              { value: 'expired', label: `Expired (${counts.expired})` },
            ].map((tab) => (
              <button
                key={tab.value}
                role="tab"
                aria-selected={state === tab.value}
                onClick={() => setState(tab.value)}
                className={`px-3 py-1.5 rounded-full text-sm ${state === tab.value ? 'bg-deep-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <SearchInput
              id={`${kind}-search`}
              value={search}
              onChange={setSearch}
              placeholder={isAd ? 'Search by title, sponsor or link...' : 'Search by title or link...'}
            />
            {canManage && (
              <Button onClick={() => openForm(null)}>
                <Plus size={16} />
                Add {config.singular}
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            title={items.length === 0 ? `No ${config.plural} yet` : `No ${config.plural} match these filters`}
            hint={items.length === 0 ? config.emptyHint : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Preview</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  {isAd && <th className="px-4 py-3 font-medium">Sponsor</th>}
                  <th className="px-4 py-3 font-medium">Runs</th>
                  {isAd && <th className="px-4 py-3 font-medium">Shown for</th>}
                  <th className="px-4 py-3 font-medium text-right">Order</th>
                  <th className="px-4 py-3 font-medium">State</th>
                  {canManage && <th className="px-4 py-3 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((item) => (
                  <tr key={item._id} className="align-top hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {item.mediaType === 'video' ? (
                        <video src={item.image} className="h-14 w-24 rounded object-cover bg-gray-100" muted />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image} alt="" className="h-14 w-24 rounded object-cover bg-gray-100" />
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-medium text-deep-blue">{item.title}</p>
                      {item.link ? (
                        <a href={item.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:underline break-all">
                          <ExternalLink size={12} />
                          {item.link}
                        </a>
                      ) : (
                        <p className="text-xs text-gray-500">No link</p>
                      )}
                    </td>
                    {isAd && <td className="px-4 py-3">{item.sponsor || '—'}</td>}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.startDate || item.endDate ? (
                        <>
                          {item.startDate ? formatDate(item.startDate) : 'Now'} to {item.endDate ? formatDate(item.endDate) : 'no end date'}
                          {item.state === 'expired' && <span className="block text-xs text-red-700">Ended {formatDate(item.endDate)}</span>}
                        </>
                      ) : (
                        <span className="text-gray-500">No dates set</span>
                      )}
                    </td>
                    {isAd && <td className="px-4 py-3 whitespace-nowrap">{item.duration ? `${item.duration} seconds` : 'App default'}</td>}
                    <td className="px-4 py-3 text-right">{item.order}</td>
                    <td className="px-4 py-3">
                      <PlacementBadge state={item.state} />
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setPending({ item, kind: item.status === 'active' ? 'deactivate' : 'activate' })}
                            aria-label={`${item.status === 'active' ? 'Deactivate' : 'Activate'} ${item.title}`}
                            title={item.status === 'active' ? 'Deactivate' : 'Activate'}
                            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                          >
                            <Power size={16} />
                          </button>
                          <button onClick={() => openForm(item)} aria-label={`Edit ${item.title}`} title="Edit" className="p-2 rounded-lg text-gray-600 hover:bg-gray-100">
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => setPending({ item, kind: 'delete' })}
                            aria-label={`Delete ${item.title}`}
                            title="Delete"
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <div className="px-5 py-4 border-b border-gray-200" data-campaign-placements>
          <h2 className="text-base font-semibold text-deep-blue">Advertiser campaigns in this slot ({campaigns.length})</h2>
          <p className="text-sm text-gray-500 mt-1">
            Live advertiser campaigns placed as {isAd ? '"Sponsored card"' : '"Home banner"'} are shown in the user app after the {config.plural} above.
            City-targeted campaigns are only sent to the app for a matching city, so they are not listed here. They are managed on{' '}
            <Link href="/advertising/campaigns" className="text-teal font-medium hover:underline">
              Campaigns
            </Link>
            .
          </p>
        </div>
        {campaigns.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">No advertiser campaign without city targeting is live in this slot right now.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {campaigns.map((item) => (
              <li key={item._id} className="flex items-center gap-4 px-5 py-3 text-sm">
                {item.mediaType === 'video' ? (
                  <video src={item.image} className="h-14 w-24 rounded object-cover bg-gray-100" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image} alt="" className="h-14 w-24 rounded object-cover bg-gray-100" />
                )}
                <div className="min-w-0">
                  <Link href={`/advertising/campaigns?id=${item.campaignId}`} className="text-teal font-medium hover:underline">
                    {item.title}
                  </Link>
                  <p className="text-xs text-gray-500">
                    {item.sponsor ? `${item.sponsor} · ` : ''}
                    {formatDate(item.startDate)} to {formatDate(item.endDate)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={showForm}
        title={editing ? `Edit ${editing.title}` : `Add ${config.singular}`}
        onClose={() => setShowForm(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              {editing ? 'Save changes' : `Add ${config.singular}`}
            </Button>
          </>
        }
      >
        {formError && <NoticeBar notice={{ type: 'error', text: formError }} />}
        <div className="space-y-4">
          <MediaUpload
            id={`${kind}-file`}
            label="Image or video"
            value={form.image}
            onChange={(image) => setForm({ ...form, image })}
            onError={setFormError}
            allowVideo
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Title" htmlFor={`${kind}-title`} required>
              <input id={`${kind}-title`} type="text" value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
            </Field>
            {isAd && (
              <Field label="Sponsor" htmlFor="ad-sponsor" required>
                <input id="ad-sponsor" type="text" value={form.sponsor} maxLength={200} onChange={(e) => setForm({ ...form, sponsor: e.target.value })} className={inputClass} />
              </Field>
            )}
            <Field label="Link opened on tap" htmlFor={`${kind}-link`}>
              <input
                id={`${kind}-link`}
                type="url"
                value={form.link}
                placeholder="https://"
                onChange={(e) => setForm({ ...form, link: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Display order" htmlFor={`${kind}-order`} help="Lower numbers are shown first.">
              <input id={`${kind}-order`} type="number" min={1} value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Start date" htmlFor={`${kind}-start`} required={isAd} help={isAd ? undefined : 'Leave empty to show straight away.'}>
              <input id={`${kind}-start`} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={inputClass} />
            </Field>
            <Field label="End date" htmlFor={`${kind}-end`} required={isAd} help={isAd ? 'Shown up to and including this day.' : 'Leave empty to show until it is deactivated.'}>
              <input
                id={`${kind}-end`}
                type="date"
                value={form.endDate}
                min={form.startDate || undefined}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className={inputClass}
              />
            </Field>
            {isAd && (
              <>
                <Field label="Shown for (minutes)" htmlFor="ad-minutes">
                  <input id="ad-minutes" type="number" min={0} max={59} value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Shown for (seconds)" htmlFor="ad-seconds" help="How long the app shows this ad before moving to the next.">
                  <input id="ad-seconds" type="number" min={0} max={59} value={form.seconds} onChange={(e) => setForm({ ...form, seconds: e.target.value })} className={inputClass} />
                </Field>
              </>
            )}
            <Field label="Status" htmlFor={`${kind}-status`}>
              <select id={`${kind}-status`} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}>
                <option value="active">Active</option>
                <option value="inactive">Inactive (hidden from the app)</option>
              </select>
            </Field>
          </div>
          <Field label="Reason for this change *" htmlFor={`${kind}-reason`} help="Saved in the activity log with the old and new values.">
            <input
              id={`${kind}-reason`}
              type="text"
              value={formReason}
              maxLength={500}
              onChange={(e) => setFormReason(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending ? `${pending.kind === 'delete' ? 'Delete' : pending.kind === 'activate' ? 'Activate' : 'Deactivate'} ${pending.item.title}` : ''}
        message={
          pending?.kind === 'delete'
            ? `This permanently removes the ${config.singular} and its file.`
            : pending?.kind === 'deactivate'
            ? `The ${config.singular} is hidden from the user app until it is activated again.`
            : `The ${config.singular} is shown in the user app again, as long as today is inside its dates.`
        }
        confirmLabel={pending?.kind === 'delete' ? 'Delete' : pending?.kind === 'activate' ? 'Activate' : 'Deactivate'}
        danger={pending?.kind === 'delete'}
        askReason
        reasonRequired
        busy={busy}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    </>
  )
}
