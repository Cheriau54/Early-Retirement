/* --- CONFIGURATION & STATE --- */
const FX_API = '393a43661559351810312743';
const STOCK_API = 'RCOIHB62BAXECU2U';
const CURRENCIES = ["HKD", "USD", "EUR", "CNY", "GBP", "JPY", "AUD", "SGD", "CAD"];

// Data Structure - Load from LocalStorage or initialize defaults
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

let rates = {}; // Stores latest FX conversion rates
let currentEditState = null; // Stores metadata for the Modal editor

/* --- INITIALIZATION --- */
window.addEventListener('DOMContentLoaded', async () => {
    initUI();
    await refreshAll(true); // Initial fetch including FX rates
});

function initUI() {
    // Populate all currency dropdowns across the app
    document.querySelectorAll('.curr-list').forEach(select => {
        CURRENCIES.forEach(curr => select.add(new Option(curr, curr)));
    });
    
    // Bind existing settings to the inputs
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

    // Master Currency Change Event
    document.getElementById('master-currency').onchange = (e) => { 
        db.settings.masterCurr = e.target.value; 
        save(); 
        refreshAll(false); 
    };

    // Global Save Button
    document.getElementById('save-all-btn').onclick = () => { 
        save(); 
        alert("Portfolio Data Synchronized to Local Storage!"); 
    };

    // Equity Refresh Button (AlphaVantage API Call)
    document.getElementById('refresh-stocks-btn').onclick = async (e) => {
        const btn = e.target;
        btn.classList.add('loading');
        btn.innerText = "⏳ Updating...";
        await refreshAll(false, false); // Force a live stock fetch
        btn.classList.remove('loading');
        btn.innerText = "↻ Refresh Live";
    };

    // Modal Form Logic
    document.getElementById('form-edit-modal').onsubmit = (e) => {
        e.preventDefault();
        saveModalEdit();
    };

    /* --- ADDITION FORM HANDLERS (Smart Merge Logic) --- */
    setupForm('form-liquid', () => {
        const n = val('liq-name'), a = fVal('liq-amount'), c = val('liq-curr');
        const idx = db.liquid.findIndex(i => i.name.toLowerCase() === n.toLowerCase() && i.currency === c);
        if(idx > -1) { 
            db.liquid[idx].amount += a; // Merge if bank/currency matches
            db.liquid.unshift(db.liquid.splice(idx, 1)[0]); // Move to top
        } else { 
            db.liquid.unshift({id: Date.now(), name: n, amount: a, currency: c}); 
        }
    });

    setupForm('form-fixed', () => {
        db.fixed.unshift({ 
            id: Date.now(), 
            name: val('fix-name'), 
            principal: fVal('fix-amount'), 
            currency: val('fix-curr'), 
            rate: fVal('fix-rate'), 
            duration: parseInt(val('fix-duration')), 
            start: val('fix-start') 
        });
    });

    setupForm('form-stocks', () => {
        const t = val('stk-ticker').toUpperCase(), q = fVal('stk-qty'), b = fVal('stk-buy');
        const idx = db.stocks.findIndex(i => i.ticker === t);
        if(idx > -1) {
            const s = db.stocks[idx];
            // Weighted Average Cost Calculation
            s.buyPrice = ((s.buyPrice * s.qty) + (b * q)) / (s.qty + q);
            s.qty += q;
            db.stocks.unshift(db.stocks.splice(idx, 1)[0]);
        } else { 
            db.stocks.unshift({id: Date.now(), ticker: t, qty: q, buyPrice: b}); 
        }
    });

    setupForm('form-debt', () => {
        const n = val('debt-name'), a = fVal('debt-amount'), c = val('debt-curr');
        const idx = db.debt.findIndex(i => i.name.toLowerCase() === n.toLowerCase() && i.currency === c);
        if(idx > -1) { 
            db.debt[idx].amount += a; 
            db.debt.unshift(db.debt.splice(idx, 1)[0]); 
        } else { 
            db.debt.unshift({id: Date.now(), name: n, amount: a, currency: c}); 
        }
    });

    document.getElementById('calc-btn').onclick = () => { 
        syncSettings(); 
        refreshAll(false, true); 
    };

    document.getElementById('reset-btn').onclick = () => { 
        if(confirm("Wipe all system data? This cannot be undone.")) { 
            localStorage.clear(); 
            location.reload(); 
        }
    };
}

/* --- REFRESH & CALCULATION ENGINE --- */
async function refreshAll(fullFetch = true, skipStocks = true) {
    const mCurr = db.settings.masterCurr;
    // Update all UI labels to show the current Master Currency
    document.querySelectorAll('.header-curr-label').forEach(el => el.innerText = mCurr);

    // Fetch Forex Rates
    try {
        const res = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API}/latest/${mCurr}`).then(r => r.json());
        rates = res.conversion_rates;
    } catch(e) { 
        console.error("Forex Sync Failed. Check API Key or Connection."); 
    }

    // Temporary accumulators for the session
    let t = { liq: 0, fix: 0, stk: 0, debt: 0, yield: 0, stockPL: 0 };

    // 1. Render Liquid Assets
    renderSection('liquid', 'table-liquid', (i) => {
        const mv = i.amount / rates[i.currency]; 
        t.liq += mv;
        return `<td>${i.name}</td><td>${i.amount.toLocaleString()} ${i.currency}</td><td>${mv.toFixed(0)}</td>`;
    });

    // 2. Render Fixed Savings (Includes interest projection)
    renderSection('fixed', 'table-fixed', (i) => {
        const intr = i.principal * (i.rate / 100) * (i.duration / 12);
        const totalVal = i.principal + intr;
        const mv = totalVal / rates[i.currency];
        const endD = new Date(new Date(i.start).setMonth(new Date(i.start).getMonth() + i.duration)).toISOString().split('T')[0];
        t.fix += mv; 
        t.yield += (mv * (i.rate / 100));
        return `<td>${i.name}</td><td>${i.rate}%</td><td>${endD}</td><td class="surplus">${intr.toFixed(0)}</td><td>${totalVal.toFixed(0)}</td>`;
    });

    // 3. Render Equities (Live API + Surplus/Loss Logic)
    const sBody = document.querySelector('#table-stocks tbody'); 
    sBody.innerHTML = '';
    for (let s of db.stocks) {
        if(!skipStocks || !s.lastLive) {
            try {
                const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s.ticker}&apikey=${STOCK_API}`).then(r => r.json());
                const price = parseFloat(res["Global Quote"]?.["05. price"]);
                if (price) s.lastLive = price;
            } catch(e) { 
                s.lastLive = s.lastLive || s.buyPrice; 
            }
        }
        const mvM = (s.qty * s.lastLive) / rates.USD; 
        t.stk += mvM;
        t.yield += (mvM * (db.settings.stkGrowth / 100));
        
        const plUSD = (s.lastLive - s.buyPrice) * s.qty;
        t.stockPL += plUSD / rates.USD; // Convert P/L to Master Currency
        
        sBody.innerHTML += `<tr>
            <td>${s.ticker}</td><td>${s.qty}</td><td>$${s.buyPrice.toFixed(2)}</td><td>$${s.lastLive.toFixed(2)}</td>
            <td class="${plUSD >= 0 ? 'surplus' : 'loss'}">${plUSD.toFixed(0)}</td>
            <td><button class="btn-edit" onclick="openModal('stocks',${s.id})">Edit</button><button class="btn-del" onclick="del('stocks',${s.id})">✕</button></td>
        </tr>`;
    }

    // 4. Render Liabilities
    renderSection('debt', 'table-debt', (i) => {
        const mv = i.amount / rates[i.currency]; 
        t.debt += mv;
        return `<td>${i.name}</td><td class="loss">-${i.amount.toLocaleString()}</td><td>-${mv.toFixed(0)}</td>`;
    });

    // Update Header Totals
    const netWorth = t.liq + t.fix + t.stk - t.debt;
    document.getElementById('total-net-worth').innerText = netWorth.toLocaleString(undefined, {maxFractionDigits: 0}) + " " + mCurr;
    document.getElementById('acc-liq').innerText = t.liq.toFixed(0);
    document.getElementById('acc-fix').innerText = t.fix.toFixed(0);
    document.getElementById('acc-stk').innerText = t.stk.toFixed(0);
    document.getElementById('acc-debt').innerText = "-" + t.debt.toFixed(0);
    
    // Update Equity P/L Indicator
    const plEl = document.getElementById('stk-total-pl');
    plEl.innerText = (t.stockPL >= 0 ? "+" : "") + t.stockPL.toFixed(0);
    plEl.className = `pl-indicator ${t.stockPL >= 0 ? 'surplus' : 'loss'}`;

    renderAudit(netWorth, t); 
    updatePie(t);
}

/* --- MODAL EDIT SYSTEM --- */
function openModal(category, id) {
    const item = db[category].find(x => x.id === id);
    currentEditState = { category, id };
    const container = document.getElementById('modal-fields');
    container.innerHTML = '';
    
    if(category === 'liquid' || category === 'debt') {
        container.innerHTML = `
            <label>Name</label><input type="text" id="edit-n" value="${item.name}">
            <label>Amount</label><input type="number" id="edit-a" value="${item.amount}">
            <label>Currency</label><select id="edit-c" class="curr-list"></select>`;
    } else if(category === 'fixed') {
        container.innerHTML = `
            <label>Bank</label><input type="text" id="edit-n" value="${item.name}">
            <label>Principal</label><input type="number" id="edit-a" value="${item.principal}">
            <label>Rate %</label><input type="number" id="edit-r" value="${item.rate}">
            <label>Months</label><input type="number" id="edit-d" value="${item.duration}">
            <label>Start</label><input type="date" id="edit-s" value="${item.start}">
            <label>Currency</label><select id="edit-c" class="curr-list"></select>`;
    } else if(category === 'stocks') {
        container.innerHTML = `
            <label>Ticker</label><input type="text" id="edit-n" value="${item.ticker}">
            <label>Qty</label><input type="number" id="edit-a" value="${item.qty}">
            <label>Avg Buy Price ($)</label><input type="number" id="edit-b" value="${item.buyPrice}">`;
    }

    const sel = container.querySelector('select');
    if(sel) { 
        CURRENCIES.forEach(c => sel.add(new Option(c, c))); 
        sel.value = item.currency; 
    }
    document.getElementById('edit-modal').style.display = 'flex';
}

function closeModal() { 
    document.getElementById('edit-modal').style.display = 'none'; 
}

function saveModalEdit() {
    const { category, id } = currentEditState;
    const item = db[category].find(x => x.id === id);
    
    if(category === 'liquid' || category === 'debt') { 
        item.name = val('edit-n'); item.amount = fVal('edit-a'); item.currency = val('edit-c'); 
    } else if(category === 'fixed') { 
        item.name = val('edit-n'); item.principal = fVal('edit-a'); item.rate = fVal('edit-r'); 
        item.duration = parseInt(val('edit-d')); item.start = val('edit-s'); item.currency = val('edit-c'); 
    } else if(category === 'stocks') { 
        item.ticker = val('edit-n').toUpperCase(); item.qty = fVal('edit-a'); item.buyPrice = fVal('edit-b'); 
    }

    save(); 
    closeModal(); 
    refreshAll(false);
}

/* --- AUDIT ENGINE & VISUALS --- */
function renderAudit(nw, t) {
    const s = db.settings; 
    const nwGoalBase = (nw * rates[db.settings.masterCurr]) / rates[s.goalCurr]; 
    const totalAssets = t.liq + t.fix + t.stk; 
    const nominalYield = totalAssets > 0 ? (t.yield / totalAssets) : 0;
    
    // Fisher Equation for Real Yield: (1 + n) / (1 + i) - 1
    const realYield = ((1 + nominalYield) / (1 + (s.inflation / 100))) - 1; 
    const r = realYield / 12, n = s.years * 12;
    
    const futureVal = nwGoalBase * Math.pow(1 + r, n); 
    const gap = Math.max(0, s.goal - futureVal);
    const monthlyReq = gap > 0 ? (gap * r) / (Math.pow(1 + r, n) - 1) : 0;
    
    let monthlyInc = (s.income / rates[s.incomeCurr]) * rates[s.goalCurr]; 
    if(s.incomeFreq === 'annual') monthlyInc /= 12;

    document.getElementById('logic-output').innerHTML = `
        <div class="audit-line"><span>Proj. Real Yield (Inflation Adjusted)</span><b>${(realYield * 100).toFixed(2)}%</b></div>
        <div class="audit-line"><span>Proj. Portfolio Value (${s.years}y)</span><b>${futureVal.toLocaleString(undefined,{maxFractionDigits:0})} ${s.goalCurr}</b></div>
        <div class="audit-line"><span>Target Gap</span><b class="loss">${gap.toLocaleString(undefined,{maxFractionDigits:0})} ${s.goalCurr}</b></div>
        <div class="audit-line"><span>Monthly Savings Required</span><b class="surplus">${monthlyReq.toLocaleString(undefined,{maxFractionDigits:0})} ${s.goalCurr}</b></div>
        <div class="audit-line" style="border-top:1px solid #444;margin-top:10px;padding-top:10px">
            <span><b>Investment Plan Health (Surplus)</b></span>
            <b class="${monthlyInc - monthlyReq >= 0 ? 'surplus' : 'loss'}">${(monthlyInc - monthlyReq).toLocaleString(undefined,{maxFractionDigits:0})} ${s.goalCurr}</b>
        </div>
    `;
    const progress = Math.min((nwGoalBase / s.goal) * 100, 100);
    document.getElementById('progress-bar').style.width = progress + "%";
    document.getElementById('progress-text').innerText = progress.toFixed(1) + "% of Goal Reached";
}



function updatePie(t) {
    const tot = t.liq + t.fix + t.stk; 
    if(tot <= 0) return;
    const pL = (t.liq/tot)*100, pF = (t.fix/tot)*100, pS = (t.stk/tot)*100;
    document.getElementById('allocation-pie').style.background = `conic-gradient(#818cf8 0% ${pL}%, #c084fc ${pL}% ${pL+pF}%, #4ade80 ${pL+pF}% 100%)`;
    document.getElementById('chart-legend').innerHTML = `
        <div style="color:#818cf8">Liquid: ${pL.toFixed(1)}%</div>
        <div style="color:#c084fc">Fixed: ${pF.toFixed(1)}%</div>
        <div style="color:#4ade80">Equities: ${pS.toFixed(1)}%</div>`;
}

/* --- HELPER FUNCTIONS --- */
function renderSection(cat, tableId, rowFn) {
    document.querySelector(`#${tableId} tbody`).innerHTML = db[cat].map(item => `
        <tr>${rowFn(item)}<td>
            <button class="btn-edit" onclick="openModal('${cat}',${item.id})">Edit</button>
            <button class="btn-del" onclick="del('${cat}',${item.id})">✕</button>
        </td></tr>`).join('');
}

function del(cat, id) { 
    db[cat] = db[cat].filter(x => x.id !== id); 
    save(); 
    refreshAll(false); 
}

function val(id) { return document.getElementById(id).value; }
function fVal(id) { return parseFloat(document.getElementById(id).value) || 0; }
function set(id, v) { document.getElementById(id).value = v; }
function setupForm(id, fn) { 
    document.getElementById(id).onsubmit = (e) => { 
        e.preventDefault(); 
        fn(); 
        save(); 
        refreshAll(false); 
        e.target.reset(); 
    }; 
}
function syncSettings() {
    db.settings = { 
        masterCurr: val('master-currency'), goal: fVal('target-goal'), goalCurr: val('goal-curr'), 
        years: fVal('years-to-goal'), inflation: fVal('inflation-rate'), stkGrowth: fVal('stock-growth'), 
        income: fVal('income-val'), incomeFreq: val('income-freq'), incomeCurr: val('income-curr') 
    };
    save();
}
function save() { 
    Object.keys(db).forEach(key => localStorage.setItem(`w_${key}`, JSON.stringify(db[key]))); 
}
