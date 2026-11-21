'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Edit2, Plus, Trash2, X } from 'lucide-react'
import AdminShell, { useCan } from '@/components/AdminShell'
import ResourcePage from '@/components/ResourcePage'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Modal, NoticeBar, Spinner, api, inputClass, type Notice } from '@/components/ui'
import { Field, MediaUpload, SearchInput, TabButtons, matches } from '@/components/catalogue/shared'

interface Category {
  _id: string
  name: string
  type: string
  image?: string | null
  subCategories?: { name: string }[]
}

type Tab = 'categories' | 'genres' | 'languages'

const TABS: { key: Tab; label: string }[] = [
  { key: 'categories', label: 'Event categories' },
  { key: 'genres', label: 'Genres' },
  { key: 'languages', label: 'Languages' },
]

const EMPTY = { name: '', type: '', image: '', subCategories: [] as string[] }

function CategoryList() {
  const canManage = useCan('categories:manage')
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [search, setSearch] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [pendingDelete, setPendingDelete] = useState<Category | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<Category[]>('/api/categories')
      setCategories(Array.isArray(data) ? data : [])
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not load categories.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const visible = useMemo(
    () => categories.filter((c) => matches(search, c.name, c.type, (c.subCategories || []).map((s) => s.name).join(' '))),
    [categories, search]
  )
  const types = useMemo(() => Array.from(new Set(categories.map((c) => c.type).filter(Boolean))).sort(), [categories])

  const openForm = (category: Category | null) => {
    setEditing(category)
    setForm(
      category
        ? {
            name: category.name || '',
            type: category.type || '',
            image: category.image || '',
            subCategories: (category.subCategories || []).map((s) => s.name),
          }
        : EMPTY
    )
    setFormError('')
    setShowForm(true)
  }

  const save = async () => {
    if (!form.name.trim()) return setFormError('Enter the category name.')
    if (!form.type.trim()) return setFormError('Enter the category type.')

    const body: Record<string, any> = {
      name: form.name.trim(),
      type: form.type.trim(),
      subCategories: form.subCategories.map((name) => name.trim()).filter(Boolean).map((name) => ({ name })),
    }
    // An unchanged picture is not sent again.
    if (!editing || form.image !== (editing.image || '')) body.image = form.image || null

    setSaving(true)
    setFormError('')
    try {
      await api(editing ? `/api/categories?id=${editing._id}` : '/api/categories', { method: editing ? 'PUT' : 'POST', body })
      setNotice({ type: 'success', text: `"${body.name}" was ${editing ? 'updated' : 'added'}.` })
      setShowForm(false)
      await load()
    } catch (error: any) {
      setFormError(error.message || 'Could not save the category.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (reason: string) => {
    if (!pendingDelete) return
    setBusy(true)
    try {
      const data = await api<{ eventsUsingCategory?: number }>(`/api/categories?id=${pendingDelete._id}`, { method: 'DELETE', body: { reason } })
      const used = data.eventsUsingCategory || 0
      setNotice({
        type: 'success',
        text: `"${pendingDelete.name}" was deleted.${used ? ` ${used} existing event${used === 1 ? ' still carries' : 's still carry'} this category name.` : ''}`,
      })
      setPendingDelete(null)
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: `"${pendingDelete.name}" was not deleted. ${error.message || ''}` })
      setPendingDelete(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <Card>
        <div className="p-4 border-b border-gray-200 flex flex-wrap gap-3">
          <SearchInput id="category-search" value={search} onChange={setSearch} placeholder="Search by category, type or sub-category..." />
          {canManage && (
            <Button onClick={() => openForm(null)}>
              <Plus size={16} />
              Add category
            </Button>
          )}
        </div>

        {loading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            title={categories.length === 0 ? 'No categories yet' : 'No categories match this search'}
            hint={categories.length === 0 ? 'Categories are shown in the apps and on the website, and organisers choose one for each event.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Sub-categories</th>
                  {canManage && <th className="px-4 py-3 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((category) => (
                  <tr key={category._id} className="align-top hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {category.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={category.image} alt="" className="h-10 w-10 rounded-lg object-cover bg-gray-100" />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-gray-100" aria-hidden="true" />
                        )}
                        <span className="font-medium text-deep-blue">{category.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{category.type || '—'}</td>
                    <td className="px-4 py-3">
                      {(category.subCategories || []).length === 0 ? (
                        <span className="text-gray-500">None</span>
                      ) : (
                        <ul className="flex flex-wrap gap-1.5">
                          {(category.subCategories || []).map((sub, index) => (
                            <li key={index}>
                              <Badge tone="gray">{sub.name}</Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openForm(category)} aria-label={`Edit ${category.name}`} title="Edit" className="p-2 rounded-lg text-gray-600 hover:bg-gray-100">
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => setPendingDelete(category)}
                            aria-label={`Delete ${category.name}`}
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
        title={editing ? `Edit ${editing.name}` : 'Add category'}
        onClose={() => setShowForm(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              {editing ? 'Save changes' : 'Add category'}
            </Button>
          </>
        }
      >
        {formError && <NoticeBar notice={{ type: 'error', text: formError }} />}
        <div className="space-y-4">
          <Field label="Category name" htmlFor="category-name" required>
            <input id="category-name" type="text" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
          </Field>
          {editing && form.name.trim() !== editing.name && (
            <p className="text-xs text-amber-700 -mt-2">
              Events store the category by name. Events already created under &quot;{editing.name}&quot; keep the old name.
            </p>
          )}
          <Field label="Type" htmlFor="category-type" required help="A grouping label the apps show with the category, for example Event.">
            <input
              id="category-type"
              type="text"
              list="category-types"
              value={form.type}
              maxLength={60}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className={inputClass}
            />
            <datalist id="category-types">
              {types.map((type) => (
                <option key={type} value={type} />
              ))}
            </datalist>
          </Field>

          <div>
            <p className="block text-sm font-medium text-gray-700 mb-1">Sub-categories</p>
            <div className="space-y-2">
              {form.subCategories.map((name, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={name}
                    maxLength={120}
                    aria-label={`Sub-category ${index + 1}`}
                    onChange={(e) => setForm({ ...form, subCategories: form.subCategories.map((s, i) => (i === index ? e.target.value : s)) })}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, subCategories: form.subCategories.filter((_, i) => i !== index) })}
                    aria-label={`Remove sub-category ${name || index + 1}`}
                    className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
            <Button type="button" variant="secondary" className="mt-2" onClick={() => setForm({ ...form, subCategories: [...form.subCategories, ''] })}>
              <Plus size={16} />
              Add sub-category
            </Button>
          </div>

          <MediaUpload id="category-image" label="Category image" value={form.image} onChange={(image) => setForm({ ...form, image })} onError={setFormError} />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete ? `Delete ${pendingDelete.name}` : ''}
        message="The category disappears from the apps and the website straight away. Events already created under it keep the category name but can no longer be found by browsing this category."
        confirmLabel="Delete"
        danger
        askReason
        busy={busy}
        onConfirm={remove}
        onClose={() => setPendingDelete(null)}
      />
    </>
  )
}

export default function CategoriesPage() {
  const [tab, setTab] = useState<Tab>('categories')
  const tabs = <TabButtons tabs={TABS} current={tab} onChange={setTab} />

  if (tab === 'genres' || tab === 'languages') {
    // key forces a fresh list when switching between the two managed lists.
    return (
      <ResourcePage key={tab} resource={tab}>
        {tabs}
      </ResourcePage>
    )
  }

  return (
    <AdminShell title="Event Categories" subtitle="Categories, sub-categories, genres and languages offered in the apps">
      {tabs}
      <CategoryList />
    </AdminShell>
  )
}
