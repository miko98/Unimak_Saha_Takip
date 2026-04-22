import 'package:flutter/material.dart';
import 'core/auth/auth_session.dart';
import 'core/offline/offline_sync_service.dart';
import 'core/remote/app_policy_service.dart';
import 'screens/main_screen.dart';
import 'screens/login_screen.dart';
import 'theme/app_theme.dart';

// İŞTE FLUTTER'IN BULAMADIĞI O ANA ŞALTER BURASI:
void main() {
  runApp(const UnimakApp());
}

class UnimakApp extends StatefulWidget {
  const UnimakApp({super.key});

  @override
  State<UnimakApp> createState() => _UnimakAppState();
}

class _UnimakAppState extends State<UnimakApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      OfflineSyncService.syncNow();
    }
  }

  Future<Widget> _initialScreen() async {
    final policy = await AppPolicyService.loadPolicy();
    if (policy.updateLevel == 'force') {
      return ForceUpdateScreen(minVersion: policy.minSupportedVersion);
    }
    final futures = await Future.wait<dynamic>([
      AuthSession.load(),
      Future<void>.delayed(const Duration(milliseconds: 1800)),
    ]);
    final session = futures.first as Map<String, dynamic>?;
    if (session == null) {
      return const LoginScreen();
    }

    final user = session['user'] as Map<String, dynamic>?;
    final isim = user?['isim']?.toString() ?? '';
    final rol = user?['rol']?.toString() ?? 'Saha';
    final alan = session['calisma_alani']?.toString() ?? 'İç Montaj';

    if (isim.isEmpty) {
      return const LoginScreen();
    }
    return MainScreen(
      kullaniciAdi: isim,
      calismaAlani: alan,
      yetki: rol,
      globalNotice: policy.announcement,
      maintenanceMode: policy.maintenanceMode,
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Unimak Montaj Takip',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: FutureBuilder<Widget>(
        future: _initialScreen(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const UnimakSplashScreen();
          }
          return snapshot.data!;
        },
      ),
    );
  }
}

class ForceUpdateScreen extends StatelessWidget {
  const ForceUpdateScreen({super.key, required this.minVersion});

  final String minVersion;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Guncelleme gerekli', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              Text('Bu surum desteklenmiyor. Minimum surum: $minVersion'),
            ],
          ),
        ),
      ),
    );
  }
}

class UnimakSplashScreen extends StatefulWidget {
  const UnimakSplashScreen({super.key});

  @override
  State<UnimakSplashScreen> createState() => _UnimakSplashScreenState();
}

class _UnimakSplashScreenState extends State<UnimakSplashScreen> {
  bool _fadeOut = false;

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(const Duration(milliseconds: 850), () {
      if (!mounted) return;
      setState(() => _fadeOut = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: Center(
        child: AnimatedOpacity(
          opacity: _fadeOut ? 0 : 1,
          duration: const Duration(milliseconds: 700),
          curve: Curves.easeOutCubic,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 10),
                decoration: BoxDecoration(
                  color: AppTheme.primary,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x22000000),
                      blurRadius: 16,
                      offset: Offset(0, 8),
                    ),
                  ],
                ),
                child: const Text(
                  'UNİMAK',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.4,
                  ),
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'ÇALIŞMA MASASI',
                style: TextStyle(
                  color: AppTheme.text,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
