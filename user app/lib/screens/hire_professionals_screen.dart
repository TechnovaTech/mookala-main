import 'package:flutter/material.dart';
import 'dart:convert';
import '../services/api_service.dart';

class HireProfessionalsScreen extends StatefulWidget {
  final String type; // 'photographer' | 'videographer'
  const HireProfessionalsScreen({super.key, required this.type});

  @override
  State<HireProfessionalsScreen> createState() => _HireProfessionalsScreenState();
}

class _HireProfessionalsScreenState extends State<HireProfessionalsScreen> {
  static const navy = Color(0xFF001F3F);
  bool _loading = true;
  List<Map<String, dynamic>> _pros = [];

  String get _title =>
      widget.type == 'videographer' ? 'Hire Videographer' : 'Hire Photographer';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final list = await ApiService.getProfessionals(type: widget.type);
    if (!mounted) return;
    setState(() {
      _pros = list;
      _loading = false;
    });
  }

  ImageProvider? _imageProvider(String image) {
    if (image.isEmpty) return null;
    if (image.startsWith('http')) return NetworkImage(image);
    if (image.startsWith('data:image')) {
      return MemoryImage(base64Decode(image.split(',')[1]));
    }
    return null;
  }

  Future<void> _openHireForm(Map<String, dynamic> pro) async {
    final userPhone = await ApiService.getUserPhone();
    if (!mounted) return;
    if (userPhone == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please log in first')),
      );
      return;
    }

    final nameController = TextEditingController();
    final dateController = TextEditingController();
    final cityController = TextEditingController(text: pro['city']?.toString() ?? '');
    final messageController = TextEditingController();
    bool submitting = false;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Hire ${pro['name']}',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: navy)),
                  const SizedBox(height: 4),
                  Text(widget.type == 'videographer' ? 'Videographer' : 'Photographer',
                      style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                  const SizedBox(height: 16),
                  _field(nameController, 'Your name'),
                  const SizedBox(height: 12),
                  _field(dateController, 'Event date (e.g. 2026-08-15)'),
                  const SizedBox(height: 12),
                  _field(cityController, 'City'),
                  const SizedBox(height: 12),
                  _field(messageController, 'Message / requirements', maxLines: 3),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: submitting
                          ? null
                          : () async {
                              setSheetState(() => submitting = true);
                              final result = await ApiService.createHireRequest(
                                professionalId: pro['_id']?.toString() ?? '',
                                professionalName: pro['name']?.toString() ?? '',
                                type: widget.type,
                                userPhone: userPhone,
                                userName: nameController.text.trim(),
                                eventDate: dateController.text.trim(),
                                city: cityController.text.trim(),
                                message: messageController.text.trim(),
                              );
                              if (!ctx.mounted) return;
                              setSheetState(() => submitting = false);
                              Navigator.pop(ctx);
                              if (!mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(result['success'] == true
                                      ? 'Request sent! The team will contact you.'
                                      : (result['error']?.toString() ?? 'Failed to send request')),
                                  backgroundColor:
                                      result['success'] == true ? Colors.green : Colors.red,
                                ),
                              );
                            },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: navy,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: submitting
                          ? const SizedBox(
                              width: 20, height: 20,
                              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Text('Send Hire Request',
                              style: TextStyle(fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _field(TextEditingController c, String hint, {int maxLines = 1}) {
    return TextField(
      controller: c,
      maxLines: maxLines,
      decoration: InputDecoration(
        hintText: hint,
        filled: true,
        fillColor: Colors.grey.shade100,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide.none,
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: navy,
        foregroundColor: Colors.white,
        title: Text(_title),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _pros.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                          widget.type == 'videographer'
                              ? Icons.videocam_off
                              : Icons.no_photography,
                          size: 56,
                          color: Colors.grey.shade400),
                      const SizedBox(height: 12),
                      Text('No ${widget.type}s available yet',
                          style: TextStyle(color: Colors.grey.shade600, fontSize: 16)),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _pros.length,
                  itemBuilder: (context, index) {
                    final pro = _pros[index];
                    final img = _imageProvider(pro['image']?.toString() ?? '');
                    return Container(
                      margin: const EdgeInsets.only(bottom: 14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: [
                          BoxShadow(
                              color: Colors.grey.withOpacity(0.15),
                              blurRadius: 8,
                              offset: const Offset(0, 4)),
                        ],
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            CircleAvatar(
                              radius: 34,
                              backgroundColor: navy.withOpacity(0.1),
                              backgroundImage: img,
                              child: img == null
                                  ? const Icon(Icons.person, color: navy, size: 30)
                                  : null,
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(pro['name']?.toString() ?? 'Professional',
                                      style: const TextStyle(
                                          fontSize: 16, fontWeight: FontWeight.bold, color: navy)),
                                  const SizedBox(height: 2),
                                  if ((pro['city']?.toString() ?? '').isNotEmpty)
                                    Text('📍 ${pro['city']}',
                                        style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                                  if ((pro['experience']?.toString() ?? '').isNotEmpty)
                                    Text('🎯 ${pro['experience']} experience',
                                        style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                                  if ((pro['price']?.toString() ?? '').isNotEmpty)
                                    Text(pro['price'].toString(),
                                        style: const TextStyle(
                                            color: navy, fontSize: 14, fontWeight: FontWeight.w600)),
                                  const SizedBox(height: 8),
                                  SizedBox(
                                    height: 34,
                                    child: ElevatedButton(
                                      onPressed: () => _openHireForm(pro),
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: navy,
                                        foregroundColor: Colors.white,
                                        shape: RoundedRectangleBorder(
                                            borderRadius: BorderRadius.circular(8)),
                                      ),
                                      child: const Text('Hire Now', style: TextStyle(fontSize: 13)),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
    );
  }
}
