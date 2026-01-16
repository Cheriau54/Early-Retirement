const FX_API = '393a43661559351810312743';
const STOCK_API = 'RCOIHB62BAXECU2U';
const CURRENCIES = ["HKD", "USD", "EUR", "CNY", "GBP", "JPY", "AUD", "SGD", "CAD"];

let db = {
    liquid: JSON.parse(localStorage.getItem('wt_liquid')) || [],
    fixed: JSON.parse(localStorage.getItem('wt_fixed')) || [],
    stocks: JSON.parse(localStorage.getItem('wt_stocks')) || [],
    debt: JSON.parse(localStorage.getItem('wt_debt')) || [],
    settings: JSON.parse(localStorage.getItem('wt_settings')) || { 
        masterCurr: "HKD", goal: 1000000, goalCurr: "HKD", years: 10, income: 0, incomeFreq: "monthly", incomeCurr: "HKD", inflation: 2.5, stkGrowth: 7.0 
    }
};

let rates = {};

window.addEventListener('DOMContentLoaded', async () => {
    initUI();
    await refreshAll(true);
});

function initUI() {
    document.querySelectorAll('.curr-list').forEach(s => CURRENCIES.forEach(c => s.add(new Option(c, c))));
    const s = db.settings;
    set('master-currency', s.masterCurr);
    set('target-goal', s.goal);
    set('goal-curr', s.goalCurr);
    set('years-to-goal', s.years);
    set('inflation-rate', s.inflation);
    set('stock-growth', s.stkGrowth);
    set('income-val', s.income);
    set('income-freq', s.incomeFreq);
    set('income-curr', s.incomeCurr);

    document.getElementById('master-currency').onchange = (e) => { db.settings.masterCurr = e.target.value; save(); refreshAll(false); };
    document.getElementById('save-all-btn').onclick = () => { save(); alert("Data Secured."); };

    setupForm('form-liquid', () => {
        const n = val('liq-name'), a = fVal('liq-amount'), c = val('liq-curr');
        const existing = db.liquid.findIndex(i => i.name === n && i.currency === c);
        if(existing !== -1) {
            db.liquid[existing].amount += a;
            const item = db.liquid.splice(existing, 1)[0];
            db.liquid.unshift(item);
        } else {
            db.liquid.unshift({id: Date.now(), name: n, amount: a, currency: c});
        }
    });

    setupForm('form-fixed', () => {
        db.fixed.unshift({ id: Date.now(), name: val('fix-name'), principal: fVal('fix-amount'), currency: val('fix-curr'), rate: fVal('fix-rate'), duration: parseInt(val('fix-duration')), start: val('fix-start') });
    });

    setupForm('form-stocks', () => {
        const t = val('stk-ticker').toUpperCase(), q = fVal('stk-qty'), b = fVal('stk-buy');
        const existing = db.stocks.findIndex(i => i.ticker === t);
        if(existing !== -1) {
            const s = db.stocks[existing];
            s.buyPrice = ((s.buyPrice * s.qty) + (b * q)) / (s.qty + q);
            s.qty += q;
            const item = db.stocks.splice(existing, 1)[0];
            db.stocks.unshift(item);
        } else {
            db.stocks.unshift({id: Date.now(), ticker: t, qty: q, buyPrice: b});
        }
    });

    setupForm('form-debt', () => {
        const n = val('debt-name'), a = fVal('debt-amount'), c = val('debt-curr');
        const existing = db.debt.findIndex(i => i.name === n && i.currency === c);
        if(existing !== -1) {
            db.debt[existing].amount += a;
            const item = db.debt.splice(existing, 1)[0];
            db.debt.unshift(item);
        } else {
            db.debt.unshift({id: Date.now(), name: n, amount: a, currency: c});
        }
    });

    document.getElementById('calc-btn').onclick = () => { syncSettings(); refreshAll(false, true); };
    document.getElementById('reset-btn').onclick = () => { if(confirm("Clear all data?")) { localStorage.clear(); location.reload(); } };
}

async function refreshAll(fullFetch = true, skipStocks = false) {
    const mCurr = db.settings.masterCurr;
    try {
        const res = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API}/latest/${mCurr}`).then(r => r.json());
        rates = res.conversion_rates;
    } catch(e) { console.error("FX Error"); }

    let totals = { liq: 0, fix: 0, stk: 0, debt: 0, yield: 0 };

    renderSection('liquid', 'table-liquid', (item) => {
        const mVal = item.amount / rates[item.currency]; totals.liq += mVal;
        return `<td>${item.name}</td><td>${item.amount.toLocaleString()} ${item.currency}</td><td>${mVal.toFixed(0)}</td>`;
    });

    renderSection('fixed', 'table-fixed', (item) => {
        const interest = item.principal * (item.rate/100) * (item.duration/12);
        const mVal = (item.principal + interest) / rates[item.currency];
        const endD = new Date(new Date(item.start).setMonth(new Date(item.start).getMonth() + item.duration)).toISOString().split('T')[0];
        totals.fix += mVal; totals.yield += (mVal * (item.rate/100));
        return `<td>${item.name}</td><td>${item.rate}%</td><td>${endD}</td><td class="surplus">+${interest.toFixed(0)}</td><td>${(item.principal+interest).toFixed(0)}</td>`;
    });

    const stkBody = document.querySelector('#table-stocks tbody'); stkBody.innerHTML = '';
    for (let s of db.stocks) {
        if(!skipStocks || !s.lastLive) {
            try {
                const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s.ticker}&apikey=${STOCK_API}`).then(r => r.json());
                s.lastLive = parseFloat(res["Global Quote"]?.["05. price"]) || s.buyPrice;
            } catch(e) { s.lastLive = s.buyPrice; }
        }
        const mVal = (s.qty * s.lastLive) / rates.USD; totals.stk += mVal; totals.yield += (mVal * (db.settings.stkGrowth/100));
        const pl = (s.lastLive - s.buyPrice) * s.qty;
        stkBody.innerHTML += `<tr><td>${s.ticker}</td><td>${s.qty}</td><td>$${s.buyPrice.toFixed(2)}</td><td>$${s.lastLive.toFixed(2)}</td><td class="${pl>=0?'surplus':'loss'}">${pl.toFixed(0)}</td><td><button class="btn-edit" onclick="edit('stocks',${s.id})">Edit</button><button class="btn-del" onclick="del('stocks',${s.id})">✕</button></td></tr>`;
    }

    renderSection('debt', 'table-debt', (item) => {
        const mVal = item.amount / rates[item.currency]; totals.debt += mVal;
        return `<td>${item.name}</td><td class="loss">-${item.amount.toLocaleString()} ${item.currency}</td><td>-${mVal.toFixed(0)}</td>`;
    });

    document.getElementById('acc-liq').innerText = totals.liq.toFixed(0) + " " + mCurr;
    document.getElementById('acc-fix').innerText = totals.fix.toFixed(0) + " " + mCurr;
    document.getElementById('acc-stk').innerText = totals.stk.toFixed(0) + " " + mCurr;
    document.getElementById('acc-debt').innerText = "-" + totals.debt.toFixed(0) + " " + mCurr;

    const nw = totals.liq + totals.fix + totals.stk - totals.debt;
    document.getElementById('total-net-worth').innerText = nw.toLocaleString(undefined, {max:0}) + " " + mCurr;
    
    renderAudit(nw, totals, mCurr);
    updatePie(totals);
}

function renderSection(key, tableId, rowFn) {
    const body = document.querySelector(`#${tableId} tbody`);
    body.innerHTML = db[key].map(item => `<tr>${rowFn(item)}<td><button class="btn-edit" onclick="edit('${key}',${item.id})">Edit</button><button class="btn-del" onclick="del('${key}',${item.id})">✕</button></td></tr>`).join('');
}

function renderAudit(nw, t, mCurr) {
    const s = db.settings;
    const nwInGoalCurr = nw * rates[s.goalCurr];
    const totalAssets = t.liq + t.fix + t.stk;
    const nomYield = totalAssets > 0 ? (t.yield / totalAssets) : 0;
    const realYield = ((1 + nomYield) / (1 + (s.inflation/100))) - 1;
    const r = realYield / 12, n = s.years * 12;
    const fv = nwInGoalCurr * Math.pow(1 + r, n);
    const gap = Math.max(0, s.goal - fv);
    const monthlyNeeded = gap > 0 ? (gap * r) / (Math.pow(1 + r, n) - 1) : 0;
    
    let monthlyIncome = (s.income / rates[s.incomeCurr]) * rates[s.goalCurr];
    if(s.incomeFreq === 'annual') monthlyIncome /= 12;
    const surplus = monthlyIncome - monthlyNeeded;

    document.getElementById('logic-output').innerHTML = `
        <div class="audit-line"><span>Portfolio Real Yield (Inflation Adjusted)</span><b>${(realYield*100).toFixed(2)}%</b></div>
        <div class="audit-line"><span>Projected Value in ${s.years} Years</span><b>${fv.toLocaleString(undefined,{max:0})} ${s.goalCurr}</b></div>
        <div class="audit-line"><span>Capital Shortfall vs Target</span><b class="loss">${gap.toLocaleString(undefined,{max:0})} ${s.goalCurr}</b></div>
        <div class="audit-line"><span>Required Monthly Savings</span><b class="surplus">${monthlyNeeded.toLocaleString(undefined,{max:0})} ${s.goalCurr}</b></div>
        <div class="audit-line" style="border-top:1px solid #444; margin-top:5px; padding-top:5px;"><span><b>Monthly Budget Surplus/Loss</b></span><b class="${surplus>=0?'surplus':'loss'}">${surplus.toLocaleString(undefined,{max:0})} ${s.goalCurr}</b></div>
    `;

    const prog = Math.min((nwInGoalCurr/s.goal)*100, 100);
    document.getElementById('progress-bar').style.width = prog + "%";
    document.getElementById('progress-text').innerText = prog.toFixed(1) + "% Achieved";

    const cashPct = (t.liq / totalAssets) * 100;
    let msg = surplus < 0 
        ? `⚠️ <b>Suggestion:</b> Your ${s.incomeFreq} income is below the required saving rate. `
        : `✅ <b>Suggestion:</b> Plan is sustainable. `;
    
    if(cashPct > 20) msg += `You have <b>${cashPct.toFixed(0)}% in Cash</b>; shifting some to Equities could improve your Real Yield.`;
    document.getElementById('rebalance-suggestion').innerHTML = msg;
}

function updatePie(t) {
    const tot = t.liq + t.fix + t.stk; if(tot <= 0) return;
    const pLiq = (t.liq/tot)*100, pFix = (t.fix/tot)*100, pStk = (t.stk/tot)*100;
    document.getElementById('allocation-pie').style.background = `conic-gradient(#38bdf8 0% ${pLiq}%, #4ade80 ${pLiq}% ${pLiq+pFix}%, #facc15 ${pLiq+pFix}% 100%)`;
    document.getElementById('chart-legend').innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;"><div style="width:10px; height:10px; background:#38bdf8"></div> Cash: ${pLiq.toFixed(0)}%</div>
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;"><div style="width:10px; height:10px; background:#4ade80"></div> Fixed: ${pFix.toFixed(0)}%</div>
        <div style="display:flex; align-items:center; gap:6px;"><div style="width:10px; height:10px; background:#facc15"></div> Stock: ${pStk.toFixed(0)}%</div>
    `;
}

function edit(key, id) {
    const item = db[key].find(x => x.id === id);
    if(key === 'liquid') { set('liq-name', item.name); set('liq-amount', item.amount); set('liq-curr', item.currency); }
    if(key === 'fixed') { set('fix-name', item.name); set('fix-amount', item.principal); set('fix-rate', item.rate); set('fix-duration', item.duration); set('fix-start', item.start); }
    if(key === 'stocks') { set('stk-ticker', item.ticker); set('stk-qty', item.qty); set('stk-buy', item.buyPrice); }
    if(key === 'debt') { set('debt-name', item.name); set('debt-amount', item.amount); set('debt-curr', item.currency); }
    del(key, id);
}

function del(key, id) { db[key] = db[key].filter(x => x.id !== id); save(); refreshAll(false); }
function val(id) { return document.getElementById(id).value; }
function fVal(id) { return parseFloat(document.getElementById(id).value) || 0; }
function set(id, v) { document.getElementById(id).value = v; }
function setupForm(id, fn) { document.getElementById(id).onsubmit = (e) => { e.preventDefault(); fn(); save(); refreshAll(false); e.target.reset(); }; }
function syncSettings() {
    db.settings = { 
        masterCurr: val('master-currency'), goal: fVal('target-goal'), goalCurr: val('goal-curr'), years: fVal('years-to-goal'), 
        inflation: fVal('inflation-rate'), stkGrowth: fVal('stock-growth'), income: fVal('income-val'), 
        incomeFreq: val('income-freq'), incomeCurr: val('income-curr') 
    };
    save();
}
function save() { Object.keys(db).forEach(k => localStorage.setItem(`wt_${k}`, JSON.stringify(db[k]))); }
