'use client'
import ResourcePage from '@/components/ResourcePage'
import FeedbackPanel from '@/components/support/FeedbackPanel'

export default function Page() {
  return <ResourcePage resource="feedback" detailActions={(item) => <FeedbackPanel key={item._id} feedbackId={item._id} />} />
}
