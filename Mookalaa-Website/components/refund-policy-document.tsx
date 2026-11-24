import type React from "react"
import { LegalList, LegalSection } from "@/components/legal"

/**
 * The company's Refund, Return, Replacement & Cancellation Policy (version 1.0),
 * as issued by Venootic Enterprises (OPC) Private Limited. Section numbers follow
 * the issued document, which leaves out the sections that do not apply here.
 */

function Numbered({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2">
      {items.map((item, index) => (
        <li key={item} className="flex items-start gap-2.5">
          <span className="min-w-6 h-6 rounded-full bg-amber-500/15 text-amber-600 text-xs font-semibold flex items-center justify-center flex-shrink-0">
            {index + 1}
          </span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  )
}

function Clauses({ items }: { items: [string, string][] }) {
  return (
    <div className="space-y-3">
      {items.map(([number, text]) => (
        <p key={number}>
          <span className="font-semibold text-foreground">{number}</span> {text}
        </p>
      ))}
    </div>
  )
}

function Table({ head, rows }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-amber-500/10">
          <tr className="text-left">
            <th className="py-2.5 px-4 font-semibold text-foreground">{head[0]}</th>
            <th className="py-2.5 px-4 font-semibold text-foreground">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a} className="border-t border-border/60">
              <td className="py-2.5 px-4 font-medium text-foreground align-top">{a}</td>
              <td className="py-2.5 px-4 align-top">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p>
      <span className="font-semibold text-foreground">{label}:</span> {children}
    </p>
  )
}

export function RefundPolicyDocument() {
  return (
    <div className="space-y-6">
      <LegalSection heading="Common Refund, Return, Replacement & Cancellation Policy" highlight>
        <div className="space-y-2">
          <Detail label="Issued by">VENOOTIC ENTERPRISES (OPC) PRIVATE LIMITED</Detail>
          <Detail label="Brand">MOOKALAA</Detail>
          <Detail label="Registered/Office Address">Satyavihar, Rasulgarh, Bhubaneswar, Khordha, Odisha, India</Detail>
          <Detail label="Policy Version">1.0</Detail>
        </div>
      </LegalSection>

      <LegalSection heading="1. Introduction">
        <p>
          This Refund &amp; Cancellation Policy (&quot;Policy&quot;) governs the cancellation of orders, refunds and
          related customer claims arising from transactions made through the MOOKALAA mobile application, website and
          other digital platforms operated by VENOOTIC ENTERPRISES (OPC) PRIVATE LIMITED (&quot;Company&quot;,
          &quot;MOOKALAA&quot;, &quot;We&quot;, &quot;Us&quot; or &quot;Our&quot;).
        </p>
        <p>
          MOOKALAA operates a digital marketplace facilitating transactions and interactions between customers, sellers,
          vendors, artisans, service providers, event organisers, cinema hall owners and other business partners.
        </p>
        <p>
          This Policy is intended to establish a transparent, consistent and fair mechanism for handling customer
          requests and commercial disputes relating to products, services, bookings and other transactions conducted
          through the Platform.
        </p>
        <p>
          By accessing the Platform or placing an order, the customer agrees to the applicable terms of this Policy,
          subject always to applicable statutory rights.
        </p>
      </LegalSection>

      <LegalSection heading="2. Scope and Applicability">
        <p>This Policy shall apply to the following categories of transactions conducted through MOOKALAA:</p>
        <Numbered
          items={[
            "Cinema hall and movie ticket bookings.",
            "Event, exhibition, expo and trade-show bookings.",
            "Stall booking and exhibitor services.",
            "Artist, photographer and other entertainment bookings.",
            "Other services and bookings made available through MOOKALAA.",
          ]}
        />
        <p>
          Different product and service categories may have additional conditions, which shall be displayed to
          customers before confirmation of the relevant transaction.
        </p>
      </LegalSection>

      <LegalSection heading="3. Definitions">
        <p>For the purpose of this Policy:</p>
        <Clauses
          items={[
            ["3.1 Customer:", "Any individual or business entity purchasing products or services through MOOKALAA."],
            [
              "3.3 Service Provider:",
              "Any person or entity providing services, events, bookings, entertainment or other facilities through the Platform.",
            ],
            ["3.4 Order:", "Any confirmed purchase or booking made through MOOKALAA."],
            [
              "3.5 Refund:",
              "Repayment of an amount received from a customer against an eligible cancelled, returned, defective, deficient or otherwise refundable transaction.",
            ],
            [
              "3.8 Cancellation:",
              "Termination of an order or booking before completion or fulfilment, subject to applicable terms.",
            ],
            [
              "3.9 Refund Request:",
              "A formal request submitted by a customer through the Platform or designated customer support channel.",
            ],
            ["3.10 Business Day:", "A working day excluding Sundays and applicable public or banking holidays."],
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. General Refund Principles">
        <Clauses
          items={[
            [
              "4.1",
              "MOOKALAA shall facilitate eligible refunds in accordance with this Policy, the applicable product or service terms and Indian law.",
            ],
            [
              "4.2",
              "Refund eligibility shall depend upon the nature of the product or service, transaction status, reason for the request, applicable cancellation conditions and supporting evidence.",
            ],
            [
              "4.3",
              "A customer shall not be entitled to an automatic refund merely because an order has been placed or a product has been delivered, except where required by law or expressly provided under the applicable terms.",
            ],
            ["4.4", "MOOKALAA may coordinate with the relevant Seller or Service Provider to verify a refund claim."],
            [
              "4.5",
              "The Company may reject a refund request where the claim is unsupported, fraudulent, abusive or falls outside the applicable refund conditions, provided that such rejection is consistent with applicable law.",
            ],
            [
              "4.6",
              "Nothing in this Policy shall exclude or restrict any mandatory consumer right or statutory remedy available under Indian law.",
            ],
          ]}
        />
      </LegalSection>

      <LegalSection heading="5. Eligible Grounds for Refund">
        <p>Subject to verification and applicable law, a customer may request a refund in the following circumstances:</p>
        <Clauses
          items={[
            [
              "a.",
              "The product has not been delivered within the applicable delivery period and the order is eligible for cancellation.",
            ],
            [
              "b.",
              "The product received is materially different from the description, specifications or representation made on the Platform.",
            ],
            ["c.", "The product is defective or damaged at the time of delivery."],
            ["d.", "The wrong product, size, colour, model or quantity has been delivered."],
            ["e.", "The product is materially incomplete or missing essential components."],
            ["f.", "The order is cancelled by the Seller or Service Provider."],
            ["g.", "The Seller or Service Provider is unable to fulfil the confirmed order or booking."],
            ["h.", "Payment has been successfully deducted but the order or booking has not been confirmed."],
            ["i.", "Duplicate payment has been made for the same transaction."],
            ["j.", "A service has not been provided as agreed."],
            ["k.", "An event, exhibition, movie show or booking is cancelled by the concerned organiser or operator."],
            ["l.", "Any other circumstance in which a refund is required under applicable law."],
          ]}
        />
      </LegalSection>

      <LegalSection heading="6. Customer Order Cancellation">
        <Clauses
          items={[
            [
              "6.1",
              "A customer may request cancellation through the MOOKALAA application, website or customer support channel.",
            ],
            [
              "6.2",
              "Cancellation requests shall be subject to the order status and the applicable category-specific conditions.",
            ],
            [
              "6.3",
              "Before dispatch or commencement of fulfilment, cancellation may ordinarily be permitted, subject to any lawful restrictions applicable to the product or service.",
            ],
            [
              "6.5",
              "Where cancellation is accepted, the eligible amount shall be refunded through the applicable payment mechanism.",
            ],
            ["6.6", "Any cancellation charge must be reasonable, disclosed in advance and legally permissible."],
          ]}
        />
      </LegalSection>

      <LegalSection heading="16. Cinema Ticket Refund Policy">
        <Clauses
          items={[
            [
              "16.1",
              "Cinema ticket cancellations shall be governed by the cancellation terms displayed at the time of booking and the applicable cinema/theatre partner agreement.",
            ],
            [
              "16.2",
              "Customer-initiated cancellation shall be permitted only where the applicable booking terms allow it or where required by law.",
            ],
            [
              "16.3",
              "Where a cinema hall or theatre cancels a show, MOOKALAA shall facilitate an eligible refund of the ticket amount collected.",
            ],
            [
              "16.4",
              "Where a show is rescheduled, the customer may be offered an appropriate alternative or refund in accordance with the applicable terms and law.",
            ],
          ]}
        />
        <p>
          <span className="font-semibold text-foreground">16.5</span> Refunds may be considered in cases of:
        </p>
        <LegalList
          items={[
            "Payment deducted but ticket not issued.",
            "Duplicate ticket payment.",
            "Show cancellation.",
            "Booking failure.",
            "Valid ticket not honoured due to a reason attributable to the theatre.",
            "Other legally recognised grounds.",
          ]}
        />
        <Clauses
          items={[
            [
              "16.6",
              "Customers shall be responsible for checking the movie, cinema, date, show time and seat details before confirming the booking.",
            ],
            [
              "16.7",
              "A no-show or late arrival shall ordinarily not qualify for a refund unless otherwise stated or required by law.",
            ],
          ]}
        />
      </LegalSection>

      <LegalSection heading="19. Service Bookings">
        <Clauses
          items={[
            [
              "19.1",
              "Services booked through MOOKALAA, including artists, photographers, videographers and other service providers, shall be governed by the specific service booking terms.",
            ],
          ]}
        />
        <p>
          <span className="font-semibold text-foreground">19.2</span> Refund eligibility may depend on:
        </p>
        <LegalList
          items={[
            "Cancellation by the service provider.",
            "Failure to provide the agreed service.",
            "Material deviation from the confirmed booking.",
            "Non-performance.",
            "Customer-initiated cancellation.",
            "Other circumstances covered by the service agreement.",
          ]}
        />
        <Clauses
          items={[
            ["19.3", "Advance payments and booking amounts may be subject to disclosed cancellation conditions."],
            [
              "19.4",
              "Where a service provider fails to fulfil a confirmed booking, MOOKALAA shall facilitate the applicable remedy in accordance with the contractual arrangement.",
            ],
          ]}
        />
      </LegalSection>

      <LegalSection heading="22. Payment Failure and Duplicate Payment">
        <Clauses
          items={[
            ["22.1", "If payment is deducted but the order is not confirmed, MOOKALAA shall verify the transaction."],
            ["22.2", "If a duplicate payment is established, the excess amount shall be refunded."],
            ["22.3", "Failed transactions may be automatically reversed by the payment gateway or bank."],
            [
              "22.4",
              "The customer may be requested to provide transaction ID, UTR/reference number, payment screenshot or other relevant information.",
            ],
            [
              "22.5",
              "The actual credit timeline may depend on the customer's bank, card issuer or payment service provider.",
            ],
          ]}
        />
      </LegalSection>

      <LegalSection heading="23. Refund Request Procedure">
        <p>Customers may submit a refund, return or cancellation request through the following process:</p>
        <Numbered
          items={[
            "Log in to the MOOKALAA application.",
            "Open “My Orders” or “My Bookings”.",
            "Select the relevant transaction.",
            "Click “Return / Refund / Cancel”.",
            "Select the reason.",
            "Provide a description of the issue.",
            "Upload supporting photographs or documents, where applicable.",
            "Submit the request.",
            "Receive a complaint/request reference number.",
            "Track the request through the Platform.",
          ]}
        />
        <p>
          Where the relevant feature is unavailable, the customer may contact the designated MOOKALAA customer support
          channel.
        </p>
      </LegalSection>

      <LegalSection heading="24. Refund Request Review and Verification">
        <Clauses
          items={[
            [
              "24.1",
              "MOOKALAA may verify the request with the Seller, Service Provider, logistics provider or payment gateway.",
            ],
            ["24.2", "MOOKALAA may request additional information reasonably necessary to assess the claim."],
            ["24.3", "The Seller or Service Provider shall cooperate with the investigation."],
            [
              "24.4",
              "The customer shall provide accurate information and shall not submit fabricated, manipulated or fraudulent evidence.",
            ],
            [
              "24.5",
              "MOOKALAA shall endeavour to communicate the decision within a reasonable period, taking into account the nature and complexity of the complaint.",
            ],
            [
              "24.6",
              "A refund shall not be unreasonably delayed or withheld where the customer's entitlement is established.",
            ],
          ]}
        />
      </LegalSection>

      <LegalSection heading="25. Refund Processing Timeline">
        <p>Subject to approval and successful processing, the following indicative timelines may apply:</p>
        <Table
          head={["Payment Method", "Indicative Credit Timeline"]}
          rows={[
            ["UPI", "3–7 business days"],
            ["Debit Card", "5–10 business days"],
            ["Credit Card", "5–10 business days or applicable billing cycle"],
            ["Net Banking", "5–10 business days"],
            ["Other payment methods", "As per payment provider"],
          ]}
        />
        <p>These are indicative processing timelines, not guaranteed bank-credit dates.</p>
        <p>
          The actual time may depend on payment gateway procedures, banking systems and third-party payment providers.
        </p>
        <p>MOOKALAA shall provide reasonable transaction or refund reference details where available.</p>
      </LegalSection>

      <LegalSection heading="26. Mode of Refund">
        <Clauses
          items={[
            ["26.1", "Refunds shall ordinarily be processed through the original payment method."],
            [
              "26.2",
              "Where the original payment method is unavailable or a refund cannot reasonably be processed through it, MOOKALAA may use another lawful refund mechanism with the customer's consent.",
            ],
            ["26.3", "Refunds may not be transferred to an unrelated third-party bank account."],
            [
              "26.4",
              "Cash refunds shall not ordinarily be available for digitally paid transactions, except where legally required or expressly approved.",
            ],
            [
              "26.5",
              "MOOKALAA shall not insist on wallet credit or store credit where the customer is legally entitled to a monetary refund.",
            ],
          ]}
        />
      </LegalSection>

      <LegalSection heading="28. Deductions from Refunds">
        <Clauses
          items={[
            [
              "28.1",
              "Any deduction from a refund must be supported by a lawful, disclosed and applicable contractual basis.",
            ],
            ["28.2", "No deduction shall be made for the purpose of defeating a customer's statutory rights."],
          ]}
        />
        <p>
          <span className="font-semibold text-foreground">28.3</span> The following may be considered where lawful and
          expressly disclosed:
        </p>
        <LegalList
          items={[
            "Approved cancellation charges.",
            "Customer-requested additional services already performed.",
            "Permissible restocking charges.",
            "Agreed non-refundable service components.",
          ]}
        />
        <Clauses
          items={[
            [
              "28.4",
              "No deduction shall ordinarily be made for a Seller's failure, wrong product supply, defective product, non-delivery or other breach attributable to the Seller where applicable law requires a full refund.",
            ],
          ]}
        />
      </LegalSection>

      <LegalSection heading="35. MOOKALAA's Role and Responsibility">
        <Clauses
          items={[
            [
              "35.1",
              "MOOKALAA may act as a digital marketplace, technology provider, booking facilitator, payment facilitator or intermediary, depending on the nature of the transaction.",
            ],
            ["35.2", "MOOKALAA may coordinate communication between Customers, Sellers and Service Providers."],
            [
              "35.3",
              "MOOKALAA shall process or facilitate eligible refunds according to the applicable transaction arrangement.",
            ],
            [
              "35.4",
              "The independent Seller or Service Provider shall remain responsible for its products, services, fulfilment and obligations, except to the extent MOOKALAA itself has assumed responsibility under a separate agreement or applicable law.",
            ],
            [
              "35.5",
              "Nothing in this Policy shall exclude or restrict any liability that the Company may have under applicable law.",
            ],
          ]}
        />
      </LegalSection>

      <LegalSection heading="36. Taxes and GST Adjustments">
        <Clauses
          items={[
            [
              "36.1",
              "Refunds and cancellation adjustments shall be recorded in accordance with applicable accounting and GST laws.",
            ],
            ["36.2", "Where required, the relevant supplier shall issue an appropriate credit note or other tax document."],
            ["36.3", "GST adjustments shall be undertaken by the person legally responsible for the relevant supply."],
          ]}
        />
      </LegalSection>

      <LegalSection heading="38. Policy Amendments">
        <p>MOOKALAA reserves the right to modify, update or revise this Policy from time to time to reflect changes in:</p>
        <LegalList
          items={[
            "Applicable laws.",
            "Business operations.",
            "Service categories.",
            "Payment methods.",
            "Technology.",
            "Customer protection requirements.",
          ]}
        />
        <p>Material changes shall be communicated through the Platform or other appropriate means.</p>
        <p>
          The revised Policy shall apply prospectively to transactions placed after its effective date, except where a
          change is required by law.
        </p>
      </LegalSection>

      <LegalSection heading="40. Governing Law and Jurisdiction">
        <p>This Policy shall be governed by the laws of India.</p>
        <p>
          Subject to the jurisdiction of consumer commissions, statutory authorities and other forums having
          jurisdiction under applicable law, courts of competent jurisdiction at Bhubaneswar, Odisha shall have
          jurisdiction over disputes arising out of this Policy.
        </p>
      </LegalSection>

      <LegalSection heading="41. Severability">
        <p>
          If any provision of this Policy is declared invalid or unenforceable, the remaining provisions shall continue
          to remain valid and enforceable to the extent permitted by law.
        </p>
      </LegalSection>

      <LegalSection heading="42. Acceptance">
        <p>
          By using the MOOKALAA Platform, placing an order, purchasing a product, booking a service or making a
          payment, the customer acknowledges having had an opportunity to review this Policy.
        </p>
        <p>
          The customer agrees to the applicable terms, subject to all rights and remedies available under Indian law.
        </p>
      </LegalSection>

      <LegalSection heading="Refund / Return Basis by Category">
        <Table
          head={["Category", "Refund / Return Basis"]}
          rows={[
            ["Cinema tickets", "Show cancellation, booking failure and disclosed cancellation conditions"],
            ["Event tickets", "Event cancellation, rescheduling and disclosed terms"],
            ["Artist and service booking", "Service provider cancellation, non-performance and agreed terms"],
          ]}
        />
      </LegalSection>

      <LegalSection heading="Issued By" highlight>
        <p className="font-semibold text-foreground">
          FOR AND ON BEHALF OF VENOOTIC ENTERPRISES (OPC) PRIVATE LIMITED
        </p>
      </LegalSection>
    </div>
  )
}
