const FX_API = '393a43661559351810312743';
const STOCK_API = 'RCOIHB62BAXECU2U';
const CURRENCIES = ["HKD", "USD", "EUR", "CNY", "GBP", "JPY", "AUD", "SGD", "CAD"];

let db = {
    liquid: JSON.parse(localStorage.getItem('v3_liquid')) || [],
    fixed: JSON.parse(localStorage.getItem('v3_fixed')) || [],
    stocks: JSON.parse(localStorage.getItem('v3_stocks')) || [],
    debt: JSON.parse(localStorage.getItem('v3_debt')) || [],
    settings: JSON.parse(localStorage.getItem('v3_settings')) || { masterCurr: "HKD", goal: 1000000, years: 10, income: 0, incomeCurr: "HKD" }
};

window.addEventListener('DOMContentLoaded', async () => {
    initUI();
    await refreshAll();
});

function initUI() {
    document.querySelectorAll('.curr-list').forEach(s => CURRENCIES.forEach(c => s.add(new Option(c, c))));
    const s = db.settings;
    document.getElementById('master-currency').value = s.masterCurr;
    document.getElementById('target-goal').value = s.goal;
    document.getElementById('years-to-goal').value = s.years;
    document.getElementById('monthly-income').value = s.income;
    document.getElementById('income-curr').value = s.incomeCurr;

    document.getElementById('form-liquid').onsubmit = (e) => {
        e.preventDefault();
        const n = val('liq-name'), a = fVal('liq-amount'), c = val('liq-curr');
        let item = db.liquid.find(i => i.name === n && i.currency === c);
        if(item) item.amount += a; else db.liquid.push({name:n, amount:a, currency:c});
        saveAndRefresh(); e.target.reset();
    };

    document.getElementById('form-fixed').onsubmit = (e) => {
        e.preventDefault();
        db.fixed.push({
            name: val('fix-name'), principal: fVal('fix-amount'), currency: val('fix-curr'),
            rate: fVal('fix-rate'), duration: parseInt(val('fix-duration')), start: val('fix-start')
        });
        saveAndRefresh(); e.target.reset();
    };

    document.getElementById('form-stocks').onsubmit = (e) => {
        e.preventDefault();
        const t = val('stk-ticker').toUpperCase(), q = fVal('stk-qty'), b = fVal('stk-buy');
        let item = db.stocks.find(i => i.ticker === t);
        if(item) {
            item.buyPrice = ((item.buyPrice * item.qty) + (b * q)) / (item.qty + q);
            item.qty += q;
        } else db.stocks.push({ticker:t, qty:q, buyPrice:b});
        saveAndRefresh(); e.target.reset();
    };

    document.getElementById('form-debt').onsubmit = (e) => {
        e.preventDefault();
        const n = val('debt-name'), a = fVal('debt-amount'), c = val('debt-curr');
        let item = db.debt.find(i => i.name === n && i.currency === c);
        if(item) item.amount += a; else db.debt.push({name:n, amount:a, currency:c});
        saveAndRefresh(); e.target.reset();
    };

    document.getElementById('calc-btn').onclick = () => refreshAll();
    document.getElementById('master-currency').onchange = () => { db.settings.masterCurr = val('master-currency'); saveAndRefresh(); };
    document.getElementById('reset-btn').onclick = () => { localStorage.clear(); location.reload(); };
}

async function refreshAll() {
    const mCurr = db.settings.masterCurr;
    document.querySelectorAll('.m-curr').forEach(el => el.innerText = mCurr);
    
    const fx = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API}/latest/${mCurr}`).then(r => r.json());
    const rates = fx.conversion_rates;

    let totalMaster = 0;
    let weightedYieldSum = 0;
    let allocation = { liq: 0, fix: 0, stk: 0, debt: 0 };

    // 1. LIQUID
    const liqBody = document.querySelector('#table-liquid tbody');
    liqBody.innerHTML = '';
    db.liquid.forEach((item, i) => {
        const mVal = item.amount / rates[item.currency];
        allocation.liq += mVal;
        liqBody.innerHTML += `<tr><td>${item.name}</td><td>${item.amount} ${item.currency}</td><td>${mVal.toFixed(0)} ${mCurr}</td><td><button onclick="del('liquid',${i})">✕</button></td></tr>`;
    });

    // 2. FIXED
    const fixBody = document.querySelector('#table-fixed tbody');
    fixBody.innerHTML = '';
    db.fixed.forEach((item, i) => {
        const interest = item.principal * (item.rate/100) * (item.duration/12);
        const total = item.principal + interest;
        const mVal = total / rates[item.currency];
        allocation.fix += mVal;
        weightedYieldSum += (mVal * (item.rate/100));
        
        let start = new Date(item.start);
        let end = new Date(new Date(item.start).setMonth(start.getMonth() + item.duration));
        
        fixBody.innerHTML += `<tr><td>${item.name}</td><td>${item.principal}</td><td>${item.rate}%</td><td>${item.start}</td><td>${end.toISOString().split('T')[0]}</td><td class="surplus">+${interest.toFixed(0)}</td><td>${total.toFixed(0)} ${item.currency}</td><td><button onclick="del('fixed',${i})">✕</button></td></tr>`;
    });

    // 3. STOCKS
    const stkBody = document.querySelector('#table-stocks tbody');
    stkBody.innerHTML = 'Updating prices...';
    let stkHtml = '';
    for (let s of db.stocks) {
        const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s.ticker}&apikey=${STOCK_API}`).then(r => r.json());
        const live = parseFloat(res["Global Quote"]?.["05. price"]) || s.buyPrice;
        const pl = (live - s.buyPrice) * s.qty;
        const mVal = (s.qty * live) / rates.USD;
        allocation.stk += mVal;
        weightedYieldSum += (mVal * 0.07); // Benchmark 7% for stocks
        stkHtml += `<tr><td>${s.ticker}</td><td>${s.qty}</td><td>$${s.buyPrice.toFixed(2)}</td><td>$${live.toFixed(2)}</td><td class="${pl>=0?'surplus':'loss'}">${pl.toFixed(2)}</td><td>${mVal.toFixed(0)} ${mCurr}</td><td><button onclick="del('stocks',${db.stocks.indexOf(s)})">✕</button></td></tr>`;
    }
    stkBody.innerHTML = stkHtml;

    // 4. DEBT
    const dbtBody = document.querySelector('#table-debt tbody');
    dbtBody.innerHTML = '';
    db.debt.forEach((item, i) => {
        const mVal = item.amount / rates[item.currency];
        allocation.debt += mVal;
        dbtBody.innerHTML += `<tr><td>${item.name}</td><td class="loss">-${item.amount} ${item.currency}</td><td>-${mVal.toFixed(0)}</td><td><button onclick="del('debt',${i})">✕</button></td></tr>`;
    });

    const netWorth = allocation.liq + allocation.fix + allocation.stk - allocation.debt;
    const totalAssets = allocation.liq + allocation.fix + allocation.stk;
    const avgYield = totalAssets > 0 ? (weightedYieldSum / totalAssets) : 0;

    document.getElementById('total-net-worth').innerText = `${netWorth.toLocaleString(undefined, {max:0})} ${mCurr}`;
    
    renderDeduction(netWorth, avgYield, mCurr, rates);
}

function renderDeduction(nw, yieldRate, mCurr, rates) {
    const goal = fVal('target-goal'), years = fVal('years-to-goal');
    const incomeMaster = fVal('monthly-income') / rates[val('income-curr')];
    
    const r = yieldRate / 12, n = years * 12;
    const fv = nw * Math.pow(1 + r, n);
    const gap = Math.max(0, goal - fv);
    const monthlyNeeded = gap > 0 ? (gap * r) / (Math.pow(1 + r, n) - 1) : 0;
    const incomeSurplus = incomeMaster - monthlyNeeded;

    document.getElementById('logic-output').innerHTML = `
        <div class="logic-line"><span>1. Current Assets Consolidated:</span><span>${nw.toLocaleString()} ${mCurr}</span></div>
        <div class="logic-line"><span>2. Portfolio Average Yield:</span><span>${(yieldRate*100).toFixed(2)}%</span></div>
        <div class="logic-line"><span>3. Projected Value (FV) in ${years} yrs:</span><span>${fv.toLocaleString(undefined,{max:0})}</span></div>
        <div class="logic-line"><span>4. Capital Shortfall:</span><span class="loss">-${gap.toLocaleString(undefined,{max:0})}</span></div>
        <div class="logic-line"><span><b>5. REQUIRED SAVINGS PER MONTH:</b></span><span class="surplus">${monthlyNeeded.toLocaleString(undefined,{max:0})} ${mCurr}</span></div>
        <div class="logic-line"><span>6. Available Monthly Income Surplus/Loss:</span><span class="${incomeSurplus>=0?'surplus':'loss'}">${incomeSurplus.toLocaleString(undefined,{max:0})} ${mCurr}</span></div>
    `;

    const progress = Math.min((nw/goal)*100, 100);
    document.getElementById('progress-bar').style.width = progress + "%";
    document.getElementById('progress-text').innerText = progress.toFixed(1) + "%";

    const advice = document.getElementById('rebalance-box');
    if(incomeSurplus < 0) {
        advice.innerHTML = `
            <p class="loss">⚠️ Monthly Deficit Detected: ${Math.abs(incomeSurplus).toFixed(0)} ${mCurr}</p>
            <p><strong>Suggestion:</strong> Increase your portfolio yield to <b>${((yieldRate + 0.02)*100).toFixed(1)}%</b> by moving cash into higher yield assets, or extend retirement by <b>3 years</b>.</p>
        `;
    } else {
        advice.innerHTML = `<p class="surplus">✅ You are on track. Maintain current asset allocation.</p>`;
    }
}

function val(id) { return document.getElementById(id).value; }
function fVal(id) { return parseFloat(document.getElementById(id).value) || 0; }
function del(key, i) { db[key].splice(i, 1); saveAndRefresh(); }
function saveAndRefresh() {
    localStorage.setItem('v3_liquid', JSON.stringify(db.liquid));
    localStorage.setItem('v3_fixed', JSON.stringify(db.fixed));
    localStorage.setItem('v3_stocks', JSON.stringify(db.stocks));
    localStorage.setItem('v3_debt', JSON.stringify(db.debt));
    db.settings = { masterCurr: val('master-currency'), goal: fVal('target-goal'), years: fVal('years-to-goal'), income: fVal('monthly-income'), incomeCurr: val('income-curr') };
    localStorage.setItem('v3_settings', JSON.stringify(db.settings));
    refreshAll();
}
