const FX_API_KEY = '393a43661559351810312743';
const STOCK_API_KEY = 'RCOIHB62BAXECU2U';

let mySavings = JSON.parse(localStorage.getItem('mySavings')) || [];
let myStocks = JSON.parse(localStorage.getItem('myStocks')) || [];
let myDebts = JSON.parse(localStorage.getItem('myDebts')) || [];
let userSettings = JSON.parse(localStorage.getItem('userSettings')) || { target: 1000000, years: 20, return: 7, salary: 0 };

const delay = ms => new Promise(res => setTimeout(res, ms));

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('target-goal').value = userSettings.target;
    document.getElementById('years-to-goal').value = userSettings.years;
    document.getElementById('annual-return').value = userSettings.return;
    document.getElementById('monthly-salary').value = userSettings.salary;
    
    initDashboard();
    setupListeners();
});

function setupListeners() {
    document.getElementById('bank-form').onsubmit = (e) => {
        e.preventDefault();
        const name = document.getElementById('bank-name').value.trim();
        const amount = parseFloat(document.getElementById('bank-amount').value);
        const curr = document.getElementById('bank-currency').value;
        const exists = mySavings.find(a => a.name.toLowerCase() === name.toLowerCase() && a.currency === curr);
        if(exists) exists.amount += amount; else mySavings.push({name, amount, currency: curr});
        save();
    };

    document.getElementById('debt-form').onsubmit = (e) => {
        e.preventDefault();
        const name = document.getElementById('card-name').value.trim();
        const amount = parseFloat(document.getElementById('card-amount').value);
        const exists = myDebts.find(d => d.name.toLowerCase() === name.toLowerCase());
        if(exists) exists.amount += amount; else myDebts.push({name, amount});
        save();
    };

    document.getElementById('stock-form').onsubmit = (e) => {
        e.preventDefault();
        const symbol = document.getElementById('stock-ticker').value.toUpperCase().trim();
        const shares = parseFloat(document.getElementById('stock-shares').value);
        const price = parseFloat(document.getElementById('stock-buy-price').value);
        const exists = myStocks.find(s => s.symbol === symbol);
        if(exists) {
            const totalCost = (exists.shares * exists.avgPrice) + (shares * price);
            exists.shares += shares;
            exists.avgPrice = totalCost / exists.shares;
        } else {
            myStocks.push({symbol, shares, avgPrice: price});
        }
        save();
    };

    document.getElementById('save-salary-btn').onclick = () => {
        userSettings.salary = parseFloat(document.getElementById('monthly-salary').value) || 0;
        localStorage.setItem('userSettings', JSON.stringify(userSettings));
        location.reload();
    };

    document.getElementById('save-settings-btn').onclick = () => {
        userSettings.target = parseFloat(document.getElementById('target-goal').value);
        userSettings.years = parseFloat(document.getElementById('years-to-goal').value);
        userSettings.return = parseFloat(document.getElementById('annual-return').value);
        localStorage.setItem('userSettings', JSON.stringify(userSettings));
        location.reload();
    };

    document.getElementById('reset-btn').onclick = () => { if(confirm("Clear all data?")) { localStorage.clear(); location.reload(); }};
    document.getElementById('save-edit-btn').onclick = saveEdit;
}

async function initDashboard() {
    try {
        const fxRes = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API_KEY}/latest/EUR`);
        const fxData = await fxRes.json();
        const rates = fxData.conversion_rates;
        let currentWealth = 0;

        // Assets
        const list = document.getElementById('savings-list');
        list.innerHTML = '<h4>Assets</h4>';
        mySavings.forEach((acc, i) => {
            currentWealth += (acc.amount / rates[acc.currency]);
            list.innerHTML += `<div class="account-row"><span>${acc.name} (${acc.currency})</span><span>${acc.amount.toLocaleString()} <button onclick="openEdit(${i}, 'savings')" class="action-btn edit-btn">Edit</button></span></div>`;
        });

        // Debts
        if(myDebts.length > 0) list.innerHTML += '<h4 style="margin-top:20px;">Liabilities</h4>';
        myDebts.forEach((debt, i) => {
            currentWealth -= (debt.amount / rates.HKD);
            list.innerHTML += `<div class="debt-row"><span>${debt.name}</span><span>-${debt.amount.toLocaleString()} HKD <button onclick="openEdit(${i}, 'debt')" class="action-btn edit-btn">Edit</button></span></div>`;
        });

        // Stocks
        const stockBody = document.getElementById('stock-body');
        stockBody.innerHTML = '<tr><td colspan="5">Fetching live prices...</td></tr>';
        let stockHtml = '';
        for (let [i, s] of myStocks.entries()) {
            const sRes = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s.symbol}&apikey=${STOCK_API_KEY}`);
            const sData = await sRes.json();
            const livePrice = parseFloat(sData["Global Quote"]?.["05. price"]) || s.avgPrice;
            
            const currentValUsd = s.shares * livePrice;
            const costBasis = s.shares * s.avgPrice;
            const profit = currentValUsd - costBasis;
            currentWealth += (currentValUsd / rates.USD);

            stockHtml += `<tr>
                <td><strong>${s.symbol}</strong><br><small>${s.shares} Shrs</small></td>
                <td>$${s.avgPrice.toFixed(2)}</td>
                <td style="color: #38bdf8;">$${livePrice.toFixed(2)}</td>
                <td style="color:${profit >= 0 ? '#4ade80' : '#fb7185'}">$${profit.toFixed(0)}<br><small>${((profit/costBasis)*100).toFixed(1)}%</small></td>
                <td><button onclick="openEdit(${i}, 'stock')" class="action-btn edit-btn">Edit</button></td>
            </tr>`;
            if (myStocks.length > 1) await delay(400); 
        }
        stockBody.innerHTML = stockHtml || '<tr><td colspan="5">No stocks found.</td></tr>';

        document.getElementById('total-net-worth').innerText = `€${currentWealth.toLocaleString(undefined, {maximumFractionDigits:0})}`;
        runLogicalPlanner(currentWealth);

    } catch(e) { console.error(e); }
}

function runLogicalPlanner(wealth) {
    const target = userSettings.target;
    const years = userSettings.years;
    const monthlyRate = (userSettings.return / 100) / 12;
    const months = years * 12;

    const futureValueAssets = wealth * Math.pow(1 + monthlyRate, months);
    const gap = Math.max(0, target - futureValueAssets);
    const monthlyNeeded = gap > 0 ? gap / ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) : 0;
    const progress = Math.min((wealth / target) * 100, 100);

    // Update Progress UI
    document.getElementById('goal-progress-bar').style.width = `${progress}%`;
    document.getElementById('progress-percent').innerText = `${progress.toFixed(1)}% Achieved`;

    // Render Logic Breakdown
    document.getElementById('logic-breakdown').innerHTML = `
        <div class="logic-item"><span>Target Goal:</span><span>€${target.toLocaleString()}</span></div>
        <div class="logic-item"><span>Current Accumulated Wealth:</span><span>-€${wealth.toLocaleString(undefined, {maximumFractionDigits:0})}</span></div>
        <div class="logic-item"><span>Compounded Growth (Estimated):</span><span>-€${(futureValueAssets - wealth).toLocaleString(undefined, {maximumFractionDigits:0})}</span></div>
        <div class="logic-item logic-total"><span>Remaining Gap to Fund:</span><span>€${gap.toLocaleString(undefined, {maximumFractionDigits:0})}</span></div>
    `;

    const canAfford = userSettings.salary >= monthlyNeeded;
    document.getElementById('calculator-result').innerHTML = `
        <div class="status-msg ${canAfford ? 'status-good' : 'status-bad'}">
            <h2 style="margin:0">€${monthlyNeeded.toLocaleString(undefined, {maximumFractionDigits:0})} / Month</h2>
            <p>${canAfford ? 'This goal is achievable.' : 'Goal exceeds current income.'}</p>
            <small>Surplus income: €${(userSettings.salary - monthlyNeeded).toLocaleString(undefined, {maximumFractionDigits:0})}</small>
        </div>`;
}

// Modal Handlers
window.openEdit = (idx, type) => {
    const modal = document.getElementById('edit-modal');
    const fields = document.getElementById('edit-fields');
    document.getElementById('edit-index').value = idx;
    document.getElementById('edit-type').value = type;
    fields.innerHTML = '';
    let item = type === 'savings' ? mySavings[idx] : type === 'debt' ? myDebts[idx] : myStocks[idx];
    if(type === 'stock') {
        fields.innerHTML = `<label>Shares</label><input type="number" id="upd-1" value="${item.shares}"><label>Avg Price</label><input type="number" id="upd-2" value="${item.avgPrice}">`;
    } else {
        fields.innerHTML = `<label>Name</label><input type="text" id="upd-name" value="${item.name}"><label>Amount</label><input type="number" id="upd-1" value="${item.amount}">`;
    }
    modal.style.display = 'flex';
};

window.closeModal = () => document.getElementById('edit-modal').style.display = 'none';

function saveEdit() {
    const idx = document.getElementById('edit-index').value;
    const type = document.getElementById('edit-type').value;
    const v1 = document.getElementById('upd-1').value;
    if(type === 'stock') {
        myStocks[idx].shares = parseFloat(v1);
        myStocks[idx].avgPrice = parseFloat(document.getElementById('upd-2').value);
    } else if(type === 'savings') {
        mySavings[idx].name = document.getElementById('upd-name').value;
        mySavings[idx].amount = parseFloat(v1);
    } else if(type === 'debt') {
        myDebts[idx].name = document.getElementById('upd-name').value;
        myDebts[idx].amount = parseFloat(v1);
    }
    save();
}

function save() {
    localStorage.setItem('mySavings', JSON.stringify(mySavings));
    localStorage.setItem('myDebts', JSON.stringify(myDebts));
    localStorage.setItem('myStocks', JSON.stringify(myStocks));
    location.reload();
}
