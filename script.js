/* --- CONFIGURATION & GLOBAL STATE --- */
const FX_API = '393a43661559351810312743';
const STOCK_API = 'RCOIHB62BAXECU2U';
const CURRENCIES = ["HKD", "USD", "EUR", "CNY", "GBP", "JPY", "AUD", "SGD", "CAD"];

let db = {
    liquid: JSON.parse(localStorage.getItem('w_liquid')) || [],
    fixed: JSON.parse(localStorage.getItem('w_fixed')) || [],
    stocks: JSON.parse(localStorage.getItem('w_stocks')) || [],
    debt: JSON.parse(localStorage.getItem('w_debt')) || [],
    settings: JSON.parse(localStorage.getItem('w_settings')) || { 
        masterCurr: "HKD", 
        goal: 1000000, 
        goalCurr: "HKD", 
        years: 10, 
        income: 0, 
        incomeFreq: "monthly", 
        incomeCurr: "HKD", 
        inflation: 2.5, 
        stkGrowth: 7.0 
    }
};

let rates = {};
let currentEditState = null;

/* --- UI INITIALIZATION --- */
window.addEventListener('DOMContentLoaded', async () => {
    initUI();
    await refreshAll(true);
});

function initUI() {
    // Populate Currency Dropdowns
    document.querySelectorAll('.curr-list').forEach(s => {
        CURRENCIES.forEach(c => s.add(new Option(c, c)));
    });
    
    // Load Settings into Inputs
    const s = db.settings;
    document.getElementById('master-currency').value = s.masterCurr;
    document.getElementById('target-goal').value = s.goal;
    document.getElementById('goal-curr').value = s.goalCurr;
    document.getElementById('years-to-goal').value = s.years;
    document.getElementById('inflation-rate').value = s.inflation;
    document.getElementById('stock-growth').value = s.stkGrowth;
    document.getElementById('income-val').value = s.income;
    document.getElementById('income-freq').value = s.incomeFreq;
    document.getElementById('income-curr').value = s.incomeCurr;

    document.getElementById('master-currency').onchange = (e) => { 
        db.settings.masterCurr = e.target.value; 
        save(); 
        refreshAll(false); 
    };

    document.getElementById('form-edit-modal').onsubmit = (e) => {
        e.preventDefault();
        saveModalEdit();
    };

    // 1. Add Liquid (Smart Merge)
    document.getElementById('form-liquid').onsubmit = (e) => {
        e.preventDefault();
        const n = document.getElementById('liq-name').value;
        const a = parseFloat(document.getElementById('liq-amount').value) || 0;
        const c = document.getElementById('liq-curr').value;
        const idx = db.liquid.findIndex(i => i.name.toLowerCase() === n.toLowerCase() && i.currency === c);
        if(idx > -1) db.liquid[idx].amount += a;
        else db.liquid.unshift({id: Date.now(), name: n, amount: a, currency: c});
        save(); refreshAll(false); e.target.reset();
    };

    // 2. Add Fixed
    document.getElementById('form-fixed').onsubmit = (e) => {
        e.preventDefault();
        db.fixed.unshift({ 
            id: Date.now(), 
            name: document.getElementById('fix-name').value, 
            principal: parseFloat(document.getElementById('fix-amount').value) || 0, 
            currency: document.getElementById('fix-curr').value, 
            rate: parseFloat(document.getElementById('fix-rate').value) || 0, 
            duration: parseInt(document.getElementById('fix-duration').value), 
            start: document.getElementById('fix-start').value 
        });
        save(); refreshAll(false); e.target.reset();
    };

    // 3. Add Stocks (Weighted Average Cost)
    document.getElementById('form-stocks').onsubmit = (e) => {
        e.preventDefault();
        const t = document.getElementById('stk-ticker').value.toUpperCase();
        const q = parseFloat(document.getElementById('stk-qty').value) || 0;
        const b = parseFloat(document.getElementById('stk-buy').value) || 0;
        const idx = db.stocks.findIndex(i => i.ticker === t);
        if(idx > -1) {
            const s = db.stocks[idx];
            s.buyPrice = ((s.buyPrice * s.qty) + (b * q)) / (s.qty + q);
            s.qty += q;
        } else db.stocks.unshift({id: Date.now(), ticker: t, qty: q, buyPrice: b}); 
        save(); refreshAll(false); e.target.reset();
    };

    // 4. Add Debt (Smart Merge)
    document.getElementById('form-debt').onsubmit = (e) => {
        e.preventDefault();
        const n = document.getElementById('debt-name').value;
        const a = parseFloat(document.getElementById('debt-amount').value) || 0;
        const c = document.getElementById('debt-curr').value;
        const idx = db.debt.findIndex(i => i.name.toLowerCase() === n.toLowerCase() && i.currency === c);
        if(idx > -1) db.debt[idx].amount += a;
        else db.debt.unshift({id: Date.now(), name: n, amount: a, currency: c});
        save(); refreshAll(false); e.target.reset();
    };

    document.getElementById('calc-btn').onclick = () => { syncSettings(); refreshAll(false, true); };
}

function syncSettings() {
    db.settings = { 
        masterCurr: document.getElementById('master-currency').value, 
        goal: parseFloat(document.getElementById('target-goal').value) || 0, 
        goalCurr: document.getElementById('goal-curr').value, 
        years: parseFloat(document.getElementById('years-to-goal').value) || 0, 
        inflation: parseFloat(document.getElementById('inflation-rate').value) || 0, 
        stkGrowth: parseFloat(document.getElementById('stock-growth').value) || 0, 
        income: parseFloat(document.getElementById('income-val').value) || 0, 
        incomeFreq: document.getElementById('income-freq').value, 
        incomeCurr: document.getElementById('income-curr').value 
    };
    save();
}

/* --- CORE REFRESH & RENDERING ENGINE --- */
async function refreshAll(fullFetch = true, skipStocks = true) {
    const mCurr = db.settings.masterCurr;
    document.querySelectorAll('.header-curr-label').forEach(el => el.innerText = mCurr);

    try {
        const res = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API}/latest/${mCurr}`).then(r => r.json());
        if (res.conversion_rates) rates = res.conversion_rates;
    } catch(e) { console.error("Forex Sync Failed."); }

    let t = { liq: 0, fix: 0, stk: 0, debt: 0, yield: 0, stockPL: 0 };

    // 1. Render Liquid
    const liqBody = document.querySelector('#table-liquid tbody');
    liqBody.innerHTML = '';
    db.liquid.forEach(i => {
        const mv = i.amount / rates[i.currency]; t.liq += mv;
        liqBody.innerHTML += `<tr><td>${i.name}</td><td>${i.amount.toLocaleString()} ${i.currency}</td><td>${mv.toLocaleString(undefined, {maximumFractionDigits: 0})}</td><td><button class="btn-edit" onclick="openModal('liquid',${i.id})">Edit</button><button class="btn-del" onclick="del('liquid',${i.id})">✕</button></td></tr>`;
    });

    // 2. Render Fixed
    const fixBody = document.querySelector('#table-fixed tbody');
    fixBody.innerHTML = '';
    db.fixed.forEach(i => {
        const interest = i.principal * (i.rate / 100) * (i.duration / 12);
        const totalAtMaturity = i.principal + interest;
        const mv = totalAtMaturity / rates[i.currency];
        const endD = new Date(new Date(i.start).setMonth(new Date(i.start).getMonth() + i.duration)).toISOString().split('T')[0];
        t.fix += mv; t.yield += (mv * (i.rate / 100));
        fixBody.innerHTML += `<tr><td>${i.name}</td><td>${i.rate}%</td><td>${endD}</td><td class="surplus">${interest.toLocaleString(undefined, {maximumFractionDigits:0})}</td><td>${totalAtMaturity.toLocaleString(undefined, {maximumFractionDigits:0})}</td><td><button class="btn-edit" onclick="openModal('fixed',${i.id})">Edit</button><button class="btn-del" onclick="del('fixed',${i.id})">✕</button></td></tr>`;
    });

    // 3. Render Equities (Live Price)
    const stkBody = document.querySelector('#table-stocks tbody');
    stkBody.innerHTML = '';
    for (let s of db.stocks) {
        if (!skipStocks || !s.lastLive) {
            try {
                const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s.ticker}&apikey=${STOCK_API}`).then(r => r.json());
                const lp = parseFloat(res["Global Quote"]?.["05. price"]);
                if (lp) s.lastLive = lp;
            } catch(e) { s.lastLive = s.lastLive || s.buyPrice; }
        }
        const mvMaster = (s.qty * s.lastLive) / rates.USD;
        t.stk += mvMaster; t.yield += (mvMaster * (db.settings.stkGrowth / 100));
        const plUSD = (s.lastLive - s.buyPrice) * s.qty; t.stockPL += plUSD / rates.USD;
        stkBody.innerHTML += `<tr><td>${s.ticker}</td><td>${s.qty.toLocaleString()}</td><td>$${s.buyPrice.toLocaleString()}</td><td>$${s.lastLive.toLocaleString()}</td><td class="${plUSD >= 0 ? 'surplus' : 'loss'}">${plUSD.toLocaleString(undefined, {maximumFractionDigits:0})}</td><td><button class="btn-edit" onclick="openModal('stocks',${s.id})">Edit</button><button class="btn-del" onclick="del('stocks',${s.id})">✕</button></td></tr>`;
    }

    // 4. Render Debt
    const debtBody = document.querySelector('#table-debt tbody');
    debtBody.innerHTML = '';
    db.debt.forEach(i => {
        const mv = i.amount / rates[i.currency]; t.debt += mv;
        debtBody.innerHTML += `<tr><td>${i.name}</td><td class="loss">-${i.amount.toLocaleString()}</td><td>-${mv.toLocaleString(undefined, {maximumFractionDigits: 0})}</td><td><button class="btn-edit" onclick="openModal('debt',${i.id})">Edit</button><button class="btn-del" onclick="del('debt',${i.id})">✕</button></td></tr>`;
    });

    // Dashboard Updates
    const netWorth = t.liq + t.fix + t.stk - t.debt;
    document.getElementById('total-net-worth').innerText = netWorth.toLocaleString(undefined, {maximumFractionDigits: 0}) + " " + mCurr;
    document.getElementById('acc-liq').innerText = t.liq.toLocaleString(undefined, {maximumFractionDigits: 0});
    document.getElementById('acc-fix').innerText = t.fix.toLocaleString(undefined, {maximumFractionDigits: 0});
    document.getElementById('acc-stk').innerText = t.stk.toLocaleString(undefined, {maximumFractionDigits: 0});
    document.getElementById('acc-debt').innerText = "-" + t.debt.toLocaleString(undefined, {maximumFractionDigits: 0});
    
    const plEl = document.getElementById('stk-total-pl');
    plEl.innerText = (t.stockPL >= 0 ? "+" : "") + t.stockPL.toLocaleString(undefined, {maximumFractionDigits: 0});
    plEl.className = `pl-indicator ${t.stockPL >= 0 ? 'surplus' : 'loss'}`;

    renderAudit(netWorth, t);
    updatePie(t);
}

/* --- AUDIT ENGINE & PROGRESS BAR --- */
function renderAudit(nw, t) {
    const s = db.settings;
    const nwGoalBase = (nw * rates[db.settings.masterCurr]) / rates[s.goalCurr];
    const totalAssets = t.liq + t.fix + t.stk;
    const nominalYield = totalAssets > 0 ? (t.yield / totalAssets) : 0;
    
    // Inflation-Adjusted Real Yield (Fisher Equation)
    const realYield = ((1 + nominalYield) / (1 + (s.inflation / 100))) - 1;
    const r = realYield / 12, n = s.years * 12;
    const fv = nwGoalBase * Math.pow(1 + r, n);
    const gap = Math.max(0, s.goal - fv);
    const req = gap > 0 ? (gap * r) / (Math.pow(1 + r, n) - 1) : 0;

    document.getElementById('logic-output').innerHTML = `
        <div class="audit-line"><span>Proj. Real Yield (Inf. Adj.)</span><b>${(realYield * 100).toFixed(2)}%</b></div>
        <div class="audit-line"><span>Proj. Portfolio Value</span><b>${fv.toLocaleString(undefined, {maximumFractionDigits:0})} ${s.goalCurr}</b></div>
        <div class="audit-line"><span>Target Gap</span><b class="loss">${gap.toLocaleString(undefined, {maximumFractionDigits:0})} ${s.goalCurr}</b></div>
        <div class="audit-line"><span>Monthly Savings Required</span><b class="surplus">${req.toLocaleString(undefined, {maximumFractionDigits:0})} ${s.goalCurr}</b></div>
    `;

    // Progress Bar with Text Overlay
    const pct = Math.min((nwGoalBase / s.goal) * 100, 100);
    document.getElementById('progress-bar').style.width = pct + "%";
    document.getElementById('progress-text').innerText = `${pct.toFixed(1)}% Achieved (${nwGoalBase.toLocaleString(undefined, {maximumFractionDigits:0})} / ${s.goal.toLocaleString()} ${s.goalCurr})`;
}

/* --- MODAL EDIT SYSTEM & HELPERS --- */
function openModal(k, id) {
    const item = db[k].find(x => x.id === id);
    currentEditState = { k, id };
    const container = document.getElementById('modal-fields');
    container.innerHTML = '';
    
    if (k === 'liquid' || k === 'debt') {
        container.innerHTML = `<label>Name</label><input type="text" id="edit-n" value="${item.name}"><label>Amount</label><input type="number" id="edit-a" value="${item.amount}"><label>Currency</label><select id="edit-c" class="curr-list"></select>`;
    } else if (k === 'fixed') {
        container.innerHTML = `<label>Bank</label><input type="text" id="edit-n" value="${item.name}"><label>Principal</label><input type="number" id="edit-a" value="${item.principal}"><label>Rate %</label><input type="number" id="edit-r" value="${item.rate}"><label>Months</label><input type="number" id="edit-d" value="${item.duration}"><label>Start</label><input type="date" id="edit-s" value="${item.start}"><label>Currency</label><select id="edit-c" class="curr-list"></select>`;
    } else if (k === 'stocks') {
        container.innerHTML = `<label>Ticker</label><input type="text" id="edit-n" value="${item.ticker}"><label>Qty</label><input type="number" id="edit-a" value="${item.qty}"><label>Avg Buy $</label><input type="number" id="edit-b" value="${item.buyPrice}">`;
    }
    const sel = container.querySelector('select');
    if (sel) { CURRENCIES.forEach(c => sel.add(new Option(c, c))); sel.value = item.currency; }
    document.getElementById('edit-modal').style.display = 'flex';
}

function saveModalEdit() {
    const { k, id } = currentEditState;
    const item = db[k].find(x => x.id === id);
    if (k === 'liquid' || k === 'debt') {
        item.name = document.getElementById('edit-n').value;
        item.amount = parseFloat(document.getElementById('edit-a').value);
        item.currency = document.getElementById('edit-c').value;
    } else if (k === 'fixed') {
        item.name = document.getElementById('edit-n').value;
        item.principal = parseFloat(document.getElementById('edit-a').value);
        item.rate = parseFloat(document.getElementById('edit-r').value);
        item.duration = parseInt(document.getElementById('edit-d').value);
        item.start = document.getElementById('edit-s').value;
        item.currency = document.getElementById('edit-c').value;
    } else if (k === 'stocks') {
        item.ticker = document.getElementById('edit-n').value.toUpperCase();
        item.qty = parseFloat(document.getElementById('edit-a').value);
        item.buyPrice = parseFloat(document.getElementById('edit-b').value);
    }
    save(); closeModal(); refreshAll(false);
}

function del(k, id) { db[k] = db[k].filter(x => x.id !== id); save(); refreshAll(false); }
function closeModal() { document.getElementById('edit-modal').style.display = 'none'; }
function save() { Object.keys(db).forEach(k => localStorage.setItem(`w_${k}`, JSON.stringify(db[k]))); }
function updatePie(t) {
    const tot = t.liq + t.fix + t.stk; if (tot <= 0) return;
    const pL = (t.liq/tot)*100, pF = (t.fix/tot)*100, pS = (t.stk/tot)*100;
    document.getElementById('allocation-pie').style.background = `conic-gradient(#818cf8 0% ${pL}%, #c084fc ${pL}% ${pL+pF}%, #4ade80 ${pL+pF}% 100%)`;
}
