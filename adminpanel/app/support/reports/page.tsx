import ResourcePage from '@/components/ResourcePage'
import ReportedAccounts from '@/components/users/ReportedAccounts'

export default function Page() {
  return (
    <ResourcePage resource="user-reports">
      <ReportedAccounts />
    </ResourcePage>
  )
}
