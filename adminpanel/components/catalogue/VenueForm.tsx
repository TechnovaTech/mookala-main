'use client'
import React, { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button, inputClass } from '@/components/ui'
import { Field, MediaUpload } from './shared'

export interface VenueFormValues {
  name: string
  address: string
  city: string
  state: string
  amenities: string[]
  image: string
  seatingLayoutImage: string
}

export const EMPTY_VENUE: VenueFormValues = {
  name: '',
  address: '',
  city: '',
  state: '',
  amenities: [],
  image: '',
  seatingLayoutImage: '',
}

const SUGGESTED = ['Parking', 'Air conditioning', 'Wheelchair access', 'Food court', 'Restrooms', 'Green room', 'Power backup', 'Sound system']

/** Fields of a venue, shared by the "add" and "edit" dialogs. */
export default function VenueForm({
  values,
  onChange,
  onError,
}: {
  values: VenueFormValues
  onChange: (values: VenueFormValues) => void
  onError: (message: string) => void
}) {
  const [amenity, setAmenity] = useState('')
  const set = (patch: Partial<VenueFormValues>) => onChange({ ...values, ...patch })

  const addAmenity = (text: string) => {
    const value = text.trim().slice(0, 60)
    if (!value) return
    if (values.amenities.some((a) => a.toLowerCase() === value.toLowerCase())) return setAmenity('')
    set({ amenities: [...values.amenities, value] })
    setAmenity('')
  }

  const unused = SUGGESTED.filter((s) => !values.amenities.some((a) => a.toLowerCase() === s.toLowerCase()))

  return (
    <div className="space-y-4">
      <Field label="Venue name" htmlFor="venue-name" required help="The apps find a venue by its name, so each name must be unique.">
        <input id="venue-name" type="text" value={values.name} onChange={(e) => set({ name: e.target.value })} className={inputClass} maxLength={200} />
      </Field>
      <Field label="Address" htmlFor="venue-address" required>
        <input id="venue-address" type="text" value={values.address} onChange={(e) => set({ address: e.target.value })} className={inputClass} maxLength={500} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="City" htmlFor="venue-city" required>
          <input id="venue-city" type="text" value={values.city} onChange={(e) => set({ city: e.target.value })} className={inputClass} maxLength={100} />
        </Field>
        <Field label="State" htmlFor="venue-state" required>
          <input id="venue-state" type="text" value={values.state} onChange={(e) => set({ state: e.target.value })} className={inputClass} maxLength={100} />
        </Field>
      </div>

      <div>
        <label htmlFor="venue-amenity" className="block text-sm font-medium text-gray-700 mb-1">
          Amenities
        </label>
        {values.amenities.length > 0 && (
          <ul className="flex flex-wrap gap-2 mb-2">
            {values.amenities.map((item) => (
              <li key={item} className="inline-flex items-center gap-1 bg-gray-100 text-gray-800 text-sm rounded-full pl-3 pr-1 py-1">
                {item}
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  onClick={() => set({ amenities: values.amenities.filter((a) => a !== item) })}
                  className="p-0.5 rounded-full hover:bg-gray-200"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            id="venue-amenity"
            type="text"
            value={amenity}
            onChange={(e) => setAmenity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addAmenity(amenity)
              }
            }}
            placeholder="Type an amenity and press Enter"
            className={inputClass}
            maxLength={60}
          />
          <Button type="button" variant="secondary" onClick={() => addAmenity(amenity)} disabled={!amenity.trim()}>
            <Plus size={16} />
            Add
          </Button>
        </div>
        {unused.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {unused.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => addAmenity(item)}
                className="text-xs px-2.5 py-1 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                + {item}
              </button>
            ))}
          </div>
        )}
      </div>

      <MediaUpload id="venue-image" label="Venue photo" value={values.image} onChange={(image) => set({ image })} onError={onError} />
      <MediaUpload
        id="venue-layout"
        label="Seating layout image"
        value={values.seatingLayoutImage}
        onChange={(seatingLayoutImage) => set({ seatingLayoutImage })}
        onError={onError}
        help="A plan of the hall that customers see when they choose seats. Up to about 1 MB."
      />
    </div>
  )
}

export function venueFormProblem(values: VenueFormValues): string | null {
  if (!values.name.trim()) return 'Enter the venue name.'
  if (!values.address.trim()) return 'Enter the address.'
  if (!values.city.trim()) return 'Enter the city.'
  if (!values.state.trim()) return 'Enter the state.'
  return null
}
