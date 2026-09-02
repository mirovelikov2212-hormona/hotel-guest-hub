import asyncio
import hashlib
import json
import os
import time
from pathlib import Path

from playwright.async_api import async_playwright

BASE_URL = os.getenv("STAYHUB_BROWSER_BASE_URL", "https://www.stayhub.app").rstrip("/")
PREFIX = os.getenv("STAYHUB_BROWSER_PREFIX", "factory-heavy-20260901")
RUN_ID = os.getenv("STAYHUB_BROWSER_RUN_ID", f"browser-matrix-{int(time.time() * 1000)}")


def deterministic_uuid(label: str, hotel: int, room_index: int) -> str:
    value = hashlib.md5(f"{label}-{hotel}-{room_index}".encode()).hexdigest()
    return f"{value[:8]}-{value[8:12]}-4{value[13:16]}-8{value[17:20]}-{value[20:]}"


def hotel_slug(hotel: int) -> str:
    return f"{PREFIX}-{hotel:03d}-sandbox"


PROFILES = [
    {
        "name": "chromium-desktop",
        "engine": "chromium",
        "hotel": 91,
        "room_index": 1,
        "context": {"viewport": {"width": 1440, "height": 900}},
    },
    {
        "name": "firefox-desktop",
        "engine": "firefox",
        "hotel": 92,
        "room_index": 1,
        "context": {"viewport": {"width": 1440, "height": 900}},
    },
    {
        "name": "webkit-desktop",
        "engine": "webkit",
        "hotel": 93,
        "room_index": 1,
        "context": {"viewport": {"width": 1440, "height": 900}},
    },
    {
        "name": "pixel-chromium-mobile",
        "engine": "chromium",
        "hotel": 94,
        "room_index": 1,
        "context": {
            "viewport": {"width": 412, "height": 915},
            "is_mobile": True,
            "has_touch": True,
            "device_scale_factor": 2.625,
            "user_agent": "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
        },
    },
    {
        "name": "iphone-webkit-mobile",
        "engine": "webkit",
        "hotel": 95,
        "room_index": 1,
        "context": {
            "viewport": {"width": 393, "height": 852},
            "is_mobile": True,
            "has_touch": True,
            "device_scale_factor": 3,
            "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
        },
    },
]


async def run_profile(playwright, profile):
    browser_type = getattr(playwright, profile["engine"])
    browser = await browser_type.launch()
    context = await browser.new_context(**profile["context"])
    page = await context.new_page()
    console_errors = []
    page_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda exc: page_errors.append(str(exc)))

    hotel = profile["hotel"]
    room_index = profile["room_index"]
    slug = hotel_slug(hotel)
    room = str(200 + room_index)
    stay_id = deterministic_uuid("factory-heavy-stay", hotel, room_index)
    stay_device_id = deterministic_uuid("factory-heavy-device", hotel, room_index)
    marker = f"{RUN_ID}:{profile['name']}"
    started = time.perf_counter()
    page_status = None
    api_result = None
    failure = None

    try:
        response = await page.goto(f"{BASE_URL}/h/{slug}", wait_until="domcontentloaded", timeout=60_000)
        page_status = response.status if response else None
        await page.wait_for_timeout(500)
        api_result = await page.evaluate(
            """async ({payload}) => {
              const response = await fetch('/api/guest/request-create', {
                method: 'POST',
                headers: {'content-type': 'application/json'},
                body: JSON.stringify(payload),
                cache: 'no-store'
              });
              let body = null;
              try { body = await response.json(); } catch {}
              return {status: response.status, ok: response.ok, body};
            }""",
            {
                "payload": {
                    "hotelSlug": slug,
                    "room": room,
                    "type": "extra-towel",
                    "typeLabel": marker,
                    "sourceRequestDef": "extra-towel",
                    "serviceTime": "now",
                    "guestLanguage": "en",
                    "stayId": stay_id,
                    "stayDeviceId": stay_device_id,
                }
            },
        )
    except Exception as exc:
        failure = str(exc)
    finally:
        elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
        await context.close()
        await browser.close()

    body = (api_result or {}).get("body") or {}
    accepted = (
        failure is None
        and page_status is not None
        and page_status < 400
        and (api_result or {}).get("status", 0) in range(200, 300)
        and body.get("ok") is True
        and isinstance((body.get("request") or {}).get("id"), str)
    )
    return {
        "name": profile["name"],
        "engine": profile["engine"],
        "hotel": hotel,
        "hotelSlug": slug,
        "room": room,
        "stayId": stay_id,
        "stayDeviceId": stay_device_id,
        "marker": marker,
        "pageStatus": page_status,
        "apiStatus": (api_result or {}).get("status"),
        "requestId": (body.get("request") or {}).get("id"),
        "requestType": (body.get("request") or {}).get("type") or (body.get("request") or {}).get("request_type"),
        "elapsedMs": elapsed_ms,
        "consoleErrors": console_errors,
        "pageErrors": page_errors,
        "failure": failure or body.get("error"),
        "accepted": accepted,
    }


async def main():
    async with async_playwright() as playwright:
        results = []
        for profile in PROFILES:
            results.append(await run_profile(playwright, profile))

    output = {
        "schemaVersion": "stayhub-browser-device-matrix-v1",
        "runId": RUN_ID,
        "baseUrl": BASE_URL,
        "note": "Desktop entries use real Chromium/Firefox/WebKit engines. Mobile entries use real Chromium/WebKit engines with mobile viewport, touch and user-agent emulation; they are not physical handsets.",
        "accepted": all(row["accepted"] for row in results),
        "results": results,
    }
    Path("factory-browser-device-matrix-results.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(output, ensure_ascii=False, indent=2))
    if not output["accepted"]:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
