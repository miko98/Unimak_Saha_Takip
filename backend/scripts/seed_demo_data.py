import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database import SessionLocal, engine  # noqa: E402
import models  # noqa: E402


PROJECT_COUNT = 14
RANDOM_SEED = 42


NAMES = [
    "Ilhan Ardali",
    "Can Kaplan",
    "Bayram Kaplan",
    "Murat Demir",
    "Ayse Yildiz",
    "Mehmet Can",
]
GROUPS = [
    "Elektrik",
    "Mekanik",
    "Hidrolik",
    "PLC",
    "Saha Kurulum",
    "Kablo",
]
STATUSES = ["Beklemede", "Devam Ediyor", "Eksik", "Hatali", "Tamamlandi"]
PRIORITIES = ["Normal", "Yuksek", "Kritik"]
PHASES = ["Ic Montaj", "Dis Montaj"]


def ensure_schema():
    models.Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        work_order_cols = {
            row[1] for row in conn.execute(text("PRAGMA table_info(work_orders)")).fetchall()
        }
        if "atanan_kisi" not in work_order_cols:
            conn.execute(text("ALTER TABLE work_orders ADD COLUMN atanan_kisi VARCHAR"))
        if "termin_tarihi" not in work_order_cols:
            conn.execute(text("ALTER TABLE work_orders ADD COLUMN termin_tarihi VARCHAR"))
        if "oncelik" not in work_order_cols:
            conn.execute(text("ALTER TABLE work_orders ADD COLUMN oncelik VARCHAR DEFAULT 'Normal'"))
        if "kayit_kaynagi" not in work_order_cols:
            conn.execute(text("ALTER TABLE work_orders ADD COLUMN kayit_kaynagi VARCHAR DEFAULT 'Plan'"))
        conn.commit()


def maybe_date(days_offset: int) -> str:
    return (datetime.now() + timedelta(days=days_offset)).strftime("%Y-%m-%d")


def seed():
    random.seed(RANDOM_SEED)
    ensure_schema()
    db = SessionLocal()
    try:
        existing_projects = db.query(models.Project).count()
        existing_work_orders = db.query(models.WorkOrder).count()
        existing_checklist = db.query(models.ChecklistItem).count()
        existing_panos = db.query(models.Pano).count()

        base_idx = existing_projects + 1
        created_projects = 0
        created_work_orders = 0
        created_checklist = 0
        created_panos = 0

        for i in range(PROJECT_COUNT):
            idx = base_idx + i
            code = f"WO-2026-{idx:03d}"
            phase = PHASES[i % len(PHASES)]
            project_status = "Aktif" if i % 5 != 0 else "Tamamlandi"
            owner = random.choice(NAMES)
            group = random.choice(GROUPS)
            work_name = f"{group} revizyon paketi {idx}"

            project = models.Project(
                kod=code,
                name=work_name,
                gruplar=group,
                yonetici=owner,
                durum=project_status,
            )
            db.add(project)
            db.flush()
            created_projects += 1

            # 1 plan kaydi
            plan_status = "Beklemede" if project_status != "Tamamlandi" else "Tamamlandi"
            plan_termin = maybe_date(random.randint(-5, 10))
            wo_plan = models.WorkOrder(
                project_id=project.id,
                bolum=phase.replace("Ic", "İç").replace("Dis", "Dış"),
                grup=group,
                islem=work_name,
                durum=plan_status.replace("Tamamlandi", "Tamamlandı"),
                montajci=owner,
                atanan_kisi=owner,
                termin_tarihi=plan_termin,
                oncelik=random.choice(PRIORITIES),
                kayit_kaynagi="Plan",
                notlar=f"[{phase.replace('Ic', 'İç').replace('Dis', 'Dış')}] Plan kaydi",
                tarih=datetime.now().strftime("%d.%m.%Y %H:%M"),
            )
            db.add(wo_plan)
            created_work_orders += 1

            # 2 saha kaydi
            for j in range(2):
                saha_status = random.choice(STATUSES).replace("Tamamlandi", "Tamamlandı").replace("Hatali", "Hatalı")
                saha_phase = random.choice(["İç Montaj", "Dış Montaj"])
                saha_person = random.choice(NAMES)
                saha_termin = maybe_date(random.randint(-7, 7))
                wo_field = models.WorkOrder(
                    project_id=project.id,
                    bolum=saha_phase,
                    grup=group,
                    islem=f"{work_name} - saha adimi {j+1}",
                    durum=saha_status,
                    montajci=saha_person,
                    atanan_kisi=saha_person,
                    termin_tarihi=saha_termin,
                    oncelik=random.choice(PRIORITIES),
                    kayit_kaynagi="Saha",
                    notlar=f"[SAHA] {saha_phase} sahadan otomatik test kaydi",
                    tarih=datetime.now().strftime("%d.%m.%Y %H:%M"),
                )
                db.add(wo_field)
                created_work_orders += 1

            # checklist
            checklist = models.ChecklistItem(
                project_id=project.id,
                kategori=random.choice(["Elektrik", "Mekanik", "Dokumantasyon"]),
                madde_metni=f"{code} kalite kontrol maddesi",
                durum=random.choice(["Beklemede", "Tamamlandı"]),
                notlar="Demo veri",
                guncelleyen=owner,
            )
            db.add(checklist)
            created_checklist += 1

            # pano
            pano = models.Pano(
                project_id=project.id,
                grubu=group,
                pano_no=f"PANO-{idx:03d}",
                olcu=f"{random.randint(80,130)}x{random.randint(140,220)}",
                toplayan=owner,
                baslangic=datetime.now().strftime("%d.%m.%Y"),
                teslim=(datetime.now() + timedelta(days=7)).strftime("%d.%m.%Y"),
                notlar="Demo pano kaydi",
                durumu=random.choice(["Planlandı", "Toplaniyor", "Tamamlandı"]),
            )
            db.add(pano)
            created_panos += 1

        db.commit()
        print("SEED_DEMO_OK")
        print(f"PROJECTS_CREATED={created_projects}")
        print(f"WORK_ORDERS_CREATED={created_work_orders}")
        print(f"CHECKLIST_CREATED={created_checklist}")
        print(f"PANOS_CREATED={created_panos}")
        print("--- TOTALS ---")
        print(f"PROJECTS_TOTAL={existing_projects + created_projects}")
        print(f"WORK_ORDERS_TOTAL={existing_work_orders + created_work_orders}")
        print(f"CHECKLIST_TOTAL={existing_checklist + created_checklist}")
        print(f"PANOS_TOTAL={existing_panos + created_panos}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
