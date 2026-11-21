import Link from 'next/link'
import ResourcePage from '@/components/ResourcePage'

export default function Page() {
  return (
    <ResourcePage resource="instructors">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-3 mb-4">
        <p className="text-sm text-gray-700">
          A course can only be approved when its instructor is verified. The earnings statement for each instructor (amounts collected,
          refunds and the commission calculation) is on the earnings view.
        </p>
        <Link
          href="/learning/instructors/earnings"
          className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 whitespace-nowrap"
        >
          Instructor earnings
        </Link>
      </div>
    </ResourcePage>
  )
}
