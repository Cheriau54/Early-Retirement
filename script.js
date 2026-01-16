/**
 * WEALTH AUDITOR PRO - script.js
 * FINAL UNTRIMMED PRODUCTION VERSION
 */

// --- 1. GLOBAL CONFIGURATION & STATE ---
const CONFIG = {
    CURRENCIES: ['HKD', 'USD', 'EUR', 'CNY', 'GBP', 'JPY', 'AUD', 'SGD', 'CAD', 'KRW'],
    RATES: { 
        USD: 1, HKD: 7.82, EUR: 0.92, CNY: 7.19, GBP: 0.79, 
        JPY: 150.21, AUD: 1.53, SGD: 1.35, CAD: 1.36, KRW: 1335.50 
    }
};

let state = {
    masterCurrency: 'USD',
    liquid: [],      
    fixed: [],       
    equities: [],    
    liabilities: [], 
    audit: {
        goal: 0, goalCurr: 'USD', horizon: 0, income: 0, 
        incomeCurr: 'USD', inflation: 3.0, growth: 8.0
    }
};

// --- 2. FORMATTING UTILITIES ---

/** Professional Digit Grouping (e.g., 1,250,000.00) */
const formatNum = (num) => {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
};

const convert = (amount, from, to) => {
    if (!from || !to || from === to) return amount;
    const baseAmount = amount / CONFIG.RATES[from]; 
    return baseAmount * CONFIG.RATES[to];
};

// --- 3. UI RENDERING ENGINE ---

function refreshUI() {
    updateAccumulators();
    renderLiquidTable();
    renderFixedTable();
    renderEquitiesTable();
    renderLiabilitiesTable();
    renderPieChart();
    updateProgressBarOnly();
}

function updateAccumulators() {
    const liqTotal = state.liquid.reduce((acc, i) => acc + convert(i.amount, i.currency, state.masterCurrency), 0);
    
    const fixTotal = state.fixed.reduce((acc, i) => {
        const interest = i.principal * (i.rate / 100) * (i.months / 12);
        return acc + convert(i.principal + interest, i.currency, state.masterCurrency);
    }, 0);
    
    const eqTotal = state.equities.reduce((acc, i) => acc + convert(i.qty * i.livePriceUSD, 'USD', state.masterCurrency), 0);
    
    const debtTotal = state.liabilities.reduce((acc, i) => acc + convert(i.amount, i.currency, state.masterCurrency), 0);

    document.getElementById('total-01').textContent = formatNum(liqTotal);
    document.getElementById('total-02').textContent = formatNum(fixTotal);
    document.getElementById('total-03').textContent = formatNum(eqTotal);
    document.getElementById('total-04').textContent = formatNum(debtTotal);

    const netWorth = liqTotal + fixTotal + eqTotal - debtTotal;
    const nwDisplay = document.getElementById('display-total-net-worth');
    if (nwDisplay) {
        nwDisplay.textContent = formatNum(netWorth);
        nwDisplay.className = netWorth >= 0 ? 'green' : 'red';
    }
}

function renderLiquidTable() {
    const tbody = document.querySelector('#table-01 tbody');
    if (!tbody) return;
    tbody.innerHTML = state.liquid.map(item => {
        const masterVal = convert(item.amount, item.currency, state.masterCurrency);
        return `
            <tr>
                <td>${item.name}</td>
                <td>${formatNum(item.amount)} ${item.currency}</td>
                <td>${formatNum(masterVal)} ${state.masterCurrency}</td>
                <td>
                    <button class="btn-utility" onclick="deleteItem('liquid', '${item.id}')">Del</button>
                </td>
            </tr>`;
    }).join('');
}

function renderFixedTable() {
    const tbody = document.querySelector('#table-02 tbody');
    if (!tbody) return;
    tbody.innerHTML = state.fixed.map(item => {
        const interest = item.principal * (item.rate / 100) * (item.months / 12);
        return `
            <tr>
                <td>${item.inst}</td>
                <td>${formatNum(item.principal)}</td>
                <td>${item.rate}%</td>
                <td>${item.start}</td>
                <td>${formatNum(interest)}</td>
                <td>${formatNum(item.principal + interest)}</td>
                <td>
                    <button class="btn-utility" onclick="deleteItem('fixed', '${item.id}')">Del</button>
                </td>
            </tr>`;
    }).join('');
}

function renderEquitiesTable() {
    const tbody = document.querySelector('#table-03 tbody');
    if (!tbody) return;
    let totalPL = 0;
    tbody.innerHTML = state.equities.map(item => {
        const marketVal = item.qty * item.livePriceUSD;
        const costBasis = item.qty * item.avgBuyUSD;
        const pl = marketVal - costBasis;
        const plPct = (pl / costBasis) * 100;
        totalPL += pl;

        return `
            <tr>
                <td style="font-weight:700">${item.ticker}</td>
                <td>${item.qty}</td>
                <td>${formatNum(item.avgBuyUSD)}</td>
                <td>${formatNum(item.livePriceUSD)}</td>
                <td>${formatNum(marketVal)}</td>
                <td class="${pl >= 0 ? 'green' : 'red'}">${formatNum(pl)}</td>
                <td class="${pl >= 0 ? 'green' : 'red'}">${plPct.toFixed(2)}%</td>
                <td>
                    <button class="btn-utility" onclick="deleteItem('equities', '${item.id}')">Del</button>
                </td>
            </tr>`;
    }).join('');
    const plEl = document.getElementById('equities-pl-usd');
    if (plEl) {
        plEl.textContent = formatNum(totalPL);
        plEl.className = totalPL >= 0 ? 'green' : 'red';
    }
}

function renderLiabilitiesTable() {
    const tbody = document.querySelector('#table-04 tbody');
    if (!tbody) return;
    tbody.innerHTML = state.liabilities.map(item => {
        const masterVal = convert(item.amount, item.currency, state.masterCurrency);
        return `
            <tr>
                <td>${item.source}</td>
                <td>${formatNum(item.amount)} ${item.currency}</td>
                <td>${formatNum(masterVal)} ${state.masterCurrency}</td>
                <td>
                    <button class="btn-utility" onclick="deleteItem('liabilities', '${item.id}')">Del</button>
                </td>
            </tr>`;
    }).join('');
}

// --- 4. FORM HANDLERS & MERGE LOGIC ---

document.getElementById('form-01')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('in-01-name').value;
    const amount = parseFloat(document.getElementById('in-01-amount').value);
    const curr = document.getElementById('in-01-curr').value;

    const existing = state.liquid.find(i => i.name.toLowerCase() === name.toLowerCase() && i.currency === curr);
    if (existing) {
        existing.amount += amount;
    } else {
        state.liquid.push({ id: Date.now().toString(), name, amount, currency: curr });
    }
    this.reset();
    refreshUI();
});

document.getElementById('form-02')?.addEventListener('submit', function(e) {
    e.preventDefault();
    state.fixed.push({
        id: Date.now().toString(),
        inst: document.getElementById('in-02-inst').value,
        principal: parseFloat(document.getElementById('in-02-princ').value),
        rate: parseFloat(document.getElementById('in-02-rate').value),
        months: parseInt(document.getElementById('in-02-months').value),
        start: document.getElementById('in-02-start').value,
        currency: document.getElementById('in-02-curr').value
    });
    this.reset();
    refreshUI();
});

document.getElementById('form-03')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const ticker = document.getElementById('in-03-ticker').value.toUpperCase();
    const qty = parseFloat(document.getElementById('in-03-qty').value);
    const buy = parseFloat(document.getElementById('in-03-buy').value);

    const existing = state.equities.find(i => i.ticker === ticker);
    if (existing) {
        existing.avgBuyUSD = ((existing.qty * existing.avgBuyUSD) + (qty * buy)) / (existing.qty + qty);
        existing.qty += qty;
    } else {
        state.equities.push({ id: Date.now().toString(), ticker, qty, avgBuyUSD: buy, livePriceUSD: buy * 1.05 });
    }
    this.reset();
    refreshUI();
});

document.getElementById('form-04')?.addEventListener('submit', function(e) {
    e.preventDefault();
    state.liabilities.push({
        id: Date.now().toString(),
        source: document.getElementById('in-04-source').value,
        amount: parseFloat(document.getElementById('in-04-amount').value),
        currency: document.getElementById('in-04-curr').value
    });
    this.reset();
    refreshUI();
});

// --- 5. AUDIT ENGINE & PROGRESS BAR ---

document.getElementById('run-audit-btn')?.addEventListener('click', function() {
    const goalVal = parseFloat(document.getElementById('audit-goal-val').value) || 0;
    const goalCurr = document.getElementById('audit-goal-curr').value;
    const horizon = parseInt(document.getElementById('audit-years').value) || 0;
    const infRate = (parseFloat(document.getElementById('audit-inflation').value) || 0) / 100;
    const growthRate = (parseFloat(document.getElementById('audit-growth').value) || 0) / 100;

    state.audit = { goal: goalVal, goalCurr, horizon, inflation: infRate*100, growth: growthRate*100 };

    const curNW = parseFloat(document.getElementById('display-total-net-worth').textContent.replace(/,/g, ''));
    const fv = curNW * Math.pow(1 + (growthRate - infRate), horizon);
    const targetMaster = convert(goalVal, goalCurr, state.masterCurrency);
    
    const gap = targetMaster - fv;
    const isSufficient = gap <= 0;

    document.getElementById('audit-report').innerHTML = `
        <div class="audit-breakdown">
            <p>Target Goal (Master): <span>${formatNum(targetMaster)}</span></p>
            <p>Projected Net Worth (FV): <span>${formatNum(fv)}</span></p>
            <hr>
            <h3>Status: <span class="${isSufficient ? 'green' : 'red'}">${isSufficient ? '[SUFFICIENT]' : '[INSUFFICIENT]'}</span></h3>
            <p>Capital Gap: <span class="${gap > 0 ? 'red' : 'green'}">${formatNum(Math.abs(gap))}</span></p>
        </div>
    `;

    const adviceText = document.getElementById('ai-advice-text');
    if (isSufficient) {
        adviceText.innerHTML = "Goal secured. Recommendation: Maintain current allocation. Focus on <strong>Wealth Preservation</strong> through index ETFs.";
    } else {
        adviceText.innerHTML = `Gap of ${formatNum(gap)} detected. <strong>Advice:</strong> Shift 20% of Liquid assets into <strong>Technology or S&P 500 Index Funds</strong> to outpace ${infRate*100}% inflation.`;
    }

    updateProgressBarOnly();
});

function updateProgressBarOnly() {
    const curNW = parseFloat(document.getElementById('display-total-net-worth').textContent.replace(/,/g, '')) || 0;
    const targetMaster = convert(state.audit.goal, state.audit.goalCurr, state.masterCurrency) || 0;
    
    if (targetMaster > 0) {
        const pct = Math.min((curNW / targetMaster) * 100, 100);
        document.getElementById('progress-fill-bar').style.width = pct + '%';
        document.getElementById('prog-percent-text').textContent = pct.toFixed(1) + '% Achieved';
        document.getElementById('prog-val-current').textContent = `Current: ${formatNum(curNW)}`;
        document.getElementById('prog-val-goal').textContent = `Target: ${formatNum(targetMaster)}`;
    }
}

// --- 6. PIE CHART WITH DIRECT LABELS ---

function renderPieChart() {
    const liq = state.liquid.reduce((acc, i) => acc + convert(i.amount, i.currency, state.masterCurrency), 0);
    const fix = state.fixed.reduce((acc, i) => acc + convert(i.principal, i.currency, state.masterCurrency), 0);
    const eq = state.equities.reduce((acc, i) => acc + convert(i.qty * i.livePriceUSD, 'USD', state.masterCurrency), 0);
    const total = liq + fix + eq;

    if (total === 0) return;

    const pL = (liq / total) * 100;
    const pF = (fix / total) * 100;
    const pE = (eq / total) * 100;

    const visual = document.getElementById('composition-pie-visual');
    if (visual) {
        visual.style.background = `conic-gradient(
            #4ade80 0% ${pL}%, 
            #818cf8 ${pL}% ${pL + pF}%, 
            #fbbf24 ${pL + pF}% 100%
        )`;
    }

    const overlay = document.getElementById('direct-labels-overlay');
    if (overlay) {
        overlay.innerHTML = `
            <div class="pie-label" style="top:25%; left:75%">Liquid: ${pL.toFixed(0)}%</div>
            <div class="pie-label" style="top:75%; left:75%">Fixed: ${pF.toFixed(0)}%</div>
            <div class="pie-label" style="top:50%; left:25%">Equities: ${pE.toFixed(0)}%</div>
        `;
    }
}

// --- 7. CORE GLOBAL FUNCTIONS ---

function deleteItem(type, id) {
    state[type] = state[type].filter(i => i.id !== id);
    refreshUI();
}

document.getElementById('master-currency')?.addEventListener('change', (e) => {
    state.masterCurrency = e.target.value;
    refreshUI();
});

document.getElementById('save-all-btn').onclick = () => {
    localStorage.setItem('wealthState', JSON.stringify(state));
    alert('Portfolio Data Saved.');
};

document.getElementById('wipe-all-btn').onclick = () => {
    if (confirm("Permanently delete all data?")) {
        localStorage.clear();
        location.reload();
    }
};

window.onload = () => {
    const saved = localStorage.getItem('wealthState');
    if (saved) state = JSON.parse(saved);
    const mc = document.getElementById('master-currency');
    if (mc) mc.value = state.masterCurrency;
    refreshUI();
};
