import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'dashboard_screen.dart';
import 'artist_dashboard_screen.dart';
import '../services/auth_service.dart';

class KYCVerificationScreen extends StatefulWidget {
  final String phone;
  final bool isResubmission;
  
  const KYCVerificationScreen({super.key, required this.phone, this.isResubmission = false});

  @override
  State<KYCVerificationScreen> createState() => _KYCVerificationScreenState();
}

class _KYCVerificationScreenState extends State<KYCVerificationScreen> {
  String _status = 'PENDING';
  final TextEditingController _aadhaarIdController = TextEditingController();
  final TextEditingController _panIdController = TextEditingController();
  Uint8List? _aadhaarPhotoFile;
  Uint8List? _panPhotoFile;
  String? _aadhaarImageBase64;
  String? _panImageBase64;
  final ImagePicker _picker = ImagePicker();
  String _rejectionNotes = '';
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    if (widget.isResubmission) {
      _loadExistingKYCData();
    }
  }

  Future<void> _loadExistingKYCData() async {
    final result = await AuthService.getKYCStatus(widget.phone);
    if (result['success'] == true) {
      setState(() {
        _aadhaarIdController.text = result['aadharId'] ?? '';
        _panIdController.text = result['panId'] ?? '';
      });
    }
  }

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
                _pickImage(ImageSource.gallery, fileType);
              },
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('Take Photo'),
              onTap: () {
                Navigator.pop(context);
                _pickImage(ImageSource.camera, fileType);
              },
            ),
          ],
        ),
      ),
    );
  }
  
  Future<void> _pickImage(ImageSource source, String fileType) async {
    try {
      final XFile? image = await _picker.pickImage(
        source: source,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 80,
      );
      
      if (image != null) {
        final bytes = await image.readAsBytes();
        final base64Image = base64Encode(bytes);
        
        if (mounted) {
          setState(() {
            if (fileType == 'aadhaar') {
              _aadhaarPhotoFile = bytes;
              _aadhaarImageBase64 = base64Image;
            } else if (fileType == 'pan') {
              _panPhotoFile = bytes;
              _panImageBase64 = base64Image;
            }
          });
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error picking image: $e')),
        );
      }
    }
  }

  void _submitForReview() async {
    if (_aadhaarIdController.text.isEmpty || _panIdController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please complete all Aadhaar and PAN details')),
      );
      return;
    }

    if (!widget.isResubmission && (_aadhaarPhotoFile == null || _panPhotoFile == null)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please upload both Aadhaar and PAN card photos')),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    final userData = await AuthService.getUserData();
    final role = userData['role'];
    
    final result = widget.isResubmission
        ? await AuthService.resubmitKYC(
            widget.phone,
            _aadhaarIdController.text,
            _panIdController.text,
            _aadhaarImageBase64,
            _panImageBase64,
          )
        : role == 'artist'
            ? await AuthService.updateArtistKYC(
                widget.phone,
                _aadhaarIdController.text,
                _panIdController.text,
                _aadhaarImageBase64,
                _panImageBase64,
              )
            : await AuthService.updateOrganizerKYC(
                widget.phone,
                _aadhaarIdController.text,
                _panIdController.text,
                _aadhaarImageBase64,
                _panImageBase64,
              );

    setState(() {
      _isLoading = false;
    });

    if (result['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(widget.isResubmission 
            ? 'KYC documents resubmitted successfully' 
            : 'KYC documents submitted successfully')),
      );
      
      if (widget.isResubmission) {
        Navigator.pop(context);
      } else {
        final userData = await AuthService.getUserData();
        final role = userData['role'];
        
        if (role == 'artist') {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (context) => const ArtistDashboardScreen()),
          );
        } else {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (context) => const DashboardScreen()),
          );
        }
      }
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result['error'] ?? 'Failed to submit KYC documents')),
      );
    }
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
        title: Text(
          widget.isResubmission ? 'Resubmit KYC Documents' : 'KYC & Business Verification',
          style: const TextStyle(
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
                  hintText: 'Enter Aadhaar Card ID',
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
                          _aadhaarPhotoFile != null ? 'Aadhaar image selected' : (widget.isResubmission ? 'Choose new file (optional)' : 'Choose File'),
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
                'PAN Card ID:',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _panIdController,
                decoration: InputDecoration(
                  hintText: 'Enter PAN Card ID',
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
                'PAN Card Photo:',
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
                          _panPhotoFile != null ? 'PAN image selected' : 'Choose File',
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