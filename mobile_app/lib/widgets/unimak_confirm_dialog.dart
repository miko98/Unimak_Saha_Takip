import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

enum UnimakConfirmVariant { danger, warning, info }

Future<bool> showUnimakConfirm(
  BuildContext context, {
  required String title,
  required String message,
  UnimakConfirmVariant variant = UnimakConfirmVariant.warning,
  String confirmLabel = 'Evet, Devam Et',
  String cancelLabel = 'Vazgec',
}) async {
  final palette = switch (variant) {
    UnimakConfirmVariant.danger => const (Color(0xFFEF4444), Color(0xFFFCA5A5)),
    UnimakConfirmVariant.warning => const (Color(0xFFD97706), Color(0xFFFCD34D)),
    UnimakConfirmVariant.info => const (Color(0xFF2563EB), Color(0xFF93C5FD)),
  };
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: palette.$2),
      ),
      titlePadding: EdgeInsets.zero,
      title: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: palette.$1,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: Text(
          title,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14),
        ),
      ),
      content: Text(message, style: const TextStyle(fontWeight: FontWeight.w600, color: AppTheme.text)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(cancelLabel)),
        ElevatedButton(
          style: ElevatedButton.styleFrom(backgroundColor: palette.$1),
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return result == true;
}
