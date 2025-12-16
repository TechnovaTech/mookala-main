"use client"

import { HeroSearch } from "@/components/hero-search"
import { FeaturedSlider } from "@/components/featured-slider"
import { CategorySection } from "@/components/category-section"
import { TrendingCities } from "@/components/trending-cities"
import { Newsletter } from "@/components/newsletter"
import { mockEvents, getTranslatedEvents, trendingCities, categories } from "@/lib/mock-data"
import { useLanguage } from "@/lib/language-context"

export default function Home() {
  const { t, language } = useLanguage()
  const excludedCategories = ["Festivals", "Dance", "Workshops", "Custom Orders"]
  const translatedEvents = getTranslatedEvents(language)
  const featuredEvents = translatedEvents.filter((e) => e.featured && !excludedCategories.includes(e.category))

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="px-4 sm:px-6 lg:px-8 pt-8 pb-12 max-w-7xl mx-auto">
        <HeroSearch />
      </section>

      {/* MOOKALAA Stats Section */}
      <section className="px-4 sm:px-6 lg:px-8 py-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-6">
          {[
            { label: t("stats.eventsBooked"), value: "150+" },
            { label: t("stats.artists"), value: "250+" },
            { label: t("stats.tickets"), value: "50,000+" },
            { label: t("stats.learners"), value: "2,000+" },
            { label: t("stats.orders"), value: "3,000+" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 rounded-lg p-4 text-center"
            >
              <div className="text-2xl md:text-3xl font-bold text-amber-500">{stat.value}</div>
              <div className="text-xs md:text-sm text-muted-foreground mt-2">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Featured Events Slider */}
      <section className="px-4 sm:px-6 lg:px-8 py-12 max-w-7xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">{t("featured.title")}</h2>
          <p className="text-muted-foreground">{t("featured.subtitle")}</p>
        </div>
        <FeaturedSlider events={featuredEvents} />
      </section>

      {/* Indian Idol Contestants Section */}
      <section className="px-4 sm:px-6 lg:px-8 pb-12 max-w-7xl mx-auto">
        <CategorySection category="Indian idol contestants" events={translatedEvents} />
      </section>

      {/* Categories */}
      <section className="px-4 sm:px-6 lg:px-8 pb-12 max-w-7xl mx-auto space-y-4">
        {categories.slice(0, 3).map((category) => (
          <CategorySection key={category} category={category} events={translatedEvents} />
        ))}

      </section>

      {/* Trending Cities */}
      <section className="px-4 sm:px-6 lg:px-8 pb-12 max-w-7xl mx-auto">
        <TrendingCities cities={trendingCities} />
      </section>

      {/* Newsletter */}
      <section className="px-4 sm:px-6 lg:px-8 py-12 max-w-7xl mx-auto">
        <Newsletter />
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-8">
            <div>
              <h3 className="font-bold mb-4">{t("footer.discover")}</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="/events" className="hover:text-foreground transition">
                    {t("footer.browse")}
                  </a>
                </li>
                <li>
                  <a href="/events" className="hover:text-foreground transition">
                    {t("footer.trending")}
                  </a>
                </li>
                <li>
                  <a href="/events" className="hover:text-foreground transition">
                    {t("footer.category")}
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4">{t("footer.artists")}</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-foreground transition">
                    {t("footer.register")}
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition">
                    {t("footer.monetize")}
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition">
                    {t("footer.resources")}
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4">{t("footer.support")}</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="mailto:info@mookalaa.com" className="hover:text-foreground transition">
                    info@mookalaa.com
                  </a>
                </li>
                <li>
                  <a href="mailto:support@mookalaa.com" className="hover:text-foreground transition">
                    support@mookalaa.com
                  </a>
                </li>
                <li>
                  <a href="mailto:sponsors@mookalaa.com" className="hover:text-foreground transition">
                    sponsors@mookalaa.com
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4">{t("footer.legal")}</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="/privacy" className="hover:text-foreground transition">
                    {t("footer.privacy")}
                  </a>
                </li>
                <li>
                  <a href="/terms" className="hover:text-foreground transition">
                    {t("footer.terms")}
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition">
                    {t("footer.refund")}
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4">Contact</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="tel:9583023002" className="hover:text-foreground transition">
                    +91 9583023002
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2025 Venootic Enterprises OPC Private Limited. 
MOOKALAA is a registered trademark of Venootic Enterprises OPC Private Limited.</p>
          </div>
        </div>
      </footer>
    </main>
  )
}
