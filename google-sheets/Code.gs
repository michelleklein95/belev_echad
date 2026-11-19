/**
 * Belev Echad job fair – save reps registrations to this Google Sheet.
 *
 * Netlify sends every verified (non-spam) submission of the "reps-registration"
 * form to this script through an "Outgoing webhook" form notification.
 * Each submission becomes one row in the "הרשמות" tab, with Hebrew column titles.
 *
 * Setup: see google-sheets/README.md
 */

// Must match the ?key=... part of the webhook URL in Netlify.
// Keep the real value private – do not commit it to GitHub.
const SECRET = 'PASTE_SECRET_HERE';

const SHEET_NAME = 'הרשמות';

// [field name sent by the site, column title in the sheet]
const COLUMNS = [
  ['created_at',       'תאריך הרשמה'],
  ['orgType',          'סוג ארגון'],
  ['orgName',          'שם החברה / המוסד'],
  ['field',            'תחום פעילות'],
  ['contactName',      'איש/אשת קשר'],
  ['role',             'תפקיד'],
  ['phone',            'טלפון'],
  ['email',            'אימייל'],
  ['region',           'אזור'],
  ['city',             'עיר / יישוב'],
  ['repsCount',        'מספר נציגים'],
  ['needs',            'צרכים בדוכן'],
  ['needsOther',       'בקשות נוספות לדוכן'],
  ['rollup',           'רולאפ'],
  ['marketing',        'חומר שיווקי'],
  ['marketingDetails', 'פירוט חומר שיווקי'],
  ['positions',        'משרות / מסלולים'],
  ['notes',            'הערות'],
];

function doPost(e) {
  if (!e || !e.parameter || e.parameter.key !== SECRET) {
    return json({ ok: false, error: 'unauthorized' });
  }

  const body = JSON.parse(e.postData.contents || '{}');
  if (body.form_name && body.form_name !== 'reps-registration') {
    return json({ ok: true, skipped: body.form_name });
  }
  const data = body.data || {};

  const row = COLUMNS.map(([key]) => {
    if (key === 'created_at') return new Date(body.created_at || Date.now());
    const value = data[key] == null ? '' : String(data[key]);
    // keep leading zeros in phone numbers (stored as text)
    return key === 'phone' && value ? "'" + value : value;
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    getSheet().appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return json({ ok: true });
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS.map(c => c[1]));
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold').setBackground('#fde49b');
    sheet.setFrozenRows(1);
    sheet.setRightToLeft(true);
    sheet.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm');
  }
  return sheet;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run this once from the Apps Script editor to approve permissions and add a test row. */
function testInsert() {
  doPost({
    parameter: { key: SECRET },
    postData: {
      contents: JSON.stringify({
        form_name: 'reps-registration',
        created_at: new Date().toISOString(),
        data: { orgType: 'בדיקה', orgName: 'שורת בדיקה – אפשר למחוק', phone: '050-0000000', repsCount: '2' },
      }),
    },
  });
}
