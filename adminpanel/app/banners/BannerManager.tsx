'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Edit2, ExternalLink, Plus, Power, Trash2 } from 'lucide-react'
import { useCan } from '@/components/AdminShell'
import { Button, Card, ConfirmDialog, EmptyState, Modal, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { Field, MediaUpload, PlacementBadge, SearchInput, matches, toDateInput } from '@/components/catalogue/shared'

/**
 * Homepage banners. Same screen as the shared placement manager, with one
 * difference the requirements ask for (section 16, Admin Activity Log): every
 * create, edit, activation, deactivation and deletion needs a written reason,
 * which the server requires and stores with the old and new values.
 */

interface Banner {
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
  createdAt: string
  /** Set on items that are an advertiser campaign, which is managed on the Campaigns screen. */
  campaignId?: string
}

const API = '/api/banners'
const MIN_REASON = 5
const EMPTY = { title: '', image: '', link: '', order: '1', startDate: '', endDate: '', status: 'active', reason: '' }

type Pending = { item: Banner; kind: 'delete' | 'activate' | 'deactivate' }

export default function BannerManager() {
  const canManage = useCan('ads:manage')

  const [items, setItems] = useState<Banner[]>([])
  const [campaigns, setCampaigns] = useState<Banner[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [search, setSearch] = useState('')
  const [state, setState] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Banner | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<any>(API)
      const all: Banner[] = data.banners || []
      // The same list also carries live advertiser campaigns for this slot. They are not edited here.
      setItems(all.filter((item) => !item.campaignId))
      setCampaigns(all.filter((item) => item.campaignId))
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not load banners.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const visible = useMemo(() => items.filter((item) => (!state || item.state === state) && matches(search, item.title, item.link)), [items, search, state])

  const counts = useMemo(() => {
    const out: Record<string, number> = { active: 0, scheduled: 0, inactive: 0, expired: 0 }
    for (const item of items) out[item.state] = (out[item.state] || 0) + 1
    return out
  }, [items])

  const openForm = (item: Banner | null) => {
    setEditing(item)
    setForm(
      item
        ? {
            title: item.title || '',
            image: item.image || '',
            link: item.link || '',
            order: String(item.order || 1),
            startDate: toDateInput(item.startDate),
            endDate: toDateInput(item.endDate),
            status: item.status || 'active',
            reason: '',
          }
        : EMPTY
    )
    setFormError('')
    setShowForm(true)
  }

  const save = async () => {
    if (!form.title.trim()) return setFormError('Enter a title.')
    if (!form.image) return setFormError('Upload an image or a short video.')
    if (form.startDate && form.endDate && form.endDate < form.startDate) return setFormError('The end date cannot be before the start date.')
    if (form.link.trim() && !/^https?:\/\//i.test(form.link.trim())) return setFormError('The link must start with http:// or https://')
    if (form.reason.trim().length < MIN_REASON) return setFormError(`Write a reason of at least ${MIN_REASON} characters. It is saved in the activity log.`)

    const body: Record<string, any> = {
      title: form.title.trim(),
      link: form.link.trim(),
      order: parseInt(form.order, 10) || 1,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      status: form.status,
      reason: form.reason.trim(),
    }
    // An unchanged file is not uploaded again.
    if (!editing || form.image !== editing.image) body.image = form.image

    setSaving(true)
    setFormError('')
    try {
      const data = await api<any>(editing ? `${API}/${editing._id}` : API, { method: editing ? 'PUT' : 'POST', body })
      setNotice({
        type: data?.unchanged ? 'info' : 'success',
        text: data?.unchanged ? `Nothing was changed on "${body.title}".` : `"${body.title}" was ${editing ? 'updated' : 'added'}. The change and your reason are in the activity log.`,
      })
      setShowForm(false)
      await load()
    } catch (error: any) {
      setFormError(error.message || 'Could not save the banner.')
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
        await api(`${API}/${item._id}`, { method: 'DELETE', body: { reason } })
        setNotice({ type: 'success', text: `"${item.title}" was deleted.` })
      } else {
        await api(`${API}/${item._id}`, { method: 'PUT', body: { status: what === 'activate' ? 'active' : 'inactive', reason } })
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
            <SearchInput id="banner-search" value={search} onChange={setSearch} placeholder="Search by title or link..." />
            {canManage && (
              <Button onClick={() => openForm(null)}>
                <Plus size={16} />
                Add banner
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            title={items.length === 0 ? 'No banners yet' : 'No banners match these filters'}
            hint={items.length === 0 ? 'Banners are the sliding pictures at the top of the user app home screen.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Preview</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Runs</th>
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
                          <button onClick={() => setPending({ item, kind: 'delete' })} aria-label={`Delete ${item.title}`} title="Delete" className="p-2 rounded-lg text-red-600 hover:bg-red-50">
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
            Live advertiser campaigns placed as &quot;Home banner&quot; are shown in the user app after the banners above. City-targeted campaigns are only
            sent to the app for a matching city, so they are not listed here. They are managed on{' '}
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
        title={editing ? `Edit ${editing.title}` : 'Add banner'}
        onClose={() => setShowForm(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} disabled={form.reason.trim().length < MIN_REASON}>
              {editing ? 'Save changes' : 'Add banner'}
            </Button>
          </>
        }
      >
        {formError && <NoticeBar notice={{ type: 'error', text: formError }} />}
        <div className="space-y-4">
          <MediaUpload id="banner-file" label="Image or video" value={form.image} onChange={(image) => setForm({ ...form, image })} onError={setFormError} allowVideo required />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Title" htmlFor="banner-title" required>
              <input id="banner-title" type="text" value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Link opened on tap" htmlFor="banner-link">
              <input id="banner-link" type="url" value={form.link} placeholder="https://" onChange={(e) => setForm({ ...form, link: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Display order" htmlFor="banner-order" help="Lower numbers are shown first.">
              <input id="banner-order" type="number" min={1} value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Start date" htmlFor="banner-start" help="Leave empty to show straight away.">
              <input id="banner-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={inputClass} />
            </Field>
            <Field label="End date" htmlFor="banner-end" help="Leave empty to show until it is deactivated.">
              <input id="banner-end" type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Status" htmlFor="banner-status">
              <select id="banner-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}>
                <option value="active">Active</option>
                <option value="inactive">Inactive (hidden from the app)</option>
              </select>
            </Field>
          </div>
          <Field label="Reason for this change" htmlFor="banner-reason" required help="Saved in the activity log with the old and new values.">
            <textarea id="banner-reason" rows={2} maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputClass} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending ? `${pending.kind === 'delete' ? 'Delete' : pending.kind === 'activate' ? 'Activate' : 'Deactivate'} ${pending.item.title}` : ''}
        message={
          pending?.kind === 'delete'
            ? 'This permanently removes the banner and its file.'
            : pending?.kind === 'deactivate'
            ? 'The banner is hidden from the user app until it is activated again.'
            : 'The banner is shown in the user app again, as long as today is inside its dates.'
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
