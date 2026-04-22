import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';

import '../../config/api_config.dart';
import '../auth/auth_session.dart';
import '../offline/offline_queue_service.dart';

class ApiClient {
  static Future<Map<String, String>> _runtimeHeaders() async {
    final info = await PackageInfo.fromPlatform();
    return {
      'x-client-platform': 'android',
      'x-app-version': info.version,
    };
  }

  static Future<Map<String, String>> _headers() async {
    final token = await AuthSession.accessToken();
    final headers = await _runtimeHeaders();
    if (token == null || token.isEmpty) return headers;
    headers['Authorization'] = 'Bearer $token';
    return headers;
  }

  static Future<http.Response> getRaw(String path) async {
    return http.get(
      Uri.parse('$apiBaseUrl$path'),
      headers: await _runtimeHeaders(),
    );
  }

  static Future<http.Response> get(String path) async {
    final response = await http.get(
      Uri.parse('$apiBaseUrl$path'),
      headers: await _headers(),
    );
    if (!_isUnauthorized(response.statusCode)) {
      return response;
    }
    final refreshed = await _refreshAccessToken();
    if (!refreshed) {
      return response;
    }
    return http.get(
      Uri.parse('$apiBaseUrl$path'),
      headers: await _headers(),
    );
  }

  static Future<http.StreamedResponse> multipartPost(
    String path, {
    Map<String, String>? fields,
    List<http.MultipartFile>? files,
  }) async {
    Future<http.StreamedResponse> sendRequest() async {
      final request = http.MultipartRequest(
        'POST',
        Uri.parse('$apiBaseUrl$path'),
      );
      request.headers.addAll(await _headers());
      if (fields != null) {
        request.fields.addAll(fields);
      }
      if (files != null) {
        request.files.addAll(files);
      }
      return request.send();
    }

    final response = await sendRequest();
    if (!_isUnauthorized(response.statusCode)) {
      return response;
    }
    final refreshed = await _refreshAccessToken();
    if (!refreshed || (files != null && files.isNotEmpty)) {
      return response;
    }
    return sendRequest();
  }

  static Future<QueueSubmitResult> postMultipartWithQueue({
    required String type,
    required String path,
    required Map<String, String> fields,
    String? filePath,
    String fileField = 'file',
    String? fileName,
  }) async {
    final opId = fields['op_id']?.trim().isNotEmpty == true ? fields['op_id']!.trim() : _generateOpId();
    final payload = <String, String>{...fields, 'op_id': opId};
    try {
      final response = await _sendMultipart(
        path: path,
        fields: payload,
        filePath: filePath,
        fileField: fileField,
        fileName: fileName,
      );
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return QueueSubmitResult(ok: true, statusCode: response.statusCode, queued: false);
      }
      return QueueSubmitResult(ok: false, statusCode: response.statusCode, queued: false);
    } on SocketException catch (_) {
      await _enqueueOperation(
        type: type,
        path: path,
        payload: payload,
        filePath: filePath,
        fileField: fileField,
        fileName: fileName,
      );
      return QueueSubmitResult(ok: true, queued: true);
    } on TimeoutException catch (_) {
      await _enqueueOperation(
        type: type,
        path: path,
        payload: payload,
        filePath: filePath,
        fileField: fileField,
        fileName: fileName,
      );
      return QueueSubmitResult(ok: true, queued: true);
    } on http.ClientException catch (_) {
      await _enqueueOperation(
        type: type,
        path: path,
        payload: payload,
        filePath: filePath,
        fileField: fileField,
        fileName: fileName,
      );
      return QueueSubmitResult(ok: true, queued: true);
    }
  }

  static Future<QueueSendResult> sendQueuedOperation(OfflineQueueItem item) async {
    try {
      final response = await _sendMultipart(
        path: item.path,
        fields: item.payload,
        filePath: item.filePath,
        fileField: item.fileField,
        fileName: item.fileName,
      );
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return const QueueSendResult(ok: true);
      }
      if (response.statusCode == 400 || response.statusCode == 404 || response.statusCode == 422) {
        return QueueSendResult(ok: false, isHardError: true, errorMessage: 'status_${response.statusCode}');
      }
      return QueueSendResult(ok: false, isHardError: false, errorMessage: 'status_${response.statusCode}');
    } on SocketException catch (_) {
      return const QueueSendResult(ok: false, isHardError: false, errorMessage: 'socket');
    } on TimeoutException catch (_) {
      return const QueueSendResult(ok: false, isHardError: false, errorMessage: 'timeout');
    } on http.ClientException catch (_) {
      return const QueueSendResult(ok: false, isHardError: false, errorMessage: 'client');
    }
  }

  static Future<http.StreamedResponse> _sendMultipart({
    required String path,
    required Map<String, String> fields,
    String? filePath,
    String fileField = 'file',
    String? fileName,
  }) async {
    final request = http.MultipartRequest('POST', Uri.parse('$apiBaseUrl$path'));
    request.headers.addAll(await _headers());
    request.fields.addAll(fields);
    if (filePath != null && filePath.trim().isNotEmpty) {
      request.files.add(await http.MultipartFile.fromPath(fileField, filePath, filename: fileName));
    }
    var response = await request.send().timeout(const Duration(seconds: 15));
    if (!_isUnauthorized(response.statusCode)) {
      return response;
    }
    final refreshed = await _refreshAccessToken();
    if (!refreshed) {
      return response;
    }
    final retry = http.MultipartRequest('POST', Uri.parse('$apiBaseUrl$path'));
    retry.headers.addAll(await _headers());
    retry.fields.addAll(fields);
    if (filePath != null && filePath.trim().isNotEmpty) {
      retry.files.add(await http.MultipartFile.fromPath(fileField, filePath, filename: fileName));
    }
    return retry.send().timeout(const Duration(seconds: 15));
  }

  static Future<void> _enqueueOperation({
    required String type,
    required String path,
    required Map<String, String> payload,
    String? filePath,
    required String fileField,
    String? fileName,
  }) async {
    final queueItem = OfflineQueueItem(
      id: payload['op_id'] ?? _generateOpId(),
      type: type,
      path: path,
      payload: payload,
      createdAt: DateTime.now().toIso8601String(),
      filePath: filePath,
      fileField: fileField,
      fileName: fileName,
    );
    await OfflineQueueService.enqueue(queueItem);
  }

  static String _generateOpId() => DateTime.now().microsecondsSinceEpoch.toString();

  static bool _isUnauthorized(int code) => code == 401 || code == 403;

  static Future<bool> _refreshAccessToken() async {
    final refreshToken = await AuthSession.refreshToken();
    if (refreshToken == null || refreshToken.isEmpty) {
      return false;
    }

    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$apiBaseUrl/auth/refresh'),
    );
    request.fields['refresh_token'] = refreshToken;
    final response = await request.send();
    if (response.statusCode != 200) {
      return false;
    }

    final body = await response.stream.bytesToString();
    try {
      final data = body.isEmpty ? <String, dynamic>{} : (jsonDecode(body) as Map<String, dynamic>);
      final newAccessToken = data['access_token']?.toString();
      if (newAccessToken == null || newAccessToken.isEmpty) {
        return false;
      }
      await AuthSession.updateAccessToken(newAccessToken);
      return true;
    } catch (_) {
      return false;
    }
  }
}

class QueueSubmitResult {
  const QueueSubmitResult({
    required this.ok,
    this.statusCode,
    this.queued = false,
  });

  final bool ok;
  final int? statusCode;
  final bool queued;
}

class QueueSendResult {
  const QueueSendResult({
    required this.ok,
    this.isHardError = false,
    this.errorMessage,
  });

  final bool ok;
  final bool isHardError;
  final String? errorMessage;
}

