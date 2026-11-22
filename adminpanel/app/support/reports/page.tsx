'use client'
import ResourcePage from '@/components/ResourcePage'
import ReportedAccountsPanel from '@/components/support/ReportedAccountsPanel'
import ReportPanel from '@/components/support/ReportPanel'

export default function Page() {
  return (
    <ResourcePage resource="user-reports" detailActions={(item) => <ReportPanel key={item._id} reportId={item._id} />}>
      <ReportedAccountsPanel />
    </ResourcePage>
  )
}
