"""Celery application instance and beat schedule."""

import sys
from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "amr",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.nightly_scan"],
)

# Windows requires the solo pool — prefork uses os.fork() which doesn't exist on Windows
_pool = "solo" if sys.platform == "win32" else "prefork"

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/New_York",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    worker_pool=_pool,
)

# Nightly beat schedule — runs at 6:00 PM Eastern Time on market days
celery_app.conf.beat_schedule = {
    "nightly-scan-6pm-et": {
        "task": "app.tasks.nightly_scan.run_nightly_scan",
        "schedule": crontab(hour=18, minute=0, day_of_week="mon-fri"),
    },
}
