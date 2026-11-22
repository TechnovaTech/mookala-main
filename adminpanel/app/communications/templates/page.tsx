import ResourcePage from '@/components/ResourcePage'
import { NoticeBar } from '@/components/ui'

export default function Page() {
  return (
    <ResourcePage resource="notification-templates">
      <NoticeBar
        notice={{
          type: 'info',
          text: 'Bulk and emergency messages (announcements, reminders, campaigns) can only use Approved templates: this is checked again for every message at the moment it is sent. Approval needs the Communications approve permission and a different admin from the author. Changing the wording or provider details of an approved template sends it back to Pending approval, and nothing bulk can use it until it is approved again. Before approval an SMS template needs its DLT template ID, a WhatsApp template the name of the template approved by Meta, and an email template a subject. A message is only sent when every {{variable}} in the template has a value. The sign-in OTP SMS is not one of these templates: its wording is the OTP template held in the 2Factor account.',
        }}
      />
    </ResourcePage>
  )
}
