const FX_API = '393a43661559351810312743';
const STOCK_API = 'RCOIHB62BAXECU2U';
const CURRENCIES = ["HKD", "USD", "EUR", "CNY", "GBP", "JPY", "KRW", "AUD", "CAD", "SGD"];

let db = {
    liquid: JSON.parse(localStorage.getItem('liquid')) || [],
    fixed: JSON.parse(localStorage.getItem('fixed')) || [],
    stocks: JSON.parse(localStorage.getItem('stocks')) || [],
    debt: JSON.parse(localStorage.getItem('debt')) || [],
    settings: JSON.parse(localStorage.getItem('settings')) || { masterCurr: "HKD" }
};

window.addEventListener('DOMContentLoaded', () => {
    initUI();
    refreshDisplay();
});

function initUI() {
    document.querySelectorAll('.curr-list').forEach(select => {
        CURRENCIES.forEach(c => select.add(new Option(c, c)));
    });
    document.getElementById('master-currency').value = db.settings.masterCurr;
    
    // Listeners
    document.getElementById('master-currency').onchange = (e) => {
        db.settings.masterCurr = e.target.value;
        save(); refreshDisplay();
    };

    document.getElementById('bank-form').onsubmit = (e) => {
        e.preventDefault();
        const name = document.getElementById('bank-name').value;
        const curr = document.getElementById('bank-currency').value;
        const amt = parseFloat(document.getElementById('bank-amount').value);
        let existing = db.liquid.find(i => i.name === name && i.currency === curr);
        if(existing) existing.amount += amt; else db.liquid.push({name, amount: amt, currency: curr});
        save(); refreshDisplay(); e.target.reset();
    };

    document.getElementById('stock-form').onsubmit = (e) => {
        e.preventDefault();
        const ticker = document.getElementById('stock-ticker').value.toUpperCase();
        const shares = parseFloat(document.getElementById('stock-shares').value);
        const buy = parseFloat(document.getElementById('stock-buy-price').value);
        let existing = db.stocks.find(s => s.ticker === ticker);
        if(existing) {
            existing.buyPrice = ((existing.buyPrice * existing.shares) + (buy * shares)) / (existing.shares + shares);
            existing.shares += shares;
        } else {
            db.stocks.push({ ticker, shares, buyPrice: buy });
        }
        save(); refreshDisplay(); e.target.reset();
    };

    document.getElementById('calc-trigger-btn').onclick = () => runRetirementMath();
    document.getElementById('reset-btn').onclick = () => { localStorage.clear(); location.reload(); };
}

async function refreshDisplay() {
    const mCurr = db.settings.masterCurr;
    document.querySelectorAll('.m-curr').forEach(el => el.innerText = mCurr);
    
    // 1. Fetch Rates
    const fx = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API}/latest/${mCurr}`).then(r => r.json());
    const rates = fx.conversion_rates;

    let totals = { liq: 0, fix: 0, stk: 0, dbt: 0, yield: 0 };

    // 2. Render Liquid
    const liqBody = document.querySelector('#table-liquid tbody');
    liqBody.innerHTML = '';
    db.liquid.forEach((item, i) => {
        const mVal = item.amount / rates[item.currency];
        totals.liq += mVal;
        liqBody.innerHTML += `<tr><td>${item.name}</td><td>${item.amount} ${item.currency}</td><td>${mVal.toFixed(0)} ${mCurr}</td><td><button onclick="del('liquid',${i})">✕</button></td></tr>`;
    });

    // 3. Render Fixed
    const fixBody = document.querySelector('#table-fixed tbody');
    fixBody.innerHTML = '';
    db.fixed.forEach((item, i) => {
        const interest = item.principal * (item.rate/100) * (item.duration/12);
        const totalMaster = (item.principal + interest) / rates[item.currency];
        totals.fix += totalMaster;
        totals.yield += (totalMaster * (item.rate/100));
        fixBody.innerHTML += `<tr><td>${item.name}</td><td>${item.principal} ${item.currency}</td><td>${item.rate}%</td><td class="surplus">+${interest.toFixed(0)}</td><td>${(item.principal+interest).toLocaleString()}</td><td><button onclick="del('fixed',${i})">✕</button></td></tr>`;
    });

    // 4. Render Equities
    const stkBody = document.querySelector('#table-stocks tbody');
    stkBody.innerHTML = 'Loading Live Prices...';
    let stkHtml = '';
    for (let s of db.stocks) {
        const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s.ticker}&apikey=${STOCK_API}`).then(r => r.json());
        const live = parseFloat(res["Global Quote"]?.["05. price"]) || s.buyPrice;
        const pl = (live - s.buyPrice) * s.shares;
        const mVal = (s.shares * live) / rates.USD;
        totals.stk += mVal;
        totals.yield += (mVal * 0.07); // 7% Benchmark
        stkHtml += `<tr><td>${s.ticker}</td><td>${s.shares}</td><td>$${s.buyPrice}</td><td>$${live.toFixed(2)}</td><td class="${pl>=0?'surplus':'loss'}">${pl.toFixed(2)}</td><td><button onclick="del('stocks',${db.stocks.indexOf(s)})">✕</button></td></tr>`;
    }
    stkBody.innerHTML = stkHtml;

    // 5. Render Debt
    const dbtBody = document.querySelector('#table-debt tbody');
    dbtBody.innerHTML = '';
    db.debt.forEach((item, i) => {
        const mVal = item.amount / rates[item.currency];
        totals.dbt += mVal;
        dbtBody.innerHTML += `<tr><td>${item.name}</td><td>${item.amount} ${item.currency}</td><td class="loss">-${mVal.toFixed(0)}</td><td><button onclick="del('debt',${i})">✕</button></td></tr>`;
    });

    const netWorth = totals.liq + totals.fix + totals.stk - totals.dbt;
    document.getElementById('total-net-worth').innerText = `${netWorth.toLocaleString(undefined,{max:0})} ${mCurr}`;
    
    window.lastCalculatedNW = netWorth;
    window.lastCalculatedYield = (totals.yield / (totals.liq + totals.fix + totals.stk)) || 0;
    window.lastRates = rates;
}

function runRetirementMath() {
    const mCurr = db.settings.masterCurr;
    const goal = parseFloat(document.getElementById('target-goal').value);
    const years = parseFloat(document.getElementById('years-to-goal').value);
    const income = parseFloat(document.getElementById('monthly-income').value) / window.lastRates[document.getElementById('income-currency').value];
    
    const nw = window.lastCalculatedNW;
    const y = window.lastCalculatedYield;
    const r = y / 12;
    const n = years * 12;
    
    // Future Value of current assets: FV = PV * (1 + r)^n
    const fv = nw * Math.pow(1 + r, n);
    const gap = Math.max(0, goal - fv);
    
    // Required Monthly Saving (Annuity Formula)
    const monthlyNeeded = gap > 0 ? (gap * r) / (Math.pow(1 + r, n) - 1) : 0;
    const surplus = income - monthlyNeeded;

    

    document.getElementById('detailed-deduction').innerHTML = `
        <div class="logic-row"><span>Portfolio Weighted Yield:</span><span>${(y*100).toFixed(2)}%</span></div>
        <div class="logic-row"><span>Future Value of Assets (in ${years}yr):</span><span>${fv.toLocaleString(undefined,{max:0})} ${mCurr}</span></div>
        <div class="logic-row"><span>Remaining Gap to Goal:</span><span class="loss">${gap.toLocaleString(undefined,{max:0})} ${mCurr}</span></div>
        <hr>
        <div class="logic-row"><span><b>REQUIRED SAVING PER MONTH:</b></span><span><b>${monthlyNeeded.toLocaleString(undefined,{max:0})} ${mCurr}</b></span></div>
        <div class="logic-row"><span>Income Surplus/Deficit:</span><span class="${surplus>=0?'surplus':'loss'}">${surplus.toLocaleString(undefined,{max:0})} ${mCurr}</span></div>
    `;

    const prog = Math.min((nw/goal)*100, 100);
    document.getElementById('progress-fill').style.width = prog + "%";
    document.getElementById('progress-text').innerText = prog.toFixed(1) + "% Achieved";
}

function del(key, i) { db[key].splice(i, 1); save(); refreshDisplay(); }
function save() { localStorage.setItem('liquid', JSON.stringify(db.liquid)); localStorage.setItem('fixed', JSON.stringify(db.fixed)); localStorage.setItem('stocks', JSON.stringify(db.stocks)); localStorage.setItem('debt', JSON.stringify(db.debt)); localStorage.setItem('settings', JSON.stringify(db.settings)); }
