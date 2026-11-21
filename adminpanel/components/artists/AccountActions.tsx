'use client'
import React, { useState } from 'react'
import { Ban, RotateCcw } from 'lucide-react'
import { Button, ConfirmDialog, api } from '@/components/ui'

/**
 * Suspend / reactivate button for an artist or organiser. Both actions ask for
 * a reason, which the server stores in the activity log.
 */
export default function AccountActions({
  endpoint,
  name,
  status,
  kind,
  onDone,
  onError,
}: {
  /** PATCH endpoint, e.g. /api/admin/artists/<id>. */
  endpoint: string
  name: string
  status: string
  kind: 'artist' | 'organiser'
  onDone: (message: string) => void
  onError: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const suspending = status === 'active'

  const submit = async (reason: string) => {
    setBusy(true)
    try {
      await api(endpoint, { method: 'PATCH', body: { action: suspending ? 'suspend' : 'reactivate', reason } })
      setOpen(false)
      onDone(suspending ? `${name || 'The account'} has been suspended.` : `${name || 'The account'} has been reactivated.`)
    } catch (error: any) {
      setOpen(false)
      onError(error.message || 'The account could not be updated.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant={suspending ? 'danger' : 'primary'} onClick={() => setOpen(true)}>
        {suspending ? <Ban size={16} /> : <RotateCcw size={16} />}
        {suspending ? 'Suspend account' : 'Reactivate account'}
      </Button>
      <ConfirmDialog
        open={open}
        title={suspending ? `Suspend this ${kind}?` : `Reactivate this ${kind}?`}
        message={
          suspending
            ? kind === 'artist'
              ? 'A suspended artist is removed from the artist list shown in the apps until the account is reactivated. Signing in to the artist app is not blocked by this yet.'
              : 'The account is marked as suspended here until it is reactivated. Signing in to the organiser app is not blocked by this yet.'
            : 'The account returns to normal.'
        }
        confirmLabel={suspending ? 'Suspend' : 'Reactivate'}
        danger={suspending}
        askReason
        reasonRequired
        busy={busy}
        onConfirm={submit}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
