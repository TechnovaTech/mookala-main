import ResourcePage from '@/components/ResourcePage'
import BackupPanels from '@/components/system/BackupPanels'

export default function Page() {
  return (
    <ResourcePage resource="backups">
      <BackupPanels />
    </ResourcePage>
  )
}
