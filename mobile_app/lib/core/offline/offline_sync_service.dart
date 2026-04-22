import '../network/api_client.dart';
import 'offline_queue_service.dart';

class OfflineSyncService {
  static bool _isSyncing = false;

  static Future<void> syncNow() async {
    if (_isSyncing) return;
    _isSyncing = true;
    try {
      await OfflineQueueService.reviveFailedForRetry();
      final pending = await OfflineQueueService.listPending();
      for (final item in pending) {
        final result = await ApiClient.sendQueuedOperation(item);
        if (result.ok) {
          await OfflineQueueService.markSent(item.id);
          continue;
        }
        if (result.isHardError) {
          await OfflineQueueService.markFailed(item.id, result.errorMessage ?? 'hard_error');
          continue;
        }
        await OfflineQueueService.incrementRetry(item.id);
      }
    } finally {
      _isSyncing = false;
    }
  }
}
