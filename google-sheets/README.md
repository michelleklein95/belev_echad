# Registrations → Google Sheet

All three registration forms send their answers to one Google Sheet, through a small
**Google Apps Script** (`Code.gs`) attached to the sheet. Each form has its own tab:

| Page | Form name | Tab |
|---|---|---|
| `members.html` | `members-registration` | חברי העמותה |
| `register.html` | `reps-registration` | נציגי חברות ואקדמיה (renamed automatically from the old `הרשמות` tab) |
| `vendors.html` | `vendors-registration` | דוכני מכירה |

Columns are created automatically from each question's `data-label` (see `forms.js`),
in the order the questions appear on the form, so editing a form does not require
changing the script. The reps and vendors forms also keep a backup copy in Netlify Forms;
the members form goes to the sheet only (Netlify's free plan allows ~100 submissions a month).

The web app URL and key live in `SHEET_URL` at the top of `forms.js`. Because the page sends
to the sheet directly, the key is visible in the page source – it only stops casual misuse.
If junk rows ever show up, change `SECRET` in the script and the key in `SHEET_URL` together.

## One-time setup

1. **Create the sheet** – in Google Drive: New → Google Sheets.
2. **Add the script** – in the sheet: Extensions → Apps Script. Delete what is there,
   paste the contents of `Code.gs`, and replace `PASTE_SECRET_HERE` with the secret key.
   Save (Ctrl+S). (Tip: if Apps Script won't open, use an incognito window signed in to one Google account.)
3. **Approve and test** – choose `testInsert` in the function dropdown → Run → approve permissions
   (Advanced → Go to … (unsafe) → Allow). A `חברי העמותה` tab with a test row appears.
4. **Publish** – Deploy → New deployment → ⚙ → Web app. Execute as: **Me**.
   Who has access: **Anyone**. Deploy → copy the Web app URL into `SHEET_URL` in `forms.js`.

## Updating the script later

Paste the new code, save, then **Deploy → Manage deployments → ✏ (edit) → Version: New version → Deploy**.
The URL stays the same, so nothing on the website needs to change.
