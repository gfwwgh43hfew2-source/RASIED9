(async function () {
  var page = await UI.init("factory-imprest");
  if (!page) return;
  var html = UI.html, money = UI.money;
  var esc = (window.Ledger && Ledger.esc) || function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  };

  // حسابات مصروفات تشغيل الورشة من الشجرة
  var OP_ACCOUNTS = [
    { id: "a5210", code: "5210", name: "إيجار الورشة" },
    { id: "a5220", code: "5220", name: "كهرباء ومياه الورشة" },
    { id: "a5230", code: "5230", name: "صيانة ماكينات" },
    { id: "a5240", code: "5240", name: "مستهلكات وعدد صغيرة" },
    { id: "a5180", code: "5180", name: "مصروفات موقع" },
    { id: "a5170", code: "5170", name: "نقل وتركيب ورفع" },
  ];
  var IMPREST_ACC = "a1180"; // عهد وسلف العمال والفنيين
  var CASH_ACC = "a1";       // خزينة المصنع

  var rows = [], accounts = [];

  page.innerHTML = html`
    <div class="stack">
      <div class="page-toolbar">
        <div>
          <h2 style="margin:0">عهدة ومصروفات المصنع</h2>
          <p class="muted" style="margin:4px 0 0;font-size:12px">
            المشرف يستلم عهدة من الخزينة ويصرف منها يومياً · تُقيَّد تحت مصروفات تشغيل الورشة
          </p>
        </div>
        <div class="row gap wrap">
          <button type="button" class="small" id="btn-receive">+ استلام عهدة</button>
          <button type="button" class="primary" id="btn-spend">+ صرف يومي</button>
        </div>
      </div>

      <div class="stats" id="stats"></div>

      <div class="row gap wrap" style="align-items:center">
        <input id="q" placeholder="بحث بالبيان أو الشخص..." autocomplete="off" style="flex:1 1 220px;max-width:320px">
        <select id="kind-filter" style="max-width:160px">
          <option value="">كل الحركات</option>
          <option value="receive">استلام عهدة</option>
          <option value="spend">صرف يومي</option>
        </select>
        <input type="date" id="from" style="max-width:150px" title="من تاريخ">
        <input type="date" id="to" style="max-width:150px" title="إلى تاريخ">
      </div>

      <div class="card table-wrap" id="list"></div>
    </div>`;

  function accName(id) {
    var a = OP_ACCOUNTS.find(function (x) { return x.id === id; });
    if (a) return a.name;
    var b = accounts.find(function (x) { return x.id === id; });
    return b ? b.name : "—";
  }

  function balance() {
    var rec = 0, spd = 0;
    rows.forEach(function (r) {
      if (r.kind === "receive") rec += Number(r.amount) || 0;
      else if (r.kind === "spend") spd += Number(r.amount) || 0;
    });
    return { received: rec, spent: spd, balance: rec - spd };
  }

  function render() {
    var q = (document.getElementById("q").value || "").toLowerCase();
    var kind = document.getElementById("kind-filter").value || "";
    var from = document.getElementById("from").value || "";
    var to = document.getElementById("to").value || "";

    var filtered = rows.filter(function (r) {
      if (kind && r.kind !== kind) return false;
      if (from && (r.date || "") < from) return false;
      if (to && (r.date || "") > to) return false;
      if (!q) return true;
      var hay = (r.description || "") + " " + (r.person || "") + " " + (r.notes || "") + " " + accName(r.account_id);
      return hay.toLowerCase().indexOf(q) !== -1;
    });

    var b = balance();
    var month = new Date().toISOString().slice(0, 7);
    var monthSpend = rows.filter(function (r) {
      return r.kind === "spend" && (r.date || "").slice(0, 7) === month;
    }).reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);

    document.getElementById("stats").innerHTML = html`
      <div class="stat ${b.balance >= 0 ? "teal" : "red"}">
        <div class="label">رصيد العهدة الحالي</div>
        <div class="value">${money(b.balance)}</div>
      </div>
      <div class="stat">
        <div class="label">إجمالي المستلم</div>
        <div class="value">${money(b.received)}</div>
      </div>
      <div class="stat amber">
        <div class="label">إجمالي المصروف</div>
        <div class="value">${money(b.spent)}</div>
      </div>
      <div class="stat red">
        <div class="label">صرف هذا الشهر</div>
        <div class="value">${money(monthSpend)}</div>
      </div>`;

    var body = filtered.length ? filtered.map(function (r) {
      var isRec = r.kind === "receive";
      return '<tr>' +
        '<td dir="ltr" style="text-align:start">' + esc(r.date || "") + '</td>' +
        '<td><span class="badge ' + (isRec ? "ok" : "amber") + '">' + (isRec ? "استلام عهدة" : "صرف يومي") + '</span></td>' +
        '<td><b>' + esc(r.description || r.notes || (isRec ? "استلام عهدة" : "—")) + '</b>' +
          (r.person ? '<div class="muted" style="font-size:11px">' + esc(r.person) + '</div>' : '') + '</td>' +
        '<td>' + (isRec ? "—" : esc(accName(r.account_id))) + '</td>' +
        '<td class="' + (isRec ? "" : "accent") + '"><b>' + (isRec ? "+" : "−") + money(r.amount) + '</b></td>' +
        '<td><div class="actions-cell">' +
          '<button class="small danger" data-id="' + esc(r.id) + '" data-act="del">حذف</button>' +
        '</div></td></tr>';
    }).join("") : '<tr><td colspan="6" class="empty">لا توجد حركات</td></tr>';

    document.getElementById("list").innerHTML =
      '<table><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>بند المصروف</th><th>المبلغ</th><th></th></tr></thead><tbody>' +
      body + '</tbody></table>';
  }

  function openReceive() {
    var body = html`
      <div class="form-grid">
        <label>المبلغ (ج.م)<input type="number" id="f-amount" value="" min="1" step="1" required placeholder="مثال: 10000"></label>
        <label>التاريخ<input type="date" id="f-date" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label>المستلم (المشرف)<input id="f-person" value="مشرف المصنع"></label>
        <label class="full">ملاحظات<input id="f-notes" placeholder="عهدة أسبوعية / شهرية..."></label>
      </div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">
        القيد: من ح/ عهد وسلف (1180) ← إلى ح/ الخزينة — يقل رصيد الخزينة ويزيد رصيد العهدة.
      </p>`;
    UI.modal({
      title: "استلام عهدة للمصنع",
      body: body,
      ok: "تسجيل الاستلام",
      onOk: async function () {
        var amount = Number(document.getElementById("f-amount").value) || 0;
        var date = document.getElementById("f-date").value;
        var person = (document.getElementById("f-person").value || "").trim() || "مشرف المصنع";
        var notes = (document.getElementById("f-notes").value || "").trim();
        if (amount <= 0) { UI.toast("أدخل مبلغاً صحيحاً", true); return false; }
        try {
          var data = {
            kind: "receive",
            amount: amount,
            date: date,
            person: person,
            notes: notes,
            description: "استلام عهدة",
            created_at: new Date().toISOString(),
          };
          await DB.insert("factory_imprest", data);

          // قيد محاسبي: مدين عهدة 1180 / دائن خزينة
          var jn = await DB.nextNumber("journal_entries");
          var entry = await DB.insert("journal_entries", {
            number: jn,
            date: date,
            memo: "استلام عهدة مصنع — " + person + (notes ? " · " + notes : ""),
            source: "factory_imprest",
          });
          await DB.insert("journal_lines", { entry_id: entry.id, account_id: IMPREST_ACC, debit: amount, credit: 0 });
          await DB.insert("journal_lines", { entry_id: entry.id, account_id: CASH_ACC, debit: 0, credit: amount });

          // خصم من الخزينة إن وُجدت
          try {
            var regs = await DB.list("cash_registers");
            if (regs && regs[0]) {
              var reg = regs[0];
              var newBal = Math.max(0, (Number(reg.balance) || 0) - amount);
              await DB.update("cash_registers", reg.id, { balance: newBal });
              await DB.insert("cash_movements", {
                register_id: reg.id,
                kind: "out",
                amount: amount,
                date: date,
                notes: "عهدة مصنع — " + person,
                created_at: new Date().toISOString(),
              });
            }
          } catch (e) { /* اختياري */ }

          UI.toast("تم تسجيل استلام العهدة");
          await load();
        } catch (e) {
          UI.toast(e.message || "خطأ", true);
          return false;
        }
      },
    });
  }

  function openSpend() {
    var accOpts = OP_ACCOUNTS.map(function (a) {
      return '<option value="' + a.id + '">' + a.code + " — " + a.name + "</option>";
    }).join("");
    var b = balance();
    var body = html`
      <div class="form-grid">
        <label class="full">البيان (ماذا صُرف؟)<input id="f-desc" required placeholder="مثال: صيانة منشار · مسامير · كهرباء..."></label>
        <label>المبلغ (ج.م)<input type="number" id="f-amount" value="" min="0.01" step="any" required></label>
        <label>بند مصروف التشغيل<select id="f-acc">${accOpts}</select></label>
        <label>التاريخ<input type="date" id="f-date" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label>المنفق<input id="f-person" value="مشرف المصنع"></label>
        <label class="full">ملاحظات<input id="f-notes"></label>
      </div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">
        رصيد العهدة الحالي: <b>${money(b.balance)}</b> · القيد: من ح/ مصروف التشغيل ← إلى ح/ العهدة (1180)
      </p>`;
    UI.modal({
      title: "صرف يومي من عهدة المصنع",
      body: body,
      ok: "تسجيل الصرف",
      onOk: async function () {
        var amount = Number(document.getElementById("f-amount").value) || 0;
        var desc = (document.getElementById("f-desc").value || "").trim();
        var accId = document.getElementById("f-acc").value;
        var date = document.getElementById("f-date").value;
        var person = (document.getElementById("f-person").value || "").trim() || "مشرف المصنع";
        var notes = (document.getElementById("f-notes").value || "").trim();
        if (amount <= 0 || !desc) { UI.toast("أكمل البيان والمبلغ", true); return false; }
        if (amount > b.balance) {
          if (!confirm("المبلغ أكبر من رصيد العهدة (" + money(b.balance) + "). المتابعة؟")) return false;
        }
        try {
          var data = {
            kind: "spend",
            amount: amount,
            date: date,
            account_id: accId,
            description: desc,
            person: person,
            notes: notes,
            created_at: new Date().toISOString(),
          };
          await DB.insert("factory_imprest", data);

          // قيد: مدين مصروف تشغيل / دائن عهدة
          var jn = await DB.nextNumber("journal_entries");
          var entry = await DB.insert("journal_entries", {
            number: jn,
            date: date,
            memo: "صرف عهدة مصنع: " + desc,
            source: "factory_imprest",
          });
          await DB.insert("journal_lines", { entry_id: entry.id, account_id: accId, debit: amount, credit: 0 });
          await DB.insert("journal_lines", { entry_id: entry.id, account_id: IMPREST_ACC, debit: 0, credit: amount });

          // تسجيل أيضاً في جدول المصروفات العام للتقارير
          await DB.insert("expenses", {
            description: "[عهدة مصنع] " + desc,
            amount: amount,
            account_id: accId,
            method: "cash",
            date: date,
            source: "factory_imprest",
            created_at: new Date().toISOString(),
          });

          UI.toast("تم تسجيل الصرف");
          await load();
        } catch (e) {
          UI.toast(e.message || "خطأ", true);
          return false;
        }
      },
    });
  }

  document.getElementById("btn-receive").onclick = openReceive;
  document.getElementById("btn-spend").onclick = openSpend;
  document.getElementById("q").oninput = render;
  document.getElementById("kind-filter").onchange = render;
  document.getElementById("from").onchange = render;
  document.getElementById("to").onchange = render;

  document.getElementById("list").onclick = async function (e) {
    var btn = e.target.closest("[data-act=del]");
    if (!btn) return;
    if (!confirm("حذف الحركة؟ (لن يُعكس القيد المحاسبي تلقائياً)")) return;
    try {
      await DB.remove("factory_imprest", btn.getAttribute("data-id"));
      UI.toast("تم الحذف");
      await load();
    } catch (err) {
      UI.toast(err.message || "خطأ", true);
    }
  };

  async function load() {
    try {
      var res = await Promise.all([DB.list("factory_imprest"), DB.list("accounts")]);
      rows = (res[0] || []).slice().sort(function (a, b) {
        return (b.date || "").localeCompare(a.date || "") || (b.created_at || "").localeCompare(a.created_at || "");
      });
      accounts = res[1] || [];
      render();
    } catch (e) {
      UI.toast(e.message || "تعذر التحميل", true);
    }
  }

  await load();
})();
