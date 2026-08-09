import type { Metadata } from "next"
import { LegalPage, LegalSection, LegalList } from "@/components/legal"

export const metadata: Metadata = {
  title: "Terms & Conditions | MOOKALAA",
  description:
    "The terms governing your use of MOOKALAA, the digital platform by Venootic Enterprises OPC Private Limited connecting artists, organizers and audiences.",
}

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      intro="By downloading, installing, or using MOOKALAA, you agree to these Terms & Conditions. If you do not agree, please discontinue use of the App."
      updated="Last updated: 9 August 2026"
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
          MOOKALAA is a comprehensive digital platform developed by Venootic Enterprises OPC Private
          Limited to connect artists, organizers, audiences, businesses, and cultural communities
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
        <p>are owned by VENOOTIC ENTERPRISES OPC PVT LTD.</p>
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
          To the maximum extent permitted by law, VENOOTIC ENTERPRISES (OPC) PVT LTD shall not be
          liable for:
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
          You agree to indemnify and hold harmless VENOOTIC ENTERPRISES (OPC) PVT LTD, its
          directors, employees, and affiliates from claims arising from your misuse of the App or
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
            <span className="font-semibold text-foreground">Company Name:</span> VENOOTIC
            ENTERPRISES (OPC) PRIVATE LIMITED
          </p>
          <p>
            <span className="font-semibold text-foreground">Registered Office:</span> Plot No.
            1180/6456/16042, Satyavihar, Rasulgarh, Bhubaneswar, Khordha – 751010, Odisha, India
          </p>
          <p>
            <span className="font-semibold text-foreground">Email:</span>{" "}
            <a href="mailto:support@mookalaa.com" className="text-amber-600 hover:underline">
              support@mookalaa.com
            </a>
          </p>
          <p>
            <span className="font-semibold text-foreground">Phone:</span>{" "}
            <a href="tel:+919583023002" className="text-amber-600 hover:underline">
              +91-9583023002
            </a>
          </p>
        </div>
      </LegalSection>
    </LegalPage>
  )
}
