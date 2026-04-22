import argparse
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database import SessionLocal  # noqa: E402
import models  # noqa: E402


UPLOAD_ROOT = ROOT / "uploads"


def safe_slug(value: str, fallback: str = "genel") -> str:
    raw = (value or "").strip().lower()
    cleaned = "".join(ch if ch.isalnum() else "_" for ch in raw).strip("_")
    return cleaned or fallback


def infer_phase_from_path(path: str) -> str:
    p = (path or "").lower()
    if "ic_montaj" in p:
        return "ic_montaj"
    if "dis_montaj" in p:
        return "dis_montaj"
    return "genel"


def ext_or_bin(path: str) -> str:
    ext = Path(path).suffix.lower()
    return ext if ext else ".bin"


def project_folder_info(db, project_id: int | None):
    if not project_id:
        return str(datetime.now().year), "proje_bilinmiyor"
    project = db.query(models.Project).filter(models.Project.id == int(project_id)).first()
    year = str(project.yil) if project and project.yil else str(datetime.now().year)
    code_or_id = project.kod if project and project.kod else f"proje_{project_id}"
    return year, safe_slug(code_or_id, f"proje_{project_id}")


def maintenance_year(maintenance) -> str:
    raw = (maintenance.tarih or "").strip()
    m = re.match(r"^(\d{2})\.(\d{2})\.(\d{4})", raw)
    if m:
        return m.group(3)
    return str(datetime.now().year)


def ensure_under_uploads(path_value: str) -> Path:
    p = Path(path_value)
    if not p.is_absolute():
        p = ROOT / p
    return p


def migrate(apply: bool):
    db = SessionLocal()
    moved_photos = 0
    moved_maintenance = 0
    skipped = 0
    try:
        photos = db.query(models.Photo).all()
        maints = db.query(models.Maintenance).filter(models.Maintenance.foto_url.isnot(None)).all()

        print(f"Photo rows: {len(photos)}")
        print(f"Maintenance rows with photo: {len(maints)}")

        for photo in photos:
            old_abs = ensure_under_uploads(photo.file_path or "")
            if not old_abs.exists():
                skipped += 1
                continue
            year, proj_folder = project_folder_info(db, photo.project_id)
            phase = infer_phase_from_path(photo.file_path or "")
            stem = safe_slug(Path(photo.file_path or "foto").stem, "foto")
            new_rel = Path("uploads") / "projeler" / year / proj_folder / phase / f"{stem}{ext_or_bin(str(old_abs))}"
            new_abs = ROOT / new_rel
            if old_abs.resolve() == new_abs.resolve():
                continue
            if apply:
                new_abs.parent.mkdir(parents=True, exist_ok=True)
                if new_abs.exists():
                    uniq = datetime.now().strftime("%Y%m%d%H%M%S%f")
                    new_abs = new_abs.with_stem(f"{new_abs.stem}_{uniq}")
                    new_rel = Path("uploads") / new_abs.relative_to(UPLOAD_ROOT)
                shutil.move(str(old_abs), str(new_abs))
                photo.file_path = str(new_rel).replace("\\", "/")
            moved_photos += 1

        for m in maints:
            old_abs = ensure_under_uploads(m.foto_url or "")
            if not old_abs.exists():
                skipped += 1
                continue
            year = maintenance_year(m)
            stem = safe_slug(Path(m.foto_url or f"bakim_{m.id}").stem, f"bakim_{m.id}")
            new_rel = Path("uploads") / "bakim" / year / f"bakim_{m.id}" / f"{stem}{ext_or_bin(str(old_abs))}"
            new_abs = ROOT / new_rel
            if old_abs.resolve() == new_abs.resolve():
                continue
            if apply:
                new_abs.parent.mkdir(parents=True, exist_ok=True)
                if new_abs.exists():
                    uniq = datetime.now().strftime("%Y%m%d%H%M%S%f")
                    new_abs = new_abs.with_stem(f"{new_abs.stem}_{uniq}")
                    new_rel = Path("uploads") / new_abs.relative_to(UPLOAD_ROOT)
                shutil.move(str(old_abs), str(new_abs))
                m.foto_url = str(new_rel).replace("\\", "/")
            moved_maintenance += 1

        if apply:
            db.commit()
        else:
            db.rollback()

        print(f"Moved photo records: {moved_photos}")
        print(f"Moved maintenance records: {moved_maintenance}")
        print(f"Skipped missing files: {skipped}")
        print("Mode:", "APPLY" if apply else "DRY-RUN")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate photo paths to project/year based folders.")
    parser.add_argument("--apply", action="store_true", help="Apply changes. Without this flag, runs dry-run.")
    args = parser.parse_args()
    migrate(apply=args.apply)
