(async function () {
  var page = await UI.init("projects");
  if (!page) return;
  var html = UI.html, money = UI.money, esc = (window.Ledger && Ledger.esc) || function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); };

  var projects = [], customers = [], issues = [], extracts = [];

  page.innerHTML = html`
    <div class="stack">
      <div class="page-toolbar">
        <div>
          <h2 style="margin:0">المشاريع</h2>
          <p class="muted" style="margin:4px 0 0;font-size:12px">مشاريع الألوميتال والكلادينج · التكاليف · الإنجاز · المستخلصات</p>
        </div>
        <div class="row gap wrap">
          <button type="button" class="primary" id="btn-add">+ مشروع جديد</button>
        </div>
      </div>
      <div class="stats" id="stats"></div>
      <div class="row gap wrap" style="align-items:center">
        <input id="q" placeholder="بحث بالاسم أو الكود أو الموقع..." autocomplete="off" style="flex:1 1 240px;max-width:380px">
        <select id="status-filter" style="max-width:180px">
          <option value="">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="completed">مكتمل</option>
          <option value="on_hold">موقوف</option>
          <option value="cancelled">ملغي</option>
        </select>
      </div>
      <div class="card table-wrap" id="list"></div>
    </div>`;

  function custName(id) {
    var c = customers.find(function (x) { return x.id === id; });
    return c ? c.name : "—";
  }

  function projectCost(pid) {
    return issues.filter(function (i) { return i.project_id === pid; })
      .reduce(function (s, i) { return s + (Number(i.qty) || 0) * (Number(i.unit_cost) || 0); }, 0);
  }

  function projectExtractsTotal(pid) {
    return extracts.filter(function (e) { return e.project_id === pid; })
      .reduce(function (s, e) { return s + (Number(e.amount) || 0); }, 0);
  }

  function statusBadge(st) {
    var map = { active: ["نشط", "ok"], completed: ["مكتمل", "teal"], on_hold: ["موقوف", "amber"], cancelled: ["ملغي", "err"] };
    var m = map[st] || [st || "—", ""];
    return '<span class="badge ' + m[1] + '">' + m[0] + "</span>";
  }

  function render() {
    var q = (document.getElementById("q").value || "").toLowerCase();
    var st = document.getElementById("status-filter").value || "";
    var rows = projects.filter(function (p) {
      if (st && p.status !== st) return false;
      if (!q) return true;
      var hay = (p.code || "") + " " + (p.name || "") + " " + (p.location || "") + " " + custName(p.customer_id);
      return hay.toLowerCase().indexOf(q) !== -1;
    });

    var active = projects.filter(function (p) { return p.status === "active"; }).length;
    var totalValue = projects.reduce(function (s, p) { return s + (Number(p.contract_value) || 0); }, 0);
    var totalCost = projects.reduce(function (s, p) { return s + projectCost(p.id); }, 0);
    var avgProg = projects.length ? Math.round(projects.reduce(function (s, p) { return s + (Number(p.progress_pct) || 0); }, 0) / projects.length) : 0;

    document.getElementById("stats").innerHTML = html`
      <div class="stat teal"><div class="label">عدد المشاريع</div><div class="value">${projects.length}</div></div>
      <div class="stat"><div class="label">نشطة</div><div class="value">${active}</div></div>
      <div class="stat amber"><div class="label">قيمة العقود</div><div class="value">${money(totalValue)}</div></div>
      <div class="stat"><div class="label">تكاليف الخامات</div><div class="value">${money(totalCost)}</div></div>
      <div class="stat"><div class="label">متوسط الإنجاز</div><div class="value">${avgProg}%</div></div>`;

    var body = rows.length ? rows.map(function (p) {
      var cost = projectCost(p.id);
      var ext = projectExtractsTotal(p.id);
      var prog = Number(p.progress_pct) || 0;
      return '<tr>' +
        '<td><b dir="ltr">' + esc(p.code || "") + '</b></td>' +
        '<td><b>' + esc(p.name) + '</b><div class="muted" style="font-size:11px">' + esc(p.location || "") + '</div></td>' +
        '<td>' + esc(custName(p.customer_id)) + '</td>' +
        '<td>' + statusBadge(p.status) + '</td>' +
        '<td>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
          '<div style="flex:1;height:8px;background:var(--surface-3);border-radius:4px;overflow:hidden"><div style="height:100%;width:' + prog + '%;background:var(--accent);border-radius:4px"></div></div>' +
          '<span style="font-size:12px;min-width:36px">' + prog + '%</span></div>' +
        '</td>' +
        '<td>' + money(p.contract_value) + '</td>' +
        '<td>' + money(cost) + '</td>' +
        '<td>' + money(ext) + '</td>' +
        '<td><div class="actions-cell">' +
          '<button class="small" data-id="' + esc(p.id) + '" data-act="edit">تعديل</button> ' +
          '<button class="small danger" data-id="' + esc(p.id) + '" data-act="del">حذف</button>' +
        '</div></td></tr>';
    }).join("") : '<tr><td colspan="9" class="empty">لا توجد مشاريع</td></tr>';

    document.getElementById("list").innerHTML =
      '<table><thead><tr><th>الكود</th><th>المشروع</th><th>العميل</th><th>الحالة</th><th>الإنجاز</th><th>قيمة العقد</th><th>تكلفة الخامات</th><th>المستخلصات</th><th></th></tr></thead><tbody>' +
      body + "</tbody></table>";
  }

  function openForm(p) {
    var isNew = !p;
    p = p || { code: "", name: "", customer_id: "", status: "active", start_date: new Date().toISOString().slice(0, 10), contract_value: 0, progress_pct: 0, location: "", notes: "" };
    var custOpts = customers.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === p.customer_id ? " selected" : "") + ">" + esc(c.name) + "</option>";
    }).join("");
    var body = html`
      <div class="form-grid">
        <label>الكود<input id="f-code" value="${esc(p.code)}" placeholder="PRJ-001" dir="ltr"></label>
        <label>اسم المشروع<input id="f-name" value="${esc(p.name)}" required></label>
        <label>العميل<select id="f-customer"><option value="">— اختر —</option>${custOpts}</select></label>
        <label>الحالة<select id="f-status">
          <option value="active"${p.status === "active" ? " selected" : ""}>نشط</option>
          <option value="completed"${p.status === "completed" ? " selected" : ""}>مكتمل</option>
          <option value="on_hold"${p.status === "on_hold" ? " selected" : ""}>موقوف</option>
          <option value="cancelled"${p.status === "cancelled" ? " selected" : ""}>ملغي</option>
        </select></label>
        <label>تاريخ البدء<input type="date" id="f-start" value="${esc(p.start_date || "")}"></label>
        <label>قيمة العقد (ج.م)<input type="number" id="f-value" value="${p.contract_value || 0}" min="0" step="1"></label>
        <label>نسبة الإنجاز %<input type="number" id="f-prog" value="${p.progress_pct || 0}" min="0" max="100" step="1"></label>
        <label>الموقع<input id="f-loc" value="${esc(p.location || "")}"></label>
        <label class="full">ملاحظات<textarea id="f-notes" rows="2">${esc(p.notes || "")}</textarea></label>
      </div>`;
    UI.modal({
      title: isNew ? "مشروع جديد" : "تعديل مشروع",
      body: body,
      ok: isNew ? "إضافة" : "حفظ",
      onOk: async function () {
        var name = (document.getElementById("f-name").value || "").trim();
        if (!name) { UI.toast("اسم المشروع مطلوب", true); return false; }
        var data = {
          code: (document.getElementById("f-code").value || "").trim(),
          name: name,
          customer_id: document.getElementById("f-customer").value || "",
          status: document.getElementById("f-status").value,
          start_date: document.getElementById("f-start").value,
          contract_value: Number(document.getElementById("f-value").value) || 0,
          progress_pct: Math.min(100, Math.max(0, Number(document.getElementById("f-prog").value) || 0)),
          location: (document.getElementById("f-loc").value || "").trim(),
          notes: (document.getElementById("f-notes").value || "").trim(),
        };
        try {
          if (isNew) {
            data.created_at = new Date().toISOString();
            await DB.insert("projects", data);
            UI.toast("تم إضافة المشروع");
          } else {
            await DB.update("projects", p.id, data);
            UI.toast("تم الحفظ");
          }
          await load();
        } catch (e) {
          UI.toast(e.message || "خطأ", true);
          return false;
        }
      },
    });
  }

  document.getElementById("btn-add").onclick = function () { openForm(null); };
  document.getElementById("q").oninput = render;
  document.getElementById("status-filter").onchange = render;
  document.getElementById("list").onclick = async function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    var act = btn.getAttribute("data-act");
    var p = projects.find(function (x) { return x.id === id; });
    if (!p) return;
    if (act === "edit") openForm(p);
    if (act === "del") {
      if (!confirm("حذف المشروع «" + p.name + "»؟")) return;
      try {
        await DB.remove("projects", id);
        UI.toast("تم الحذف");
        await load();
      } catch (err) {
        UI.toast(err.message || "خطأ", true);
      }
    }
  };

  async function load() {
    try {
      var res = await Promise.all([
        DB.list("projects"),
        DB.list("customers"),
        DB.list("project_issues"),
        DB.list("project_extracts"),
      ]);
      projects = res[0] || [];
      customers = res[1] || [];
      issues = res[2] || [];
      extracts = res[3] || [];
      render();
    } catch (e) {
      UI.toast(e.message || "تعذر التحميل", true);
    }
  }

  await load();
})();
