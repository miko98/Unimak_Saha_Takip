import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../core/auth/auth_session.dart';
import '../config/api_config.dart';
import 'main_screen.dart'; // Giriş başarılı olunca geçilecek ekran
import '../theme/app_theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  _LoginScreenState createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _kullaniciAdiController = TextEditingController();
  final TextEditingController _sifreController = TextEditingController();
  String _seciliAlan = 'İç Montaj';

  bool _isLoading = false;
  bool _sifreGizli = true;
  bool _animateIn = false;

  String get _istenenFaz =>
      _seciliAlan == 'Dış Montaj' ? 'Dış Montaj' : 'İç Montaj';

  Future<void> _girisYap() async {
    final kullaniciAdi = _kullaniciAdiController.text.trim();
    String sifre = _sifreController.text.trim();

    if (kullaniciAdi.isEmpty) {
      _hataMesajiGoster('Lütfen kullanıcı adını girin!');
      return;
    }
    if (sifre.isEmpty) {
      _hataMesajiGoster('Lütfen giriş şifresini girin!');
      return;
    }
    if (_seciliAlan != 'İç Montaj' && _seciliAlan != 'Dış Montaj') {
      _hataMesajiGoster('Bu sürümde sadece İç Montaj veya Dış Montaj seçilebilir.');
      return;
    }

    setState(() => _isLoading = true);

    try {
      var url = Uri.parse('$apiBaseUrl/mobil_giris/');
      var request = http.MultipartRequest('POST', url);
      request.fields['kullanici_adi'] = kullaniciAdi;
      request.fields['sifre'] = sifre;
      request.fields['calisma_alani'] = _istenenFaz;

      var response = await request.send();
      var responseData = await response.stream.bytesToString();
      var data = json.decode(responseData);

      if (response.statusCode == 200) {
        final isim = data['isim'] ?? 'Personel';
        final yetki = data['yetki'] ?? 'Saha';
        final calismaAlani = data['calisma_alani'] ?? _istenenFaz;

        await AuthSession.save({
          'access_token': data['access_token'],
          'refresh_token': data['refresh_token'],
          'calisma_alani': calismaAlani,
          'user': {'isim': isim, 'rol': yetki},
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Sisteme Giriş Yapıldı: $isim'),
            backgroundColor: Colors.green,
          ),
        );

        Navigator.pushReplacement(
          context,
          PageRouteBuilder(
            transitionDuration: const Duration(milliseconds: 320),
            pageBuilder: (context, animation, secondaryAnimation) =>
                MainScreen(kullaniciAdi: isim, calismaAlani: calismaAlani, yetki: yetki),
            transitionsBuilder: (context, animation, secondaryAnimation, child) {
              final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
              return FadeTransition(
                opacity: curved,
                child: SlideTransition(
                  position: Tween<Offset>(
                    begin: const Offset(0, 0.04),
                    end: Offset.zero,
                  ).animate(curved),
                  child: child,
                ),
              );
            },
          ),
        );
      } else {
        _hataMesajiGoster(data['hata'] ?? 'Giriş Başarısız!');
      }
    } catch (e) {
      _hataMesajiGoster(
        'Sunucuya bağlanılamadı. Backend\'in çalıştığından emin olun.',
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  void _hataMesajiGoster(String mesaj) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(mesaj, style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.redAccent,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Widget _alanButonu(String alan) {
    final secili = _seciliAlan == alan;
    final renk = alan == 'Dış Montaj' ? Colors.orange : AppTheme.primaryDark;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _seciliAlan = alan),
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: secili ? renk.withValues(alpha: 0.12) : const Color(0xFFF8FAFC),
            border: Border.all(color: secili ? renk : AppTheme.border),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            alan,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: secili ? renk : AppTheme.text,
            ),
          ),
        ),
      ),
    );
  }

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(const Duration(milliseconds: 30), () {
      if (!mounted) return;
      setState(() => _animateIn = true);
    });
  }

  @override
  void dispose() {
    _kullaniciAdiController.dispose();
    _sifreController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 320),
            curve: Curves.easeOut,
            opacity: _animateIn ? 1 : 0,
            child: AnimatedSlide(
              duration: const Duration(milliseconds: 320),
              curve: Curves.easeOutCubic,
              offset: _animateIn ? Offset.zero : const Offset(0, 0.05),
              child: Container(
                constraints: const BoxConstraints(maxWidth: 420),
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: AppTheme.card,
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x1A000000),
                      blurRadius: 24,
                      offset: Offset(0, 10),
                    ),
                  ],
                ),
                child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: AppTheme.secondary,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    alignment: Alignment.center,
                    child: const Text(
                      'U',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 26,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                const Text(
                  'UNIMAK CALISMA MASASI',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                    color: AppTheme.text,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Makine veri yonetimi ve saha takip sistemi',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppTheme.muted, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 18),
                const Text('Çalışma alanı seç', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                Row(children: [_alanButonu('İç Montaj'), const SizedBox(width: 8), _alanButonu('Dış Montaj')]),
                const SizedBox(height: 16),
                const Text('Kullanıcı Adı', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                TextField(
                  controller: _kullaniciAdiController,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(
                    hintText: 'kullanici_adi',
                    prefixIcon: const Icon(Icons.person_outline),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: Colors.grey.shade300),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: Colors.grey.shade300),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const Text('Şifre', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                TextField(
                  controller: _sifreController,
                  obscureText: _sifreGizli,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _girisYap(),
                  decoration: InputDecoration(
                    hintText: '****',
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                      icon: Icon(_sifreGizli ? Icons.visibility_off : Icons.visibility),
                      onPressed: () => setState(() => _sifreGizli = !_sifreGizli),
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: Colors.grey.shade300),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: Colors.grey.shade300),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _isLoading ? null : _girisYap,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryDark,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: _isLoading
                        ? const CircularProgressIndicator(color: Colors.white)
                        : const Text('Sisteme Giris Yap', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
