import 'package:flutter/material.dart';
import 'dashboard_screen.dart';

class KYCVerificationScreen extends StatefulWidget {
  const KYCVerificationScreen({super.key});

  @override
  State<KYCVerificationScreen> createState() => _KYCVerificationScreenState();
}

class _KYCVerificationScreenState extends State<KYCVerificationScreen> {
  String _status = 'PENDING';
  final TextEditingController _aadhaarIdController = TextEditingController();
  final TextEditingController _panIdController = TextEditingController();
  String? _aadhaarPhotoFile;
  String? _panPhotoFile;
  String _rejectionNotes = '';
  bool _isLoading = false;

  void _selectFile(String fileType) {
    showModalBottomSheet(
      context: context,
      builder: (context) => Container(
        height: 150,
        child: Column(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Choose from Gallery'),
              onTap: () {
                Navigator.pop(context);
                setState(() {
                  if (fileType == 'aadhaar') {
                    _aadhaarPhotoFile = 'aadhaar_photo_gallery.jpg';
                  } else if (fileType == 'pan') {
                    _panPhotoFile = 'pan_photo_gallery.jpg';
                  }
                });
              },
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('Take Photo'),
              onTap: () {
                Navigator.pop(context);
                setState(() {
                  if (fileType == 'aadhaar') {
                    _aadhaarPhotoFile = 'aadhaar_photo_camera.jpg';
                  } else if (fileType == 'pan') {
                    _panPhotoFile = 'pan_photo_camera.jpg';
                  }
                });
              },
            ),
          ],
        ),
      ),
    );
  }

  void _submitForReview() async {
    if (_aadhaarIdController.text.isEmpty || _aadhaarPhotoFile == null || 
        _panIdController.text.isEmpty || _panPhotoFile == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please complete all Aadhaar and PAN details')),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    await Future.delayed(const Duration(seconds: 2));

    setState(() {
      _isLoading = false;
      _status = 'PENDING';
    });

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Documents submitted for review')),
    );
    
    // Navigate to dashboard
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (context) => const DashboardScreen()),
    );
  }

  Color _getStatusColor() {
    switch (_status) {
      case 'APPROVED':
        return Colors.green;
      case 'REJECTED':
        return Colors.red;
      default:
        return Colors.orange;
    }
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
          'KYC & Business Verification',
          style: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Aadhaar Card Details Heading
              const Text(
                'Aadhaar Card Details',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 24),
              
              // Aadhaar Card ID Input
              const Text(
                'Card ID:',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _aadhaarIdController,
                decoration: InputDecoration(
                  hintText: 'Enter  Card ID',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(color: Color(0xFF001F3F)),
                  ),
                  contentPadding: const EdgeInsets.all(16),
                ),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 20),
              
              // Aadhaar Card Photo Upload
              const Text(
                'Card Photo:',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 8),
              GestureDetector(
                onTap: () => _selectFile('aadhaar'),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey.shade300),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.upload_file, color: Color(0xFF001F3F)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          _aadhaarPhotoFile ?? 'Choose File',
                          style: TextStyle(
                            color: _aadhaarPhotoFile != null ? Colors.black : Colors.grey.shade600,
                          ),
                        ),
                      ),
                      if (_aadhaarPhotoFile != null)
                        const Icon(Icons.visibility, color: Color(0xFF001F3F)),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 32),
              
              // PAN Card Details Heading
              const Text(
                'PAN Card Details',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 20),
              
              // PAN Card ID Input
              const Text(
                ' Card ID:',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _panIdController,
                decoration: InputDecoration(
                  hintText: 'Enter  Card ID',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(color: Color(0xFF001F3F)),
                  ),
                  contentPadding: const EdgeInsets.all(16),
                ),
                textCapitalization: TextCapitalization.characters,
              ),
              const SizedBox(height: 20),
              
              // PAN Card Photo Upload
              const Text(
                ' Card Photo:',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 8),
              GestureDetector(
                onTap: () => _selectFile('pan'),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey.shade300),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.upload_file, color: Color(0xFF001F3F)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          _panPhotoFile ?? 'Choose File',
                          style: TextStyle(
                            color: _panPhotoFile != null ? Colors.black : Colors.grey.shade600,
                          ),
                        ),
                      ),
                      if (_panPhotoFile != null)
                        const Icon(Icons.visibility, color: Color(0xFF001F3F)),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 24),

              // Rejection Notes (if rejected)
              if (_status == 'REJECTED') ...[
                const Text(
                  'Notes (if rejected):',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    border: Border.all(color: Colors.red.shade200),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'Your document was unclear. Please resubmit.',
                    style: TextStyle(
                      color: Colors.red,
                      fontSize: 14,
                    ),
                  ),
                ),
                const SizedBox(height: 24),
              ],

              // Submit Button
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _submitForReview,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF001F3F),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: _isLoading
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                          ),
                        )
                      : const Text(
                          'Submit',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}