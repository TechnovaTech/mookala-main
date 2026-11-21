import ResourcePage from '@/components/ResourcePage'
import { NoticeBar } from '@/components/ui'

export default function Page() {
  return (
    <ResourcePage resource="risk-cases">
      <NoticeBar
        notice={{
          type: 'info',
          text: 'A case is a review, not a finding. Record evidence as internal notes on the case, give a reason when escalating or resolving, and take any action on the account from its own page. Resolving a case records who resolved it and when.',
        }}
      />
    </ResourcePage>
  )
}
