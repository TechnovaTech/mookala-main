"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Star, Play, Music, Users } from "lucide-react"
import { useState } from "react"

interface ArtistProfileProps {
  artist: {
    name: string
    title: string
    description: string
    image: string
    rating: number
    followers: string
    performances: string[]
  }
}

export function ArtistProfile({ artist }: ArtistProfileProps) {
  const [selectedImage, setSelectedImage] = useState(0)

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-12 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Artist Info */}
        <div className="space-y-6">
          <div className="space-y-4">
            <Badge variant="outline" className="w-fit">
              <Star className="w-3 h-3 mr-1" />
              Indian Idol Star
            </Badge>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold">{artist.name}</h1>
            <h2 className="text-xl sm:text-2xl text-muted-foreground">{artist.title}</h2>
            <p className="text-base sm:text-lg leading-relaxed">{artist.description}</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Users className="w-5 h-5 text-amber-500" />
                <span className="text-2xl font-bold">{artist.followers}</span>
              </div>
              <p className="text-sm text-muted-foreground">Followers</p>
            </Card>
            <Card className="p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Star className="w-5 h-5 text-amber-500" />
                <span className="text-2xl font-bold">{artist.rating}</span>
              </div>
              <p className="text-sm text-muted-foreground">Rating</p>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button className="flex-1 sm:flex-none">
              <Music className="w-4 h-4 mr-2" />
              Book Performance
            </Button>
            <Button variant="outline" className="flex-1 sm:flex-none">
              Follow Artist
            </Button>
          </div>
        </div>

        {/* Gallery */}
        <div className="space-y-4">
          <h3 className="text-2xl font-bold">Gallery</h3>
          
          {/* Main Image */}
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
            <img
              src={artist.performances[selectedImage]}
              alt={`${artist.name} Performance ${selectedImage + 1}`}
              className="w-full h-full object-cover"
            />
            <Button
              size="sm"
              className="absolute top-4 right-4 bg-black/50 hover:bg-black/70"
            >
              <Play className="w-4 h-4" />
            </Button>
          </div>

          {/* Thumbnail Grid - Mobile Optimized */}
          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {artist.performances.map((image, index) => (
              <button
                key={index}
                onClick={() => setSelectedImage(index)}
                className={`relative aspect-square overflow-hidden rounded-md transition-all ${
                  selectedImage === index
                    ? "ring-2 ring-primary ring-offset-2"
                    : "hover:opacity-80"
                }`}
              >
                <img
                  src={image}
                  alt={`Performance ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                {selectedImage !== index && (
                  <div className="absolute inset-0 bg-black/20" />
                )}
              </button>
            ))}
          </div>

          {/* Mobile-specific improvements */}
          <div className="block sm:hidden">
            <p className="text-sm text-muted-foreground text-center">
              Tap thumbnails to view different performances
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}