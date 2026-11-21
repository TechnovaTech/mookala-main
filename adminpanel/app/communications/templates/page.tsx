import ResourcePage from '@/components/ResourcePage'
import { NoticeBar } from '@/components/ui'

export default function Page() {
  return (
    <ResourcePage resource="notification-templates">
      <NoticeBar
        notice={{
          type: 'info',
          text: 'Bulk and emergency messages can only use templates that are Approved. Approval needs the Communications approve permission, which only a Super Admin holds today. An approved template is locked: move it back to Draft to change the wording, and it then needs approval again. The sign-in OTP message is not one of these templates: its wording is the OTP template held in the 2Factor account.',
        }}
      />
    </ResourcePage>
  )
}
