"use client"

import { useLanguage } from "@/lib/language-context"

export default function PrivacyPage() {
  const { t } = useLanguage()
  return (
    <main className="min-h-screen pt-8">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-amber-500/10 to-amber-600/10 border-b border-amber-500/20 py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-amber-500 to-amber-600 bg-clip-text text-transparent">
            {t("privacy.title")}
          </h1>
          <p className="text-lg text-muted-foreground">{t("privacy.subtitle")}</p>
          <p className="text-sm text-muted-foreground mt-2">{t("privacy.updated")}</p>
        </div>
      </section>

      {/* Content Section */}
      <section className="px-4 sm:px-6 lg:px-8 py-12 max-w-4xl mx-auto">
        <div className="space-y-8">

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("privacy.section1")}</h2>
            <p className="text-muted-foreground mb-4">
              {t("privacy.section1.text")}
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet1.1")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet1.2")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet1.3")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet1.4")}
              </li>
            </ul>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("privacy.section2")}</h2>
            <p className="text-muted-foreground mb-4">{t("privacy.section2.text")}</p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet2.1")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet2.2")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet2.3")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet2.4")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet2.5")}
              </li>
            </ul>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("privacy.section3")}</h2>
            <p className="text-muted-foreground mb-4">
              {t("privacy.section3.text1")}
            </p>
            <p className="text-muted-foreground mb-4">{t("privacy.section3.text2")}</p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet3.1")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet3.2")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet3.3")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet3.4")}
              </li>
            </ul>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("privacy.section4")}</h2>
            <p className="text-muted-foreground">
              {t("privacy.section4.text")}
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("privacy.section5")}</h2>
            <p className="text-muted-foreground mb-4">{t("privacy.section5.text")}</p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet5.1")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet5.2")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet5.3")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet5.4")}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0"></span>
                {t("privacy.bullet5.5")}
              </li>
            </ul>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("privacy.section6")}</h2>
            <p className="text-muted-foreground">
              {t("privacy.section6.text")}
            </p>
          </div>

          <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/10 border border-amber-500/20 rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-amber-600">{t("privacy.section7")}</h2>
            <p className="text-muted-foreground mb-4">
              {t("privacy.section7.text")}
            </p>
            <div className="space-y-2 text-muted-foreground">
              <p className="flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                Email: privacy@mookalaa.com
              </p>
              <p className="flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                Address: MOOKALAA Privacy Team
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}