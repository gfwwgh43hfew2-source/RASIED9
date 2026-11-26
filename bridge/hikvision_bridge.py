#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
جسر ربط جهاز البصمة Hikvision DS-K1A8603EF بنظام الألوميتال
=============================================================
يعمل على جهاز كمبيوتر على نفس شبكة الراوتر مع جهاز البصمة.

الوظيفة:
  - يسحب سجلات البصمة من الجهاز عبر ISAPI كل عدة ثوانٍ
  - يعرضها على http://127.0.0.1:8765 عشان صفحة الحضور في النظام تقرأها فوراً

التشغيل:
  1. عدّل الإعدادات بالأسفل (IP الجهاز + يوزر + باسورد)
  2. pip install requests
  3. python hikvision_bridge.py
  4. افتح نظام الألوميتال → الحضور والانصراف (هيظهر «متصل بالبصمة»)

متطلبات الجهاز:
  - IP ثابت على الشبكة (مثال 192.168.1.64)
  - تفعيل ISAPI من إعدادات الجهاز إن لزم
  - يوزر admin وباسورد الجهاز
"""

from __future__ import annotations

import json
import os
import re
import sys
import threading
import time
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

try:
    import requests
    from requests.auth import HTTPDigestAuth
except ImportError:
    print("ثبّت المكتبة أولاً:  pip install requests")
    sys.exit(1)

# ═══════════════════════════════════════════════════════════
#                    إعدادات الجهاز — عدّلها
# ═══════════════════════════════════════════════════════════
DEVICE_IP = os.environ.get("HIK_IP", "192.168.1.64")   # IP جهاز البصمة
DEVICE_USER = os.environ.get("HIK_USER", "admin")
DEVICE_PASS = os.environ.get("HIK_PASS", "admin12345")  # باسورد الجهاز
POLL_SECONDS = int(os.environ.get("HIK_POLL", "5"))    # كل كام ثانية نسحب
LOOKBACK_HOURS = int(os.environ.get("HIK_LOOKBACK", "24"))  # نسحب آخر كام ساعة عند البدء
HTTP_HOST = "127.0.0.1"
HTTP_PORT = 8765
# ═══════════════════════════════════════════════════════════

from supabase_sync import CloudSync

BASE = f"http://{DEVICE_IP}"
AUTH = HTTPDigestAuth(DEVICE_USER, DEVICE_PASS)

# ذاكرة الأحداث: key = employeeNo|timestamp  → event dict
events_lock = threading.Lock()
events: dict[str, dict] = {}
last_poll_ok = False
last_poll_msg = ""
last_poll_at = ""
device_info: dict = {}
dirty: dict = {}          # بصمات لم تُرفع للنظام بعد
cloud = None              # يُنشأ في main()


def log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def device_get(path: str, timeout: int = 8):
    url = BASE + path
    r = requests.get(url, auth=AUTH, timeout=timeout, verify=False)
    r.raise_for_status()
    return r


def device_post_json(path: str, body: dict, timeout: int = 15):
    url = BASE + path
    headers = {"Content-Type": "application/json"}
    r = requests.post(url, auth=AUTH, headers=headers, data=json.dumps(body), timeout=timeout, verify=False)
    r.raise_for_status()
    # بعض الأجهزة ترجع XML رغم format=json
    text = r.text.strip()
    if text.startswith("{"):
        return r.json()
    # محاولة استخراج JSON من الرد
    m = re.search(r"\{.*\}", text, re.S)
    if m:
        return json.loads(m.group(0))
    return {"raw": text}


def fetch_device_info() -> dict:
    try:
        r = device_get("/ISAPI/System/deviceInfo")
        text = r.text
        info = {}
        for tag in ("deviceName", "model", "serialNumber", "firmwareVersion", "macAddress"):
            m = re.search(rf"<{tag}>([^<]+)</{tag}>", text)
            if m:
                info[tag] = m.group(1)
        return info
    except Exception as e:
        return {"error": str(e)}


def _local_offset() -> str:
    off = datetime.now().astimezone().utcoffset()
    mins = int(off.total_seconds() // 60)
    sign = "+" if mins >= 0 else "-"
    mins = abs(mins)
    return f"{sign}{mins // 60:02d}:{mins % 60:02d}"


def fetch_acs_events(start: datetime, end: datetime) -> list[dict]:
    """سحب أحداث البصمة في فترة زمنية. start/end بالتوقيت المحلي (توقيت الجهاز)."""
    off = _local_offset()

    def fmt(dt: datetime) -> str:
        return dt.strftime("%Y-%m-%dT%H:%M:%S") + off

    paths = [
        "/ISAPI/AccessControl/AcsEvent?format=json",
        "/ISAPI/AccessControl/AcsEvent",
    ]
    last_err = None
    search_id = f"att-{int(time.time())}"
    for path in paths:
        try:
            results, pos = [], 0
            while True:
                body = {
                    "AcsEventCond": {
                        "searchID": search_id,
                        "searchResultPosition": pos,
                        "maxResults": 100,
                        "major": 5,
                        "minor": 0,
                        "startTime": fmt(start),
                        "endTime": fmt(end),
                    }
                }
                data = device_post_json(path, body)
                batch = parse_events(data)
                results += batch
                ae = data.get("AcsEvent") if isinstance(data, dict) else None
                more = isinstance(ae, dict) and str(ae.get("responseStatusStrg", "")).upper() == "MORE"
                if not batch or not more:
                    break
                pos += int(ae.get("numOfMatches") or len(batch))
                if pos > 5000:
                    break
            return results
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"تعذر سحب الأحداث: {last_err}")


def parse_events(data) -> list[dict]:
    out = []
    if not isinstance(data, dict):
        return out
    # أشكال شائعة للرد
    info_list = (
        data.get("AcsEvent")
        or data.get("AcsEventList")
        or data.get("InfoList")
        or []
    )
    if isinstance(info_list, dict):
        # أحياناً يكون كائن واحد
        info_list = info_list.get("InfoList") or info_list.get("AcsEvent") or [info_list]
    if not isinstance(info_list, list):
        # بعض الفيرموير: AcsEvent.InfoList
        ae = data.get("AcsEvent") or {}
        if isinstance(ae, dict):
            info_list = ae.get("InfoList") or ae.get("eventList") or []
    if not isinstance(info_list, list):
        info_list = []

    for item in info_list:
        if not isinstance(item, dict):
            continue
        emp = (
            item.get("employeeNoString")
            or item.get("employeeNo")
            or item.get("personId")
            or item.get("cardNo")
            or ""
        )
        name = item.get("name") or item.get("personName") or ""
        t = item.get("time") or item.get("dateTime") or item.get("timestamp") or ""
        # تطبيع الوقت
        t = str(t).replace("T", " ").replace("+00:00", "").replace("Z", "").strip()
        if len(t) >= 19:
            t = t[:19]
        if not emp and not t:
            continue
        out.append({
            "employeeNo": str(emp).strip(),
            "name": str(name).strip(),
            "time": t,
            "date": t[:10] if len(t) >= 10 else "",
            "clock": t[11:16] if len(t) >= 16 else "",
            "raw": item,
        })
    return out


def merge_events(new_list: list[dict]) -> int:
    added = 0
    with events_lock:
        for ev in new_list:
            key = f"{ev.get('employeeNo')}|{ev.get('time')}"
            if key not in events:
                ev["_key"] = key
                events[key] = ev
                if ev.get("employeeNo"):
                    dirty[key] = ev
                added += 1
    return added


def flush_cloud() -> None:
    """رفع البصمات المعلّقة للنظام (يُعاد المحاولة تلقائياً عند انقطاع الإنترنت)."""
    if not cloud or not cloud.enabled:
        return
    with events_lock:
        pending = list(dirty.values())
    if not pending:
        return
    done = cloud.sync(pending)
    with events_lock:
        for k in done:
            dirty.pop(k, None)


def poll_loop():
    global last_poll_ok, last_poll_msg, last_poll_at, device_info
    log(f"بدء الاتصال بالجهاز {DEVICE_IP} ...")
    device_info = fetch_device_info()
    if device_info.get("model") or device_info.get("deviceName"):
        log(f"الجهاز: {device_info.get('model') or device_info.get('deviceName')} | SN: {device_info.get('serialNumber', '—')}")
    else:
        log(f"تحذير: لم يُقرأ معلومات الجهاز ({device_info.get('error', '')}) — سنحاول سحب الأحداث رغم ذلك")

    # سحب أولي لآخر LOOKBACK_HOURS
    end = datetime.now() + timedelta(hours=1)
    start = datetime.now() - timedelta(hours=LOOKBACK_HOURS)
    try:
        initial = fetch_acs_events(start, end)
        n = merge_events(initial)
        last_poll_ok = True
        last_poll_msg = f"تم سحب {n} بصمة أولية"
        last_poll_at = datetime.now().isoformat(timespec="seconds")
        log(last_poll_msg)
    except Exception as e:
        last_poll_ok = False
        last_poll_msg = str(e)
        last_poll_at = datetime.now().isoformat(timespec="seconds")
        log(f"فشل السحب الأولي: {e}")
    flush_cloud()

    while True:
        time.sleep(POLL_SECONDS)
        try:
            end = datetime.now() + timedelta(hours=1)
            start = datetime.now() - timedelta(hours=3)  # نافذة قصيرة مستمرة
            batch = fetch_acs_events(start, end)
            n = merge_events(batch)
            last_poll_ok = True
            last_poll_msg = f"OK · إجمالي البصمات في الذاكرة: {len(events)}"
            last_poll_at = datetime.now().isoformat(timespec="seconds")
            if n:
                log(f"+{n} بصمة جديدة · الإجمالي {len(events)}")
            flush_cloud()
        except Exception as e:
            last_poll_ok = False
            last_poll_msg = str(e)
            last_poll_at = datetime.now().isoformat(timespec="seconds")
            log(f"خطأ في السحب: {e}")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # تهدئة اللوج
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        qs = parse_qs(parsed.query)

        if path in ("/", "/status"):
            body = {
                "ok": last_poll_ok,
                "message": last_poll_msg,
                "last_poll_at": last_poll_at,
                "device_ip": DEVICE_IP,
                "device": device_info,
                "events_count": len(events),
                "cloud": bool(cloud and cloud.enabled),
                "cloud_ok": bool(cloud and cloud.ok),
                "cloud_msg": cloud.msg if cloud else "",
                "pending": len(dirty),
                "poll_seconds": POLL_SECONDS,
            }
            return self._json(200, body)

        if path == "/events":
            since = (qs.get("since") or [""])[0]
            with events_lock:
                items = list(events.values())
            if since:
                items = [e for e in items if (e.get("time") or "") >= since]
            items.sort(key=lambda e: e.get("time") or "")
            return self._json(200, {"events": items, "count": len(items)})

        if path == "/events/today":
            today = datetime.now().strftime("%Y-%m-%d")
            with events_lock:
                items = [e for e in events.values() if (e.get("date") or "").startswith(today)]
            items.sort(key=lambda e: e.get("time") or "")
            return self._json(200, {"events": items, "count": len(items), "date": today})

        return self._json(404, {"error": "not found", "paths": ["/", "/status", "/events", "/events/today"]})

    def _json(self, code: int, obj: dict):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)


def main():
    # تعطيل تحذيرات SSL لأجهزة البصمة ذات الشهادات الذاتية
    try:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    except Exception:
        pass

    log("=" * 50)
    log("جسر Hikvision DS-K1A8603EF ← نظام الألوميتال")
    log(f"الجهاز: {DEVICE_IP} | المستخدم: {DEVICE_USER}")
    log(f"الواجهة المحلية: http://{HTTP_HOST}:{HTTP_PORT}")
    log("=" * 50)

    global cloud
    cloud = CloudSync(log=log)
    if cloud.enabled:
        log("الرفع المباشر للنظام: مفعّل — أي بصمة تظهر في النظام تلقائياً")
    else:
        log("الرفع المباشر للنظام: غير مفعّل (أنشئ bridge_config.json من bridge_config.example.json)")

    t = threading.Thread(target=poll_loop, daemon=True)
    t.start()

    server = HTTPServer((HTTP_HOST, HTTP_PORT), Handler)
    log(f"الخادم يعمل — افتح النظام وسيظهر «متصل بالبصمة»")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("إيقاف الجسر...")
        server.shutdown()


if __name__ == "__main__":
    main()
