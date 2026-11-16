// Book-a-visit → costs → agreement → pay token → done flow (front-end demo, no real payments).
import { esc, inr, fmtDate, num } from '../util.js';

const STEPS = ['Costs', 'Agreement', 'Pay token', 'Done'];
const STEP_OF = { costs: 0, agreement: 1, pay: 2, holding: 2, done: 3 };
const TOKEN = 10000;

/**
 * ctx: { kind: 'flat'|'plot', title, subtitle, listing: 'rent'|'sale', price, deposit, contact,
 *        onClose(), onReserved(), onWalk() }
 */
export function openFlow(el, ctx, start = 'visit') {
  const tomorrow = new Date(Date.now() + 86400000);
  const s = {
    step: start,
    name: '',
    phone: '',
    date: tomorrow.toISOString().slice(0, 10),
    time: '17:30',
    agree: false,
    error: '',
    list: {},
  };
  const noun = ctx.kind === 'plot' ? 'plot' : 'flat';
  const rent = ctx.listing === 'rent';
  const token = Math.min(TOKEN, num(ctx.deposit) || TOKEN);

  const close = () => {
    el.classList.add('hidden');
    el.innerHTML = '';
    el.onclick = el.oninput = null;
    ctx.onClose?.();
  };

  const stepBar = () => {
    if (!(s.step in STEP_OF)) return '';
    const cur = STEP_OF[s.step];
    return `<ol class="steps">${STEPS.map((t, i) => `<li class="${i < cur || s.step === 'done' ? 'done' : i === cur ? 'cur' : ''}"><i>${i < cur || s.step === 'done' ? '✓' : i + 1}</i>${t}</li>`).join('')}</ol>`;
  };

  const facts = (items) => `<div class="facts">${items.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;

  const visitWhen = () => {
    const d = new Date(`${s.date}T${s.time}`);
    return Number.isNaN(d.getTime()) ? `${s.date} ${s.time}` : `${fmtDate(d)}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
  };

  function body() {
    switch (s.step) {
      case 'visit':
        return `
          <h2>Book a visit</h2>
          <p class="muted">${esc(ctx.title)} · ${esc(ctx.subtitle)}</p>
          <div class="grid2 narrow">
            <label class="field full"><span>Your name</span><input data-k="name" value="${esc(s.name)}" autocomplete="name" /></label>
            <label class="field full"><span>Mobile number</span><input data-k="phone" value="${esc(s.phone)}" inputmode="numeric" maxlength="10" placeholder="10-digit number" /></label>
            <label class="field"><span>Date</span><input data-k="date" type="date" value="${esc(s.date)}" min="${new Date().toISOString().slice(0, 10)}" /></label>
            <label class="field"><span>Time</span><input data-k="time" type="time" value="${esc(s.time)}" /></label>
          </div>
          ${s.error ? `<p class="err">${esc(s.error)}</p>` : ''}
          <div class="btns"><button class="primary" data-act="confirm-visit">Confirm visit</button><button class="ghost" data-act="close">Cancel</button></div>`;
      case 'visited':
        return `
          <div class="big-check">✓</div>
          <h2>Visit booked</h2>
          <p class="muted">${esc(ctx.contact || 'Our agent')} will meet you at the ${noun} on ${esc(visitWhen())}.</p>
          ${facts([[ctx.kind === 'plot' ? 'Plot' : 'Flat', esc(ctx.title)], ['When', esc(visitWhen())], ['Brokerage', '₹0']])}
          <div class="btns"><button class="primary" data-act="to-costs">Reserve this ${noun} now</button><button class="ghost" data-act="close">Back to the ${noun}</button></div>`;
      case 'costs':
        return `
          <h2>What you pay</h2>
          <p class="muted">${esc(ctx.title)} · ${esc(ctx.subtitle)}</p>
          <table class="costs">
            ${rent ? `<tr><td>Monthly rent</td><td>${inr(ctx.price)}</td></tr><tr><td>Security deposit</td><td>${inr(ctx.deposit)}</td></tr>` : `<tr><td>${ctx.kind === 'plot' ? 'Plot price' : 'Sale price'}</td><td>${inr(ctx.price)}</td></tr>`}
            <tr><td>Token to hold the ${noun} <small>(adjusted in ${rent ? 'deposit' : 'price'})</small></td><td>${inr(token)}</td></tr>
            <tr class="ok"><td>Brokerage</td><td>₹0</td></tr>
            <tr class="total"><td>Pay now</td><td>${inr(token)}</td></tr>
          </table>
          <div class="btns"><button class="primary" data-act="to-agreement">Continue</button><button class="ghost" data-act="close">Back</button></div>`;
      case 'agreement': {
        const today = fmtDate(new Date());
        return `
          <h2>${rent ? 'Rent agreement' : 'Agreement to sell'} (draft)</h2>
          <div class="agreement">
            <p>This agreement is made on <b>${today}</b> between the owner of <b>${esc(ctx.title)}</b>, ${esc(ctx.subtitle)} and <b>${esc(s.name || 'the buyer / tenant')}</b>.</p>
            ${rent
              ? `<p>The tenant agrees to pay a monthly rent of <b>${inr(ctx.price)}</b> and a refundable security deposit of <b>${inr(ctx.deposit)}</b>, for a term of <b>11 months</b>, renewable by mutual consent with one month's notice from either side.</p>`
              : `<p>The buyer agrees to purchase the ${noun} for <b>${inr(ctx.price)}</b>, paying a booking amount of <b>${inr(token)}</b> today, with the balance due at registration.</p>`}
            <p>No brokerage is payable by either party. The token of <b>${inr(token)}</b> is adjusted against the ${rent ? 'deposit' : 'price'}.</p>
          </div>
          <label class="check"><input type="checkbox" data-k="agree" ${s.agree ? 'checked' : ''} /> I have read the draft and agree to sign it online.</label>
          ${s.error ? `<p class="err">${esc(s.error)}</p>` : ''}
          <div class="btns"><button class="primary" data-act="sign">Sign &amp; continue</button><button class="ghost" data-act="to-costs">Back</button></div>`;
      }
      case 'pay':
        return `
          <h2>Pay token</h2>
          <p class="muted">Holds the ${noun} for you. This is a demo — no money is charged.</p>
          ${facts([['Token', inr(token)], ['For', esc(ctx.title)], ['Brokerage', '₹0']])}
          <div class="btns"><button class="primary" data-act="pay">Pay ${inr(token)} (demo)</button><button class="ghost" data-act="to-agreement">Back</button></div>`;
      case 'holding':
        return `<div class="holding"><div class="spinner"></div><h3>Holding the ${noun} for you</h3><p class="muted">This takes a moment</p></div>`;
      case 'done': {
        const keys = new Date(Date.now() + 2 * 86400000);
        const items = rent
          ? [`Token paid · ${inr(token)}`, 'Rent agreement signed and e-stamped', `Pay the rest of the deposit by ${fmtDate(keys)}`, 'Book packers and movers', 'Check the inventory list on move-in day']
          : [`Booking amount paid · ${inr(token)}`, `${ctx.kind === 'plot' ? 'Agreement to sell' : 'Sale agreement'} signed online`, 'Arrange home loan / funds for the balance', 'Verify title documents and approvals', 'Book the registration slot'];
        items.forEach((t, i) => (s.list[i] ??= i < 2));
        return `
          <div class="big-check">✓</div>
          <h2>The ${noun} is yours</h2>
          <p class="muted">${esc(ctx.title)} is reserved. You found it without a broker.</p>
          ${facts([[rent ? 'Keys handover' : 'Registration', fmtDate(keys)], ['Brokerage paid', '₹0'], ['Agreement', 'Signed online']])}
          <div class="checklist"><h4>Before you ${rent ? 'move in' : 'register'}</h4>
            ${items.map((t, i) => `<label class="check"><input type="checkbox" data-list="${i}" ${s.list[i] ? 'checked' : ''} /> ${esc(t)}</label>`).join('')}
          </div>
          <div class="btns"><button class="primary" data-act="walk">${ctx.kind === 'plot' ? 'See your plot again' : 'Walk your new home again'}</button></div>`;
      }
      default:
        return '';
    }
  }

  function render() {
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="flow-bar">
        <button class="link" data-act="close">‹ Back to ${noun}</button>
        <span class="brand-sm">PropView</span>
        ${stepBar()}
      </div>
      <div class="flow-body"><div class="flow-card">${body()}</div></div>`;
  }

  el.oninput = (e) => {
    const t = e.target;
    if (t.dataset.k) s[t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value;
    if (t.dataset.list !== undefined) s.list[t.dataset.list] = t.checked;
  };
  el.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    s.error = '';
    if (act === 'close') return close();
    if (act === 'confirm-visit') {
      if (!s.name.trim()) s.error = 'Please enter your name.';
      else if (!/^[6-9]\d{9}$/.test(s.phone.trim())) s.error = 'Please enter a valid 10-digit Indian mobile number.';
      else if (!s.date || !s.time) s.error = 'Pick a date and time.';
      else s.step = 'visited';
    } else if (act === 'to-costs') s.step = 'costs';
    else if (act === 'to-agreement') s.step = 'agreement';
    else if (act === 'sign') {
      if (!s.agree) s.error = 'Tick the box to agree before signing.';
      else s.step = 'pay';
    } else if (act === 'pay') {
      s.step = 'holding';
      render();
      setTimeout(() => {
        if (el.classList.contains('hidden')) return;
        s.step = 'done';
        ctx.onReserved?.();
        render();
      }, 1600);
      return;
    } else if (act === 'walk') {
      close();
      ctx.onWalk?.();
      return;
    }
    render();
  };

  render();
  return { close };
}
