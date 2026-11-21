import ResourcePage from '@/components/ResourcePage'
import ReportRunNow from '@/components/finance/ReportRunNow'

export default function Page() {
  return (
    <ResourcePage resource="scheduled-reports">
      <ReportRunNow />
    </ResourcePage>
  )
}
