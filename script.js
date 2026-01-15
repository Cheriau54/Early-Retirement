const FX_API = '393a43661559351810312743';
const STOCK_API = 'RCOIHB62BAXECU2U';
const CURRENCIES = ["HKD", "USD", "EUR", "CNY", "GBP", "JPY", "AUD", "SGD", "CAD"];

let db = {
    liquid: JSON.parse(localStorage.getItem('v7_liquid')) || [],
    fixed: JSON.parse(localStorage.getItem('v7_fixed')) || [],
    stocks: JSON.parse(localStorage.getItem('v7_stocks')) || [],
    debt: JSON.parse(localStorage.getItem('v7_debt')) || [],
    settings: JSON.parse(localStorage.getItem('v7_settings')) || { 
        masterCurr: "HKD", goal: 1000000, goalCurr: "HKD", years: 10, income: 0, incomeCurr: "HKD", inflation: 2.5, stkGrowth: 7.0 
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
    Object.keys(s).forEach(k => { if(document.getElementById(k)) document.getElementById(k).value = s[k]; });

    document.getElementById('master-currency').onchange = (e) => { db.settings.masterCurr = e.target.value; save(); refreshAll(false); };

    setupForm('form-liquid', () => {
        const n = val('liq-name'), a = fVal('liq-amount'), c = val('liq-curr');
        let item = db.liquid.find(i => i.name === n && i.currency === c);
        if(item) item.amount += a; else db.liquid.unshift({id: Date.now(), name:n, amount:a, currency:c});
    });

    setupForm('form-fixed', () => {
        db.fixed.unshift({ id: Date.now(), name: val('fix-name'), principal: fVal('fix-amount'), currency: val('fix-curr'), rate: fVal('fix-rate'), duration: parseInt(val('fix-duration')), start: val('fix-start') });
    });

    setupForm('form-stocks', () => {
        const t = val('stk-ticker').toUpperCase(), q = fVal('stk-qty'), b = fVal('stk-buy');
        let item = db.stocks.find(i => i.ticker === t);
        if(item) { item.buyPrice = ((item.buyPrice * item.qty) + (b * q)) / (item.qty + q); item.qty += q; } 
        else db.stocks.unshift({id: Date.now(), ticker:t, qty:q, buyPrice:b});
    });

    setupForm('form-debt', () => {
        const n = val('debt-name'), a = fVal('debt-amount'), c = val('debt-curr');
        let item = db.debt.find(i => i.name === n && i.currency === c);
        if(item) item.amount += a; else db.debt.unshift({id: Date.now(), name:n, amount:a, currency:c});
    });

    document.getElementById('calc-btn').onclick = () => { syncSettings(); refreshAll(false, true); };
    document.getElementById('reset-btn').onclick = () => { if(confirm("Clear everything?")) { localStorage.clear(); location.reload(); } };
}

async function refreshAll(fullFetch = true, skipStocks = false) {
    const mCurr = db.settings.masterCurr;
    const fx = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API}/latest/${mCurr}`).then(r => r.json());
    rates = fx.conversion_rates;

    let totals = { liq: 0, fix: 0, stk: 0, debt: 0, yield: 0 };

    // 1. LIQUID
    const liqBody = query('#table-liquid tbody'); liqBody.innerHTML = '';
    db.liquid.forEach(item => {
        const mVal = item.amount / rates[item.currency]; totals.liq += mVal;
        liqBody.innerHTML += `<tr><td>${item.name}</td><td>${item.amount} ${item.currency}</td><td>${mVal.toFixed(0)}</td><td><div class="action-btns"><button class="btn-edit" onclick="edit('liquid',${item.id})">Edit</button><button class="btn-del" onclick="del('liquid',${item.id})">✕</button></div></td></tr>`;
    });
    document.getElementById('acc-liq').innerText = `${totals.liq.toLocaleString()} ${mCurr}`;

    // 2. FIXED
    const fixBody = query('#table-fixed tbody'); fixBody.innerHTML = '';
    db.fixed.forEach(item => {
        const interest = item.principal * (item.rate/100) * (item.duration/12);
        const mVal = (item.principal + interest) / rates[item.currency];
        const endD = new Date(new Date(item.start).setMonth(new Date(item.start).getMonth() + item.duration)).toISOString().split('T')[0];
        totals.fix += mVal; totals.yield += (mVal * (item.rate/100));
        fixBody.innerHTML += `<tr><td>${item.name}</td><td>${item.rate}%</td><td>${endD}</td><td class="surplus">+${interest.toFixed(0)}</td><td>${(item.principal+interest).toFixed(0)}</td><td><div class="action-btns"><button class="btn-edit" onclick="edit('fixed',${item.id})">Edit</button><button class="btn-del" onclick="del('fixed',${item.id})">✕</button></div></td></tr>`;
    });
    document.getElementById('acc-fix').innerText = `${totals.fix.toLocaleString()} ${mCurr}`;

    // 3. EQUITIES
    const stkBody = query('#table-stocks tbody'); 
    for (let s of db.stocks) {
        if(!skipStocks || !s.lastLivePrice) {
            const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s.ticker}&apikey=${STOCK_API}`).then(r => r.json());
            s.lastLivePrice = parseFloat(res["Global Quote"]?.["05. price"]) || s.buyPrice;
        }
        const pl = (s.lastLivePrice - s.buyPrice) * s.qty;
        const mVal = (s.qty * s.lastLivePrice) / rates.USD;
        totals.stk += mVal; totals.yield += (mVal * (db.settings.stkGrowth/100));
    }
    stkBody.innerHTML = db.stocks.map(s => `<tr><td>${s.ticker}</td><td>${s.qty.toFixed(0)}</td><td>$${s.buyPrice.toFixed(1)}</td><td>$${s.lastLivePrice.toFixed(1)}</td><td class="${(s.lastLivePrice - s.buyPrice)>=0?'surplus':'loss'}">${((s.lastLivePrice - s.buyPrice)*s.qty).toFixed(0)}</td><td><div class="action-btns"><button class="btn-edit" onclick="edit('stocks',${s.id})">Edit</button><button class="btn-del" onclick="del('stocks',${s.id})">✕</button></div></td></tr>`).join('');
    document.getElementById('acc-stk').innerText = `${totals.stk.toLocaleString()} ${mCurr}`;

    // 4. DEBT
    const dbtBody = query('#table-debt tbody'); dbtBody.innerHTML = '';
    db.debt.forEach(item => {
        const mVal = item.amount / rates[item.currency]; totals.debt += mVal;
        dbtBody.innerHTML += `<tr><td>${item.name}</td><td class="loss">-${item.amount} ${item.currency}</td><td>-${mVal.toFixed(0)}</td><td><div class="action-btns"><button class="btn-edit" onclick="edit('debt',${item.id})">Edit</button><button class="btn-del" onclick="del('debt',${item.id})">✕</button></div></td></tr>`;
    });
    document.getElementById('acc-debt').innerText = `-${totals.debt.toLocaleString()} ${mCurr}`;

    const nw = totals.liq + totals.fix + totals.stk - totals.debt;
    document.getElementById('total-net-worth').innerText = `${nw.toLocaleString(undefined, {max:0})} ${mCurr}`;
    
    renderAudit(nw, totals, mCurr);
    updatePie(totals);
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
    const incomeInGoalCurr = (s.income / rates[s.incomeCurr]) * rates[s.goalCurr];
    const surplus = incomeInGoalCurr - monthlyNeeded;

    

    document.getElementById('logic-output').innerHTML = `
        <div class="audit-line"><span>Portfolio Real Yield (Inflation Adj)</span><b>${(realYield*100).toFixed(2)}%</b></div>
        <div class="audit-line"><span>Projected Value in ${s.years} Years</span><b>${fv.toLocaleString(undefined,{max:0})} ${s.goalCurr}</b></div>
        <div class="audit-line"><span>Capital Shortfall vs Target</span><b class="loss">${gap.toLocaleString(undefined,{max:0})} ${s.goalCurr}</b></div>
        <div class="audit-line"><span>Required Monthly Savings</span><b class="surplus">${monthlyNeeded.toLocaleString(undefined,{max:0})} ${s.goalCurr}</b></div>
        <div class="audit-line" style="border-top: 1px solid #444; padding-top:5px;"><span><b>Budget Surplus/Loss</b></span><b class="${surplus>=0?'surplus':'loss'}">${surplus.toLocaleString(undefined,{max:0})} ${s.goalCurr}</b></div>
    `;

    document.getElementById('progress-bar').style.width = Math.min((nwInGoalCurr/s.goal)*100, 100) + "%";
    document.getElementById('progress-text').innerText = Math.min((nwInGoalCurr/s.goal)*100, 100).toFixed(1) + "% Achieved";

    const sug = document.getElementById('rebalance-suggestion');
    if(surplus < 0) {
        sug.innerHTML = `⚠️ <b>Audit Result:</b> Your income is insufficient for this goal. Moving <b>${(t.liq/totalAssets*100).toFixed(0)}% Cash</b> to Fixed Savings at 4%+ could reduce monthly burden.`;
    } else {
        sug.innerHTML = `✅ <b>Audit Result:</b> Path is sustainable. Reinvest dividends to maintain growth compounding.`;
    }
}

function updatePie(t) {
    const tot = t.liq + t.fix + t.stk; if(tot <= 0) return;
    const pLiq = (t.liq/tot)*100, pFix = (t.fix/tot)*100, pStk = (t.stk/tot)*100;
    document.getElementById('allocation-pie').style.background = `conic-gradient(#38bdf8 0% ${pLiq}%, #4ade80 ${pLiq}% ${pLiq+pFix}%, #facc15 ${pLiq+pFix}% 100%)`;
    document.getElementById('chart-legend').innerHTML = `
        <div class="legend-item"><div class="dot" style="background:#38bdf8"></div> Cash: ${pLiq.toFixed(0)}%</div>
        <div class="legend-item"><div class="dot" style="background:#4ade80"></div> Fixed: ${pFix.toFixed(0)}%</div>
        <div class="legend-item"><div class="dot" style="background:#facc15"></div> Stock: ${pStk.toFixed(0)}%</div>
    `;
}

function edit(key, id) {
    const item = db[key].find(x => x.id === id);
    if(key === 'liquid') { document.getElementById('liq-name').value = item.name; document.getElementById('liq-amount').value = item.amount; document.getElementById('liq-curr').value = item.currency; }
    if(key === 'fixed') { document.getElementById('fix-name').value = item.name; document.getElementById('fix-amount').value = item.principal; document.getElementById('fix-rate').value = item.rate; document.getElementById('fix-duration').value = item.duration; document.getElementById('fix-start').value = item.start; }
    if(key === 'stocks') { document.getElementById('stk-ticker').value = item.ticker; document.getElementById('stk-qty').value = item.qty; document.getElementById('stk-buy').value = item.buyPrice; }
    if(key === 'debt') { document.getElementById('debt-name').value = item.name; document.getElementById('debt-amount').value = item.amount; document.getElementById('debt-curr').value = item.currency; }
    del(key, id);
}

function del(key, id) { db[key] = db[key].filter(x => x.id !== id); save(); refreshAll(false); }
function val(id) { return document.getElementById(id).value; }
function fVal(id) { return parseFloat(document.getElementById(id).value) || 0; }
function query(s) { return document.querySelector(s); }
function setupForm(id, fn) { document.getElementById(id).onsubmit = (e) => { e.preventDefault(); fn(); save(); refreshAll(false); e.target.reset(); }; }
function syncSettings() {
    db.settings = { masterCurr: val('master-currency'), goal: fVal('target-goal'), goalCurr: val('goal-curr'), years: fVal('years-to-goal'), inflation: fVal('inflation-rate'), stkGrowth: fVal('stock-growth'), income: fVal('monthly-income'), incomeCurr: val('income-curr') };
    save();
}
function save() { Object.keys(db).forEach(k => localStorage.setItem(`v7_${k}`, JSON.stringify(db[k]))); }
