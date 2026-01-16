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
    // Populate all currency dropdowns
    const dropdowns = document.querySelectorAll('.curr-list');
    dropdowns.forEach(select => {
        CURRENCIES.forEach(curr => {
            const option = new Option(curr, curr);
            select.add(option);
        });
    });
    
    // Set settings values from database
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

    // Master Currency Listener
    document.getElementById('master-currency').onchange = (e) => { 
        db.settings.masterCurr = e.target.value; 
        save(); 
        refreshAll(false); 
    };

    // Modal Form Logic
    document.getElementById('form-edit-modal').onsubmit = (e) => {
        e.preventDefault();
        saveModalEdit();
    };

    /* --- ADD FORM HANDLERS (WITH SMART MERGE & TIMESTAMPING) --- */
    document.getElementById('form-liquid').onsubmit = (e) => {
        e.preventDefault();
        const n = document.getElementById('liq-name').value;
        const a = parseFloat(document.getElementById('liq-amount').value) || 0;
        const c = document.getElementById('liq-curr').value;
        const idx = db.liquid.findIndex(i => i.name.toLowerCase() === n.toLowerCase() && i.currency === c);
        if(idx > -1) {
            db.liquid[idx].amount += a;
            db.liquid[idx].id = Date.now(); // Move to top of latest list
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
            s.id = Date.now(); // Update timestamp
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

function save() { 
    localStorage.setItem('w_liquid', JSON.stringify(db.liquid));
    localStorage.setItem('w_fixed', JSON.stringify(db.fixed));
    localStorage.setItem('w_stocks', JSON.stringify(db.stocks));
    localStorage.setItem('w_debt', JSON.stringify(db.debt));
    localStorage.setItem('w_settings', JSON.stringify(db.settings));
}
/* --- CORE REFRESH & RENDERING ENGINE --- */
async function refreshAll(fullFetch = true, skipStocks = true) {
    const mCurr = db.settings.masterCurr;
    
    // Update all Currency Labels
    document.querySelectorAll('.header-curr-label').forEach(el => el.innerText = mCurr);

    // Fetch Forex Rates
    try {
        const res = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API}/latest/${mCurr}`).then(r => r.json());
        if (res.conversion_rates) {
            rates = res.conversion_rates;
        }
    } catch(e) { 
        console.error("Forex Sync Failed."); 
    }

    // Accumulators for Portfolio Totals
    let t = { liq: 0, fix: 0, stk: 0, debt: 0, yield: 0, stockPL: 0 };

    // 1. Render Liquid Assets (Show latest 3)
    const liqBody = document.querySelector('#table-liquid tbody');
    liqBody.innerHTML = '';
    db.liquid.sort((a,b) => b.id - a.id).slice(0, 3).forEach(i => {
        const mv = i.amount / rates[i.currency];
        liqBody.innerHTML += `
            <tr>
                <td>${i.name}</td>
                <td>${i.amount.toLocaleString()} ${i.currency}</td>
                <td>${mv.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                <td>
                    <button class="btn-edit" onclick="openModal('liquid',${i.id})">Edit</button>
                    <button class="btn-del" onclick="del('liquid',${i.id})">✕</button>
                </td>
            </tr>`;
    });
    db.liquid.forEach(i => t.liq += (i.amount / rates[i.currency]));

    // 2. Render Fixed Savings (Show latest 3)
    const fixBody = document.querySelector('#table-fixed tbody');
    fixBody.innerHTML = '';
    db.fixed.sort((a,b) => b.id - a.id).slice(0, 3).forEach(i => {
        const interest = i.principal * (i.rate / 100) * (i.duration / 12);
        const totalAtMaturity = i.principal + interest;
        const endD = new Date(new Date(i.start).setMonth(new Date(i.start).getMonth() + i.duration)).toISOString().split('T')[0];
        
        fixBody.innerHTML += `
            <tr>
                <td>${i.name}</td>
                <td>${i.rate}%</td>
                <td>${endD}</td>
                <td class="surplus">${interest.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                <td>${totalAtMaturity.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                <td>
                    <button class="btn-edit" onclick="openModal('fixed',${i.id})">Edit</button>
                    <button class="btn-del" onclick="del('fixed',${i.id})">✕</button>
                </td>
            </tr>`;
    });
    db.fixed.forEach(i => {
        const mv = (i.principal + (i.principal * (i.rate / 100) * (i.duration / 12))) / rates[i.currency];
        t.fix += mv;
        t.yield += (mv * (i.rate / 100));
    });

    // 3. Render Equities (Show latest 3)
    const stkBody = document.querySelector('#table-stocks tbody');
    stkBody.innerHTML = '';
    const sortedStocks = db.stocks.sort((a,b) => b.id - a.id);
    for (let s of sortedStocks) {
        if (!skipStocks || !s.lastLive) {
            try {
                const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s.ticker}&apikey=${STOCK_API}`).then(r => r.json());
                const livePrice = parseFloat(res["Global Quote"]?.["05. price"]);
                if (livePrice) s.lastLive = livePrice;
            } catch(e) { 
                s.lastLive = s.lastLive || s.buyPrice; 
            }
        }
        const marketValUSD = s.qty * s.lastLive;
        const mvMaster = marketValUSD / rates.USD;
        t.stk += mvMaster;
        t.yield += (mvMaster * (db.settings.stkGrowth / 100));
        
        const plUSD = (s.lastLive - s.buyPrice) * s.qty;
        t.stockPL += plUSD / rates.USD;

        if (sortedStocks.indexOf(s) < 3) {
            stkBody.innerHTML += `
                <tr>
                    <td>${s.ticker}</td>
                    <td>${s.qty.toLocaleString()}</td>
                    <td>$${s.buyPrice.toLocaleString()}</td>
                    <td>$${s.lastLive.toLocaleString()}</td>
                    <td class="${plUSD >= 0 ? 'surplus' : 'loss'}">${plUSD.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                    <td>
                        <button class="btn-edit" onclick="openModal('stocks',${s.id})">Edit</button>
                        <button class="btn-del" onclick="del('stocks',${s.id})">✕</button>
                    </td>
                </tr>`;
        }
    }

    // 4. Render Debt (Show latest 3)
    const debtBody = document.querySelector('#table-debt tbody');
    debtBody.innerHTML = '';
    db.debt.sort((a,b) => b.id - a.id).slice(0, 3).forEach(i => {
        const mv = i.amount / rates[i.currency];
        debtBody.innerHTML += `
            <tr>
                <td>${i.name}</td>
                <td class="loss">-${i.amount.toLocaleString()}</td>
                <td>-${mv.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                <td>
                    <button class="btn-edit" onclick="openModal('debt',${i.id})">Edit</button>
                    <button class="btn-del" onclick="del('debt',${i.id})">✕</button>
                </td>
            </tr>`;
    });
    db.debt.forEach(i => t.debt += (i.amount / rates[i.currency]));

    // Update Totals UI
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

/* --- LOGICAL DEDUCTION (AUDIT) & PROGRESS BAR --- */
function renderAudit(nw, t) {
    const s = db.settings;
    const nwGoalBase = (nw * rates[db.settings.masterCurr]) / rates[s.goalCurr];
    const totalAssets = t.liq + t.fix + t.stk;
    const nominalYield = totalAssets > 0 ? (t.yield / totalAssets) : 0;
    const realYield = ((1 + nominalYield) / (1 + (s.inflation / 100))) - 1;
    const monthlyRate = realYield / 12, totalMonths = s.years * 12;
    const futureVal = nwGoalBase * Math.pow(1 + monthlyRate, totalMonths);
    const gap = Math.max(0, s.goal - futureVal);
    const monthlySavingsReq = gap > 0 ? (gap * monthlyRate) / (Math.pow(1 + monthlyRate, totalMonths) - 1) : 0;

    document.getElementById('logic-output').innerHTML = `
        <div class="audit-line"><span>Proj. Real Yield</span><b>${(realYield * 100).toFixed(2)}%</b></div>
        <div class="audit-line"><span>Proj. Portfolio Value</span><b>${futureVal.toLocaleString(undefined, {maximumFractionDigits:0})} ${s.goalCurr}</b></div>
        <div class="audit-line"><span>Monthly Savings Required</span><b class="surplus">${monthlySavingsReq.toLocaleString(undefined, {maximumFractionDigits:0})} ${s.goalCurr}</b></div>
    `;

    // Dynamic Progress Bar Update
    const progressPercent = Math.min((nwGoalBase / s.goal) * 100, 100);
    document.getElementById('progress-bar').style.width = progressPercent + "%";
    document.getElementById('progress-text').innerText = progressPercent.toFixed(1) + "% Achieved";
    document.getElementById('progress-val-achieved').innerText = nwGoalBase.toLocaleString(undefined, {maximumFractionDigits: 0}) + " " + s.goalCurr;
    document.getElementById('progress-val-target').innerText = s.goal.toLocaleString() + " " + s.goalCurr;
}

/* --- ASSET ALLOCATION PIE & LEGEND --- */
function updatePie(t) {
    const total = t.liq + t.fix + t.stk;
    const mCurr = db.settings.masterCurr;
    const legend = document.getElementById('chart-legend');
    legend.innerHTML = '';
    if (total <= 0) return;

    const cats = [
        { label: 'Liquid', val: t.liq, color: '#818cf8' },
        { label: 'Fixed', val: t.fix, color: '#c084fc' },
        { label: 'Stocks', val: t.stk, color: '#4ade80' }
    ];

    let currentStep = 0;
    const gradient = cats.map(c => {
        const pct = (c.val / total) * 100;
        const start = currentStep;
        currentStep += pct;
        legend.innerHTML += `
            <div class="legend-item">
                <span class="dot" style="background:${c.color}"></span>
                <span class="lab">${c.label}</span>
                <span class="pct">${pct.toFixed(1)}%</span>
                <span class="val">${c.val.toLocaleString(undefined, {maximumFractionDigits:0})} ${mCurr}</span>
            </div>`;
        return `${c.color} ${start}% ${currentStep}%`;
    }).join(', ');
    document.getElementById('allocation-pie').style.background = `conic-gradient(${gradient})`;
}

/* --- MODAL EDIT SYSTEM --- */
function openModal(category, id) {
    const item = db[category].find(x => x.id === id);
    currentEditState = { category, id };
    const container = document.getElementById('modal-fields');
    container.innerHTML = '';
    
    if (category === 'liquid' || category === 'debt') {
        container.innerHTML = `
            <label>Name</label><input type="text" id="edit-n" value="${item.name}">
            <label>Amount</label><input type="number" id="edit-a" value="${item.amount}">
            <label>Currency</label><select id="edit-c" class="curr-list"></select>`;
    } else if (category === 'fixed') {
        container.innerHTML = `
            <label>Bank</label><input type="text" id="edit-n" value="${item.name}">
            <label>Principal</label><input type="number" id="edit-a" value="${item.principal}">
            <label>Rate %</label><input type="number" id="edit-r" value="${item.rate}">
            <label>Months</label><input type="number" id="edit-d" value="${item.duration}">
            <label>Start</label><input type="date" id="edit-s" value="${item.start}">
            <label>Currency</label><select id="edit-c" class="curr-list"></select>`;
    } else if (category === 'stocks') {
        container.innerHTML = `
            <label>Ticker</label><input type="text" id="edit-n" value="${item.ticker}">
            <label>Qty</label><input type="number" id="edit-a" value="${item.qty}">
            <label>Avg Buy Price ($)</label><input type="number" id="edit-b" value="${item.buyPrice}">`;
    }

    const sel = container.querySelector('select');
    if (sel) { 
        CURRENCIES.forEach(c => sel.add(new Option(c, c))); 
        sel.value = item.currency; 
    }
    document.getElementById('edit-modal').style.display = 'flex';
}

function closeModal() { document.getElementById('edit-modal').style.display = 'none'; }

function saveModalEdit() {
    const { category, id } = currentEditState;
    const item = db[category].find(x => x.id === id);
    
    if (category === 'liquid' || category === 'debt') {
        item.name = document.getElementById('edit-n').value;
        item.amount = parseFloat(document.getElementById('edit-a').value) || 0;
        item.currency = document.getElementById('edit-c').value;
    } else if (category === 'fixed') {
        item.name = document.getElementById('edit-n').value;
        item.principal = parseFloat(document.getElementById('edit-a').value) || 0;
        item.rate = parseFloat(document.getElementById('edit-r').value) || 0;
        item.duration = parseInt(document.getElementById('edit-d').value);
        item.start = document.getElementById('edit-s').value;
        item.currency = document.getElementById('edit-c').value;
    } else if (category === 'stocks') {
        item.ticker = document.getElementById('edit-n').value.toUpperCase();
        item.qty = parseFloat(document.getElementById('edit-a').value) || 0;
        item.buyPrice = parseFloat(document.getElementById('edit-b').value) || 0;
    }

    save();
    closeModal();
    refreshAll(false);
}

/* --- HELPERS --- */
function del(category, id) {
    db[category] = db[category].filter(x => x.id !== id);
    save();
    refreshAll(false);
}

document.getElementById('reset-btn').onclick = () => {
    if(confirm("Wipe all data? This cannot be undone.")) {
        localStorage.clear();
        location.reload();
    }
};
