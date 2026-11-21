'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Button, Card, ConfirmDialog, EmptyState, Modal, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import {
  AccountBadge,
  Field,
  HistoryList,
  KYC_META,
  KYC_ORDER,
  KycBadge,
  Pagination,
  qs,
  readQueryParam,
  useDebounced,
  type HistoryEntry,
  type KycView,
} from '@/components/artists/shared'

type Role = 'artist' | 'organizer'
type Decision = 'approve' | 'reject' | 'request_corrections' | 'reopen'

interface Row {
  _id: string
  name: string
  phone: string
  email: string
  city: string
  kyc: KycView
  kycCorrectionRequested: boolean
  kycReviewedBy: string | null
  kycReviewedAt: string | null
  rejectionNotes: string
  accountStatus: string
  hasAadharImage: boolean
  hasPanImage: boolean
  aadharMasked: string
  panMasked: string
  createdAt: string | null
  updatedAt: string | null
}

interface ListResponse {
  items: Row[]
  total: number
  page: number
  limit: number
  counts: Record<Role, Record<KycView, number>>
  canManage: boolean
}

interface RecordResponse {
  record: Row & { aadharId: string; panId: string; aadharImage: string | null; panImage: string | null }
  history: HistoryEntry[]
  canManage: boolean
}

const ROLE_LABEL: Record<Role, string> = { artist: 'Artists', organizer: 'Organisers' }

const EMPTY_HINT: Record<KycView, string> = {
  pending: 'Nothing is waiting for review. A profile appears here when the person submits identity documents in the app.',
  approved: 'No KYC has been approved yet.',
  rejected: 'No KYC has been rejected or sent back for corrections.',
  not_submitted: 'Everyone who registered has submitted documents.',
}

const DECISIONS: Record<Decision, { label: string; title: string; confirm: string; danger: boolean; message: string }> = {
  approve: {
    label: 'Approve',
    title: 'Approve this KYC?',
    confirm: 'Approve',
    danger: false,
    message: 'The profile is marked as verified.',
  },
  reject: {
    label: 'Reject',
    title: 'Reject this KYC?',
    confirm: 'Reject',
    danger: true,
    message: 'The reason is shown to the person in the app, so write it for them.',
  },
  request_corrections: {
    label: 'Request corrections',
    title: 'Ask for corrected documents?',
    confirm: 'Send back',
    danger: false,
    message:
      'The person sees your note in the app and can submit the documents again. Until they do, the record is listed under Rejected, marked "Corrections requested".',
  },
  reopen: {
    label: 'Move back to pending',
    title: 'Move this KYC back to pending review?',
    confirm: 'Move to pending',
    danger: false,
    message: 'The earlier decision is undone and the record returns to the review queue.',
  },
}

/** Which decisions make sense from the current state. */
function decisionsFor(record: { kyc: KycView; kycCorrectionRequested: boolean }): Decision[] {
  switch (record.kyc) {
    case 'pending':
      return ['approve', 'request_corrections', 'reject']
    case 'approved':
      return ['reopen', 'request_corrections', 'reject']
    case 'rejected':
      return record.kycCorrectionRequested ? ['approve', 'reopen', 'reject'] : ['approve', 'reopen', 'request_corrections']
    default:
      return []
  }
}

function DocumentImage({ label, src }: { label: string; src: string | null }) {
  const [large, setLarge] = useState(false)
  if (!src) {
    return (
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">{label}</p>
        <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center text-sm text-gray-500">No image uploaded</div>
      </div>
    )
  }
  return (
    <div className={large ? 'sm:col-span-2' : ''}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <button onClick={() => setLarge(!large)} className="text-xs text-teal font-medium hover:underline">
          {large ? 'Smaller' : 'Enlarge'}
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} className={`w-full ${large ? '' : 'max-h-56'} object-contain bg-gray-100 border border-gray-200 rounded-lg`} />
    </div>
  )
}

function RecordDialog({
  role,
  id,
  onClose,
  onChanged,
}: {
  role: Role
  id: string
  onClose: () => void
  onChanged: (message: string) => void
}) {
  const [data, setData] = useState<RecordResponse | null>(null)
  const [problem, setProblem] = useState('')
  const [saved, setSaved] = useState('')
  const [decision, setDecision] = useState<Decision | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api<RecordResponse>(`/api/admin/kyc/${role}/${id}`))
      setProblem('')
    } catch (error: any) {
      setProblem(error.message || 'Could not load this record.')
    }
  }, [role, id])

  useEffect(() => {
    load()
  }, [load])

  const record = data?.record
  const decided = record ? record.kyc === 'approved' || record.kyc === 'rejected' : false

  const submit = async (reason: string) => {
    if (!decision) return
    setBusy(true)
    try {
      await api('/api/kyc/update-status', { method: 'POST', body: { role, id, action: decision, reason } })
      const done = DECISIONS[decision].label
      setDecision(null)
      await load()
      const text = `${done}: saved for ${record?.name || record?.phone || 'this profile'}.`
      setSaved(text)
      onChanged(text)
    } catch (error: any) {
      setDecision(null)
      setProblem(error.message || 'The decision could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open wide title={record ? `KYC: ${record.name || record.phone}` : 'KYC record'} onClose={onClose}>
      {problem && <NoticeBar notice={{ type: 'error', text: problem }} onClose={() => setProblem('')} />}
      {saved && !problem && <NoticeBar notice={{ type: 'success', text: saved }} onClose={() => setSaved('')} />}
      {!data || !record ? (
        problem ? null : (
          <Spinner />
        )
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <KycBadge kyc={record.kyc} correction={record.kycCorrectionRequested} />
            <AccountBadge status={record.accountStatus} />
            <Link href={`/${role === 'artist' ? 'artists' : 'organizers'}/${record._id}`} className="text-sm text-teal font-medium hover:underline ml-auto">
              Open full profile
            </Link>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name">{record.name}</Field>
            <Field label="Phone">{record.phone}</Field>
            <Field label="Email">{record.email}</Field>
            <Field label="City">{record.city}</Field>
            <Field label="Aadhaar number">{record.aadharId}</Field>
            <Field label="PAN number">{record.panId}</Field>
            <Field label="Reviewed by">{record.kycReviewedBy}</Field>
            <Field label="Reviewed on">{record.kycReviewedAt ? formatDate(record.kycReviewedAt, true) : ''}</Field>
            {record.rejectionNotes && (
              <div className="sm:col-span-2">
                <Field label="Note shown to the person in the app">{record.rejectionNotes}</Field>
              </div>
            )}
          </dl>

          {record.kyc === 'not_submitted' ? (
            <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-4">
              This profile has not submitted identity documents, so there is nothing to review yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DocumentImage label="Aadhaar document" src={record.aadharImage} />
              <DocumentImage label="PAN document" src={record.panImage} />
            </div>
          )}

          {data.canManage && decisionsFor(record).length > 0 && (
            <div className="border-t border-gray-200 pt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">
                {decided ? 'Change the decision (a reason is required)' : 'Decision'}
              </p>
              <div className="flex flex-wrap gap-3">
                {decisionsFor(record).map((key) => (
                  <Button
                    key={key}
                    variant={key === 'approve' ? 'primary' : key === 'reject' ? 'danger' : 'secondary'}
                    onClick={() => setDecision(key)}
                  >
                    {key === 'reject' && record.kyc === 'rejected' ? 'Reject finally' : DECISIONS[key].label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 pt-4">
            <p className="text-sm font-medium text-gray-700">Decision history</p>
            <div className="-mx-5">
              <HistoryList entries={data.history} empty="No decision has been recorded for this KYC yet." />
            </div>
          </div>
        </div>
      )}

      {decision && record && (
        <ConfirmDialog
          open
          title={DECISIONS[decision].title}
          message={
            <>
              <p>{DECISIONS[decision].message}</p>
              {decided && <p className="mt-2 font-medium">This reverses the earlier decision ({KYC_META[record.kyc].label.toLowerCase()}).</p>}
            </>
          }
          confirmLabel={DECISIONS[decision].confirm}
          danger={DECISIONS[decision].danger}
          askReason
          reasonRequired={decision !== 'approve' || decided}
          busy={busy}
          onConfirm={submit}
          onClose={() => setDecision(null)}
        />
      )}
    </Modal>
  )
}

function KycQueue() {
  const [role, setRole] = useState<Role>('artist')
  const [status, setStatus] = useState<KycView>('pending')
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [openId, setOpenId] = useState<{ role: Role; id: string } | null>(null)
  const requestId = useRef(0)

  // Links such as /kyc?role=organizer&id=... open that record directly.
  useEffect(() => {
    const wantedRole = readQueryParam('role')
    const startRole: Role = wantedRole === 'organizer' ? 'organizer' : 'artist'
    setRole(startRole)
    const id = readQueryParam('id')
    if (/^[a-f0-9]{24}$/i.test(id)) setOpenId({ role: startRole, id })
  }, [])

  useEffect(() => {
    setPage(1)
  }, [role, status, q])

  const load = useCallback(async () => {
    const current = ++requestId.current
    setLoading(true)
    try {
      const result = await api<ListResponse>('/api/kyc?' + qs({ role, status, q, page, limit: 25 }))
      if (current !== requestId.current) return
      setData(result)
    } catch (error: any) {
      if (current !== requestId.current) return
      setNotice({ type: 'error', text: error.message || 'Could not load the KYC queue.' })
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }, [role, status, q, page])

  useEffect(() => {
    load()
  }, [load])

  const counts = data?.counts

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <div className="flex gap-2 mb-4" role="tablist" aria-label="Account type">
        {(['artist', 'organizer'] as Role[]).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={role === value}
            onClick={() => setRole(value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              role === value ? 'bg-deep-blue text-white border-deep-blue' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {ROLE_LABEL[value]}
            {counts ? ` (${counts[value].pending} to review)` : ''}
          </button>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3 border-b border-gray-200">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="KYC status">
            {KYC_ORDER.map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={status === value}
                onClick={() => setStatus(value)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                  status === value ? 'border-teal text-deep-blue' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {KYC_META[value].label}
                <span className="ml-2 text-xs bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">{counts ? counts[role][value] : '…'}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-72 pb-3">
            <label htmlFor="kyc-search" className="sr-only">
              Search by name, phone, email or city
            </label>
            <Search size={16} className="absolute left-3 top-[11px] text-gray-400" />
            <input
              id="kyc-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, phone, email or city"
              className={inputClass + ' pl-9'}
            />
          </div>
        </div>

        {status === 'not_submitted' && (
          <p className="px-4 py-3 text-sm text-gray-600 bg-gray-50 border-b border-gray-200">
            These profiles registered but have not uploaded identity documents. They are not part of the review queue.
          </p>
        )}

        {loading && !data ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title={q ? 'No records match this search' : `No ${ROLE_LABEL[role].toLowerCase()} here`} hint={q ? undefined : EMPTY_HINT[status]} />
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="px-4 py-3 font-medium">{role === 'artist' ? 'Artist' : 'Organiser'}</th>
                  <th className="px-4 py-3 font-medium">City</th>
                  <th className="px-4 py-3 font-medium">Documents</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">{status === 'pending' ? 'Submitted' : status === 'not_submitted' ? 'Registered' : 'Reviewed'}</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((row) => (
                  <tr key={row._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-deep-blue">{row.name || 'No name yet'}</p>
                      <p className="text-xs text-gray-500">{row.phone || 'No phone'}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.city || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.kyc === 'not_submitted' && !row.aadharMasked ? (
                        'None'
                      ) : (
                        <>
                          <p>
                            Aadhaar {row.aadharMasked || 'not given'}
                            {row.hasAadharImage ? '' : ' (no image)'}
                          </p>
                          <p>
                            PAN {row.panMasked || 'not given'}
                            {row.hasPanImage ? '' : ' (no image)'}
                          </p>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <KycBadge kyc={row.kyc} correction={row.kycCorrectionRequested} />
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {status === 'pending'
                        ? formatDate(row.updatedAt || row.createdAt, true)
                        : status === 'not_submitted'
                        ? formatDate(row.createdAt)
                        : row.kycReviewedAt
                        ? `${formatDate(row.kycReviewedAt, true)}${row.kycReviewedBy ? ` by ${row.kycReviewedBy}` : ''}`
                        : 'Reviewer not recorded'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setOpenId({ role, id: row._id })} className="text-teal font-medium hover:underline">
                        {status === 'pending' && data.canManage ? 'Review' : 'Open'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && <Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage} />}
      </Card>

      {openId && (
        <RecordDialog
          role={openId.role}
          id={openId.id}
          onClose={() => setOpenId(null)}
          onChanged={(text) => {
            setNotice({ type: 'success', text })
            load()
          }}
        />
      )}
    </>
  )
}

export default function KYCPage() {
  return (
    <AdminShell title="Applications & KYC" subtitle="Review identity documents submitted by artists and organisers">
      <KycQueue />
    </AdminShell>
  )
}
