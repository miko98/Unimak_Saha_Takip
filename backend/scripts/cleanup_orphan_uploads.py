import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database import SessionLocal  # noqa: E402
import models  # noqa: E402


UPLOAD_ROOT = ROOT / "uploads"


def db_referenced_files():
    db = SessionLocal()
    refs = set()
    try:
        for p in db.query(models.Photo).all():
            if p.file_path:
                refs.add((ROOT / p.file_path).resolve())
        for m in db.query(models.Maintenance).all():
            if m.foto_url:
                refs.add((ROOT / m.foto_url).resolve())
    finally:
        db.close()
    return refs


def disk_files():
    if not UPLOAD_ROOT.exists():
        return []
    return [p.resolve() for p in UPLOAD_ROOT.rglob("*") if p.is_file()]


def run_cleanup(apply: bool):
    refs = db_referenced_files()
    files = disk_files()
    orphans = [f for f in files if f not in refs]

    print(f"Total files in uploads: {len(files)}")
    print(f"DB referenced files: {len(refs)}")
    print(f"Orphan files: {len(orphans)}")

    if not orphans:
        print("No orphan files found.")
        return

    for f in orphans:
        rel = f.relative_to(ROOT)
        print(f"- {rel}")
        if apply:
            try:
                f.unlink()
            except Exception as e:
                print(f"  ! delete failed: {e}")

    print("Mode:", "APPLY" if apply else "DRY-RUN")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Find and optionally delete orphan files in uploads.")
    parser.add_argument("--apply", action="store_true", help="Delete orphan files.")
    args = parser.parse_args()
    run_cleanup(apply=args.apply)
