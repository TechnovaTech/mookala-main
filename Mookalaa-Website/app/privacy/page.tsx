import type { Metadata } from "next"
import { LegalPage, LegalSection, LegalSubheading, LegalList } from "@/components/legal"

export const metadata: Metadata = {
  title: "Privacy Policy | MOOKALAA",
  description:
    "How MOOKALAA collects, uses, discloses and safeguards your information when you use our application and related services.",
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="We respect your privacy and are committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and related services."
      updated="Last updated: 9 August 2026"
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
            <span className="font-semibold text-foreground">Company Name:</span> VENOOTIC
            ENTERPRISES OPC PVT LTD
          </p>
          <p>
            <span className="font-semibold text-foreground">Address:</span> Plot No.
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
          <p>
            <span className="font-semibold text-foreground">Website:</span>{" "}
            <a
              href="https://www.mookalaa.com"
              className="text-amber-600 hover:underline"
              rel="noopener noreferrer"
            >
              www.mookalaa.com
            </a>
          </p>
        </div>
      </LegalSection>
    </LegalPage>
  )
}
