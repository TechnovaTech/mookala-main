import type { Metadata } from "next"
import { LegalPage, LegalSection, LegalList, LegalSubheading } from "@/components/legal"
import { API_BASE } from "@/lib/config"

export const metadata: Metadata = {
  title: "Terms & Conditions | MOOKALAA",
  description:
    "The terms governing your use of MOOKALAA, the digital platform by APITxT connecting artists, organizers and audiences.",
}

// Read on every request, so a version published in the admin panel shows at once.
export const dynamic = "force-dynamic"

/** The date of the text built into this page, shown when no version is published. */
const BUILT_IN_DATE = "9 August 2026"

/* ------------------------------------------------------------------ */
/* Loading the published policy and the contacts                       */
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

function ContactLines({ email, phone }: { email: string; phone: string }) {
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
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default async function TermsPage() {
  const [loaded, contacts] = await Promise.all([loadPolicy("terms"), loadContacts()])

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
      <LegalPage title={policy.title || "Terms & Conditions"} updated={meta}>
        <PublishedPolicy policy={policy} />
        {(contacts.email || contacts.phone) && (
          <LegalSection heading="Questions about these terms" highlight>
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
      title="Terms & Conditions"
      intro="By downloading, installing, or using MOOKALAA, you agree to these Terms & Conditions. If you do not agree, please discontinue use of the App."
      updated={
        loaded.state === "none"
          ? `Built-in version, last updated ${BUILT_IN_DATE}. No newer version has been published.`
          : `Built-in version, last updated ${BUILT_IN_DATE}. The current published version could not be loaded just now, so this text may be out of date.`
      }
    >
      <LegalSection heading="Acceptance of Terms">
        <p>
          By downloading, installing, or using MOOKALAA, you agree to these Terms &amp; Conditions.
        </p>
        <p>If you do not agree, please discontinue use of the App.</p>
      </LegalSection>

      <LegalSection heading="Eligibility">
        <p>Users must:</p>
        <LegalList
          items={[
            "Be at least 18 years old (or the applicable age of majority).",
            "Provide accurate registration information.",
            "Comply with all applicable laws.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="User Account">
        <p>You agree to:</p>
        <LegalList
          items={[
            "Maintain confidentiality of your password.",
            "Provide accurate information.",
            "Notify us immediately of unauthorized access.",
            "Be responsible for activities under your account.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Services">
        <p>
          MOOKALAA is a comprehensive digital platform developed by APITxT to connect artists, organizers, audiences, businesses, and cultural communities
          through technology.
        </p>
        <p>The platform offers the following services:</p>
        <LegalList
          items={[
            "Artist discovery, verification, and booking.",
            "Event discovery, promotion, management, and ticket booking.",
            "Cinema ticket booking through partnered theatres.",
            "Marketplace for handicrafts, artworks, gift products, cultural products, musical instruments, devotional products, and merchandise.",
            "Personalized video wishes from artists and celebrities.",
            "Photography and videography booking services.",
            "Cultural education, workshops, and e-learning programs.",
            "Artist portfolio creation and digital profile management.",
            "Business advertising and promotional campaigns.",
            "SHG (Self-Help Group) marketplace for locally produced products.",
            "Cultural event promotion and community engagement.",
            "Secure online payments, order management, and customer support.",
            "Communication between users, artists, sellers, organizers, and partners through MOOKALAA's authorized communication channels.",
          ]}
        />
        <p>
          MOOKALAA continuously develops and introduces new products, features, and services.
          Additional services may be added, modified, or discontinued from time to time without
          prior notice. We reserve the right to modify or discontinue services without prior notice.
        </p>
      </LegalSection>

      <LegalSection heading="User Responsibilities">
        <p>Users shall not:</p>
        <LegalList
          items={[
            "Use the App unlawfully.",
            "Upload harmful content.",
            "Violate intellectual property rights.",
            "Reverse engineer the App.",
            "Attempt unauthorized access.",
            "Spread malware or viruses.",
            "Harass or abuse other users.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Payments">
        <p>Where applicable:</p>
        <LegalList
          items={[
            "Fees are displayed before payment.",
            "Payments are processed securely through third-party gateways.",
            "Taxes are charged as applicable.",
            "Refunds are governed by our Refund Policy.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Intellectual Property">
        <p>All rights in the App, including:</p>
        <LegalList
          items={["Software", "Design", "Logo", "Content", "Trademarks", "Graphics"]}
        />
        <p>are owned by APITxT.</p>
        <p>No content may be copied or reproduced without written permission.</p>
      </LegalSection>

      <LegalSection heading="User Content">
        <p>
          Users retain ownership of content they upload but grant us a non-exclusive, worldwide
          license to use, display, and process such content solely for providing and improving the
          service.
        </p>
      </LegalSection>

      <LegalSection heading="Privacy">
        <p>
          Use of the App is governed by our{" "}
          <a href="/privacy" className="text-amber-600 hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="Disclaimer">
        <p>The App is provided &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE.&rdquo;</p>
        <p>We make no guarantees regarding:</p>
        <LegalList
          items={[
            "Continuous availability",
            "Accuracy",
            "Error-free operation",
            "Fitness for a particular purpose",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Limitation of Liability">
        <p>
          To the maximum extent permitted by law, APITxT shall not be liable for:
        </p>
        <LegalList
          items={[
            "Indirect damages",
            "Consequential damages",
            "Data loss",
            "Business interruption",
            "Loss of profits",
            "Unauthorized access resulting from circumstances beyond our reasonable control",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Indemnification">
        <p>
          You agree to indemnify and hold harmless APITxT, its directors, employees, and affiliates from claims arising from your misuse of the App or
          violation of these Terms.
        </p>
      </LegalSection>

      <LegalSection heading="Suspension and Termination">
        <p>We may suspend or terminate your account if you:</p>
        <LegalList
          items={[
            "Breach these Terms.",
            "Engage in fraudulent activities.",
            "Violate applicable laws.",
            "Misuse the App.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Force Majeure">
        <p>
          We are not liable for delays or failures caused by events beyond our reasonable control,
          including natural disasters, war, strikes, internet outages, or government actions.
        </p>
      </LegalSection>

      <LegalSection heading="Governing Law">
        <p>These Terms shall be governed by the laws of India.</p>
        <p>
          Any disputes shall be subject to the exclusive jurisdiction of the courts at Bhubaneswar,
          Odisha.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to Terms">
        <p>
          We may modify these Terms from time to time. Continued use of the App after changes are
          posted constitutes acceptance of the updated Terms.
        </p>
      </LegalSection>

      <LegalSection heading="Company Details" highlight>
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
          <ContactLines email={contacts.email} phone={contacts.phone} />
        </div>
      </LegalSection>
    </LegalPage>
  )
}
