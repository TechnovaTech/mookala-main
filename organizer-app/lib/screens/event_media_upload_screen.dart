import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'dart:io';
import 'add_tickets_screen.dart';

class EventMediaUploadScreen extends StatefulWidget {
  const EventMediaUploadScreen({super.key});

  @override
  State<EventMediaUploadScreen> createState() => _EventMediaUploadScreenState();
}

class _EventMediaUploadScreenState extends State<EventMediaUploadScreen> {
  File? _bannerImage;
  final TextEditingController _videoController = TextEditingController();
  List<File> _uploadedImages = [];
  List<File> _uploadedVideos = [];

  void _selectBanner() {
    showModalBottomSheet(
      context: context,
      builder: (context) => Container(
        height: 200,
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            const Text(
              'Select Banner Image',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 20),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Continue with Gallery'),
              onTap: () async {
                Navigator.pop(context);
                try {
                  FilePickerResult? result = await FilePicker.platform.pickFiles(
                    type: FileType.image,
                    allowMultiple: false,
                  );

                  if (result != null && result.files.single.path != null) {
                    setState(() {
                      _bannerImage = File(result.files.single.path!);
                    });
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Banner image selected successfully!')),
                    );
                  }
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Error selecting image. Please try again.')),
                  );
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('Take Photo'),
              onTap: () {
                Navigator.pop(context);
                setState(() {
                  _bannerImage = File('camera_banner.jpg');
                });
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Photo taken successfully!')),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  void _uploadImage() {
    if (_uploadedImages.length >= 10) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Maximum 10 images allowed')),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      builder: (context) => Container(
        height: 200,
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            const Text(
              'Select Images',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 20),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Continue with Gallery'),
              onTap: () async {
                Navigator.pop(context);
                try {
                  FilePickerResult? result = await FilePicker.platform.pickFiles(
                    type: FileType.image,
                    allowMultiple: true,
                  );

                  if (result != null) {
                    List<File> selectedFiles = result.paths
                        .where((path) => path != null)
                        .map((path) => File(path!))
                        .toList();

                    int remainingSlots = 10 - _uploadedImages.length;
                    if (selectedFiles.length > remainingSlots) {
                      selectedFiles = selectedFiles.take(remainingSlots).toList();
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Only $remainingSlots more images allowed.')),
                      );
                    }

                    setState(() {
                      _uploadedImages.addAll(selectedFiles);
                    });

                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('${selectedFiles.length} image(s) selected successfully!')),
                    );
                  }
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Error selecting images. Please try again.')),
                  );
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('Take Photo'),
              onTap: () {
                Navigator.pop(context);
                setState(() {
                  _uploadedImages.add(File('camera_image_${_uploadedImages.length + 1}.jpg'));
                });
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Photo taken successfully!')),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  void _uploadVideo() async {
    if (_uploadedVideos.length >= 5) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Maximum 5 videos allowed')),
      );
      return;
    }

    try {
      FilePickerResult? result = await FilePicker.platform.pickFiles(
        type: FileType.video,
        allowMultiple: true,
      );

      if (result != null) {
        List<File> selectedFiles = result.paths
            .where((path) => path != null)
            .map((path) => File(path!))
            .toList();

        // Check if adding these files would exceed the limit
        int remainingSlots = 5 - _uploadedVideos.length;
        if (selectedFiles.length > remainingSlots) {
          selectedFiles = selectedFiles.take(remainingSlots).toList();
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Only $remainingSlots more videos allowed. Selected first $remainingSlots files.')),
          );
        }

        setState(() {
          _uploadedVideos.addAll(selectedFiles);
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${selectedFiles.length} video(s) selected successfully!')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Error selecting videos. Please try again.')),
      );
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
          'Event Media',
          style: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Upload event banner
            const Text(
              'Upload event banner',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'This banner will appear everywhere.',
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 20),
            
            // Banner Upload Area
            GestureDetector(
              onTap: _selectBanner,
              child: Container(
                width: double.infinity,
                height: 200,
                decoration: BoxDecoration(
                  color: Colors.grey.shade50,
                  border: Border.all(color: Colors.grey.shade300),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: _bannerImage != null
                    ? Stack(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: Image.file(
                              _bannerImage!,
                              width: double.infinity,
                              height: 200,
                              fit: BoxFit.cover,
                            ),
                          ),
                          Positioned(
                            top: 8,
                            right: 8,
                            child: GestureDetector(
                              onTap: () {
                                setState(() {
                                  _bannerImage = null;
                                });
                              },
                              child: Container(
                                padding: const EdgeInsets.all(4),
                                decoration: BoxDecoration(
                                  color: Colors.red,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: const Icon(Icons.close, color: Colors.white, size: 16),
                              ),
                            ),
                          ),
                        ],
                      )
                    : Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                            decoration: BoxDecoration(
                              border: Border.all(color: Colors.grey.shade400),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.camera_alt, color: Colors.black54),
                                SizedBox(width: 8),
                                Text(
                                  'Add Banner',
                                  style: TextStyle(
                                    fontSize: 16,
                                    color: Colors.black54,
                                  ),
                                ),
                              ],
                            ),
                          ),

                        ],
                      ),
              ),
            ),
            
            const SizedBox(height: 40),
            
            // Add promotional video
            const Text(
              'Add a promotional video',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Share a YouTube link to showcase your event in action.',
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 20),
            
            // YouTube Link Input
            TextField(
              controller: _videoController,
              decoration: InputDecoration(
                hintText: 'ex. https://youtube.com/yourvideo',
                hintStyle: TextStyle(color: Colors.grey.shade500),
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
            ),
            
            const SizedBox(height: 40),
            
            // Upload media
            const Text(
              'Upload media',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'This media will appear under gallery section.',
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 20),
            
            // Media Upload Area
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.grey.shade50,
                border: Border.all(color: Colors.grey.shade300),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                children: [
                  // Upload buttons
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _uploadedImages.length < 10 ? _uploadImage : null,
                          icon: const Icon(Icons.image),
                          label: const Text('Upload Image'),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            side: BorderSide(color: Colors.grey.shade400),
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _uploadedVideos.length < 5 ? _uploadVideo : null,
                          icon: const Icon(Icons.play_circle_outline),
                          label: const Text('Upload Video'),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            side: BorderSide(color: Colors.grey.shade400),
                          ),
                        ),
                      ),
                    ],
                  ),

                  
                ],
              ),
            ),
            
            // Display uploaded images outside the container
            if (_uploadedImages.isNotEmpty) ...[
              const SizedBox(height: 20),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Selected Images (${_uploadedImages.length}/10)',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 120,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  itemCount: _uploadedImages.length,
                  itemBuilder: (context, index) {
                    File image = _uploadedImages[index];
                    String fileName = image.path.split('\\').last;
                    return Container(
                      width: 100,
                      margin: const EdgeInsets.only(right: 12),
                      child: Column(
                        children: [
                          Expanded(
                            child: Stack(
                              children: [
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: Container(
                                    width: 100,
                                    height: 80,
                                    decoration: BoxDecoration(
                                      color: Colors.grey.shade200,
                                      borderRadius: BorderRadius.circular(8),
                                      border: Border.all(color: Colors.grey.shade300),
                                    ),
                                    child: image.existsSync()
                                        ? Image.file(
                                            image,
                                            width: 100,
                                            height: 80,
                                            fit: BoxFit.cover,
                                          )
                                        : const Column(
                                            mainAxisAlignment: MainAxisAlignment.center,
                                            children: [
                                              Icon(Icons.image, size: 30, color: Colors.grey),
                                              Text('Image', style: TextStyle(fontSize: 10, color: Colors.grey)),
                                            ],
                                          ),
                                  ),
                                ),
                                Positioned(
                                  top: 4,
                                  right: 4,
                                  child: GestureDetector(
                                    onTap: () {
                                      setState(() {
                                        _uploadedImages.removeAt(index);
                                      });
                                    },
                                    child: Container(
                                      padding: const EdgeInsets.all(2),
                                      decoration: BoxDecoration(
                                        color: Colors.red,
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: const Icon(Icons.close, color: Colors.white, size: 12),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            fileName.length > 12 ? '${fileName.substring(0, 12)}...' : fileName,
                            style: const TextStyle(fontSize: 10),
                            textAlign: TextAlign.center,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
            
            // Display uploaded videos
            if (_uploadedVideos.isNotEmpty) ...[
              const SizedBox(height: 20),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Selected Videos (${_uploadedVideos.length}/5)',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _uploadedVideos.asMap().entries.map((entry) {
                  int index = entry.key;
                  File video = entry.value;
                  String fileName = video.path.split('\\').last;
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.green.shade50,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: Colors.green.shade200),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.videocam, size: 16, color: Colors.green),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            fileName.length > 20 ? '${fileName.substring(0, 20)}...' : fileName,
                            style: const TextStyle(fontSize: 12, color: Colors.green),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 4),
                        GestureDetector(
                          onTap: () {
                            setState(() {
                              _uploadedVideos.removeAt(index);
                            });
                          },
                          child: const Icon(Icons.close, size: 16, color: Colors.green),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ],
            
            const SizedBox(height: 40),
            
            // Continue Button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (context) => const AddTicketsScreen()),
                  );
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF001F3F),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: const Text(
                  'Continue',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}