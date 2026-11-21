import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import 'session.dart';

/// A failed backend call, already turned into something a person can read.
class ApiException implements Exception {
  ApiException({
    required this.message,
    this.statusCode,
    this.code,
    this.body = const {},
    this.isNetwork = false,
  });

  /// Text for the customer.
  final String message;

  /// HTTP status, or null when no answer arrived.
  final int? statusCode;

  /// The server's machine-readable `code`, when it sent one.
  final String? code;

  /// The decoded error body (for fields such as `retryAfterSeconds`).
  final Map<String, dynamic> body;

  /// True when the request never got an answer (offline, timeout).
  final bool isNetwork;

  int? get retryAfterSeconds => _asInt(body['retryAfterSeconds']);
  int? get attemptsLeft => _asInt(body['attemptsLeft']);

  static int? _asInt(dynamic v) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    if (v is String) return int.tryParse(v);
    return null;
  }

  @override
  String toString() => message;
}

/// A successful (2xx) answer.
class ApiResponse {
  ApiResponse(this.statusCode, this.data);
  final int statusCode;

  /// Decoded JSON: a Map for almost every route, a List for /categories.
  final dynamic data;

  Map<String, dynamic> get map =>
      data is Map ? Map<String, dynamic>.from(data as Map) : <String, dynamic>{};
}

/// Turns a status code and a decoded body into an [ApiException].
/// Pure, so it is unit tested.
ApiException mapApiError(int statusCode, dynamic decoded) {
  final body = decoded is Map ? Map<String, dynamic>.from(decoded) : <String, dynamic>{};
  final serverText = body['error'] is String && (body['error'] as String).trim().isNotEmpty
      ? (body['error'] as String).trim()
      : (body['message'] is String && (body['message'] as String).trim().isNotEmpty
          ? (body['message'] as String).trim()
          : null);
  final code = body['code'] is String ? body['code'] as String : null;

  String fallback;
  switch (statusCode) {
    case 400:
      fallback = 'The request was not accepted. Please check what you entered.';
      break;
    case 401:
      fallback = 'Your session has expired. Please sign in again.';
      break;
    case 403:
      fallback = 'You are not allowed to do this.';
      break;
    case 404:
      fallback = 'This could not be found.';
      break;
    case 409:
      fallback = 'This could not be completed because something changed. Please try again.';
      break;
    case 413:
      fallback = 'The file is too large. Please choose a smaller one.';
      break;
    case 429:
      fallback = 'Too many attempts. Please wait a little and try again.';
      break;
    case 502:
    case 503:
    case 504:
      fallback = 'The service is not available right now. Please try again in a moment.';
      break;
    default:
      fallback = statusCode >= 500
          ? 'Something went wrong on the server. Please try again.'
          : 'The request failed ($statusCode).';
  }

  return ApiException(
    message: serverText ?? fallback,
    statusCode: statusCode,
    code: code,
    body: body,
  );
}

/// The one HTTP client of the app: base URL, Bearer token, timeout and uniform
/// errors. Nothing else in the app talks to `package:http` for backend calls.
class ApiClient {
  ApiClient._();

  static http.Client _http = http.Client();

  /// Called once when a request made WITH a session token is answered 401.
  /// main.dart points this at "clear the session and show the login screen".
  static Future<void> Function()? onUnauthorized;

  static bool _handlingUnauthorized = false;

  /// For tests.
  static void useHttpClient(http.Client client) => _http = client;

  static Uri _uri(String path, Map<String, String?>? query) {
    final base = AppConfig.apiBaseUrl.endsWith('/')
        ? AppConfig.apiBaseUrl.substring(0, AppConfig.apiBaseUrl.length - 1)
        : AppConfig.apiBaseUrl;
    final uri = Uri.parse('$base${path.startsWith('/') ? path : '/$path'}');
    if (query == null) return uri;
    final clean = <String, String>{};
    query.forEach((k, v) {
      if (v != null && v.isNotEmpty) clean[k] = v;
    });
    return clean.isEmpty ? uri : uri.replace(queryParameters: clean);
  }

  static Map<String, String> _headers(bool hasBody) {
    final headers = <String, String>{'Accept': 'application/json'};
    if (hasBody) headers['Content-Type'] = 'application/json';
    final token = Session.token;
    if (token != null && token.isNotEmpty) headers['Authorization'] = 'Bearer $token';
    return headers;
  }

  static Future<ApiResponse> get(String path, {Map<String, String?>? query, Duration? timeout}) {
    return _send('GET', path, query: query, timeout: timeout);
  }

  static Future<ApiResponse> post(String path, {Map<String, dynamic>? body, Duration? timeout}) {
    return _send('POST', path, body: body ?? const {}, timeout: timeout);
  }

  static Future<ApiResponse> _send(
    String method,
    String path, {
    Map<String, String?>? query,
    Map<String, dynamic>? body,
    Duration? timeout,
  }) async {
    final uri = _uri(path, query);
    final sentToken = (Session.token ?? '').isNotEmpty;
    final http.Response response;

    try {
      final limit = timeout ?? AppConfig.requestTimeout;
      if (method == 'GET') {
        response = await _http.get(uri, headers: _headers(false)).timeout(limit);
      } else {
        response = await _http
            .post(uri, headers: _headers(true), body: jsonEncode(body))
            .timeout(limit);
      }
    } on TimeoutException {
      throw ApiException(
        message: 'The server took too long to answer. Please check your connection and try again.',
        isNetwork: true,
      );
    } on SocketException {
      throw ApiException(
        message: 'No internet connection. Please check your network and try again.',
        isNetwork: true,
      );
    } on http.ClientException {
      throw ApiException(
        message: 'Could not reach the server. Please check your connection and try again.',
        isNetwork: true,
      );
    } on HandshakeException {
      throw ApiException(
        message: 'A secure connection to the server could not be made.',
        isNetwork: true,
      );
    }

    dynamic decoded;
    if (response.bodyBytes.isNotEmpty) {
      try {
        decoded = jsonDecode(utf8.decode(response.bodyBytes));
      } catch (_) {
        decoded = null;
      }
    }

    final status = response.statusCode;
    if (status >= 200 && status < 300) {
      // Every app-facing route answers JSON; `success:false` in a 2xx is still a failure.
      if (decoded is Map && decoded['success'] == false) {
        throw mapApiError(status == 200 ? 400 : status, decoded);
      }
      if (decoded == null) {
        throw ApiException(
          message: 'The server sent an answer the app could not read. Please try again.',
          statusCode: status,
        );
      }
      return ApiResponse(status, decoded);
    }

    final error = mapApiError(status, decoded);
    if (status == 401 && sentToken) await _signOutOnce();
    throw error;
  }

  static Future<void> _signOutOnce() async {
    if (_handlingUnauthorized) return;
    _handlingUnauthorized = true;
    try {
      final handler = onUnauthorized;
      if (handler != null) {
        await handler();
      } else {
        await Session.clear();
      }
    } finally {
      _handlingUnauthorized = false;
    }
  }
}
