'use client'
import React, { useEffect, useState } from 'react'
import { Button, NoticeBar, api, inputClass, type Notice } from '@/components/ui'

interface Artist {
  id: string
  name: string
  city: string
  genre: string
  phoneEnding: string
}

/**
 * Shown in the detail view of a custom wish: the assigned artist and, for an
 * admin who may manage wishes, a search over the approved artists to assign
 * or replace one. Replacing needs a reason. `onAssigned` reloads the record.
 */
export default function ArtistAssign({
  item,
  canManage,
  onAssigned,
}: {
  item: Record<string, any>
  canManage: boolean
  onAssigned: (id: string, message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [artists, setArtists] = useState<Artist[]>([])
  const [total, setTotal] = useState(0)
  const [searching, setSearching] = useState(false)
  const [chosen, setChosen] = useState<Artist | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  const assigned = Boolean(item.artistId)
  const locked = (Boolean(item.paidAt) && assigned) || item.status === 'cancelled' || item.status === 'refunded'

  useEffect(() => {
    setOpen(false)
    setChosen(null)
    setReason('')
    setTerm('')
    setNotice(null)
  }, [item._id, item.artistId])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(() => {
      api<{ artists: Artist[]; total: number }>('/api/admin/wishes/artists?q=' + encodeURIComponent(term.trim()))
        .then((data) => {
          if (cancelled) return
          setArtists(data.artists || [])
          setTotal(data.total || 0)
        })
        .catch((problem: any) => {
          if (!cancelled) setNotice({ type: 'error', text: problem.message || 'Could not search artists.' })
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, term ? 250 : 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, term])

  const save = async () => {
    if (!chosen || saving) return
    setSaving(true)
    setNotice(null)
    try {
      await api(`/api/admin/wishes/custom/${item._id}/artist`, { method: 'POST', body: { artistId: chosen.id, reason: reason.trim() } })
      onAssigned(String(item._id), `${chosen.name} is now the artist for this wish.`)
    } catch (problem: any) {
      setNotice({ type: 'error', text: problem.message || 'Could not assign the artist.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="border border-gray-200 rounded-lg p-4" data-artist-assign>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-deep-blue">Artist</h3>
          {assigned ? (
            <p className="text-sm text-gray-900" data-assigned-artist>
              {item.artistName}
            </p>
          ) : (
            <p className="text-sm text-amber-800" data-assigned-artist="">
              No approved artist is assigned yet.
              {item.requestedArtist ? ` The earlier entry names "${item.requestedArtist}" as free text.` : ''} The wish cannot be marked paid
              until one is assigned.
            </p>
          )}
        </div>
        {canManage && !locked && !open && (
          <Button variant="secondary" className="ml-auto" onClick={() => setOpen(true)}>
            {assigned ? 'Change artist' : 'Assign artist'}
          </Button>
        )}
      </div>
      {locked && assigned && item.paidAt && (
        <p className="text-xs text-gray-500 mt-1">
          The payment for this wish is recorded in the ledger for this artist, so the artist can no longer be changed.
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          <NoticeBar notice={notice} onClose={() => setNotice(null)} />
          <div>
            <label htmlFor="wish-artist-search" className="block text-sm font-medium text-gray-700 mb-1">
              Search approved artists
            </label>
            <input
              id="wish-artist-search"
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Name, city or phone number"
              className={inputClass}
              autoComplete="off"
            />
          </div>
          <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto text-sm" aria-label="Approved artists">
            {searching && artists.length === 0 && <li className="px-3 py-2 text-gray-500">Searching...</li>}
            {!searching && artists.length === 0 && (
              <li className="px-3 py-2 text-gray-500">
                {term.trim() ? `No approved artist matches "${term.trim()}".` : 'There are no approved artists yet. Artists are approved on the KYC screen.'}
              </li>
            )}
            {artists.map((artist) => (
              <li key={artist.id}>
                <button
                  type="button"
                  data-artist-option={artist.id}
                  aria-pressed={chosen?.id === artist.id}
                  onClick={() => setChosen(artist)}
                  className={`w-full text-left px-3 py-2 ${chosen?.id === artist.id ? 'bg-blue-50 text-deep-blue font-medium' : 'hover:bg-gray-50 text-gray-800'}`}
                >
                  {artist.name}
                  <span className="text-gray-500 font-normal">
                    {[artist.city, artist.genre, artist.phoneEnding ? `phone ending ${artist.phoneEnding}` : ''].filter(Boolean).map((part) => ` · ${part}`).join('')}
                  </span>
                </button>
              </li>
            ))}
            {total > artists.length && (
              <li className="px-3 py-2 text-xs text-gray-500">
                Showing {artists.length} of {total}. Type to search the rest.
              </li>
            )}
          </ul>
          {assigned && (
            <div>
              <label htmlFor="wish-artist-reason" className="block text-sm font-medium text-gray-700 mb-1">
                Reason for replacing {item.artistName}
              </label>
              <input
                id="wish-artist-reason"
                type="text"
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                placeholder="This is saved in the activity log"
                className={inputClass}
              />
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} disabled={!chosen || (assigned && !reason.trim())}>
              {chosen ? `Assign ${chosen.name}` : 'Assign'}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
