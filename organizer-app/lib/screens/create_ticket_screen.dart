import 'package:flutter/material.dart';

class CreateTicketScreen extends StatefulWidget {
  const CreateTicketScreen({super.key});

  @override
  State<CreateTicketScreen> createState() => _CreateTicketScreenState();
}

class _CreateTicketScreenState extends State<CreateTicketScreen> {
  String _selectedTicketType = 'Paid';
  bool _showMoreOptions = false;
  final TextEditingController _ticketNameController = TextEditingController();
  final TextEditingController _numberOfTicketsController = TextEditingController();
  final TextEditingController _ticketPriceController = TextEditingController();
  final TextEditingController _ticketDescriptionController = TextEditingController();
  final TextEditingController _additionalInstructionController = TextEditingController();
  final TextEditingController _minTicketsController = TextEditingController(text: '0');
  final TextEditingController _maxTicketsController = TextEditingController(text: '20');
  String _selectedCurrency = 'USD (\$)';

  @override
  void initState() {
    super.initState();
    _ticketNameController.addListener(_updateButtonState);
    _numberOfTicketsController.addListener(_updateButtonState);
    _ticketPriceController.addListener(_updateButtonState);
  }

  void _updateButtonState() {
    setState(() {});
  }

  bool get _isFormValid {
    return _ticketNameController.text.isNotEmpty &&
           _numberOfTicketsController.text.isNotEmpty &&
           _ticketPriceController.text.isNotEmpty;
  }

  @override
  void dispose() {
    _ticketNameController.dispose();
    _numberOfTicketsController.dispose();
    _ticketPriceController.dispose();
    _ticketDescriptionController.dispose();
    _additionalInstructionController.dispose();
    _minTicketsController.dispose();
    _maxTicketsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: const Color(0xFF001F3F),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Create new tickets',
          style: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Add or edit tickets',
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey,
              ),
            ),
            const SizedBox(height: 24),
            

            
            // Ticket name
            Row(
              children: [
                const Text(
                  'Ticket name*',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                    color: Colors.black87,
                  ),
                ),
                const Spacer(),
                Text(
                  '${_ticketNameController.text.length}/60',
                  style: const TextStyle(
                    fontSize: 12,
                    color: Colors.grey,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _ticketNameController,
              maxLength: 60,
              decoration: InputDecoration(
                hintText: 'Ex. Early bird, VIP, Gold, Silver etc.',
                hintStyle: const TextStyle(color: Colors.grey),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Colors.grey),
                ),
                counterText: '',
              ),
              onChanged: (value) => setState(() {}),
            ),
            const SizedBox(height: 24),
            
            // Number of tickets
            const Text(
              'Number of ticket(s) on sale*',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w500,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _numberOfTicketsController,
              decoration: InputDecoration(
                hintText: 'Number of ticket(s) on sale',
                hintStyle: const TextStyle(color: Colors.grey),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Colors.grey),
                ),
              ),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 24),
            
            // Ticket price
            const Text(
              'Ticket price*',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w500,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Container(
                  width: 120,
                  height: 50,
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _selectedCurrency,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      items: ['USD (\$)', 'EUR (€)', 'GBP (£)', 'INR (₹)']
                          .map((currency) => DropdownMenuItem(
                                value: currency,
                                child: Text(currency),
                              ))
                          .toList(),
                      onChanged: (value) {
                        setState(() {
                          _selectedCurrency = value!;
                        });
                      },
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _ticketPriceController,
                    decoration: InputDecoration(
                      hintText: '0',
                      hintStyle: const TextStyle(color: Colors.grey),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: const BorderSide(color: Colors.grey),
                      ),
                    ),
                    keyboardType: TextInputType.number,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            
            // Ticket description
            Row(
              children: [
                const Text(
                  'Ticket description',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(width: 4),
                const Icon(Icons.help_outline, size: 16, color: Colors.grey),
                const Spacer(),
                Text(
                  '${_ticketDescriptionController.text.length}/500',
                  style: const TextStyle(
                    fontSize: 12,
                    color: Colors.grey,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _ticketDescriptionController,
              maxLines: 4,
              maxLength: 500,
              decoration: InputDecoration(
                hintText: 'Type your description here',
                hintStyle: const TextStyle(color: Colors.grey),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Colors.grey),
                ),
                counterText: '',
              ),
              onChanged: (value) => setState(() {}),
            ),
            const SizedBox(height: 24),
            
            // More options
            GestureDetector(
              onTap: () {
                setState(() {
                  _showMoreOptions = !_showMoreOptions;
                });
              },
              child: Row(
                children: [
                  const Text(
                    'More options',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: Colors.black87,
                    ),
                  ),
                  const Spacer(),
                  Icon(
                    _showMoreOptions ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                    color: Colors.grey,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Add ticket description to join, specify sales period, mention deliverables etc.',
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey,
              ),
            ),
            
            if (_showMoreOptions) ...[
              const SizedBox(height: 24),
              
              // Additional instruction
              Row(
                children: [
                  const Text(
                    'Additional instruction',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: Colors.black87,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(Icons.help_outline, size: 16, color: Colors.grey),
                  const Spacer(),
                  Text(
                    '${_additionalInstructionController.text.length}/1000',
                    style: const TextStyle(
                      fontSize: 12,
                      color: Colors.grey,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _additionalInstructionController,
                maxLines: 4,
                maxLength: 1000,
                decoration: InputDecoration(
                  hintText: 'Type your instruction here',
                  hintStyle: const TextStyle(color: Colors.grey),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(color: Colors.grey),
                  ),
                  counterText: '',
                ),
                onChanged: (value) => setState(() {}),
              ),
              const SizedBox(height: 24),
              
              // Ticket sales start
              const Text(
                'Ticket sales start',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Colors.black87,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                decoration: InputDecoration(
                  hintText: 'Select date',
                  hintStyle: const TextStyle(color: Colors.grey),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(color: Colors.grey),
                  ),
                  prefixIcon: const Icon(Icons.calendar_today, color: Colors.grey),
                  suffixIcon: const Icon(Icons.keyboard_arrow_down, color: Colors.grey),
                ),
                readOnly: true,
                onTap: () async {
                  final date = await showDatePicker(
                    context: context,
                    initialDate: DateTime.now(),
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                  );
                  if (date != null) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Sales start date: ${date.toString().split(' ')[0]}')),
                    );
                  }
                },
              ),
              const SizedBox(height: 24),
              
              // Ticket sales end
              const Text(
                'Ticket sales end',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Colors.black87,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                decoration: InputDecoration(
                  hintText: 'Select date',
                  hintStyle: const TextStyle(color: Colors.grey),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(color: Colors.grey),
                  ),
                  prefixIcon: const Icon(Icons.calendar_today, color: Colors.grey),
                  suffixIcon: const Icon(Icons.keyboard_arrow_down, color: Colors.grey),
                ),
                readOnly: true,
                onTap: () async {
                  final date = await showDatePicker(
                    context: context,
                    initialDate: DateTime.now(),
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                  );
                  if (date != null) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Sales end date: ${date.toString().split(' ')[0]}')),
                    );
                  }
                },
              ),
              const SizedBox(height: 24),
              
              // Number of tickets allowed per transaction
              const Text(
                'Number of tickets allowed per transaction',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Colors.black87,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _minTicketsController,
                      decoration: InputDecoration(
                        labelText: 'Min',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: const BorderSide(color: Colors.grey),
                        ),
                      ),
                      keyboardType: TextInputType.number,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: TextField(
                      controller: _maxTicketsController,
                      decoration: InputDecoration(
                        labelText: 'Max',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: const BorderSide(color: Colors.grey),
                        ),
                      ),
                      keyboardType: TextInputType.number,
                    ),
                  ),
                ],
              ),
            ],
            
            const SizedBox(height: 40),
            
            // Action buttons
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      Navigator.pop(context);
                    },
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      side: const BorderSide(color: Colors.grey),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    child: const Text(
                      'Reset',
                      style: TextStyle(
                        fontSize: 16,
                        color: Colors.black87,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _isFormValid ? () {
                      final ticketData = {
                        'name': _ticketNameController.text,
                        'quantity': _numberOfTicketsController.text,
                        'price': _ticketPriceController.text,
                        'currency': _selectedCurrency,
                        'description': _ticketDescriptionController.text,
                      };
                      
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Ticket created successfully!')),
                      );
                      Navigator.pop(context, ticketData);
                    } : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _isFormValid ? const Color(0xFF001F3F) : Colors.grey,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    child: const Text(
                      'Save',
                      style: TextStyle(
                        fontSize: 16,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTicketTypeButton(String type) {
    bool isSelected = _selectedTicketType == type;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          setState(() {
            _selectedTicketType = type;
          });
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFF001F3F) : Colors.white,
            border: Border.all(
              color: isSelected ? const Color(0xFF001F3F) : Colors.grey,
            ),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            type,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: isSelected ? Colors.white : Colors.black87,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }
}