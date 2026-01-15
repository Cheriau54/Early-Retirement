const FX_API_KEY = '393a43661559351810312743';

let mySavings = JSON.parse(localStorage.getItem('mySavings')) || [];
let myStocks = JSON.parse(localStorage.getItem('myStocks')) || [];
let myDebts = JSON.parse(localStorage.getItem('myDebts')) || [];
let userSettings = JSON.parse(localStorage.getItem('userSettings')) || { target: 500000, years: 10, return: 7, salary: 0, mpf: 0 };

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('target-goal').value = userSettings.target;
    document.getElementById('years-to-goal').value = userSettings.years;
    document.getElementById('annual-return').value = userSettings.return;
    document.getElementById('monthly-salary').value = userSettings.salary;
    document.getElementById('mpf-amount').value = userSettings.mpf;
    
    initDashboard();
    setupListeners();
});

function setupListeners() {
    // MERGE LOGIC: BANK
    document.getElementById('bank-form').onsubmit = (e) => {
        e.preventDefault();
        const name = document.getElementById('bank-name').value.trim();
        const amount = parseFloat(document.getElementById('bank-amount').value);
        const currency = document.getElementById('bank-currency').value;
        
        const existing = mySavings.find(a => a.name.toLowerCase() === name.toLowerCase() && a.currency === currency);
        if (existing) {
            existing.amount += amount;
        } else {
            mySavings.push({ name, amount, currency });
        }
        saveAndReload();
    };

    // MERGE LOGIC: DEBT
    document.getElementById('debt-form').onsubmit = (e) => {
        e.preventDefault();
        const name = document.getElementById('card-name').value.trim();
        const amount = parseFloat(document.getElementById('card-amount').value);
        
        const existing = myDebts.find(d => d.name.toLowerCase() === name.toLowerCase());
        if (existing) {
            existing.amount += amount;
        } else {
            myDebts.push({ name, amount });
        }
        saveAndReload();
    };

    // MERGE LOGIC: STOCK (Weighted Average)
    document.getElementById('stock-form').onsubmit = (e) => {
        e.preventDefault();
        const symbol = document.getElementById('stock-ticker').value.toUpperCase().trim();
        const newShares = parseFloat(document.getElementById('stock-shares').value);
        const newPrice = parseFloat(document.getElementById('stock-buy-price').value);

        const existing = myStocks.find(s => s.symbol === symbol);
        if (existing) {
            const totalCost = (existing.shares * existing.avgPrice) + (newShares * newPrice);
            existing.shares += newShares;
            existing.avgPrice = totalCost / existing.shares; // New Weighted Average
        } else {
            myStocks.push({ symbol, shares: newShares, avgPrice: newPrice });
        }
        saveAndReload();
    };

    document.getElementById('save-settings-btn').onclick = () => {
        userSettings.target = parseFloat(document.getElementById('target-goal').value) || 0;
        userSettings.years = parseFloat(document.getElementById('years-to-goal').value) || 0;
        userSettings.return = parseFloat(document.getElementById('annual-return').value) || 0;
        userSettings.salary = parseFloat(document.getElementById('monthly-salary').value) || 0;
        userSettings.mpf = parseFloat(document.getElementById('mpf-amount').value) || 0;
        localStorage.setItem('userSettings', JSON.stringify(userSettings));
        location.reload();
    };

    document.getElementById('reset-btn').onclick = () => {
        if(confirm("Wipe all data?")) { localStorage.clear(); location.reload(); }
    };

    document.getElementById('save-edit-btn').onclick = saveEdit;
}

function saveAndReload() {
    localStorage.setItem('mySavings', JSON.stringify(mySavings));
    localStorage.setItem('myDebts', JSON.stringify(myDebts));
    localStorage.setItem('myStocks', JSON.stringify(myStocks));
    location.reload();
}

// --- CORE ENGINE ---
async function initDashboard() {
    try {
        const res = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API_KEY}/latest/EUR`);
        const data = await res.json();
        const rates = data.conversion_rates;
        let totalEur = 0;

        // Assets: Savings
        const list = document.getElementById('savings-list');
        list.innerHTML = '';
        mySavings.forEach((acc, i) => {
            totalEur += acc.amount / rates[acc.currency];
            list.innerHTML += `<div class="account-row">
                <span><strong>${acc.name}</strong> (${acc.currency})</span>
                <span>${acc.amount.toLocaleString()} 
                <button onclick="openEdit(${i}, 'savings')" class="action-btn edit-btn">Edit</button>
                <button onclick="deleteItem(${i}, 'savings')" class="action-btn del-btn">X</button></span></div>`;
        });

        // MPF
        totalEur += (userSettings.mpf / rates.HKD);
        if(userSettings.mpf > 0) list.innerHTML += `<div class="account-row" style="color:#facc15"><span>MPF Pension</span><span>${userSettings.mpf.toLocaleString()} HKD</span></div>`;

        // Debts
        myDebts.forEach((debt, i) => {
            totalEur -= (debt.amount / rates.HKD);
            list.innerHTML += `<div class="debt-row"><span>${debt.name}</span><span>-${debt.amount.toLocaleString()} HKD 
                <button onclick="openEdit(${i}, 'debt')" class="action-btn edit-btn">Edit</button>
                <button onclick="deleteItem(${i}, 'debt')" class="action-btn del-btn">X</button></span></div>`;
        });

        // Stocks
        const stockBody = document.getElementById('stock-body');
        stockBody.innerHTML = '';
        myStocks.forEach((s, i) => {
            const livePrice = 245.50; // In a real app, fetch from AlphaVantage/Yahoo
            const currentValUsd = s.shares * livePrice;
            const costBasis = s.shares * s.avgPrice;
            const profit = currentValUsd - costBasis;
            totalEur += (currentValUsd / rates.USD);

            stockBody.innerHTML += `<tr>
                <td><strong>${s.symbol}</strong></td>
                <td><small>Avg: $${s.avgPrice.toFixed(2)}</small><br><strong>Live: $${livePrice}</strong></td>
                <td>${s.shares}</td>
                <td style="color:${profit >= 0 ? '#4ade80' : '#fb7185'}">
                    $${profit.toFixed(2)}<br><small>${((profit/costBasis)*100).toFixed(1)}%</small>
                </td>
                <td>
                    <button onclick="openEdit(${i}, 'stock')" class="action-btn edit-btn">Edit</button>
                    <button onclick="deleteItem(${i}, 'stock')" class="action-btn del-btn">X</button>
                </td>
            </tr>`;
        });

        // Header Total
        document.getElementById('total-net-worth').innerText = `€${totalEur.toLocaleString(undefined, {maximumFractionDigits:0})}`;
        
        // Progress bar logic
        const progress = Math.min((totalEur / userSettings.target) * 100, 100);
        document.getElementById('goal-progress-bar').style.width = `${progress}%`;
        
        // Calculator Status
        const months = userSettings.years * 12;
        const monthlyRate = (userSettings.return / 100) / 12;
        const compound = Math.pow(1 + monthlyRate, months);
        const remaining = userSettings.target - (totalEur * compound);
        const monthlyNeeded = remaining > 0 ? remaining / ((compound - 1) / monthlyRate) : 0;
        
        const canAfford = userSettings.salary >= monthlyNeeded;
        document.getElementById('calculator-result').innerHTML = `
            <div class="status-msg ${canAfford ? 'status-good' : 'status-bad'}">
                <h2>€${monthlyNeeded.toLocaleString(undefined, {maximumFractionDigits:0})} / mo</h2>
                <p>Required to hit €${userSettings.target.toLocaleString()}</p>
            </div>`;

    } catch(e) { console.error("Update error:", e); }
}

// EDIT MODAL LOGIC (Global functions for HTML)
window.openEdit = (index, type) => {
    const modal = document.getElementById('edit-modal');
    const fields = document.getElementById('edit-fields');
    document.getElementById('edit-index').value = index;
    document.getElementById('edit-type').value = type;
    fields.innerHTML = '';

    if(type === 'savings') {
        const item = mySavings[index];
        fields.innerHTML = `<label>Bank Name</label><input type="text" id="upd-1" value="${item.name}"><label>Amount</label><input type="number" id="upd-2" value="${item.amount}">`;
    } else if(type === 'debt') {
        const item = myDebts[index];
        fields.innerHTML = `<label>Card Name</label><input type="text" id="upd-1" value="${item.name}"><label>Owed (HKD)</label><input type="number" id="upd-2" value="${item.amount}">`;
    } else if(type === 'stock') {
        const item = myStocks[index];
        fields.innerHTML = `<label>Ticker</label><input type="text" id="upd-1" value="${item.symbol}"><label>Shares</label><input type="number" id="upd-2" value="${item.shares}"><label>Avg Buy Price</label><input type="number" id="upd-3" value="${item.avgPrice}">`;
    }
    modal.style.display = 'block';
};

window.closeModal = () => document.getElementById('edit-modal').style.display = 'none';

function saveEdit() {
    const idx = document.getElementById('edit-index').value;
    const type = document.getElementById('edit-type').value;

    if(type === 'savings') {
        mySavings[idx].name = document.getElementById('upd-1').value;
        mySavings[idx].amount = parseFloat(document.getElementById('upd-2').value);
    } else if(type === 'debt') {
        myDebts[idx].name = document.getElementById('upd-1').value;
        myDebts[idx].amount = parseFloat(document.getElementById('upd-2').value);
    } else if(type === 'stock') {
        myStocks[idx].symbol = document.getElementById('upd-1').value.toUpperCase();
        myStocks[idx].shares = parseFloat(document.getElementById('upd-2').value);
        myStocks[idx].avgPrice = parseFloat(document.getElementById('upd-3').value);
    }
    saveAndReload();
}

window.deleteItem = (idx, type) => {
    if(confirm("Delete this entry?")) {
        if(type === 'savings') mySavings.splice(idx, 1);
        if(type === 'debt') myDebts.splice(idx, 1);
        if(type === 'stock') myStocks.splice(idx, 1);
        saveAndReload();
    }
};
