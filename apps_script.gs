/**
 * Stock Dashboard DB (Google Sheets) - Apps Script
 *
 * 1) 이 파일을 Apps Script 프로젝트(Code.gs)에 붙여넣기
 * 2) 아래 TOKEN을 원하는 값으로 바꾸기 (사이트의 '보안 토큰'과 동일)
 * 3) 배포 → 새 배포 → 웹 앱 (실행: 나 / 접근: 모든 사용자)
 */

const TOKEN = "CHANGE_ME"; // TODO: 원하는 토큰으로 변경
const PROP_SS_ID = "STOCK_DASHBOARD_SS_ID";
const PROP_BASE_DATE = "STOCK_DASHBOARD_BASE_DATE";

function normCompany_(s) {
  return (s == null ? "" : String(s)).trim().replace(/\s+/g, " ");
}
function normDateIso_(s) {
  if (s == null || s === "") return "";
  // Google Sheets returns Date objects for date-formatted cells
  if (s instanceof Date) {
    const y = s.getFullYear();
    const m = String(s.getMonth() + 1).padStart(2, "0");
    const d = String(s.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(s).trim().slice(0, 10);
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ensureSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(PROP_SS_ID);
  let ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create("Stock Dashboard DB");
    id = ss.getId();
    props.setProperty(PROP_SS_ID, id);
  }

  const need = ["rows", "close", "collapsed", "planBuy", "planSell"];
  const existing = ss.getSheets().map(s => s.getName());
  need.forEach(n => {
    if (!existing.includes(n)) ss.insertSheet(n);
  });

  return ss;
}

function clearAndWrite_(sheet, values) {
  sheet.clearContents();
  if (values && values.length) {
    const range = sheet.getRange(1, 1, values.length, values[0].length);
    // Set all cells to plain text first to prevent date auto-conversion
    range.setNumberFormat("@");
    range.setValues(values);
  }
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    const req = raw ? JSON.parse(raw) : {};

    if (!req || req.token !== TOKEN) {
      return jsonOut({ ok: false, error: "unauthorized" });
    }

    const action = (req.action || "").toString();
    const ss = ensureSpreadsheet_();

    if (action === "save") {
      const p = req.payload || {};

      // rows
      const rows = Array.isArray(p.rows) ? p.rows : [];
      const rowsValues = [["date","company","account","side","price","qty"]];
      rows.forEach(r => {
        rowsValues.push([
          (r.date || ""),
          (r.company || ""),
          (r.account || ""),
          (r.side || ""),
          (r.price ?? ""),
          (r.qty ?? ""),
        ]);
      });
      clearAndWrite_(ss.getSheetByName("rows"), rowsValues);

      // closeMap (flatten, dedupe + normalize)
      const closeMap = (p.closeMap && typeof p.closeMap === "object") ? p.closeMap : {};
      const closeValues = [["date","company","close"]];

      // 같은 (date, company)가 여러 번 있으면 마지막 값으로 덮어쓰기
      const last = {};
      Object.keys(closeMap).forEach(dateRaw => {
        const date = normDateIso_(dateRaw);
        const m = closeMap[dateRaw] || {};
        Object.keys(m).forEach(companyRaw => {
          const company = normCompany_(companyRaw);
          const key = date + "||" + company;
          last[key] = { date, company, close: m[companyRaw] };
        });
      });
      Object.keys(last).sort().forEach(k => {
        const r = last[k];
        closeValues.push([r.date, r.company, r.close]);
      });

      clearAndWrite_(ss.getSheetByName("close"), closeValues);

      // base date (기준일)도 저장해서 기기 간 동기화
      if (p.baseDate) {
        PropertiesService.getScriptProperties().setProperty(PROP_BASE_DATE, normDateIso_(p.baseDate));
      }

      // collapsedDates (json 1-cell)
      const collapsed = (p.collapsedDates && typeof p.collapsedDates === "object") ? p.collapsedDates : {};
      clearAndWrite_(ss.getSheetByName("collapsed"), [[JSON.stringify(collapsed)]]);

      // 매수 계획
      const planBuy = Array.isArray(p.planBuy) ? p.planBuy : [];
      const planBuyValues = [["_id","company","account","status","qty","amount","fractional","unitPrice","note","_t"]];
      planBuy.forEach(r => {
        planBuyValues.push([
          r._id||"", r.company||"", r.account||"", r.status||"",
          r.qty??'', r.amount??'', r.fractional?'true':'false', r.unitPrice??'',
          r.note||"", r._t||""
        ]);
      });
      clearAndWrite_(ss.getSheetByName("planBuy"), planBuyValues);

      // 매도 계획
      const planSell = Array.isArray(p.planSell) ? p.planSell : [];
      const planSellValues = [["_id","company","account","status","qty","amount","fractional","unitPrice","note","_t"]];
      planSell.forEach(r => {
        planSellValues.push([
          r._id||"", r.company||"", r.account||"", r.status||"",
          r.qty??'', r.amount??'', r.fractional?'true':'false', r.unitPrice??'',
          r.note||"", r._t||""
        ]);
      });
      clearAndWrite_(ss.getSheetByName("planSell"), planSellValues);

      // meta
      PropertiesService.getScriptProperties().setProperty("UPDATED_AT", new Date().toISOString());

      return jsonOut({ ok: true, payload: { updatedAt: PropertiesService.getScriptProperties().getProperty("UPDATED_AT") } });
    }

    if (action === "load") {
      const rowsSheet = ss.getSheetByName("rows");
      const closeSheet = ss.getSheetByName("close");
      const collapsedSheet = ss.getSheetByName("collapsed");

      // rows
      const rv = rowsSheet.getDataRange().getValues();
      const outRows = [];
      for (let i = 1; i < rv.length; i++) {
        const [date, company, account, side, price, qty] = rv[i];
        if ([date, company, account, side, price, qty].every(v => v === "" || v === null)) continue;
        outRows.push({
          date: normDateIso_(date),
          company: company || "",
          account: account || "",
          side: side || "",
          price: price === "" ? "" : Number(price),
          qty: qty === "" ? "" : Number(qty),
        });
      }

      // close
      const cv = closeSheet.getDataRange().getValues();
      const outCloseMap = {};
      for (let i = 1; i < cv.length; i++) {
        const [date, company, close] = cv[i];
        if (!date || !company) continue;
        const d = normDateIso_(date);
        const c = normCompany_(company);
        if (!outCloseMap[d]) outCloseMap[d] = {};
        outCloseMap[d][c] = close;
      }

      // collapsed
      let outCollapsed = {};
      const cell = collapsedSheet.getRange(1,1).getValue();
      if (cell) {
        try { outCollapsed = JSON.parse(cell); } catch { outCollapsed = {}; }
      }

      // planBuy
      const planBuySheet = ss.getSheetByName("planBuy");
      const pbv = planBuySheet.getDataRange().getValues();
      const outPlanBuy = [];
      for (let i = 1; i < pbv.length; i++) {
        const [_id,company,account,status,qty,amount,fractional,unitPrice,note,_t] = pbv[i];
        if (!_id) continue;
        outPlanBuy.push({ _id:String(_id), company:company||"", account:account||"", status:status||"",
          qty: qty===''?'':Number(qty), amount: amount===''?'':Number(amount),
          fractional: fractional==='true', unitPrice: unitPrice===''?'':Number(unitPrice),
          note:note||"", _t:_t?Number(_t):0 });
      }

      // planSell
      const planSellSheet = ss.getSheetByName("planSell");
      const psv = planSellSheet.getDataRange().getValues();
      const outPlanSell = [];
      for (let i = 1; i < psv.length; i++) {
        const [_id,company,account,status,qty,amount,fractional,unitPrice,note,_t] = psv[i];
        if (!_id) continue;
        outPlanSell.push({ _id:String(_id), company:company||"", account:account||"", status:status||"",
          qty: qty===''?'':Number(qty), amount: amount===''?'':Number(amount),
          fractional: fractional==='true', unitPrice: unitPrice===''?'':Number(unitPrice),
          note:note||"", _t:_t?Number(_t):0 });
      }

      return jsonOut({
        ok: true,
        payload: {
          version: 1,
          updatedAt: PropertiesService.getScriptProperties().getProperty("UPDATED_AT") || "",
          baseDate: PropertiesService.getScriptProperties().getProperty(PROP_BASE_DATE) || "",
          rows: outRows,
          closeMap: outCloseMap,
          collapsedDates: outCollapsed,
          planBuy: outPlanBuy,
          planSell: outPlanSell,
        }
      });
    }

    return jsonOut({ ok: false, error: "unknown action" });

  } catch (err) {
    return jsonOut({ ok: false, error: (err && err.message) ? err.message : String(err) });
  }
}
