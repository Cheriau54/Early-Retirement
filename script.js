const FX_API = '393a43661559351810312743';
const STOCK_API = 'RCOIHB62BAXECU2U';
const CURRENCIES = ["HKD", "USD", "EUR", "CNY", "GBP", "JPY", "AUD", "SGD", "CAD"];

let db = {
    liquid: JSON.parse(localStorage.getItem('w_liquid')) || [],
    fixed: JSON.parse(localStorage.getItem('w_fixed')) || [],
    stocks: JSON.parse(localStorage.getItem('w_stocks')) || [],
    debt: JSON.parse(localStorage.getItem('w_debt')) || [],
    settings: JSON.parse(localStorage.getItem('w_settings')) || { 
        masterCurr: "HKD", goal: 1000000, goalCurr: "HKD", years: 10, income: 0, incomeFreq: "monthly", incomeCurr: "HKD", inflation: 2.5, stkGrowth: 7.0 
    }
};

let rates = {};

window.addEventListener('DOMContentLoaded', async () => {
    initUI();
    await refreshAll(true);
});

function initUI() {
    // Populate dropdowns across all forms
    document.querySelectorAll('.curr-list').forEach(s => CURRENCIES.forEach(c => s.add(new Option(c, c))));
    
    // Initial Setting Load
    const s = db.settings;
    set('master-currency', s.masterCurr); set('target-goal', s.goal); set('goal-curr', s.goalCurr);
    set('years-to-goal', s.years); set('inflation-rate', s.inflation); set('stock-growth', s.stkGrowth);
    set('income-val', s.income); set('income-freq', s.incomeFreq); set('income-curr', s.incomeCurr);

    // Global Listeners
    document.getElementById('master-currency').onchange = (e) => { 
        db.settings.masterCurr = e.target.value; 
        save(); 
        refreshAll(false); 
    };
    
    document.getElementById('save-all-btn').onclick = () => { 
        save(); 
        alert("Portfolio Data Synchronized!"); 
    };

    // Equities Specific Refresh Button
    document.getElementById('refresh-stocks-btn').onclick = async (e) => {
        const btn = e.target;
        btn.classList.add('loading');
        btn.innerText = "⏳ Updating...";
        await refreshAll(false, false); // force stock fetch
        btn.classList.remove('loading');
        btn.innerText = "↻ Refresh Live";
    };

    // --- FORM SUBMISSION LOGIC WITH SMART MERGE ---

    setupForm('form-liquid', () => {
        const n = val('liq-name'), a = fVal('liq-amount'), c = val('liq-curr');
        const idx = db.liquid.findIndex(i => i.name.toLowerCase() === n.toLowerCase() && i.currency === c);
        if(idx > -1) { 
            db.liquid[idx].amount += a; 
            db.liquid.unshift(db.liquid.splice(idx, 1)[0]); 
        } else { 
            db.liquid.unshift({id: Date.now(), name: n, amount: a, currency: c}); 
        }
    });

    setupForm('form-fixed', () => {
        db.fixed.unshift({ 
            id: Date.now(), name: val('fix-name'), principal: fVal('fix-amount'), 
            currency: val('fix-curr'), rate: fVal('fix-rate'), 
            duration: parseInt(val('fix-duration')), start: val('fix-start') 
        });
    });

    setupForm('form-stocks', () => {
        const t = val('stk-ticker').toUpperCase(), q = fVal('stk-qty'), b = fVal('stk-buy');
        const idx = db.stocks.findIndex(i => i.ticker === t);
        if(idx > -1) {
            const s = db.stocks[idx];
            // Calculate Weighted Average Buy Price
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
        if(confirm("Permanently wipe all system data?")) { 
            localStorage.clear(); 
            location.reload(); 
        }
    };
}

async function refreshAll(fullFetch = true, skipStocks = true) {
    const mCurr = db.settings.masterCurr;
    
    // REQUIREMENT: Update Currency labels in section headers
    document.querySelectorAll('.header-curr-label').forEach(el => el.innerText = mCurr);

    // Fetch Forex Rates
    try {
        const res = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API}/latest/${mCurr}`).then(r => r.json());
        rates = res.conversion_rates;
    } catch(e) { console.error("Forex Sync Failed"); }

    let t = { liq: 0, fix: 0, stk: 0, debt: 0, yield: 0 };

    // 1. Liquid Assets Calculation
    renderSection('liquid', 'table-liquid', (i) => {
        const mv = i.amount / rates[i.currency]; 
        t.liq += mv;
        return `<td>${i.name}</td><td>${i.amount.toLocaleString()} ${i.currency}</td><td>${mv.toFixed(0)}</td>`;
    });

    // 2. Fixed Savings Calculation
    renderSection('fixed', 'table-fixed', (i) => {
        const intr = i.principal * (i.rate/100) * (i.duration/12);
        const mv = (i.principal + intr) / rates[i.currency];
        const endD = new Date(new Date(i.start).setMonth(new Date(i.start).getMonth() + i.duration)).toISOString().split('T')[0];
        t.fix += mv; 
        t.yield += (mv * (i.rate/100));
        return `<td>${i.name}</td><td>${i.rate}%</td><td>${endD}</td><td class="surplus">${intr.toFixed(0)}</td><td>${(i.principal+intr).toFixed(0)}</td>`;
    });

    // 3. Equities Calculation (With AlphaVantage Integration)
    const sBody = document.querySelector('#table-stocks tbody'); 
    sBody.innerHTML = '';
    for (let s of db.stocks) {
        if(!skipStocks || !s.lastLive) {
            try {
                const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s.ticker}&apikey=${STOCK_API}`).then(r => r.json());
                s.lastLive = parseFloat(res["Global Quote"]?.["05. price"]) || s.buyPrice;
            } catch(e) { s.lastLive = s.buyPrice; }
        }
        // Stocks are calculated in USD context, then converted to Master Currency
        const mvMaster = (s.qty * s.lastLive) / rates.USD; 
        t.stk += mvMaster; 
        t.yield += (mvMaster * (db.settings.stkGrowth/100));
        
        const pl = (s.lastLive - s.buyPrice) * s.qty;
        sBody.innerHTML += `<tr><td>${s.ticker}</td><td>${s.qty}</td><td>$${s.buyPrice.toFixed(2)}</td><td>$${s.lastLive.toFixed(2)}</td><td class="${pl>=0?'surplus':'loss'}">${pl.toFixed(0)}</td><td><button class="btn-edit" onclick="edit('stocks',${s.id})">Edit</button><button class="btn-del" onclick="del('stocks',${s.id})">✕</button></td></tr>`;
    }

    // 4. Liabilities Calculation
    renderSection('debt', 'table-debt', (i) => {
        const mv = i.amount / rates[i.currency]; 
        t.debt += mv;
        return `<td>${i.name}</td><td class="loss">-${i.amount.toLocaleString()}</td><td>-${mv.toFixed(0)}</td>`;
    });

    // Master Consolidated Net Worth
    const nw = t.liq + t.fix + t.stk - t.debt;
    document.getElementById('total-net-worth').innerText = nw.toLocaleString(undefined, {max:0}) + " " + mCurr;
    
    // Update Section Accumulated Totals
    document.getElementById('acc-liq').innerText = t.liq.toFixed(0);
    document.getElementById('acc-fix').innerText = t.fix.toFixed(0);
    document.getElementById('acc-stk').innerText = t.stk.toFixed(0);
    document.getElementById('acc-debt').innerText = "-" + t.debt.toFixed(0);

    renderAudit(nw, t); 
    updatePie(t);
}

function renderSection(k, tid, rowFn) {
    document.querySelector(`#${tid} tbody`).innerHTML = db[k].map(i => `<tr>${rowFn(i)}<td><button class="btn-edit" onclick="edit('${k}',${i.id})">Edit</button><button class="btn-del" onclick="del('${k}',${i.id})">✕</button></td></tr>`).join('');
}

function renderAudit(nw, t) {
    const s = db.settings; 
    // Convert current Net Worth to Goal Currency for projection
    const nwInGoalCurr = (nw * rates[db.settings.masterCurr]) / rates[s.goalCurr]; 
    
    const totA = t.liq + t.fix + t.stk;
    const nY = totA > 0 ? (t.yield / totA) : 0;
    const rY = ((1 + nY) / (1 + (s.inflation/100))) - 1; // Real Yield Formula
    const r = rY / 12, n = s.years * 12;
    
    // Future Value Projection
    const fv = nwInGoalCurr * Math.pow(1 + r, n);
    const gap = Math.max(0, s.goal - fv);
    
    // PMT formula to find required savings
    const req = gap > 0 ? (gap * r) / (Math.pow(1 + r, n) - 1) : 0;
    
    let inc = (s.income / rates[s.incomeCurr]) * rates[s.goalCurr];
    if(s.incomeFreq === 'annual') inc /= 12;

    document.getElementById('logic-output').innerHTML = `
        <div class="audit-line"><span>Projected Real Yield (Inflation Adj.)</span><b>${(rY*100).toFixed(2)}%</b></div>
        <div class="audit-line"><span>Projected Portfolio (${s.years}y)</span><b>${fv.toLocaleString(undefined,{max:0})} ${s.goalCurr}</b></div>
        <div class="audit-line"><span>Target Gap</span><b class="loss">${gap.toLocaleString(undefined,{max:0})} ${s.goalCurr}</b></div>
        <div class="audit-line"><span>Monthly Savings Required</span><b class="surplus">${req.toLocaleString(undefined,{max:0})} ${s.goalCurr}</b></div>
        <div class="audit-line" style="border-top:1px solid #444;margin-top:10px;padding-top:10px"><span><b>Investment Surplus/Deficit</b></span><b class="${inc-req>=0?'surplus':'loss'}">${(inc-req).toLocaleString(undefined,{max:0})} ${s.goalCurr}</b></div>
    `;
    
    const prg = Math.min((nwInGoalCurr / s.goal) * 100, 100);
    document.getElementById('progress-bar').style.width = prg + "%";
    document.getElementById('progress-text').innerText = prg.toFixed(1) + "% of Goal Achieved";
}

function updatePie(t) {
    const tot = t.liq + t.fix + t.stk; 
    if(tot <= 0) return;
    const pL = (t.liq/tot)*100, pF = (t.fix/tot)*100, pS = (t.stk/tot)*100;
    document.getElementById('allocation-pie').style.background = `conic-gradient(#818cf8 0% ${pL}%, #c084fc ${pL}% ${pL+pF}%, #4ade80 ${pL+pF}% 100%)`;
    document.getElementById('chart-legend').innerHTML = `
        <div style="color:#818cf8">Liquid: ${pL.toFixed(1)}%</div>
        <div style="color:#c084fc">Fixed: ${pF.toFixed(1)}%</div>
        <div style="color:#4ade80">Equities: ${pS.toFixed(1)}%</div>
    `;
}

function edit(k, id) {
    const i = db[k].find(x => x.id === id);
    if(k === 'liquid') { set('liq-name', i.name); set('liq-amount', i.amount); set('liq-curr', i.currency); }
    else if(k === 'fixed') { set('fix-name', i.name); set('fix-amount', i.principal); set('fix-rate', i.rate); set('fix-duration', i.duration); set('fix-start', i.start); }
    else if(k === 'stocks') { set('stk-ticker', i.ticker); set('stk-qty', i.qty); set('stk-buy', i.buyPrice); }
    else if(k === 'debt') { set('debt-name', i.name); set('debt-amount', i.amount); set('debt-curr', i.currency); }
    del(k, id);
}

function del(k, id) { 
    db[k] = db[k].filter(x => x.id !== id); 
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
    Object.keys(db).forEach(k => localStorage.setItem(`w_${k}`, JSON.stringify(db[k]))); 
}
