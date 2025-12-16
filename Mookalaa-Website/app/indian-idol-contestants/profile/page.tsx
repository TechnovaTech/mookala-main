"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Camera, Upload, Save, ArrowLeft, Plus, X, Play, Image as ImageIcon, Video, FileImage, FileVideo } from "lucide-react"
import Link from "next/link"
import { useLanguage } from "@/lib/language-context"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"

export default function IndianIdolContestantProfile() {
  const { t, language } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventId = searchParams.get('eventId') || '48'
  const [formData, setFormData] = useState({
    name: "",
    age: "",
    city: "",
    phone: "",
    email: "",
    experience: "",
    speciality: "",
    bio: "",
    image: null as File | null
  })
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [galleryItems, setGalleryItems] = useState<Array<{id: string, type: 'photo' | 'video', file: File, preview: string}>>([])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFormData(prev => ({ ...prev, image: file }))
      const reader = new FileReader()
      reader.onload = () => setImagePreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'photo' | 'video') => {
    const files = e.target.files
    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader()
        reader.onload = () => {
          const newItem = {
            id: Date.now().toString() + Math.random(),
            type,
            file,
            preview: reader.result as string
          }
          setGalleryItems(prev => [...prev, newItem])
        }
        reader.readAsDataURL(file)
      })
    }
  }

  const removeGalleryItem = (id: string) => {
    setGalleryItems(prev => prev.filter(item => item.id !== id))
  }

  const compressImage = (file: File, maxWidth = 200, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = document.createElement('img')
      
      img.onload = () => {
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height)
        canvas.width = img.width * ratio
        canvas.height = img.height * ratio
        
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      
      img.src = URL.createObjectURL(file)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      // Compress profile image if exists
      let compressedImagePreview = null
      if (formData.image) {
        try {
          compressedImagePreview = await compressImage(formData.image)
        } catch (error) {
          // Fallback to original image preview if compression fails
          compressedImagePreview = imagePreview
        }
      }
      
      // Compress gallery images (limit to first 3 to avoid quota)
      const compressedGallery = []
      for (let i = 0; i < Math.min(galleryItems.length, 3); i++) {
        const item = galleryItems[i]
        if (item.type === 'photo') {
          const compressed = await compressImage(item.file, 150, 0.6)
          compressedGallery.push({
            id: item.id,
            type: item.type,
            preview: compressed
          })
        }
      }
      
      const profileData = {
        name: formData.name,
        age: formData.age,
        city: formData.city,
        phone: formData.phone,
        email: formData.email,
        experience: formData.experience,
        speciality: formData.speciality,
        bio: formData.bio,
        imagePreview: compressedImagePreview || imagePreview,
        galleryItems: compressedGallery,
        savedAt: new Date().toISOString()
      }
      
      localStorage.setItem(`indianIdolProfile_${eventId}`, JSON.stringify(profileData))
      
      // Redirect to the specific event page after saving
      router.push(`/event/${eventId}`)
    } catch (error) {
      console.error('Error saving profile:', error)
      // Still redirect even if save fails
      router.push(`/event/${eventId}`)
    }
  }

  return (
    <main className="min-h-screen bg-background py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              {language === 'hi' ? 'इंडियन आइडल प्रतियोगी प्रोफाइल' : 'Indian Idol Contestant Profile'}
            </h1>
            <p className="text-muted-foreground">
              {language === 'hi' ? 'अपनी जानकारी भरें और अपना प्रोफाइल बनाएं' : 'Fill your information and create your profile'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Single Card Layout */}
          <Card className="p-8">
            <div className="flex flex-col items-center mb-8">
              {/* Round Profile Photo */}
              <div className="relative mb-6">
                <div className="w-32 h-32 bg-muted rounded-full flex items-center justify-center overflow-hidden border-4 border-white shadow-lg">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center">
                      <Camera className="w-8 h-8 mx-auto mb-1 text-gray-400" />
                      <p className="text-xs text-gray-400">
                        {language === 'hi' ? 'फोटो' : 'Photo'}
                      </p>
                    </div>
                  )}
                </div>
                <input
                  id="profile-photo-input"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer rounded-full"
                />
              </div>
              
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                className="text-blue-600 border-blue-600 hover:bg-blue-50"
                onClick={() => document.getElementById('profile-photo-input')?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                {language === 'hi' ? 'फोटो चुनें' : 'Choose Photo'}
              </Button>
            </div>

            {/* Form Fields in Single Card */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-300">
                  {language === 'hi' ? 'पूरा नाम *' : 'Full Name *'}
                </label>
                <Input
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder={language === 'hi' ? 'अपना नाम दर्ज करें' : 'Enter your name'}
                  className="text-white"
                  required
                />
              </div>

              {/* Age */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-300">
                  {language === 'hi' ? 'उम्र *' : 'Age *'}
                </label>
                <Input
                  name="age"
                  type="number"
                  value={formData.age}
                  onChange={handleInputChange}
                  placeholder={language === 'hi' ? 'उम्र दर्ज करें' : 'Enter age'}
                  className="text-white"
                  required
                />
              </div>

              {/* City */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-300">
                  {language === 'hi' ? 'शहर *' : 'City *'}
                </label>
                <Input
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  placeholder={language === 'hi' ? 'अपना शहर दर्ज करें' : 'Enter your city'}
                  className="text-white"
                  required
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-300">
                  {language === 'hi' ? 'फोन नंबर *' : 'Phone Number *'}
                </label>
                <Input
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder={language === 'hi' ? 'फोन नंबर दर्ज करें' : 'Enter phone number'}
                  className="text-white"
                  required
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-300">
                  {language === 'hi' ? 'ईमेल *' : 'Email *'}
                </label>
                <Input
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder={language === 'hi' ? 'ईमेल दर्ज करें' : 'Enter email'}
                  className="text-white"
                  required
                />
              </div>

              {/* Experience */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-300">
                  {language === 'hi' ? 'संगीत अनुभव (वर्षों में)' : 'Music Experience (Years)'}
                </label>
                <Input
                  name="experience"
                  value={formData.experience}
                  onChange={handleInputChange}
                  placeholder={language === 'hi' ? 'जैसे: 5 साल' : 'e.g: 5 years'}
                  className="text-white"
                />
              </div>
            </div>

            {/* Speciality - Full Width */}
            <div className="mt-6">
              <label className="block text-sm font-semibold mb-2 text-gray-300">
                {language === 'hi' ? 'विशेषता/शैली' : 'Speciality/Genre'}
              </label>
              <Input
                name="speciality"
                value={formData.speciality}
                onChange={handleInputChange}
                placeholder={language === 'hi' ? 'जैसे: शास्त्रीय, बॉलीवुड, लोक संगीत' : 'e.g: Classical, Bollywood, Folk'}
                className="text-white"
              />
            </div>

            {/* Bio - Full Width */}
            <div className="mt-6">
              <label className="block text-sm font-semibold mb-2 text-gray-300">
                {language === 'hi' ? 'अपने बारे में बताएं' : 'About Yourself'}
              </label>
              <Textarea
                name="bio"
                value={formData.bio}
                onChange={handleInputChange}
                placeholder={language === 'hi' ? 'अपनी संगीत यात्रा, उपलब्धियां और सपनों के बारे में बताएं...' : 'Tell us about your musical journey, achievements and dreams...'}
                rows={4}
                className="text-white"
              />
            </div>
          </Card>

          {/* Gallery Section */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-6 text-white">
              {language === 'hi' ? 'गैलरी - फोटो और वीडियो' : 'Gallery - Photos & Videos'}
            </h3>
            
            {/* Upload Buttons */}
            <div className="flex gap-4 mb-6">
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleGalleryUpload(e, 'photo')}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button type="button" variant="outline" className="bg-blue-600 text-white border-blue-600 hover:bg-blue-700">
                  <ImageIcon className="w-4 h-4 mr-1" />
                  <Camera className="w-4 h-4 mr-2" />
                  {language === 'hi' ? 'फोटो अपलोड करें' : 'Upload Photos'}
                </Button>
              </div>
              
              <div className="relative">
                <input
                  type="file"
                  accept="video/*"
                  multiple
                  onChange={(e) => handleGalleryUpload(e, 'video')}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button type="button" variant="outline" className="bg-purple-600 text-white border-purple-600 hover:bg-purple-700">
                  <Video className="w-4 h-4 mr-1" />
                  <Play className="w-4 h-4 mr-2" />
                  {language === 'hi' ? 'वीडियो अपलोड करें' : 'Upload Videos'}
                </Button>
              </div>
            </div>

            {/* Gallery Grid */}
            {galleryItems.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {galleryItems.map((item) => (
                  <div key={item.id} className="relative group">
                    <div className="aspect-square bg-muted rounded-lg overflow-hidden">
                      {item.type === 'photo' ? (
                        <img 
                          src={item.preview} 
                          alt="Gallery item" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="relative w-full h-full">
                          <video 
                            src={item.preview} 
                            className="w-full h-full object-cover"
                            muted
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <Play className="w-8 h-8 text-white" />
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeGalleryItem(item.id)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                <Camera className="w-12 h-12 mx-auto mb-4 text-gray-500" />
                <p className="text-gray-600 font-medium">
                  {language === 'hi' ? 'अपनी फोटो और वीडियो अपलोड करें' : 'Upload your photos and videos'}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  {language === 'hi' ? 'अपनी प्रतिभा दिखाने के लिए मीडिया जोड़ें' : 'Add media to showcase your talent'}
                </p>
              </div>
            )}
          </Card>

          {/* Submit Button */}
          <div className="flex justify-center">
            <Button type="submit" size="lg" className="bg-orange-600 hover:bg-orange-700 text-white px-8 font-semibold">
              <Save className="w-4 h-4 mr-2" />
              {language === 'hi' ? 'प्रोफाइल सेव करें' : 'Save Profile'}
            </Button>
          </div>
        </form>
      </div>
    </main>
  )
}