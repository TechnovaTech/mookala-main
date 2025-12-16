"use client"

import { use } from "react"
import { mockEvents } from "@/lib/mock-data"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChevronLeft, CreditCard, Wallet, Building2, Smartphone } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useLanguage } from "@/lib/language-context"

interface PaymentPageProps {
  params: Promise<{ id: string }>
}

export default function PaymentPage({ params }: PaymentPageProps) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const event = mockEvents.find((e) => e.id === id)
  const { t } = useLanguage()

  if (!event) return null

  const subtotal = Number(searchParams.get('amount')) || 0
  const tickets = Number(searchParams.get('tickets')) || 0
  const bookingFee = Math.round(subtotal * 0.095)
  const totalAmount = subtotal + bookingFee

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-center gap-4 relative max-w-3xl mx-auto">
            <Link href={`/event/${id}/book`} className="absolute left-0 p-1">
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </Link>
            <h1 className="text-lg sm:text-xl font-bold">{t('payment.title')}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Left Side - Payment Methods */}
          <div className="order-2 lg:order-1">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">{t('payment.selectMethod')}</h2>
            
            <div className="space-y-3 sm:space-y-4">
              {/* UPI */}
              <Card className="p-4 sm:p-6 hover:border-primary cursor-pointer transition-colors">
                <div className="flex items-center gap-3 sm:gap-4">
                  <Smartphone className="w-6 h-6 sm:w-8 sm:h-8 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <h3 className="font-semibold text-base sm:text-lg">{t('payment.upi')}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">{t('payment.upiDesc')}</p>
                  </div>
                </div>
              </Card>

              {/* Credit/Debit Card */}
              <Card className="p-4 sm:p-6 hover:border-primary cursor-pointer transition-colors">
                <div className="flex items-center gap-3 sm:gap-4">
                  <CreditCard className="w-6 h-6 sm:w-8 sm:h-8 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <h3 className="font-semibold text-base sm:text-lg">{t('payment.creditDebit')}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">{t('payment.cardDesc')}</p>
                  </div>
                </div>
              </Card>

              {/* Net Banking */}
              <Card className="p-4 sm:p-6 hover:border-primary cursor-pointer transition-colors">
                <div className="flex items-center gap-3 sm:gap-4">
                  <Building2 className="w-6 h-6 sm:w-8 sm:h-8 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <h3 className="font-semibold text-base sm:text-lg">{t('payment.netBanking')}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">{t('payment.netBankingDesc')}</p>
                  </div>
                </div>
              </Card>

              {/* Wallets */}
              <Card className="p-4 sm:p-6 hover:border-primary cursor-pointer transition-colors">
                <div className="flex items-center gap-3 sm:gap-4">
                  <Wallet className="w-6 h-6 sm:w-8 sm:h-8 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <h3 className="font-semibold text-base sm:text-lg">{t('payment.wallets')}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">{t('payment.walletsDesc')}</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Right Side - Booking Summary */}
          <div className="order-1 lg:order-2">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">{t('payment.bookingSummary')}</h2>
            
            <Card className="p-4 sm:p-6 mb-4">
              <div className="flex justify-between items-start mb-4 gap-3">
                <h3 className="font-semibold text-base sm:text-lg flex-1 min-w-0">{t(`event.${event.id}.title`) || event.title}</h3>
                <p className="font-bold text-base sm:text-lg flex-shrink-0">₹{subtotal.toFixed(2)}</p>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{tickets} {t('booking.tickets')}</p>
              
              <div className="border-t pt-4 space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t('payment.date')}</span>
                  <span className="font-medium text-right">Sun, 28 Dec, 2025</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t('payment.time')}</span>
                  <span className="font-medium text-right">04:00 PM</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground flex-shrink-0">{t('payment.venue')}</span>
                  <span className="font-medium text-right break-words">Pramukh Swami Auditorium: Rajkot</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t('payment.tickets')}</span>
                  <span className="font-medium text-right">{tickets} ticket(s)</span>
                </div>
              </div>
            </Card>

            <Card className="p-4 sm:p-6 mb-4">
              <h3 className="font-semibold mb-4 text-base sm:text-lg">{t('payment.priceBreakdown')}</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span>{t('booking.subTotal')}</span>
                  <span>₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('booking.bookingFee')}</span>
                  <span>₹{bookingFee.toFixed(2)}</span>
                </div>
                <div className="border-t pt-3 flex justify-between font-bold text-base sm:text-lg">
                  <span>{t('booking.totalAmount')}</span>
                  <span>₹{totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </Card>

            <Card className="p-4 sm:p-6 mb-4 border-white">
              <div className="flex items-start gap-3">
                <span className="text-lg sm:text-xl flex-shrink-0">ℹ️</span>
                <div className="text-xs sm:text-sm min-w-0">
                  <p className="font-semibold mb-2 text-white">{t('payment.importantInfo')}</p>
                  <ul className="space-y-1 text-white">
                    <li>{t('payment.instantConfirm')}</li>
                    <li>{t('payment.emailTicket')}</li>
                    <li>{t('payment.idProof')}</li>
                    <li>{t('payment.venueGuidelines')}</li>
                  </ul>
                </div>
              </div>
            </Card>

            <Button
              className="w-full bg-orange-500 hover:bg-orange-600 text-white h-12 sm:h-14 text-sm sm:text-lg rounded-lg font-semibold shadow-lg transition-all duration-200 active:scale-95"
            >
              {t('payment.pay')} ₹{totalAmount.toFixed(2)}
            </Button>
          </div>
        </div>
      </div>
    </main>
  )
}
