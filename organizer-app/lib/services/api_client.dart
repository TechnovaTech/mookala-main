import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import 'session.dart';

/// A failed backend call, with a message that is safe to show to the user.
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.body});

  /// HTTP status, or null when the request never got an answer.
  final int? statusCode;
  final String message;

  /// The decoded JSON body when the server sent one.
  final Map<String, dynamic>? body;

  bool get isNetwork => statusCode == null;
  bool get isUnauthorized => statusCode == 401;

  /// Seconds the server asked the client to wait (HTTP 429), if any.
  int? get retryAfterSeconds {
    final value = body?['retryAfterSeconds'];
    if (value is int) return value;
    if (value is num) return value.ceil();
    return null;
  }

  @override
  String toString() => message;
}

/// The one HTTP client of the app: base URL, Bearer token, timeout and
/// uniform errors. Every call returns the decoded JSON or throws [ApiException].
class ApiClient {
  ApiClient._();

  static http.Client _http = http.Client();

  /// Called once when the server answers 401 to a call that carried a token.
  static void Function()? onUnauthorized;

  /// Test hook.
  static void useHttpClient(http.Client client) => _http = client;

  static Uri uri(String path, [Map<String, String?>? query]) {
    final clean = path.startsWith('/') ? path : '/$path';
    final base = Uri.parse('${AppConfig.apiBaseUrl}$clean');
    if (query == null) return base;
    final params = <String, String>{};
    query.forEach((key, value) {
      if (value != null && value.isNotEmpty) params[key] = value;
    });
    return params.isEmpty ? base : base.replace(queryParameters: params);
  }

  static Map<String, String> _headers({bool auth = true, bool hasBody = false}) {
    final headers = <String, String>{'Accept': 'application/json'};
    if (hasBody) headers['Content-Type'] = 'application/json';
    final token = Session.token;
    if (auth && token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  static Future<dynamic> get(String path, {Map<String, String?>? query, bool auth = true, Duration? timeout}) {
    return _send(() => _http.get(uri(path, query), headers: _headers(auth: auth)), auth: auth, timeout: timeout);
  }

  static Future<dynamic> post(String path, Object? body, {bool auth = true, Duration? timeout}) {
    return _send(
      () => _http.post(uri(path), headers: _headers(auth: auth, hasBody: true), body: jsonEncode(body ?? {})),
      auth: auth,
      timeout: timeout,
    );
  }

  static Future<dynamic> patch(String path, Object? body, {bool auth = true, Duration? timeout}) {
    return _send(
      () => _http.patch(uri(path), headers: _headers(auth: auth, hasBody: true), body: jsonEncode(body ?? {})),
      auth: auth,
      timeout: timeout,
    );
  }

  static Future<dynamic> delete(String path, {bool auth = true, Duration? timeout}) {
    return _send(() => _http.delete(uri(path), headers: _headers(auth: auth)), auth: auth, timeout: timeout);
  }

  static Future<dynamic> _send(
    Future<http.Response> Function() request, {
    required bool auth,
    Duration? timeout,
  }) async {
    final hadToken = auth && Session.hasToken;
    http.Response response;
    try {
      response = await request().timeout(timeout ?? AppConfig.requestTimeout);
    } on TimeoutException {
      throw ApiException('The server took too long to answer. Check your connection and try again.');
    } on SocketException {
      throw ApiException('No internet connection. Check your network and try again.');
    } on http.ClientException {
      throw ApiException('Could not reach the server. Check your network and try again.');
    }

    final decoded = decodeBody(response.bodyBytes);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return decoded;
    }

    final map = decoded is Map<String, dynamic> ? decoded : null;
    final error = ApiException(
      errorMessage(response.statusCode, map),
      statusCode: response.statusCode,
      body: map,
    );
    if (response.statusCode == 401 && hadToken) {
      onUnauthorized?.call();
    }
    throw error;
  }

  /// The JSON body, or null when it is empty or not JSON (for example an HTML error page).
  static dynamic decodeBody(List<int> bytes) {
    if (bytes.isEmpty) return null;
    try {
      return jsonDecode(utf8.decode(bytes));
    } catch (_) {
      return null;
    }
  }

  /// The server's own message when it sent one, else a plain description of the status.
  static String errorMessage(int status, Map<String, dynamic>? body) {
    final sent = body?['error'] ?? body?['message'];
    if (sent is String && sent.trim().isNotEmpty) return sent.trim();
    switch (status) {
      case 400:
        return 'The request was not accepted. Please check what you entered.';
      case 401:
        return 'Your session has expired. Please sign in again.';
      case 403:
        return 'You are not allowed to do this.';
      case 404:
        return 'Not found.';
      case 409:
        return 'This change conflicts with the current state. Refresh and try again.';
      case 413:
        return 'The file is too large to upload.';
      case 429:
        return 'Too many attempts. Please wait and try again.';
      case 503:
        return 'This service is not available right now. Please try again later.';
    }
    if (status >= 500) return 'The server had a problem (error $status). Please try again later.';
    return 'Request failed (error $status).';
  }
}
