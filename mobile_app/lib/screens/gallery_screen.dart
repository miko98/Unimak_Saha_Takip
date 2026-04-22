import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../config/api_config.dart';
import '../theme/app_theme.dart';

class GalleryScreen extends StatefulWidget {
  final String projeId;
  final String projeKodu;

  const GalleryScreen({
    Key? key,
    required this.projeId,
    required this.projeKodu,
  }) : super(key: key);

  @override
  _GalleryScreenState createState() => _GalleryScreenState();
}

class _GalleryScreenState extends State<GalleryScreen> {
  List<dynamic> fotograflar = [];
  bool isLoading = true;
  String aktifFiltre = 'Tümü'; // Tümü, İç Montaj, Dış Montaj

  @override
  void initState() {
    super.initState();
    fotograflariGetir();
  }

  Future<void> fotograflariGetir() async {
    setState(() => isLoading = true);
    try {
      final response = await http.get(
        Uri.parse('$apiBaseUrl/galeri/${widget.projeId}'),
      );
      if (response.statusCode == 200) {
        setState(() {
          fotograflar = json.decode(response.body);
          isLoading = false;
        });
      }
    } catch (e) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Fotoğraflar yüklenemedi!')));
      setState(() => isLoading = false);
    }
  }

  // Filtreleme mantığı
  List<dynamic> get filtrelenmisFotolar {
    if (aktifFiltre == 'Tümü') return fotograflar;
    return fotograflar
        .where(
          (foto) =>
              foto['notlar'] != null && foto['notlar'].contains(aktifFiltre),
        )
        .toList();
  }

  // Fotoğrafı tam ekran açma
  void tamEkranGoster(String url) {
    showDialog(
      context: context,
      builder: (_) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: EdgeInsets.all(10),
        child: InteractiveViewer(
          panEnabled: true,
          minScale: 0.5,
          maxScale: 4,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.network(url, fit: BoxFit.contain),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: AppBar(
        title: Text('${widget.projeKodu} Arşivi'),
        backgroundColor: AppTheme.card,
        foregroundColor: AppTheme.text,
      ),
      body: Column(
        children: [
          // FİLTRE BUTONLARI
          Container(
            padding: EdgeInsets.symmetric(vertical: 12, horizontal: 8),
            color: AppTheme.card,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _buildFilterButton('Tümü', Icons.photo_library, AppTheme.muted),
                _buildFilterButton('İç Montaj', Icons.factory, AppTheme.primary),
                _buildFilterButton('Dış Montaj', Icons.domain, AppTheme.secondary),
              ],
            ),
          ),

          // FOTOĞRAF IZGARASI (GRID)
          Expanded(
            child: isLoading
                ? const Center(child: CircularProgressIndicator())
                : filtrelenmisFotolar.isEmpty
                ? Center(
                    child: Text(
                      "Bu aşamaya ait fotoğraf yok.",
                      style: TextStyle(color: AppTheme.muted, fontSize: 16),
                    ),
                  )
                : GridView.builder(
                    padding: EdgeInsets.all(12),
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2, // Yan yana 2 fotoğraf
                      crossAxisSpacing: 10,
                      mainAxisSpacing: 10,
                      childAspectRatio: 0.85,
                    ),
                    itemCount: filtrelenmisFotolar.length,
                    itemBuilder: (context, index) {
                      var foto = filtrelenmisFotolar[index];
                      // Windows dosya yollarını URL formatına çevir
                      String path = foto['file_path'].toString().replaceAll(
                        '\\',
                        '/',
                      );
                      String imageUrl = '$apiBaseUrl/$path';
                      String faz = foto['notlar'] ?? 'Genel';

                      return GestureDetector(
                        onTap: () => tamEkranGoster(imageUrl),
                        child: Card(
                          elevation: 2,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              Image.network(
                                imageUrl,
                                fit: BoxFit.cover,
                                errorBuilder: (c, o, s) => Icon(
                                  Icons.broken_image,
                                  color: Colors.grey,
                                  size: 50,
                                ),
                              ),
                              // Aşama Etiketi
                              Positioned(
                                top: 8,
                                left: 8,
                                child: Container(
                                  padding: EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 4,
                                  ),
                                  decoration: BoxDecoration(
                                  color: faz == 'Dış Montaj'
                                      ? AppTheme.secondary
                                      : AppTheme.primary,
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
                              // Yükleyen Kişi Alt Bar
                              Positioned(
                                bottom: 0,
                                left: 0,
                                right: 0,
                                child: Container(
                                  color: const Color(0x99000000),
                                  padding: EdgeInsets.symmetric(
                                    vertical: 4,
                                    horizontal: 8,
                                  ),
                                  child: Text(
                                    "${foto['yukleyen']} \n${foto['tarih']}",
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 10,
                                    ),
                                    textAlign: TextAlign.center,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterButton(String text, IconData icon, Color color) {
    bool isSelected = aktifFiltre == text;
    return ElevatedButton.icon(
      onPressed: () => setState(() => aktifFiltre = text),
      icon: Icon(icon, size: 16, color: isSelected ? Colors.white : color),
      label: Text(
        text,
        style: TextStyle(
          fontSize: 12,
          color: isSelected ? Colors.white : color,
          fontWeight: FontWeight.bold,
        ),
      ),
      style: ElevatedButton.styleFrom(
        backgroundColor: isSelected ? color : AppTheme.bg,
        elevation: isSelected ? 2 : 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
    );
  }
}
