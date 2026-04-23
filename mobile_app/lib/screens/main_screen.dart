import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/auth/auth_session.dart';
import '../core/network/api_client.dart';
import '../core/offline/offline_read_cache_service.dart';
import '../core/remote/mobile_update_service.dart';
import '../config/api_config.dart';
import '../theme/app_theme.dart';
import '../widgets/unimak_confirm_dialog.dart';

import 'login_screen.dart'; // Çıkış yapabilmek için

class MainScreen extends StatefulWidget {
  final String kullaniciAdi;
  final String yetki;
  final String calismaAlani;
  final String globalNotice;
  final bool maintenanceMode;
  MainScreen({
    required this.kullaniciAdi,
    required this.calismaAlani,
    required this.yetki,
    this.globalNotice = '',
    this.maintenanceMode = false,
  });

  @override
  _MainScreenState createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  // --- SEKME (TAB) KONTROLÜ ---
  int _aktifSekme = 0; // 0: Yeni Log, 1: Eski Log, 2: Kontrol Listesi

  // --- PROJE VERİLERİ ---
  List<dynamic> tumProjeler = [];
  String? _seciliProjeId;
  int _projeSayfa = 1;
  static const int _projeSayfaBasi = 20;
  String _mevcutFaz = "İç Montaj";
  final List<String> _fazlar = ['İç Montaj', 'Dış Montaj'];

  // --- FORM KONTROLLERİ ---
  String? _seciliGrup;
  final List<String> _gruplar = ['Elektrik', 'Mekanik', 'Otomasyon', 'Yazılım'];

  final TextEditingController _islemController = TextEditingController();

  String _seciliDurum = 'Tamamlandı';
  final List<String> _durumlar = [
    'Tamamlandı',
    'Hatalı / Eksik',
    'Devam Ediyor',
  ];

  final TextEditingController _notController = TextEditingController();
  XFile? _seciliLogFotosu;
  bool _isLoading = false;

  // --- KONTROL LİSTESİ VE GALERİ VERİLERİ ---
  List<dynamic> _bekleyenIsler = [];
  List<dynamic> _eskiLoglar = [];
  List<dynamic> _isEmirleri = [];
  bool _checklistLoading = false;
  bool _isEmriLoading = false;
  int? _checklistIslemdeId;
  int? _isEmriIslemdeId;
  static const String _checklistFilterKey = 'mobile_checklist_filter';
  String _checklistFiltre = 'Aksiyon Gerekenler';

  @override
  void initState() {
    super.initState();
    _mevcutFaz = widget.calismaAlani;
    _loadChecklistFilter();
    projeleriGetir();
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkForRemoteUpdate());
  }

  Future<void> _checkForRemoteUpdate() async {
    if (!mounted) return;
    try {
      await MobileUpdateService.triggerBackgroundUpdateIfNeeded();
    } catch (_) {
      // Sessizce geç; update kontrolü kullanıcı akışını bozmasın.
    }
  }

  Future<void> _loadChecklistFilter() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_checklistFilterKey);
    if (!mounted || saved == null || saved.isEmpty) return;
    setState(() => _checklistFiltre = saved);
  }

  Future<void> _setChecklistFilter(String filtre) async {
    setState(() => _checklistFiltre = filtre);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_checklistFilterKey, filtre);
  }

  // 1. TÜM PROJELERİ GETİR (Açılır Liste İçin)
  Future<void> projeleriGetir() async {
    try {
      final response = await ApiClient.get('/projeler/');
      if (response.statusCode == 200) {
        final List<dynamic> loaded = json.decode(response.body);
        await OfflineReadCacheService.saveJson('projeler', loaded);
        final String? firstProjectId = loaded.isNotEmpty
            ? loaded.first['id']?.toString()
            : null;
        setState(() {
          tumProjeler = loaded;
          _seciliProjeId = _seciliProjeId ?? firstProjectId;
        });
        if (_seciliProjeId != null) {
          _kontrolListesiniGetir(_seciliProjeId!);
          _eskiLoglariGetir(_seciliProjeId!);
          _isEmirleriniGetir(_seciliProjeId!);
        }
      }
    } catch (e) {
      final cached = await OfflineReadCacheService.loadJson('projeler');
      if (cached is List && cached.isNotEmpty) {
        final String? firstProjectId = cached.first['id']?.toString();
        if (!mounted) return;
        setState(() {
          tumProjeler = cached;
          _seciliProjeId = _seciliProjeId ?? firstProjectId;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Internet yok. Son kaydedilen projeler gosteriliyor.')),
        );
        if (_seciliProjeId != null) {
          _kontrolListesiniGetir(_seciliProjeId!);
          _eskiLoglariGetir(_seciliProjeId!);
          _isEmirleriniGetir(_seciliProjeId!);
        }
      } else {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Projeler yüklenemedi!')));
      }
    }
  }

  // 2. PROJE SEÇİLDİĞİNDE TETİKLENEN FONKSİYON
  void _projeSecildi(String? projeId) {
    setState(() {
      _seciliProjeId = projeId;
      if (projeId != null) {
        // Diğer sekmeler için verileri önceden çek
        _kontrolListesiniGetir(projeId);
        _eskiLoglariGetir(projeId);
        _isEmirleriniGetir(projeId);
      }
    });
  }

  int get _projeToplamSayfa {
    final total = tumProjeler.length;
    if (total == 0) return 1;
    return (total / _projeSayfaBasi).ceil();
  }

  List<dynamic> get _sayfaliProjeler {
    final start = (_projeSayfa - 1) * _projeSayfaBasi;
    final end = start + _projeSayfaBasi;
    if (start >= tumProjeler.length) return [];
    return tumProjeler.sublist(start, end > tumProjeler.length ? tumProjeler.length : end);
  }

  Widget _buildProjeSecimPaneli() {
    final currentPageProjects = _sayfaliProjeler;
    final seciliBuSayfada = currentPageProjects.any((p) => p['id'].toString() == _seciliProjeId);
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Proje Seçimi', style: TextStyle(fontWeight: FontWeight.w800, color: AppTheme.text)),
              Text('Sayfa $_projeSayfa/$_projeToplamSayfa', style: TextStyle(fontSize: 12, color: AppTheme.muted)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _buildDropdown(
                  deger: seciliBuSayfada ? _seciliProjeId : null,
                  ipucu: "-- Proje Seçiniz --",
                  items: currentPageProjects
                      .map((p) => DropdownMenuItem<String>(
                            value: p['id'].toString(),
                            child: Text('${p['kod']}'),
                          ))
                      .toList(),
                  onChanged: _projeSecildi,
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: _projeSayfa > 1 ? () => setState(() => _projeSayfa -= 1) : null,
                icon: const Icon(Icons.chevron_left),
              ),
              IconButton(
                onPressed: _projeSayfa < _projeToplamSayfa ? () => setState(() => _projeSayfa += 1) : null,
                icon: const Icon(Icons.chevron_right),
              ),
              Container(
                decoration: BoxDecoration(
                  color: AppTheme.primaryDark,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: IconButton(
                  icon: const Icon(Icons.qr_code_scanner, color: Colors.white),
                  onPressed: _barkodTarayiciAc,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // --- YARDIMCI VERİ ÇEKME FONKSİYONLARI ---
  Future<void> _kontrolListesiniGetir(String projeId) async {
    setState(() => _checklistLoading = true);
    try {
      final res = await ApiClient.get('/checklist/$projeId');
      if (res.statusCode == 200) {
        final loaded = json.decode(res.body);
        await OfflineReadCacheService.saveJson('checklist_$projeId', loaded);
        setState(() => _bekleyenIsler = loaded);
      }
    } catch (e) {
      final cached = await OfflineReadCacheService.loadJson('checklist_$projeId');
      if (cached is List) {
        if (!mounted) return;
        setState(() => _bekleyenIsler = cached);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Internet yok. Son checklist verisi gosteriliyor.')),
        );
      } else {
        _hataGoster('Kontrol listesi alınamadı.');
      }
    } finally {
      if (mounted) {
        setState(() => _checklistLoading = false);
      }
    }
  }

  Future<void> _checklistDurumGuncelle(int itemId, String durum, {String maddeMetni = ''}) async {
    final isHata = durum == 'Hatalı';
    final confirmed = await showUnimakConfirm(
      context,
      title: isHata ? 'UNIMAK HATA ONAYI' : 'UNIMAK ISLEM ONAYI',
      message: '"${maddeMetni.isEmpty ? 'Checklist maddesi' : maddeMetni}" kaydini "$durum" olarak guncellemek istiyor musunuz?',
      variant: isHata ? UnimakConfirmVariant.danger : UnimakConfirmVariant.warning,
      confirmLabel: isHata ? 'Evet, Hatali Isaretle' : 'Evet, Guncelle',
    );
    if (!confirmed) return;

    setState(() => _checklistIslemdeId = itemId);
    try {
      final response = await ApiClient.postMultipartWithQueue(
        type: 'checklist_update',
        path: '/checklist/guncelle/',
        fields: {
          'item_id': itemId.toString(),
          'durum': durum,
          'personel': widget.kullaniciAdi,
        },
      );
      if (response.ok) {
        if (response.queued) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Internet yok, senkron kuyruguna alindi.')),
          );
        }
        if (_seciliProjeId != null) {
          await _kontrolListesiniGetir(_seciliProjeId!);
        }
      } else {
        _hataGoster('Kontrol durumu güncellenemedi.');
      }
    } catch (e) {
      _hataGoster('Bağlantı hatası: Kontrol güncellenemedi.');
    } finally {
      if (mounted) {
        setState(() => _checklistIslemdeId = null);
      }
    }
  }

  int? _parseChecklistItemId(dynamic rawId) {
    if (rawId is int) return rawId;
    return int.tryParse(rawId?.toString() ?? '');
  }

  Future<void> _eskiLoglariGetir(String projeId) async {
    try {
      final res = await ApiClient.get('/galeri/$projeId');
      if (res.statusCode == 200) {
        final loaded = json.decode(res.body);
        await OfflineReadCacheService.saveJson('galeri_$projeId', loaded);
        setState(() => _eskiLoglar = loaded);
      }
    } catch (e) {
      final cached = await OfflineReadCacheService.loadJson('galeri_$projeId');
      if (cached is List && mounted) {
        setState(() => _eskiLoglar = cached);
      }
    }
  }

  Future<void> _isEmirleriniGetir(String projeId) async {
    setState(() => _isEmriLoading = true);
    try {
      final res = await ApiClient.get('/is_emirleri/');
      if (res.statusCode == 200) {
        final List<dynamic> tumKayitlar = json.decode(res.body);
        final int? projeNo = int.tryParse(projeId);
        final filtreli = tumKayitlar.where((item) {
          final pid = item['project_id'];
          if (projeNo == null) return false;
          return pid == projeNo || pid?.toString() == projeId;
        }).toList();
        await OfflineReadCacheService.saveJson('isemri_$projeId', filtreli);
        setState(() => _isEmirleri = filtreli);
      }
    } catch (_) {
      final cached = await OfflineReadCacheService.loadJson('isemri_$projeId');
      if (cached is List) {
        if (!mounted) return;
        setState(() => _isEmirleri = cached);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Internet yok. Son is emri verileri gosteriliyor.')),
        );
      } else {
        _hataGoster('İş emirleri alınamadı.');
      }
    } finally {
      if (mounted) {
        setState(() => _isEmriLoading = false);
      }
    }
  }

  Future<void> _isEmriDurumGuncelle(dynamic isEmriId, String durum) async {
    final id = int.tryParse(isEmriId?.toString() ?? '');
    if (id == null) return;
    final confirmed = await showUnimakConfirm(
      context,
      title: 'UNIMAK ISLEM ONAYI',
      message: 'Is emrini "$durum" durumuna guncellemek istiyor musunuz?',
      variant: UnimakConfirmVariant.warning,
      confirmLabel: 'Evet, Guncelle',
    );
    if (!confirmed) return;
    setState(() => _isEmriIslemdeId = id);
    try {
      final res = await ApiClient.postMultipartWithQueue(
        type: 'workorder_status',
        path: '/is_emri_durum_guncelle/',
        fields: {
          'is_emri_id': id.toString(),
          'status': durum,
          'personel_adi': widget.kullaniciAdi,
          'notlar': '-',
          'mevcut_faz': _mevcutFaz,
        },
      );
      if (res.ok) {
        if (res.queued) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Internet yok, senkron kuyruguna alindi.')),
          );
        }
        if (_seciliProjeId != null) {
          _isEmirleriniGetir(_seciliProjeId!);
        }
      }
    } catch (_) {
      _hataGoster('İş emri güncelleme hatası.');
    } finally {
      if (mounted) {
        setState(() => _isEmriIslemdeId = null);
      }
    }
  }

  // 3. YENİ SAHA LOGU KAYDETME
  Future<void> _veriyiKaydet() async {
    if (_seciliProjeId == null) {
      _hataGoster('Lütfen önce bir proje seçin!');
      return;
    }
    if (!_fazlar.contains(_mevcutFaz)) {
      _hataGoster('Lütfen işlem yapacağınız fazı seçin!');
      return;
    }
    if (_seciliGrup == null || _islemController.text.isEmpty) {
      _hataGoster('Lütfen grup ve yapılan işlem alanlarını doldurun!');
      return;
    }

    final confirmed = await showUnimakConfirm(
      context,
      title: 'UNIMAK ISLEM ONAYI',
      message: 'Yeni saha logu kaydi olusturulacak. Devam edilsin mi?',
      variant: UnimakConfirmVariant.info,
    );
    if (!confirmed) return;

    setState(() => _isLoading = true);
    try {
      final fields = <String, String>{
        'proje_id': _seciliProjeId!,
        'personel': widget.kullaniciAdi,
        'grup': _seciliGrup!,
        'islem': _islemController.text,
        'durum': _seciliDurum,
        'notlar': _notController.text.isEmpty ? "-" : _notController.text,
        'faz': _mevcutFaz,
      };
      final response = await ApiClient.postMultipartWithQueue(
        type: 'field_log',
        path: '/yeni_saha_logu/',
        fields: fields,
        filePath: _seciliLogFotosu?.path,
        fileName: _seciliLogFotosu?.name,
      );
      if (response.ok) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              response.queued
                  ? 'Internet yok, senkron kuyruguna alindi.'
                  : 'Veri Basariyla Gonderildi!',
            ),
            backgroundColor: Colors.green,
          ),
        );
        setState(() {
          _islemController.clear();
          _notController.clear();
          _seciliLogFotosu = null;
          _eskiLoglariGetir(_seciliProjeId!); // Eski logları güncelle
        });
      }
    } catch (e) {
      _hataGoster('Kayıt başarısız!');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  void _hataGoster(String mesaj) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(mesaj), backgroundColor: Colors.red));

  // --- BARKOD OKUYUCU (Opsiyonel) ---
  void _barkodTarayiciAc() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => Scaffold(
          appBar: AppBar(title: Text('Barkod Okut')),
          body: MobileScanner(
            onDetect: (capture) {
              final barcodes = capture.barcodes;
              for (final barcode in barcodes) {
                if (barcode.rawValue != null) {
                  Navigator.pop(context);
                  _projeSecildi(barcode.rawValue!);
                  break;
                }
              }
            },
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final canWriteOps = widget.yetki != 'Mudur' && !widget.maintenanceMode;
    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            children: [
              if (widget.maintenanceMode && widget.yetki != 'Yonetici')
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEE2E2),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Text('Sistem bakim modunda. Yazma islemleri gecici olarak kapatildi.'),
                ),
              if (widget.globalNotice.isNotEmpty)
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF7ED),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(widget.globalNotice),
                ),
              // 1. ÜST BİLGİ PANELİ (Frontend temasıyla uyumlu)
              Container(
                width: double.infinity,
                margin: EdgeInsets.all(16),
                padding: EdgeInsets.all(20),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.panelDark, AppTheme.panelDarkSoft],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF334155)),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x26000000),
                      blurRadius: 16,
                      offset: Offset(0, 8),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "Unimak Makine Veri Yönetimi",
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        SizedBox(height: 5),
                        Text(
                          "Personel: ${widget.kullaniciAdi}",
                          style: TextStyle(color: const Color(0xFFCBD5E1), fontSize: 14, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0x1FFFFFFF),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: const Color(0xFF475569)),
                      ),
                      child: Text(
                        _mevcutFaz,
                        style: TextStyle(
                          color: _mevcutFaz == 'Dış Montaj'
                              ? const Color(0xFFF97316)
                              : const Color(0xFF93C5FD),
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // 2. SEKME BUTONLARI (Mavi, Gri, Mor)
              Padding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    if (canWriteOps)
                      Expanded(
                        child: _buildSekmeButonu(
                          0,
                          "Saha Logu (Yeni)",
                        AppTheme.primary,
                        ),
                      ),
                    if (canWriteOps) SizedBox(width: 8),
                    Expanded(
                      child: _buildSekmeButonu(
                        1,
                        "Saha Logu (Eski)",
                        AppTheme.muted,
                      ),
                    ),
                    SizedBox(width: 8),
                    Expanded(
                      child: _buildSekmeButonu(
                        2,
                        "✓ Kontrol Listesi",
                        AppTheme.secondary,
                      ),
                    ),
                    SizedBox(width: 8),
                    Expanded(
                      child: _buildSekmeButonu(
                        3,
                        "İşlemler",
                        AppTheme.primaryDark,
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(height: 20),

              _buildProjeSecimPaneli(),
              const SizedBox(height: 16),

              // 3. İÇERİK ALANI (Seçili Sekmeye Göre Değişir)
              Padding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                child: _aktifSekme == 0 && canWriteOps
                    ? _buildYeniLogFormu()
                    : _aktifSekme == 1
                    ? _buildEskiLoglar()
                    : _aktifSekme == 3
                    ? _buildIsEmriPaneli()
                    : _buildKontrolListesi(),
              ),

              // 4. ÇIKIŞ YAP YAZISI
              SizedBox(height: 20),
              TextButton(
                onPressed: () async {
                  final confirmed = await showUnimakConfirm(
                    context,
                    title: 'UNIMAK ISLEM ONAYI',
                    message: 'Sistemden guvenli cikis yapmak istiyor musunuz?',
                    variant: UnimakConfirmVariant.warning,
                    confirmLabel: 'Evet, Cikis Yap',
                  );
                  if (!confirmed) return;
                  await AuthSession.clear();
                  if (!context.mounted) return;
                  Navigator.pushReplacement(
                    context,
                    MaterialPageRoute(builder: (context) => const LoginScreen()),
                  );
                },
                child: Text(
                  "Sistemden Güvenli Çıkış Yap",
                  style: TextStyle(
                    color: AppTheme.danger,
                    decoration: TextDecoration.underline,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              SizedBox(height: 30),
            ],
          ),
        ),
      ),
    );
  }

  // SEKME BUTONU TASARIMI
  Widget _buildSekmeButonu(int index, String baslik, Color renk) {
    bool secili = _aktifSekme == index;
    return GestureDetector(
      onTap: () => setState(() => _aktifSekme = index),
      child: Container(
        padding: EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: secili ? renk : AppTheme.border,
          borderRadius: BorderRadius.circular(8),
        ),
        alignment: Alignment.center,
        child: Text(
          baslik,
          style: TextStyle(
            color: secili ? Colors.white : AppTheme.muted,
            fontWeight: FontWeight.bold,
            fontSize: 13,
          ),
        ),
      ),
    );
  }

  // =========================================================
  // SEKME 1: YENİ LOG FORMU (FOTOĞRAFTAKİ BİREBİR TASARIM)
  // =========================================================
  Widget _buildYeniLogFormu() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _formBaslik("Çalışma Alanı"),
        Container(
          width: double.infinity,
          padding: EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          decoration: BoxDecoration(
            color: _mevcutFaz == 'Dış Montaj' ? Colors.orange[50] : Colors.blue[50],
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: _mevcutFaz == 'Dış Montaj' ? Colors.orange : Colors.blue,
            ),
          ),
          child: Text(
            _mevcutFaz,
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: _mevcutFaz == 'Dış Montaj' ? Colors.orange[900] : Colors.blue[900],
            ),
          ),
        ),
        SizedBox(height: 16),

        // GRUP
        _formBaslik("Grup"),
        _buildDropdown(
          deger: _seciliGrup,
          ipucu: "-- Grup Seçin --",
          items: _gruplar
              .map((g) => DropdownMenuItem<String>(value: g, child: Text(g)))
              .toList(),
          onChanged: (v) => setState(() => _seciliGrup = v),
        ),
        SizedBox(height: 16),

        // YAPILAN İŞLEM
        _formBaslik("Yapılan İşlem"),
        TextField(
          controller: _islemController,
          decoration: InputDecoration(
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: Colors.grey[300]!),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: Colors.grey[300]!),
            ),
            contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          ),
        ),
        SizedBox(height: 16),

        // DURUM
        _formBaslik("Durum"),
        _buildDropdown(
          deger: _seciliDurum,
          ipucu: "",
          items: _durumlar
              .map((d) => DropdownMenuItem<String>(value: d, child: Text(d)))
              .toList(),
          onChanged: (v) => setState(() => _seciliDurum = v!),
        ),
        SizedBox(height: 16),

        // RESİMLER (KESİK ÇİZGİLİ ALAN)
        _formBaslik("Resimler (Çoklu Seçim / Kamera)"),
        GestureDetector(
          onTap: () async {
            final XFile? foto = await ImagePicker().pickImage(
              source: ImageSource.camera,
            );
            if (foto != null) setState(() => _seciliLogFotosu = foto);
          },
          child: Container(
            width: double.infinity,
            padding: EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.blueGrey[50],
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: Colors.grey[400]!,
                width: 2,
                style: BorderStyle.solid,
              ),
            ),
            child: Column(
              children: [
                Icon(
                  _seciliLogFotosu == null
                      ? Icons.camera_alt
                      : Icons.check_circle,
                  color: _seciliLogFotosu == null
                      ? Colors.grey[500]
                      : Colors.green,
                  size: 30,
                ),
                SizedBox(height: 8),
                Text(
                  _seciliLogFotosu == null
                      ? "Yeni Resim Çek veya Seç"
                      : "Resim Eklendi: ${_seciliLogFotosu!.name}",
                  style: TextStyle(color: Colors.grey[600]),
                ),
              ],
            ),
          ),
        ),
        SizedBox(height: 16),

        // NOTLAR
        _formBaslik("Notlar"),
        TextField(
          controller: _notController,
          maxLines: 4,
          decoration: InputDecoration(
            hintText: "Varsa detaylar...",
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: Colors.grey[300]!),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: Colors.grey[300]!),
            ),
          ),
        ),
        SizedBox(height: 20),

        // YEŞİL KAYDET BUTONU
        SizedBox(
          width: double.infinity,
          height: 55,
          child: ElevatedButton(
            onPressed: _isLoading ? null : _veriyiKaydet,
            style: ElevatedButton.styleFrom(
              backgroundColor: Color(0xFF28A745),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: _isLoading
                ? CircularProgressIndicator(color: Colors.white)
                : Text(
                    "VERİYİ KAYDET VE GÖNDER",
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
          ),
        ),
      ],
    );
  }

  // =========================================================
  // SEKME 2 & 3: YARDIMCI EKRANLAR
  // =========================================================
  Widget _buildKontrolListesi() {
    if (_seciliProjeId == null)
      return Padding(
        padding: EdgeInsets.all(40),
        child: Text(
          "Lütfen yukarıdan bir proje seçin.",
          style: TextStyle(color: Colors.grey),
        ),
      );
    if (_checklistLoading) {
      return const Padding(
        padding: EdgeInsets.all(40),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_bekleyenIsler.isEmpty)
      return Padding(
        padding: EdgeInsets.all(40),
        child: Text("Bu projede kontrol maddesi yok."),
      );

    final tamamlanan = _bekleyenIsler.where((i) => i['durum'] == 'Tamamlandı').length;
    final hatali = _bekleyenIsler.where((i) => i['durum'] == 'Hatalı').length;
    final eksik = _bekleyenIsler.where((i) => i['durum'] == 'Eksik').length;
    final beklemede = _bekleyenIsler.where((i) => i['durum'] == 'Beklemede').length;
    final total = _bekleyenIsler.length;

    final List<dynamic> filtreliIsler = _bekleyenIsler.where((item) {
      final durum = (item['durum'] ?? 'Beklemede').toString();
      if (_checklistFiltre == 'Aksiyon Gerekenler') {
        return durum == 'Beklemede' || durum == 'Hatalı' || durum == 'Eksik';
      }
      if (_checklistFiltre == 'Tümü') return true;
      return durum == _checklistFiltre;
    }).toList();

    return Column(
      children: [
        Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppTheme.border),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Toplam: $total', style: const TextStyle(fontWeight: FontWeight.w700)),
              Text('Tamam: $tamamlanan', style: const TextStyle(color: AppTheme.success, fontWeight: FontWeight.w700)),
              Text('Hatalı: $hatali', style: const TextStyle(color: AppTheme.danger, fontWeight: FontWeight.w700)),
              Text('Eksik: $eksik', style: const TextStyle(color: AppTheme.secondary, fontWeight: FontWeight.w700)),
              Text('Bekle: $beklemede', style: const TextStyle(color: AppTheme.muted, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
        Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppTheme.border),
          ),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _checklistFiltreButonu('Aksiyon Gerekenler'),
                _checklistFiltreButonu('Beklemede'),
                _checklistFiltreButonu('Hatalı'),
                _checklistFiltreButonu('Eksik'),
                _checklistFiltreButonu('Tamamlandı'),
                _checklistFiltreButonu('Tümü'),
              ],
            ),
          ),
        ),
        if (filtreliIsler.isEmpty)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Text('Bu filtrede kayıt yok.'),
          ),
        ListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: filtreliIsler.length,
          itemBuilder: (c, i) {
            final item = filtreliIsler[i];
            final itemId = _parseChecklistItemId(item['id']);
            final durum = (item['durum'] ?? 'Beklemede').toString();
            final guncelleyen = (item['guncelleyen'] ?? '-').toString();
            final islemde = itemId != null && _checklistIslemdeId == itemId;
            return Card(
              elevation: 0,
              margin: const EdgeInsets.only(bottom: 10),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppTheme.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item['madde_metni']?.toString() ?? '',
                      style: const TextStyle(fontWeight: FontWeight.w700, color: AppTheme.text),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Durum: $durum • Güncelleyen: $guncelleyen',
                      style: const TextStyle(fontSize: 12, color: AppTheme.muted),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton(
                            onPressed: itemId == null
                                ? null
                                : islemde
                                ? null
                                : () => _checklistDurumGuncelle(
                                      itemId,
                                      'Tamamlandı',
                                      maddeMetni: item['madde_metni']?.toString() ?? '',
                                    ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: durum == 'Tamamlandı' ? AppTheme.success : Colors.white,
                              foregroundColor: durum == 'Tamamlandı' ? Colors.white : AppTheme.success,
                              side: const BorderSide(color: AppTheme.success),
                              elevation: 0,
                            ),
                            child: islemde
                                ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                                : const Text('TAMAM', style: TextStyle(fontWeight: FontWeight.w700)),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ElevatedButton(
                            onPressed: itemId == null
                                ? null
                                : islemde
                                ? null
                                : () => _checklistDurumGuncelle(
                                      itemId,
                                      'Hatalı',
                                      maddeMetni: item['madde_metni']?.toString() ?? '',
                                    ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: durum == 'Hatalı' ? AppTheme.danger : Colors.white,
                              foregroundColor: durum == 'Hatalı' ? Colors.white : AppTheme.danger,
                              side: const BorderSide(color: AppTheme.danger),
                              elevation: 0,
                            ),
                            child: islemde
                                ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                                : const Text('HATA', style: TextStyle(fontWeight: FontWeight.w700)),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ElevatedButton(
                            onPressed: itemId == null
                                ? null
                                : islemde
                                ? null
                                : () => _checklistDurumGuncelle(
                                      itemId,
                                      'Beklemede',
                                      maddeMetni: item['madde_metni']?.toString() ?? '',
                                    ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: durum == 'Beklemede' ? AppTheme.muted : Colors.white,
                              foregroundColor: durum == 'Beklemede' ? Colors.white : AppTheme.muted,
                              side: const BorderSide(color: AppTheme.muted),
                              elevation: 0,
                            ),
                            child: islemde
                                ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                                : const Text('BEKLE', style: TextStyle(fontWeight: FontWeight.w700)),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ElevatedButton(
                            onPressed: itemId == null
                                ? null
                                : islemde
                                ? null
                                : () => _checklistDurumGuncelle(
                                      itemId,
                                      'Eksik',
                                      maddeMetni: item['madde_metni']?.toString() ?? '',
                                    ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: durum == 'Eksik' ? AppTheme.secondary : Colors.white,
                              foregroundColor: durum == 'Eksik' ? Colors.white : AppTheme.secondary,
                              side: const BorderSide(color: AppTheme.secondary),
                              elevation: 0,
                            ),
                            child: islemde
                                ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                                : const Text('EKSİK', style: TextStyle(fontWeight: FontWeight.w700)),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _checklistFiltreButonu(String filtre) {
    final secili = _checklistFiltre == filtre;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: ChoiceChip(
        label: Text(filtre),
        selected: secili,
        onSelected: (_) => _setChecklistFilter(filtre),
        selectedColor: AppTheme.primary.withValues(alpha: 0.14),
        labelStyle: TextStyle(
          color: secili ? AppTheme.primaryDark : AppTheme.muted,
          fontWeight: FontWeight.w700,
        ),
        side: BorderSide(color: secili ? AppTheme.primary : AppTheme.border),
        backgroundColor: Colors.white,
      ),
    );
  }

  Widget _buildIsEmriPaneli() {
    if (_seciliProjeId == null) {
      return const Padding(
        padding: EdgeInsets.all(40),
        child: Text("Lütfen yukarıdan bir proje seçin."),
      );
    }
    if (_isEmriLoading) {
      return const Padding(
        padding: EdgeInsets.all(40),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_isEmirleri.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(40),
        child: Text("Bu projede iş emri kaydı yok."),
      );
    }

    final gorunenler = _isEmirleri.where((e) {
      final d = (e['durum'] ?? '').toString();
      return d == 'Beklemede' || d == 'Hatalı' || d == 'Eksik' || d == 'Devam Ediyor';
    }).toList();

    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: gorunenler.length,
      itemBuilder: (context, index) {
        final isEmri = gorunenler[index];
        final isEmriId = int.tryParse((isEmri['id'] ?? '').toString());
        final islemde = isEmriId != null && _isEmriIslemdeId == isEmriId;
        final durum = (isEmri['durum'] ?? '-').toString();
        final islem = (isEmri['islem'] ?? '-').toString();
        final montajci = (isEmri['montajci'] ?? '-').toString();
        final tarih = (isEmri['tarih'] ?? '-').toString();
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppTheme.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(islem, style: const TextStyle(fontWeight: FontWeight.w800, color: AppTheme.text)),
              const SizedBox(height: 4),
              Text('Durum: $durum', style: const TextStyle(fontSize: 12, color: AppTheme.muted)),
              Text('Montajcı: $montajci', style: const TextStyle(fontSize: 12, color: AppTheme.muted)),
              Text('Tarih: $tarih', style: const TextStyle(fontSize: 12, color: AppTheme.muted)),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _islemButon(islemde ? '...' : 'Tamam', AppTheme.success, islemde ? null : () => _isEmriDurumGuncelle(isEmri['id'], 'Tamamlandı')),
                  _islemButon(islemde ? '...' : 'Devam', AppTheme.primary, islemde ? null : () => _isEmriDurumGuncelle(isEmri['id'], 'Devam Ediyor')),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _islemButon(String label, Color color, VoidCallback? onPressed) {
    return ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: Colors.white,
        foregroundColor: color,
        side: BorderSide(color: color),
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
      child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
    );
  }

  Widget _buildEskiLoglar() {
    if (_seciliProjeId == null)
      return Padding(
        padding: EdgeInsets.all(40),
        child: Text(
          "Lütfen yukarıdan bir proje seçin.",
          style: TextStyle(color: Colors.grey),
        ),
      );
    final filtreliLoglar = _eskiLoglar.where((log) {
      final faz = _fotoFazi(log);
      return faz == _mevcutFaz;
    }).toList();

    if (filtreliLoglar.isEmpty)
      return Padding(
        padding: EdgeInsets.all(40),
        child: Text("$_mevcutFaz için arşivde fotoğraf yok."),
      );

    return GridView.builder(
      shrinkWrap: true,
      physics: NeverScrollableScrollPhysics(),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
      ),
      itemCount: filtreliLoglar.length,
      itemBuilder: (c, i) {
        final log = filtreliLoglar[i];
        final faz = _fotoFazi(log);
        final yapanKisi = (log['yukleyen'] ?? log['personel'] ?? 'Bilinmiyor').toString();
        final tarih = (log['tarih'] ?? '-').toString();
        final aciklama = (log['islem'] ?? log['notlar'] ?? 'Açıklama yok').toString();
        String path = log['file_path'].toString().replaceAll(
          '\\',
          '/',
        );
        return GestureDetector(
          onTap: () => _eskiLogDetayAc(log),
          child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Stack(
            children: [
              Image.network(
                '$apiBaseUrl/$path',
                fit: BoxFit.cover,
                width: double.infinity,
                height: double.infinity,
                errorBuilder: (c, e, s) => Container(
                  color: Colors.grey[300],
                  child: Icon(Icons.broken_image),
                ),
              ),
              Positioned(
                top: 8,
                left: 8,
                child: Container(
                  padding: EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                  decoration: BoxDecoration(
                    color: faz == 'Dış Montaj' ? Colors.orange : Colors.blue,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    faz,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  color: const Color(0xA6000000),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        aciklama,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '$yapanKisi • $tarih',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xFFE2E8F0),
                          fontSize: 10,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          ),
        );
      },
    );
  }

  void _eskiLogDetayAc(dynamic log) {
    final faz = _fotoFazi(log);
    final yapanKisi = (log['yukleyen'] ?? log['personel'] ?? 'Bilinmiyor').toString();
    final tarih = (log['tarih'] ?? '-').toString();
    final aciklama = (log['islem'] ?? log['notlar'] ?? 'Açıklama yok').toString();
    final grup = (log['grup'] ?? '-').toString();
    final durum = (log['durum'] ?? '-').toString();
    final path = (log['file_path'] ?? '').toString().replaceAll('\\', '/');
    final imageUrl = '$apiBaseUrl/$path';

    showDialog(
      context: context,
      barrierColor: const Color(0xCC000000),
      builder: (ctx) => Dialog(
        insetPadding: const EdgeInsets.all(12),
        backgroundColor: Colors.transparent,
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
                child: SizedBox(
                  height: 320,
                  width: double.infinity,
                  child: InteractiveViewer(
                    minScale: 0.8,
                    maxScale: 4,
                    child: Image.network(
                      imageUrl,
                      fit: BoxFit.contain,
                      errorBuilder: (c, e, s) => Container(
                        color: Colors.grey[200],
                        alignment: Alignment.center,
                        child: const Icon(Icons.broken_image, size: 40),
                      ),
                    ),
                  ),
                ),
              ),
              Container(
                width: double.infinity,
                constraints: const BoxConstraints(maxHeight: 230),
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: faz == 'Dış Montaj' ? Colors.orange : Colors.blue,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          faz,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        aciklama,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text('Yapan: $yapanKisi', style: TextStyle(color: Colors.grey[700], fontSize: 13)),
                      Text('Tarih: $tarih', style: TextStyle(color: Colors.grey[700], fontSize: 13)),
                      Text('Grup: $grup', style: TextStyle(color: Colors.grey[700], fontSize: 13)),
                      Text('Durum: $durum', style: TextStyle(color: Colors.grey[700], fontSize: 13)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _fotoFazi(dynamic foto) {
    final notlar = foto['notlar']?.toString() ?? '';
    if (notlar == 'İç Montaj' || notlar == 'Dış Montaj') {
      return notlar;
    }
    final path = (foto['file_path']?.toString() ?? '').toLowerCase();
    if (path.contains('ic_montaj')) return 'İç Montaj';
    if (path.contains('dis_montaj')) return 'Dış Montaj';
    return 'Genel';
  }

  // UI YARDIMCI MADDELERİ
  Widget _formBaslik(String metin) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        metin,
        style: TextStyle(color: Colors.blueGrey[800], fontSize: 14),
      ),
    );
  }

  Widget _buildDropdown({
    required String? deger,
    required String ipucu,
    required List<DropdownMenuItem<String>> items,
    required Function(String?) onChanged,
  }) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey[300]!),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: deger,
          isExpanded: true,
          hint: Text(ipucu),
          items: items,
          onChanged: onChanged,
        ),
      ),
    );
  }
}
