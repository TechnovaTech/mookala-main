'use client'
import ResourcePage from '@/components/ResourcePage'

export default function Page() {
  return (
    <ResourcePage
      resource="certificates"
      detailActions={(item) => (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <p className="text-sm text-gray-700">
            {item.status === 'revoked'
              ? 'This certificate is revoked. Its printable version is marked "Revoked".'
              : 'Open the certificate as a page you can print or save as a PDF from your browser.'}
          </p>
          <a
            href={`/api/admin/learning/certificates/${encodeURIComponent(String(item._id))}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 whitespace-nowrap"
          >
            Open printable certificate
          </a>
        </div>
      )}
    >
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-3 mb-4 text-sm text-gray-700 space-y-1">
        <p>
          The certificate number is created by the server when the certificate is added and cannot be edited. A certificate
          can only be issued for an enrolment marked &quot;Completed&quot;, and is never deleted: revoke it with a reason
          instead.
        </p>
        <p>
          Anyone can check a number at{' '}
          <code className="bg-gray-100 rounded px-1.5 py-0.5 text-xs">/api/public/certificates/&lt;certificate number&gt;</code>
          . It returns only whether the certificate is valid, the student&apos;s name, the course title, the issue date and
          whether it was revoked. The website and apps do not have a verification page that uses it yet. To print a
          certificate, open its record (the eye icon) and choose &quot;Open printable certificate&quot;; nothing is sent to
          the student from this screen.
        </p>
      </div>
    </ResourcePage>
  )
}
