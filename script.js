const FX_API_KEY = '393a43661559351810312743';

// 1. DATA INITIALIZATION
let mySavings = JSON.parse(localStorage.getItem('mySavings')) || [];
let myStocks = JSON.parse(localStorage.getItem('myStocks')) || [];
let myDebts = JSON.parse(localStorage.getItem('myDebts')) || [];
let userSettings = JSON.parse(localStorage.getItem('userSettings')) || { target: 500000, years: 10, return: 7, salary: 0, mpf: 0 };

window.addEventListener('DOMContentLoaded', () => {
    // Fill Planner fields
    document.getElementById('target-goal').value = userSettings.target;
    document.getElementById('years-to-goal').value = userSettings.years;
    document.getElementById('annual-return').value = userSettings.return;
    document.getElementById('monthly-salary').value = userSettings.salary;
    document.getElementById('mpf-amount').value = userSettings.mpf;
    
    initDashboard();
    setupForms();
});

// 2. FORM & BUTTON HANDLERS
function setupForms() {
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
            // Weighted Average Calculation
            const totalCost = (exists.shares * exists.avgPrice) + (shares * price);
            exists.shares += shares;
            exists.avgPrice = totalCost / exists.shares;
        } else {
            myStocks.push({symbol, shares, avgPrice: price});
        }
        save();
    };

    document.getElementById('save-settings-btn').onclick = () => {
        userSettings = {
            target: parseFloat(document.getElementById('target-goal').value) || 0,
            years: parseFloat(document.getElementById('years-to-goal').value) || 0,
            return: parseFloat(document.getElementById('annual-return').value) || 0,
            salary: parseFloat(document.getElementById('monthly-salary').value) || 0,
            mpf: parseFloat(document.getElementById('mpf-amount').value) || 0
        };
        localStorage.setItem('userSettings', JSON.stringify(userSettings));
        location.reload();
    };

    document.getElementById('reset-btn').onclick = () => { if(confirm("Wipe all data?")) { localStorage.clear(); location.reload(); }};
    document.getElementById('save-edit-btn').onclick = saveEdit;
}

function save() {
    localStorage.setItem('mySavings', JSON.stringify(mySavings));
    localStorage.setItem('myDebts', JSON.stringify(myDebts));
    localStorage.setItem('myStocks', JSON.stringify(myStocks));
    location.reload();
}

// 3. MAIN DASHBOARD ENGINE
async function initDashboard() {
    try {
        const res = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API_KEY}/latest/EUR`);
        const data = await res.json();
        const rates = data.conversion_rates;
        let totalEur = 0;

        // Assets List Rendering
        const list = document.getElementById('savings-list');
        list.innerHTML = '';
        mySavings.forEach((acc, i) => {
            totalEur += acc.amount / rates[acc.currency];
            list.innerHTML += `<div class="account-row"><span><strong>${acc.name}</strong></span><span>${acc.amount.toLocaleString()} ${acc.currency} 
                <button onclick="openEdit(${i}, 'savings')" class="action-btn edit-btn">Edit</button></span></div>`;
        });

        // MPF Addition
        totalEur += (userSettings.mpf / rates.HKD);
        if(userSettings.mpf > 0) list.innerHTML += `<div class="account-row" style="color:#facc15"><span>MPF Pension</span><span>${userSettings.mpf.toLocaleString()} HKD</span></div>`;

        // Debt Rendering
        myDebts.forEach((debt, i) => {
            totalEur -= (debt.amount / rates.HKD);
            list.innerHTML += `<div class="debt-row"><span>${debt.name}</span><span>-${debt.amount.toLocaleString()} HKD 
                <button onclick="openEdit(${i}, 'debt')" class="action-btn edit-btn">Edit</button></span></div>`;
        });

        // Stock Rendering with Profit Logic
        const stockBody = document.getElementById('stock-body');
        stockBody.innerHTML = '';
        myStocks.forEach((s, i) => {
            const mockLivePrice = 250.00; // Simulated Real-time Price
            const currentValUsd = s.shares * mockLivePrice;
            const costBasis = s.shares * s.avgPrice;
            const profit = currentValUsd - costBasis;
            const profitPct = (profit / costBasis) * 100;
            totalEur += (currentValUsd / rates.USD);

            stockBody.innerHTML += `<tr>
                <td><strong>${s.symbol}</strong><br><small>${s.shares} Shares</small></td>
                <td>$${s.avgPrice.toFixed(2)}</td>
                <td>$${mockLivePrice.toFixed(2)}</td>
                <td style="color:${profit >= 0 ? '#4ade80' : '#fb7185'}">
                    $${profit.toFixed(0)}<br><small>${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(1)}%</small>
                </td>
                <td><button onclick="openEdit(${i}, 'stock')" class="action-btn edit-btn">Edit</button>
                    <button onclick="deleteItem(${i}, 'stock')" class="action-btn del-btn">X</button></td>
            </tr>`;
        });

        // Update UI Displays
        document.getElementById('total-net-worth').innerText = `€${totalEur.toLocaleString(undefined, {maximumFractionDigits:0})}`;
        
        // Progress Bar Calculation
        const progress = Math.min((totalEur / (userSettings.target || 1)) * 100, 100);
        document.getElementById('goal-progress-bar').style.width = `${progress}%`;

        // Monthly Savings Required Calculation (PMT formula)
        const target = userSettings.target;
        const years = userSettings.years;
        const rate = (userSettings.return / 100) / 12;
        const months = years * 12;
        
        const compoundFactor = Math.pow(1 + rate, months);
        const remainingGoal = target - (totalEur * compoundFactor);
        const monthlyNeeded = remainingGoal > 0 ? remainingGoal / ((compoundFactor - 1) / rate) : 0;

        const canAfford = (userSettings.salary || 0) >= monthlyNeeded;
        document.getElementById('calculator-result').innerHTML = `
            <div class="status-msg ${canAfford ? 'status-good' : 'status-bad'}">
                <h2 style="margin:0">€${monthlyNeeded.toLocaleString(undefined, {maximumFractionDigits:0})} / Month</h2>
                <p>Required to reach €${target.toLocaleString()} in ${years} years.</p>
            </div>
        `;

    } catch(e) { console.error("Update Error:", e); }
}

// 4. EDIT & DELETE GLOBAL FUNCTIONS
window.openEdit = (idx, type) => {
    const modal = document.getElementById('edit-modal');
    const fields = document.getElementById('edit-fields');
    document.getElementById('edit-index').value = idx;
    document.getElementById('edit-type').value = type;
    fields.innerHTML = '';
    
    let item = type === 'savings' ? mySavings[idx] : type === 'debt' ? myDebts[idx] : myStocks[idx];
    
    if(type === 'stock') {
        fields.innerHTML = `<label>Shares Owned</label><input type="number" id="upd-1" value="${item.shares}">
                            <label>Average Buy Price ($)</label><input type="number" id="upd-2" value="${item.avgPrice}">`;
    } else {
        fields.innerHTML = `<label>Current Amount</label><input type="number" id="upd-1" value="${item.amount}">`;
    }
    modal.style.display = 'flex';
};

window.closeModal = () => document.getElementById('edit-modal').style.display = 'none';

function saveEdit() {
    const idx = document.getElementById('edit-index').value;
    const type = document.getElementById('edit-type').value;
    if(type === 'stock') {
        myStocks[idx].shares = parseFloat(document.getElementById('upd-1').value);
        myStocks[idx].avgPrice = parseFloat(document.getElementById('upd-2').value);
    } else if(type === 'savings') {
        mySavings[idx].amount = parseFloat(document.getElementById('upd-1').value);
    } else if(type === 'debt') {
        myDebts[idx].amount = parseFloat(document.getElementById('upd-1').value);
    }
    save();
}

window.deleteItem = (idx, type) => { 
    if(confirm("Permanently delete this stock entry?")) { 
        if(type==='stock') myStocks.splice(idx,1); 
        save(); 
    }
};
