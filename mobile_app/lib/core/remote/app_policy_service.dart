import 'dart:convert';

import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../network/api_client.dart';

class AppPolicyResult {
  const AppPolicyResult({
    required this.updateLevel,
    required this.maintenanceMode,
    required this.minSupportedVersion,
    required this.announcement,
  });

  final String updateLevel;
  final bool maintenanceMode;
  final String minSupportedVersion;
  final String announcement;
}

class AppPolicyService {
  static const _cacheKey = 'unimak_app_policy_cache_v1';

  static Future<AppPolicyResult> loadPolicy() async {
    final appInfo = await PackageInfo.fromPlatform();
    final version = appInfo.version;
    try {
      final response = await ApiClient.getRaw('/client/bootstrap?platform=android&app_version=$version');
      if (response.statusCode == 200) {
        final parsed = jsonDecode(response.body) as Map<String, dynamic>;
        await _saveCache(parsed);
        return _toResult(parsed);
      }
    } catch (_) {}

    final cached = await _readCache();
    if (cached != null) {
      return _toResult(cached);
    }
    return const AppPolicyResult(
      updateLevel: 'none',
      maintenanceMode: false,
      minSupportedVersion: '0.0.0',
      announcement: '',
    );
  }

  static Future<void> _saveCache(Map<String, dynamic> payload) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_cacheKey, jsonEncode(payload));
  }

  static Future<Map<String, dynamic>?> _readCache() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_cacheKey);
    if (raw == null || raw.isEmpty) {
      return null;
    }
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static AppPolicyResult _toResult(Map<String, dynamic> payload) {
    final policy = (payload['policy'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{};
    return AppPolicyResult(
      updateLevel: payload['update_level']?.toString() ?? 'none',
      maintenanceMode: policy['maintenance_mode'] == true,
      minSupportedVersion: policy['min_supported_version']?.toString() ?? '0.0.0',
      announcement: policy['announcement']?.toString() ?? '',
    );
  }
}
