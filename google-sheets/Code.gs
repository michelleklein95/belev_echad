/**
 * Belev Echad job fair – save form registrations to this Google Sheet.
 *
 * The website sends every registration here (see forms.js). Each form has its
 * own tab; columns are created automatically from the question titles the
 * website sends, so changing a form does not require changing this script.
 *
 * Setup: see google-sheets/README.md
 */

// Must match the ?key=... part of SHEET_URL in forms.js.
// Keep the real value out of GitHub (the filled-in copy is Code.local.gs).
const SECRET = 'PASTE_SECRET_HERE';

// form name sent by the website → tab name in this spreadsheet
const TABS = {
  'reps-registration': 'נציגי חברות ואקדמיה',
  'members-registration': 'חברי העמותה',
  'vendors-registration': 'דוכני מכירה',
};
// older tab names that should be renamed instead of creating a new tab
const OLD_TAB_NAMES = { 'reps-registration': ['הרשמות'] };

const DATE_COLUMN = 'תאריך הרשמה';

function doPost(e) {
  if (!e || !e.parameter || e.parameter.key !== SECRET) {
    return json({ ok: false, error: 'unauthorized' });
  }
  let body;
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json({ ok: false, error: 'bad json' }); }

  const tab = TABS[body.form_name];
  if (!tab) return json({ ok: true, skipped: body.form_name || '' });

  // [[question title, answer], ...] in the order they appear on the form
  const fields = Array.isArray(body.fields)
    ? body.fields.filter(f => Array.isArray(f) && f.length === 2)
    : Object.entries(body.data || {});

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSheet(body.form_name, tab);
    const headers = ensureHeaders(sheet, fields.map(f => String(f[0])));
    const values = new Map(fields.map(([k, v]) => [String(k), v]));
    const row = headers.map(h => h === DATE_COLUMN ? new Date(body.created_at || Date.now()) : clean(values.get(h)));
    sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return json({ ok: true });
}

function getSheet(formName, tab) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(tab);
  if (!sheet) {
    const old = (OLD_TAB_NAMES[formName] || []).map(n => ss.getSheetByName(n)).find(Boolean);
    sheet = old ? old.setName(tab) : ss.insertSheet(tab);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([DATE_COLUMN]);
    sheet.setFrozenRows(1);
    sheet.setRightToLeft(true);
    sheet.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm');
    styleHeader(sheet, 1, 1);
  }
  return sheet;
}

/** Makes sure every question has a column; adds missing ones at the end. Returns the header row. */
function ensureHeaders(sheet, labels) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const missing = labels.filter((l, i) => l && l !== DATE_COLUMN && !headers.includes(l) && labels.indexOf(l) === i);
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    styleHeader(sheet, headers.length + 1, missing.length);
    return headers.concat(missing);
  }
  return headers;
}

function styleHeader(sheet, fromCol, count) {
  sheet.getRange(1, fromCol, 1, count).setFontWeight('bold').setBackground('#fde49b');
}

/** Text as-is; keeps leading zeros (phones) and stops answers from being run as formulas. */
function clean(value) {
  if (value == null) return '';
  const s = String(value);
  if (/^[=+\-@]/.test(s) || /^0\d/.test(s)) return "'" + s;
  return s;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run from the Apps Script editor to check permissions – adds one test row to the members tab. */
function testInsert() {
  const out = doPost({
    parameter: { key: SECRET },
    postData: {
      contents: JSON.stringify({
        form_name: 'members-registration',
        created_at: new Date().toISOString(),
        fields: [['שם מלא', 'שורת בדיקה – אפשר למחוק'], ['טלפון', '050-0000000']],
      }),
    },
  });
  Logger.log(out.getContent());
}
