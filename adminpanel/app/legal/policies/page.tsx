import ResourcePage from '@/components/ResourcePage'
import { NoticeBar } from '@/components/ui'

export default function Page() {
  return (
    <ResourcePage resource="policies">
      <NoticeBar
        notice={{
          type: 'info',
          text: 'Published policies are available to the apps and website at /api/public/policies and /api/public/policies/<type>. The website currently shows its own built-in Terms and Privacy pages and does not read these yet, so publishing here does not change what visitors see today. Publishing a version archives the previous published version of the same type, and published text cannot be edited: add a new version.',
        }}
      />
    </ResourcePage>
  )
}
