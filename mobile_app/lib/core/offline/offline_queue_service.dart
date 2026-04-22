import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class OfflineQueueItem {
  OfflineQueueItem({
    required this.id,
    required this.type,
    required this.path,
    required this.payload,
    required this.createdAt,
    this.filePath,
    this.fileField = 'file',
    this.fileName,
    this.retryCount = 0,
    this.status = 'pending',
    this.lastError,
  });

  final String id;
  final String type;
  final String path;
  final Map<String, String> payload;
  final String createdAt;
  final String? filePath;
  final String fileField;
  final String? fileName;
  final int retryCount;
  final String status;
  final String? lastError;

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type,
        'path': path,
        'payload': payload,
        'created_at': createdAt,
        'file_path': filePath,
        'file_field': fileField,
        'file_name': fileName,
        'retry_count': retryCount,
        'status': status,
        'last_error': lastError,
      };

  factory OfflineQueueItem.fromJson(Map<String, dynamic> json) {
    return OfflineQueueItem(
      id: json['id']?.toString() ?? '',
      type: json['type']?.toString() ?? '',
      path: json['path']?.toString() ?? '',
      payload: (json['payload'] as Map? ?? const {})
          .map((key, value) => MapEntry(key.toString(), value?.toString() ?? '')),
      createdAt: json['created_at']?.toString() ?? '',
      filePath: json['file_path']?.toString(),
      fileField: json['file_field']?.toString() ?? 'file',
      fileName: json['file_name']?.toString(),
      retryCount: int.tryParse(json['retry_count']?.toString() ?? '0') ?? 0,
      status: json['status']?.toString() ?? 'pending',
      lastError: json['last_error']?.toString(),
    );
  }

  OfflineQueueItem copyWith({
    int? retryCount,
    String? status,
    String? lastError,
  }) {
    return OfflineQueueItem(
      id: id,
      type: type,
      path: path,
      payload: payload,
      createdAt: createdAt,
      filePath: filePath,
      fileField: fileField,
      fileName: fileName,
      retryCount: retryCount ?? this.retryCount,
      status: status ?? this.status,
      lastError: lastError ?? this.lastError,
    );
  }
}

class OfflineQueueService {
  static const _queueKey = 'unimak_offline_queue_v1';

  static Future<List<OfflineQueueItem>> _readAll() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_queueKey);
    if (raw == null || raw.isEmpty) {
      return <OfflineQueueItem>[];
    }
    try {
      final decoded = jsonDecode(raw) as List<dynamic>;
      return decoded
          .whereType<Map>()
          .map((e) => OfflineQueueItem.fromJson(e.cast<String, dynamic>()))
          .toList();
    } catch (_) {
      return <OfflineQueueItem>[];
    }
  }

  static Future<void> _writeAll(List<OfflineQueueItem> items) async {
    final prefs = await SharedPreferences.getInstance();
    final encoded = jsonEncode(items.map((e) => e.toJson()).toList());
    await prefs.setString(_queueKey, encoded);
  }

  static Future<void> enqueue(OfflineQueueItem item) async {
    final items = await _readAll();
    items.add(item);
    await _writeAll(items);
  }

  static Future<List<OfflineQueueItem>> listPending() async {
    final items = await _readAll();
    items.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return items.where((e) => e.status == 'pending').toList();
  }

  static Future<void> markSent(String id) async {
    final items = await _readAll();
    final next = items
        .where((e) => e.id != id)
        .toList(); // sent kayıtları kuyruktan temizliyoruz.
    await _writeAll(next);
  }

  static Future<void> markFailed(String id, String reason) async {
    final items = await _readAll();
    final next = items
        .map((e) => e.id == id ? e.copyWith(status: 'failed', lastError: reason) : e)
        .toList();
    await _writeAll(next);
  }

  static Future<void> incrementRetry(String id) async {
    final items = await _readAll();
    final next = items
        .map((e) => e.id == id ? e.copyWith(retryCount: e.retryCount + 1) : e)
        .toList();
    await _writeAll(next);
  }

  static Future<void> reviveFailedForRetry() async {
    final items = await _readAll();
    final next = items
        .map((e) => e.status == 'failed' ? e.copyWith(status: 'pending') : e)
        .toList();
    await _writeAll(next);
  }
}
