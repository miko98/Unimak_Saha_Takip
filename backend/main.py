import os
from fastapi import FastAPI, Depends, UploadFile, File, Form, Request, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import models
from database import engine, SessionLocal
from excel_archive import append_project_event, get_project_excel_path
import smtplib
import shutil
from uuid import uuid4
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi.responses import JSONResponse, FileResponse
from datetime import datetime
import json
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from auth.deps import (
    ROLE_MUDUR,
    ROLE_SAHA,
    ROLE_SEF,
    ROLE_YONETICI,
    get_current_user,
    require_roles,
)
from auth.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_MINUTES,
    create_token,
    hash_password,
    verify_password,
)

POLICY_PLATFORMS = ("all", "web", "android", "ios")

def ensure_schema_updates():
    if not str(engine.url).startswith("sqlite"):
        # In production we rely on Alembic migrations.
        return
    with engine.connect() as conn:
        user_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(users)")).fetchall()}
        if "hashed_password" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN hashed_password VARCHAR"))
        if "is_active" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1"))

        tables = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()}
        if "audit_logs" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE audit_logs (
                        id INTEGER PRIMARY KEY,
                        actor_user_id INTEGER,
                        actor_role VARCHAR,
                        action VARCHAR NOT NULL,
                        entity_type VARCHAR NOT NULL,
                        entity_id VARCHAR,
                        payload VARCHAR,
                        created_at VARCHAR NOT NULL
                    )
                    """
                )
            )
        work_order_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(work_orders)")).fetchall()}
        if "atanan_kisi" not in work_order_cols:
            conn.execute(text("ALTER TABLE work_orders ADD COLUMN atanan_kisi VARCHAR"))
        if "termin_tarihi" not in work_order_cols:
            conn.execute(text("ALTER TABLE work_orders ADD COLUMN termin_tarihi VARCHAR"))
        if "oncelik" not in work_order_cols:
            conn.execute(text("ALTER TABLE work_orders ADD COLUMN oncelik VARCHAR DEFAULT 'Normal'"))
        if "kayit_kaynagi" not in work_order_cols:
            conn.execute(text("ALTER TABLE work_orders ADD COLUMN kayit_kaynagi VARCHAR DEFAULT 'Plan'"))
        project_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(projects)")).fetchall()}
        current_year = datetime.now().year
        if "yil" not in project_cols:
            conn.execute(text("ALTER TABLE projects ADD COLUMN yil INTEGER"))
        if "is_deleted" not in project_cols:
            conn.execute(text("ALTER TABLE projects ADD COLUMN is_deleted INTEGER DEFAULT 0"))
        if "deleted_at" not in project_cols:
            conn.execute(text("ALTER TABLE projects ADD COLUMN deleted_at VARCHAR"))
        if "deleted_by" not in project_cols:
            conn.execute(text("ALTER TABLE projects ADD COLUMN deleted_by VARCHAR"))
        conn.execute(text("UPDATE projects SET yil = COALESCE(yil, :year)"), {"year": current_year})
        if "system_controls" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE system_controls (
                        id INTEGER PRIMARY KEY,
                        key VARCHAR UNIQUE NOT NULL,
                        value VARCHAR NOT NULL,
                        updated_at VARCHAR NOT NULL,
                        updated_by VARCHAR
                    )
                    """
                )
            )
        existing_maintenance = conn.execute(
            text("SELECT id FROM system_controls WHERE key = 'maintenance_mode'")
        ).fetchone()
        if not existing_maintenance:
            conn.execute(
                text(
                    "INSERT INTO system_controls(key, value, updated_at, updated_by) VALUES ('maintenance_mode', 'off', :updated_at, 'system')"
                ),
                {"updated_at": datetime.now().strftime("%d.%m.%Y %H:%M")},
            )
        if "app_policies" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE app_policies (
                        id INTEGER PRIMARY KEY,
                        platform VARCHAR UNIQUE NOT NULL,
                        min_supported_version VARCHAR NOT NULL DEFAULT '0.0.0',
                        latest_version VARCHAR NOT NULL DEFAULT '1.0.0',
                        force_update INTEGER NOT NULL DEFAULT 0,
                        maintenance_mode INTEGER NOT NULL DEFAULT 0,
                        feature_flags VARCHAR NOT NULL DEFAULT '{}',
                        announcement VARCHAR,
                        updated_at VARCHAR NOT NULL,
                        updated_by VARCHAR
                    )
                    """
                )
            )
        if "app_policy_snapshots" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE app_policy_snapshots (
                        id INTEGER PRIMARY KEY,
                        platform VARCHAR NOT NULL,
                        min_supported_version VARCHAR NOT NULL,
                        latest_version VARCHAR NOT NULL,
                        force_update INTEGER NOT NULL DEFAULT 0,
                        maintenance_mode INTEGER NOT NULL DEFAULT 0,
                        feature_flags VARCHAR NOT NULL DEFAULT '{}',
                        announcement VARCHAR,
                        changed_at VARCHAR NOT NULL,
                        changed_by VARCHAR
                    )
                    """
                )
            )
        if "processed_operations" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE processed_operations (
                        id INTEGER PRIMARY KEY,
                        op_id VARCHAR UNIQUE NOT NULL,
                        endpoint VARCHAR NOT NULL,
                        created_at VARCHAR NOT NULL
                    )
                    """
                )
            )
        if "notifications" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE notifications (
                        id INTEGER PRIMARY KEY,
                        level VARCHAR NOT NULL DEFAULT 'warning',
                        title VARCHAR NOT NULL,
                        message VARCHAR NOT NULL,
                        entity_type VARCHAR,
                        entity_id VARCHAR,
                        created_at VARCHAR NOT NULL,
                        is_read INTEGER NOT NULL DEFAULT 0
                    )
                    """
                )
            )
        for platform in POLICY_PLATFORMS:
            existing_policy = conn.execute(
                text("SELECT id FROM app_policies WHERE platform = :platform LIMIT 1"),
                {"platform": platform},
            ).fetchone()
            if not existing_policy:
                conn.execute(
                    text(
                        """
                        INSERT INTO app_policies(
                            platform, min_supported_version, latest_version, force_update,
                            maintenance_mode, feature_flags, announcement, updated_at, updated_by
                        ) VALUES(
                            :platform, '0.0.0', '1.0.0', 0, 0, '{}', NULL, :updated_at, 'system'
                        )
                        """
                    ),
                    {
                        "platform": platform,
                        "updated_at": datetime.now().strftime("%d.%m.%Y %H:%M"),
                    },
                )
        conn.commit()


# Tabloları oluştur / yükselt
models.Base.metadata.create_all(bind=engine)
ensure_schema_updates()
app = FastAPI(title="Unimak SaaS API")

VALID_PHASES = {"İç Montaj", "Dış Montaj"}
VALID_WORKORDER_STATUS_FLOW = {
    "Beklemede": {"Devam Ediyor", "Eksik", "Hatalı", "Tamamlandı"},
    "Devam Ediyor": {"Beklemede", "Eksik", "Hatalı", "Tamamlandı"},
    "Eksik": {"Beklemede", "Devam Ediyor", "Tamamlandı"},
    "Hatalı": {"Beklemede", "Devam Ediyor", "Tamamlandı"},
    "Tamamlandı": {"Devam Ediyor"},
}
FAILED_LOGINS: dict[str, dict[str, int]] = {}
MAX_LOGIN_ATTEMPTS = 5
LOCK_SECONDS = 300
DELETE_TOKENS: dict[str, dict] = {}
DELETE_TOKEN_TTL_SECONDS = 600


def normalize_phase(phase: str) -> str:
    """Keep phase model consistent across web and mobile."""
    if phase == "Nakliyat":
        return "Dış Montaj"
    return phase


def phase_token(phase: str) -> str:
    normalized = normalize_phase(phase)
    return "ic_montaj" if normalized == "İç Montaj" else "dis_montaj"


def phase_from_photo_path(file_path: str) -> str:
    path = (file_path or "").lower()
    if "ic_montaj" in path:
        return "İç Montaj"
    if "dis_montaj" in path:
        return "Dış Montaj"
    return "Genel"


def sync_project_work_order(db: Session, project: models.Project):
    """Project and work-order move together as a single business record."""
    work_order = (
        db.query(models.WorkOrder)
        .filter(models.WorkOrder.project_id == project.id)
        .order_by(models.WorkOrder.id.asc())
        .first()
    )

    target_status = "Tamamlandı" if project.durum == "Tamamlandı" else "Beklemede"
    target_group = (project.gruplar or "Genel").strip() or "Genel"
    target_owner = (project.yonetici or "Ortak Havuz").strip() or "Ortak Havuz"

    if not work_order:
        work_order = models.WorkOrder(
            project_id=project.id,
            bolum="İç Montaj",
            grup=target_group,
            islem=project.name,
            durum=target_status,
            montajci=target_owner,
            atanan_kisi=target_owner,
            oncelik="Normal",
            kayit_kaynagi="Plan",
            notlar=f"[Proje] {project.kod}",
            tarih=datetime.now().strftime("%d.%m.%Y %H:%M"),
        )
        db.add(work_order)
        return

    work_order.islem = project.name
    work_order.grup = target_group
    work_order.montajci = target_owner
    work_order.atanan_kisi = target_owner
    work_order.durum = target_status
    work_order.kayit_kaynagi = "Plan"
    work_order.tarih = datetime.now().strftime("%d.%m.%Y %H:%M")

cors_raw = os.getenv("CORS_ALLOWED_ORIGINS", "*").strip()
if cors_raw == "*":
    cors_allowed_origins = ["*"]
else:
    cors_allowed_origins = [origin.strip() for origin in cors_raw.split(",") if origin.strip()]
    if not cors_allowed_origins:
        cors_allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR): os.makedirs(UPLOAD_DIR)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.now().strftime("%d.%m.%Y %H:%M:%S")}


def _safe_slug(value: str, fallback: str = "genel") -> str:
    raw = (value or "").strip().lower()
    cleaned = "".join(ch if ch.isalnum() else "_" for ch in raw).strip("_")
    return cleaned or fallback


def _project_folder_info(db: Session, project_id: int | None):
    if not project_id:
        return str(datetime.now().year), "proje_bilinmiyor"
    project = db.query(models.Project).filter(models.Project.id == int(project_id)).first()
    year = str(project.yil) if project and project.yil else str(datetime.now().year)
    code_or_id = project.kod if project and project.kod else f"proje_{project_id}"
    return year, _safe_slug(code_or_id, f"proje_{project_id}")


def _save_upload_file(
    uploaded: UploadFile,
    folder_parts: list[str],
    filename_prefix: str = "",
):
    original = os.path.basename(uploaded.filename or "dosya")
    ext = os.path.splitext(original)[1].lower() or ".bin"
    unique = uuid4().hex[:10]
    safe_name = _safe_slug(os.path.splitext(original)[0], "dosya")
    file_name = f"{filename_prefix}{safe_name}_{unique}{ext}"
    target_dir = os.path.join(UPLOAD_DIR, *folder_parts)
    os.makedirs(target_dir, exist_ok=True)
    absolute = os.path.join(target_dir, file_name)
    with open(absolute, "wb") as buffer:
        shutil.copyfileobj(uploaded.file, buffer)
    # Store relative path with forward slashes for web/mobile clients.
    return absolute.replace("\\", "/")

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

# --- 1. KURULUM VE GİRİŞ ---
@app.get("/kurulum/")
def setup_users(db: Session = Depends(get_db)):
    if db.query(models.User).count() == 0:
        db.add_all([
            models.User(
                kullanici_adi="admin",
                sifre="1234",
                hashed_password=hash_password("1234"),
                full_name="Yönetici",
                role=ROLE_YONETICI,
            ),
            models.User(
                kullanici_adi="sef",
                sifre="1234",
                hashed_password=hash_password("1234"),
                full_name="Saha Şefi",
                role=ROLE_SEF,
            ),
            models.User(
                kullanici_adi="bayram",
                sifre="1234",
                hashed_password=hash_password("1234"),
                full_name="Bayram Ali Kaplan",
                role=ROLE_SAHA,
            ),
            models.User(
                kullanici_adi="mudur",
                sifre="1234",
                hashed_password=hash_password("1234"),
                full_name="Genel Müdür",
                role=ROLE_MUDUR,
            ),
        ])
        db.commit()
        return {"mesaj": "Kurulum tamamlandı."}
    return {"mesaj": "Sistem zaten kurulu."}


def _token_payload_for_user(user: models.User) -> dict:
    return {
        "sub": str(user.id),
        "kullanici_adi": user.kullanici_adi,
        "full_name": user.full_name,
        "role": user.role,
    }


def _is_locked(username: str) -> bool:
    state = FAILED_LOGINS.get(username)
    if not state:
        return False
    now = int(datetime.now().timestamp())
    if state.get("lock_until", 0) > now:
        return True
    if state.get("lock_until", 0) <= now:
        FAILED_LOGINS.pop(username, None)
    return False


def _record_failed_login(username: str):
    now = int(datetime.now().timestamp())
    state = FAILED_LOGINS.get(username, {"attempts": 0, "lock_until": 0})
    attempts = state["attempts"] + 1
    lock_until = now + LOCK_SECONDS if attempts >= MAX_LOGIN_ATTEMPTS else 0
    FAILED_LOGINS[username] = {"attempts": attempts, "lock_until": lock_until}


def _reset_failed_login(username: str):
    FAILED_LOGINS.pop(username, None)


def _build_auth_response(user: models.User):
    payload = _token_payload_for_user(user)
    access_token = create_token(payload, ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token = create_token({**payload, "type": "refresh"}, REFRESH_TOKEN_EXPIRE_MINUTES)
    return {
        "durum": "basarili",
        "isim": user.full_name,
        "rol": user.role,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "kullanici_adi": user.kullanici_adi,
            "isim": user.full_name,
            "rol": user.role,
        },
    }


def _now_ts() -> int:
    return int(datetime.now().timestamp())


def _maintenance_mode_is_on(db: Session) -> bool:
    row = db.execute(
        text("SELECT value FROM system_controls WHERE key = 'maintenance_mode' LIMIT 1")
    ).fetchone()
    return bool(row and str(row[0]).lower() == "on")


def _set_maintenance_mode(db: Session, enabled: bool, updated_by: str):
    db.execute(
        text(
            """
            UPDATE system_controls
            SET value = :value, updated_at = :updated_at, updated_by = :updated_by
            WHERE key = 'maintenance_mode'
            """
        ),
        {
            "value": "on" if enabled else "off",
            "updated_at": datetime.now().strftime("%d.%m.%Y %H:%M"),
            "updated_by": updated_by,
        },
    )


def _extract_role_from_request(request: Request) -> str | None:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        from auth.security import decode_token

        payload = decode_token(token)
        return payload.get("role")
    except ValueError:
        return None


def _is_processed_op(db: Session, op_id: str | None) -> bool:
    normalized = (op_id or "").strip()
    if not normalized:
        return False
    row = db.execute(
        text("SELECT id FROM processed_operations WHERE op_id = :op_id LIMIT 1"),
        {"op_id": normalized},
    ).fetchone()
    return bool(row)


def _mark_processed_op(db: Session, op_id: str | None, endpoint: str):
    normalized = (op_id or "").strip()
    if not normalized:
        return
    db.execute(
        text(
            """
            INSERT OR IGNORE INTO processed_operations(op_id, endpoint, created_at)
            VALUES (:op_id, :endpoint, :created_at)
            """
        ),
        {
            "op_id": normalized,
            "endpoint": endpoint,
            "created_at": datetime.now().strftime("%d.%m.%Y %H:%M"),
        },
    )


def _parse_version(value: str) -> tuple[int, int, int]:
    cleaned = (value or "").strip()
    if not cleaned:
        return (0, 0, 0)
    parts = cleaned.split(".")
    normalized: list[int] = []
    for i in range(3):
        if i < len(parts):
            digits = "".join(ch for ch in parts[i] if ch.isdigit())
            normalized.append(int(digits or "0"))
        else:
            normalized.append(0)
    return tuple(normalized)  # type: ignore[return-value]


def _version_lt(version_a: str, version_b: str) -> bool:
    return _parse_version(version_a) < _parse_version(version_b)


def _load_policy(db: Session, platform: str) -> models.AppPolicy:
    normalized = (platform or "all").strip().lower()
    if normalized not in POLICY_PLATFORMS:
        normalized = "all"
    row = db.query(models.AppPolicy).filter(models.AppPolicy.platform == normalized).first()
    if row:
        return row
    fallback = db.query(models.AppPolicy).filter(models.AppPolicy.platform == "all").first()
    if fallback:
        return fallback
    # Fresh databases may have migrated tables but no seed rows yet.
    # Auto-create a safe default policy so health checks and requests do not crash.
    created_at = datetime.now().strftime("%d.%m.%Y %H:%M")
    default_policy = models.AppPolicy(
        platform="all",
        min_supported_version="0.0.0",
        latest_version="1.0.0",
        force_update=0,
        maintenance_mode=0,
        feature_flags="{}",
        announcement="",
        updated_at=created_at,
        updated_by="system",
    )
    db.add(default_policy)
    try:
        db.commit()
        db.refresh(default_policy)
        return default_policy
    except Exception:
        db.rollback()
        recovered = db.query(models.AppPolicy).filter(models.AppPolicy.platform == "all").first()
        if recovered:
            return recovered
        raise HTTPException(status_code=500, detail="App policy missing")


def _effective_policy(db: Session, platform: str) -> dict:
    base = _load_policy(db, "all")
    specific = _load_policy(db, platform)
    source = specific if specific.platform != "all" else base
    try:
        flags = json.loads(source.feature_flags or "{}")
    except json.JSONDecodeError:
        flags = {}
    return {
        "platform": source.platform,
        "min_supported_version": source.min_supported_version or "0.0.0",
        "latest_version": source.latest_version or "1.0.0",
        "force_update": bool(source.force_update),
        "maintenance_mode": bool(source.maintenance_mode),
        "feature_flags": flags if isinstance(flags, dict) else {},
        "announcement": source.announcement,
        "updated_at": source.updated_at,
        "updated_by": source.updated_by,
    }


def _compute_update_level(policy: dict, app_version: str) -> str:
    if not app_version:
        return "none"
    min_supported = policy.get("min_supported_version", "0.0.0")
    latest = policy.get("latest_version", "1.0.0")
    is_below_min = _version_lt(app_version, min_supported)
    if policy.get("force_update") and is_below_min:
        return "force"
    if _version_lt(app_version, latest):
        return "soft"
    return "none"


@app.middleware("http")
async def maintenance_guard(request: Request, call_next):
    exempt_prefixes = (
        "/health",
        "/kurulum/",
        "/giris/",
        "/auth/refresh",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/uploads/",
        "/client/bootstrap",
    )
    if request.url.path.startswith(exempt_prefixes):
        return await call_next(request)

    db = SessionLocal()
    try:
        platform = request.headers.get("x-client-platform", "web").lower()
        app_version = request.headers.get("x-app-version", "")
        policy = _effective_policy(db, platform)
        update_level = _compute_update_level(policy, app_version)
        if update_level == "force":
            return JSONResponse(
                status_code=426,
                content={"hata": "Minimum sürüm desteği bitti. Uygulamayı güncelleyin.", "update_level": "force"},
                headers={"x-force-update": "1", "x-min-version": str(policy.get("min_supported_version", "0.0.0"))},
            )
        if _maintenance_mode_is_on(db):
            role = _extract_role_from_request(request)
            if role != ROLE_YONETICI:
                return JSONResponse(
                    status_code=503,
                    content={
                        "hata": "Sistem bakım modunda. Lütfen daha sonra tekrar deneyin."
                    },
                )
        response = await call_next(request)
        response.headers["x-maintenance"] = "1" if bool(policy.get("maintenance_mode")) else "0"
        response.headers["x-force-update"] = "1" if update_level == "force" else "0"
        response.headers["x-min-version"] = str(policy.get("min_supported_version", "0.0.0"))
        return response
    finally:
        db.close()


def log_audit(
    db: Session,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    payload: dict | None = None,
    actor: dict | None = None,
):
    audit = models.AuditLog(
        actor_user_id=actor.get("id") if actor else None,
        actor_role=actor.get("rol") if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=json.dumps(payload or {}, ensure_ascii=False),
    )
    db.add(audit)


def append_excel_log(
    db: Session,
    project_id: int | None,
    sheet_name: str,
    action: str,
    user_name: str,
    role: str,
    source: str,
    detail: str,
):
    try:
        append_project_event(
            db=db,
            project_id=project_id,
            sheet_name=sheet_name,
            headers=["zaman", "islem", "kullanici", "rol", "kaynak", "detay"],
            values=[
                datetime.now().strftime("%d.%m.%Y %H:%M"),
                action,
                user_name or "-",
                role or "-",
                source or "-",
                detail or "-",
            ],
        )
    except Exception as exc:
        print(f"[excel-archive] write failed: {exc}")


def push_notification(
    db: Session,
    title: str,
    message: str,
    level: str = "warning",
    entity_type: str | None = None,
    entity_id: str | None = None,
):
    n = models.Notification(
        level=level,
        title=title,
        message=message,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    db.add(n)


@app.post("/giris/")
def login(kullanici_adi: str = Form(...), sifre: str = Form(...), db: Session = Depends(get_db)):
    if _is_locked(kullanici_adi):
        return JSONResponse(status_code=429, content={"durum": "hata", "mesaj": "Çok fazla hatalı deneme. 5 dakika sonra tekrar deneyin."})
    user = db.query(models.User).filter(models.User.kullanici_adi == kullanici_adi).first()
    if user and (
        verify_password(sifre, user.hashed_password) or verify_password(sifre, user.sifre)
    ):
        _reset_failed_login(kullanici_adi)
        return _build_auth_response(user)
    _record_failed_login(kullanici_adi)
    return {"durum": "hata", "mesaj": "Hatalı şifre!"}


@app.post("/auth/refresh")
def refresh_access_token(refresh_token: str = Form(...), db: Session = Depends(get_db)):
    try:
        from auth.security import decode_token

        payload = decode_token(refresh_token)
    except ValueError:
        return JSONResponse(status_code=401, content={"hata": "Geçersiz refresh token"})

    if payload.get("type") != "refresh":
        return JSONResponse(status_code=401, content={"hata": "Token tipi hatalı"})

    user = db.query(models.User).filter(models.User.id == int(payload.get("sub", 0))).first()
    if not user:
        return JSONResponse(status_code=401, content={"hata": "Kullanıcı bulunamadı"})

    access_token = create_token(_token_payload_for_user(user), ACCESS_TOKEN_EXPIRE_MINUTES)
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/auth/me")
def auth_me(current_user=Depends(get_current_user)):
    return {"user": current_user}

# --- 2. İŞ EMİRLERİ (AKTİF PROJELER) YÖNETİMİ ---
@app.get("/is_emirleri/")
def read_all_tasks(yil: int | None = None, db: Session = Depends(get_db)):
    query = (
        db.query(models.WorkOrder)
        .join(models.Project, models.Project.id == models.WorkOrder.project_id, isouter=True)
        .filter((models.Project.id.is_(None)) | (models.Project.is_deleted != 1))
    )
    if yil:
        query = query.filter(models.Project.yil == yil)
    return query.all()

@app.post("/yeni_is_emri/")
def create_task(
    project_id: int = Form(...), # YENİ: Hangi projeye ait olduğunu alıyoruz
    task_name: str = Form(...),
    atanan_kisi: str = Form(""),
    termin_tarihi: str = Form(""),
    oncelik: str = Form("Normal"),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_SEF))
):
    proje = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not proje:
        return {"hata": "Proje bulunamadı."}

    mevcut = (
        db.query(models.WorkOrder)
        .filter(models.WorkOrder.project_id == project_id)
        .order_by(models.WorkOrder.id.asc())
        .first()
    )
    if mevcut:
        mevcut.islem = proje.name
        mevcut.montajci = (atanan_kisi or proje.yonetici or "Ortak Havuz")
        mevcut.atanan_kisi = atanan_kisi or mevcut.atanan_kisi
        mevcut.termin_tarihi = termin_tarihi or mevcut.termin_tarihi
        mevcut.oncelik = oncelik or mevcut.oncelik or "Normal"
        mevcut.tarih = datetime.now().strftime("%d.%m.%Y %H:%M")
    else:
        yeni_is = models.WorkOrder(
            project_id=project_id,
            islem=proje.name,
            montajci=atanan_kisi or proje.yonetici or "Ortak Havuz",
            durum="Beklemede",
            atanan_kisi=atanan_kisi or proje.yonetici or None,
            termin_tarihi=termin_tarihi or None,
            oncelik=oncelik or "Normal",
            kayit_kaynagi="Plan",
            notlar=f"[Proje] {proje.kod}",
        )
        db.add(yeni_is)
    log_audit(
        db,
        "sync_work_order_from_project",
        "work_orders",
        actor=current_user,
        payload={
            "project_id": project_id,
            "islem": proje.name,
            "atanan_kisi": atanan_kisi,
            "termin_tarihi": termin_tarihi,
            "oncelik": oncelik,
        },
    )
    db.commit()
    return {"mesaj": "Proje iş emri ile senkronlandı."}

# --- 3. PANO TAKİP YÖNETİMİ (YENİ) ---
@app.get("/panolar/")
def read_all_panos(db: Session = Depends(get_db)):
    return db.query(models.Pano).all()

@app.post("/yeni_pano/")
def create_pano(
    project_id: int = Form(...), # YENİ: Hangi projeye ait olduğunu alıyoruz
    grubu: str = Form(...), pano_no: str = Form(...), olcu: str = Form(...),
    toplayan: str = Form(...), baslangic: str = Form(""), teslim: str = Form(""),
    notlar: str = Form(""), durumu: str = Form(...), db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_SEF, ROLE_SAHA))
):
    yeni_pano = models.Pano(
        project_id=project_id,   # YENİ: Veritabanına kaydediyoruz
        grubu=grubu, pano_no=pano_no, olcu=olcu, toplayan=toplayan,
        baslangic=baslangic, teslim=teslim, notlar=notlar, durumu=durumu
    )
    db.add(yeni_pano)
    log_audit(db, "create_pano", "panolar", actor=current_user, payload={"project_id": project_id, "pano_no": pano_no})
    db.commit()
    return {"mesaj": f"Pano {pano_no} başarıyla kaydedildi!"}

@app.get("/checklist/{project_id}")
def get_checklist(project_id: int, db: Session = Depends(get_db)):
    return db.query(models.ChecklistItem).filter(models.ChecklistItem.project_id == project_id).all()

@app.post("/checklist/guncelle/")
def update_checklist_item(
    item_id: int = Form(...),
    durum: str = Form(...),
    personel: str = Form(...),
    op_id: str = Form(""),
    db: Session = Depends(get_db),
):
    if _is_processed_op(db, op_id):
        return {"mesaj": "İşlem daha önce işlendi (idempotent).", "op_id": op_id}
    item = db.query(models.ChecklistItem).filter(models.ChecklistItem.id == item_id).first()
    if item:
        old_status = item.durum
        item.durum = durum
        item.guncelleyen = personel
        log_audit(db, "update_checklist", "checklist_items", str(item.id), {"durum": durum, "personel": personel})
        append_excel_log(
            db,
            item.project_id,
            "checklist_gecmis",
            "update_checklist",
            personel,
            "Saha",
            "web/mobile",
            f"Madde#{item.id} -> {durum} | {item.madde_metni}",
        )
        if durum in {"Hatalı", "Eksik"} and old_status != durum:
            push_notification(
                db,
                title="Checklist Uyarisi",
                message=f"{personel} kullanicisi checklist maddesini '{durum}' isaretledi: {item.madde_metni}",
                level="danger" if durum == "Hatalı" else "warning",
                entity_type="checklist_items",
                entity_id=str(item.id),
            )
        _mark_processed_op(db, op_id, "/checklist/guncelle/")
        db.commit()
        return {"mesaj": "Madde güncellendi"}
    return {"hata": "Bulunamadı"}


# (backend/main.py dosyasının en altına ekle)

@app.post("/yeni_checklist_maddesi/")
def create_checklist_item(
    project_id: int = Form(1), 
    madde_metni: str = Form(...), 
    kategori: str = Form("Elektrik"),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_SEF))
):
    yeni_madde = models.ChecklistItem(
        project_id=project_id,
        kategori=kategori,
        madde_metni=madde_metni,
        durum="Beklemede"
    )
    db.add(yeni_madde)
    log_audit(db, "create_checklist", "checklist_items", actor=current_user, payload={"project_id": project_id, "kategori": kategori})
    append_excel_log(
        db,
        project_id,
        "checklist_gecmis",
        "create_checklist",
        current_user.get("isim") or current_user.get("kullanici_adi") or "Yonetici",
        current_user.get("rol") or current_user.get("role") or "-",
        "web",
        f"Yeni madde: {madde_metni}",
    )
    db.commit()
    return {"mesaj": "Yeni kontrol maddesi eklendi!"}
# ==============================================================
# 5. AYARLAR - KULLANICI YÖNETİMİ
# ==============================================================
@app.get("/kullanicilar/")
def read_users(db: Session = Depends(get_db), current_user=Depends(require_roles(ROLE_YONETICI, ROLE_MUDUR))):
    return db.query(models.User).all()

@app.get("/atanabilir_kullanicilar/")
def read_assignable_users(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    users = db.query(models.User).all()
    return [
        {
            "id": user.id,
            "kullanici_adi": user.kullanici_adi,
            "full_name": user.full_name,
            "role": user.role,
        }
        for user in users
    ]

@app.post("/kullanici_ekle/")
def create_user(
    kullanici_adi: str = Form(...), sifre: str = Form(...), 
    full_name: str = Form(...), email: str = Form(""), 
    role: str = Form(...), db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI))
):
    yeni = models.User(
        kullanici_adi=kullanici_adi,
        sifre=sifre,
        hashed_password=hash_password(sifre),
        full_name=full_name,
        email=email,
        role=role,
    )
    db.add(yeni)
    log_audit(db, "create_user", "users", actor=current_user, payload={"kullanici_adi": kullanici_adi, "role": role})
    db.commit()
    return {"mesaj": "Personel başarıyla eklendi!"}

@app.post("/kullanici_sil/")
def delete_user(
    user_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI)),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user:
        db.delete(user)
        log_audit(db, "delete_user", "users", str(user.id), actor=current_user)
        db.commit()
        return {"mesaj": "Personel sistemden silindi!"}
    return {"hata": "Personel bulunamadı!"}

# ==============================================================
# 6. AYARLAR - PROJE YÖNETİMİ
# ==============================================================
@app.get("/projeler/")
@app.get("/is_emri_kayitlari/")
def read_projects(yil: int | None = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(models.Project).filter(models.Project.is_deleted != 1)
    if yil:
        query = query.filter(models.Project.yil == yil)
    return query.all()

@app.get("/meta/yillar")
def read_available_years(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    rows = (
        db.query(models.Project.yil)
        .filter(models.Project.yil.isnot(None), models.Project.is_deleted != 1)
        .all()
    )
    years = sorted({int(row[0]) for row in rows if row and row[0]}, reverse=True)
    return {"years": years}


@app.get("/system/maintenance")
def get_maintenance_mode(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_MUDUR)),
):
    return {"maintenance_mode": _maintenance_mode_is_on(db)}


@app.post("/system/maintenance")
def set_maintenance_mode(
    enabled: str = Form(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI)),
):
    normalized = (enabled or "").strip().lower()
    if normalized not in {"on", "off", "true", "false", "1", "0"}:
        return JSONResponse(status_code=400, content={"hata": "enabled değeri geçersiz."})
    state = normalized in {"on", "true", "1"}
    _set_maintenance_mode(db, state, current_user.get("kullanici_adi") or "admin")
    log_audit(
        db,
        "set_maintenance_mode",
        "system_controls",
        "maintenance_mode",
        {"enabled": state},
        actor=current_user,
    )
    db.commit()
    return {"mesaj": f"Bakım modu {'açıldı' if state else 'kapatıldı'}", "maintenance_mode": state}


@app.get("/admin/app-policy")
def get_app_policy(
    platform: str = "all",
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_MUDUR)),
):
    normalized = (platform or "all").strip().lower()
    if normalized == "all":
        rows = db.query(models.AppPolicy).order_by(models.AppPolicy.platform.asc()).all()
        return rows
    if normalized not in POLICY_PLATFORMS:
        return JSONResponse(status_code=400, content={"hata": "platform değeri geçersiz."})
    row = db.query(models.AppPolicy).filter(models.AppPolicy.platform == normalized).first()
    if not row:
        return JSONResponse(status_code=404, content={"hata": "Policy bulunamadı."})
    return row


@app.put("/admin/app-policy")
def update_app_policy(
    platform: str = Form(...),
    min_supported_version: str = Form(...),
    latest_version: str = Form(...),
    force_update: str = Form("false"),
    maintenance_mode: str = Form("false"),
    feature_flags: str = Form("{}"),
    announcement: str = Form(""),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI)),
):
    normalized_platform = (platform or "").strip().lower()
    if normalized_platform not in POLICY_PLATFORMS:
        return JSONResponse(status_code=400, content={"hata": "platform değeri geçersiz."})
    if _version_lt(latest_version, min_supported_version):
        return JSONResponse(
            status_code=400,
            content={"hata": "latest_version, min_supported_version değerinden küçük olamaz."},
        )
    try:
        parsed_flags = json.loads(feature_flags or "{}")
    except json.JSONDecodeError:
        return JSONResponse(status_code=400, content={"hata": "feature_flags geçerli JSON olmalı."})
    if not isinstance(parsed_flags, dict):
        return JSONResponse(status_code=400, content={"hata": "feature_flags JSON object olmalı."})

    row = db.query(models.AppPolicy).filter(models.AppPolicy.platform == normalized_platform).first()
    if not row:
        row = models.AppPolicy(platform=normalized_platform)
        db.add(row)
        db.flush()

    snapshot = models.AppPolicySnapshot(
        platform=row.platform,
        min_supported_version=row.min_supported_version or "0.0.0",
        latest_version=row.latest_version or "1.0.0",
        force_update=row.force_update or 0,
        maintenance_mode=row.maintenance_mode or 0,
        feature_flags=row.feature_flags or "{}",
        announcement=row.announcement,
        changed_by=current_user.get("kullanici_adi") or "admin",
    )
    db.add(snapshot)
    old_snapshot_ids = (
        db.query(models.AppPolicySnapshot.id)
        .filter(models.AppPolicySnapshot.platform == normalized_platform)
        .order_by(models.AppPolicySnapshot.id.desc())
        .offset(20)
        .all()
    )
    if old_snapshot_ids:
        ids = [row[0] for row in old_snapshot_ids]
        db.query(models.AppPolicySnapshot).filter(models.AppPolicySnapshot.id.in_(ids)).delete(synchronize_session=False)

    row.min_supported_version = min_supported_version.strip()
    row.latest_version = latest_version.strip()
    row.force_update = 1 if (force_update or "").strip().lower() in {"true", "1", "on"} else 0
    row.maintenance_mode = 1 if (maintenance_mode or "").strip().lower() in {"true", "1", "on"} else 0
    row.feature_flags = json.dumps(parsed_flags, ensure_ascii=False)
    row.announcement = announcement.strip() or None
    row.updated_at = datetime.now().strftime("%d.%m.%Y %H:%M")
    row.updated_by = current_user.get("kullanici_adi") or "admin"

    log_audit(
        db,
        "update_app_policy",
        "app_policies",
        normalized_platform,
        payload={
            "min_supported_version": row.min_supported_version,
            "latest_version": row.latest_version,
            "force_update": bool(row.force_update),
            "maintenance_mode": bool(row.maintenance_mode),
            "feature_flags": parsed_flags,
        },
        actor=current_user,
    )
    db.commit()
    return {"mesaj": "Policy güncellendi.", "platform": normalized_platform}


@app.post("/admin/app-policy/rollback")
def rollback_app_policy(
    platform: str = Form(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI)),
):
    normalized_platform = (platform or "").strip().lower()
    if normalized_platform not in POLICY_PLATFORMS:
        return JSONResponse(status_code=400, content={"hata": "platform değeri geçersiz."})
    last_snapshot = (
        db.query(models.AppPolicySnapshot)
        .filter(models.AppPolicySnapshot.platform == normalized_platform)
        .order_by(models.AppPolicySnapshot.id.desc())
        .first()
    )
    if not last_snapshot:
        return JSONResponse(status_code=404, content={"hata": "Rollback için snapshot bulunamadı."})
    row = db.query(models.AppPolicy).filter(models.AppPolicy.platform == normalized_platform).first()
    if not row:
        return JSONResponse(status_code=404, content={"hata": "Policy kaydı bulunamadı."})
    row.min_supported_version = last_snapshot.min_supported_version
    row.latest_version = last_snapshot.latest_version
    row.force_update = last_snapshot.force_update
    row.maintenance_mode = last_snapshot.maintenance_mode
    row.feature_flags = last_snapshot.feature_flags
    row.announcement = last_snapshot.announcement
    row.updated_at = datetime.now().strftime("%d.%m.%Y %H:%M")
    row.updated_by = current_user.get("kullanici_adi") or "admin"
    db.delete(last_snapshot)
    log_audit(
        db,
        "rollback_app_policy",
        "app_policies",
        normalized_platform,
        payload={"rolled_back_to_snapshot_id": last_snapshot.id},
        actor=current_user,
    )
    db.commit()
    return {"mesaj": "Policy geri alindi.", "platform": normalized_platform}


@app.get("/client/bootstrap")
def get_client_bootstrap(
    platform: str = "web",
    app_version: str = "",
    db: Session = Depends(get_db),
):
    policy = _effective_policy(db, platform)
    update_level = _compute_update_level(policy, app_version)
    print(
        f"[bootstrap] platform={platform} app_version={app_version or '-'} "
        f"update_level={update_level} maintenance={policy.get('maintenance_mode')}"
    )
    return {
        "platform": platform,
        "app_version": app_version or None,
        "policy": policy,
        "update_level": update_level,
    }

@app.post("/proje_ekle/")
@app.post("/is_emri_ekle/")
def create_project(
    kod: str = Form(...), name: str = Form(...), 
    gruplar: str = Form(""), yonetici: str = Form(""), yil: int = Form(datetime.now().year),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_SEF))
):
    try:
        yeni = models.Project(kod=kod, name=name, gruplar=gruplar, yonetici=yonetici, yil=yil, durum="Aktif")
        db.add(yeni)
        db.flush()
        sync_project_work_order(db, yeni)
        log_audit(db, "create_project", "projects", actor=current_user, payload={"kod": kod, "name": name})
        append_excel_log(
            db,
            yeni.id,
            "is_emri_hareketleri",
            "create_project",
            current_user.get("isim") or current_user.get("kullanici_adi") or "Yonetici",
            current_user.get("rol") or current_user.get("role") or "-",
            "web",
            f"Proje acildi: {kod} - {name}",
        )
        db.commit()
        return {"mesaj": "Yeni proje oluşturuldu. İş emri otomatik açıldı."}
    except IntegrityError:
        db.rollback()
        return JSONResponse(status_code=400, content={"hata": "Bu iş emri kodu zaten kayıtlı. Farklı kod girin."})

@app.post("/proje_durum_guncelle/")
@app.post("/is_emri_kart_durum_guncelle/")
def update_project_status(
    project_id: int = Form(...),
    durum: str = Form(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_SEF)),
):
    proj = db.query(models.Project).filter(models.Project.id == project_id).first()
    if proj:
        proj.durum = durum
        sync_project_work_order(db, proj)
        log_audit(db, "update_project_status", "projects", str(proj.id), {"durum": durum}, actor=current_user)
        append_excel_log(
            db,
            proj.id,
            "is_emri_hareketleri",
            "update_project_status",
            current_user.get("isim") or current_user.get("kullanici_adi") or "Yonetici",
            current_user.get("rol") or current_user.get("role") or "-",
            "web",
            f"Proje durumu: {durum}",
        )
        db.commit()
        return {"mesaj": "Proje durumu güncellendi!"}
    return {"hata": "Proje bulunamadı!"}


@app.post("/proje_detay_guncelle/")
@app.post("/is_emri_detay_guncelle/")
def update_project_details(
    project_id: int = Form(...),
    yonetici: str = Form(""),
    gruplar: str = Form(""),
    name: str = Form(""),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_SEF)),
):
    proj = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not proj:
        return {"hata": "Proje bulunamadı!"}

    payload = {}
    if yonetici.strip():
        proj.yonetici = yonetici.strip()
        payload["yonetici"] = proj.yonetici
    if gruplar.strip():
        proj.gruplar = gruplar.strip()
        payload["gruplar"] = proj.gruplar
    if name.strip():
        proj.name = name.strip()
        payload["name"] = proj.name

    if not payload:
        return {"hata": "Güncellenecek alan gönderilmedi."}

    sync_project_work_order(db, proj)
    log_audit(db, "update_project_details", "projects", str(proj.id), payload, actor=current_user)
    db.commit()
    return {"mesaj": "Proje bilgileri güncellendi!"}


@app.post("/proje_soft_sil/")
def soft_delete_project(
    project_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI)),
):
    proj = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not proj:
        return JSONResponse(status_code=404, content={"hata": "Proje bulunamadı"})
    proj.is_deleted = 1
    proj.deleted_at = datetime.now().strftime("%d.%m.%Y %H:%M")
    proj.deleted_by = current_user.get("kullanici_adi") or current_user.get("isim") or "Yonetici"
    log_audit(
        db,
        "soft_delete_project",
        "projects",
        str(project_id),
        {"deleted_by": proj.deleted_by},
        actor=current_user,
    )
    db.commit()
    return {"mesaj": "Proje arşive alındı (soft delete)."}


@app.post("/proje_geri_al/")
def restore_soft_deleted_project(
    project_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI)),
):
    proj = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not proj:
        return JSONResponse(status_code=404, content={"hata": "Proje bulunamadı"})
    proj.is_deleted = 0
    proj.deleted_at = None
    proj.deleted_by = None
    log_audit(db, "restore_project", "projects", str(project_id), actor=current_user)
    db.commit()
    return {"mesaj": "Proje geri alındı."}


@app.post("/proje_kalici_silme_baslat/")
def initiate_hard_delete_project(
    project_id: int = Form(...),
    reason: str = Form(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI)),
):
    proj = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not proj:
        return JSONResponse(status_code=404, content={"hata": "Proje bulunamadı"})
    token = uuid4().hex[:8].upper()
    phrase = "PROJEYI SIL"
    DELETE_TOKENS[token] = {
        "project_id": project_id,
        "reason": reason,
        "created_at_ts": _now_ts(),
        "actor_id": current_user.get("id"),
    }
    log_audit(
        db,
        "initiate_hard_delete_project",
        "projects",
        str(project_id),
        {"reason": reason, "token": token},
        actor=current_user,
    )
    db.commit()
    return {
        "mesaj": "Kalıcı silme başlatıldı. Onay için ikinci adımı tamamlayın.",
        "delete_token": token,
        "confirm_phrase": phrase,
        "expires_in_seconds": DELETE_TOKEN_TTL_SECONDS,
    }


@app.post("/proje_kalici_sil_onay/")
def confirm_hard_delete_project(
    project_id: int = Form(...),
    delete_token: str = Form(...),
    confirm_phrase: str = Form(...),
    admin_password: str = Form(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI)),
):
    token_data = DELETE_TOKENS.get(delete_token)
    if not token_data:
        return JSONResponse(status_code=400, content={"hata": "Silme token geçersiz."})
    if token_data.get("project_id") != project_id:
        return JSONResponse(status_code=400, content={"hata": "Token proje ile eşleşmiyor."})
    if _now_ts() - int(token_data.get("created_at_ts", 0)) > DELETE_TOKEN_TTL_SECONDS:
        DELETE_TOKENS.pop(delete_token, None)
        return JSONResponse(status_code=400, content={"hata": "Silme token süresi doldu."})
    if (confirm_phrase or "").strip().upper() != "PROJEYI SIL":
        return JSONResponse(status_code=400, content={"hata": "Onay metni hatalı."})

    actor_user = db.query(models.User).filter(models.User.id == current_user.get("id")).first()
    if not actor_user or not (
        verify_password(admin_password, actor_user.hashed_password) or verify_password(admin_password, actor_user.sifre)
    ):
        return JSONResponse(status_code=401, content={"hata": "Yönetici şifresi doğrulanamadı."})

    proj = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not proj:
        return JSONResponse(status_code=404, content={"hata": "Proje bulunamadı"})

    db.query(models.WorkOrder).filter(models.WorkOrder.project_id == project_id).delete(synchronize_session=False)
    db.query(models.Pano).filter(models.Pano.project_id == project_id).delete(synchronize_session=False)
    db.query(models.ChecklistItem).filter(models.ChecklistItem.project_id == project_id).delete(synchronize_session=False)
    db.query(models.Photo).filter(models.Photo.project_id == project_id).delete(synchronize_session=False)
    db.delete(proj)
    DELETE_TOKENS.pop(delete_token, None)
    log_audit(
        db,
        "hard_delete_project",
        "projects",
        str(project_id),
        {"reason": token_data.get("reason")},
        actor=current_user,
    )
    db.commit()
    return {"mesaj": "Proje ve ilişkili kayıtlar kalıcı olarak silindi."}

# ==============================================================
# 7. FOTO GALERİ YÖNETİMİ
# ==============================================================
@app.get("/galeri/{project_id}")
def get_gallery(project_id: int, db: Session = Depends(get_db)):
    photos = db.query(models.Photo).filter(models.Photo.project_id == project_id).all()
    return [
        {
            "id": photo.id,
            "project_id": photo.project_id,
            "file_path": photo.file_path,
            "yukleyen": photo.yukleyen,
            "tarih": photo.tarih,
            "notlar": phase_from_photo_path(photo.file_path),
            "faz": phase_from_photo_path(photo.file_path),
        }
        for photo in photos
    ]

@app.post("/foto_yukle/")
async def upload_photo(
    project_id: int = Form(...), 
    yukleyen: str = Form(...), 
    mevcut_faz: str = Form("İç Montaj"),
    file: UploadFile = File(...), 
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_SEF, ROLE_SAHA))
):
    mevcut_faz = normalize_phase(mevcut_faz)
    if mevcut_faz not in VALID_PHASES:
        return {"hata": "Geçersiz faz. İç Montaj veya Dış Montaj seçin."}
    yil, proje_klasor = _project_folder_info(db, project_id)
    file_path = _save_upload_file(
        file,
        folder_parts=["projeler", yil, proje_klasor, phase_token(mevcut_faz)],
        filename_prefix="galeri_",
    )
    
    # Veritabanına yolunu yaz
    yeni_foto = models.Photo(project_id=project_id, file_path=file_path, yukleyen=yukleyen)
    db.add(yeni_foto)
    log_audit(db, "upload_photo", "photos", actor=current_user, payload={"project_id": project_id, "file_path": file_path, "faz": mevcut_faz})
    db.commit()
    
    return {"mesaj": "Fotoğraf başarıyla eklendi!"}

@app.post("/foto_sil/")
def delete_photo(
    foto_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_SEF)),
):
    foto = db.query(models.Photo).filter(models.Photo.id == foto_id).first()
    if foto:
        # 1. Fiziksel dosyayı bilgisayardan (uploads klasöründen) kalıcı sil
        try:
            if os.path.exists(foto.file_path):
                os.remove(foto.file_path)
        except Exception as e:
            pass # Dosya zaten silinmişse veya bulunamazsa hata vermeden geç
        
        # 2. Veritabanı kaydını sil
        db.delete(foto)
        log_audit(db, "delete_photo", "photos", str(foto.id), actor=current_user)
        db.commit()
        return {"mesaj": "Fotoğraf kalıcı olarak silindi!"}
    return {"hata": "Fotoğraf bulunamadı!"}

# ==============================================================
# 8. FABRİKA BAKIM (MAINTENANCE) YÖNETİMİ
# ==============================================================
@app.get("/bakimlar/")
def get_maintenances(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(models.Maintenance).all()

@app.post("/bakim_ekle/")
def create_maintenance(
    makine_kodu: str = Form(...), kisim: str = Form(...), 
    islem: str = Form(...), oncelik: str = Form(...), 
    personel: str = Form(...), db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_SEF, ROLE_SAHA))
):
    yeni_bakim = models.Maintenance(
        makine_kodu=makine_kodu, kisim=kisim, islem=islem, 
        oncelik=oncelik, personel=personel, durum="Açık"
    )
    db.add(yeni_bakim)
    log_audit(db, "create_maintenance", "maintenances", actor=current_user, payload={"makine_kodu": makine_kodu, "oncelik": oncelik})
    append_excel_log(
        db,
        None,
        "bakim_kayitlari",
        "create_maintenance",
        personel,
        current_user.get("rol") or current_user.get("role") or "-",
        "web/mobile",
        f"{makine_kodu} | {kisim} | {islem} | oncelik={oncelik}",
    )
    db.commit()
    return {"mesaj": "Arıza başarıyla bildirildi!"}

@app.post("/bakim_guncelle/")
def update_maintenance(
    bakim_id: int = Form(...), durum: str = Form(...), 
    notlar: str = Form(""), db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_SEF, ROLE_SAHA)),
):
    bakim = db.query(models.Maintenance).filter(models.Maintenance.id == bakim_id).first()
    if bakim:
        bakim.durum = durum
        if notlar:
            bakim.notlar = notlar
        log_audit(db, "update_maintenance", "maintenances", str(bakim.id), {"durum": durum}, actor=current_user)
        append_excel_log(
            db,
            None,
            "bakim_kayitlari",
            "update_maintenance",
            current_user.get("isim") or current_user.get("kullanici_adi") or "-",
            current_user.get("rol") or current_user.get("role") or "-",
            "web/mobile",
            f"Bakim#{bakim.id} durum={durum} not={notlar or '-'}",
        )
        db.commit()
        return {"mesaj": "Bakım durumu güncellendi!"}
    return {"hata": "Kayıt bulunamadı!"}

@app.post("/bakim_foto_yukle/")
async def upload_maintenance_photo(
    bakim_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_SEF, ROLE_SAHA)),
):
    bakim = db.query(models.Maintenance).filter(models.Maintenance.id == bakim_id).first()
    if not bakim: return {"hata": "Kayıt yok!"}

    file_path = _save_upload_file(
        file,
        folder_parts=["bakim", str(datetime.now().year), f"bakim_{bakim_id}"],
        filename_prefix="bakim_",
    )
        
    bakim.foto_url = file_path
    log_audit(db, "upload_maintenance_photo", "maintenances", str(bakim.id), {"foto_url": file_path}, actor=current_user)
    db.commit()
    return {"mesaj": "Arıza fotoğrafı eklendi!"}

# ==============================================================
# 9. ARŞİV VE RAPORLAMA (GEÇMİŞ PROJELER İÇİN)
# ==============================================================
@app.get("/proje_ozeti/{project_id}")
@app.get("/is_emri_ozeti/{project_id}")
def get_project_summary(project_id: int, db: Session = Depends(get_db)):
    # İlgili projeye ait tüm verileri topla
    is_emirleri = db.query(models.WorkOrder).filter(models.WorkOrder.project_id == project_id).all()
    panolar = db.query(models.Pano).filter(models.Pano.project_id == project_id).all()
    checklist = db.query(models.ChecklistItem).filter(models.ChecklistItem.project_id == project_id).all()
    fotolar = db.query(models.Photo).filter(models.Photo.project_id == project_id).all()
    
    # Matematiksel özetleri çıkarıp React'e gönder
    return {
        "is_emri_toplam": len(is_emirleri),
        "is_emri_tamamlanan": len([i for i in is_emirleri if i.durum == "Tamamlandı"]),
        "pano_toplam": len(panolar),
        "pano_tamamlanan": len([p for p in panolar if p.durumu == "Tamamlandı"]),
        "checklist_toplam": len(checklist),
        "checklist_tamamlanan": len([c for c in checklist if c.durum == "Tamamlandı"]),
        "foto_sayisi": len(fotolar)
    }

# ==============================================================
# 10. İLETİŞİM MOTORU (MAIL GÖNDERİMİ)
# ==============================================================
@app.post("/mail_gonder/")
def send_project_mail(
    alici_mail: str = Form(...), 
    konu: str = Form(...), 
    mesaj_govdesi: str = Form(...),
    db: Session = Depends(get_db)
):
    # NOT: Gerçek bir gönderim için buraya kendi Gmail/Outlook SMTP ayarlarını girmelisin.
    # Şimdilik simülasyon olarak terminale basıyoruz:
    print(f"MAİL GÖNDERİLİYOR -> Alıcı: {alici_mail} | Konu: {konu}")
    
    # Gerçek kod yapısı (Yorum satırını açıp ayarlarını girebilirsin):
    """
    sender_email = "senin_mailin@gmail.com"
    password = "uygulama_sifren"
    
    msg = MIMEMultipart()
    msg['From'] = sender_email
    msg['To'] = alici_mail
    msg['Subject'] = konu
    msg.attach(MIMEText(mesaj_govdesi, 'plain'))
    
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(sender_email, password)
        server.send_message(msg)
    """
    return {"mesaj": f"Rapor {alici_mail} adresine başarıyla iletildi!"}

@app.post("/checklist_sil/")
def delete_checklist_item(item_id: int = Form(...), db: Session = Depends(get_db)):
    item = db.query(models.ChecklistItem).filter(models.ChecklistItem.id == item_id).first()
    if item:
        project_id = item.project_id
        madde = item.madde_metni
        db.delete(item)
        log_audit(db, "delete_checklist", "checklist_items", str(item.id))
        append_excel_log(
            db,
            project_id,
            "checklist_gecmis",
            "delete_checklist",
            "-",
            "-",
            "web",
            f"Silinen madde#{item_id}: {madde}",
        )
        db.commit()
        return {"mesaj": "Madde başarıyla silindi!"}
    return {"hata": "Madde bulunamadı!"}

# ==============================================================
# 11. PROJE FAZ (AŞAMA) VE İŞ EMRİ GÜNCELLEME
# ==============================================================
@app.post("/is_emri_durum_guncelle/")
def update_work_order_status(
    is_emri_id: int = Form(...), 
    status: str = Form(...), 
    personel_adi: str = Form(...), 
    notlar: str = Form(...),
    mevcut_faz: str = Form("İç Montaj"), # Yeni eklendi (Varsayılan İç Montaj)
    atanan_kisi: str = Form(""),
    termin_tarihi: str = Form(""),
    oncelik: str = Form(""),
    op_id: str = Form(""),
    db: Session = Depends(get_db)
):
    if _is_processed_op(db, op_id):
        return {"mesaj": "İşlem daha önce işlendi (idempotent).", "op_id": op_id}
    is_emri = db.query(models.WorkOrder).filter(models.WorkOrder.id == is_emri_id).first()
    mevcut_faz = normalize_phase(mevcut_faz)
    if mevcut_faz not in VALID_PHASES:
        return {"hata": "Geçersiz faz. Sadece İç Montaj veya Dış Montaj kullanılabilir."}
    if is_emri:
        onceki_durum = is_emri.durum or "Beklemede"
        izinli_gecisler = VALID_WORKORDER_STATUS_FLOW.get(onceki_durum, set())
        if status != onceki_durum and status not in izinli_gecisler:
            return {"hata": f"Durum geçişi geçersiz: {onceki_durum} -> {status}"}
        is_emri.durum = status
        is_emri.montajci = personel_adi
        if atanan_kisi:
            is_emri.atanan_kisi = atanan_kisi
        if termin_tarihi:
            is_emri.termin_tarihi = termin_tarihi
        if oncelik:
            is_emri.oncelik = oncelik
        # Notun en başına köşeli parantezle [Dış Montaj] gibi mühür basıyoruz:
        is_emri.notlar = f"[{mevcut_faz}] {notlar}" if notlar != "-" else f"[{mevcut_faz}]"
        is_emri.tarih = datetime.now().strftime("%d.%m.%Y %H:%M")
        log_audit(
            db,
            "update_work_order",
            "work_orders",
            str(is_emri.id),
            {
                "durum": status,
                "atanan_kisi": is_emri.atanan_kisi,
                "termin_tarihi": is_emri.termin_tarihi,
                "oncelik": is_emri.oncelik,
            },
            actor={"id": None, "rol": "Saha"},
        )
        append_excel_log(
            db,
            is_emri.project_id,
            "is_emri_hareketleri",
            "update_work_order",
            personel_adi,
            "Saha",
            "web/mobile",
            f"IsEmri#{is_emri.id} durum={status} oncelik={is_emri.oncelik} atanan={is_emri.atanan_kisi or '-'}",
        )
        if status in {"Hatalı", "Eksik"} and onceki_durum != status:
            push_notification(
                db,
                title="Is Emri Uyarisi",
                message=f"{personel_adi} kullanicisi IsEmri#{is_emri.id} kaydini '{status}' durumuna cekti.",
                level="danger" if status == "Hatalı" else "warning",
                entity_type="work_orders",
                entity_id=str(is_emri.id),
            )
        _mark_processed_op(db, op_id, "/is_emri_durum_guncelle/")
        db.commit()
        return {"mesaj": "İşlem kaydedildi."}
    return {"hata": "Kayıt bulunamadı."}

# 2. PROJE FAZI DEĞİŞTİRME MOTORU
@app.post("/proje_faz_guncelle/")
def update_project_phase(
    proje_id: int = Form(...), 
    yeni_faz: str = Form(...), 
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_SEF))
):
    yeni_faz = normalize_phase(yeni_faz)
    if yeni_faz not in VALID_PHASES:
        return {"hata": "Geçersiz faz. Sadece İç Montaj veya Dış Montaj seçilebilir."}
    proje = db.query(models.Project).filter(models.Project.id == proje_id).first()
    if proje:
        proje.durum = yeni_faz
        log_audit(db, "update_project_phase", "projects", str(proje.id), {"yeni_faz": yeni_faz}, actor=current_user)
        db.commit()
        return {"mesaj": f"Proje '{yeni_faz}' aşamasına alındı!"}
    return {"hata": "Proje bulunamadı"}

# ==============================================================
# 12. ACİL DURUM (SOS) VE BİLDİRİM MOTORU
# ==============================================================
@app.post("/acil_durum_bildir/")
def send_sos_alert(
    proje_bilgisi: str = Form(...),
    hata_detayi: str = Form(...),
    alici_mail: str = Form(...),
    gonderen: str = Form(...)
):
    # NOT: Gerçek e-posta gönderimi için SMTP ayarlarını (önceki derslerdeki gibi) buraya bağlayabilirsin.
    # Şimdilik sistemin çalıştığını görmek için terminale kırmızı alarm basıyoruz:
    
    print("="*50)
    print(f"🚨 ACİL DURUM ALARMI! 🚨")
    print(f"Proje: {proje_bilgisi}")
    print(f"Gönderen: {gonderen}")
    print(f"Alıcı: {alici_mail}")
    print(f"Hata Detayı: {hata_detayi}")
    print("="*50)
    
    return {"mesaj": "Acil durum e-postası ilgili kişiye başarıyla iletildi!"}


# ==============================================================
# 13. VERİTABANI BAĞLANTILI GÜVENLİ GİRİŞ (USER TABLOSU)
# ==============================================================
@app.post("/mobil_giris/")
def mobil_login(
    kullanici_adi: str = Form(""), 
    sifre: str = Form(...), 
    calisma_alani: str = Form("İç Montaj"),
    db: Session = Depends(get_db)
):
    calisma_alani = normalize_phase(calisma_alani)
    if calisma_alani not in VALID_PHASES:
        return JSONResponse(
            status_code=400,
            content={"hata": "Geçersiz çalışma alanı. İç Montaj veya Dış Montaj seçin."}
        )

    print(f"Saha Giriş Denemesi -> Kullanıcı: {kullanici_adi or '[şifre ile]'} | Alan: {calisma_alani}")

    # Yeni akış: kullanıcı adı girilmezse şifreye göre kullanıcıyı bul.
    if kullanici_adi:
        user = db.query(models.User).filter(
            (models.User.kullanici_adi == kullanici_adi) | (models.User.full_name == kullanici_adi)
        ).first()
    else:
        user = db.query(models.User).filter(
            (models.User.hashed_password == hash_password(sifre)) | (models.User.sifre == sifre)
        ).first()

    if not user:
        return JSONResponse(
            status_code=401, 
            content={"hata": "Giriş bilgileri hatalı!"}
        )

    if not (verify_password(sifre, user.hashed_password) or verify_password(sifre, user.sifre)):
        return JSONResponse(
            status_code=401, 
            content={"hata": "Girdiğiniz şifre hatalı!"}
        )

    print(f"GİRİŞ BAŞARILI: {user.full_name}")

    return {
        **_build_auth_response(user),
        "mesaj": "Giriş Başarılı",
        "yetki": user.role,
        "calisma_alani": calisma_alani,
    }

# ==============================================================
# 14. YENİ SAHA LOGU (EKRAN GÖRÜNTÜSÜ MANTIĞI)
# ==============================================================
@app.post("/yeni_saha_logu/")
def create_field_log(
    proje_id: str = Form(...),
    personel: str = Form(...),
    grup: str = Form(...),
    islem: str = Form(...),
    durum: str = Form(...),
    notlar: str = Form(...),
    faz: str = Form(...),
    op_id: str = Form(""),
    file: UploadFile = File(None), # Fotoğraf opsiyonel
    db: Session = Depends(get_db)
):
    if _is_processed_op(db, op_id):
        return {"mesaj": "İşlem daha önce işlendi (idempotent).", "op_id": op_id}
    faz = normalize_phase(faz)
    if faz not in VALID_PHASES:
        return {"hata": "Geçersiz faz. İç Montaj veya Dış Montaj seçin."}
    print(f"--- YENİ SAHA LOGU GELDİ ---")
    print(f"Proje: {proje_id} | Personel: {personel} | İşlem: {islem} | Durum: {durum}")
    
    # 1. İş Emri (Log) Veritabanına Kaydedilir
    # (Eğer tablonda bu kolonlar varsa, burayı ona göre açabilirsin)
    yeni_log = models.WorkOrder(
        project_id=proje_id,
        bolum=faz,
        grup=grup,
        islem=islem,
        durum=durum,
        montajci=personel,
        atanan_kisi=personel,
        kayit_kaynagi="Saha",
        notlar=f"[SAHA] {notlar}" if notlar else "[SAHA]",
        tarih=datetime.now().strftime("%d.%m.%Y %H:%M")
    )
    db.add(yeni_log)
    log_audit(db, "create_field_log", "work_orders", actor={"id": None, "rol": "Saha"}, payload={"proje_id": proje_id, "faz": faz, "islem": islem})
    append_excel_log(
        db,
        int(proje_id),
        "saha_loglari",
        "create_field_log",
        personel,
        "Saha",
        "mobile",
        f"{grup} | {islem} | durum={durum} | faz={faz}",
    )
    _mark_processed_op(db, op_id, "/yeni_saha_logu/")
    db.commit()

    # 2. Eğer fotoğraf da yüklendiyse onu da kaydet
    if file:
        yil, proje_klasor = _project_folder_info(db, int(proje_id))
        file_path = _save_upload_file(
            file,
            folder_parts=["saha_loglari", yil, proje_klasor, phase_token(faz)],
            filename_prefix="log_",
        )
        
        new_photo = models.Photo(
            project_id=proje_id,
            file_path=file_path,
            yukleyen=personel,
            tarih=datetime.now().strftime("%d.%m.%Y %H:%M")
        )
        db.add(new_photo)
        log_audit(db, "create_field_photo", "photos", payload={"project_id": proje_id, "file_path": file_path, "faz": faz})
        db.commit()

    return {"mesaj": "Saha logu başarıyla kaydedildi!"}


@app.get("/raporlar/kpi")
def get_kpi_dashboard(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_SEF, ROLE_MUDUR)),
):
    projects = db.query(models.Project).filter(models.Project.is_deleted != 1).all()
    work_orders = (
        db.query(models.WorkOrder)
        .join(models.Project, models.Project.id == models.WorkOrder.project_id, isouter=True)
        .filter((models.Project.id.is_(None)) | (models.Project.is_deleted != 1))
        .all()
    )
    maintenance = db.query(models.Maintenance).all()

    return {
        "proje_toplam": len(projects),
        "aktif_proje": len([p for p in projects if p.durum != "Tamamlandı"]),
        "tamamlanan_proje": len([p for p in projects if p.durum == "Tamamlandı"]),
        "is_emri_toplam": len(work_orders),
        "is_emri_tamamlanan": len([w for w in work_orders if w.durum == "Tamamlandı"]),
        "is_emri_aktif": len([w for w in work_orders if w.durum != "Tamamlandı"]),
        "bakim_toplam": len(maintenance),
        "bakim_acik": len([b for b in maintenance if b.durum != "Çözüldü"]),
        "bakim_cozuldu": len([b for b in maintenance if b.durum == "Çözüldü"]),
    }


@app.get("/raporlar/audit")
def get_audit_logs(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_SEF, ROLE_MUDUR)),
):
    logs = db.query(models.AuditLog).order_by(models.AuditLog.id.desc()).limit(limit).all()
    return logs


@app.get("/yonetim/bildirimler")
def get_management_notifications(
    limit: int = 50,
    only_unread: int = 0,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_MUDUR, ROLE_SEF)),
):
    query = db.query(models.Notification).order_by(models.Notification.id.desc())
    if only_unread == 1:
        query = query.filter(models.Notification.is_read == 0)
    return query.limit(limit).all()


@app.post("/yonetim/bildirim/{notification_id}/okundu")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_MUDUR, ROLE_SEF)),
):
    row = db.query(models.Notification).filter(models.Notification.id == notification_id).first()
    if not row:
        return JSONResponse(status_code=404, content={"hata": "Bildirim bulunamadi."})
    row.is_read = 1
    db.commit()
    return {"mesaj": "Bildirim okundu olarak isaretlendi."}


@app.post("/yonetim/bildirimler/okundu-tumu")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_MUDUR, ROLE_SEF)),
):
    db.query(models.Notification).filter(models.Notification.is_read == 0).update(
        {"is_read": 1},
        synchronize_session=False,
    )
    db.commit()
    return {"mesaj": "Tum bildirimler okundu yapildi."}


@app.get("/excel-arsiv/{project_id}")
def download_project_excel_archive(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(ROLE_YONETICI, ROLE_SEF, ROLE_MUDUR)),
):
    file_path = get_project_excel_path(db, project_id)
    if not os.path.exists(file_path):
        return JSONResponse(status_code=404, content={"hata": "Bu proje icin excel arsiv henuz olusmamis."})
    return FileResponse(
        path=file_path,
        filename=os.path.basename(file_path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


