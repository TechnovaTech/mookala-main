"use client"

import type { Event } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, MapPin, Users, Heart } from "lucide-react"
import Link from "next/link"
import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { formatDate } from "@/lib/utils-events"
import { useLanguage } from "@/lib/language-context"

interface EventCardProps {
  event: Event
  variant?: "grid" | "featured"
}

export function EventCard({ event, variant = "grid" }: EventCardProps) {
  const { t, translateCategory, translateEvent, translateLocation } = useLanguage()
  const router = useRouter()
  const [isLiked, setIsLiked] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (isMobile && videoRef.current && event.hoverVideo) {
      const playVideo = async () => {
        try {
          await videoRef.current?.play()
        } catch (error) {
          // Ignore autoplay errors
        }
      }
      playVideo()
    }
  }, [isMobile, event.hoverVideo])

  const handleMouseEnter = async () => {
    setIsHovered(true)
    if (videoRef.current && event.hoverVideo) {
      try {
        await videoRef.current.play()
      } catch (error) {
        // Ignore play interruption errors
      }
    }
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    if (videoRef.current) {
      try {
        videoRef.current.pause()
        videoRef.current.currentTime = 0
      } catch (error) {
        // Ignore pause errors
      }
    }
  }

  if (variant === "featured") {
    return (
      <Link href={`/event/${event.id}`}>
        <Card className="overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer group h-full">
          <div className="relative overflow-hidden h-64 bg-muted">
            <img
              src={event.image || "/placeholder.svg"}
              alt={event.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
            {event.featured && (
              <Badge className="absolute top-4 left-4 bg-gradient-to-r from-purple-600 to-pink-600">{t("card.featured")}</Badge>
            )}
          </div>
          <div className="p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <Badge variant="outline" className="rounded-md" suppressHydrationWarning>
                {translateCategory(event.category)}
              </Badge>
              {event.isFree && (
                <Badge variant="secondary" className="rounded-md text-xs">
                  {t("card.free")}
                </Badge>
              )}
            </div>
            <h3 className="font-bold text-lg mb-2 line-clamp-2 group-hover:text-primary transition" suppressHydrationWarning>{translateEvent(event.id, 'title', event.title)}</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar size={16} />
                <span>{formatDate(event.date)}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={16} />
                <span className="line-clamp-1">{translateLocation(event.city)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users size={16} />
                <span>{event.attendees.toLocaleString()} {t("card.attending")}</span>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="font-bold text-lg">{event.isFree ? t("card.free") : `₹${event.price}`}</span>
              {event.rating && <span className="text-sm text-yellow-500">★ {event.rating.toFixed(1)}</span>}
            </div>
          </div>
        </Card>
      </Link>
    )
  }

  // Special layout for Indian Idol Artist category
  if (event.category === "Indian idol Artist") {
    const artistData = {
      "49": {
        name: "Sunny Hindustani",
        title: "Indian Idol Star",
        image: "https://static.toiimg.com/thumb/msid-74273831,width-400,resizemode-4/74273831.jpg",
        galleryImages: [
          "https://images.hindustantimes.com/rf/image_size_960x540/HT/p2/2020/02/24/Pictures/_d9253410-56b6-11ea-9f40-2bfe36999fc5.jpg",
          "https://www.tribuneindia.com/sortd-service/imaginary/v22-01/jpg/large/high?url=dGhldHJpYnVuZS1zb3J0ZC1wcm8tcHJvZC1zb3J0ZC9tZWRpYTU3YzRlYjEwLTRlYTgtMTFlZi1iMzFjLWM3ZTc5MGQ0OWM0MS5qcGc=",
          "https://www.bookmyartistindia.com/wp-content/uploads/2024/10/Sunny-Hindustani.jpg",
          "https://www.myfirstevent.com/wp-content/uploads/2022/09/sunny-hindustani.jpg",
          "https://static.iwmbuzz.com/wp-content/uploads/2020/02/indian-idol-11-winner-sunny-hindustani-920x518.jpg"
        ]
      },
      "50": {
        name: "Salman Ali", 
        title: "Indian Idol Winner",
        image: "https://i.scdn.co/image/ab6761610000e5ebfb30baf61afda4e9f61db32e",
        galleryImages: [
          "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSmv-0zczxSyo3TFrvl78WoT7Th3jKi8tNe5w&s",
          "https://pbs.twimg.com/media/DtPntN6VAAEMs4g.jpg",
          "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSRsTp7KTMWmcaE7dfW-XFfpwei2gRSSi0BJA&s",
          "https://yt3.googleusercontent.com/ytc/AIdro_mXeR7W55GpnVSa14hiiGispUw90zv7BZkTHKaDW9KPkA=s900-c-k-c0x00ffffff-no-rj"
        ]
      }
    }
    
    const artist = artistData[event.id as keyof typeof artistData]
    if (!artist) return null
    
    return (
      <Link href={`/event/${event.id}`}>
        <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer group h-full flex flex-col bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700">
          <div className="p-6">
            {/* Artist Info */}
            <div className="flex items-center gap-4 mb-4">
              <img
                src={artist.image}
                alt={artist.name}
                className="w-16 h-16 rounded-full object-cover border-4 border-white shadow-lg"
              />
              <div className="flex-1">
                <h3 className="font-bold text-xl text-white mb-1">{artist.name}</h3>
                <p className="text-purple-400 font-medium">{artist.title}</p>
              </div>
            </div>
            
            {/* Gallery */}
            <div>
              <p className="text-sm font-semibold mb-2 text-white">Gallery</p>
              <div className="flex gap-2 flex-wrap">
                {artist.galleryImages.map((image, index) => (
                  <img 
                    key={index}
                    src={image} 
                    alt={`Performance ${index + 1}`} 
                    className="w-16 h-16 rounded-lg object-cover shadow-md hover:shadow-lg transition-shadow cursor-pointer"
                  />
                ))}
              </div>
            </div>
          </div>
        </Card>
      </Link>
    )
  }

  return (
    <Link href={`/event/${event.id}`}>
      <Card 
        className="overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer group h-full flex flex-col"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="relative overflow-hidden h-40 bg-muted" suppressHydrationWarning>
          {event.hoverVideo ? (
            <>
              <img
                src={event.image || "/placeholder.svg"}
                alt={event.title}
                className={`w-full h-full object-cover group-hover:scale-110 transition-all duration-300 ${(isHovered || isMobile) ? 'opacity-0' : 'opacity-100'}`}
              />
              <video
                ref={videoRef}
                src={event.hoverVideo}
                muted
                loop
                autoPlay={isMobile}
                playsInline
                className={`absolute inset-0 w-full h-full transition-all duration-300 ${(isHovered || isMobile) ? 'opacity-100' : 'opacity-0'}`}
                style={{ 
                  objectFit: 'cover', 
                  objectPosition: 'center',
                  width: '100%',
                  height: '100%',
                  transform: 'scale(1.8)'
                }}
              />
            </>
          ) : (
            <img
              src={event.image || "/placeholder.svg"}
              alt={event.title}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
            />
          )}
          <div className="absolute top-2 right-2 flex gap-2" suppressHydrationWarning>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setIsLiked(!isLiked)
              }}
              className="p-2 bg-white/90 rounded-full hover:bg-white transition-colors"
            >
              <Heart size={18} fill={isLiked ? "currentColor" : "none"} color={isLiked ? "#ef4444" : "#666"} />
            </button>
          </div>
        </div>
        <div className="p-4 flex-1 flex flex-col" suppressHydrationWarning>
          <Badge variant="outline" className="w-fit rounded-md text-xs mb-2" suppressHydrationWarning>
            {translateCategory(event.category)}
          </Badge>
          <h3 className="font-bold text-sm mb-2 line-clamp-2 group-hover:text-primary transition flex-1" suppressHydrationWarning>
            {translateEvent(event.id, 'title', event.title)}
          </h3>
          <div className="space-y-1 text-xs text-muted-foreground mb-3" suppressHydrationWarning>
            <div className="flex items-center gap-1" suppressHydrationWarning>
              <Calendar size={14} />
              <span>{formatDate(event.date)}</span>
            </div>
            <div className="flex items-center gap-1" suppressHydrationWarning>
              <MapPin size={14} />
              <span className="line-clamp-1">{event.isOnline ? t("card.online") : translateLocation(event.city)}</span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-border" suppressHydrationWarning>
            <span className="font-bold text-sm">{event.isFree ? t("card.free") : `₹${event.price}`}</span>
            <Button size="sm" variant="ghost" className="h-7 text-xs">
              {t("card.view")}
            </Button>
          </div>
        </div>
      </Card>
    </Link>
  )
}
