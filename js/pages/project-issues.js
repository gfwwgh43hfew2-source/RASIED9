(async function () {
  var page = await UI.init("project-issues");
  if (!page) return;
  var html = UI.html, money = UI.money, esc = (window.Ledger && Ledger.esc) || function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); };

  var issues = [], projects = [], products = [];

  page.innerHTML = html`
    <div class="stack">
      <div class="page-toolbar">
        <div>
          <h2 style="margin:0">صرف خامات للمشاريع</h2>
          <p class="muted" style="margin:4px 0 0;font-size:12px">صرف قطاعات ألومنيوم · زجاج · إكسسوار على المشاريع مع خصم المخزون</p>
        </div>
        <div class="row gap wrap">
          <button type="button" class="primary" id="btn-add">+ صرف خامات</button>
        </div>
      </div>
      <div class="stats" id="stats"></div>
      <div class="row gap wrap" style="align-items:center">
        <input id="q" placeholder="بحث..." autocomplete="off" style="flex:1 1 200px;max-width:300px">
        <select id="prj-filter" style="max-width:260px"><option value="">كل المشاريع</option></select>
      </div>
      <div class="card table-wrap" id="list"></div>
    </div>`;

  function prjName(id) {
    var p = projects.find(function (x) { return x.id === id; });
    return p ? (p.code ? p.code + " — " : "") + p.name : "—";
  }
  function prodName(id) {
    var p = products.find(function (x) { return x.id === id; });
    return p ? p.name : "—";
  }
  function prodUnit(id) {
    var p = products.find(function (x) { return x.id === id; });
    return p ? (p.unit || "") : "";
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
    var rows = issues.filter(function (i) {
      if (prj && i.project_id !== prj) return false;
      if (!q) return true;
      return (prjName(i.project_id) + " " + prodName(i.product_id) + " " + (i.notes || "")).toLowerCase().indexOf(q) !== -1;
    });

    var totalCost = rows.reduce(function (s, i) { return s + (Number(i.qty) || 0) * (Number(i.unit_cost) || 0); }, 0);
    document.getElementById("stats").innerHTML = html`
      <div class="stat teal"><div class="label">عدد الصرفيات</div><div class="value">${rows.length}</div></div>
      <div class="stat amber"><div class="label">إجمالي التكلفة</div><div class="value">${money(totalCost)}</div></div>`;

    var body = rows.length ? rows.map(function (i) {
      var lineCost = (Number(i.qty) || 0) * (Number(i.unit_cost) || 0);
      return '<tr>' +
        '<td>' + esc(i.date || "") + '</td>' +
        '<td>' + esc(prjName(i.project_id)) + '</td>' +
        '<td>' + esc(prodName(i.product_id)) + '</td>' +
        '<td dir="ltr">' + (i.qty || 0) + ' <span class="muted">' + esc(prodUnit(i.product_id)) + '</span></td>' +
        '<td>' + money(i.unit_cost) + '</td>' +
        '<td><b>' + money(lineCost) + '</b></td>' +
        '<td class="muted" style="font-size:12px">' + esc(i.notes || "") + '</td>' +
        '<td><div class="actions-cell">' +
          '<button class="small danger" data-id="' + esc(i.id) + '" data-act="del">حذف</button>' +
        '</div></td></tr>';
    }).join("") : '<tr><td colspan="8" class="empty">لا توجد صرفيات</td></tr>';

    document.getElementById("list").innerHTML =
      '<table><thead><tr><th>التاريخ</th><th>المشروع</th><th>الصنف</th><th>الكمية</th><th>تكلفة الوحدة</th><th>الإجمالي</th><th>ملاحظات</th><th></th></tr></thead><tbody>' +
      body + "</tbody></table>";
  }

  function openForm() {
    var prjOpts = projects.map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc((p.code || "") + " — " + p.name) + "</option>";
    }).join("");
    var prodOpts = products.map(function (p) {
      return '<option value="' + esc(p.id) + '" data-cost="' + (p.cost || 0) + '" data-qty="' + (p.qty || 0) + '">' +
        esc(p.name) + " (رصيد: " + (p.qty || 0) + " " + esc(p.unit || "") + ")</option>";
    }).join("");
    var body = html`
      <div class="form-grid">
        <label>المشروع<select id="f-prj" required><option value="">— اختر —</option>${prjOpts}</select></label>
        <label>الصنف<select id="f-prod" required><option value="">— اختر —</option>${prodOpts}</select></label>
        <label>الكمية<input type="number" id="f-qty" value="1" min="0.001" step="any" required></label>
        <label>تكلفة الوحدة<input type="number" id="f-cost" value="0" min="0" step="any"></label>
        <label>التاريخ<input type="date" id="f-date" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label class="full">ملاحظات<input id="f-notes"></label>
      </div>`;
    UI.modal({
      title: "صرف خامات لمشروع",
      body: body,
      ok: "صرف وخصم من المخزون",
      onOk: async function () {
        var prj = document.getElementById("f-prj").value;
        var prod = document.getElementById("f-prod").value;
        var qty = Number(document.getElementById("f-qty").value) || 0;
        var cost = Number(document.getElementById("f-cost").value) || 0;
        if (!prj || !prod || qty <= 0) { UI.toast("أكمل البيانات", true); return false; }
        var product = products.find(function (x) { return x.id === prod; });
        if (product && (Number(product.qty) || 0) < qty) {
          if (!confirm("الكمية المطلوبة أكبر من الرصيد (" + product.qty + "). المتابعة؟")) return false;
        }
        try {
          var data = {
            project_id: prj,
            product_id: prod,
            qty: qty,
            unit_cost: cost,
            date: document.getElementById("f-date").value,
            notes: (document.getElementById("f-notes").value || "").trim(),
            created_at: new Date().toISOString(),
          };
          await DB.insert("project_issues", data);
          // خصم المخزون
          if (product) {
            var newQty = Math.max(0, (Number(product.qty) || 0) - qty);
            await DB.update("products", product.id, { qty: newQty });
          }
          UI.toast("تم الصرف وخصم المخزون");
          await load();
        } catch (e) {
          UI.toast(e.message || "خطأ", true);
          return false;
        }
      },
    });
    setTimeout(function () {
      var sel = document.getElementById("f-prod");
      if (sel) sel.onchange = function () {
        var opt = sel.options[sel.selectedIndex];
        if (opt && opt.dataset.cost) document.getElementById("f-cost").value = opt.dataset.cost;
      };
    }, 50);
  }

  document.getElementById("btn-add").onclick = openForm;
  document.getElementById("q").oninput = render;
  document.getElementById("prj-filter").onchange = render;
  document.getElementById("list").onclick = async function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn || btn.getAttribute("data-act") !== "del") return;
    var id = btn.getAttribute("data-id");
    var row = issues.find(function (x) { return x.id === id; });
    if (!row || !confirm("حذف صرفية الخامات؟ (لن يُعاد الكمية للمخزون تلقائياً)")) return;
    try {
      await DB.remove("project_issues", id);
      UI.toast("تم الحذف");
      await load();
    } catch (err) {
      UI.toast(err.message || "خطأ", true);
    }
  };

  async function load() {
    try {
      var res = await Promise.all([DB.list("project_issues"), DB.list("projects"), DB.list("products")]);
      issues = res[0] || [];
      projects = res[1] || [];
      products = res[2] || [];
      fillFilters();
      render();
    } catch (e) {
      UI.toast(e.message || "تعذر التحميل", true);
    }
  }
  await load();
})();
