import 'package:flutter/material.dart';
import '../services/auth_service.dart';

class ArtistCalendarScreen extends StatefulWidget {
  const ArtistCalendarScreen({super.key});

  @override
  State<ArtistCalendarScreen> createState() => _ArtistCalendarScreenState();
}

class _ArtistCalendarScreenState extends State<ArtistCalendarScreen> {
  DateTime selectedDate = DateTime.now();
  List<Map<String, dynamic>> _acceptedEvents = [];
  List<Map<String, dynamic>> _selectedDateEvents = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadAcceptedEvents();
  }

  Future<void> _loadAcceptedEvents() async {
    final userData = await AuthService.getUserData();
    final phone = userData['phone'];
    
    if (phone != null) {
      final result = await AuthService.getArtistEvents(phone);
      
      print('Artist events result: $result');
      
      if (result['success'] == true) {
        setState(() {
          _acceptedEvents = List<Map<String, dynamic>>.from(result['events'] ?? []);
          _isLoading = false;
          _updateSelectedDateEvents();
        });
        
        print('Loaded ${_acceptedEvents.length} accepted events');
        for (var event in _acceptedEvents) {
          print('Event: ${event['eventTitle']} on ${event['eventDate']}');
        }
      } else {
        setState(() {
          _isLoading = false;
        });
      }
    } else {
      setState(() {
        _isLoading = false;
      });
    }
  }

  void _updateSelectedDateEvents() {
    final selectedDateStr = '${selectedDate.year}-${selectedDate.month.toString().padLeft(2, '0')}-${selectedDate.day.toString().padLeft(2, '0')}';
    
    setState(() {
      _selectedDateEvents = _acceptedEvents.where((event) {
        return event['eventDate'] == selectedDateStr;
      }).toList();
    });
  }

  bool _isDateBooked(DateTime date) {
    final dateStr = '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    final isBooked = _acceptedEvents.any((event) => event['eventDate'] == dateStr);
    if (isBooked) {
      print('Date $dateStr is booked');
    }
    return isBooked;
  }

  String _getMonthName(int month) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1];
  }

  int _getDaysInMonth(int year, int month) {
    return DateTime(year, month + 1, 0).day;
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Calendar Header
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white,
            boxShadow: [
              BoxShadow(
                color: Colors.grey.withOpacity(0.1),
                spreadRadius: 1,
                blurRadius: 4,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Manage Availability',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Colors.black87,
                      ),
                    ),
                    Text(
                      'Set your busy and available dates',
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
              ),
              ElevatedButton.icon(
                onPressed: () => _showAvailabilityDialog(),
                icon: Icon(Icons.add, size: 16),
                label: Text('Set Status'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Color(0xFF001F3F),
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ),
        ),
        
        // Legend
        Container(
          padding: const EdgeInsets.all(16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _buildLegendItem('Available', Colors.green),
              _buildLegendItem('Booked', Colors.blue),
              _buildLegendItem('Busy', Colors.red),
            ],
          ),
        ),
        
        // Calendar Grid
        Expanded(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: Colors.grey.withOpacity(0.1),
                    spreadRadius: 1,
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                children: [
                  // Month Header
                  Container(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        IconButton(
                          onPressed: () {},
                          icon: Icon(Icons.chevron_left),
                        ),
                        Text(
                          '${_getMonthName(selectedDate.month)} ${selectedDate.year}',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        IconButton(
                          onPressed: () {},
                          icon: Icon(Icons.chevron_right),
                        ),
                      ],
                    ),
                  ),
                  
                  // Days of Week
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                          .map((day) => Expanded(
                                child: Center(
                                  child: Text(
                                    day,
                                    style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      color: Colors.grey.shade600,
                                    ),
                                  ),
                                ),
                              ))
                          .toList(),
                    ),
                  ),
                  
                  // Calendar Days
                  Expanded(
                    child: GridView.builder(
                      padding: const EdgeInsets.all(16),
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 7,
                        childAspectRatio: 1,
                      ),
                      itemCount: _getDaysInMonth(selectedDate.year, selectedDate.month),
                      itemBuilder: (context, index) {
                        final day = index + 1;
                        final date = DateTime(selectedDate.year, selectedDate.month, day);
                        final isBooked = _isDateBooked(date);
                        
                        return GestureDetector(
                          onTap: () {
                            setState(() {
                              selectedDate = date;
                            });
                            _updateSelectedDateEvents();
                          },
                          child: Container(
                            margin: const EdgeInsets.all(2),
                            decoration: BoxDecoration(
                              color: isBooked ? Colors.blue : Colors.transparent,
                              borderRadius: BorderRadius.circular(8),
                              border: selectedDate.day == day
                                  ? Border.all(color: Color(0xFF001F3F), width: 2)
                                  : null,
                            ),
                            child: Center(
                              child: Text(
                                '$day',
                                style: TextStyle(
                                  color: isBooked ? Colors.white : Colors.black87,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        
        // Selected Date Events
        Container(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _selectedDateEvents.isEmpty 
                    ? 'No events on ${selectedDate.day}/${selectedDate.month}/${selectedDate.year}'
                    : 'Events on ${selectedDate.day}/${selectedDate.month}/${selectedDate.year}',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.black87,
                ),
              ),
              const SizedBox(height: 12),
              if (_selectedDateEvents.isEmpty)
                Container(
                  padding: const EdgeInsets.all(20),
                  child: Center(
                    child: Text(
                      'No events scheduled for this date',
                      style: TextStyle(
                        color: Colors.grey.shade600,
                        fontSize: 14,
                      ),
                    ),
                  ),
                )
              else
                ..._selectedDateEvents.map((event) => _buildBookingCard(
                  event['eventTitle'] ?? 'Event',
                  '${event['eventDate']} ${event['eventTime'] ?? ''}',
                  '${event['venue'] ?? ''}, ${event['city'] ?? ''}',
                )).toList(),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildLegendItem(String label, Color color) {
    return Row(
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
        ),
      ],
    );
  }



  Widget _buildBookingCard(String title, String date, String location) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withOpacity(0.1),
            spreadRadius: 1,
            blurRadius: 2,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Color(0xFF001F3F).withOpacity(0.1),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Icon(Icons.event, color: Color(0xFF001F3F), size: 16),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Colors.black87,
                  ),
                ),
                Text(
                  '$date • $location',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showAvailabilityDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Set Availability'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text('Available'),
              leading: Radio(value: 'available', groupValue: '', onChanged: (v) {}),
            ),
            ListTile(
              title: Text('Busy'),
              leading: Radio(value: 'busy', groupValue: '', onChanged: (v) {}),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(context), child: Text('Save')),
        ],
      ),
    );
  }
}