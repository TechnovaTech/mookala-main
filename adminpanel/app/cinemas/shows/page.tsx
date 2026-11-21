import ResourcePage from '@/components/ResourcePage'
import { TabLinks } from '@/components/catalogue/shared'

const TABS = [
  { href: '/cinemas', label: 'Cinemas' },
  { href: '/cinemas/shows', label: 'Shows' },
]

export default function CinemaShowsPage() {
  return (
    <ResourcePage resource="cinema-shows">
      <TabLinks tabs={TABS} current="/cinemas/shows" />
    </ResourcePage>
  )
}
