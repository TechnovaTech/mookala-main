"use client"

import type { EventCity } from "@/lib/types"
import { Card } from "@/components/ui/card"
import Link from "next/link"
import { MapPin } from "lucide-react"
import { useLanguage } from "@/lib/language-context"

interface TrendingCitiesProps {
  cities: EventCity[]
}

export function TrendingCities({ cities }: TrendingCitiesProps) {
  const { t } = useLanguage()
  return (
    <section className="py-12">
      <div className="mb-8" suppressHydrationWarning>
        <h2 className="text-3xl font-bold mb-2">{t("trending.title")}</h2>
        <p className="text-muted-foreground">{t("trending.subtitle")}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" suppressHydrationWarning>
        {cities.map((city) => (
          <Link key={city.name} href={`/events?location=${city.name}`}>
            <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer group h-full">
              <div className="relative overflow-hidden h-48 bg-muted" suppressHydrationWarning>
                <img
                  src={city.image || "/placeholder.svg"}
                  alt={city.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" suppressHydrationWarning></div>
                <div className="absolute bottom-0 left-0 right-0 p-4 text-white" suppressHydrationWarning>
                  <div className="flex items-center gap-2 mb-1" suppressHydrationWarning>
                    <MapPin size={18} />
                    <h3 className="font-bold text-lg">{city.name}</h3>
                  </div>
                  <p className="text-sm text-white/80">{city.eventCount} {t("trending.events")}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}
