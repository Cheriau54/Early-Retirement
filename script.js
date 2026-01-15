const FX_API_KEY = '393a43661559351810312743';
const STOCK_API_KEY = 'RCOIHB62BAXECU2U';
const CURRENCIES = ["HKD", "USD", "EUR", "CNY", "GBP", "JPY", "KRW", "AUD", "CAD", "VND", "THB", "IDR", "SGD", "PHP"];

let mySavings = JSON.parse(localStorage.getItem('mySavings')) || [];
let termSavings = JSON.parse(localStorage.getItem('termSavings')) || [];
let myStocks = JSON.parse(localStorage.getItem('myStocks')) || [];
let myDebts = JSON.parse(localStorage.getItem('myDebts')) || [];
let userSettings = JSON.parse(localStorage.getItem('userSettings')) || { 
    target: 1000000, 
    years: 10, 
    masterCurr: "HKD", 
    title: "Wealth Tracker" 
};

window.addEventListener('DOMContentLoaded', () => {
    // Populate Currencies
    const masters = document.getElementById('master-currency');
    CURRENCIES.forEach(c => {
        masters.add(new Option(c, c));
        document.querySelectorAll('.curr-list').forEach(list => list.add(new Option(c, c)));
    });

    // Set UI State
    document.getElementById('editable-title').innerText = userSettings.title;
    document.getElementById('page-title-meta').innerText = userSettings.title;
    masters.value = userSettings.masterCurr;
    document.getElementById('target-goal').value = userSettings.target;
    document.getElementById('years-to-goal').value = userSettings.years;

    initDashboard();
    setupListeners();
});

function setupListeners() {
    // Editable Title Listener
    const titleEl = document.getElementById('editable-title');
    titleEl.addEventListener('blur', () => {
        userSettings.title = titleEl.innerText;
        document.getElementById('page-title-meta').innerText = titleEl.innerText;
        saveSettings();
    });

    document.getElementById('master-currency').onchange = (e) => {
        userSettings.masterCurr = e.target.value;
        saveSettings();
    };

    document.getElementById('bank-form').onsubmit = (e) => {
        e.preventDefault();
        mySavings.push({ 
            name: document.getElementById('bank-name').value, 
            amount: parseFloat(document.getElementById('bank-amount').value), 
            currency: document.getElementById('bank-currency').value 
        });
        saveData();
    };

    document.getElementById('savings-form').onsubmit = (e) => {
        e.preventDefault();
        const principal = parseFloat(document.getElementById('sav-amount').value);
        const rate = parseFloat(document.getElementById('sav-rate').value);
        const months = parseFloat(document.getElementById('sav-duration').value);
        const profit = principal * (rate / 100) * (months / 12);
        let end = new Date(document.getElementById('sav-start').value || new Date());
        end.setMonth(end.getMonth() + Math.round(months));

        termSavings.push({ 
            name: document.getElementById('sav-name').value, 
            principal, 
            currency: document.getElementById('sav-currency').value, 
            rate, 
            total: principal + profit, 
            end: end.toISOString().split('T')[0] 
        });
        saveData();
    };

    document.getElementById('stock-form').onsubmit = (e) => {
        e.preventDefault();
        myStocks.push({ 
            symbol: document.getElementById('stock-ticker').value.toUpperCase(), 
            shares: parseFloat(document.getElementById('stock-shares').value), 
            avgPrice: parseFloat(document.getElementById('stock-buy-price').value) 
        });
        saveData();
    };

    document.getElementById('debt-form').onsubmit = (e) => {
        e.preventDefault();
        myDebts.push({ 
            name: document.getElementById('debt-name').value, 
            amount: parseFloat(document.getElementById('debt-amount').value), 
            currency: document.getElementById('debt-currency').value 
        });
        saveData();
    };

    document.getElementById('target-goal').onchange = saveSettings;
    document.getElementById('years-to-goal').onchange = saveSettings;
    document.getElementById('reset-btn').onclick = () => { if(confirm("Clear all?")) { localStorage.clear(); location.reload(); }};
    document.getElementById('calc-rebalance').onclick = calculateRebalance;
}

async function initDashboard() {
    const mCurr = userSettings.masterCurr;
    document.querySelectorAll('.m-curr').forEach(el => el.innerText = mCurr);

    try {
        const fxRes = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API_KEY}/latest/${mCurr}`);
        const fxData = await fxRes.json();
        const rates = fxData.conversion_rates;

        let breakdown = { liquid: 0, term: 0, stocks: 0, debt: 0 };
        let weightedSum = 0;

        // 1. Liquid
        let liqText = [];
        mySavings.forEach(s => {
            const valMaster = s.amount / rates[s.currency];
            breakdown.liquid += valMaster;
            liqText.push(`${s.amount.toLocaleString()} ${s.currency}`);
        });
        document.getElementById('liquid-accumulated').innerText = "Total: " + (liqText.join(' | ') || "0");

        // 2. Fixed
        let fixText = [];
        termSavings.forEach(s => {
            const valMaster = s.total / rates[s.currency];
            breakdown.term += valMaster;
            weightedSum += (valMaster * s.rate);
            fixText.push(`${s.total.toLocaleString()} ${s.currency}`);
        });
        document.getElementById('fixed-accumulated').innerText = "Total: " + (fixText.join(' | ') || "0");

        // 3. Stocks (Fetch Live)
        let stockUSDTotal = 0;
        for (let s of myStocks) {
            const sRes = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s.symbol}&apikey=${STOCK_API_KEY}`);
            const sData = await sRes.json();
            const live = parseFloat(sData["Global Quote"]?.["05. price"]) || s.avgPrice;
            const valMaster = (s.shares * live) / rates.USD;
            breakdown.stocks += valMaster;
            stockUSDTotal += (s.shares * live);
            weightedSum += (valMaster * 7.0); // Assumption: Stocks grow at 7%
            await new Promise(r => setTimeout(r, 400));
        }
        document.getElementById('stock-accumulated').innerText = `Accumulated: $${stockUSDTotal.toLocaleString()} USD`;

        // 4. Debt
        let debtText = [];
        myDebts.forEach(d => {
            const valMaster = d.amount / rates[d.currency];
            breakdown.debt += valMaster;
            debtText.push(`${d.amount.toLocaleString()} ${d.currency}`);
        });
        document.getElementById('debt-accumulated').innerText = "Total: " + (debtText.join(' | ') || "0");

        const finalWealth = breakdown.liquid + breakdown.term + breakdown.stocks - breakdown.debt;
        const totalInvested = breakdown.liquid + breakdown.term + breakdown.stocks;
        const avgReturn = totalInvested > 0 ? (weightedSum / totalInvested) : 0;

        document.getElementById('total-net-worth').innerText = `${finalWealth.toLocaleString(undefined, {max:0})} ${mCurr}`;
        document.getElementById('annual-return').value = avgReturn.toFixed(2) + "%";

        renderDetailedPlanner(finalWealth, breakdown, avgReturn, mCurr);
        window.currentGlobals = { finalWealth, breakdown, avgReturn, rates };

    } catch(e) { console.error("FX/Stock Fetch Error:", e); }
}

function renderDetailedPlanner(wealth, b, ret, curr) {
    const target = parseFloat(document.getElementById('target-goal').value);
    const years = parseFloat(document.getElementById('years-to-goal').value);
    const r = (ret / 100) / 12;
    const n = years * 12;
    const fv = wealth * Math.pow(1 + r, n);
    const gap = Math.max(0, target - fv);

    document.getElementById('logic-breakdown').innerHTML = `
        <div class="logic-item"><span>Liquid Assets (${curr}):</span><span>${b.liquid.toLocaleString(undefined,{max:0})}</span></div>
        <div class="logic-item"><span>Fixed Savings (${curr}):</span><span>${b.term.toLocaleString(undefined,{max:0})}</span></div>
        <div class="logic-item"><span>Stock Equity (${curr}):</span><span>${b.stocks.toLocaleString(undefined,{max:0})}</span></div>
        <div class="logic-item" style="color:var(--danger)"><span>Liabilities (${curr}):</span><span>-${b.debt.toLocaleString(undefined,{max:0})}</span></div>
        <div class="logic-item logic-total"><span>TOTAL ACCUMULATED (${curr}):</span><span>${wealth.toLocaleString(undefined,{max:0})}</span></div>
        <div class="logic-item" style="margin-top:10px; border-top:1px dashed #555">
            <span>Est. Growth Over ${years} Years:</span><span>+${(fv - wealth).toLocaleString(undefined,{max:0})}</span>
        </div>
        <div class="logic-item logic-total" style="color:var(--accent)"><span>GAP TO REACH GOAL:</span><span>${gap.toLocaleString(undefined,{max:0})} ${curr}</span></div>
    `;

    const monthly = gap > 0 ? gap / ((Math.pow(1 + r, n) - 1) / r) : 0;
    document.getElementById('goal-progress-bar').style.width = Math.min((wealth/target)*100, 100) + "%";
    document.getElementById('progress-percent').innerText = ((wealth/target)*100).toFixed(1) + "% Achieved";
    document.getElementById('calculator-result').innerHTML = `<h2 style="text-align:center; margin-top:20px;">${monthly.toLocaleString(undefined,{max:0})} ${curr} / Month Required</h2>`;
}

function calculateRebalance() {
    const targetRet = parseFloat(document.getElementById('rebalance-target').value);
    const resDiv = document.getElementById('rebalance-result');
    if(!targetRet || !window.currentGlobals) return;

    const { finalWealth, breakdown, avgReturn } = window.currentGlobals;
    const totalAssets = breakdown.liquid + breakdown.term + breakdown.stocks;
    
    // Logic: How much liquid (0%) to move to savings (assume 4.5% yield) to raise total return
    const currentSum = (avgReturn / 100) * totalAssets;
    const targetSum = (targetRet / 100) * totalAssets;
    const moveNeeded = (targetSum - currentSum) / 0.045;

    resDiv.style.display = 'block';
    if(moveNeeded > breakdown.liquid) {
        resDiv.innerHTML = `<div class="logic-item" style="color:var(--danger)">Not enough liquid cash to hit ${targetRet}% return through rebalancing.</div>`;
    } else {
        resDiv.innerHTML = `
            <div class="logic-item"><span>Transfer Cash to Savings (4.5%):</span><span>${moveNeeded.toLocaleString(undefined,{max:0})} ${userSettings.masterCurr}</span></div>
            <div class="logic-item"><span>Resulting Return:</span><span>${targetRet}%</span></div>
        `;
    }
}

function saveSettings() {
    userSettings.target = parseFloat(document.getElementById('target-goal').value);
    userSettings.years = parseFloat(document.getElementById('years-to-goal').value);
    localStorage.setItem('userSettings', JSON.stringify(userSettings));
    // No reload here to allow title editing to feel smooth
}

function saveData() {
    localStorage.setItem('mySavings', JSON.stringify(mySavings));
    localStorage.setItem('termSavings', JSON.stringify(termSavings));
    localStorage.setItem('myStocks', JSON.stringify(myStocks));
    localStorage.setItem('myDebts', JSON.stringify(myDebts));
    location.reload();
}
