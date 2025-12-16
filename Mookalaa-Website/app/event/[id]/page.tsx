"use client"

import { mockEvents, getTranslatedEvents } from "@/lib/mock-data"
import { EventCard } from "@/components/event-card"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, MapPin, Users, Heart, Share2, Clock, CheckCircle } from "lucide-react"
import { formatDate, formatTime, addToCalendar, shareEvent, getRelatedEvents } from "@/lib/utils-events"
import Link from "next/link"
import { useState, use, useEffect } from "react"
import { useLanguage } from "@/lib/language-context"

interface EventDetailProps {
  params: Promise<{ id: string }>
}

export default function EventDetailPage({ params }: EventDetailProps) {
  const { t, translateCategory, translateEvent, translateOrganizer, language } = useLanguage()
  const { id } = use(params)
  const translatedEvents = getTranslatedEvents(language)
  const event = translatedEvents.find((e) => e.id === id)
  const [isLiked, setIsLiked] = useState(false)





  if (!event) {
    return (
      <main className="min-h-screen py-12">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">{t("eventDetail.notFound")}</h1>
          <Button asChild>
            <Link href="/events">{t("eventDetail.backToEvents")}</Link>
          </Button>
        </div>
      </main>
    )
  }

  const relatedEvents = getRelatedEvents(event, translatedEvents)

  return (
    <main className="min-h-screen py-8">
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Show only Artist section for events 49 and 50 */}
        {(id === "49" || id === "50") ? (
          <div className="max-w-4xl mx-auto">

            {/* Artist Section - Only for Indian Idol Artists */}
            {event.category === "Indian idol Artist" && (() => {
              const artistData = {
                "48": {
                  name: "Shanmukh Priya",
                  genre: language === 'hi' ? "शास्त्रीय और बॉलीवुड गायिका" : "Classical & Bollywood Singer",
                  bio: language === 'hi' ? "भारतीय शास्त्रीय और बॉलीवुड संगीत में 8 साल के अनुभव के साथ एक प्रतिभाशाली गायिका। अपनी मधुर आवाज और शक्तिशाली मंच उपस्थिति के लिए प्रसिद्ध। कई गायन प्रतियोगिताओं की विजेता।" : "A talented vocalist with 8 years of experience in Indian classical and Bollywood music. Known for her soulful renditions and powerful stage presence. Winner of multiple singing competitions.",
                  profileImage: "https://images.news18.com/ibnlive/uploads/2021/03/1616303396_shanmukhapriya.jpg",
                  galleryImages: [
                    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQzoVEmhWAAWmOWBJggHzc1isG79A0xDlJpng&s",
                    "https://static.india.com/wp-content/uploads/2021/06/pjimage-10-10.jpg?impolicy=Medium_Widthonly&w=400",
                    "https://static.toiimg.com/thumb/msid-81172929,width-1070,height-580,imgsize-858773,resizemode-75,overlay-toi_sw,pt-32,y_pad-40/photo.jpg",
                    "https://www.yovizag.com/wp-content/uploads/2021/05/Shanmukha-Priya_web-5.jpg",
                    "https://akm-img-a-in.tosshub.com/indiatoday/images/story/202107/WhatsApp_Image_2021-07-21_at_1_1_1200x768.jpeg?size=690:388"
                  ]
                },
                "49": {
                  name: "Sunny Hindustani",
                  genre: language === 'hi' ? "इंडियन आइडल स्टार" : "Indian Idol Star",
                  bio: language === 'hi' ? "असाधारण स्वर सीमा और मंच उपस्थिति के साथ इंडियन आइडल का एक उभरता सितारा। अपनी बहुमुखी गायन शैली और अपने प्रदर्शन के माध्यम से दर्शकों से जुड़ने की क्षमता के लिए जाना जाता है।" : "A rising star from Indian Idol with exceptional vocal range and stage presence. Known for his versatile singing style and ability to connect with audiences through his performances.",
                  profileImage: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTZK_pA-q2AS68MoPETeMBV9acGBizmfqT36A&s",
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
                  genre: language === 'hi' ? "इंडियन आइडल विजेता" : "Indian Idol Winner",
                  bio: language === 'hi' ? "इंडियन आइडल सीज़न 10 के विजेता और प्रसिद्ध पार्श्व गायक। अपनी मधुर आवाज और शास्त्रीय, बॉलीवुड और लोक संगीत सहित विभिन्न शैलियों में बहुमुखी गायन के लिए जाने जाते हैं।" : "Indian Idol Season 10 winner and renowned playback singer. Known for his melodious voice and versatile singing across various genres including classical, Bollywood, and folk music.",
                  profileImage: "https://i.scdn.co/image/ab6761610000e5ebfb30baf61afda4e9f61db32e",
                  galleryImages: [
                    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSmv-0zczxSyo3TFrvl78WoT7Th3jKi8tNe5w&s",
                    "https://pbs.twimg.com/media/DtPntN6VAAEMs4g.jpg",
                    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSRsTp7KTMWmcaE7dfW-XFfpwei2gRSSi0BJA&s",
                    "https://yt3.googleusercontent.com/ytc/AIdro_mXeR7W55GpnVSa14hiiGispUw90zv7BZkTHKaDW9KPkA=s900-c-k-c0x00ffffff-no-rj",
                    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQzjmW5tO9WkwxvEdX8ji2LbqW-HUuleb2IWQ&s"
                  ]
                }
              }
              
              const artist = artistData[id as keyof typeof artistData]
              if (!artist) return null
              
              return (
                <Card className="p-6 rounded-lg mb-8">
                  <h3 className="font-bold text-lg mb-4">
                    {language === 'hi' ? 'कलाकार' : 'Artist'}
                  </h3>
                  <div className="flex items-start gap-6">
                    {/* Profile Picture */}
                    <div className="flex-shrink-0">
                      <img
                        src={artist.profileImage}
                        alt="Artist Profile"
                        className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
                      />
                    </div>
                    
                    {/* Artist Info */}
                    <div className="flex-1">
                      <h4 className="font-bold text-xl mb-2">{artist.name}</h4>
                      <p className="text-purple-600 font-medium mb-3">{artist.genre}</p>
                      <p className="text-gray-500 text-sm leading-relaxed mb-4">
                        {artist.bio}
                      </p>
                      
                      {/* Gallery Images */}
                      <div>
                        <p className="text-sm font-semibold mb-2 text-white">
                        {language === 'hi' ? 'गैलरी' : 'Gallery'}
                      </p>
                        <div className="flex gap-3 flex-wrap">
                          {artist.galleryImages.map((image, index) => (
                            <img 
                              key={index}
                              src={image} 
                              alt={`Performance ${index + 1}`} 
                              className="w-24 h-24 rounded-lg object-cover shadow-md hover:shadow-lg transition-shadow cursor-pointer"
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })()}

          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2">
              {/* Title & Meta */}
              <div className="mb-8">
                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge className="rounded-md" suppressHydrationWarning>{translateCategory(event.category)}</Badge>
                  {event.isFree && (
                    <Badge variant="secondary" className="rounded-md">
                      {t("card.free")}
                    </Badge>
                  )}
                  {event.isOnline && (
                    <Badge variant="outline" className="rounded-md">
                      {t("card.online")}
                    </Badge>
                  )}
                </div>
                <h1 className="text-4xl font-bold mb-4" suppressHydrationWarning>{translateEvent(event.id, 'title', event.title)}</h1>
                <p className="text-lg text-muted-foreground mb-6" suppressHydrationWarning>{translateEvent(event.id, 'description', event.description)}</p>

                {/* Quick Info */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <Calendar size={20} className="text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">{t("eventDetail.date")}</p>
                      <p className="font-semibold">{formatDate(event.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock size={20} className="text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">{t("eventDetail.time")}</p>
                      <p className="font-semibold">{formatTime(event.time)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <MapPin size={20} className="text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">{t("eventDetail.location")}</p>
                      <p className="font-semibold">{event.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Users size={20} className="text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">{t("eventDetail.attending")}</p>
                      <p className="font-semibold">{event.attendees.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button asChild className="flex-1 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">
                    <Link href={`/event/${id}/book`}>{t('eventDetail.bookTicket')}</Link>
                  </Button>
                  <Button onClick={() => addToCalendar(event)} className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-700">
                    <Calendar size={18} className="mr-2" />
                    {t("eventDetail.addToCalendar")}
                  </Button>
                  <Button variant="outline" onClick={() => setIsLiked(!isLiked)} className="rounded-lg px-4">
                    <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
                  </Button>
                  <Button variant="outline" onClick={() => shareEvent(event)} className="rounded-lg px-4">
                    <Share2 size={18} />
                  </Button>
                </div>
              </div>

              {/* Artist Section - Only for Indian Idol Artists */}
              {event.category === "Indian idol Artist" && (() => {
                const artistData = {
                  "48": {
                    name: "Shanmukh Priya",
                    genre: language === 'hi' ? "शास्त्रीय और बॉलीवुड गायिका" : "Classical & Bollywood Singer",
                    bio: language === 'hi' ? "भारतीय शास्त्रीय और बॉलीवुड संगीत में 8 साल के अनुभव के साथ एक प्रतिभाशाली गायिका। अपनी मधुर आवाज और शक्तिशाली मंच उपस्थिति के लिए प्रसिद्ध। कई गायन प्रतियोगिताओं की विजेता।" : "A talented vocalist with 8 years of experience in Indian classical and Bollywood music. Known for her soulful renditions and powerful stage presence. Winner of multiple singing competitions.",
                    profileImage: "https://images.news18.com/ibnlive/uploads/2021/03/1616303396_shanmukhapriya.jpg",
                    galleryImages: [
                      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQzoVEmhWAAWmOWBJggHzc1isG79A0xDlJpng&s",
                      "https://static.india.com/wp-content/uploads/2021/06/pjimage-10-10.jpg?impolicy=Medium_Widthonly&w=400",
                      "https://static.toiimg.com/thumb/msid-81172929,width-1070,height-580,imgsize-858773,resizemode-75,overlay-toi_sw,pt-32,y_pad-40/photo.jpg",
                      "https://www.yovizag.com/wp-content/uploads/2021/05/Shanmukha-Priya_web-5.jpg",
                      "https://akm-img-a-in.tosshub.com/indiatoday/images/story/202107/WhatsApp_Image_2021-07-21_at_1_1_1200x768.jpeg?size=690:388"
                    ]
                  },
                  "49": {
                    name: "Sunny Hindustani",
                    genre: language === 'hi' ? "इंडियन आइडल स्टार" : "Indian Idol Star",
                    bio: language === 'hi' ? "असाधारण स्वर सीमा और मंच उपस्थिति के साथ इंडियन आइडल का एक उभरता सितारा। अपनी बहुमुखी गायन शैली और अपने प्रदर्शन के माध्यम से दर्शकों से जुड़ने की क्षमता के लिए जाना जाता है।" : "A rising star from Indian Idol with exceptional vocal range and stage presence. Known for his versatile singing style and ability to connect with audiences through his performances.",
                    profileImage: "https://static.toiimg.com/thumb/msid-74273831,width-400,resizemode-4/74273831.jpg",
                    galleryImages: [
                      "https://images.hindustantimes.com/rf/image_size_960x540/HT/p2/2020/02/24/Pictures/_d9253410-56b6-11ea-9f40-2bfe36999fc5.jpg",
                      "https://www.tribuneindia.com/sortd-service/imaginary/v22-01/jpg/large/high?url=dGhldHJpYnVuZS1zb3J0ZC1wcm8tcHJvZC1zb3J0ZC9tZWRpYTU3YzRlYjEwLTRlYTgtMTFlZi1iMzFjLWM3ZTc5MGQ0OWM0MS5qcGc=",
                      "https://www.bookmyartistindia.com/wp-content/uploads/2024/10/Sunny-Hindustani.jpg",
                      "https://www.myfirstevent.com/wp-content/uploads/2022/09/sunny-hindustani.jpg",
                      "https://static.iwmbuzz.com/wp-content/uploads/2020/02/indian-idol-11-winner-sunny-hindustani-920x518.jpg",
                      "https://www.jagranimages.com/images/newimg/22022020/22_02_2020-sunnyhindustani_20050619.jpg"
                    ]
                  },
                  "50": {
                    name: "Salman Ali",
                    genre: language === 'hi' ? "इंडियन आइडल विजेता" : "Indian Idol Winner",
                    bio: language === 'hi' ? "इंडियन आइडल सीज़न 10 के विजेता और प्रसिद्ध पार्श्व गायक। अपनी मधुर आवाज और शास्त्रीय, बॉलीवुड और लोक संगीत सहित विभिन्न शैलियों में बहुमुखी गायन के लिए जाने जाते हैं।" : "Indian Idol Season 10 winner and renowned playback singer. Known for his melodious voice and versatile singing across various genres including classical, Bollywood, and folk music.",
                    profileImage: "https://i.scdn.co/image/ab6761610000e5ebfb30baf61afda4e9f61db32e",
                    galleryImages: [
                      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSmv-0zczxSyo3TFrvl78WoT7Th3jKi8tNe5w&s",
                      "https://pbs.twimg.com/media/DtPntN6VAAEMs4g.jpg",
                      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSRsTp7KTMWmcaE7dfW-XFfpwei2gRSSi0BJA&s",
                      "https://yt3.googleusercontent.com/ytc/AIdro_mXeR7W55GpnVSa14hiiGispUw90zv7BZkTHKaDW9KPkA=s900-c-k-c0x00ffffff-no-rj",
                      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQzjmW5tO9WkwxvEdX8ji2LbqW-HUuleb2IWQ&s",
                      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRtvvOlBsAIFik9o0AWquffoKOovHWlkDzUUQ&s"
                    ]
                  }
                }
                
                const artist = artistData[id as keyof typeof artistData]
                if (!artist) return null
                
                return (
                  <Card className="p-6 rounded-lg mb-8">
                    <h3 className="font-bold text-lg mb-4">
                      {language === 'hi' ? 'कलाकार' : 'Artist'}
                    </h3>
                    <div className="flex items-start gap-6">
                      {/* Profile Picture */}
                      <div className="flex-shrink-0">
                        <img
                          src={artist.profileImage}
                          alt="Artist Profile"
                          className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
                        />
                      </div>
                      
                      {/* Artist Info */}
                      <div className="flex-1">
                        <h4 className="font-bold text-xl mb-2">{artist.name}</h4>
                        <p className="text-purple-600 font-medium mb-3">{artist.genre}</p>
                        <p className="text-gray-500 text-sm leading-relaxed mb-4">
                          {artist.bio}
                        </p>
                        
                        {/* Gallery Images */}
                        <div>
                          <p className="text-sm font-semibold mb-2 text-white">
                          {language === 'hi' ? 'गैलरी' : 'Gallery'}
                        </p>
                          <div className="flex gap-3 flex-wrap">
                            {artist.galleryImages.map((image, index) => (
                              <img 
                                key={index}
                                src={image} 
                                alt={`Performance ${index + 1}`} 
                                className="w-24 h-24 rounded-lg object-cover shadow-md hover:shadow-lg transition-shadow cursor-pointer"
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                )
              })()}

              {/* Organizer */}
              <Card className="p-6 rounded-lg mb-8">
                <h3 className="font-bold text-lg mb-4">{t("eventDetail.aboutOrganizer")}</h3>
                <div className="flex items-center gap-4">
                  <img
                    src={event.organizer.image || "/placeholder.svg"}
                    alt={event.organizer.name}
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold" suppressHydrationWarning>{translateOrganizer(event.organizer.name)}</h4>
                      {event.organizer.verified && <CheckCircle size={18} className="text-blue-500" />}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {event.organizer.events} events • {event.organizer.followers.toLocaleString()} followers
                    </p>
                  </div>
                </div>
              </Card>

              {/* Location Map */}
              <Card className="p-6 rounded-lg mb-8">
                <h3 className="font-bold text-lg mb-4">{t("eventDetail.location")}</h3>
                <div className="w-full h-64 bg-muted rounded-lg flex items-center justify-center">
                  <p className="text-muted-foreground">Map integration coming soon</p>
                </div>
              </Card>

              {/* Related Events */}
              {relatedEvents.length > 0 && (
                <div>
                  <h3 className="font-bold text-lg mb-4">{t("eventDetail.relatedEvents")}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {relatedEvents.map((relatedEvent) => (
                      <EventCard key={relatedEvent.id} event={relatedEvent} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-1">
              <Card className="p-6 rounded-lg sticky top-24">
                <h3 className="font-bold text-lg mb-4">{t("eventDetail.eventInfo")}</h3>

                {/* Price Info */}
                <div className="bg-gradient-to-br from-purple-600/10 to-pink-600/10 rounded-lg p-4 mb-6">
                  <p className="text-sm text-muted-foreground mb-1">{t("eventDetail.entryFee")}</p>
                  <p className="text-3xl font-bold">{event.isFree ? t("card.free") : `₹${event.price}`}</p>
                </div>

                {/* Event Type Info */}
                <div className="space-y-3 mb-6">
                  <div className="p-3 rounded-lg bg-muted border border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">{t("eventDetail.eventType")}</p>
                    <p className="font-semibold">{event.isOnline ? t("eventDetail.onlineEvent") : t("eventDetail.inPerson")}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted border border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">{t("eventDetail.attendees")}</p>
                    <p className="font-semibold">{event.attendees.toLocaleString()} {t("card.attending")}</p>
                  </div>
                </div>

                {/* Interest Button */}
                <Button
                  size="lg"
                  className="w-full mb-3 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                >
                  {t("eventDetail.markInterested")}
                </Button>

                {/* Share Button */}
                <Button variant="outline" size="lg" className="w-full rounded-lg bg-transparent">
                  {t("eventDetail.shareEvent")}
                </Button>

                {/* Event Tags */}
                <div className="mt-6 pt-6 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground mb-3">{t("eventDetail.tags")}</p>
                  <div className="flex flex-wrap gap-2">
                    {event.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="rounded-md text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
