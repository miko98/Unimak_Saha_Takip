import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/network/api_client.dart';
import '../core/offline/offline_read_cache_service.dart';
import 'gallery_screen.dart';
import 'login_screen.dart'; // Çıkış yapabilmek için
import '../theme/app_theme.dart';
import '../widgets/unimak_confirm_dialog.dart';

class TaskDetailScreen extends StatefulWidget {
  final String projeId;
  final String projeKodu;
  final String mevcutFaz;
  final String kullaniciAdi;

  const TaskDetailScreen({
    Key? key,
    required this.projeId,
    required this.projeKodu,
    required this.mevcutFaz,
    required this.kullaniciAdi,
  }) : super(key: key);

  @override
  _TaskDetailScreenState createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends State<TaskDetailScreen> {
  int _seciliSekme =
      0; // 0: Checklist, 1: Yeni Log (Ekran Görüntüsü Formu), 2: SOS
  List<dynamic> bekleyenIsler = [];
  bool isLoading = true;
  int? _durumIslemdeId;

  // --- YENİ LOG FORMU DEĞİŞKENLERİ (Ekran Görüntüsünden Alındı) ---
  String _seciliGrup = 'Elektrik';
  final List<String> _gruplar = [
    'Elektrik',
    'Mekanik',
    'Otomasyon',
    'Yazılım',
    'Genel',
  ];

  final TextEditingController _islemController = TextEditingController();

  String _seciliDurum = 'Tamamlandı';
  final List<String> _durumlar = [
    'Tamamlandı',
    'Devam Ediyor',
    'Beklemede',
    'Hatalı',
  ];

  final TextEditingController _notController = TextEditingController();
  XFile? _seciliLogFotosu;
  bool _formKaydediliyor = false;

  @override
  void initState() {
    super.initState();
    isleriGetir();
  }

  Future<void> isleriGetir() async {
    setState(() => isLoading = true);
    try {
      final response = await ApiClient.get('/checklist/${widget.projeId}');
      if (response.statusCode == 200) {
        final List veriler = json.decode(response.body);
        await OfflineReadCacheService.saveJson('checklist_${widget.projeId}', veriler);
        setState(() {
          bekleyenIsler = veriler
              .where((islem) => islem['durum'] != 'Tamamlandı')
              .toList();
          isLoading = false;
        });
      } else {
        setState(() => isLoading = false);
      }
    } catch (e) {
      final cached = await OfflineReadCacheService.loadJson('checklist_${widget.projeId}');
      if (cached is List) {
        if (!mounted) return;
        setState(() {
          bekleyenIsler = cached
              .where((islem) => islem['durum'] != 'Tamamlandı')
              .toList();
          isLoading = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Internet yok. Son checklist verisi gosteriliyor.')),
        );
      } else {
        setState(() => isLoading = false);
      }
    }
  }

  Future<void> durumGuncelle(int islemId, String yeniDurum) async {
    final seciliIslem = bekleyenIsler.firstWhere(
      (x) => x['id'] == islemId,
      orElse: () => <String, dynamic>{},
    );
    final madde = seciliIslem is Map ? (seciliIslem['madde_metni']?.toString() ?? '') : '';
    final isHata = yeniDurum == 'Hatalı';
    final confirmed = await showUnimakConfirm(
      context,
      title: isHata ? 'UNIMAK HATA ONAYI' : 'UNIMAK ISLEM ONAYI',
      message: '"${madde.isEmpty ? 'Checklist maddesi' : madde}" kaydini "$yeniDurum" olarak guncellemek istiyor musunuz?',
      variant: isHata ? UnimakConfirmVariant.danger : UnimakConfirmVariant.warning,
      confirmLabel: isHata ? 'Evet, Hatali Isaretle' : 'Evet, Guncelle',
    );
    if (!confirmed) return;

    setState(() => _durumIslemdeId = islemId);
    try {
      final response = await ApiClient.postMultipartWithQueue(
        type: 'checklist_update',
        path: '/checklist/guncelle/',
        fields: {
          'item_id': islemId.toString(),
          'durum': yeniDurum,
          'personel': widget.kullaniciAdi,
        },
      );
      if (response.ok) {
        if (response.queued) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Internet yok, senkron kuyruguna alindi.')),
          );
        }
        isleriGetir();
      }
    } catch (e) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Bağlantı Hatası!')));
    } finally {
      if (mounted) {
        setState(() => _durumIslemdeId = null);
      }
    }
  }

  Future<void> sosGonder(String sorunTipi) async {
    final confirmed = await showUnimakConfirm(
      context,
      title: 'UNIMAK ISLEM ONAYI',
      message: 'SOS bildirimi WhatsApp uzerinden gonderilecek. Devam edilsin mi?',
      variant: UnimakConfirmVariant.danger,
      confirmLabel: 'Evet, SOS Gonder',
    );
    if (!confirmed) return;
    final String mesaj =
        "🚨 *ACİL DURUM* 🚨\n\n*Proje:* ${widget.projeKodu}\n*Aşama:* ${widget.mevcutFaz}\n*Bildiren:* ${widget.kullaniciAdi}\n*Durum:* $sorunTipi\n\nLütfen acil destek sağlayın.";
    final Uri url = Uri.parse(
      "https://wa.me/?text=${Uri.encodeComponent(mesaj)}",
    );
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
    } else {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('WhatsApp açılamadı!')));
    }
  }

  // --- YENİ SAHA LOGU KAYDETME MANTIĞI ---
  Future<void> _yeniLogKaydet() async {
    if (_islemController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Lütfen yapılan işlemi yazın!'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    final confirmed = await showUnimakConfirm(
      context,
      title: 'UNIMAK ISLEM ONAYI',
      message: 'Yeni saha logu kaydi olusturulacak. Devam edilsin mi?',
      variant: UnimakConfirmVariant.info,
    );
    if (!confirmed) return;

    setState(() => _formKaydediliyor = true);
    try {
      final response = await ApiClient.postMultipartWithQueue(
        type: 'field_log',
        path: '/yeni_saha_logu/',
        fields: {
          'proje_id': widget.projeId,
          'personel': widget.kullaniciAdi,
          'grup': _seciliGrup,
          'islem': _islemController.text,
          'durum': _seciliDurum,
          'notlar': _notController.text.isEmpty ? "-" : _notController.text,
          'faz': widget.mevcutFaz,
        },
        filePath: _seciliLogFotosu?.path,
        fileName: _seciliLogFotosu?.name,
      );
      if (response.ok) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              response.queued
                  ? 'Internet yok, senkron kuyruguna alindi.'
                  : 'Log basariyla kaydedildi!',
            ),
            backgroundColor: Colors.green,
          ),
        );
        // Formu Temizle
        setState(() {
          _islemController.clear();
          _notController.clear();
          _seciliLogFotosu = null;
        });
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Kayıt başarısız, bağlantıyı kontrol edin.'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      setState(() => _formKaydediliyor = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: AppBar(
        title: Text(widget.projeKodu),
        backgroundColor: AppTheme.card,
        foregroundColor: AppTheme.text,
        actions: [
          // GÜVENLİ ÇIKIŞ YAP BUTONU
          IconButton(
            icon: const Icon(Icons.logout, color: AppTheme.danger),
            tooltip: "Sistemden Çıkış Yap",
            onPressed: () {
              showUnimakConfirm(
                context,
                title: 'UNIMAK ISLEM ONAYI',
                message: 'Sistemden cikis yapmak istiyor musunuz?',
                variant: UnimakConfirmVariant.warning,
                confirmLabel: 'Evet, Cikis Yap',
              ).then((approved) {
                if (!approved || !mounted) return;
                Navigator.pushAndRemoveUntil(
                  context,
                  MaterialPageRoute(builder: (context) => LoginScreen()),
                  (route) => false,
                );
              });
            },
          ),
        ],
      ),

      body: Column(
        children: [
          // ÜST BİLGİ PANELİ
          Container(
            padding: EdgeInsets.all(15),
            decoration: BoxDecoration(
              color: AppTheme.card,
              boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 8, offset: Offset(0, 2))],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "Personel: ${widget.kullaniciAdi}",
                      style: TextStyle(
                        color: AppTheme.muted,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      _seciliSekme == 0
                          ? "Kontrol Listesi"
                          : _seciliSekme == 1
                          ? "Yeni Saha Logu"
                          : "Acil Bildirim",
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                        color: AppTheme.text,
                      ),
                    ),
                  ],
                ),
                Container(
                  padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: widget.mevcutFaz == 'Dış Montaj'
                        ? const Color(0xFFFFEDD5)
                        : const Color(0xFFE0F2FE),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    widget.mevcutFaz.toUpperCase(),
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: widget.mevcutFaz == 'Dış Montaj'
                          ? AppTheme.secondary
                          : AppTheme.primaryDark,
                    ),
                  ),
                ),
              ],
            ),
          ),

          Expanded(
            child: _seciliSekme == 0
                ? _buildIslerListesi()
                : _seciliSekme == 1
                ? _buildYeniSahaLoguFormu() // EKRAN GÖRÜNTÜSÜNDEKİ FORM
                : _buildSOSPaneli(),
          ),
        ],
      ),

      // ALT MENÜ (BOTTOM NAV)
      bottomNavigationBar: BottomAppBar(
        color: Colors.white,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            // KONTROL LİSTESİ
            IconButton(
              icon: Icon(
                Icons.checklist,
                color: _seciliSekme == 0 ? AppTheme.primary : AppTheme.muted,
                size: 30,
              ),
              onPressed: () => setState(() => _seciliSekme = 0),
            ),

            // YENİ LOG FORMU (Eklendi)
            IconButton(
              icon: Icon(
                Icons.post_add,
                color: _seciliSekme == 1 ? AppTheme.primary : AppTheme.muted,
                size: 30,
              ),
              onPressed: () => setState(() => _seciliSekme = 1),
            ),

            // GALERİ (ESKİ LOGLAR)
            IconButton(
              icon: const Icon(Icons.photo_library, color: AppTheme.muted, size: 28),
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => GalleryScreen(
                      projeId: widget.projeId,
                      projeKodu: widget.projeKodu,
                    ),
                  ),
                );
              },
            ),

            // SOS BUTONU
            IconButton(
              icon: Icon(
                Icons.warning_amber_rounded,
                color: _seciliSekme == 2 ? AppTheme.danger : AppTheme.muted,
                size: 30,
              ),
              onPressed: () => setState(() => _seciliSekme = 2),
            ),
          ],
        ),
      ),
    );
  }

  // ==============================================================
  // YENİ EKLENEN: EKRAN GÖRÜNTÜSÜNDEKİ "SAHA LOGU" FORMU
  // ==============================================================
  Widget _buildYeniSahaLoguFormu() {
    return SingleChildScrollView(
      padding: EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // GRUP SEÇİMİ
          Text(
            "Grup",
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: Colors.blueGrey[800],
            ),
          ),
          SizedBox(height: 8),
          Container(
            padding: EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.grey[300]!),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _seciliGrup,
                isExpanded: true,
                items: _gruplar
                    .map(
                      (String value) => DropdownMenuItem<String>(
                        value: value,
                        child: Text(value),
                      ),
                    )
                    .toList(),
                onChanged: (yeniDeger) =>
                    setState(() => _seciliGrup = yeniDeger!),
              ),
            ),
          ),
          SizedBox(height: 16),

          // YAPILAN İŞLEM
          Text(
            "Yapılan İşlem",
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: Colors.blueGrey[800],
            ),
          ),
          SizedBox(height: 8),
          TextField(
            controller: _islemController,
            decoration: InputDecoration(
              hintText: "Örn: Pano klemens bağlantıları sıkıldı",
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
          SizedBox(height: 16),

          // DURUM
          Text(
            "Durum",
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: Colors.blueGrey[800],
            ),
          ),
          SizedBox(height: 8),
          Container(
            padding: EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.grey[300]!),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _seciliDurum,
                isExpanded: true,
                items: _durumlar
                    .map(
                      (String value) => DropdownMenuItem<String>(
                        value: value,
                        child: Text(value),
                      ),
                    )
                    .toList(),
                onChanged: (yeniDeger) =>
                    setState(() => _seciliDurum = yeniDeger!),
              ),
            ),
          ),
          SizedBox(height: 16),

          // FOTOĞRAF EKLEME (Kesik Çizgili Alan)
          Text(
            "Resimler (Kamera / Galeri)",
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: Colors.blueGrey[800],
            ),
          ),
          SizedBox(height: 8),
          GestureDetector(
            onTap: () async {
              final ImagePicker picker = ImagePicker();
              final XFile? foto = await picker.pickImage(
                source: ImageSource.camera,
              ); // İstersen gallery yapabilirsin
              if (foto != null) {
                setState(() => _seciliLogFotosu = foto);
              }
            },
            child: Container(
              width: double.infinity,
              padding: EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.blueGrey[50],
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: Colors.blueGrey[300]!,
                  style: BorderStyle.solid,
                  width: 2,
                ), // Mobil için solid daha performanslı
              ),
              child: Column(
                children: [
                  Icon(
                    _seciliLogFotosu == null
                        ? Icons.camera_alt
                        : Icons.check_circle,
                    size: 40,
                    color: _seciliLogFotosu == null
                        ? Colors.blueGrey[400]
                        : Colors.green,
                  ),
                  SizedBox(height: 10),
                  Text(
                    _seciliLogFotosu == null
                        ? "Yeni Resim Çek veya Seç"
                        : "Resim Eklendi: ${_seciliLogFotosu!.name}",
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.blueGrey[600],
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ),
          SizedBox(height: 16),

          // NOTLAR
          Text(
            "Notlar",
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: Colors.blueGrey[800],
            ),
          ),
          SizedBox(height: 8),
          TextField(
            controller: _notController,
            maxLines: 3,
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
          SizedBox(height: 25),

          // KAYDET BUTONU
          SizedBox(
            width: double.infinity,
            height: 55,
            child: ElevatedButton(
              onPressed: _formKaydediliyor ? null : _yeniLogKaydet,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green[600],
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              child: _formKaydediliyor
                  ? CircularProgressIndicator(color: Colors.white)
                  : Text(
                      "VERİYİ KAYDET VE GÖNDER",
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
            ),
          ),
          SizedBox(height: 30),
        ],
      ),
    );
  }

  // İŞLER LİSTESİ TASARIMI
  Widget _buildIslerListesi() {
    if (isLoading) return Center(child: CircularProgressIndicator());
    if (bekleyenIsler.isEmpty)
      return Center(
        child: Text(
          "Tüm görevler tamamlandı! 🎉",
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Colors.green,
          ),
        ),
      );

    return ListView.builder(
      padding: EdgeInsets.all(16),
      itemCount: bekleyenIsler.length,
      itemBuilder: (context, index) {
        var islem = bekleyenIsler[index];
        final islemde = _durumIslemdeId == islem['id'];
        return Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          margin: EdgeInsets.only(bottom: 16),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border(
                top: BorderSide(color: Colors.grey[300]!),
                right: BorderSide(color: Colors.grey[300]!),
                bottom: BorderSide(color: Colors.grey[300]!),
                left: BorderSide(
                  color: islem['durum'] == 'Hatalı'
                      ? Colors.redAccent
                      : Colors.grey[300]!,
                  width: 5,
                ),
              ),
            ),
            padding: EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  islem['madde_metni'],
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: Colors.blueGrey[900],
                  ),
                ),
                SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          padding: EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        icon: Icon(Icons.check_circle, color: Colors.white),
                        label: Text(
                          'TAMAM',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        onPressed: islemde ? null : () => durumGuncelle(islem['id'], 'Tamamlandı'),
                      ),
                    ),
                    SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.redAccent,
                          padding: EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        icon: Icon(Icons.report_problem, color: Colors.white),
                        label: Text(
                          'HATA',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        onPressed: islemde ? null : () => durumGuncelle(islem['id'], 'Hatalı'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  // ACİL DURUM (SOS) PANELI TASARIMI
  Widget _buildSOSPaneli() {
    return SingleChildScrollView(
      padding: EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(height: 20),
          Container(
            padding: EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.red[50],
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.notifications_active,
              size: 80,
              color: Colors.red,
            ),
          ),
          SizedBox(height: 20),
          Text(
            "ACİL BİLDİRİM (SOS)",
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w900,
              color: Colors.red[900],
            ),
          ),
          SizedBox(height: 10),
          Text(
            "Aşağıdaki butonları kullanarak merkeze tek tuşla WhatsApp üzerinden acil durum sinyali gönderin.",
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey[700], fontSize: 14),
          ),
          SizedBox(height: 40),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.orange,
              minimumSize: Size(double.infinity, 65),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            icon: Icon(Icons.inventory_2, color: Colors.white),
            label: Text(
              "MALZEME EKSİK / YANLIŞ",
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            onPressed: () =>
                sosGonder("Sahada eksik veya yanlış malzeme tespit edildi."),
          ),
          SizedBox(height: 16),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.redAccent,
              minimumSize: Size(double.infinity, 65),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            icon: Icon(Icons.electric_bolt, color: Colors.white),
            label: Text(
              "TEKNİK ARIZA (Şef'e Bildir)",
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            onPressed: () =>
                sosGonder("Sistemde kritik bir teknik arıza meydana geldi."),
          ),
        ],
      ),
    );
  }
}
