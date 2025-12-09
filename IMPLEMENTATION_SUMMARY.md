# Event Management with Category & Language Implementation

## Overview
This implementation adds category and language selection to event creation in the organizer app, with data fetched from the admin panel's database.

## Admin Panel - Category Management

### Location: `/adminpanel/app/categories/page.tsx`

**Features:**
- Admin can create, edit, and delete categories
- Each category has:
  - Name (e.g., "Music Concert", "Theatre", "Dance")
  - Type (e.g., "Event", "Genre")
  - Sub-categories (optional)
- Categories are stored in MongoDB `categories` collection

**API Endpoint:** `GET /api/categories`
- Returns all categories from database
- Used by organizer app to populate dropdown

## Languages API

### Location: `/adminpanel/app/api/languages/route.ts`

**Features:**
- Returns list of 23 Indian languages
- Languages include: Hindi, Bengali, Telugu, Tamil, Marathi, Urdu, Gujarati, Kannada, Malayalam, Punjabi, and more

**API Endpoint:** `GET /api/languages`
- Returns: `{ success: true, languages: [...] }`

## Organizer App - Event Creation

### Location: `/organizer-app/lib/screens/event_management_screen.dart`

**New Fields Added:**
1. **Category Dropdown**
   - Fetches categories from admin panel database
   - Required field with validation
   - Shows only categories added by admin

2. **Language Dropdown**
   - Fetches all Indian languages from API
   - Required field with validation
   - Displays 23 Indian languages

### API Service Methods

**File:** `/organizer-app/lib/services/api_service.dart`

```dart
// Fetch categories from database
static Future<Map<String, dynamic>> getCategories()

// Fetch Indian languages
static Future<Map<String, dynamic>> getLanguages()

// Create event with category and language
static Future<Map<String, dynamic>> createEvent({
  required String name,
  required String category,
  required String language,
  required String venue,
  required String date,
  required String time,
  ...
})
```

## Database Schema

### Events Collection
```javascript
{
  name: String,
  category: String,        // NEW: Selected category name
  language: String,        // NEW: Selected language
  venue: String,
  date: String,
  time: String,
  description: String,
  artists: Array,
  committeeMembers: Array,
  organizerId: ObjectId,
  status: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Categories Collection
```javascript
{
  _id: ObjectId,
  name: String,
  type: String,
  subCategories: [
    { name: String }
  ],
  createdAt: Date
}
```

## Data Flow

1. **Admin Panel:**
   - Admin creates categories → Saved to MongoDB `categories` collection

2. **Organizer App:**
   - Opens event creation screen
   - Fetches categories from `/api/categories`
   - Fetches languages from `/api/languages`
   - Displays dropdowns with fetched data
   - User selects category and language
   - Validates both fields are selected
   - Submits event with category and language
   - Data saved to MongoDB `events` collection

## Implementation Steps Completed

✅ Created `/api/languages` endpoint with 23 Indian languages
✅ Added `getCategories()` method in API service
✅ Added `getLanguages()` method in API service
✅ Added `createEvent()` method to save events
✅ Updated events API to save category and language fields
✅ Category dropdown fetches from database (admin-controlled)
✅ Language dropdown shows all Indian languages
✅ Both fields are required with validation
✅ Event data includes category and language when saved

## Testing

1. **Admin Panel:**
   - Go to http://localhost:3000/categories
   - Add categories (e.g., "Music Concert", "Theatre", "Dance")

2. **Organizer App:**
   - Open event management screen
   - Verify category dropdown shows categories from admin panel
   - Verify language dropdown shows Indian languages
   - Create event with category and language selected
   - Check MongoDB to confirm data is saved

## API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/categories` | GET | Fetch all categories |
| `/api/languages` | GET | Fetch Indian languages |
| `/api/events` | POST | Create event with category & language |
