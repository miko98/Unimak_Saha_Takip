from pydantic import BaseModel
from typing import Optional


class LoginRequest(BaseModel):
    kullanici_adi: str
    sifre: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: int
    kullanici_adi: str
    isim: str
    rol: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut

# İş Emri için temel yapı (models.WorkOrder ile uyumlu)
class WorkOrderBase(BaseModel):
    project_id: int
    bolum: Optional[str] = "İç Montaj"
    grup: Optional[str] = "Genel"
    islem: str
    durum: Optional[str] = "Beklemede"
    montajci: Optional[str] = "Bilinmiyor"
    notlar: Optional[str] = "-"
    tarih: Optional[str] = None
    resim_url: Optional[str] = None

# Veri gelirken (Create) kullanılacak şema
class WorkOrderCreate(WorkOrderBase):
    pass

# Veri giderken (Response) veritabanı ID'si ve Durum ile dönecek şema
class WorkOrderResponse(WorkOrderBase):
    id: int

    class Config:
        from_attributes = True
