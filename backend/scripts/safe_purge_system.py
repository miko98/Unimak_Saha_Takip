import argparse
import shutil
from datetime import datetime
from pathlib import Path
import sqlite3


def backup_database(db_path: Path, backup_dir: Path) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"{db_path.stem}_backup_{stamp}{db_path.suffix}"
    shutil.copy2(db_path, backup_path)
    return backup_path


def purge_sqlite(db_path: Path):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [row[0] for row in cur.fetchall() if row[0] != "sqlite_sequence"]
    for table in tables:
        cur.execute(f'DELETE FROM "{table}"')
    conn.commit()
    conn.close()


def main():
    parser = argparse.ArgumentParser(description="Safely purge system data with backup and explicit confirmation.")
    parser.add_argument("--db", default="unimak_saha.db", help="SQLite database path")
    parser.add_argument("--uploads", default="uploads", help="Uploads directory path")
    parser.add_argument("--backup-dir", default="backups", help="Backup directory path")
    parser.add_argument("--apply", action="store_true", help="Actually execute purge")
    parser.add_argument("--confirm-text", default="", help="Must be EXACTLY: SISTEMI TEMIZLE")
    parser.add_argument("--include-uploads", action="store_true", help="Also purge uploaded files")
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    uploads_dir = Path(args.uploads).resolve()
    backup_dir = Path(args.backup_dir).resolve()

    if not db_path.exists():
        raise FileNotFoundError(f"Database not found: {db_path}")

    if not args.apply:
        print("Dry-run mode. Use --apply to execute.")
        print(f"Database: {db_path}")
        print(f"Uploads: {uploads_dir}")
        return

    if args.confirm_text != "SISTEMI TEMIZLE":
        raise ValueError("Safety check failed. Pass --confirm-text 'SISTEMI TEMIZLE'")

    backup_path = backup_database(db_path, backup_dir)
    print(f"Backup created: {backup_path}")

    purge_sqlite(db_path)
    print("Database rows purged.")

    if args.include_uploads and uploads_dir.exists():
        shutil.rmtree(uploads_dir)
        uploads_dir.mkdir(parents=True, exist_ok=True)
        print("Uploads directory purged and recreated.")

    print("Purge completed safely.")


if __name__ == "__main__":
    main()
