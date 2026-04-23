import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class OfflineReadCacheService {
  static const _prefix = 'unimak_read_cache_v1_';

  static Future<void> saveJson(String key, Object value) async {
    final prefs = await SharedPreferences.getInstance();
    final payload = jsonEncode(value);
    await prefs.setString('$_prefix$key', payload);
  }

  static Future<dynamic> loadJson(String key) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$_prefix$key');
    if (raw == null || raw.isEmpty) return null;
    try {
      return jsonDecode(raw);
    } catch (_) {
      return null;
    }
  }
}
