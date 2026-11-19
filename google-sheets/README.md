# Registrations → Google Sheet

When someone submits the registration form, `register.html` sends the answers straight
to a small **Google Apps Script** (`Code.gs`) attached to the sheet (`SHEET_URL` in
`register.html`), and also to Netlify Forms as a backup copy.
Each registration becomes a row in the `הרשמות` tab, with Hebrew column titles.

Note: because the page sends to the sheet directly, the `?key=` value is visible in the
page source. It only stops casual misuse; if junk rows ever show up, change `SECRET` in
the script and the key in `SHEET_URL` together.

Step 5 below (Netlify webhook) is optional – it is not needed while the page sends directly,
and form notifications may not be available on Netlify's free plan.

## One-time setup

1. **Create the sheet** – in Google Drive: New → Google Sheets, name it e.g. `הרשמות ליריד`.
2. **Add the script** – in the sheet: Extensions → Apps Script. Delete what is there,
   paste the contents of `Code.gs`, and replace `PASTE_SECRET_HERE` with the secret key
   (any long random string; keep it private). Save (Ctrl+S).
3. **Approve and test** – choose `testInsert` in the function dropdown → Run.
   Google asks for permission: Review permissions → choose the account →
   Advanced → Go to … (unsafe) → Allow. A `הרשמות` tab with a test row appears.
4. **Publish the script** – Deploy → New deployment → ⚙ → Web app.
   Execute as: **Me**. Who has access: **Anyone**. Deploy → copy the **Web app URL**.
5. **Connect Netlify** – Project configuration → Notifications → Emails and webhooks →
   Form submission notifications → Add notification → **HTTP POST request** (outgoing webhook):
   - Event: New form submission
   - URL: `<Web app URL>?key=<secret key>`
   - Form: `reps-registration`
6. **Test** – submit a registration on the live site; a new row should appear within seconds.

## Notes

- Registrations sent before the webhook was added are not copied automatically –
  download them from Netlify (Forms → reps-registration → Download as CSV) and paste them in.
- If you change `Code.gs` later: Deploy → Manage deployments → ✏ → Version: New version → Deploy
  (the URL stays the same).
