'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Edit2, ExternalLink, Plus, Power, Trash2 } from 'lucide-react'
import AdminShell, { useCan } from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Modal, NoticeBar, Spinner, api, inputClass, type Notice } from '@/components/ui'
import { Field, MediaUpload, SearchInput, TabLinks, matches } from '@/components/catalogue/shared'

interface Professional {
  _id: string
  name: string
  type: 'photographer' | 'videographer'
  phone: string
  city: string
  price: string
  image: string
  bio: string
  portfolio: string
  experience: string
  status: string
  createdAt: string
}

const TABS = [
  { href: '/professionals', label: 'Professionals' },
  { href: '/hire-requests', label: 'Hire requests' },
]

const EMPTY = { name: '', type: 'photographer', phone: '', city: '', price: '', image: '', bio: '', portfolio: '', experience: '' }

type Pending = { item: Professional; kind: 'delete' | 'activate' | 'deactivate' }

function ProfessionalList() {
  const canManage = useCan('hire:manage')
  const [items, setItems] = useState<Professional[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Professional | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<{ professionals: Professional[] }>('/api/professionals')
      setItems(data.professionals || [])
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not load professionals.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const visible = useMemo(
    () =>
      items.filter(
        (p) => (!type || p.type === type) && (!status || p.status === status) && matches(search, p.name, p.city, p.phone, p.bio)
      ),
    [items, search, type, status]
  )

  const openForm = (item: Professional | null) => {
    setEditing(item)
    setForm(
      item
        ? {
            name: item.name || '',
            type: item.type || 'photographer',
            phone: item.phone || '',
            city: item.city || '',
            price: item.price || '',
            image: item.image || '',
            bio: item.bio || '',
            portfolio: item.portfolio || '',
            experience: item.experience || '',
          }
        : EMPTY
    )
    setFormError('')
    setShowForm(true)
  }

  const save = async () => {
    if (!form.name.trim()) return setFormError('Enter the name.')
    if (form.portfolio.trim() && !/^https?:\/\//i.test(form.portfolio.trim())) return setFormError('The portfolio link must start with http:// or https://')

    const body: Record<string, any> = {
      name: form.name.trim(),
      type: form.type,
      phone: form.phone.trim(),
      city: form.city.trim(),
      price: form.price.trim(),
      bio: form.bio.trim(),
      portfolio: form.portfolio.trim(),
      experience: form.experience.trim(),
    }
    // An unchanged photo is not uploaded again.
    if (!editing || form.image !== (editing.image || '')) body.image = form.image

    setSaving(true)
    setFormError('')
    try {
      await api(editing ? `/api/professionals/${editing._id}` : '/api/professionals', { method: editing ? 'PUT' : 'POST', body })
      setNotice({ type: 'success', text: `"${body.name}" was ${editing ? 'updated' : 'added'}.` })
      setShowForm(false)
      await load()
    } catch (error: any) {
      setFormError(error.message || 'Could not save the professional.')
    } finally {
      setSaving(false)
    }
  }

  const confirm = async (reason: string) => {
    if (!pending) return
    const { item, kind } = pending
    setBusy(true)
    try {
      if (kind === 'delete') {
        const data = await api<{ openHireRequests?: number }>(`/api/professionals/${item._id}`, { method: 'DELETE', body: { reason } })
        const open = data.openHireRequests || 0
        setNotice({
          type: 'success',
          text: `"${item.name}" was deleted.${open ? ` ${open} open hire request${open === 1 ? ' still refers' : 's still refer'} to this professional.` : ''}`,
        })
      } else {
        await api(`/api/professionals/${item._id}`, { method: 'PUT', body: { status: kind === 'activate' ? 'active' : 'inactive', reason } })
        setNotice({ type: 'success', text: `"${item.name}" is now ${kind === 'activate' ? 'listed in' : 'hidden from'} the app.` })
      }
      setPending(null)
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: `"${item.name}" was not changed. ${error.message || ''}` })
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <TabLinks tabs={TABS} current="/professionals" />
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <Card>
        <div className="p-4 border-b border-gray-200 flex flex-wrap gap-3">
          <SearchInput id="professional-search" value={search} onChange={setSearch} placeholder="Search by name, city, phone or bio..." />
          <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass + ' w-auto'}>
            <option value="">Type: all</option>
            <option value="photographer">Photographers</option>
            <option value="videographer">Videographers</option>
          </select>
          <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass + ' w-auto'}>
            <option value="">Status: all</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {canManage && (
            <Button onClick={() => openForm(null)}>
              <Plus size={16} />
              Add professional
            </Button>
          )}
        </div>

        {loading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            title={items.length === 0 ? 'No professionals yet' : 'No professionals match these filters'}
            hint={items.length === 0 ? 'Add photographers and videographers here. Customers see them in the user app and can send a hire request.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Professional</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Experience</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {canManage && <th className="px-4 py-3 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((item) => (
                  <tr key={item._id} className="align-top hover:bg-gray-50">
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex items-center gap-3">
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image} alt="" className="h-10 w-10 rounded-full object-cover bg-gray-100" />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-gray-100" aria-hidden="true" />
                        )}
                        <div>
                          <p className="font-medium text-deep-blue">{item.name}</p>
                          {item.portfolio && (
                            <a href={item.portfolio} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:underline">
                              <ExternalLink size={12} />
                              Portfolio
                            </a>
                          )}
                        </div>
                      </div>
                      {item.bio && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.bio}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={item.type === 'photographer' ? 'blue' : 'purple'}>{item.type === 'photographer' ? 'Photographer' : 'Videographer'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {item.phone || '—'}
                      <span className="block text-gray-500">{item.city}</span>
                    </td>
                    <td className="px-4 py-3">{item.price || '—'}</td>
                    <td className="px-4 py-3">{item.experience || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={item.status === 'active' ? 'green' : 'gray'}>{item.status === 'active' ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setPending({ item, kind: item.status === 'active' ? 'deactivate' : 'activate' })}
                            aria-label={`${item.status === 'active' ? 'Deactivate' : 'Activate'} ${item.name}`}
                            title={item.status === 'active' ? 'Deactivate' : 'Activate'}
                            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                          >
                            <Power size={16} />
                          </button>
                          <button onClick={() => openForm(item)} aria-label={`Edit ${item.name}`} title="Edit" className="p-2 rounded-lg text-gray-600 hover:bg-gray-100">
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => setPending({ item, kind: 'delete' })}
                            aria-label={`Delete ${item.name}`}
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

      <Modal
        open={showForm}
        title={editing ? `Edit ${editing.name}` : 'Add professional'}
        onClose={() => setShowForm(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              {editing ? 'Save changes' : 'Add professional'}
            </Button>
          </>
        }
      >
        {formError && <NoticeBar notice={{ type: 'error', text: formError }} />}
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name" htmlFor="pro-name" required>
              <input id="pro-name" type="text" value={form.name} maxLength={200} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Type" htmlFor="pro-type" required>
              <select id="pro-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputClass}>
                <option value="photographer">Photographer</option>
                <option value="videographer">Videographer</option>
              </select>
            </Field>
            <Field label="Phone" htmlFor="pro-phone">
              <input id="pro-phone" type="tel" value={form.phone} maxLength={30} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} />
            </Field>
            <Field label="City" htmlFor="pro-city">
              <input id="pro-city" type="text" value={form.city} maxLength={100} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Price" htmlFor="pro-price" help="Shown to customers as typed, for example ₹15,000 per day.">
              <input id="pro-price" type="text" value={form.price} maxLength={100} onChange={(e) => setForm({ ...form, price: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Experience" htmlFor="pro-experience">
              <input
                id="pro-experience"
                type="text"
                value={form.experience}
                maxLength={100}
                placeholder="5 years"
                onChange={(e) => setForm({ ...form, experience: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Portfolio link" htmlFor="pro-portfolio">
            <input id="pro-portfolio" type="url" value={form.portfolio} placeholder="https://" onChange={(e) => setForm({ ...form, portfolio: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Bio" htmlFor="pro-bio">
            <textarea id="pro-bio" rows={3} value={form.bio} maxLength={5000} onChange={(e) => setForm({ ...form, bio: e.target.value })} className={inputClass} />
          </Field>
          <MediaUpload id="pro-image" label="Photo" value={form.image} onChange={(image) => setForm({ ...form, image })} onError={setFormError} />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending ? `${pending.kind === 'delete' ? 'Delete' : pending.kind === 'activate' ? 'Activate' : 'Deactivate'} ${pending.item.name}` : ''}
        message={
          pending?.kind === 'delete'
            ? 'This permanently removes the professional from the list. Hire requests already sent to them are kept.'
            : pending?.kind === 'deactivate'
            ? 'The professional is hidden from the user app until activated again.'
            : 'The professional is listed in the user app again.'
        }
        confirmLabel={pending?.kind === 'delete' ? 'Delete' : pending?.kind === 'activate' ? 'Activate' : 'Deactivate'}
        danger={pending?.kind === 'delete'}
        askReason
        busy={busy}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    </>
  )
}

export default function ProfessionalsPage() {
  return (
    <AdminShell title="Hire Professionals" subtitle="Photographers and videographers customers can hire through the app">
      <ProfessionalList />
    </AdminShell>
  )
}
