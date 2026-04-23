import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:http/http.dart' as http;
import 'package:ota_update/ota_update.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

class MobileUpdateInfo {
  const MobileUpdateInfo({
    required this.latestVersion,
    required this.apkUrl,
    required this.releaseTitle,
  });

  final String latestVersion;
  final String apkUrl;
  final String releaseTitle;
}

class MobileUpdateService {
  static const String _owner = 'miko98';
  static const String _repo = 'Unimak_Saha_Takip';
  static const String _tagPrefix = 'mobile-v';
  static const String _lastTriggeredVersionKey = 'mobile_last_auto_update_version_v1';
  static const String _lastAttemptAtKey = 'mobile_last_auto_update_attempt_at_v1';
  static const int _minAttemptGapMinutes = 30;

  static bool _isBusinessHours(DateTime now) {
    final h = now.hour;
    return h >= 8 && h < 19;
  }

  static Future<bool> _isOnWifi() async {
    final results = await Connectivity().checkConnectivity();
    return results.contains(ConnectivityResult.wifi);
  }

  static Future<MobileUpdateInfo?> checkForUpdate() async {
    final info = await PackageInfo.fromPlatform();
    final current = info.version;

    final response = await http.get(
      Uri.parse('https://api.github.com/repos/$_owner/$_repo/releases/latest'),
      headers: const {'Accept': 'application/vnd.github+json'},
    );
    if (response.statusCode != 200) return null;

    final payload = jsonDecode(response.body) as Map<String, dynamic>;
    final tagName = (payload['tag_name'] ?? '').toString();
    if (!tagName.startsWith(_tagPrefix)) return null;

    final latestVersion = tagName.replaceFirst(_tagPrefix, '').trim();
    if (!_isNewerVersion(current, latestVersion)) return null;

    final assets = (payload['assets'] as List?)?.cast<dynamic>() ?? const [];
    String? apkUrl;
    for (final asset in assets) {
      final name = (asset['name'] ?? '').toString().toLowerCase();
      if (name.endsWith('.apk')) {
        apkUrl = (asset['browser_download_url'] ?? '').toString();
        break;
      }
    }
    if (apkUrl == null || apkUrl.isEmpty) return null;

    return MobileUpdateInfo(
      latestVersion: latestVersion,
      apkUrl: apkUrl,
      releaseTitle: (payload['name'] ?? tagName).toString(),
    );
  }

  static Future<void> triggerBackgroundUpdateIfNeeded() async {
    final now = DateTime.now();
    if (!_isBusinessHours(now)) return;
    if (!await _isOnWifi()) return;

    final update = await checkForUpdate();
    if (update == null) return;

    final prefs = await SharedPreferences.getInstance();
    final lastTriggered = prefs.getString(_lastTriggeredVersionKey) ?? '';
    if (lastTriggered == update.latestVersion) return;
    final lastAttemptAtMs = prefs.getInt(_lastAttemptAtKey);
    if (lastAttemptAtMs != null) {
      final diff = now.difference(DateTime.fromMillisecondsSinceEpoch(lastAttemptAtMs));
      if (diff.inMinutes < _minAttemptGapMinutes) return;
    }

    await prefs.setInt(_lastAttemptAtKey, now.millisecondsSinceEpoch);
    try {
      OtaUpdate()
          .execute(
            update.apkUrl,
            destinationFilename: 'unimak-mobile-${update.latestVersion}.apk',
          )
          .listen((_) {}, onError: (_) {});
      await prefs.setString(_lastTriggeredVersionKey, update.latestVersion);
    } catch (_) {
      // Otomatik tetikleme basarisiz olursa acilisi bozma.
    }
  }

  static bool _isNewerVersion(String current, String latest) {
    final currentParts = _versionParts(current);
    final latestParts = _versionParts(latest);
    final maxLen = currentParts.length > latestParts.length ? currentParts.length : latestParts.length;
    for (var i = 0; i < maxLen; i += 1) {
      final a = i < currentParts.length ? currentParts[i] : 0;
      final b = i < latestParts.length ? latestParts[i] : 0;
      if (b > a) return true;
      if (b < a) return false;
    }
    return false;
  }

  static List<int> _versionParts(String version) {
    return version
        .split('.')
        .map((part) => int.tryParse(part.trim()) ?? 0)
        .toList(growable: false);
  }
}
