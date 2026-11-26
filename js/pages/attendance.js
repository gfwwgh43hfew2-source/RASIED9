(async function () {
  var page = await UI.init("attendance");
  if (!page) return;
  var html = UI.html, esc = Ledger.esc, val = Ledger.val;
  var emps = [], recs = [], view = "day";
  var ST = { present: ["حاضر", "ok"], late: ["متأخر", "warn"], absent: ["غائب", "err"], leave: ["إجازة", ""] };

  // إعدادات الدوام الافتراضية (يمكن تعديلها من الواجهة)
  var WORK = { start: "08:00", end: "17:00", grace_min: 15, ot_after: "17:00" };

  page.innerHTML = html`
    <div class="stack">
      <div class="page-toolbar">
        <div>
          <h2 style="margin:0">الحضور والانصراف</h2>
          <p class="muted" style="margin:4px 0 0;font-size:12px">
            يدعم جهاز <b>Hikvision DS-K1A8603EF</b> · استيراد بصمات · تأخير وإضافي وغياب تلقائي
          </p>
        </div>
        <div class="row gap wrap">
          <button type="button" class="small" id="btn-settings">إعدادات الدوام</button>
          <button type="button" class="small" id="btn-import">استيراد من البصمة</button>
          <button type="button" id="csv">تصدير Excel</button>
        </div>
      </div>

      <div class="row gap wrap" style="align-items:center;margin-bottom:4px">
        <div id="bridge-status"><span class="badge">○ جاري فحص الاتصال بالبصمة...</span></div>
      </div>
      <div class="card" style="padding:12px 16px;background:var(--surface-2)">
        <div style="font-size:12.5px;line-height:1.7">
          <b>البصمة المباشرة (Hikvision DS-K1A8603EF):</b>
          <ol style="margin:6px 0 0;padding-inline-start:20px">
            <li>وصّل الجهاز والكمبيوتر على <b>نفس الراوتر</b>.</li>
            <li>على الكمبيوتر شغّل ملف الجسر: <code>bridge/hikvision_bridge.py</code> (بعد تعديل IP الجهاز).</li>
            <li>بمجرد ما الموظف يبصم → ينزل تلقائياً هنا خلال ثوانٍ.</li>
            <li>تأكد أن <b>رقم البصمة</b> في بطاقة الموظف = Employee No على الجهاز.</li>
            <li>بديل: زر «استيراد من البصمة» لرفع ملف CSV من iVMS-4200.</li>
          </ol>
        </div>
      </div>

      <div class="seg" id="seg">
        <button type="button" class="on" data-v="day">تسجيل اليوم</button>
        <button type="button" data-v="month">ملخص الشهر</button>
        <button type="button" data-v="punches">سجل البصمات</button>
      </div>
      <div class="card"><div class="form-grid">
        <div class="field" id="f-day"><label>اليوم</label><input type="date" id="day" value="${Ledger.today()}"></div>
        <div class="field" id="f-month" style="display:none"><label>الشهر</label><input type="month" id="month" value="${Ledger.today().slice(0, 7)}"></div>
      </div></div>
      <div class="stats" id="stats"></div>
      <div class="card table-wrap" id="tbl"></div>
      <input type="file" id="file-import" accept=".csv,.txt,.xlsx,.xls" style="display:none">
    </div>`;

  function loadWorkSettings() {
    try {
      var s = localStorage.getItem("att_work_settings");
      if (s) Object.assign(WORK, JSON.parse(s));
    } catch (e) {}
  }
  function saveWorkSettings() {
    try { localStorage.setItem("att_work_settings", JSON.stringify(WORK)); } catch (e) {}
  }
  loadWorkSettings();


  // —— جسر البصمة المباشر (Hikvision bridge على 127.0.0.1:8765) ——
  var BRIDGE_URL = "http://127.0.0.1:8765";
  var bridgeConnected = false;
  var bridgeTimer = null;
  var seenKeys = {};

  function setBridgeStatus(ok, msg) {
    bridgeConnected = ok;
    var el = document.getElementById("bridge-status");
    if (!el) return;
    el.innerHTML = ok
      ? '<span class="badge ok">● متصل بالبصمة</span> <span class="muted" style="font-size:11px">' + esc(msg || "") + '</span>'
      : '<span class="badge err">○ البصمة غير متصلة</span> <span class="muted" style="font-size:11px">' + esc(msg || "شغّل برنامج الجسر على الكمبيوتر") + '</span>';
  }

  async function pullBridge() {
    try {
      var st = await fetch(BRIDGE_URL + "/status", { signal: AbortSignal.timeout(2500) }).then(function (r) { return r.json(); });
      setBridgeStatus(!!st.ok, (st.device && (st.device.model || st.device.deviceName)) ? (st.device.model || st.device.deviceName) : (st.message || ""));
      if (st.cloud) {
        // الجسر يرفع البصمات للنظام مباشرة — الصفحة تكتفي بإعادة القراءة
        if (!st.cloud_ok) setBridgeStatus(false, "الجسر لا يستطيع الرفع للنظام: " + (st.cloud_msg || ""));
        else if (st.pending) setBridgeStatus(true, "بصمات بانتظار الرفع: " + st.pending);
        return;
      }
      var data = await fetch(BRIDGE_URL + "/events/today", { signal: AbortSignal.timeout(4000) }).then(function (r) { return r.json(); });
      var list = (data && data.events) || [];
      var added = 0;
      // تجميع لكل موظف+يوم
      var byEmp = {};
      list.forEach(function (ev) {
        var key = (ev.employeeNo || "") + "|" + (ev.time || "");
        if (seenKeys[key]) return;
        seenKeys[key] = 1;
        var emp = empByFp(ev.employeeNo);
        if (!emp) return;
        var date = ev.date || (ev.time || "").slice(0, 10);
        var clock = ev.clock || ((ev.time || "").slice(11, 16));
        if (!date || !clock) return;
        var k2 = emp.id + "|" + date;
        if (!byEmp[k2]) byEmp[k2] = { empId: emp.id, date: date, times: [] };
        byEmp[k2].times.push(clock);
        added++;
      });
      for (var k2 in byEmp) {
        var g = byEmp[k2];
        g.times.sort();
        var existing = rec(g.empId, g.date) || {};
        var allTimes = (existing.check_in ? [existing.check_in] : []).concat(existing.check_out ? [existing.check_out] : []).concat(g.times);
        allTimes = allTimes.filter(Boolean).sort();
        var checkIn = allTimes[0] || "";
        var checkOut = allTimes.length > 1 ? allTimes[allTimes.length - 1] : "";
        var calc = calcStatus(checkIn, checkOut);
        await save(g.empId, g.date, {
          check_in: checkIn,
          check_out: checkOut,
          status: calc.status,
          late_min: calc.late_min,
          ot_min: calc.ot_min,
          source: "Hikvision مباشر",
        });
      }
      if (added > 0) {
        UI.toast("بصمة جديدة: " + added + " سجل");
        draw();
      }
    } catch (e) {
      setBridgeStatus(false, "شغّل bridge/hikvision_bridge.py على الكمبيوتر");
    }
  }

  function startBridgePoll() {
    if (bridgeTimer) clearInterval(bridgeTimer);
    pullBridge();
    bridgeTimer = setInterval(pullBridge, 5000);
  }


  function toMin(t) {
    if (!t) return null;
    var p = String(t).replace(/\./g, ":").split(":");
    if (p.length < 2) return null;
    return Number(p[0]) * 60 + Number(p[1]);
  }
  function calcStatus(checkIn, checkOut) {
    var ci = toMin(checkIn);
    if (ci == null) return { status: "absent", late_min: 0, ot_min: 0 };
    var start = toMin(WORK.start) || 8 * 60;
    var grace = Number(WORK.grace_min) || 0;
    var late = Math.max(0, ci - start - grace);
    var status = late > 0 ? "late" : "present";
    var ot = 0;
    var co = toMin(checkOut);
    var otStart = toMin(WORK.ot_after || WORK.end) || 17 * 60;
    if (co != null && co > otStart) ot = co - otStart;
    return { status: status, late_min: late, ot_min: ot };
  }

  function empByFp(fpId) {
    var id = String(fpId || "").trim();
    if (!id) return null;
    return emps.find(function (e) {
      return String(e.fp_id || e.fingerprint_id || e.code || "").trim() === id ||
        String(e.id) === id;
    }) || null;
  }

  function rec(empId, d) {
    return recs.filter(function (r) { return r.employee_id === empId && r.date === d; })[0];
  }
  async function save(empId, d, patch) {
    var r = rec(empId, d);
    if (r) { await DB.update("attendance", r.id, patch); Object.assign(r, patch); return r; }
    var row = await DB.insert("attendance", Object.assign({
      employee_id: empId, date: d, status: "present",
      check_in: "", check_out: "", notes: "", late_min: 0, ot_min: 0,
    }, patch));
    recs.push(row);
    return row;
  }

  function drawDay() {
    var d = val("day"), active = emps.filter(function (e) { return e.status !== "inactive"; });
    var cnt = { present: 0, late: 0, absent: 0, leave: 0, none: 0 };
    active.forEach(function (e) { var r = rec(e.id, d); cnt[r ? r.status : "none"]++; });
    document.getElementById("stats").innerHTML = html`
      <div class="stat green"><div class="label">حاضر</div><div class="value">${cnt.present}</div></div>
      <div class="stat amber"><div class="label">متأخر</div><div class="value">${cnt.late}</div></div>
      <div class="stat red"><div class="label">غائب</div><div class="value">${cnt.absent}</div></div>
      <div class="stat"><div class="label">لم يُسجَّل</div><div class="value">${cnt.none}</div></div>`;
    document.getElementById("tbl").innerHTML = html`
      <table><thead><tr><th>الموظف</th><th>رقم البصمة</th><th>الحالة</th><th>حضور</th><th>انصراف</th><th>تأخير (د)</th><th>إضافي (د)</th><th>ملاحظات</th></tr></thead><tbody>
        ${active.map(function (e) {
          var r = rec(e.id, d) || {};
          return html`<tr data-e="${e.id}">
            <td><b>${e.name}</b><div class="muted" style="font-size:11.5px">${e.job_title || ""}</div></td>
            <td dir="ltr">${esc(e.fp_id || e.fingerprint_id || e.code || "—")}</td>
            <td><select data-k="status"><option value="">—</option>${Object.keys(ST).map(function (k) {
              return '<option value="' + k + '"' + (r.status === k ? " selected" : "") + ">" + ST[k][0] + "</option>";
            }).join("")}</select></td>
            <td><input type="time" data-k="check_in" value="${r.check_in || ""}"></td>
            <td><input type="time" data-k="check_out" value="${r.check_out || ""}"></td>
            <td dir="ltr">${r.late_min || 0}</td>
            <td dir="ltr">${r.ot_min || 0}</td>
            <td><input data-k="notes" value="${esc(r.notes || "")}" placeholder="ملاحظة"></td>
          </tr>`;
        }).join("") || html`<tr><td colspan="8" class="empty">لا يوجد موظفون. أضفهم من صفحة الموظفين وضع رقم البصمة.</td></tr>`}
      </tbody></table>`;
  }

  function monthRows() {
    var m = val("month");
    return emps.map(function (e) {
      var mine = recs.filter(function (r) { return r.employee_id === e.id && String(r.date).slice(0, 7) === m; });
      var c = function (s) { return mine.filter(function (r) { return r.status === s; }).length; };
      var lateMin = mine.reduce(function (s, r) { return s + (Number(r.late_min) || 0); }, 0);
      var otMin = mine.reduce(function (s, r) { return s + (Number(r.ot_min) || 0); }, 0);
      return { e: e, present: c("present"), late: c("late"), absent: c("absent"), leave: c("leave"), lateMin: lateMin, otMin: otMin };
    });
  }
  function drawMonth() {
    var rows = monthRows();
    var totalLate = rows.reduce(function (s, r) { return s + r.lateMin; }, 0);
    var totalOt = rows.reduce(function (s, r) { return s + r.otMin; }, 0);
    document.getElementById("stats").innerHTML = html`
      <div class="stat amber"><div class="label">إجمالي دقائق التأخير</div><div class="value">${UI.num(totalLate)}</div></div>
      <div class="stat teal"><div class="label">إجمالي دقائق الإضافي</div><div class="value">${UI.num(totalOt)}</div></div>`;
    document.getElementById("tbl").innerHTML = html`
      <table><thead><tr><th>الموظف</th><th>حضور</th><th>تأخير (أيام)</th><th>غياب</th><th>إجازات</th><th>دقائق تأخير</th><th>دقائق إضافي</th></tr></thead><tbody>
        ${rows.map(function (r) {
          return html`<tr>
            <td><b>${r.e.name}</b></td>
            <td>${r.present}</td><td>${r.late}</td>
            <td class="${r.absent ? "accent" : ""}">${r.absent}</td>
            <td>${r.leave}</td>
            <td dir="ltr">${r.lateMin}</td><td dir="ltr">${r.otMin}</td>
          </tr>`;
        }).join("") || html`<tr><td colspan="7" class="empty">لا توجد بيانات</td></tr>`}
      </tbody></table>`;
  }

  function drawPunches() {
    var m = val("month") || val("day").slice(0, 7);
    var mine = recs.filter(function (r) { return String(r.date).slice(0, 7) === m; })
      .slice().sort(function (a, b) { return (b.date + b.check_in).localeCompare(a.date + a.check_in); });
    document.getElementById("stats").innerHTML = html`
      <div class="stat"><div class="label">سجلات الشهر</div><div class="value">${mine.length}</div></div>`;
    document.getElementById("tbl").innerHTML = html`
      <table><thead><tr><th>التاريخ</th><th>الموظف</th><th>حضور</th><th>انصراف</th><th>الحالة</th><th>تأخير</th><th>إضافي</th><th>مصدر</th></tr></thead><tbody>
        ${mine.map(function (r) {
          var e = emps.find(function (x) { return x.id === r.employee_id; });
          var st = ST[r.status] || [r.status || "—", ""];
          return html`<tr>
            <td dir="ltr">${r.date}</td>
            <td><b>${e ? e.name : "—"}</b></td>
            <td dir="ltr">${r.check_in || "—"}</td>
            <td dir="ltr">${r.check_out || "—"}</td>
            <td><span class="badge ${st[1]}">${st[0]}</span></td>
            <td dir="ltr">${r.late_min || 0} د</td>
            <td dir="ltr">${r.ot_min || 0} د</td>
            <td class="muted" style="font-size:11px">${esc(r.source || "يدوي")}</td>
          </tr>`;
        }).join("") || html`<tr><td colspan="8" class="empty">لا توجد بصمات مستوردة لهذا الشهر</td></tr>`}
      </tbody></table>`;
  }

  function draw() {
    if (view === "day") drawDay();
    else if (view === "month") drawMonth();
    else drawPunches();
  }

  // —— استيراد CSV من Hikvision / iVMS-4200 ——
  function parseCSV(text) {
    var lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    // اكتشاف الفاصل
    var sep = (lines[0].split(";").length > lines[0].split(",").length) ? ";" : ",";
    function split(line) {
      var out = [], cur = "", q = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === '"') { q = !q; continue; }
        if (!q && ch === sep) { out.push(cur.trim()); cur = ""; continue; }
        cur += ch;
      }
      out.push(cur.trim());
      return out;
    }
    var headers = split(lines[0]).map(function (h) { return h.toLowerCase().replace(/\s+/g, " "); });
    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var cols = split(lines[i]);
      var obj = {};
      headers.forEach(function (h, j) { obj[h] = cols[j] || ""; });
      rows.push(obj);
    }
    return rows;
  }

  function pickField(row, names) {
    for (var i = 0; i < names.length; i++) {
      var n = names[i].toLowerCase();
      for (var k in row) {
        if (k.indexOf(n) !== -1 && row[k]) return row[k];
      }
    }
    return "";
  }

  function normalizeTime(t) {
    t = String(t || "").trim();
    // 2024-01-15 08:30:00 أو 08:30 أو 8:30 AM
    var m = t.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
    if (!m) return "";
    var h = Number(m[1]), min = m[2], ap = (m[3] || "").toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return (h < 10 ? "0" : "") + h + ":" + min;
  }

  function normalizeDate(d) {
    d = String(d || "").trim();
    // 2024-01-15 أو 15/01/2024 أو 15-01-2024
    var m = d.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) return m[1] + "-" + (m[2].length < 2 ? "0" : "") + m[2] + "-" + (m[3].length < 2 ? "0" : "") + m[3];
    m = d.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if (m) return m[3] + "-" + (m[2].length < 2 ? "0" : "") + m[2] + "-" + (m[1].length < 2 ? "0" : "") + m[1];
    // datetime combined
    m = d.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    return "";
  }

  async function importHikvisionCSV(text) {
    var rows = parseCSV(text);
    if (!rows.length) { UI.toast("الملف فارغ أو غير مفهوم", true); return; }

    // تجميع: لكل موظف+يوم → أول بصمة = حضور، آخر = انصراف
    var map = {}; // key: empId|date → { times: [], name }
    var unmatched = 0, matched = 0;

    rows.forEach(function (row) {
      var fpId = pickField(row, ["employee no", "employee no.", "person id", "personid", "user id", "userid", "id", "رقم", "employee", "emp no", "no."]);
      var name = pickField(row, ["name", "person name", "الاسم", "employee name"]);
      var dt = pickField(row, ["time", "datetime", "date time", "event time", "timestamp", "الوقت", "التوقيت"]);
      var dateOnly = pickField(row, ["date", "التاريخ"]);
      var timeOnly = "";

      if (dt && dt.indexOf(" ") !== -1) {
        var parts = dt.split(/\s+/);
        dateOnly = dateOnly || parts[0];
        timeOnly = parts[1] || "";
      } else if (dt && dt.indexOf(":") !== -1 && !dateOnly) {
        timeOnly = dt;
      } else if (dt) {
        dateOnly = dateOnly || dt;
      }

      var date = normalizeDate(dateOnly);
      var time = normalizeTime(timeOnly || dt);
      if (!date || !time) return;

      var emp = empByFp(fpId);
      if (!emp && name) {
        emp = emps.find(function (e) { return e.name && e.name.indexOf(name) !== -1; }) || null;
      }
      if (!emp) { unmatched++; return; }
      matched++;

      var key = emp.id + "|" + date;
      if (!map[key]) map[key] = { empId: emp.id, date: date, times: [] };
      map[key].times.push(time);
    });

    var imported = 0;
    for (var key in map) {
      var g = map[key];
      g.times.sort();
      var checkIn = g.times[0];
      var checkOut = g.times.length > 1 ? g.times[g.times.length - 1] : "";
      var calc = calcStatus(checkIn, checkOut);
      await save(g.empId, g.date, {
        check_in: checkIn,
        check_out: checkOut,
        status: calc.status,
        late_min: calc.late_min,
        ot_min: calc.ot_min,
        source: "Hikvision DS-K1A8603EF",
        notes: g.times.length > 2 ? ("بصمات: " + g.times.length) : "",
      });
      imported++;
    }

    UI.toast("تم استيراد " + imported + " يوم حضور" + (unmatched ? " · " + unmatched + " سجل بدون مطابقة موظف" : ""));
    await reload();
  }

  document.getElementById("btn-import").onclick = function () {
    document.getElementById("file-import").click();
  };
  document.getElementById("file-import").onchange = function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = async function () {
      try {
        await importHikvisionCSV(String(reader.result || ""));
      } catch (err) {
        UI.toast(err.message || "فشل الاستيراد", true);
      }
      e.target.value = "";
    };
    reader.readAsText(f, "UTF-8");
  };

  document.getElementById("btn-settings").onclick = function () {
    var body = html`
      <div class="form-grid">
        <label>بداية الدوام<input type="time" id="w-start" value="${WORK.start}"></label>
        <label>نهاية الدوام<input type="time" id="w-end" value="${WORK.end}"></label>
        <label>سماح التأخير (دقائق)<input type="number" id="w-grace" value="${WORK.grace_min}" min="0" max="120"></label>
        <label>بداية حساب الإضافي<input type="time" id="w-ot" value="${WORK.ot_after || WORK.end}"></label>
      </div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">أي حضور بعد (البداية + السماح) يُحسب تأخيراً. أي انصراف بعد وقت الإضافي يُحسب دقائق إضافية.</p>`;
    UI.modal({
      title: "إعدادات الدوام",
      body: body,
      ok: "حفظ",
      onOk: function () {
        WORK.start = document.getElementById("w-start").value || "08:00";
        WORK.end = document.getElementById("w-end").value || "17:00";
        WORK.grace_min = Number(document.getElementById("w-grace").value) || 0;
        WORK.ot_after = document.getElementById("w-ot").value || WORK.end;
        saveWorkSettings();
        UI.toast("تم حفظ إعدادات الدوام");
        draw();
      },
    });
  };

  document.getElementById("tbl").addEventListener("change", async function (e) {
    var tr = e.target.closest("tr[data-e]"), k = e.target.getAttribute("data-k");
    if (!tr || !k) return;
    var patch = {};
    patch[k] = e.target.value;
    if (k === "check_in" || k === "check_out") {
      var r = rec(tr.getAttribute("data-e"), val("day")) || {};
      var ci = k === "check_in" ? e.target.value : (r.check_in || "");
      var co = k === "check_out" ? e.target.value : (r.check_out || "");
      var calc = calcStatus(ci, co);
      patch.status = calc.status;
      patch.late_min = calc.late_min;
      patch.ot_min = calc.ot_min;
    }
    if (k !== "status" && !rec(tr.getAttribute("data-e"), val("day"))) patch.status = patch.status || "present";
    try {
      await save(tr.getAttribute("data-e"), val("day"), patch);
      drawDay();
      UI.toast("تم الحفظ");
    } catch (err) {
      UI.toast(err.message, true);
    }
  });

  document.getElementById("seg").onclick = function (e) {
    var b = e.target.closest("[data-v]");
    if (!b) return;
    view = b.getAttribute("data-v");
    document.querySelectorAll("#seg button").forEach(function (x) { x.classList.toggle("on", x === b); });
    document.getElementById("f-day").style.display = view === "day" ? "" : "none";
    document.getElementById("f-month").style.display = (view === "month" || view === "punches") ? "" : "none";
    if (view === "punches" && !val("month")) document.getElementById("month").value = Ledger.today().slice(0, 7);
    draw();
  };
  document.getElementById("day").onchange = draw;
  document.getElementById("month").onchange = draw;
  document.getElementById("csv").onclick = function () {
    var rows = monthRows();
    UI.exportCSV("حضور-" + (val("month") || val("day").slice(0, 7)) + ".csv",
      ["الموظف", "حضور", "تأخير (أيام)", "غياب", "إجازات", "دقائق تأخير", "دقائق إضافي"],
      rows.map(function (r) { return [r.e.name, r.present, r.late, r.absent, r.leave, r.lateMin, r.otMin]; }));
  };

  async function reload() {
    var d = await Promise.all([DB.list("employees"), DB.list("attendance")]);
    emps = d[0].slice().reverse();
    recs = d[1];
    draw();
  }
  await reload();
  startBridgePoll();
  // تحديث تلقائي: البصمات التي يرفعها الجسر تظهر هنا (وعلى الموبايل) خلال ثوانٍ
  var autoTimer = setInterval(async function () {
    if (!document.getElementById("seg")) { clearInterval(autoTimer); return; }
    try {
      if (window.DB && DB.refresh) DB.refresh("attendance");
      var before = recs.length + "|" + recs.map(function (r) { return r.check_in + r.check_out; }).join(",");
      var fresh = await DB.list("attendance");
      var after = fresh.length + "|" + fresh.map(function (r) { return r.check_in + r.check_out; }).join(",");
      recs = fresh;
      if (before !== after) draw();
    } catch (e) {}
  }, 15000);
})();
