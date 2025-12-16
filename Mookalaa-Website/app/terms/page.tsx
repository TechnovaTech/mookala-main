"use client"

import { useLanguage } from "@/lib/language-context"

export default function TermsPage() {
  const { t } = useLanguage()
  return (
    <main className="min-h-screen pt-8">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-amber-500/10 to-amber-600/10 border-b border-amber-500/20 py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-amber-500 to-amber-600 bg-clip-text text-transparent">
            {t("terms.title")}
          </h1>
          <p className="text-lg text-muted-foreground">{t("terms.subtitle")}</p>
          <p className="text-sm text-muted-foreground mt-2">{t("terms.updated")}</p>
        </div>
      </section>

      {/* Content Section */}
      <section className="px-4 sm:px-6 lg:px-8 py-12 max-w-4xl mx-auto">
        <div className="space-y-8">

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("terms.section1")}</h2>
            <p className="text-muted-foreground">
              {t("terms.section1.text")}
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("terms.section2")}</h2>
            <p className="text-muted-foreground">
              {t("terms.section2.text")}
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("terms.section3")}</h2>
            <p className="text-muted-foreground mb-4">{t("terms.section3.text")}</p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("terms.bullet3.1")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("terms.bullet3.2")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("terms.bullet3.3")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("terms.bullet3.4")}
              </li>
            </ul>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("terms.section4")}</h2>
            <p className="text-muted-foreground mb-4">{t("terms.section4.text")}</p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("terms.bullet4.1")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("terms.bullet4.2")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("terms.bullet4.3")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("terms.bullet4.4")}
              </li>
            </ul>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("terms.section5")}</h2>
            <p className="text-muted-foreground mb-4">{t("terms.section5.text")}</p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("terms.bullet5.1")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("terms.bullet5.2")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("terms.bullet5.3")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("terms.bullet5.4")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("terms.bullet5.5")}
              </li>
            </ul>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("terms.section6")}</h2>
            <p className="text-muted-foreground mb-4">{t("terms.section6.text")}</p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("terms.bullet6.1")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("terms.bullet6.2")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("terms.bullet6.3")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("terms.bullet6.4")}
              </li>
            </ul>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("terms.section7")}</h2>
            <p className="text-muted-foreground">
              {t("terms.section7.text")}
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("terms.section8")}</h2>
            <p className="text-muted-foreground">
              {t("terms.section8.text")}
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("terms.section9")}</h2>
            <p className="text-muted-foreground">
              {t("terms.section9.text")}
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("terms.section10")}</h2>
            <p className="text-muted-foreground">
              {t("terms.section10.text")}
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("terms.section11")}</h2>
            <p className="text-muted-foreground">
              {t("terms.section11.text")}
            </p>
          </div>

          <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/10 border border-amber-500/20 rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("terms.section12")}</h2>
            <p className="text-muted-foreground mb-4">
              {t("terms.section12.text")}
            </p>
            <div className="space-y-2 text-muted-foreground">
              <p className="flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                Email: legal@mookalaa.com
              </p>
              <p className="flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                Address: MOOKALAA Legal Team
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}