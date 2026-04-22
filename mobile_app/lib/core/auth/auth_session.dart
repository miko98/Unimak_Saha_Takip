import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class AuthSession {
  static const _key = 'unimak_auth_session';

  static Future<void> save(Map<String, dynamic> data) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(data));
  }

  static Future<Map<String, dynamic>?> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<String?> accessToken() async {
    final data = await load();
    return data?['access_token']?.toString();
  }

  static Future<String?> refreshToken() async {
    final data = await load();
    return data?['refresh_token']?.toString();
  }

  static Future<void> updateAccessToken(String accessToken) async {
    final data = await load() ?? <String, dynamic>{};
    data['access_token'] = accessToken;
    await save(data);
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}

