// طبقة البيانات: Demo (localStorage) أو Supabase
(function () {
  "use strict";
  var cfg = window.APP_CONFIG || {};
  var configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  var demoMode = !configured;
  var fatal = "";
  var client = null;
  var LS_KEY = "aluminum_demo_v2";

  if (configured) {
    if (window.supabase && window.supabase.createClient) {
      client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    } else {
      fatal = "تعذّر تحميل مكتبة Supabase.";
    }
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function ago(days) {
    return new Date(Date.now() - days * 86400000).toISOString();
  }
  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  var SEED = {
    company: {
      name: "شركة أحمد سلطان للألوميتال والكلادينج",
      phone: "01000000000",
      address: "مصر",
      tax_id: "",
      vat_rate: 14,
      vat_enabled: true,
      currency: "ج.م",
    },
    customers: [
      { id: "c1", name: "كازان", phone: "", balance: 0, notes: "عميل مشاريع", created_at: ago(40) },
      { id: "c2", name: "الحزام الأخضر", phone: "", balance: 0, notes: "عميل مشاريع", created_at: ago(35) },
      { id: "c3", name: "ارتيا", phone: "", balance: 0, notes: "عميل مشاريع", created_at: ago(30) },
      { id: "c4", name: "كايرو كابيتال", phone: "", balance: 0, notes: "عميل مشاريع", created_at: ago(25) },
      { id: "c5", name: "OLA", phone: "", balance: 0, notes: "عميل مشاريع", created_at: ago(20) },
      { id: "c6", name: "أوزون", phone: "", balance: 0, notes: "عميل مشاريع", created_at: ago(15) },
      { id: "c7", name: "مارفيل", phone: "", balance: 0, notes: "عميل مشاريع", created_at: ago(10) },
      { id: "c8", name: "الساحل", phone: "", balance: 0, notes: "عميل مشاريع", created_at: ago(5) },
    ],
    suppliers: [
      { id: "s1", name: "مورد قطاعات ألومنيوم", phone: "", balance: 0, notes: "مورد قطاعات", category: "قطاعات", created_at: ago(50) },
      { id: "s2", name: "مورد زجاج", phone: "", balance: 0, notes: "مورد زجاج", category: "زجاج", created_at: ago(40) },
      { id: "s3", name: "مورد إكسسوار", phone: "", balance: 0, notes: "مفصلات ومقابض وكاوتش", category: "إكسسوار", created_at: ago(30) },
    ],
    warehouses: [
      { id: "w1", name: "مخزن المصنع الرئيسي", location: "المصنع", created_at: ago(60) },
    ],
    products: [
      { id: "p1", sku: "AL-SEC-01", name: "قطاع ألومنيوم نافذة", unit: "متر طولي", cost: 85, price: 120, qty: 2500, min_qty: 200, warehouse_id: "w1", category: "قطاعات ألومنيوم", created_at: ago(40) },
      { id: "p2", sku: "AL-SEC-02", name: "قطاع ألومنيوم باب", unit: "متر طولي", cost: 110, price: 155, qty: 1800, min_qty: 150, warehouse_id: "w1", category: "قطاعات ألومنيوم", created_at: ago(40) },
      { id: "p3", sku: "GL-01", name: "زجاج سيكوريت 6مم", unit: "متر مربع", cost: 180, price: 250, qty: 400, min_qty: 50, warehouse_id: "w1", category: "زجاج", created_at: ago(35) },
      { id: "p4", sku: "GL-02", name: "زجاج دبل جلاس", unit: "متر مربع", cost: 320, price: 420, qty: 200, min_qty: 30, warehouse_id: "w1", category: "زجاج", created_at: ago(35) },
      { id: "p5", sku: "ACC-01", name: "مفصلة باب ألومنيوم", unit: "قطعة", cost: 25, price: 40, qty: 800, min_qty: 100, warehouse_id: "w1", category: "إكسسوار", created_at: ago(30) },
      { id: "p6", sku: "ACC-02", name: "مقبض نافذة", unit: "قطعة", cost: 15, price: 28, qty: 1200, min_qty: 150, warehouse_id: "w1", category: "إكسسوار", created_at: ago(30) },
      { id: "p7", sku: "ACC-03", name: "كاوتش إحكام", unit: "متر", cost: 8, price: 15, qty: 3000, min_qty: 300, warehouse_id: "w1", category: "إكسسوار", created_at: ago(30) },
    ],
    // دليل الحسابات حسب شجرة العميل (ألوميتال)
    accounts: [
      { id: "a1100", code: "1100", name: "الأصول المتداولة", type: "asset", parent: null },
      { id: "a1110", code: "1110", name: "الخزينة", type: "asset", parent: "a1100" },
      { id: "a1111", code: "1111", name: "خزينة المصنع / أ. أحمد سلطان", type: "asset", parent: "a1110" },
      { id: "a1120", code: "1120", name: "البنوك", type: "asset", parent: "a1100" },
      { id: "a1121", code: "1121", name: "بنك البركة", type: "asset", parent: "a1120" },
      { id: "a1122", code: "1122", name: "بنك CIB", type: "asset", parent: "a1120" },
      { id: "a1123", code: "1123", name: "البنك الأهلي", type: "asset", parent: "a1120" },
      { id: "a1130", code: "1130", name: "العملاء", type: "asset", parent: "a1100" },
      { id: "a1131", code: "1131", name: "عملاء مشاريع - دفعات", type: "asset", parent: "a1130" },
      { id: "a1132", code: "1132", name: "عملاء مستخلصات مستحقة", type: "asset", parent: "a1130" },
      { id: "a1140", code: "1140", name: "أوراق قبض - شيكات", type: "asset", parent: "a1100" },
      { id: "a1150", code: "1150", name: "مخزون خامات", type: "asset", parent: "a1100" },
      { id: "a1151", code: "1151", name: "مخزون قطاعات ألومنيوم", type: "asset", parent: "a1150" },
      { id: "a1152", code: "1152", name: "مخزون زجاج", type: "asset", parent: "a1150" },
      { id: "a1153", code: "1153", name: "مخزون إكسسوار", type: "asset", parent: "a1150" },
      { id: "a1154", code: "1154", name: "مخزون إنتاج تحت التشغيل", type: "asset", parent: "a1100" },
      { id: "a1170", code: "1170", name: "مخزون إنتاج تام", type: "asset", parent: "a1100" },
      { id: "a1180", code: "1180", name: "عهد وسلف العمال والفنيين", type: "asset", parent: "a1100" },
      { id: "a1190", code: "1190", name: "مصروفات مدفوعة مقدماً", type: "asset", parent: "a1100" },
      { id: "a1200", code: "1200", name: "الأصول الثابتة", type: "asset", parent: null },
      { id: "a1210", code: "1210", name: "ماكينات الورشة", type: "asset", parent: "a1200" },
      { id: "a1220", code: "1220", name: "معدات تركيب", type: "asset", parent: "a1200" },
      { id: "a1230", code: "1230", name: "سيارات ونقل", type: "asset", parent: "a1200" },
      { id: "a1240", code: "1240", name: "عدد وأدوات", type: "asset", parent: "a1200" },
      { id: "a1290", code: "1290", name: "مجمع إهلاك الأصول الثابتة", type: "asset", parent: "a1200" },
      { id: "a2100", code: "2100", name: "الالتزامات المتداولة", type: "liability", parent: null },
      { id: "a2110", code: "2110", name: "موردين خامات", type: "liability", parent: "a2100" },
      { id: "a2111", code: "2111", name: "موردين قطاعات", type: "liability", parent: "a2110" },
      { id: "a2112", code: "2112", name: "موردين زجاج", type: "liability", parent: "a2110" },
      { id: "a2113", code: "2113", name: "موردين إكسسوار", type: "liability", parent: "a2110" },
      { id: "a2120", code: "2120", name: "مقاولين باطن - تركيب / دهان", type: "liability", parent: "a2100" },
      { id: "a2130", code: "2130", name: "دفعات مقدمة من العملاء", type: "liability", parent: "a2100" },
      { id: "a2140", code: "2140", name: "أوراق دفع - شيكات", type: "liability", parent: "a2100" },
      { id: "a2150", code: "2150", name: "مصروفات مستحقة", type: "liability", parent: "a2100" },
      { id: "a2160", code: "2160", name: "ضريبة القيمة المضافة", type: "liability", parent: "a2100" },
      { id: "a2170", code: "2170", name: "ضريبة خصم وإضافة", type: "liability", parent: "a2100" },
      { id: "a3100", code: "3100", name: "حقوق الملكية", type: "equity", parent: null },
      { id: "a3110", code: "3110", name: "رأس المال", type: "equity", parent: "a3100" },
      { id: "a3120", code: "3120", name: "جاري الشريك / المالك", type: "equity", parent: "a3100" },
      { id: "a3121", code: "3121", name: "جاري أ. أحمد حلمي", type: "equity", parent: "a3120" },
      { id: "a3122", code: "3122", name: "جاري أ. محمد شعبان", type: "equity", parent: "a3120" },
      { id: "a3130", code: "3130", name: "أرباح وخسائر مرحلة", type: "equity", parent: "a3100" },
      { id: "a4100", code: "4100", name: "الإيرادات", type: "revenue", parent: null },
      { id: "a4110", code: "4110", name: "إيرادات تصنيع ألوميتال", type: "revenue", parent: "a4100" },
      { id: "a4120", code: "4120", name: "إيرادات توريد وتركيب", type: "revenue", parent: "a4100" },
      { id: "a4130", code: "4130", name: "إيرادات صيانة وتعديلات", type: "revenue", parent: "a4100" },
      { id: "a4140", code: "4140", name: "إيرادات بيع خامات / هالك", type: "revenue", parent: "a4100" },
      { id: "a4150", code: "4150", name: "خصم مسموح به", type: "revenue", parent: "a4100" },
      { id: "a5100", code: "5100", name: "تكلفة المشاريع المباشرة", type: "expense", parent: null },
      { id: "a5110", code: "5110", name: "خامات مباشرة - قطاعات", type: "expense", parent: "a5100" },
      { id: "a5120", code: "5120", name: "خامات مباشرة - زجاج", type: "expense", parent: "a5100" },
      { id: "a5130", code: "5130", name: "خامات مباشرة - إكسسوار", type: "expense", parent: "a5100" },
      { id: "a5140", code: "5140", name: "أجور عمال إنتاج مباشرة", type: "expense", parent: "a5100" },
      { id: "a5150", code: "5150", name: "مقاولين باطن تركيب", type: "expense", parent: "a5100" },
      { id: "a5160", code: "5160", name: "خدمات خارجية - دهان / أنودة", type: "expense", parent: "a5100" },
      { id: "a5170", code: "5170", name: "نقل وتركيب ورفع للموقع", type: "expense", parent: "a5100" },
      { id: "a5180", code: "5180", name: "مصروفات موقع", type: "expense", parent: "a5100" },
      { id: "a5200", code: "5200", name: "مصروفات تشغيل الورشة", type: "expense", parent: null },
      { id: "a5210", code: "5210", name: "إيجار الورشة", type: "expense", parent: "a5200" },
      { id: "a5220", code: "5220", name: "كهرباء ومياه الورشة", type: "expense", parent: "a5200" },
      { id: "a5230", code: "5230", name: "صيانة ماكينات", type: "expense", parent: "a5200" },
      { id: "a5240", code: "5240", name: "مستهلكات وعدد صغيرة", type: "expense", parent: "a5200" },
      { id: "a5300", code: "5300", name: "مصروفات إدارية وعمومية", type: "expense", parent: null },
      { id: "a5310", code: "5310", name: "رواتب إدارية", type: "expense", parent: "a5300" },
      { id: "a5330", code: "5330", name: "مصروفات سيارات إدارية", type: "expense", parent: "a5300" },
      { id: "a5340", code: "5340", name: "إهلاك الأصول الثابتة", type: "expense", parent: "a5300" },
      { id: "a5360", code: "5360", name: "ديون معدومة", type: "expense", parent: "a5300" },
      // توافق مع الكود القديم
      { id: "a1", code: "1111", name: "خزينة المصنع", type: "asset", parent: "a1110" },
      { id: "a2", code: "1120", name: "البنوك", type: "asset", parent: "a1100" },
      { id: "a3", code: "1130", name: "العملاء", type: "asset", parent: "a1100" },
      { id: "a4", code: "1150", name: "مخزون خامات", type: "asset", parent: "a1100" },
      { id: "a5", code: "2110", name: "موردين خامات", type: "liability", parent: "a2100" },
      { id: "a5b", code: "2160", name: "ضريبة القيمة المضافة", type: "liability", parent: "a2100" },
      { id: "a6", code: "3110", name: "رأس المال", type: "equity", parent: "a3100" },
      { id: "a7", code: "4110", name: "إيرادات تصنيع ألوميتال", type: "revenue", parent: "a4100" },
      { id: "a9", code: "5100", name: "تكلفة المشاريع المباشرة", type: "expense", parent: null },
      { id: "a10", code: "5300", name: "مصروفات إدارية وعمومية", type: "expense", parent: null },
      { id: "a12", code: "1500", name: "ضريبة القيمة المضافة قابلة للخصم", type: "asset", parent: "a1100" },
      { id: "a13", code: "5310", name: "رواتب إدارية", type: "expense", parent: "a5300" },
      { id: "a14", code: "2150", name: "مصروفات مستحقة - رواتب", type: "liability", parent: "a2100" },
    ],
    projects: [
      { id: "pr1", code: "PRJ-001", name: "مشروع كازان - واجهات", customer_id: "c1", status: "active", start_date: ago(60).slice(0,10), contract_value: 850000, progress_pct: 45, location: "القاهرة", notes: "واجهات ألوميتال وكلادينج", created_at: ago(60) },
      { id: "pr2", code: "PRJ-002", name: "مشروع الحزام الأخضر", customer_id: "c2", status: "active", start_date: ago(40).slice(0,10), contract_value: 620000, progress_pct: 30, location: "الجيزة", notes: "", created_at: ago(40) },
      { id: "pr3", code: "PRJ-003", name: "مشروع ارتيا - نوافذ", customer_id: "c3", status: "active", start_date: ago(20).slice(0,10), contract_value: 310000, progress_pct: 15, location: "الإسكندرية", notes: "شبابيك وأبواب", created_at: ago(20) },
    ],
    project_issues: [
      { id: "pi1", project_id: "pr1", product_id: "p1", qty: 120, unit_cost: 85, date: ago(30).slice(0,10), notes: "صرف قطاعات للمشروع", created_at: ago(30) },
      { id: "pi2", project_id: "pr1", product_id: "p3", qty: 80, unit_cost: 180, date: ago(25).slice(0,10), notes: "صرف زجاج", created_at: ago(25) },
      { id: "pi3", project_id: "pr2", product_id: "p2", qty: 90, unit_cost: 110, date: ago(15).slice(0,10), notes: "", created_at: ago(15) },
    ],
    project_extracts: [
      { id: "pe1", project_id: "pr1", number: 1, date: ago(20).slice(0,10), amount: 200000, description: "مستخلص أول - أعمال هيكل", status: "approved", created_at: ago(20) },
      { id: "pe2", project_id: "pr1", number: 2, date: ago(5).slice(0,10), amount: 180000, description: "مستخلص ثاني - تركيب", status: "pending", created_at: ago(5) },
    ],
    // عهدة المصنع: رصيد حالي + حركات استلام وصرف يومي
    factory_imprest: [
      { id: "fi1", kind: "receive", amount: 15000, date: ago(10).slice(0,10), person: "مشرف المصنع", notes: "عهدة أسبوعية للمشرف", created_at: ago(10) },
      { id: "fi2", kind: "spend", amount: 1200, date: ago(8).slice(0,10), account_id: "a5220", description: "كهرباء ورشة", person: "مشرف المصنع", created_at: ago(8) },
      { id: "fi3", kind: "spend", amount: 850, date: ago(7).slice(0,10), account_id: "a5240", description: "مسامير وعدد صغيرة", person: "مشرف المصنع", created_at: ago(7) },
      { id: "fi4", kind: "spend", amount: 2500, date: ago(5).slice(0,10), account_id: "a5230", description: "صيانة منشار القص", person: "مشرف المصنع", created_at: ago(5) },
      { id: "fi5", kind: "spend", amount: 600, date: ago(3).slice(0,10), account_id: "a5240", description: "شحم وزيوت ماكينات", person: "مشرف المصنع", created_at: ago(3) },
      { id: "fi6", kind: "spend", amount: 400, date: ago(1).slice(0,10), account_id: "a5220", description: "مياه الورشة", person: "مشرف المصنع", created_at: ago(1) },
    ],
    sales: [
      {
        id: "sa1", number: 1001, customer_id: "c1", date: ago(3).slice(0, 10), status: "posted",
        subtotal: 45000, vat_rate: 14, vat_amount: 6300, total: 51300, paid: 20000,
        notes: "مستخلص مشروع كازان", project_id: "pr1", created_at: ago(3),
      },
    ],
    sale_lines: [
      { id: "sl1", sale_id: "sa1", product_id: "p1", qty: 200, unit_price: 120, cost: 85 },
      { id: "sl2", sale_id: "sa1", product_id: "p3", qty: 80, unit_price: 250, cost: 180 },
    ],
    purchases: [
      {
        id: "pu1", number: 2001, supplier_id: "s1", date: ago(10).slice(0, 10), status: "posted",
        subtotal: 42500, vat_rate: 14, vat_amount: 5950, total: 48450, paid: 30000,
        notes: "شراء قطاعات ألومنيوم", created_at: ago(10),
      },
    ],
    purchase_lines: [
      { id: "pl1", purchase_id: "pu1", product_id: "p1", qty: 500, unit_cost: 85 },
    ],
    sale_returns: [],
    sale_return_lines: [],
    purchase_returns: [],
    purchase_return_lines: [],
    stocktakes: [],
    stocktake_lines: [],
    stock_transfers: [],
    stock_transfer_lines: [],

    cash_registers: [
      { id: "cr1", name: "خزينة المصنع / أ. أحمد سلطان", balance: 85000, location: "المصنع", created_at: ago(60) },
    ],
    cash_movements: [
      { id: "cm1", register_id: "cr1", kind: "in", amount: 20000, date: ago(2).slice(0,10), notes: "تحصيل مستخلص كازان", created_at: ago(2) },
      { id: "cm2", register_id: "cr1", kind: "out", amount: 5000, date: ago(5).slice(0,10), notes: "عهدة مصاريف تشغيل", created_at: ago(5) },
    ],
    employees: [
      { id: "e1", name: "أحمد حسن", job_title: "محاسب", phone: "01011110001", salary: 8000, hire_date: ago(200).slice(0,10), status: "active", created_at: ago(200) },
      { id: "e2", name: "محمود كمال", job_title: "أمين مخزن", phone: "01033330003", salary: 5500, hire_date: ago(80).slice(0,10), status: "active", created_at: ago(80) },
      { id: "e3", name: "سامي فني", job_title: "فني تركيب", phone: "01044440004", salary: 6000, hire_date: ago(90).slice(0,10), status: "active", created_at: ago(90) },
      { id: "e4", name: "كريم عامل", job_title: "عامل إنتاج", phone: "01055550005", salary: 4500, hire_date: ago(60).slice(0,10), status: "active", created_at: ago(60) },
    ],
    payroll_runs: [
      { id: "pr1", month: "2026-09", status: "posted", total: 20000, notes: "رواتب سبتمبر", created_at: ago(20) },
    ],
    payroll_lines: [
      { id: "prl1", run_id: "pr1", employee_id: "e1", basic: 8000, allowances: 0, deductions: 0, net: 8000 },
      { id: "prl2", run_id: "pr1", employee_id: "e2", basic: 5500, allowances: 0, deductions: 0, net: 5500 },
      { id: "prl3", run_id: "pr1", employee_id: "e3", basic: 6000, allowances: 0, deductions: 0, net: 6000 },
      { id: "prl4", run_id: "pr1", employee_id: "e4", basic: 4500, allowances: 0, deductions: 0, net: 4500 },
    ],
    settings: {
      vat_rate: 14,
      vat_enabled: true,
    },
    payments: [
      { id: "pay1", kind: "receipt", party_type: "customer", party_id: "c1", amount: 20000, method: "cash", date: ago(2).slice(0, 10), ref: "sa1", notes: "دفعة على مستخلص كازان", created_at: ago(2) },
      { id: "pay3", kind: "payment", party_type: "supplier", party_id: "s1", amount: 30000, method: "bank", date: ago(8).slice(0, 10), ref: "pu1", notes: "سداد جزئي قطاعات", created_at: ago(8) },
    ],
    journal_entries: [
      {
        id: "j1", number: 1, date: ago(3).slice(0, 10), memo: "قيد مستخلص مشروع كازان",
        source: "sale", source_id: "sa1", created_at: ago(3),
      },
      {
        id: "j2", number: 2, date: ago(10).slice(0, 10), memo: "قيد شراء قطاعات ألومنيوم",
        source: "purchase", source_id: "pu1", created_at: ago(10),
      },
    ],
    journal_lines: [
      { id: "jl1", entry_id: "j1", account_id: "a3", debit: 45000, credit: 0 },
      { id: "jl2", entry_id: "j1", account_id: "a7", debit: 0, credit: 45000 },
      { id: "jl3", entry_id: "j1", account_id: "a9", debit: 31400, credit: 0 },
      { id: "jl4", entry_id: "j1", account_id: "a4", debit: 0, credit: 31400 },
      { id: "jl5", entry_id: "j2", account_id: "a4", debit: 42500, credit: 0 },
      { id: "jl6", entry_id: "j2", account_id: "a5", debit: 0, credit: 42500 },
    ],
    expenses: [
      { id: "e1", date: ago(5).slice(0, 10), account_id: "a5210", amount: 8000, description: "إيجار الورشة", method: "cash", created_at: ago(5) },
      { id: "e2", date: ago(4).slice(0, 10), account_id: "a5220", amount: 3500, description: "كهرباء ومياه الورشة", method: "cash", created_at: ago(4) },
    ],
    users: [
      { id: "u1", name: "المدير", phone: "01000000001", role: "admin" },
    ],
  };

  function loadDemo() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    var data = JSON.parse(JSON.stringify(SEED));
    saveDemo(data);
    return data;
  }
  function saveDemo(data) {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  }

  // ======================================================================
  // وضع السحابة (Supabase): كل شركة معزولة عبر RLS، والبيانات في جدول records
  // ======================================================================
  var profile = null, companyRow = null, readyPromise = null;

  function goLogin() {
    var here = (location.pathname.split("/").pop() || "index.html");
    if (here !== "login.html") location.replace("login.html");
  }

  async function ensureSeed() {
    // شركة جديدة: دليل حسابات أساسي + مخزن + خزينة (مرة واحدة)
    // علامة محلية تتجاوز الفحص بعد أول نجاح، لتوفير طلب شبكة في كل تنقّل بين الصفحات
    var seedFlag = "trading_seeded_" + profile.company_id;
    try { if (localStorage.getItem(seedFlag) === "1") return; } catch (e) {}
    var c = await client.from("records").select("id", { count: "exact", head: true })
      .eq("company_id", profile.company_id).eq("tbl", "accounts");
    if (c.error) return;
    if (c.count > 0) { try { localStorage.setItem(seedFlag, "1"); } catch (e) {} return; }
    var now = new Date().toISOString();
    var rows = SEED.accounts.map(function (a) {
      return { company_id: profile.company_id, id: a.id, tbl: "accounts", data: Object.assign({}, a, { created_at: now }), created_at: now };
    });
    rows.push({ company_id: profile.company_id, id: uid(), tbl: "warehouses", data: { name: "المخزن الرئيسي", location: "", created_at: now }, created_at: now });
    rows.push({ company_id: profile.company_id, id: uid(), tbl: "cash_registers", data: { name: "الخزينة الرئيسية", balance: 0, location: "", created_at: now }, created_at: now });
    rows.forEach(function (r) { r.data.id = r.id; });
    await client.from("records").insert(rows);
    try { localStorage.setItem(seedFlag, "1"); } catch (e) {}
  }

  // يُستدعى من UI.init: يتحقق من الجلسة ويحمّل الملف الشخصي والشركة
  function ready() {
    if (demoMode) return Promise.resolve(null);
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      var s = await client.auth.getSession();
      if (!s.data.session) { goLogin(); return new Promise(function () {}); }
      var uidv = s.data.session.user.id;
      var pr = await client.from("profiles").select("*").eq("id", uidv).maybeSingle();
      if (pr.error || !pr.data) { await client.auth.signOut(); goLogin(); return new Promise(function () {}); }
      profile = pr.data;
      var co = await client.from("companies").select("*").eq("id", profile.company_id).maybeSingle();
      companyRow = co.data || { name: "", profile: {} };
      if (profile.status === "active") {
        await ensureSeed();
        client.rpc("heartbeat");
      }
      return profile;
    })();
    return readyPromise;
  }

  async function logout() {
    try { localStorage.removeItem("trading_shell_v1"); sessionStorage.removeItem("trading_nav_scroll"); sessionStorage.removeItem("rs_chat_v1"); } catch (e) {}
    if (client) await client.auth.signOut();
    location.replace("login.html");
  }

  // ----------------------------------------------------------------------
  // كاش خفيف داخل الصفحة الواحدة + تقليل عدد الطلبات (الصفحات مستقلة، فالكاش يُمسح بالتنقّل)
  //  - list: يجلب الصفحات الزائدة عن 1000 بالتوازي ويمنع الطلب المكرر لنفس الجدول
  //  - get: طلب صف واحد بدل تحميل الجدول كله
  //  - listWhere/listWhereIn: فلترة على السيرفر بدل جلب الجدول ثم الفلترة
  //  - insertRows/insertMany/removeMany: طلب واحد لعدة صفوف
  // ----------------------------------------------------------------------
  var cache = {}, inflight = {}, TTL = 20000;
  function cFresh(t) { var c = cache[t]; return c && (Date.now() - c.t) < TTL ? c : null; }
  function cPut(t, rows) { cache[t] = { t: Date.now(), rows: rows }; }
  function cAdd(t, item) { var c = cache[t]; if (c) c.rows.unshift(item); }
  function cSet(t, id, row) {
    var c = cache[t]; if (!c) return;
    for (var i = 0; i < c.rows.length; i++) if (c.rows[i].id === id) { c.rows[i] = row; return; }
  }
  function cDel(t, ids) {
    var c = cache[t]; if (!c) return;
    var m = {}; ids.forEach(function (i) { m[i] = 1; });
    c.rows = c.rows.filter(function (r) { return !m[r.id]; });
  }
  function toRow(x) { return Object.assign({}, x.data, { id: x.id, created_at: x.created_at }); }
  function base(table) {
    return client.from("records").select("id,data,created_at").eq("company_id", profile.company_id).eq("tbl", table);
  }
  function quoteIn(v) { return '"' + String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }

  async function cloudList(table) {
    var c = cFresh(table);
    if (c) return c.rows.slice();
    if (!inflight[table]) {
      inflight[table] = (async function () {
        var step = 1000;
        var first = await client.from("records").select("id,data,created_at", { count: "exact" })
          .eq("company_id", profile.company_id).eq("tbl", table)
          .order("created_at", { ascending: false }).range(0, step - 1);
        if (first.error) throw new Error(first.error.message);
        var out = first.data.map(toRow);
        var total = first.count || out.length;
        if (total > step) {
          var jobs = [];
          for (var from = step; from < total; from += step) {
            jobs.push(base(table).order("created_at", { ascending: false }).range(from, from + step - 1));
          }
          var rest = await Promise.all(jobs);
          rest.forEach(function (r) {
            if (r.error) throw new Error(r.error.message);
            r.data.forEach(function (x) { out.push(toRow(x)); });
          });
        }
        cPut(table, out);
        return out;
      })();
    }
    var p = inflight[table];
    try { return (await p).slice(); }
    finally { if (inflight[table] === p) delete inflight[table]; }
  }
  async function list(table) {
    if (fatal) throw new Error(fatal);
    if (demoMode) {
      var d = loadDemo();
      return (d[table] || []).slice().sort(function (a, b) {
        return (b.created_at || b.date || "").localeCompare(a.created_at || a.date || "");
      });
    }
    await ready();
    return cloudList(table);
  }
  // صف واحد. opts.fresh = تجاهل الكاش (للأرصدة)
  async function get(table, id, opts) {
    if (fatal) throw new Error(fatal);
    if (!id) return null;
    if (demoMode) {
      var rows = await list(table);
      return rows.filter(function (r) { return r.id === id; })[0] || null;
    }
    await ready();
    if (!(opts && opts.fresh)) {
      var c = cFresh(table);
      if (c) {
        for (var i = 0; i < c.rows.length; i++) if (c.rows[i].id === id) return c.rows[i];
      }
    }
    var r = await base(table).eq("id", id).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    return r.data ? toRow(r.data) : null;
  }
  // فلترة على السيرفر: كل الصفوف التي data[field] == value
  async function listWhere(table, field, value) {
    if (fatal) throw new Error(fatal);
    if (demoMode) {
      return (await list(table)).filter(function (r) { return String(r[field]) === String(value); });
    }
    await ready();
    var c = cFresh(table);
    if (c) return c.rows.filter(function (r) { return String(r[field]) === String(value); });
    var out = [], from = 0, step = 1000;
    for (;;) {
      var r = await base(table).eq("data->>" + field, String(value)).range(from, from + step - 1);
      if (r.error) throw new Error(r.error.message);
      r.data.forEach(function (x) { out.push(toRow(x)); });
      if (r.data.length < step) break;
      from += step;
    }
    return out;
  }
  async function listWhereIn(table, field, values) {
    values = (values || []).filter(function (v) { return v != null && v !== ""; });
    if (!values.length) return [];
    if (demoMode) {
      var set = {}; values.forEach(function (v) { set[String(v)] = 1; });
      return (await list(table)).filter(function (r) { return set[String(r[field])]; });
    }
    await ready();
    var c = cFresh(table);
    if (c) {
      var m = {}; values.forEach(function (v) { m[String(v)] = 1; });
      return c.rows.filter(function (r) { return m[String(r[field])]; });
    }
    var chunks = [];
    for (var i = 0; i < values.length; i += 100) chunks.push(values.slice(i, i + 100));
    var res = await Promise.all(chunks.map(function (ch) {
      return base(table).in("data->>" + field, ch.map(quoteIn));
    }));
    var out = [];
    res.forEach(function (r) {
      if (r.error) throw new Error(r.error.message);
      r.data.forEach(function (x) { out.push(toRow(x)); });
    });
    return out;
  }
  // هوية المستخدم الحالي (للتدقيق والقيود): مالك الشركة أو موظف بصلاحيات
  function me() {
    if (demoMode || !profile) return { id: "demo", name: "", owner: true, perms: [] };
    return { id: profile.id, name: profile.full_name || "", owner: profile.company_role !== "staff", perms: Array.isArray(profile.permissions) ? profile.permissions : [] };
  }
  // القيود الإضافية على الموظف (deny:delete / deny:edit) — الغياب = مسموح (توافق مع الموظفين الحاليين)
  function can(action) { var m = me(); return m.owner || m.perms.indexOf("deny:" + action) === -1; }
  function assertCan(action) {
    if (!can(action)) throw new Error(action === "delete" ? "غير مصرّح لك بالحذف — تواصل مع مالك الشركة" : "غير مصرّح لك بتعديل المستندات المحفوظة — تواصل مع مالك الشركة");
  }
  var GUARDED_DELETE = ["customers", "suppliers", "products", "accounts", "employees", "cash_registers", "treasury_tabs", "banks", "expenses", "warehouses",
    "cheques", "cash_counts", "sales", "purchases", "sale_returns", "purchase_returns", "bank_movements", "customer_groups", "supplier_groups", "product_groups", "quotes", "price_lists", "price_list_items", "installment_plans"];
  // يُختم كل سجل رئيسي بمن أنشأه (بدون سطور البنود/القيود لتقليل الحجم)
  function mkItem(table, row) {
    var base = { id: uid(), created_at: new Date().toISOString() };
    if (!/_lines$/.test(table)) { var u = me(); base.by = u.id; if (u.name) base.by_name = u.name; }
    return Object.assign(base, row);
  }
  async function insert(table, row) {
    var out = await insertRows([{ table: table, row: row }]);
    return out[0];
  }
  // عدة صفوف (قد تكون من جداول مختلفة) في طلب واحد: [{table,row}]
  async function insertRows(items) {
    if (fatal) throw new Error(fatal);
    if (!items.length) return [];
    if (!demoMode) await ready();                       // لازم الملف الشخصي محمّل قبل ختم المستخدم
    var made = items.map(function (x) { return { table: x.table, item: mkItem(x.table, x.row) }; });
    if (demoMode) {
      var d = loadDemo();
      made.forEach(function (m) {
        if (!d[m.table]) d[m.table] = [];
        d[m.table].push(m.item);
      });
      saveDemo(d);
      return made.map(function (m) { return m.item; });
    }
    await ready();
    for (var i = 0; i < made.length; i += 500) {
      var part = made.slice(i, i + 500).map(function (m) {
        return { company_id: profile.company_id, id: m.item.id, tbl: m.table, data: m.item, created_at: m.item.created_at };
      });
      var res = await client.from("records").insert(part);
      if (res.error) throw new Error(res.error.message);
    }
    made.forEach(function (m) { cAdd(m.table, m.item); });
    return made.map(function (m) { return m.item; });
  }
  async function insertMany(table, rows) {
    return insertRows(rows.map(function (r) { return { table: table, row: r }; }));
  }
  async function update(table, id, patch) {
    if (fatal) throw new Error(fatal);
    if (demoMode) {
      var d = loadDemo();
      var arr = d[table] || [];
      var i = arr.findIndex(function (r) { return r.id === id; });
      if (i < 0) throw new Error("السجل غير موجود");
      arr[i] = Object.assign({}, arr[i], patch);
      saveDemo(d);
      return arr[i];
    }
    await ready();
    // قراءة صف واحد من السيرفر دائمًا (دمج آمن مع أي تعديل من جهاز آخر)
    var cur = await client.from("records").select("data,created_at").eq("company_id", profile.company_id).eq("id", id).maybeSingle();
    if (cur.error || !cur.data) throw new Error("السجل غير موجود");
    var merged = Object.assign({}, cur.data.data, patch);
    var res = await client.from("records").update({ data: merged }).eq("company_id", profile.company_id).eq("id", id);
    if (res.error) throw new Error(res.error.message);
    cSet(table, id, Object.assign({}, merged, { id: id, created_at: cur.data.created_at }));
    return merged;
  }
  async function remove(table, id) {
    if (GUARDED_DELETE.indexOf(table) !== -1) assertCan("delete");
    return removeMany(table, [id]);
  }
  // سجل النشاط: يُسجَّل حذف المستندات والأطراف الرئيسية (من حذف؟ وماذا؟) — لا يمنع الحذف أبدًا لو فشل التسجيل
  var AUDIT_DEL = ["sales", "purchases", "sale_returns", "purchase_returns", "payments", "expenses", "customers", "suppliers", "products", "quotes", "cheques", "cash_registers", "banks", "employees", "visit_reports", "price_lists", "installment_plans"];
  async function auditDelete(table, ids) {
    var rows = ((await list(table)) || []).filter(function (r) { return ids.indexOf(r.id) !== -1; });
    if (!rows.length) return;
    await insertRows(rows.map(function (r) {
      return { table: "activity_log", row: { action: "delete", tbl: table, ref_id: r.id, ref_number: r.number != null ? r.number : "", ref_name: r.name || "", amount: Number(r.total != null ? r.total : r.amount) || 0,
        party_id: r.customer_id || r.supplier_id || r.party_id || "", kind: r.kind || "", doc_date: r.date || "" } };
    }));
  }
  async function removeMany(table, ids) {
    if (fatal) throw new Error(fatal);
    ids = (ids || []).filter(Boolean);
    if (!ids.length) return true;
    if (AUDIT_DEL.indexOf(table) !== -1 && ids.length <= 5) { try { await auditDelete(table, ids); } catch (e) { /* التدقيق اختياري */ } }
    if (demoMode) {
      var d = loadDemo();
      var m = {}; ids.forEach(function (i) { m[i] = 1; });
      d[table] = (d[table] || []).filter(function (r) { return !m[r.id]; });
      saveDemo(d);
      return true;
    }
    await ready();
    var jobs = [];
    for (var i = 0; i < ids.length; i += 100) {
      jobs.push(client.from("records").delete().eq("company_id", profile.company_id).in("id", ids.slice(i, i + 100)));
    }
    var res = await Promise.all(jobs);
    res.forEach(function (r) { if (r.error) throw new Error(r.error.message); });
    cDel(table, ids);
    return true;
  }
  function refresh(table) { if (table) delete cache[table]; else cache = {}; }
  function resetDemo() {
    localStorage.removeItem(LS_KEY);
    return loadDemo();
  }

  function isDemo() { return demoMode; }

  // بيانات الشركة والضريبة
  function getCompany() {
    var base = Object.assign({}, SEED.company);
    if (!demoMode) {
      if (companyRow) base = Object.assign(base, companyRow.profile || {}, { name: companyRow.name });
      return base;
    }
    try {
      var raw = localStorage.getItem(LS_KEY);
      var d = raw ? JSON.parse(raw) : null;
      if (d && d.company) base = Object.assign(base, d.company);
      if (d && d.settings) {
        if (d.settings.vat_rate != null) base.vat_rate = d.settings.vat_rate;
        if (d.settings.vat_enabled != null) base.vat_enabled = d.settings.vat_enabled;
      }
    } catch (e) {}
    return base;
  }
  function saveCompany(patch) {
    if (!demoMode) {
      var merged = Object.assign({}, companyRow.profile || {}, patch);
      delete merged.name;
      var upd = { profile: merged };
      if (patch.name) upd.name = patch.name;
      return client.from("companies").update(upd).eq("id", profile.company_id).select().single().then(function (r) {
        if (r.error) throw new Error(r.error.message);
        companyRow = r.data;
        return getCompany();
      });
    }
    var d = loadDemo();
    d.company = Object.assign({}, SEED.company, d.company || {}, patch);
    d.settings = Object.assign({}, d.settings || {}, {
      vat_rate: d.company.vat_rate,
      vat_enabled: d.company.vat_enabled,
    });
    saveDemo(d);
    return Promise.resolve(d.company);
  }

  // ترقيم تلقائي: أكبر رقم + 1 (على السيرفر: صف واحد فقط بدل تحميل الجدول)
  async function nextNumber(table, field) {
    field = field || "number";
    if (!demoMode && !fatal) {
      try {
        await ready();
        var r = await client.from("records").select("data")
          .eq("company_id", profile.company_id).eq("tbl", table)
          .order("data->" + field, { ascending: false, nullsFirst: false }).limit(1);
        if (!r.error) {
          var top = r.data.length ? Number(r.data[0].data[field]) || 0 : 0;
          var c = cFresh(table), cm = 0;
          if (c) c.rows.forEach(function (x) { var n = Number(x[field]) || 0; if (n > cm) cm = n; });
          return Math.max(top, cm) + 1;
        }
      } catch (e) { /* رجوع للطريقة العامة */ }
    }
    var rows = await list(table);
    var max = 0;
    rows.forEach(function (r) {
      var n = Number(r[field]) || 0;
      if (n > max) max = n;
    });
    return max + 1;
  }
  // مساعد رصيد الذكي (Edge Function ai-assistant). بيرجّع {text, sources} أو بيرمي رسالة مفهومة.
  async function aiAsk(payload) {
    if (demoMode) throw new Error("المساعد بيشتغل على النسخة السحابية بس.");
    if (!client) throw new Error(fatal || "غير متصل");
    var res = await client.functions.invoke("ai-assistant", { body: payload });
    if (res.error) {
      var code = "provider";
      try { code = (await res.error.context.json()).error || code; } catch (e) {}
      var map = {
        limit: "وصلت للحد اليومي للمساعد، جرّب بكرة.",
        quota: "الخدمة مشغولة دلوقتي، جرّب بعد شوية.",
        not_configured: "المساعد لسه مش متفعّل (مفتاح Gemini مش مضاف على Supabase).",
        forbidden: "المساعد متاح لمالك الشركة بس.",
        auth: "سجّل الدخول من جديد وجرّب تاني.",
        busy: "خدمة Google عليها ضغط دلوقتي (مؤقت)، جرّب تاني بعد دقيقة.",
        timeout: "المساعد اتأخر في الرد، جرّب تاني.",
        empty: "المساعد مرجّعش رد، أعد صياغة سؤالك وجرّب تاني.",
      };
      throw new Error(map[code] || "المساعد مش متاح دلوقتي، جرّب تاني بعد شوية.");
    }
    return { text: res.data.text, sources: Array.isArray(res.data.sources) ? res.data.sources : [] };
  }
  window.DB = {
    aiAsk: aiAsk,
    list: list,
    get: get,
    insert: insert,
    update: update,
    remove: remove,
    uid: uid,
    isDemo: isDemo,
    ready: ready,
    logout: logout,
    profile: function () { return profile; },
    client: function () { return client; },
    getCompany: getCompany,
    saveCompany: saveCompany,
    resetDemo: resetDemo,
    nextNumber: nextNumber,
    me: me,
    can: can,
    assertCan: assertCan,
    listWhere: listWhere,
    listWhereIn: listWhereIn,
    insertRows: insertRows,
    insertMany: insertMany,
    removeMany: removeMany,
    refresh: refresh,
    fatal: fatal,
    configured: configured,
  };
})();
