const FX_API = '393a43661559351810312743';
const STOCK_API = 'RCOIHB62BAXECU2U';
const CURRENCIES = ["HKD", "USD", "EUR", "CNY", "GBP", "JPY", "AUD", "SGD", "CAD"];

let db = {
    liquid: JSON.parse(localStorage.getItem('v6_liquid')) || [],
    fixed: JSON.parse(localStorage.getItem('v6_fixed')) || [],
    stocks: JSON.parse(localStorage.getItem('v6_stocks')) || [],
    debt: JSON.parse(localStorage.getItem('v6_debt')) || [],
    settings: JSON.parse(localStorage.getItem('v6_settings')) || { 
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
    document.getElementById('master-currency').value = s.masterCurr;
    document.getElementById('target-goal').value = s.goal;
    document.getElementById('goal-curr').value = s.goalCurr;
    document.getElementById('years-to-goal').value = s.years;
    document.getElementById('inflation-rate').value = s.inflation;
    document.getElementById('stock-growth').value = s.stkGrowth;
    document.getElementById('monthly-income').value = s.income;
    document.getElementById('income-curr').value = s.incomeCurr;

    document.getElementById('master-currency').onchange = (e) => { 
        db.settings.masterCurr = e.target.value; 
        save(); 
        refreshAll(false); 
    };

    // Aggregate Addition Logic
    setupForm('form-liquid', () => {
        const n = val('liq-name'), a = fVal('liq-amount'), c = val('liq-curr');
        let item = db.liquid.find(i => i.name === n && i.currency === c);
        if(item) item.amount += a; else db.liquid.push({name:n, amount:a, currency:c});
    });

    setupForm('form-fixed', () => {
        db.fixed.push({ name: val('fix-name'), principal: fVal('fix-amount'), currency: val('fix-curr'), rate: fVal('fix-rate'), duration: parseInt(val('fix-duration')), start: val('fix-start') });
    });

    setupForm('form-stocks', () => {
        const t = val('stk-ticker').toUpperCase(), q = fVal('stk-qty'), b = fVal('stk-buy');
        let item = db.stocks.find(i => i.ticker === t);
        if(item) { item.buyPrice = ((item.buyPrice * item.qty) + (b * q)) / (item.qty + q); item.qty += q; } 
        else db.stocks.push({ticker:t, qty:q, buyPrice:b});
    });

    setupForm('form-debt', () => {
        const n = val('debt-name'), a = fVal('debt-amount'), c = val('debt-curr');
        let item = db.debt.find(i => i.name === n && i.currency === c);
        if(item) item.amount += a; else db.debt.push({name:n, amount:a, currency:c});
    });

    document.getElementById('calc-btn').onclick = () => { 
        syncSettings(); 
        refreshAll(false, true); // True skips fetching stock prices
    };
    document.getElementById('reset-btn').onclick = () => { localStorage.clear(); location.reload(); };
}

async function refreshAll(fullFetch = true, skipStocks = false) {
    const mCurr = db.settings.masterCurr;
    document.querySelectorAll('.m-curr').forEach(el => el.innerText = mCurr);
    
    const fx = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API}/latest/${mCurr}`).then(r => r.json());
    rates = fx.conversion_rates;

    let t = { liq: 0, fix: 0, stk: 0, debt: 0, yield: 0 };

    // 1. LIQUID
    const liqBody = query('#table-liquid tbody'); liqBody.innerHTML = '';
    db.liquid.forEach((item, i) => {
        const mVal = item.amount / rates[item.currency]; t.liq += mVal;
        liqBody.innerHTML += `<tr><td>${item.name}</td><td>${item.amount} ${item.currency}</td><td>${mVal.toFixed(0)}</td><td><button onclick="del('liquid',${i})">✕</button></td></tr>`;
    });
    document.getElementById('acc-liq').innerText = `${t.liq.toLocaleString()} ${mCurr}`;

    // 2. FIXED
    const fixBody = query('#table-fixed tbody'); fixBody.innerHTML = '';
    db.fixed.forEach((item, i) => {
        const interest = item.principal * (item.rate/100) * (item.duration/12);
        const mVal = (item.principal + interest) / rates[item.currency];
        const endD = new Date(new Date(item.start).setMonth(new Date(item.start).getMonth() + item.duration)).toISOString().split('T')[0];
        t.fix += mVal; t.yield += (mVal * (item.rate/100));
        fixBody.innerHTML += `<tr><td>${item.name}</td><td>${item.rate}%</td><td>${endD}</td><td class="surplus">+${interest.toFixed(0)}</td><td>${(item.principal+interest).toFixed(0)}</td><td><button onclick="del('fixed',${i})">✕</button></td></tr>`;
    });
    document.getElementById('acc-fix').innerText = `${t.fix.toLocaleString()} ${mCurr}`;

    // 3. EQUITIES
    const stkBody = query('#table-stocks tbody'); 
    if(!skipStocks) stkBody.innerHTML = 'Refresing...';
    let stkHtml = '';
    for (let s of db.stocks) {
        let live = s.lastLivePrice || s.buyPrice;
        if(!skipStocks) {
            const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s.ticker}&apikey=${STOCK_API}`).then(r => r.json());
            live = parseFloat(res["Global Quote"]?.["05. price"]) || s.buyPrice;
            s.lastLivePrice = live;
        }
        const pl = (live - s.buyPrice) * s.qty;
        const mVal = (s.qty * live) / rates.USD;
        t.stk += mVal; t.yield += (mVal * (db.settings.stkGrowth/100));
        stkHtml += `<tr><td>${s.ticker}</td><td>${s.qty.toFixed(0)}</td><td>$${s.buyPrice.toFixed(1)}</td><td>$${live.toFixed(1)}</td><td class="${pl>=0?'surplus':'loss'}">${pl.toFixed(0)}</td><td><button onclick="del('stocks',${db.stocks.indexOf(s)})">✕</button></td></tr>`;
    }
    stkBody.innerHTML = stkHtml;
    document.getElementById('acc-stk').innerText = `${t.stk.toLocaleString()} ${mCurr}`;

    // 4. DEBT
    const dbtBody = query('#table-debt tbody'); dbtBody.innerHTML = '';
    db.debt.forEach((item, i) => {
        const mVal = item.amount / rates[item.currency]; t.debt += mVal;
        dbtBody.innerHTML += `<tr><td>${item.name}</td><td class="loss">-${item.amount} ${item.currency}</td><td>-${mVal.toFixed(0)}</td><td><button onclick="del('debt',${i})">✕</button></td></tr>`;
    });
    document.getElementById('acc-debt').innerText = `-${t.debt.toLocaleString()} ${mCurr}`;

    const nw = t.liq + t.fix + t.stk - t.debt;
    document.getElementById('total-net-worth').innerText = `${nw.toLocaleString(undefined, {max:0})} ${mCurr}`;
    
    updateCharts(t);
    runAudit(nw, t, mCurr);
}

function runAudit(nw, t, mCurr) {
    const gVal = db.settings.goal;
    const gCurr = db.settings.goalCurr;
    const years = db.settings.years;
    const inflation = db.settings.inflation / 100;
    const income = db.settings.income / rates[db.settings.incomeCurr];
    
    // Convert Net Worth to Goal Currency for comparison
    const nwInGoalCurr = nw * rates[gCurr];
    const totalAssets = t.liq + t.fix + t.stk;
    const nominalYield = totalAssets > 0 ? (t.yield / totalAssets) : 0;
    const realYield = ((1 + nominalYield) / (1 + inflation)) - 1;
    
    const r = realYield / 12, n = years * 12;
    const fv = nwInGoalCurr * Math.pow(1 + r, n);
    const gap = Math.max(0, gVal - fv);
    const monthlyNeeded = gap > 0 ? (gap * r) / (Math.pow(1 + r, n) - 1) : 0;
    const monthlyNeededMaster = monthlyNeeded / rates[gCurr];
    const surplus = income - monthlyNeededMaster;

    

    document.getElementById('logic-output').innerHTML = `
        NW: ${nw.toLocaleString()} ${mCurr} | Real Yield: ${(realYield*100).toFixed(2)}%
        ------------------------------------------------------------
        1. Projected Wealth (FV): ${fv.toLocaleString(undefined,{max:0})} ${gCurr}
        2. Shortfall to Target: ${gap.toLocaleString(undefined,{max:0})} ${gCurr}
        3. REQ. SAVING/MO: ${monthlyNeeded.toLocaleString(undefined,{max:0})} ${gCurr}
        4. BUDGET SURPLUS: <span class="${surplus>=0?'surplus':'loss'}">${surplus.toLocaleString(undefined,{max:0})} ${mCurr}</span>
    `;

    const prog = Math.min((nwInGoalCurr/gVal)*100, 100);
    document.getElementById('progress-bar').style.width = prog + "%";
    document.getElementById('progress-text').innerText = prog.toFixed(1) + "% of " + gVal.toLocaleString() + " " + gCurr;

    const sug = document.getElementById('rebalance-suggestion');
    if (surplus < 0) {
        sug.innerHTML = `⚠️ <b>Suggestion:</b> Your monthly income cannot cover the gap. Consider moving some of your ${((t.liq/totalAssets)*100).toFixed(0)}% Cash into Fixed Savings to boost yield.`;
    } else {
        sug.innerHTML = `✅ <b>Suggestion:</b> Strategy is sound. Your ${((t.stk/totalAssets)*100).toFixed(0)}% Equity exposure is driving growth.`;
    }
}

function updateCharts(t) {
    const total = t.liq + t.fix + t.stk;
    if(total <= 0) return;
    const pLiq = (t.liq/total)*100, pFix = (t.fix/total)*100, pStk = (t.stk/total)*100;
    
    document.getElementById('allocation-pie').style.background = `conic-gradient(#38bdf8 0% ${pLiq}%, #4ade80 ${pLiq}% ${pLiq+pFix}%, #facc15 ${pLiq+pFix}% 100%)`;
    
    document.getElementById('chart-legend').innerHTML = `
        <div class="legend-item"><div class="dot" style="background:#38bdf8"></div> Cash (${pLiq.toFixed(0)}%)</div>
        <div class="legend-item"><div class="dot" style="background:#4ade80"></div> Fixed (${pFix.toFixed(0)}%)</div>
        <div class="legend-item"><div class="dot" style="background:#facc15"></div> Stock (${pStk.toFixed(0)}%)</div>
    `;
}

function val(id) { return document.getElementById(id).value; }
function fVal(id) { return parseFloat(document.getElementById(id).value) || 0; }
function query(s) { return document.querySelector(s); }
function setupForm(id, fn) { document.getElementById(id).onsubmit = (e) => { e.preventDefault(); fn(); save(); refreshAll(false); e.target.reset(); }; }
function del(key, i) { db[key].splice(i, 1); save(); refreshAll(false); }
function syncSettings() {
    db.settings = { 
        masterCurr: val('master-currency'), goal: fVal('target-goal'), goalCurr: val('goal-curr'),
        years: fVal('years-to-goal'), inflation: fVal('inflation-rate'), stkGrowth: fVal('stock-growth'),
        income: fVal('monthly-income'), incomeCurr: val('income-curr') 
    };
    save();
}
function save() { localStorage.setItem('v6_liquid', JSON.stringify(db.liquid)); localStorage.setItem('v6_fixed', JSON.stringify(db.fixed)); localStorage.setItem('v6_stocks', JSON.stringify(db.stocks)); localStorage.setItem('v6_debt', JSON.stringify(db.debt)); localStorage.setItem('v6_settings', JSON.stringify(db.settings)); }
