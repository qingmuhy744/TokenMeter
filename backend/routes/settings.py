from fastapi import APIRouter, Request
from sqlalchemy import select
from backend.database import async_session
from backend.models import Setting
from backend.schemas import SettingsResponse, SettingsUpdate
from backend.auth import get_current_user
from backend.config import settings as app_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
async def get_settings(request: Request):
    await get_current_user(request)
    async with async_session() as db:
        result = await db.execute(select(Setting))
        rows = {r.key: r.value for r in result.scalars().all()}

    return SettingsResponse(
        default_prompt=rows.get("default_prompt", app_settings.DEFAULT_PROMPT),
        timeout_seconds=int(rows.get("timeout_seconds", app_settings.TIMEOUT_SECONDS)),
        custom_banner=rows.get("custom_banner"),
    )


@router.put("")
async def update_settings(body: SettingsUpdate, request: Request):
    await get_current_user(request)
    async with async_session() as db:
        for field, value in body.model_dump(exclude_unset=True).items():
            result = await db.execute(select(Setting).where(Setting.key == field))
            setting = result.scalar_one_or_none()
            if setting:
                setting.value = str(value)
            else:
                db.add(Setting(key=field, value=str(value)))
        await db.commit()
    return {"message": "Settings updated"}
