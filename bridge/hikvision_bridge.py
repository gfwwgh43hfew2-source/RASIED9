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
DEVICE_IP = os.environ.get("HIK_IP", "192.168.0.64")   # IP جهاز البصمة
DEVICE_USER = os.environ.get("HIK_USER", "admin")
DEVICE_PASS = os.environ.get("HIK_PASS", "123456asdA")  # باسورد الجهاز
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


class DeviceAuthError(Exception):
    """الجهاز رفض الدخول (401) — لا فائدة من تجربة صيغ أخرى. wait = ثوانٍ ننتظرها قبل أي محاولة جديدة."""
    def __init__(self, msg: str, wait: int = 600):
        super().__init__(msg)
        self.wait = wait


def _xml_tag(text: str, tag: str) -> str:
    m = re.search(rf"<{tag}>([^<]*)</{tag}>", text or "")
    return m.group(1).strip() if m else ""


def _auth_error(r) -> "DeviceAuthError":
    """يقرأ حالة القفل وعدد المحاولات المتبقية من رد الجهاز ويقرّر مدة الانتظار."""
    body = r.text or ""
    lock = _xml_tag(body, "lockStatus")
    unlock = _xml_tag(body, "unlockTime")
    retry = _xml_tag(body, "retryLoginTime")
    try:
        unlock_s = int(unlock or 0)
    except ValueError:
        unlock_s = 0
    if lock.lower() == "lock":
        wait = max(unlock_s, 60) + 60
        msg = (f"الجهاز مقفول مؤقتاً بعد محاولات دخول فاشلة — يُفتح بعد حوالي {unlock_s} ثانية. "
               f"سيُعاد المحاولة بعد {wait} ثانية دون إرسال أي طلب في الأثناء.")
    else:
        wait = 900
        msg = (f"الجهاز رفض الدخول (401). المحاولات المتبقية قبل القفل: {retry or 'غير معروف'}. "
               f"تحقق من DEVICE_PASS. سنتوقف 15 دقيقة كي لا نستهلك المحاولات.")
    if not body.strip():
        msg += " (الجهاز لم يرسل أي تفاصيل — غالباً قفل مؤقت)"
        wait = max(wait, 900)
    return DeviceAuthError(msg, wait)


def _request(method: str, path: str, timeout: int, **kw):
    """طلب بمصادقة Digest جديدة في كل مرة (تجنّب إعادة استخدام nonce قديم)، وإعادة محاولة واحدة عند 401."""
    url = BASE + path
    # محاولة واحدة فقط: كل محاولة مرفوضة تُحسب على الجهاز وقد تقفله
    r = requests.request(method, url, auth=HTTPDigestAuth(DEVICE_USER, DEVICE_PASS),
                         timeout=timeout, verify=False, **kw)
    if r.status_code == 401:
        raise _auth_error(r)
    return r


def device_get(path: str, timeout: int = 8):
    r = _request("GET", path, timeout)
    r.raise_for_status()
    return r


def device_post_json(path: str, body: dict, timeout: int = 15):
    headers = {"Content-Type": "application/json"}
    r = _request("POST", path, timeout, headers=headers, data=json.dumps(body))
    if r.status_code >= 400:
        raise RuntimeError(f"HTTP {r.status_code} من الجهاز: {r.text.strip()[:300]}")
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
    except DeviceAuthError as e:
        return {"error": str(e), "auth_error": str(e), "auth_wait": e.wait}
    except Exception as e:
        return {"error": str(e)}


clock_diff_min = None   # فرق ساعة الجهاز عن الكمبيوتر بالدقائق (موجب = الجهاز متقدم)


def check_device_clock() -> None:
    """يقارن ساعة الجهاز بساعة الكمبيوتر ويحذّر عند الاختلاف (أوقات الحضور تعتمد على ساعة الجهاز)."""
    global clock_diff_min
    try:
        r = device_get("/ISAPI/System/time")
        m = re.search(r"<localTime>([^<]+)</localTime>", r.text)
        if not m:
            return
        raw = re.sub(r"(Z|[+-]\d{2}:\d{2})$", "", m.group(1).strip())
        dev = datetime.fromisoformat(raw)
        diff = (dev - datetime.now()).total_seconds() / 60.0
        clock_diff_min = round(diff, 1)
        if abs(diff) > 2:
            way = "متقدمة" if diff > 0 else "متأخرة"
            log(f"تحذير: ساعة الجهاز {way} عن الكمبيوتر بحوالي {abs(round(diff))} دقيقة — "
                f"اضبط التاريخ والوقت من قائمة الجهاز وإلا ستكون أوقات الحضور والتأخير غير دقيقة")
    except DeviceAuthError:
        raise
    except Exception:
        pass  # بعض الموديلات لا تدعم هذا المسار


def _local_offset() -> str:
    off = datetime.now().astimezone().utcoffset()
    mins = int(off.total_seconds() // 60)
    sign = "+" if mins >= 0 else "-"
    mins = abs(mins)
    return f"{sign}{mins // 60:02d}:{mins % 60:02d}"


def fetch_acs_events(start: datetime, end: datetime) -> list[dict]:
    """سحب أحداث البصمة في فترة زمنية. start/end بالتوقيت المحلي (توقيت الجهاز)."""
    off = _local_offset()
    PAGE = 30  # بعض الأجهزة ترفض أكثر من 30 نتيجة في الصفحة (400)

    time_formats = [
        lambda dt: dt.strftime("%Y-%m-%dT%H:%M:%S") + off,   # مع فرق التوقيت
        lambda dt: dt.strftime("%Y-%m-%dT%H:%M:%S"),         # بدون فرق توقيت
    ]
    paths = [
        "/ISAPI/AccessControl/AcsEvent?format=json",
        "/ISAPI/AccessControl/AcsEvent",
    ]
    errors = []
    for path in paths:
        for fmt in time_formats:
            try:
                results, pos = [], 0
                while True:
                    body = {
                        "AcsEventCond": {
                            "searchID": "1",
                            "searchResultPosition": pos,
                            "maxResults": PAGE,
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
            except DeviceAuthError:
                raise
            except Exception as e:
                errors.append(f"{path.split('/')[-1]} [{fmt(start)}]: {e}")
    raise RuntimeError("تعذر سحب الأحداث — " + " || ".join(errors[:2]))


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
    if device_info.get("auth_error"):
        log(f"تحذير: {device_info['auth_error']}")
        time.sleep(device_info.get("auth_wait", 900))
        device_info = fetch_device_info()
    if device_info.get("model") or device_info.get("deviceName"):
        log(f"الجهاز: {device_info.get('model') or device_info.get('deviceName')} | SN: {device_info.get('serialNumber', '—')}")
    else:
        log(f"تحذير: لم يُقرأ معلومات الجهاز ({device_info.get('error', '')}) — سنحاول سحب الأحداث رغم ذلك")

    check_device_clock()
    last_clock_check = time.time()

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

    fails, last_err, auth_wait = 0, "", 0
    while True:
        # بعد 3 إخفاقات متتالية نبطّئ (30 ثانية)؛ وبعد رفض الدخول ننتظر المدة التي يحددها الجهاز
        time.sleep(auth_wait or (POLL_SECONDS if fails < 3 else 30))
        auth_wait = 0
        try:
            if time.time() - last_clock_check > 1800:
                check_device_clock()
                last_clock_check = time.time()
            end = datetime.now() + timedelta(hours=1)
            start = datetime.now() - timedelta(hours=12)  # نافذة مستمرة (التكرار يُتجاهل تلقائياً)
            batch = fetch_acs_events(start, end)
            n = merge_events(batch)
            last_poll_ok = True
            last_poll_msg = f"OK · إجمالي البصمات في الذاكرة: {len(events)}"
            last_poll_at = datetime.now().isoformat(timespec="seconds")
            if fails:
                log("عاد الاتصال بالجهاز بشكل سليم")
            fails, last_err = 0, ""
            if n:
                log(f"+{n} بصمة جديدة · الإجمالي {len(events)}")
            flush_cloud()
        except Exception as e:
            last_poll_ok = False
            last_poll_msg = str(e)
            last_poll_at = datetime.now().isoformat(timespec="seconds")
            fails += 1
            if isinstance(e, DeviceAuthError):
                auth_wait = e.wait
            # لا نكرر نفس الرسالة كل 5 ثوانٍ: نطبعها عند تغيّرها أو كل 10 إخفاقات
            if str(e) != last_err or fails % 10 == 0:
                log(f"خطأ في السحب ({fails}): {e}")
                last_err = str(e)


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
                "clock_diff_min": clock_diff_min,
                "cloud": bool(cloud and cloud.enabled),
                "cloud_ok": bool(cloud and cloud.ok),
                "cloud_msg": cloud.msg if cloud else "",
                "pending": len(dirty),
                "unmatched": sorted(cloud.unmatched.keys()) if cloud else [],
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
        log("الرفع المباشر للنظام: غير مفعّل — السبب: " + cloud.msg)

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
