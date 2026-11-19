/*
 * Shared behaviour for all registration forms on the site.
 *
 * Markup conventions:
 *  - Every answer has a `name`. Its column title in the Google Sheet comes from
 *    `data-label` on the input itself or on the closest wrapper (usually `.field`).
 *  - `required` on inputs / selects / one radio of a group = must answer.
 *  - `data-required-group` on a `.field` = at least one checkbox inside must be ticked.
 *  - `data-show="someId"` on a radio/checkbox reveals #someId while it is selected
 *    (inputs inside a hidden follow-up are disabled, so they are skipped and not sent).
 *  - `.stepper` = +/- number input.
 *
 * Usage: BelevForms.init({ form: '#id', formName: 'xxx-registration', netlify: true, beforeSubmit(form) {} })
 *
 * Submissions go to the Google Sheet (Apps Script web app, one tab per formName –
 * see google-sheets/Code.gs) and, when `netlify: true`, also to Netlify Forms as a backup.
 * Opened as a local file, forms run in demo mode and only log to the console.
 */
(function () {
  const SHEET_URL = 'https://script.google.com/macros/s/AKfycbxJUaKuYcrJ2JgOoV1bqD3ORVek8WEDKYg3JRVMRTX7G3LaCGajkiVvdWgXv_DO0v8H/exec?key=7d626b23f50b428c54bd8342fcdd0748';
  const IS_LOCAL = location.protocol === 'file:';
  const MSG_INVALID = 'יש שדות שדורשים השלמה – סימנו אותם באדום.';
  const MSG_SEND = 'אירעה שגיאה בשליחה. נא לבדוק את החיבור לאינטרנט ולנסות שוב.';

  function init(opts) {
    const form = document.querySelector(opts.form);
    const success = document.querySelector(opts.success || '#success');
    const errBox = form.querySelector('.form-error');
    const btn = form.querySelector('[type="submit"]');
    const btnText = btn.textContent;

    /* ---------- follow-up questions ---------- */
    function syncFollowUps() {
      const targets = new Map();
      form.querySelectorAll('[data-show]').forEach(opt => {
        const id = opt.dataset.show;
        targets.set(id, targets.get(id) || opt.checked);
      });
      targets.forEach((show, id) => {
        const t = document.getElementById(id);
        if (!t) return;
        t.hidden = !show;
        const inputs = t.matches('input, select, textarea') ? [t] : t.querySelectorAll('input, select, textarea');
        inputs.forEach(i => { i.disabled = !show; });
      });
    }
    form.addEventListener('change', e => {
      if (!e.target.matches('input[type=radio], input[type=checkbox]')) return;
      syncFollowUps();
      const id = e.target.dataset.show;
      if (id && e.target.checked) {
        const t = document.getElementById(id);
        const first = t && (t.matches('input, textarea') ? t : t.querySelector('input[type=text], input[type=number], textarea'));
        if (first) first.focus();
      }
    });
    syncFollowUps();

    /* ---------- +/- steppers ---------- */
    form.querySelectorAll('.stepper').forEach(st => {
      const input = st.querySelector('input');
      st.querySelectorAll('button[data-step]').forEach(b => b.addEventListener('click', () => {
        const min = Number(input.min || 0), max = Number(input.max || 99);
        input.value = Math.min(max, Math.max(min, (parseInt(input.value, 10) || 0) + Number(b.dataset.step)));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }));
    });

    /* ---------- validation ---------- */
    function fieldOk(el) {
      if (el.type === 'radio') return !el.required || !!form.querySelector(`input[name="${el.name}"]:checked:not(:disabled)`);
      return el.checkValidity();
    }
    function validate() {
      let firstBad = null;
      const mark = (el, field) => {
        field.classList.add('invalid');
        if (!firstBad) firstBad = el;
      };
      form.querySelectorAll('.field').forEach(f => f.classList.remove('invalid'));
      form.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.disabled || el.type === 'hidden' || !el.name) return;
        if (el.type !== 'radio' && el.type !== 'checkbox' && typeof el.value === 'string') el.value = el.value.trim();
        if (!fieldOk(el)) mark(el, el.closest('.field') || el.parentElement);
      });
      form.querySelectorAll('.field[data-required-group]').forEach(f => {
        if (!f.querySelector('input[type=checkbox]:checked:not(:disabled)')) mark(f.querySelector('input'), f);
      });
      return firstBad;
    }
    function clearIfFixed(e) {
      const f = e.target.closest('.field');
      if (!f || !f.classList.contains('invalid')) return;
      const stillBad = [...f.querySelectorAll('input, select, textarea')].some(el => !el.disabled && el.name && !fieldOk(el))
        || (f.hasAttribute('data-required-group') && !f.querySelector('input[type=checkbox]:checked'));
      if (!stillBad) f.classList.remove('invalid');
    }
    form.addEventListener('input', clearIfFixed);
    form.addEventListener('change', clearIfFixed);

    /* ---------- collect answers in form order ---------- */
    function collect() {
      const fields = [], data = {}, seen = new Set();
      const els = [...form.elements];
      for (const el of els) {
        const name = el.name;
        if (!name || seen.has(name) || name === 'form-name' || name === 'bot-field') continue;
        seen.add(name);
        // hidden follow-up questions (disabled) still get their column, just empty
        const group = els.filter(x => x.name === name && !x.disabled);
        const value = (el.type === 'radio' || el.type === 'checkbox')
          ? group.filter(x => x.checked).map(x => x.value).join(', ')
          : group.map(x => String(x.value).trim()).filter(Boolean).join(', ');
        const holder = el.dataset.label ? el : el.closest('[data-label]');
        fields.push([holder ? holder.dataset.label : name, value]);
        data[name] = value;
      }
      return { fields, data };
    }

    /* ---------- sending ---------- */
    function sendToSheet(payload) {
      // text/plain keeps this a "simple" request (Apps Script can't answer CORS preflights)
      return fetch(SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      })
        .then(r => r.json())
        .then(j => { if (!j.ok || j.skipped !== undefined) throw new Error('Sheet: ' + JSON.stringify(j)); });
    }
    function sendToNetlify(data) {
      const body = new URLSearchParams({ 'form-name': opts.formName, 'bot-field': '', ...data });
      return fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      }).then(r => { if (!r.ok) throw new Error('Netlify: ' + r.status); });
    }

    function showError(msg, el) {
      errBox.textContent = msg;
      errBox.style.display = 'block';
      if (el) {
        (el.closest('.field') || el).scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => el.focus({ preventScroll: true }), 350);
      }
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (opts.beforeSubmit) opts.beforeSubmit(form);
      const firstBad = validate();
      if (firstBad) return showError(MSG_INVALID, firstBad);
      errBox.style.display = 'none';

      const { fields, data } = collect();
      btn.disabled = true;
      btn.textContent = 'שולחים...';
      try {
        const bot = (form.querySelector('[name="bot-field"]') || {}).value;
        if (IS_LOCAL) {
          console.info('[demo mode] ' + opts.formName + ' – opened as a local file, nothing was sent:', fields);
          window.__lastSubmission = { formName: opts.formName, fields, data };
        } else if (!bot) { // a filled spam trap is quietly dropped
          const jobs = [sendToSheet({ form_name: opts.formName, created_at: new Date().toISOString(), fields, data })];
          if (opts.netlify) jobs.push(sendToNetlify(data));
          const results = await Promise.allSettled(jobs);
          results.filter(r => r.status === 'rejected').forEach(r => console.error(r.reason));
          if (!results.some(r => r.status === 'fulfilled')) throw new Error('Submit failed');
        }
        form.hidden = true;
        success.hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        console.error(err);
        showError(MSG_SEND);
        btn.disabled = false;
        btn.textContent = btnText;
      }
    });
  }

  window.BelevForms = { init };
})();
