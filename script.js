/* --- CONFIGURATION & GLOBAL STATE --- */
const FX_API = '393a43661559351810312743';
const STOCK_API = 'RCOIHB62BAXECU2U';
const CURRENCIES = ["HKD", "USD", "EUR", "CNY", "GBP", "JPY", "AUD", "SGD", "CAD"];

// Data Structure - Full Persistence Logic
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
    await refreshAll(true);
});

function initUI() {
    // Populate all currency dropdowns
    const dropdowns = document.querySelectorAll('.curr-list');
    dropdowns.forEach(select => {
        CURRENCIES.forEach(curr => {
            const option = new Option(curr, curr);
            select.add(option);
        });
    });
    
    // Sync UI with DB Settings
    const s = db.settings;
    document.getElementById('master-currency').value = s.masterCurr;
    document.getElementById('target-goal').value = s.goal;
    document.getElementById('goal-curr').value = s.goalCurr;
    document.getElementById('years-to-goal').value = s.years;
    document.getElementById('inflation-rate').value = s.inflation;
    document.getElementById('stock-growth').value = s.stkGrowth;
    document.getElementById('income-val').value = s.income;
    document.getElementById('income-curr').value = s.incomeCurr;

    // Listeners
    document.getElementById('master-currency').onchange = (e) => { 
        db.settings.masterCurr = e.target.value; 
        save(); 
        refreshAll(false); 
    };

    document.getElementById('form-edit-modal').onsubmit = (e) => {
        e.preventDefault();
        saveModalEdit();
    };

    /* --- DATA ENTRY HANDLERS --- */
    document.getElementById('form-liquid').onsubmit = (e) => {
        e.preventDefault();
        const n = document.getElementById('liq-name').value;
        const a = parseFloat(document.getElementById('liq-amount').value) || 0;
        const c = document.getElementById('liq-curr').value;
        
        const idx = db.liquid.findIndex(i => i.name.toLowerCase() === n.toLowerCase() && i.currency === c);
        if(idx > -1) {
            db.liquid[idx].amount += a;
            db.liquid[idx].id = Date.now();
        } else {
            db.liquid.unshift({id: Date.now(), name: n, amount: a, currency: c});
        }
        save(); refreshAll(false); e.target.reset();
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
        save(); refreshAll(false); e.target.reset();
    };

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
            s.id = Date.now();
        } else { 
            db.stocks.unshift({id: Date.now(), ticker: t, qty: q, buyPrice: b}); 
        }
        save(); refreshAll(false); e.target.reset();
    };

    document.getElementById('form-debt').onsubmit = (e) => {
        e.preventDefault();
        const n = document.getElementById('debt-name').value;
        const a = parseFloat(document.getElementById('debt-amount').value) || 0;
        const c = document.getElementById('debt-curr').value;
        db.debt.unshift({id: Date.now(), name: n, amount: a, currency: c});
        save(); refreshAll(false); e.target.reset();
    };

    document.getElementById('calc-btn').onclick = () => { 
        syncSettings(); 
        refreshAll(false, true); 
    };

    document.getElementById('reset-btn').onclick = () => {
        if(confirm("Confirm: This will permanently delete all local portfolio data.")) {
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
    save();
}

function save() { 
    localStorage.setItem('w_liquid', JSON.stringify(db.liquid));
    localStorage.setItem('w_fixed', JSON.stringify(db.fixed));
    localStorage.setItem('w_stocks', JSON.stringify(db.stocks));
    localStorage.setItem('w_debt', JSON.stringify(db.debt));
    localStorage.setItem('w_settings', JSON.stringify(db.settings));
}
/* --- CORE REFRESH & RENDERING ENGINE --- */
async function refreshAll(fullFetch = true, skipStocks = false) {
    const mCurr = db.settings.masterCurr;
    
    // 1. Update Labels
    document.querySelectorAll('.header-curr-label').forEach(el => el.innerText = mCurr);

    // 2. Fetch Forex Rates
    try {
        const res = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API}/latest/${mCurr}`).then(r => r.json());
        if (res.conversion_rates) rates = res.conversion_rates;
    } catch(e) { console.error("Forex Sync Failed. Using stale/base rates."); }

    let t = { liq: 0, fix: 0, stk: 0, debt: 0, yield: 0, stockPL: 0 };

    // 3. Render Liquid Assets (All calculated, Top 3 displayed)
    const liqBody = document.querySelector('#table-liquid tbody');
    liqBody.innerHTML = '';
    db.liquid.sort((a,b) => b.id - a.id).forEach((i, idx) => {
        const mv = i.amount / rates[i.currency];
        t.liq += mv;
        if(idx < 3) {
            liqBody.innerHTML += `<tr><td>${i.name}</td><td>${i.amount.toLocaleString()} ${i.currency}</td><td>${mv.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
            <td><button class="btn-edit" onclick="openModal('liquid',${i.id})">Edit</button><button class="btn-del" onclick="del('liquid',${i.id})">✕</button></td></tr>`;
        }
    });

    // 4. Render Fixed Savings (All calculated, Top 3 displayed)
    const fixBody = document.querySelector('#table-fixed tbody');
    fixBody.innerHTML = '';
    db.fixed.sort((a,b) => b.id - a.id).forEach((i, idx) => {
        const interest = i.principal * (i.rate / 100) * (i.duration / 12);
        const mv = (i.principal + interest) / rates[i.currency];
        t.fix += mv; 
        t.yield += (mv * (i.rate / 100));
        if(idx < 3) {
            const endD = new Date(new Date(i.start).setMonth(new Date(i.start).getMonth() + i.duration)).toISOString().split('T')[0];
            fixBody.innerHTML += `<tr><td>${i.name}</td><td>${i.rate}%</td><td>${endD}</td><td class="surplus">${interest.toLocaleString()}</td><td>${(i.principal + interest).toLocaleString()}</td>
            <td><button class="btn-edit" onclick="openModal('fixed',${i.id})">Edit</button><button class="btn-del" onclick="del('fixed',${i.id})">✕</button></td></tr>`;
        }
    });

    // 5. Render Stocks (AlphaVantage Integration)
    const stkBody = document.querySelector('#table-stocks tbody');
    stkBody.innerHTML = '';
    for (let [idx, s] of db.stocks.sort((a,b) => b.id - a.id).entries()) {
        if (!skipStocks || !s.lastLive) {
            try {
                const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s.ticker}&apikey=${STOCK_API}`).then(r => r.json());
                const lp = parseFloat(res["Global Quote"]?.["05. price"]);
                if (lp) s.lastLive = lp;
            } catch(e) { s.lastLive = s.lastLive || s.buyPrice; }
        }
        const marketValUSD = s.qty * s.lastLive;
        const mvMaster = marketValUSD / (rates["USD"] || 1); // Fallback to 1 if USD rate fails
        t.stk += mvMaster; 
        t.yield += (mvMaster * (db.settings.stkGrowth / 100));
        const plUSD = (s.lastLive - s.buyPrice) * s.qty;
        if(idx < 3) {
            stkBody.innerHTML += `<tr><td>${s.ticker}</td><td>${s.qty}</td><td>$${s.buyPrice.toFixed(2)}</td><td>$${s.lastLive.toFixed(2)}</td><td class="${plUSD >= 0 ? 'surplus' : 'loss'}">${plUSD.toFixed(2)}</td>
            <td><button class="btn-edit" onclick="openModal('stocks',${s.id})">Edit</button><button class="btn-del" onclick="del('stocks',${s.id})">✕</button></td></tr>`;
        }
    }

    // 6. Render Debt
    const debtBody = document.querySelector('#table-debt tbody');
    debtBody.innerHTML = '';
    db.debt.sort((a,b) => b.id - a.id).forEach((i, idx) => {
        const mv = i.amount / rates[i.currency];
        t.debt += mv;
        if(idx < 3) {
            debtBody.innerHTML += `<tr><td>${i.name}</td><td class="loss">-${i.amount.toLocaleString()}</td><td>-${mv.toLocaleString()}</td>
            <td><button class="btn-edit" onclick="openModal('debt',${i.id})">Edit</button><button class="btn-del" onclick="del('debt',${i.id})">✕</button></td></tr>`;
        }
    });

    // 7. Global Net Worth Calculation
    const netWorth = t.liq + t.fix + t.stk - t.debt;
    document.getElementById('total-net-worth').innerText = netWorth.toLocaleString(undefined, {maximumFractionDigits: 0}) + " " + mCurr;
    document.getElementById('acc-liq').innerText = t.liq.toLocaleString(undefined, {maximumFractionDigits:0});
    document.getElementById('acc-fix').innerText = t.fix.toLocaleString(undefined, {maximumFractionDigits:0});
    document.getElementById('acc-stk').innerText = t.stk.toLocaleString(undefined, {maximumFractionDigits:0});
    document.getElementById('acc-debt').innerText = "-" + t.debt.toLocaleString(undefined, {maximumFractionDigits:0});
    
    renderAudit(netWorth, t);
    updatePie(t);
}

/* --- LOGICAL DEDUCTION ENGINE --- */
function renderAudit(nw, t) {
    const s = db.settings;
    const nwGoalBase = (nw * (rates[s.masterCurr] || 1)) / (rates[s.goalCurr] || 1);
    const totalAssets = t.liq + t.fix + t.stk;
    
    // Formula: Real Yield = [(1 + Nominal) / (1 + Inflation)] - 1
    const nominalYield = totalAssets > 0 ? (t.yield / totalAssets) : 0;
    const realYield = ((1 + nominalYield) / (1 + (s.inflation / 100))) - 1;
    const monthlyRate = realYield / 12;
    const totalMonths = s.years * 12;
    
    // Compound Interest for Future Projections
    const futureVal = nwGoalBase * Math.pow(1 + monthlyRate, totalMonths);
    const gap = Math.max(0, s.goal - futureVal);
    
    // Required Savings PMT Formula
    const savingsReq = gap > 0 ? (gap * monthlyRate) / (Math.pow(1 + monthlyRate, totalMonths) - 1) : 0;
    
    const monthlyIncomeConverted = (s.income / rates[s.incomeCurr]) * rates[s.goalCurr];
    const budgetSurplus = monthlyIncomeConverted - savingsReq;

    // Strategic Suggestion Engine
    let suggestion = "";
    if (gap <= 0) {
        suggestion = "✅ Goal on track. Current assets exceed target with projected growth.";
    } else if (budgetSurplus > 0) {
        suggestion = `⚠️ Gap of ${gap.toLocaleString()} detected. Save ${savingsReq.toLocaleString()} ${s.goalCurr}/mo to hit goal.`;
    } else {
        suggestion = `🚨 Critical Shortfall. Required savings exceeds income. Extend horizon or increase equity exposure.`;
    }

    document.getElementById('logic-output').innerHTML = `
        <div class="audit-line"><span>Proj. Real Yield (Inflation Adj)</span><b>${(realYield * 100).toFixed(2)}%</b></div>
        <div class="audit-line"><span>Future Portfolio Value (${s.years}y)</span><b>${futureVal.toLocaleString(undefined, {maximumFractionDigits:0})} ${s.goalCurr}</b></div>
        <div class="audit-line"><span>Monthly Savings Required</span><b class="surplus">${savingsReq.toLocaleString(undefined, {maximumFractionDigits:0})} ${s.goalCurr}</b></div>
        <div class="audit-line" style="border-top: 1px solid var(--border-ui); margin-top: 8px; padding-top: 8px;">
            <span>Budget Health (Surplus/Loss)</span>
            <b class="${budgetSurplus >= 0 ? 'surplus' : 'loss'}">${budgetSurplus.toLocaleString(undefined, {maximumFractionDigits:0})} ${s.goalCurr}</b>
        </div>
        <div class="logic-box-full" style="background: rgba(129, 140, 248, 0.1); border: 1px dashed var(--accent-primary); margin-top: 15px; font-weight: 700;">
            ${suggestion}
        </div>
    `;

    // Progress Bar Update
    const progressPercent = Math.min((nwGoalBase / s.goal) * 100, 100);
    document.getElementById('progress-bar').style.width = progressPercent + "%";
    document.getElementById('progress-text').innerText = progressPercent.toFixed(1) + "% to Goal";
    document.getElementById('progress-val-achieved').innerText = nwGoalBase.toLocaleString(undefined, {maximumFractionDigits:0}) + " " + s.goalCurr;
    document.getElementById('progress-val-target').innerText = s.goal.toLocaleString() + " " + s.goalCurr;
}

/* --- ASSET ALLOCATION CHARTING --- */
function updatePie(t) {
    const total = t.liq + t.fix + t.stk;
    const legend = document.getElementById('chart-legend');
    legend.innerHTML = '';
    
    if (total <= 0) {
        document.getElementById('allocation-pie').style.background = '#334155';
        return;
    }

    const categories = [
        { label: 'Liquid', val: t.liq, color: '#818cf8' },
        { label: 'Fixed', val: t.fix, color: '#c084fc' },
        { label: 'Stocks', val: t.stk, color: '#4ade80' }
    ];

    let currentStep = 0;
    const gradientParts = categories.map(c => {
        const pct = (c.val / total) * 100;
        const start = currentStep;
        currentStep += pct;

        if (pct > 0) {
            legend.innerHTML += `
                <div class="legend-item">
                    <div class="dot" style="background:${c.color}"></div>
                    <span>${c.label}</span>
                    <span class="pct">${pct.toFixed(1)}%</span>
                </div>`;
        }
        return `${c.color} ${start}% ${currentStep}%`;
    });

    document.getElementById('allocation-pie').style.background = `conic-gradient(${gradientParts.join(', ')})`;
}

/* --- MODAL MANAGEMENT & DELETION --- */
function openModal(cat, id) {
    const item = db[cat].find(x => x.id === id);
    currentEditState = { cat, id };
    const container = document.getElementById('modal-fields');
    
    if (cat === 'stocks') {
        container.innerHTML = `
            <label>Ticker</label><input type="text" id="edit-1" value="${item.ticker}">
            <label>Quantity</label><input type="number" id="edit-2" value="${item.qty}">
            <label>Buy Price</label><input type="number" id="edit-3" value="${item.buyPrice}">`;
    } else if (cat === 'fixed') {
        container.innerHTML = `
            <label>Bank/Plan</label><input type="text" id="edit-1" value="${item.name}">
            <label>Principal</label><input type="number" id="edit-2" value="${item.principal}">
            <label>Rate %</label><input type="number" id="edit-3" value="${item.rate}">`;
    } else {
        container.innerHTML = `
            <label>Name</label><input type="text" id="edit-1" value="${item.name}">
            <label>Amount</label><input type="number" id="edit-2" value="${item.amount}">`;
    }
    document.getElementById('edit-modal').style.display = 'flex';
}

function saveModalEdit() {
    const { cat, id } = currentEditState;
    const item = db[cat].find(x => x.id === id);
    
    if (cat === 'stocks') {
        item.ticker = document.getElementById('edit-1').value.toUpperCase();
        item.qty = parseFloat(document.getElementById('edit-2').value);
        item.buyPrice = parseFloat(document.getElementById('edit-3').value);
    } else if (cat === 'fixed') {
        item.name = document.getElementById('edit-1').value;
        item.principal = parseFloat(document.getElementById('edit-2').value);
        item.rate = parseFloat(document.getElementById('edit-3').value);
    } else {
        item.name = document.getElementById('edit-1').value;
        item.amount = parseFloat(document.getElementById('edit-2').value);
    }
    
    save(); closeModal(); refreshAll(false);
}

function closeModal() { document.getElementById('edit-modal').style.display = 'none'; }
function del(cat, id) { db[cat] = db[cat].filter(x => x.id !== id); save(); refreshAll(false); }
