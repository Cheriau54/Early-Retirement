/* --- CONFIGURATION & GLOBAL STATE --- */
const FX_API = '393a43661559351810312743';
const STOCK_API = 'RCOIHB62BAXECU2U';
const CURRENCIES = ["HKD", "USD", "EUR", "CNY", "GBP", "JPY", "AUD", "SGD", "CAD"];

// Requirement 1 & 2: Full Data Persistence Logic
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
        income: 50000, 
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
    // Load existing data immediately on startup
    await refreshAll(true);
});

function initUI() {
    // Populate all currency dropdowns across the application
    const dropdowns = document.querySelectorAll('.curr-list');
    dropdowns.forEach(select => {
        CURRENCIES.forEach(curr => {
            const option = new Option(curr, curr);
            select.add(option);
        });
    });
    
    // Synchronize UI Inputs with the Database Settings
    const s = db.settings;
    document.getElementById('master-currency').value = s.masterCurr;
    document.getElementById('target-goal').value = s.goal;
    document.getElementById('goal-curr').value = s.goalCurr;
    document.getElementById('years-to-goal').value = s.years;
    document.getElementById('inflation-rate').value = s.inflation;
    document.getElementById('stock-growth').value = s.stkGrowth;
    document.getElementById('income-val').value = s.income;
    document.getElementById('income-curr').value = s.incomeCurr;

    // Requirement 1: Explicit Manual Save Button
    document.getElementById('manual-save-btn').onclick = () => {
        syncSettings();
        saveToDisk();
        alert("Portfolio successfully saved to secure local storage.");
    };

    // Requirement 4: Stock Price Refresh Trigger
    document.getElementById('refresh-stocks-btn').onclick = () => {
        refreshAll(false, false); // force update of live prices
    };

    document.getElementById('master-currency').onchange = (e) => { 
        db.settings.masterCurr = e.target.value; 
        saveToDisk(); 
        refreshAll(false); 
    };

    document.getElementById('form-edit-modal').onsubmit = (e) => {
        e.preventDefault();
        saveModalEdit();
    };

    // Global Calculation Trigger
    document.getElementById('calc-btn').onclick = () => { 
        syncSettings(); 
        refreshAll(false, true); 
    };

    document.getElementById('reset-btn').onclick = () => {
        if(confirm("Confirm: This will wipe all saved financial data permanently.")) {
            localStorage.clear();
            location.reload();
        }
    };
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
        incomeFreq: "monthly", 
        incomeCurr: document.getElementById('income-curr').value 
    };
    saveToDisk();
}

function saveToDisk() { 
    localStorage.setItem('w_liquid', JSON.stringify(db.liquid));
    localStorage.setItem('w_fixed', JSON.stringify(db.fixed));
    localStorage.setItem('w_stocks', JSON.stringify(db.stocks));
    localStorage.setItem('w_debt', JSON.stringify(db.debt));
    localStorage.setItem('w_settings', JSON.stringify(db.settings));
}
/* --- ASSET ENTRY HANDLERS --- */
document.getElementById('form-liquid').onsubmit = (e) => {
    e.preventDefault();
    const n = document.getElementById('liq-name').value;
    const a = parseFloat(document.getElementById('liq-amount').value) || 0;
    const c = document.getElementById('liq-curr').value;
    
    // Smart Merge: If account exists in same currency, update balance instead of duplicating
    const idx = db.liquid.findIndex(i => i.name.toLowerCase() === n.toLowerCase() && i.currency === c);
    if(idx > -1) {
        db.liquid[idx].amount += a;
        db.liquid[idx].id = Date.now();
    } else {
        db.liquid.unshift({id: Date.now(), name: n, amount: a, currency: c});
    }
    saveToDisk(); refreshAll(false); e.target.reset();
};

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
    saveToDisk(); refreshAll(false); e.target.reset();
};

document.getElementById('form-stocks').onsubmit = (e) => {
    e.preventDefault();
    const t = document.getElementById('stk-ticker').value.toUpperCase();
    const q = parseFloat(document.getElementById('stk-qty').value) || 0;
    const b = parseFloat(document.getElementById('stk-buy').value) || 0;
    
    const idx = db.stocks.findIndex(i => i.ticker === t);
    if(idx > -1) {
        const s = db.stocks[idx];
        // Weighted Average Cost calculation
        s.buyPrice = ((s.buyPrice * s.qty) + (b * q)) / (s.qty + q);
        s.qty += q;
        s.id = Date.now();
    } else { 
        db.stocks.unshift({id: Date.now(), ticker: t, qty: q, buyPrice: b, lastLive: 0}); 
    }
    saveToDisk(); refreshAll(false); e.target.reset();
};

document.getElementById('form-debt').onsubmit = (e) => {
    e.preventDefault();
    const n = document.getElementById('debt-name').value;
    const a = parseFloat(document.getElementById('debt-amount').value) || 0;
    const c = document.getElementById('debt-curr').value;
    db.debt.unshift({id: Date.now(), name: n, amount: a, currency: c});
    saveToDisk(); refreshAll(false); e.target.reset();
};

/* --- CORE RENDERING & CALCULATION ENGINE --- */
async function refreshAll(fullFetch = true, skipStocks = true) {
    const mCurr = db.settings.masterCurr;
    
    // Update Master Currency Labels globally
    document.querySelectorAll('.header-curr-label').forEach(el => el.innerText = mCurr);

    // Fetch Forex Rates via API
    if (fullFetch || Object.keys(rates).length === 0) {
        try {
            const res = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API}/latest/${mCurr}`).then(r => r.json());
            if (res.conversion_rates) rates = res.conversion_rates;
        } catch(e) { console.error("Forex Sync Failed. Check API Key or Connection."); }
    }

    let t = { liq: 0, fix: 0, stk: 0, debt: 0, yield: 0, totalStkPL: 0 };

    // 1. Render Liquid Table
    const liqBody = document.querySelector('#table-liquid tbody');
    liqBody.innerHTML = '';
    db.liquid.sort((a,b) => b.id - a.id).forEach((i, idx) => {
        const mv = i.amount / rates[i.currency];
        t.liq += mv;
        liqBody.innerHTML += `<tr><td>${i.name}</td><td>${i.amount.toLocaleString()} ${i.currency}</td><td>${mv.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
        <td><button class="btn-edit" onclick="openModal('liquid',${i.id})">Edit</button><button class="btn-del" onclick="del('liquid',${i.id})">✕</button></td></tr>`;
    });

    // 2. Render Fixed Savings Table
    const fixBody = document.querySelector('#table-fixed tbody');
    fixBody.innerHTML = '';
    db.fixed.sort((a,b) => b.id - a.id).forEach((i, idx) => {
        const interest = i.principal * (i.rate / 100) * (i.duration / 12);
        const mv = (i.principal + interest) / rates[i.currency];
        t.fix += mv; 
        t.yield += (mv * (i.rate / 100));
        const endD = new Date(new Date(i.start).setMonth(new Date(i.start).getMonth() + i.duration)).toISOString().split('T')[0];
        fixBody.innerHTML += `<tr><td>${i.name}</td><td>${i.rate}%</td><td>${endD}</td><td class="surplus">${interest.toLocaleString()}</td><td>${(i.principal + interest).toLocaleString()}</td>
        <td><button class="btn-edit" onclick="openModal('fixed',${i.id})">Edit</button><button class="btn-del" onclick="del('fixed',${i.id})">✕</button></td></tr>`;
    });

    // 3. Render Equities (Requirement 4: Detailed P/L & Refresh Logic)
    const stkBody = document.querySelector('#table-stocks tbody');
    stkBody.innerHTML = '';
    for (let s of db.stocks) {
        if (!skipStocks || s.lastLive === 0) {
            try {
                const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s.ticker}&apikey=${STOCK_API}`).then(r => r.json());
                const live = parseFloat(res["Global Quote"]?.["05. price"]);
                if (live) s.lastLive = live;
            } catch(e) { s.lastLive = s.lastLive || s.buyPrice; }
        }
        const marketValUSD = s.qty * s.lastLive;
        const mvMaster = marketValUSD / (rates["USD"] || 1);
        t.stk += mvMaster; 
        t.yield += (mvMaster * (db.settings.stkGrowth / 100));
        const plUSD = (s.lastLive - s.buyPrice) * s.qty;
        t.totalStkPL += plUSD;
        
        stkBody.innerHTML += `<tr><td>${s.ticker}</td><td>${s.qty}</td><td>$${s.buyPrice.toFixed(2)}</td><td>$${s.lastLive.toFixed(2)}</td><td class="${plUSD >= 0 ? 'surplus' : 'loss'}">${plUSD.toLocaleString()}</td>
        <td><button class="btn-edit" onclick="openModal('stocks',${s.id})">Edit</button><button class="btn-del" onclick="del('stocks',${s.id})">✕</button></td></tr>`;
    }

    // 4. Render Debt Table
    const debtBody = document.querySelector('#table-debt tbody');
    debtBody.innerHTML = '';
    db.debt.sort((a,b) => b.id - a.id).forEach((i, idx) => {
        const mv = i.amount / rates[i.currency];
        t.debt += mv;
        debtBody.innerHTML += `<tr><td>${i.name}</td><td class="loss">-${i.amount.toLocaleString()}</td><td>-${mv.toLocaleString()}</td>
        <td><button class="btn-edit" onclick="openModal('debt',${i.id})">Edit</button><button class="btn-del" onclick="del('debt',${i.id})">✕</button></td></tr>`;
    });

    // Update Global Summaries
    const netWorth = t.liq + t.fix + t.stk - t.debt;
    document.getElementById('total-net-worth').innerText = netWorth.toLocaleString(undefined, {maximumFractionDigits: 0}) + " " + mCurr;
    document.getElementById('acc-liq').innerText = t.liq.toLocaleString();
    document.getElementById('acc-fix').innerText = t.fix.toLocaleString();
    document.getElementById('acc-stk').innerText = t.stk.toLocaleString();
    document.getElementById('acc-debt').innerText = "-" + t.debt.toLocaleString();
    
    // Pass totals to Audit Engine and Pie Chart
    runAuditEngine(netWorth, t);
    updateCompositionChart(t);
}
/* --- REQUIREMENT 5, 6 & 7: STRATEGIC AUDIT ENGINE --- */
function runAuditEngine(nw, t) {
    const s = db.settings;
    
    // 1. Convert Current Net Worth into Goal Currency
    const nwInGoalCurr = (nw * (rates[s.masterCurr] || 1)) / (rates[s.goalCurr] || 1);
    const totalAssets = t.liq + t.fix + t.stk;
    
    // 2. Real Yield Calculation (Inflation Adjusted)
    const nominalYield = totalAssets > 0 ? (t.yield / totalAssets) : 0;
    const realYield = ((1 + nominalYield) / (1 + (s.inflation / 100))) - 1;
    const monthlyRate = realYield / 12;
    const totalMonths = s.years * 12;
    
    // 3. Future Value Projection
    const futureVal = nwInGoalCurr * Math.pow(1 + (monthlyRate || 0), (totalMonths || 0));
    const gap = Math.max(0, s.goal - futureVal);
    
    // 4. Monthly Savings Requirement (PMT Formula)
    let savingsReq = 0;
    if (gap > 0) {
        if (monthlyRate !== 0) {
            savingsReq = (gap * monthlyRate) / (Math.pow(1 + monthlyRate, totalMonths) - 1);
        } else {
            savingsReq = gap / (totalMonths || 1);
        }
    }
    
    // 5. Investment Plan Health (Requirement 5: Dynamic Surplus/Deficit)
    const monthlyIncomeInGoalCurr = (s.income / rates[s.incomeCurr]) * rates[s.goalCurr];
    const budgetHealth = monthlyIncomeInGoalCurr - savingsReq;

    // 6. AI Strategic Suggestion Engine (Requirement 6)
    let aiAdvice = "";
    if (gap <= 0) {
        aiAdvice = "STRATEGIC STATUS: OPTIMAL. Your current portfolio growth exceeds your objective. Focus on tax-optimization and wealth preservation strategies.";
    } else if (budgetHealth >= 0) {
        aiAdvice = `STRATEGIC STATUS: STABLE. You have a surplus of ${budgetHealth.toLocaleString()} ${s.goalCurr}. Direct this surplus into your Equities portfolio to accelerate your timeline.`;
    } else {
        aiAdvice = `STRATEGIC STATUS: DEFICIT. Your current income cannot bridge the ${gap.toLocaleString()} gap. Recommendation: Increase Equity growth target or extend horizon by ${(gap / (monthlyIncomeInGoalCurr * 12)).toFixed(1)} years.`;
    }

    // Update the Logic Box
    document.getElementById('logic-output').innerHTML = `
        <div class="audit-line"><span>Proj. Real Yield (Inflation Adj)</span><b>${(realYield * 100).toFixed(2)}%</b></div>
        <div class="audit-line"><span>Future Portfolio Value (${s.years}y)</span><b>${futureVal.toLocaleString(undefined, {maximumFractionDigits:0})} ${s.goalCurr}</b></div>
        <div class="audit-line"><span>Monthly Savings Required</span><b>${savingsReq.toLocaleString(undefined, {maximumFractionDigits:0})} ${s.goalCurr}</b></div>
        <div class="audit-line">
            <span>Investment Plan Health</span>
            <b class="${budgetHealth >= 0 ? 'surplus' : 'loss'}">
                ${budgetHealth >= 0 ? 'SURPLUS' : 'DEFICIT'}: ${Math.abs(budgetHealth).toLocaleString(undefined, {maximumFractionDigits:0})} ${s.goalCurr}
            </b>
        </div>
        <div class="ai-suggestion-box">
            <small>AI Strategic Analysis</small>
            <p>${aiAdvice}</p>
        </div>
    `;

    // 7. Requirement 7: Functional Progress Bar
    const progressPercent = Math.min((nwInGoalCurr / s.goal) * 100, 100) || 0;
    const bar = document.getElementById('progress-bar');
    const text = document.getElementById('progress-text');
    
    bar.style.width = progressPercent + "%";
    text.innerText = progressPercent.toFixed(1) + "% to Goal";
    
    document.getElementById('progress-val-achieved').innerText = nwInGoalCurr.toLocaleString(undefined, {maximumFractionDigits:0}) + " " + s.goalCurr;
    document.getElementById('progress-val-target').innerText = s.goal.toLocaleString() + " " + s.goalCurr;
}

/* --- REQUIREMENT 8: LABELED COMPOSITION CHART --- */
function updateCompositionChart(t) {
    const total = t.liq + t.fix + t.stk;
    const legend = document.getElementById('chart-legend');
    const pie = document.getElementById('allocation-pie');
    
    legend.innerHTML = '';
    
    if (total <= 0) {
        pie.style.background = '#334155';
        legend.innerHTML = '<div class="legend-item">No asset data available</div>';
        return;
    }

    const categories = [
        { label: '01. Liquid', val: t.liq, color: '#818cf8' },
        { label: '02. Fixed', val: t.fix, color: '#c084fc' },
        { label: '03. Equities', val: t.stk, color: '#4ade80' }
    ];

    let currentStep = 0;
    const gradient = categories.map(c => {
        const pct = (c.val / total) * 100;
        const start = currentStep;
        currentStep += pct;

        if (pct > 0) {
            legend.innerHTML += `
                <div class="legend-item">
                    <div class="dot" style="background:${c.color}"></div>
                    <span class="label-text">${c.label}</span>
                    <span class="val-text">${c.val.toLocaleString(undefined, {maximumFractionDigits:0})}</span>
                    <span class="pct-badge">${pct.toFixed(1)}%</span>
                </div>`;
        }
        return `${c.color} ${start}% ${currentStep}%`;
    }).join(', ');

    pie.style.background = `conic-gradient(${gradient})`;
}

/* --- MODAL MANAGEMENT & DATA CLEANUP --- */
function openModal(cat, id) {
    const item = db[cat].find(x => x.id === id);
    currentEditState = { cat, id };
    const container = document.getElementById('modal-fields');
    
    if (cat === 'stocks') {
        container.innerHTML = `
            <label>Ticker Symbol</label><input type="text" id="edit-1" value="${item.ticker}">
            <label>Current Quantity</label><input type="number" id="edit-2" value="${item.qty}">
            <label>Average Buy Price ($)</label><input type="number" id="edit-3" value="${item.buyPrice}">`;
    } else if (cat === 'fixed') {
        container.innerHTML = `
            <label>Plan Name</label><input type="text" id="edit-1" value="${item.name}">
            <label>Principal Amount</label><input type="number" id="edit-2" value="${item.principal}">
            <label>Interest Rate %</label><input type="number" id="edit-3" value="${item.rate}">`;
    } else {
        container.innerHTML = `
            <label>Description</label><input type="text" id="edit-1" value="${item.name}">
            <label>Current Value</label><input type="number" id="edit-2" value="${item.amount}">`;
    }
    document.getElementById('edit-modal').style.display = 'flex';
}

function saveModalEdit() {
    const { cat, id } = currentEditState;
    const item = db[cat].find(x => x.id === id);
    
    const val1 = document.getElementById('edit-1').value;
    const val2 = parseFloat(document.getElementById('edit-2').value);
    const val3 = document.getElementById('edit-3') ? parseFloat(document.getElementById('edit-3').value) : null;

    if (cat === 'stocks') {
        item.ticker = val1.toUpperCase();
        item.qty = val2;
        item.buyPrice = val3;
    } else if (cat === 'fixed') {
        item.name = val1;
        item.principal = val2;
        item.rate = val3;
    } else {
        item.name = val1;
        item.amount = val2;
    }
    
    saveToDisk();
    closeModal();
    refreshAll(false);
}

function closeModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

function del(cat, id) {
    db[cat] = db[cat].filter(x => x.id !== id);
    saveToDisk();
    refreshAll(false);
}
