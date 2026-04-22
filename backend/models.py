from sqlalchemy import Column, Integer, String, ForeignKey
from datetime import datetime
from database import Base

# 1. PROJELER TABLOSU
class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    kod = Column(String, unique=True, index=True) 
    name = Column(String)                         
    gruplar = Column(String, nullable=True)       
    yonetici = Column(String)                     
    yil = Column(Integer, default=lambda: datetime.now().year)
    durum = Column(String, default="Aktif")       
    is_deleted = Column(Integer, default=0)
    deleted_at = Column(String, nullable=True)
    deleted_by = Column(String, nullable=True)

# 2. İŞ EMİRLERİ (AKTİF PROJELER) TABLOSU
class WorkOrder(Base):
    __tablename__ = 'work_orders'
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=True)
    bolum = Column(String, default="İç Montaj")
    grup = Column(String, default="Genel")
    islem = Column(String)
    durum = Column(String, default="Beklemede")
    montajci = Column(String, default="Bilinmiyor")
    atanan_kisi = Column(String, nullable=True)
    termin_tarihi = Column(String, nullable=True)
    oncelik = Column(String, default="Normal")
    kayit_kaynagi = Column(String, default="Plan")
    notlar = Column(String, default="-")
    tarih = Column(String, default=lambda: datetime.now().strftime("%d.%m.%Y %H:%M"))
    resim_url = Column(String, nullable=True)

# 3. PANO TAKİP TABLOSU
class Pano(Base):
    __tablename__ = "panolar"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=True)
    grubu = Column(String)
    pano_no = Column(String, unique=True, index=True)
    olcu = Column(String)
    toplayan = Column(String)
    baslangic = Column(String)
    teslim = Column(String)
    notlar = Column(String, nullable=True)
    durumu = Column(String, default="Planlandı")

# 4. KONTROL LİSTESİ TABLOSU
class ChecklistItem(Base):
    __tablename__ = "checklist_items"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=True)
    kategori = Column(String, default="Elektrik")
    madde_metni = Column(String)
    durum = Column(String, default="Beklemede")
    notlar = Column(String, nullable=True)
    guncelleyen = Column(String, nullable=True)

# 5. KULLANICI / GÜVENLİK TABLOSU
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    kullanici_adi = Column(String, unique=True, index=True)
    sifre = Column(String)
    hashed_password = Column(String, nullable=True)
    full_name = Column(String)
    email = Column(String, nullable=True) 
    role = Column(String)
    is_active = Column(Integer, default=1)

# ==========================================
# 6. FOTO GALERİ TABLOSU!
# ==========================================
class Photo(Base):
    __tablename__ = "photos"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=True)
    file_path = Column(String)
    yukleyen = Column(String)
    tarih = Column(String, default=lambda: datetime.now().strftime("%d.%m.%Y %H:%M"))

# ==========================================
# 7. FABRİKA BAKIM TABLOSU (HAYAT KURTARICI MODÜL)
# ==========================================
class Maintenance(Base):
    __tablename__ = "maintenances"
    id = Column(Integer, primary_key=True, index=True)
    makine_kodu = Column(String, index=True) # Örn: CNC-01, LAZER-05
    kisim = Column(String)                   # Örn: Hidrolik Pompa, Mil
    islem = Column(String)                   # Arıza detayı
    oncelik = Column(String)                 # KRİTİK, Yüksek, Normal
    durum = Column(String, default="Açık")   # Açık, Müdahale Ediliyor, Çözüldü
    personel = Column(String)                # Bildiren kişi
    tarih = Column(String, default=lambda: datetime.now().strftime("%d.%m.%Y %H:%M"))
    notlar = Column(String, nullable=True)
    foto_url = Column(String, nullable=True) # Arıza anının fotoğrafı


class Personel(Base):
    __tablename__ = "personel"

    id = Column(Integer, primary_key=True, index=True)
    isim = Column(String, index=True)
    sifre = Column(String)
    yetki = Column(String, default="Saha Personeli")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    actor_user_id = Column(Integer, nullable=True)
    actor_role = Column(String, nullable=True)
    action = Column(String)
    entity_type = Column(String)
    entity_id = Column(String, nullable=True)
    payload = Column(String, nullable=True)
    created_at = Column(String, default=lambda: datetime.now().strftime("%d.%m.%Y %H:%M"))


class AppPolicy(Base):
    __tablename__ = "app_policies"
    id = Column(Integer, primary_key=True, index=True)
    platform = Column(String, unique=True, index=True)  # all, web, android, ios
    min_supported_version = Column(String, default="0.0.0")
    latest_version = Column(String, default="1.0.0")
    force_update = Column(Integer, default=0)
    maintenance_mode = Column(Integer, default=0)
    feature_flags = Column(String, default="{}")
    announcement = Column(String, nullable=True)
    updated_at = Column(String, default=lambda: datetime.now().strftime("%d.%m.%Y %H:%M"))
    updated_by = Column(String, nullable=True)


class AppPolicySnapshot(Base):
    __tablename__ = "app_policy_snapshots"
    id = Column(Integer, primary_key=True, index=True)
    platform = Column(String, index=True)
    min_supported_version = Column(String, nullable=False)
    latest_version = Column(String, nullable=False)
    force_update = Column(Integer, default=0)
    maintenance_mode = Column(Integer, default=0)
    feature_flags = Column(String, default="{}")
    announcement = Column(String, nullable=True)
    changed_at = Column(String, default=lambda: datetime.now().strftime("%d.%m.%Y %H:%M"))
    changed_by = Column(String, nullable=True)


class ProcessedOperation(Base):
    __tablename__ = "processed_operations"
    id = Column(Integer, primary_key=True, index=True)
    op_id = Column(String, unique=True, index=True)
    endpoint = Column(String, nullable=False)
    created_at = Column(String, default=lambda: datetime.now().strftime("%d.%m.%Y %H:%M"))


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    level = Column(String, default="warning")  # info, warning, danger
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    entity_type = Column(String, nullable=True)
    entity_id = Column(String, nullable=True)
    created_at = Column(String, default=lambda: datetime.now().strftime("%d.%m.%Y %H:%M"))
    is_read = Column(Integer, default=0)