(async function () {
  var page = await UI.init("project-extracts");
  if (!page) return;
  var html = UI.html, money = UI.money, esc = (window.Ledger && Ledger.esc) || function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); };

  var extracts = [], projects = [], customers = [];

  page.innerHTML = html`
    <div class="stack">
      <div class="page-toolbar">
        <div>
          <h2 style="margin:0">المستخلصات</h2>
          <p class="muted" style="margin:4px 0 0;font-size:12px">مستخلصات الأعمال والدفعات حسب المشاريع · نسبة الإنجاز</p>
        </div>
        <div class="row gap wrap">
          <button type="button" class="primary" id="btn-add">+ مستخلص جديد</button>
        </div>
      </div>
      <div class="stats" id="stats"></div>
      <div class="row gap wrap" style="align-items:center">
        <input id="q" placeholder="بحث..." autocomplete="off" style="flex:1 1 200px;max-width:300px">
        <select id="prj-filter" style="max-width:260px"><option value="">كل المشاريع</option></select>
        <select id="st-filter" style="max-width:160px">
          <option value="">كل الحالات</option>
          <option value="pending">معلق</option>
          <option value="approved">معتمد</option>
          <option value="paid">مدفوع</option>
        </select>
      </div>
      <div class="card table-wrap" id="list"></div>
    </div>`;

  function prjName(id) {
    var p = projects.find(function (x) { return x.id === id; });
    return p ? (p.code ? p.code + " — " : "") + p.name : "—";
  }

  function statusBadge(st) {
    var map = { pending: ["معلق", "amber"], approved: ["معتمد", "ok"], paid: ["مدفوع", "teal"] };
    var m = map[st] || [st || "—", ""];
    return '<span class="badge ' + m[1] + '">' + m[0] + "</span>";
  }

  function fillFilters() {
    var sel = document.getElementById("prj-filter");
    var cur = sel.value;
    sel.innerHTML = '<option value="">كل المشاريع</option>' + projects.map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc((p.code || "") + " " + p.name) + "</option>";
    }).join("");
    if (cur) sel.value = cur;
  }

  function render() {
    var q = (document.getElementById("q").value || "").toLowerCase();
    var prj = document.getElementById("prj-filter").value || "";
    var st = document.getElementById("st-filter").value || "";
    var rows = extracts.filter(function (e) {
      if (prj && e.project_id !== prj) return false;
      if (st && e.status !== st) return false;
      if (!q) return true;
      return (prjName(e.project_id) + " " + (e.description || "") + " " + (e.number || "")).toLowerCase().indexOf(q) !== -1;
    });

    var total = rows.reduce(function (s, e) { return s + (Number(e.amount) || 0); }, 0);
    var approved = rows.filter(function (e) { return e.status === "approved" || e.status === "paid"; })
      .reduce(function (s, e) { return s + (Number(e.amount) || 0); }, 0);

    document.getElementById("stats").innerHTML = html`
      <div class="stat teal"><div class="label">عدد المستخلصات</div><div class="value">${rows.length}</div></div>
      <div class="stat amber"><div class="label">إجمالي المبالغ</div><div class="value">${money(total)}</div></div>
      <div class="stat"><div class="label">المعتمد / المدفوع</div><div class="value">${money(approved)}</div></div>`;

    var body = rows.length ? rows.map(function (e) {
      return '<tr>' +
        '<td dir="ltr">#' + (e.number || "—") + '</td>' +
        '<td>' + esc(e.date || "") + '</td>' +
        '<td>' + esc(prjName(e.project_id)) + '</td>' +
        '<td>' + esc(e.description || "") + '</td>' +
        '<td><b>' + money(e.amount) + '</b></td>' +
        '<td>' + statusBadge(e.status) + '</td>' +
        '<td><div class="actions-cell">' +
          '<button class="small" data-id="' + esc(e.id) + '" data-act="edit">تعديل</button> ' +
          '<button class="small danger" data-id="' + esc(e.id) + '" data-act="del">حذف</button>' +
        '</div></td></tr>';
    }).join("") : '<tr><td colspan="7" class="empty">لا توجد مستخلصات</td></tr>';

    document.getElementById("list").innerHTML =
      '<table><thead><tr><th>رقم</th><th>التاريخ</th><th>المشروع</th><th>الوصف</th><th>المبلغ</th><th>الحالة</th><th></th></tr></thead><tbody>' +
      body + "</tbody></table>";
  }

  function openForm(ex) {
    var isNew = !ex;
    ex = ex || { number: "", project_id: "", date: new Date().toISOString().slice(0, 10), amount: 0, description: "", status: "pending" };
    if (isNew) {
      var maxN = extracts.reduce(function (m, e) { return Math.max(m, Number(e.number) || 0); }, 0);
      ex.number = maxN + 1;
    }
    var prjOpts = projects.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === ex.project_id ? " selected" : "") + ">" +
        esc((p.code || "") + " — " + p.name) + "</option>";
    }).join("");
    var body = html`
      <div class="form-grid">
        <label>رقم المستخلص<input type="number" id="f-num" value="${ex.number || ""}" min="1"></label>
        <label>المشروع<select id="f-prj" required><option value="">— اختر —</option>${prjOpts}</select></label>
        <label>التاريخ<input type="date" id="f-date" value="${esc(ex.date || "")}"></label>
        <label>المبلغ (ج.م)<input type="number" id="f-amount" value="${ex.amount || 0}" min="0" step="1"></label>
        <label>الحالة<select id="f-status">
          <option value="pending"${ex.status === "pending" ? " selected" : ""}>معلق</option>
          <option value="approved"${ex.status === "approved" ? " selected" : ""}>معتمد</option>
          <option value="paid"${ex.status === "paid" ? " selected" : ""}>مدفوع</option>
        </select></label>
        <label class="full">الوصف<textarea id="f-desc" rows="2">${esc(ex.description || "")}</textarea></label>
      </div>`;
    UI.modal({
      title: isNew ? "مستخلص جديد" : "تعديل مستخلص",
      body: body,
      ok: isNew ? "إضافة" : "حفظ",
      onOk: async function () {
        var prj = document.getElementById("f-prj").value;
        var amount = Number(document.getElementById("f-amount").value) || 0;
        if (!prj || amount <= 0) { UI.toast("اختر المشروع وأدخل مبلغاً صحيحاً", true); return false; }
        var data = {
          number: Number(document.getElementById("f-num").value) || 0,
          project_id: prj,
          date: document.getElementById("f-date").value,
          amount: amount,
          description: (document.getElementById("f-desc").value || "").trim(),
          status: document.getElementById("f-status").value,
        };
        try {
          if (isNew) {
            data.created_at = new Date().toISOString();
            await DB.insert("project_extracts", data);
            UI.toast("تم إضافة المستخلص");
          } else {
            await DB.update("project_extracts", ex.id, data);
            UI.toast("تم الحفظ");
          }
          // تحديث نسبة الإنجاز التقريبية من مجموع المستخلصات / قيمة العقد
          var p = projects.find(function (x) { return x.id === prj; });
          if (p && p.contract_value > 0) {
            var allExt = extracts.filter(function (e) { return e.project_id === prj && e.id !== (ex && ex.id); });
            if (!isNew) { /* already replaced on reload */ }
            var sum = allExt.reduce(function (s, e) { return s + (Number(e.amount) || 0); }, 0) + amount;
            var pct = Math.min(100, Math.round((sum / p.contract_value) * 100));
            await DB.update("projects", p.id, { progress_pct: pct });
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
  document.getElementById("prj-filter").onchange = render;
  document.getElementById("st-filter").onchange = render;
  document.getElementById("list").onclick = async function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    var act = btn.getAttribute("data-act");
    var row = extracts.find(function (x) { return x.id === id; });
    if (!row) return;
    if (act === "edit") openForm(row);
    if (act === "del") {
      if (!confirm("حذف المستخلص؟")) return;
      try {
        await DB.remove("project_extracts", id);
        UI.toast("تم الحذف");
        await load();
      } catch (err) {
        UI.toast(err.message || "خطأ", true);
      }
    }
  };

  async function load() {
    try {
      var res = await Promise.all([DB.list("project_extracts"), DB.list("projects"), DB.list("customers")]);
      extracts = res[0] || [];
      projects = res[1] || [];
      customers = res[2] || [];
      fillFilters();
      render();
    } catch (e) {
      UI.toast(e.message || "تعذر التحميل", true);
    }
  }
  await load();
})();
