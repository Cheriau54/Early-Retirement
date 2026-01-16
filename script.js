/**
 * WEALTH AUDITOR PRO - CORE ENGINE
 * Logic: Swiss Banking Standard, Weighted Average Cost Basis, 
 * Multi-Currency Pivot, and Persistent State.
 */

// --- 1. CONFIGURATION & STATE ---
const CONFIG = {
    CURRENCIES: ['HKD', 'USD', 'EUR', 'CNY', 'GBP', 'JPY', 'AUD', 'SGD', 'CAD', 'KRW'],
    // Mock Rates - In a production env, these would be fetched from ExchangeRate-API
    RATES: { 
        USD: 1, HKD: 7.82, EUR: 0.92, CNY: 7.19, GBP: 0.79, 
        JPY: 150.21, AUD: 1.53, SGD: 1.35, CAD: 1.36, KRW: 1335.50 
    }
};

let state = {
    masterCurrency: 'USD',
    liquid: [],      // {id, name, amount, currency}
    fixed: [],       // {id, inst, principal, rate, months, start, currency}
    equities: [],    // {id, ticker, qty, avgBuyUSD, livePriceUSD}
    liabilities: [], // {id, source, amount, currency}
    audit: {
        goal: 0, goalCurr: 'USD', horizon: 0, income: 0, 
        incomeCurr: 'USD', inflation: 3.0, growth: 8.0
    }
};

// --- 2. UTILITIES: FORMATTING & MATH ---

// Professional Digit Grouping Separator (e.g., 1,250,000.00)
const formatNum = (num) => {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
};

const convert = (amount, from, to) => {
    if (from === to) return amount;
    const baseAmount = amount / CONFIG.RATES[from]; // Convert to USD base
    return baseAmount * CONFIG.RATES[to];          // Convert to Target
};

// --- 3. UI REFRESH: TABLES & ACCUMULATORS ---

const refreshUI = () => {
    updateAccumulators();
    renderLiquid();
    renderFixed();
    renderEquities();
    renderLiabilities();
    // Audit and Chart logic in Part 2
    if (window.updateAuditResults) window.updateAuditResults(); 
    if (window.renderPieChart) window.renderPieChart();
};

const updateAccumulators = () => {
    const sum = (arr, type) => arr.reduce((acc, item) => {
        let val = 0;
        if (type === 'liquid' || type === 'liabilities') val = convert(item.amount, item.currency, state.masterCurrency);
        if (type === 'fixed') {
            const interest = item.principal * (item.rate / 100) * (item.months / 12);
            val = convert(item.principal + interest, item.currency, state.masterCurrency);
        }
        if (type === 'equities') val = convert(item.qty * item.livePriceUSD, 'USD', state.masterCurrency);
        return acc + val;
    }, 0);

    const liqTotal = sum(state.liquid, 'liquid');
    const fixTotal = sum(state.fixed, 'fixed');
    const eqTotal = sum(state.equities, 'equities');
    const debtTotal = sum(state.liabilities, 'liabilities');

    document.getElementById('total-01').textContent = formatNum(liqTotal);
    document.getElementById('total-02').textContent = formatNum(fixTotal);
    document.getElementById('total-03').textContent = formatNum(eqTotal);
    document.getElementById('total-04').textContent = formatNum(debtTotal);

    const netWorth = liqTotal + fixTotal + eqTotal - debtTotal;
    document.getElementById('display-total-net-worth').textContent = formatNum(netWorth);
    document.getElementById('display-total-net-worth').className = netWorth >= 0 ? 'green' : 'red';
};

// --- 4. SECTIONAL RENDERING ---

const renderLiquid = () => {
    const tbody = document.querySelector('#table-01 tbody');
    tbody.innerHTML = '';
    state.liquid.forEach(item => {
        const masterVal = convert(item.amount, item.currency, state.masterCurrency);
        tbody.innerHTML += `
            <tr>
                <td>${item.name}</td>
                <td>${formatNum(item.amount)} ${item.currency}</td>
                <td>${formatNum(masterVal)} ${state.masterCurrency}</td>
                <td>
                    <button class="btn-edit" onclick="openEditModal('liquid', '${item.id}')">Edit</button>
                    <button class="btn-delete" onclick="deleteItem('liquid', '${item.id}')">Delete</button>
                </td>
            </tr>`;
    });
};

const renderEquities = () => {
    const tbody = document.querySelector('#table-03 tbody');
    tbody.innerHTML = '';
    let totalPL = 0;
    state.equities.forEach(item => {
        const marketVal = item.qty * item.livePriceUSD;
        const costBasis = item.qty * item.avgBuyUSD;
        const pl = marketVal - costBasis;
        const plPct = (pl / costBasis) * 100;
        totalPL += pl;

        tbody.innerHTML += `
            <tr>
                <td style="font-weight:700">${item.ticker}</td>
                <td>${item.qty}</td>
                <td>${formatNum(item.avgBuyUSD)}</td>
                <td>${formatNum(item.livePriceUSD)}</td>
                <td>${formatNum(marketVal)}</td>
                <td class="${pl >= 0 ? 'green' : 'red'}">${formatNum(pl)}</td>
                <td class="${pl >= 0 ? 'green' : 'red'}">${plPct.toFixed(2)}%</td>
                <td>
                    <button class="btn-edit" onclick="openEditModal('equities', '${item.id}')">Edit</button>
                    <button class="btn-delete" onclick="deleteItem('equities', '${item.id}')">Delete</button>
                </td>
            </tr>`;
    });
    document.getElementById('equities-pl-usd').textContent = formatNum(totalPL);
    document.getElementById('equities-pl-usd').className = totalPL >= 0 ? 'green' : 'red';
};

// --- 5. ADD & MERGE LOGIC ---

// Section 01: Liquid Merge Logic
document.getElementById('form-01').onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById('in-01-name').value;
    const amount = parseFloat(document.getElementById('in-01-amount').value);
    const currency = document.getElementById('in-01-curr').value;

    const existing = state.liquid.find(i => i.name === name && i.currency === currency);
    if (existing) {
        existing.amount += amount;
    } else {
        state.liquid.push({ id: Date.now().toString(), name, amount, currency });
    }
    e.target.reset();
    refreshUI();
};

// Section 03: Weighted Average Cost Basis Logic
document.getElementById('form-03').onsubmit = (e) => {
    e.preventDefault();
    const ticker = document.getElementById('in-03-ticker').value.toUpperCase();
    const qty = parseFloat(document.getElementById('in-03-qty').value);
    const buy = parseFloat(document.getElementById('in-03-buy').value);

    const existing = state.equities.find(i => i.ticker === ticker);
    if (existing) {
        const totalQty = existing.qty + qty;
        existing.avgBuyUSD = ((existing.qty * existing.avgBuyUSD) + (qty * buy)) / totalQty;
        existing.qty = totalQty;
    } else {
        state.equities.push({ 
            id: Date.now().toString(), ticker, qty, avgBuyUSD: buy, 
            livePriceUSD: buy * 1.05 // Simulating live price for now
        });
    }
    e.target.reset();
    refreshUI();
};

// --- GLOBAL PIVOT ---
document.getElementById('master-currency').onchange = (e) => {
    state.masterCurrency = e.target.value;
    refreshUI();
};
// --- 6. AUDIT ENGINE: CAPITAL GAP ANALYSIS ---

window.updateAuditResults = () => {
    const g = state.audit;
    const reportArea = document.getElementById('audit-report');
    
    // Future Value Projections
    const years = g.horizon || 0;
    const inf = g.inflation / 100;
    const mGrowth = g.growth / 100;

    const curLiqMaster = state.liquid.reduce((acc, i) => acc + convert(i.amount, i.currency, state.masterCurrency), 0);
    const curFixMaster = state.fixed.reduce((acc, i) => {
        const maturity = i.principal + (i.principal * (i.rate/100) * (i.months/12));
        return acc + convert(maturity, i.currency, state.masterCurrency);
    }, 0);
    const curEqMaster = state.equities.reduce((acc, i) => acc + convert(i.qty * i.livePriceUSD, 'USD', state.masterCurrency), 0);

    // Compound Interest Formula: FV = PV * (1 + r)^n
    // For Liquid: Projected against inflation only (losing value)
    const fvLiq = curLiqMaster * Math.pow(1 - inf, years);
    const fvFix = curFixMaster; // Already calculated to maturity
    const fvEq = curEqMaster * Math.pow(1 + (mGrowth - inf), years);
    const totalFV = fvLiq + fvFix + fvEq;

    const goalMaster = convert(g.goal, g.goalCurr, state.masterCurrency);
    const gap = goalMaster - totalFV;
    const isSufficient = gap <= 0;

    // Monthly Funding Requirement (Savings Gap)
    // PMT = (Gap * r) / ((1 + r)^n - 1)
    const monthlyRate = (mGrowth - inf) / 12;
    const months = years * 12;
    const reqMonthly = gap > 0 ? (gap * monthlyRate) / (Math.pow(1 + monthlyRate, months) - 1) : 0;

    reportArea.innerHTML = `
        <div class="audit-breakdown">
            <p>01. Projected Liquid: ${formatNum(fvLiq)}</p>
            <p>02. Projected Fixed: ${formatNum(fvFix)}</p>
            <p>03. Projected Equities: ${formatNum(fvEq)}</p>
            <hr>
            <p><strong>Total Projected FV: ${formatNum(totalFV)}</strong></p>
            <p>Capital Gap: <span class="${gap > 0 ? 'red' : 'green'}">${formatNum(gap)}</span></p>
            <h3>Status: ${isSufficient ? '[SUFFICIENT]' : '[INSUFFICIENT]'}</h3>
            <p>Required Extra Monthly Savings: <strong>${formatNum(reqMonthly)} ${state.masterCurrency}</strong></p>
        </div>
    `;

    generateAIAdvice(isSufficient, gap, totalFV, goalMaster);
    updateProgressBar(totalFV, goalMaster);
};

// --- 7. IN-DEPTH AI ADVICE ENGINE ---

const generateAIAdvice = (sufficient, gap, fv, goal) => {
    const adviceBox = document.getElementById('ai-advice-text');
    if (sufficient) {
        adviceBox.innerHTML = "Financial objective secured. Recommendation: Reallocate excess towards low-volatility ETFs or high-yield KRW/USD bonds to preserve capital. Current portfolio has high Capital Sufficiency.";
    } else {
        const pct = (fv / goal) * 100;
        adviceBox.innerHTML = `Your current path covers ${pct.toFixed(1)}% of your goal. 
            <strong>Strategic Reallocation:</strong> Move 25% of Liquid assets into S&P 500 Index funds or Quality Growth stocks (Technology/Healthcare sectors) to outpace the ${state.audit.inflation}% inflation rate. Consider increasing equity risk or extending horizon by ${Math.ceil(gap / (state.audit.income * 12))} years.`;
    }
};

// --- 8. PIE CHART WITH DIRECT LABELS ---

window.renderPieChart = () => {
    const liq = state.liquid.reduce((acc, i) => acc + convert(i.amount, i.currency, state.masterCurrency), 0);
    const fix = state.fixed.reduce((acc, i) => acc + convert(i.principal, i.currency, state.masterCurrency), 0);
    const eq = state.equities.reduce((acc, i) => acc + convert(i.qty * i.livePriceUSD, 'USD', state.masterCurrency), 0);
    const total = liq + fix + eq;

    if (total === 0) return;

    const pLiq = (liq / total) * 100;
    const pFix = (fix / total) * 100;
    const pEq = (eq / total) * 100;

    const visual = document.getElementById('composition-pie-visual');
    visual.style.background = `conic-gradient(
        #4ade80 0% ${pLiq}%, 
        #818cf8 ${pLiq}% ${pLiq + pFix}%, 
        #fbbf24 ${pLiq + pFix}% 100%
    )`;

    // Direct Label Overlay
    const labels = document.getElementById('direct-labels-overlay');
    labels.innerHTML = `
        <div class="pie-label" style="top:25%; left:75%">01: ${pLiq.toFixed(0)}%</div>
        <div class="pie-label" style="top:75%; left:75%">02: ${pFix.toFixed(0)}%</div>
        <div class="pie-label" style="top:50%; left:25%">03: ${pEq.toFixed(0)}%</div>
    `;
};

// --- 9. PERSISTENCE & MODALS ---

document.getElementById('save-all-btn').onclick = () => {
    localStorage.setItem('wealthState', JSON.stringify(state));
    alert('Portfolio Data Secured to LocalStorage.');
};

document.getElementById('wipe-all-btn').onclick = () => {
    if (confirm("DANGER: This will permanently erase all auditor data. Proceed?")) {
        localStorage.clear();
        location.reload();
    }
};

// Initial Load
window.onload = () => {
    const saved = localStorage.getItem('wealthState');
    if (saved) state = JSON.parse(saved);
    refreshUI();
};
