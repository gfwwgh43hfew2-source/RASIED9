# -*- coding: utf-8 -*-
"""
رفع البصمات مباشرة إلى Supabase (بدون الحاجة لفتح صفحة الحضور).

- يسجّل الدخول بحساب مستخدم مخصّص للجسر (نفس صلاحيات الشركة).
- يقرأ SUPABASE_URL و SUPABASE_ANON_KEY تلقائياً من ../js/config.js
- يكتب في جدول records بنفس بنية النظام: tbl = "attendance"
"""
import json
import os
import re
import time
import uuid
from datetime import datetime, timezone

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE_LABEL = "Hikvision سحابي"


def _read_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _read_app_config():
    p = os.path.join(HERE, "..", "js", "config.js")
    try:
        text = open(p, encoding="utf-8").read()
    except OSError:
        return {}
    out = {}
    for k in ("SUPABASE_URL", "SUPABASE_ANON_KEY"):
        m = re.search(k + r"\s*:\s*[\"']([^\"']+)[\"']", text)
        if m:
            out[k] = m.group(1)
    return out


def _to_min(t):
    if not t:
        return None
    p = str(t).replace(".", ":").split(":")
    if len(p) < 2:
        return None
    try:
        return int(p[0]) * 60 + int(p[1])
    except ValueError:
        return None


class CloudSync:
    def __init__(self, log=print):
        self.log = log
        app = _read_app_config()
        cfg = _read_json(os.path.join(HERE, "bridge_config.json"))
        self.url = (os.environ.get("SUPABASE_URL") or cfg.get("supabase_url") or app.get("SUPABASE_URL") or "").rstrip("/")
        self.key = os.environ.get("SUPABASE_ANON_KEY") or cfg.get("supabase_anon_key") or app.get("SUPABASE_ANON_KEY") or ""
        self.email = os.environ.get("BRIDGE_EMAIL") or cfg.get("email") or ""
        self.password = os.environ.get("BRIDGE_PASSWORD") or cfg.get("password") or ""
        # إعدادات الدوام — يجب أن تطابق صفحة الحضور في النظام
        self.work_start = cfg.get("work_start", "08:00")
        self.grace_min = int(cfg.get("grace_min", 15))
        self.work_end = cfg.get("work_end", "17:00")
        self.ot_after = cfg.get("ot_after", self.work_end)

        self.enabled = bool(self.url and self.key and self.email and self.password)
        self.ok = False
        self.msg = "غير مفعّل — أنشئ bridge_config.json" if not self.enabled else "لم يبدأ بعد"
        self._token = None
        self._refresh = None
        self._exp = 0
        self._company = None
        self._uid = None
        self._emps = []
        self._emps_at = 0
        self._warned = set()

    # ───────────── الاتصال ─────────────
    def _auth_call(self, grant, body):
        r = requests.post(
            f"{self.url}/auth/v1/token?grant_type={grant}",
            headers={"apikey": self.key, "Content-Type": "application/json"},
            data=json.dumps(body), timeout=20,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"فشل تسجيل الدخول ({r.status_code}): {r.text[:150]}")
        d = r.json()
        self._token = d["access_token"]
        self._refresh = d.get("refresh_token")
        self._exp = time.time() + int(d.get("expires_in", 3600))
        return d

    def _login(self):
        d = self._auth_call("password", {"email": self.email, "password": self.password})
        self._uid = d["user"]["id"]
        return self._uid

    def _ensure_token(self):
        if self._token and time.time() < self._exp - 60:
            return
        if self._refresh:
            try:
                self._auth_call("refresh_token", {"refresh_token": self._refresh})
                return
            except Exception:
                pass
        self._login()

    def _req(self, method, path, params=None, body=None, prefer=None):
        self._ensure_token()
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        r = requests.request(
            method, f"{self.url}/rest/v1/{path}", headers=headers, params=params,
            data=json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None,
            timeout=25,
        )
        if r.status_code == 401:  # انتهت الجلسة
            self._token = None
            self._ensure_token()
            return self._req(method, path, params, body, prefer)
        if r.status_code >= 400:
            raise RuntimeError(f"{method} {path} → {r.status_code}: {r.text[:200]}")
        return r.json() if r.text.strip() else None

    def _get_company(self):
        if self._company:
            return self._company
        self._ensure_token()
        uid = self._uid or self._login()
        rows = self._req("GET", "profiles", {"id": f"eq.{uid}", "select": "company_id"})
        if not rows:
            raise RuntimeError("لم يُعثر على ملف المستخدم (profiles) — تأكد أن حساب الجسر تابع للشركة")
        self._company = rows[0]["company_id"]
        return self._company

    # ───────────── الموظفون ─────────────
    def _employees(self):
        if self._emps and time.time() - self._emps_at < 300:
            return self._emps
        cid = self._get_company()
        out, start = [], 0
        while True:
            rows = self._req("GET", "records", {
                "company_id": f"eq.{cid}", "tbl": "eq.employees",
                "select": "id,data", "order": "created_at.desc",
                "limit": 1000, "offset": start,
            }) or []
            out += rows
            if len(rows) < 1000:
                break
            start += 1000
        self._emps = out
        self._emps_at = time.time()
        return out

    def _emp_by_fp(self, fp):
        fp = str(fp or "").strip()
        if not fp:
            return None
        for r in self._employees():
            d = r.get("data") or {}
            if str(d.get("fp_id") or d.get("fingerprint_id") or d.get("code") or "").strip() == fp or str(r["id"]) == fp:
                return r
        return None

    # ───────────── حساب الحالة (مطابق لصفحة الحضور) ─────────────
    def _calc(self, check_in, check_out):
        ci = _to_min(check_in)
        if ci is None:
            return "absent", 0, 0
        start = _to_min(self.work_start) or 8 * 60
        late = max(0, ci - start - self.grace_min)
        status = "late" if late > 0 else "present"
        ot = 0
        co = _to_min(check_out)
        ot_start = _to_min(self.ot_after or self.work_end) or 17 * 60
        if co is not None and co > ot_start:
            ot = co - ot_start
        return status, late, ot

    # ───────────── المزامنة ─────────────
    def sync(self, events):
        """يرفع قائمة أحداث. يرجع مجموعة المفاتيح التي تمت معالجتها (لا تحتاج إعادة)."""
        done = set()
        if not self.enabled or not events:
            return done
        try:
            cid = self._get_company()
            groups = {}
            for ev in events:
                emp = self._emp_by_fp(ev.get("employeeNo"))
                if not emp:
                    no = ev.get("employeeNo") or ""
                    if no and no not in self._warned:
                        self._warned.add(no)
                        self.log(f"تنبيه: رقم بصمة {no} غير مربوط بموظف — اكتبه في بطاقة الموظف (رقم البصمة)")
                    continue  # يبقى معلّقاً حتى يُربط
                date, clock = ev.get("date"), ev.get("clock")
                if not date or not clock:
                    done.add(ev["_key"])
                    continue
                g = groups.setdefault((emp["id"], date), {"emp": emp, "times": [], "keys": []})
                g["times"].append(clock)
                g["keys"].append(ev["_key"])

            by_date = {}
            for (eid, date) in groups:
                by_date.setdefault(date, None)
            for date in by_date:
                rows = self._req("GET", "records", {
                    "company_id": f"eq.{cid}", "tbl": "eq.attendance",
                    "data->>date": f"eq.{date}", "select": "id,data,created_at", "limit": 2000,
                }) or []
                by_date[date] = {(r["data"] or {}).get("employee_id"): r for r in rows}

            for (eid, date), g in groups.items():
                existing = by_date[date].get(eid)
                ex = (existing or {}).get("data") or {}
                seen = set(ex.get("punches") or [])
                new_times = sorted({t for t in g["times"] if t not in seen})
                if existing and not new_times:
                    done.update(g["keys"])
                    continue
                all_t = sorted({t for t in [ex.get("check_in"), ex.get("check_out")] + new_times if t})
                check_in = all_t[0] if all_t else ""
                check_out = all_t[-1] if len(all_t) > 1 else ""
                status, late, ot = self._calc(check_in, check_out)
                if ex.get("status") == "leave" and not new_times:
                    status = "leave"
                punches = sorted(seen | set(new_times))
                if existing:
                    data = dict(ex)
                    data.update({"check_in": check_in, "check_out": check_out, "status": status,
                                 "late_min": late, "ot_min": ot, "source": SOURCE_LABEL, "punches": punches})
                    self._req("PATCH", "records",
                              {"company_id": f"eq.{cid}", "id": f"eq.{existing['id']}"},
                              {"data": data}, prefer="return=minimal")
                else:
                    now = datetime.now(timezone.utc).isoformat()
                    data = {"employee_id": eid, "date": date, "status": status, "check_in": check_in,
                            "check_out": check_out, "notes": "", "late_min": late, "ot_min": ot,
                            "source": SOURCE_LABEL, "punches": punches, "created_at": now}
                    self._req("POST", "records", None,
                              {"company_id": cid, "id": str(uuid.uuid4()), "tbl": "attendance",
                               "data": data, "created_at": now}, prefer="return=minimal")
                    by_date[date][eid] = {"id": "x", "data": data}
                done.update(g["keys"])
                self.log(f"↑ {emp_name(g['emp'])} · {date} · دخول {check_in} خروج {check_out or '—'}")
            self.ok = True
            self.msg = "متصل بالنظام السحابي"
        except Exception as e:
            self.ok = False
            self.msg = str(e)
            self.log(f"فشل الرفع للنظام (سيُعاد المحاولة): {e}")
        return done


def emp_name(row):
    return (row.get("data") or {}).get("name") or row.get("id")
