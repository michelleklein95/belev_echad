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

    /* ---------- screen-reader structure ---------- */
    // The red * is visual only – the inputs already carry `required`.
    form.querySelectorAll('.req').forEach(r => r.setAttribute('aria-hidden', 'true'));
    // Name every group of radio buttons / checkboxes after its question (WCAG 1.3.1).
    form.querySelectorAll('.field').forEach((f, i) => {
      const choices = f.querySelector('.choices, .type-cards');
      const label = f.querySelector(':scope > .label, :scope > .yn-row > .label');
      if (!choices || !label || !choices.querySelector('input[type=radio], input[type=checkbox]')) return;
      if (!choices.hasAttribute('aria-label') && !choices.hasAttribute('aria-labelledby')) {
        label.id = label.id || `${opts.formName}-q${i}`;
        choices.setAttribute('aria-labelledby', label.id);
      }
      const radios = choices.querySelector('input[type=radio]');
      choices.setAttribute('role', radios ? 'radiogroup' : 'group');
      if (radios && radios.required) choices.setAttribute('aria-required', 'true');
      // aria-required isn't allowed on checkbox groups, so say it in the group's name instead
      if (f.hasAttribute('data-required-group') && !label.querySelector('.sr-required')) {
        label.insertAdjacentHTML('beforeend', '<span class="visually-hidden sr-required"> (שדה חובה)</span>');
      }
    });
    form.querySelectorAll('.error-msg').forEach((m, i) => { m.id = m.id || `${opts.formName}-err${i}`; });

    /* ---------- city fields: official list of Israeli localities ---------- */
    const norm = s => String(s).replace(/[-–־"״'׳().,]/g, ' ').replace(/קריית/g, 'קרית').replace(/\s+/g, ' ').trim();
    const cityInputs = form.querySelectorAll('input[data-cities]');
    if (cityInputs.length && window.IL_LOCALITIES) {
      let dl = document.getElementById('il-localities');
      if (!dl) {
        dl = document.createElement('datalist');
        dl.id = 'il-localities';
        window.IL_LOCALITIES.forEach(n => { const o = document.createElement('option'); o.value = n; dl.appendChild(o); });
        document.body.appendChild(dl);
      }
      const index = new Map();
      window.IL_LOCALITIES.forEach(n => {
        index.set(norm(n), n);
        const short = n.split(' - ')[0];            // "תל אביב" → "תל אביב - יפו"
        if (short !== n && !index.has(norm(short))) index.set(norm(short), n);
      });
      cityInputs.forEach(inp => {
        inp.setAttribute('list', 'il-localities');
        inp.checkCity = () => {
          const v = inp.value.trim();
          if (!v) { inp.setCustomValidity(''); return; }
          const match = index.get(norm(v));
          if (match) { if (inp.value !== match) inp.value = match; inp.setCustomValidity(''); }
          else inp.setCustomValidity('נא לבחור יישוב מהרשימה');
        };
        inp.addEventListener('change', inp.checkCity);
        inp.addEventListener('blur', inp.checkCity);
      });
    }

    /* ---------- tag pickers (choose several, with quick picks + autocomplete) ---------- */
    form.querySelectorAll('[data-tags]').forEach(box => {
      const hidden = box.querySelector('input[type=hidden]');
      const entry = box.querySelector('.tag-entry input');
      const list = box.querySelector('.tag-list');
      const status = box.querySelector('.tag-status');
      const options = [...box.querySelectorAll('datalist option')].map(o => o.value);
      const tags = [];
      const sync = () => {
        hidden.value = tags.join(', ');
        list.innerHTML = '';
        tags.forEach(t => {
          const li = document.createElement('li');
          const txt = document.createElement('span'); txt.textContent = t;
          const rm = document.createElement('button');
          rm.type = 'button'; rm.className = 'tag-remove';
          rm.setAttribute('aria-label', 'הסרת ' + t);
          rm.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';
          rm.addEventListener('click', () => { remove(t); entry.focus(); });
          li.append(txt, rm);
          list.appendChild(li);
        });
        box.querySelectorAll('.quick-pick').forEach(b => b.setAttribute('aria-pressed', String(tags.includes(b.dataset.value))));
      };
      const add = raw => {
        const t = String(raw).trim().replace(/\s+/g, ' ');
        if (!t) return;
        if (!tags.includes(t)) { tags.push(t); status.textContent = 'נוסף: ' + t; }
        sync();
      };
      const remove = t => { const i = tags.indexOf(t); if (i > -1) { tags.splice(i, 1); status.textContent = 'הוסר: ' + t; sync(); } };
      box.flush = () => { if (entry.value.trim()) { add(entry.value); entry.value = ''; } };
      box.querySelectorAll('.quick-pick').forEach(b => b.addEventListener('click', () => (tags.includes(b.dataset.value) ? remove : add)(b.dataset.value)));
      box.querySelector('.tag-add').addEventListener('click', () => { box.flush(); entry.focus(); });
      entry.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); box.flush(); } });
      // picking a suggestion from the list adds it straight away
      entry.addEventListener('input', () => { if (options.includes(entry.value)) { add(entry.value); entry.value = ''; } });
      sync();
    });

    /* ---------- validation ---------- */
    function fieldOk(el) {
      if (el.type === 'radio') return !el.required || !!form.querySelector(`input[name="${el.name}"]:checked:not(:disabled)`);
      if (el.checkCity) el.checkCity();
      return el.checkValidity();
    }
    // Mark / unmark a question: red outline + aria-invalid + the error text read by screen readers
    function setInvalid(field, bad) {
      field.classList.toggle('invalid', bad);
      const msg = field.querySelector('.error-msg');
      field.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(el => {
        if (bad) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
        if (!msg) return;
        const ids = (el.getAttribute('aria-describedby') || '').split(' ').filter(x => x && x !== msg.id);
        if (bad) ids.push(msg.id);
        if (ids.length) el.setAttribute('aria-describedby', ids.join(' ')); else el.removeAttribute('aria-describedby');
      });
    }
    function validate() {
      let firstBad = null;
      const mark = (el, field) => {
        setInvalid(field, true);
        if (!firstBad) firstBad = el;
      };
      form.querySelectorAll('.field.invalid').forEach(f => setInvalid(f, false));
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
      const stillBad = [...f.querySelectorAll('input, select, textarea')].some(el => !el.disabled && el.name && el.type !== 'hidden' && !fieldOk(el))
        || (f.hasAttribute('data-required-group') && !f.querySelector('input[type=checkbox]:checked'));
      if (!stillBad) setInvalid(f, false);
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
      form.querySelectorAll('[data-tags]').forEach(b => b.flush()); // text typed but not yet added
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
