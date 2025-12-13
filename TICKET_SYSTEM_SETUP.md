# Ticket System Setup Guide

## Overview
This enhanced ticket system includes:
- PDF ticket generation and download
- QR code generation for ticket verification
- Ticket booking management in admin panel
- QR scanner for ticket verification

## Flutter App Setup

### 1. Install Dependencies
Navigate to the user app directory and run:
```bash
cd "user app"
flutter pub get
```

### 2. New Dependencies Added
- `qr_flutter: ^4.1.0` - QR code generation
- `pdf: ^3.10.4` - PDF generation
- `path_provider: ^2.1.1` - File system access
- `open_file: ^3.3.2` - Open downloaded files
- `permission_handler: ^11.0.1` - File permissions

### 3. Android Permissions
Add to `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
```

## Admin Panel Setup

### 1. Install Dependencies
Navigate to the admin panel directory and run:
```bash
cd adminpanel
npm install
```

### 2. New Features Added
- Bookings management page at `/bookings`
- API endpoint for bookings at `/api/bookings`
- Enhanced sidebar navigation

## Features

### User App Features

#### 1. Enhanced My Bookings Screen
- **PDF Download**: Users can download their tickets as PDF files
- **QR Code Display**: Shows QR code with complete booking details
- **Ticket Design**: Professional ticket layout with event details

#### 2. QR Scanner Screen
- **Ticket Verification**: Scan QR codes to verify ticket authenticity
- **Detailed Information**: Shows all booking details when QR is scanned
- **Validation**: Checks ticket status and validity

### Admin Panel Features

#### 1. Bookings Management
- **View All Bookings**: Complete list of all user bookings
- **Search & Filter**: Search by event, user, or booking ID
- **Status Tracking**: Monitor booking statuses (confirmed, attended, cancelled)
- **Booking Details**: View complete booking information

## Usage Instructions

### For Users

#### Downloading Tickets
1. Go to "My Bookings" screen
2. Find your confirmed booking
3. Tap "Download PDF" button
4. Ticket will be saved to device storage
5. Tap "Open" to view the PDF ticket

#### Showing QR Code
1. Go to "My Bookings" screen
2. Find your confirmed booking
3. Tap "Show QR" button
4. Present QR code at venue entrance
5. QR contains all booking verification data

### For Venue Staff

#### Verifying Tickets
1. Open QR Scanner screen in the app
2. Ask customer to show their QR code
3. Copy the QR data from customer's phone
4. Paste into the scanner field
5. Tap "Verify Ticket"
6. Check if ticket shows as "VALID"

### For Admins

#### Managing Bookings
1. Login to admin panel
2. Navigate to "Bookings Management"
3. View all bookings with filters
4. Search by event name, phone, or booking ID
5. Click "View Details" to see complete booking info

## Technical Details

### QR Code Data Structure
```json
{
  "bookingId": "unique_booking_id",
  "eventTitle": "Event Name",
  "eventDate": "2024-12-25",
  "eventTime": "7:00 PM",
  "venue": "Venue Name",
  "totalSeats": 2,
  "totalPrice": 5000,
  "tickets": [...],
  "status": "confirmed"
}
```

### PDF Ticket Layout
- Event header with gradient background
- Event details (date, time, venue)
- Ticket breakdown with seat information
- QR code for verification
- Booking ID and total amount
- Professional styling with company branding

### Database Schema
Bookings are stored with the following structure:
```json
{
  "_id": "ObjectId",
  "userPhone": "phone_number",
  "eventId": "event_id",
  "eventTitle": "Event Name",
  "eventDate": "2024-12-25",
  "eventTime": "7:00 PM",
  "venue": "Venue Name",
  "tickets": [...],
  "totalSeats": 2,
  "totalPrice": 5000,
  "status": "confirmed",
  "bookingDate": "ISO_date",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

## File Structure

### New Files Added

#### Flutter App
- `lib/screens/my_bookings_screen.dart` - Enhanced with PDF and QR features
- `lib/screens/qr_scanner_screen.dart` - New QR verification screen

#### Admin Panel
- `app/bookings/page.tsx` - Bookings management page
- `app/api/bookings/route.ts` - Bookings API endpoint

### Modified Files
- `pubspec.yaml` - Added new dependencies
- `lib/services/api_service.dart` - Enhanced booking methods
- `components/Sidebar.tsx` - Added bookings navigation

## Troubleshooting

### Common Issues

1. **PDF not downloading**: Check storage permissions
2. **QR code not showing**: Ensure booking data is complete
3. **Scanner not working**: Verify QR data format
4. **Bookings not syncing**: Check API connectivity

### Development Notes

- Bookings sync between server and local storage
- PDF files are saved to external storage directory
- QR codes contain complete booking verification data
- Admin panel shows real-time booking statistics