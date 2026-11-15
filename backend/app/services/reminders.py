"""Background task: create reminder logs for orders stuck in PLACED/ACCEPTED for more than REMINDER_MINUTES."""
import asyncio
import logging
from datetime import timedelta

from sqlalchemy import select

from .. import config
from ..database import SessionLocal
from ..models import Order, OrderStatus, ReminderLog, utcnow

log = logging.getLogger("campusbite.reminders")
STUCK = (OrderStatus.PLACED, OrderStatus.ACCEPTED)


def generate_reminders() -> int:
    """One scan. Creates at most one open reminder per order+status. Resolves reminders for orders that moved on."""
    created = 0
    with SessionLocal() as db:
        cutoff = utcnow() - timedelta(minutes=config.REMINDER_MINUTES)
        stuck = db.scalars(select(Order).where(Order.status.in_(STUCK), Order.updated_at <= cutoff)).all()
        for o in stuck:
            exists = db.scalar(select(ReminderLog.id).where(ReminderLog.order_id == o.id, ReminderLog.status_at_reminder == o.status.value,
                                                            ReminderLog.is_resolved.is_(False)))
            if exists:
                continue
            mins = int((utcnow() - o.updated_at).total_seconds() // 60)
            db.add(ReminderLog(order_id=o.id, restaurant_id=o.restaurant_id, status_at_reminder=o.status.value,
                               message=f"Order #{o.id} has been {o.status.value} for {mins} minutes without an update."))
            created += 1
        # auto-resolve reminders whose order is no longer stuck in that status
        open_reminders = db.scalars(select(ReminderLog).where(ReminderLog.is_resolved.is_(False))).all()
        for r in open_reminders:
            if r.order is None or r.order.status.value != r.status_at_reminder:
                r.is_resolved = True
        db.commit()
    if created:
        log.info("Created %d order reminder(s)", created)
    return created


async def reminder_loop(stop: asyncio.Event):
    log.info("Reminder task started (threshold %d min, every %d s)", config.REMINDER_MINUTES, config.REMINDER_CHECK_SECONDS)
    while not stop.is_set():
        try:
            await asyncio.to_thread(generate_reminders)
        except Exception:  # noqa: BLE001
            log.exception("Reminder scan failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=config.REMINDER_CHECK_SECONDS)
        except asyncio.TimeoutError:
            pass
