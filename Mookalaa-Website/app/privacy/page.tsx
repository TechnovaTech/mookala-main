import type { Metadata } from "next"
import { LegalPage, LegalSection, LegalSubheading, LegalList } from "@/components/legal"
import { API_BASE } from "@/lib/config"

export const metadata: Metadata = {
  title: "Privacy Policy | MOOKALAA",
  description:
    "How MOOKALAA collects, uses, discloses and safeguards your information when you use our application and related services.",
}

// Read on every request, so a version published in the admin panel shows at once.
export const dynamic = "force-dynamic"

/** The date of the text built into this page, shown when no version is published. */
const BUILT_IN_DATE = "9 August 2026"

/* ------------------------------------------------------------------ */
/* Loading the published policy and the contacts                       */
/* (the same loader and renderer as app/terms/page.tsx)                */
/* ------------------------------------------------------------------ */

interface Published {
  title: string
  version: string
  effectiveDate: string | null
  publishedAt: string | null
  body: string
}

async function getJson(path: string): Promise<{ status: number; data: any } | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    })
    return { status: response.status, data: await response.json().catch(() => null) }
  } catch {
    return null
  }
}

/** "published", "none" (404: nothing published) or "unavailable" (the backend did not answer properly). */
async function loadPolicy(type: string): Promise<{ state: "published"; policy: Published } | { state: "none" | "unavailable" }> {
  const result = await getJson(`/public/policies/${type}`)
  if (result?.status === 404) return { state: "none" }
  const p = result?.data?.policy
  if (!result || result.status !== 200 || !p || typeof p.body !== "string" || !p.body.trim()) return { state: "unavailable" }
  return {
    state: "published",
    policy: {
      title: typeof p.title === "string" ? p.title.trim() : "",
      version: p.version == null ? "" : String(p.version),
      effectiveDate: p.effectiveDate || null,
      publishedAt: p.publishedAt || null,
      body: p.body,
    },
  }
}

async function loadContacts() {
  const data = (await getJson("/public/platform"))?.data
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")
  return { email: text(data?.support?.email), phone: text(data?.support?.phone), website: text(data?.website) }
}

function longDate(value: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" })
}

/* ------------------------------------------------------------------ */
/* Policy text: plain text with a small, safe markdown subset          */
/* ------------------------------------------------------------------ */

type Block = { kind: "p"; text: string } | { kind: "h"; text: string } | { kind: "ul" | "ol"; items: string[] }

/**
 * "# " and "## " start a section, "### " a subheading, "- " / "* " a bullet,
 * "1. " a numbered item, a blank line a new paragraph, and **text** is bold.
 * Everything is rendered as React text, so HTML in the policy is shown as
 * text and never run.
 */
function parsePolicy(body: string): { heading: string | null; blocks: Block[] }[] {
  const sections: { heading: string | null; blocks: Block[] }[] = [{ heading: null, blocks: [] }]
  let paragraph: string[] = []
  const current = () => sections[sections.length - 1]
  const flush = () => {
    if (paragraph.length) current().blocks.push({ kind: "p", text: paragraph.join("\n") })
    paragraph = []
  }
  const addItem = (kind: "ul" | "ol", item: string) => {
    flush()
    const last = current().blocks[current().blocks.length - 1]
    if (last && last.kind === kind) last.items.push(item)
    else current().blocks.push({ kind, items: [item] })
  }

  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim()
    let match: RegExpMatchArray | null
    if (!line) flush()
    else if ((match = line.match(/^#{1,2}\s+(.+)$/))) {
      flush()
      sections.push({ heading: match[1].trim(), blocks: [] })
    } else if ((match = line.match(/^#{3,6}\s+(.+)$/))) {
      flush()
      current().blocks.push({ kind: "h", text: match[1].trim() })
    } else if ((match = line.match(/^[-*•]\s+(.+)$/))) addItem("ul", match[1])
    else if ((match = line.match(/^\d+[.)]\s+(.+)$/))) addItem("ol", match[1])
    else paragraph.push(line)
  }
  flush()
  return sections.filter((s) => s.heading || s.blocks.length)
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        /^\*\*[^*]+\*\*$/.test(part) ? (
          <strong key={i} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.kind === "h") return <LegalSubheading key={i}>{block.text}</LegalSubheading>
        if (block.kind === "p")
          return (
            <p key={i} className="whitespace-pre-line break-words">
              <Inline text={block.text} />
            </p>
          )
        const Tag = block.kind === "ol" ? "ol" : "ul"
        return (
          <Tag key={i} className={block.kind === "ol" ? "list-decimal pl-6 space-y-2" : "space-y-2"}>
            {block.items.map((item, j) => (
              <li key={j} className={block.kind === "ol" ? "" : "flex items-start gap-2.5"}>
                {block.kind === "ul" && <span className="w-2 h-2 bg-amber-500 rounded-full mt-[0.45rem] flex-shrink-0" />}
                <span className="break-words">
                  <Inline text={item} />
                </span>
              </li>
            ))}
          </Tag>
        )
      })}
    </>
  )
}

function PublishedPolicy({ policy }: { policy: Published }) {
  return (
    <>
      {parsePolicy(policy.body).map((section, i) =>
        section.heading ? (
          <LegalSection key={i} heading={section.heading}>
            <Blocks blocks={section.blocks} />
          </LegalSection>
        ) : (
          <div key={i} className="bg-card border border-border rounded-lg p-6">
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <Blocks blocks={section.blocks} />
            </div>
          </div>
        )
      )}
    </>
  )
}

function ContactLines({ email, phone, website }: { email: string; phone: string; website?: string }) {
  return (
    <>
      {email && (
        <p>
          <span className="font-semibold text-foreground">Email:</span>{" "}
          <a href={`mailto:${email}`} className="text-amber-600 hover:underline">
            {email}
          </a>
        </p>
      )}
      {phone && (
        <p>
          <span className="font-semibold text-foreground">Phone:</span>{" "}
          <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="text-amber-600 hover:underline">
            {phone}
          </a>
        </p>
      )}
      {website && /^https?:\/\//i.test(website) && (
        <p>
          <span className="font-semibold text-foreground">Website:</span>{" "}
          <a href={website} className="text-amber-600 hover:underline" rel="noopener noreferrer">
            {website.replace(/^https?:\/\//i, "")}
          </a>
        </p>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default async function PrivacyPage() {
  const [loaded, contacts] = await Promise.all([loadPolicy("privacy"), loadContacts()])

  if (loaded.state === "published") {
    const { policy } = loaded
    const meta = [
      policy.version && `Version ${policy.version}`,
      longDate(policy.effectiveDate) && `Effective ${longDate(policy.effectiveDate)}`,
      longDate(policy.publishedAt) && `Published ${longDate(policy.publishedAt)}`,
    ]
      .filter(Boolean)
      .join(" · ")
    return (
      <LegalPage title={policy.title || "Privacy Policy"} updated={meta}>
        <PublishedPolicy policy={policy} />
        {(contacts.email || contacts.phone) && (
          <LegalSection heading="Questions about your privacy" highlight>
            <div className="space-y-2">
              <ContactLines email={contacts.email} phone={contacts.phone} />
            </div>
          </LegalSection>
        )}
      </LegalPage>
    )
  }

  return (
    <LegalPage
      title="Privacy Policy"
      intro="We respect your privacy and are committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and related services."
      updated={
        loaded.state === "none"
          ? `Built-in version, last updated ${BUILT_IN_DATE}. No newer version has been published.`
          : `Built-in version, last updated ${BUILT_IN_DATE}. The current published version could not be loaded just now, so this text may be out of date.`
      }
    >
      <LegalSection heading="Information We Collect">
        <p>We may collect the following information:</p>

        <LegalSubheading>A. Personal Information</LegalSubheading>
        <LegalList
          items={[
            "Full Name",
            "Email Address",
            "Mobile Number",
            "Address",
            "Date of Birth",
            "Profile Photo",
            "Government Identification (if required)",
            "Payment Information (processed through secure payment gateways)",
          ]}
        />

        <LegalSubheading>B. Device Information</LegalSubheading>
        <LegalList
          items={[
            "Device ID",
            "Operating System",
            "App Version",
            "IP Address",
            "Browser Information",
            "Language Preference",
          ]}
        />

        <LegalSubheading>C. Usage Information</LegalSubheading>
        <LegalList
          items={[
            "Login Details",
            "Features Used",
            "Time Spent",
            "Crash Reports",
            "Diagnostic Information",
          ]}
        />

        <LegalSubheading>D. Location Information</LegalSubheading>
        <p>If permission is granted, we may collect:</p>
        <LegalList items={["GPS Location", "Approximate Location"]} />
        <p>Location services can be disabled from your device settings.</p>
      </LegalSection>

      <LegalSection heading="How We Use Your Information">
        <p>We use your information to:</p>
        <LegalList
          items={[
            "Create your account",
            "Provide our services",
            "Process transactions",
            "Improve app performance",
            "Personalize user experience",
            "Send notifications",
            "Respond to customer support requests",
            "Detect fraud",
            "Comply with legal obligations",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Permissions Required">
        <p>Depending on app functionality, we may request:</p>
        <LegalList
          items={[
            "Camera",
            "Microphone",
            "Storage",
            "Contacts",
            "SMS",
            "Phone",
            "Location",
            "Notifications",
          ]}
        />
        <p>Permissions are requested only when required.</p>
      </LegalSection>

      <LegalSection heading="Sharing of Information">
        <p>We do not sell your personal information.</p>
        <p>Information may be shared with:</p>
        <LegalList
          items={[
            "Payment Gateway Providers",
            "Cloud Service Providers",
            "Analytics Providers",
            "Government Authorities (when legally required)",
            "Business Partners (only with consent)",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Data Security">
        <p>
          We implement appropriate technical and organizational security measures including:
        </p>
        <LegalList
          items={[
            "SSL Encryption",
            "Secure Servers",
            "Access Controls",
            "Password Protection",
            "Regular Security Updates",
          ]}
        />
        <p>However, no system is completely secure.</p>
      </LegalSection>

      <LegalSection heading="Data Retention">
        <p>We retain your information:</p>
        <LegalList
          items={[
            "As long as your account remains active.",
            "As required by law.",
            "For dispute resolution.",
            "For audit purposes.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Cookies & Tracking Technologies">
        <p>Our App may use:</p>
        <LegalList items={["Cookies", "SDKs", "Analytics Tools", "Advertising Identifiers"]} />
        <p>These help improve user experience and app performance.</p>
      </LegalSection>

      <LegalSection heading="Third-Party Services">
        <p>Our App may integrate with:</p>
        <LegalList
          items={[
            "Google Play Services",
            "Apple App Store",
            "Firebase",
            "Google Analytics",
            "Razorpay",
            "Stripe",
            "Paytm",
            "UPI Services",
          ]}
        />
        <p>These providers have their own privacy policies.</p>
      </LegalSection>

      <LegalSection heading="Your Rights">
        <p>Depending on applicable law, you may have the right to:</p>
        <LegalList
          items={[
            "Access your information",
            "Correct inaccurate information",
            "Delete your account",
            "Withdraw consent",
            "Restrict processing",
            "Data portability",
            "Lodge complaints with authorities",
          ]}
        />
      </LegalSection>

      <LegalSection heading="International Data Transfers">
        <p>
          If data is transferred outside your country, appropriate safeguards will be implemented.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this Privacy Policy">
        <p>We may update this Privacy Policy periodically.</p>
        <p>Changes become effective upon publication.</p>
      </LegalSection>

      <LegalSection heading="Contact Us" highlight>
        <div className="space-y-2">
          <p>
            <span className="font-semibold text-foreground">Company Name:</span> APITxT
          </p>
          <p>
            <span className="font-semibold text-foreground">GSTIN:</span> 08ABVFA4087H1ZW
          </p>
          <p>
            <span className="font-semibold text-foreground">Industry:</span> Technology
          </p>
          <ContactLines email={contacts.email} phone={contacts.phone} website={contacts.website} />
        </div>
      </LegalSection>
    </LegalPage>
  )
}
