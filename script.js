const FX_API_KEY = '393a43661559351810312743';
const STOCK_API_KEY = 'RCOIHB62BAXECU2U';

let mySavings = JSON.parse(localStorage.getItem('mySavings')) || [];
let myStocks = JSON.parse(localStorage.getItem('myStocks')) || [];
let myDebts = JSON.parse(localStorage.getItem('myDebts')) || [];
let userSettings = JSON.parse(localStorage.getItem('userSettings')) || { target: 500000, years: 10, return: 7, salary: 0 };

const delay = ms => new Promise(res => setTimeout(res, ms));

window.addEventListener('DOMContentLoaded', () => {
    // Set initial values
    document.getElementById('target-goal').value = userSettings.target;
    document.getElementById('years-to-goal').value = userSettings.years;
    document.getElementById('annual-return').value = userSettings.return;
    document.getElementById('monthly-salary').value = userSettings.salary;
    
    initDashboard();
    setupListeners();
});

function setupListeners() {
    // Add Asset (Includes MPF)
    document.getElementById('bank-form').onsubmit = (e) => {
        e.preventDefault();
        const name = document.getElementById('bank-name').value.trim();
        const amount = parseFloat(document.getElementById('bank-amount').value);
        const curr = document.getElementById('bank-currency').value;
        const exists = mySavings.find(a => a.name.toLowerCase() === name.toLowerCase() && a.currency === curr);
        if(exists) exists.amount += amount; else mySavings.push({name, amount, currency: curr});
        save();
    };

    // Add Debt
    document.getElementById('debt-form').onsubmit = (e) => {
        e.preventDefault();
        const name = document.getElementById('card-name').value.trim();
        const amount = parseFloat(document.getElementById('card-amount').value);
        const exists = myDebts.find(d => d.name.toLowerCase() === name.toLowerCase());
        if(exists) exists.amount += amount; else myDebts.push({name, amount});
        save();
    };

    // Log Stock
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

    // Save Salary Separately
    document.getElementById('save-salary-btn').onclick = () => {
        userSettings.salary = parseFloat(document.getElementById('monthly-salary').value) || 0;
        localStorage.setItem('userSettings', JSON.stringify(userSettings));
        alert("Salary updated!");
        location.reload();
    };

    // Save Goal Settings
    document.getElementById('save-settings-btn').onclick = () => {
        userSettings.target = parseFloat(document.getElementById('target-goal').value);
        userSettings.years = parseFloat(document.getElementById('years-to-goal').value);
        userSettings.return = parseFloat(document.getElementById('annual-return').value);
        localStorage.setItem('userSettings', JSON.stringify(userSettings));
        location.reload();
    };

    document.getElementById('reset-btn').onclick = () => { if(confirm("Wipe all data?")) { localStorage.clear(); location.reload(); }};
    document.getElementById('save-edit-btn').onclick = saveEdit;
}

async function initDashboard() {
    try {
        const fxRes = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API_KEY}/latest/EUR`);
        const fxData = await fxRes.json();
        const rates = fxData.conversion_rates;
        let totalEur = 0;

        // Render Assets
        const list = document.getElementById('savings-list');
        list.innerHTML = '<h4>Assets</h4>';
        mySavings.forEach((acc, i) => {
            totalEur += acc.amount / rates[acc.currency];
            list.innerHTML += `<div class="account-row"><span>${acc.name} (${acc.currency})</span><span>${acc.amount.toLocaleString()} <button onclick="openEdit(${i}, 'savings')" class="action-btn edit-btn">Edit</button></span></div>`;
        });

        // Render Liabilities
        if(myDebts.length > 0) list.innerHTML += '<h4 style="margin-top:20px;">Liabilities</h4>';
        myDebts.forEach((debt, i) => {
            totalEur -= (debt.amount / rates.HKD);
            list.innerHTML += `<div class="debt-row"><span>${debt.name}</span><span>-${debt.amount.toLocaleString()} HKD <button onclick="openEdit(${i}, 'debt')" class="action-btn edit-btn">Edit</button></span></div>`;
        });

        // Render Stocks
        const stockBody = document.getElementById('stock-body');
        stockBody.innerHTML = '<tr><td colspan="5">Updating market prices...</td></tr>';
        
        let stockHtml = '';
        for (let [i, s] of myStocks.entries()) {
            const sRes = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s.symbol}&apikey=${STOCK_API_KEY}`);
            const sData = await sRes.json();
            const livePrice = parseFloat(sData["Global Quote"]?.["05. price"]) || s.avgPrice;
            
            const currentValUsd = s.shares * livePrice;
            const costBasis = s.shares * s.avgPrice;
            const profit = currentValUsd - costBasis;
            totalEur += (currentValUsd / rates.USD);

            stockHtml += `<tr>
                <td><strong>${s.symbol}</strong></td>
                <td>$${s.avgPrice.toFixed(2)}</td>
                <td style="color: #38bdf8;">$${livePrice.toFixed(2)}</td>
                <td style="color:${profit >= 0 ? '#4ade80' : '#fb7185'}">$${profit.toFixed(0)} (${((profit/costBasis)*100).toFixed(1)}%)</td>
                <td><button onclick="openEdit(${i}, 'stock')" class="action-btn edit-btn">Edit</button>
                    <button onclick="deleteItem(${i}, 'stock')" class="action-btn del-btn">X</button></td>
            </tr>`;
            if (myStocks.length > 1) await delay(400); 
        }
        stockBody.innerHTML = stockHtml || '<tr><td colspan="5">No stocks added.</td></tr>';

        document.getElementById('total-net-worth').innerText = `€${totalEur.toLocaleString(undefined, {maximumFractionDigits:0})}`;
        updateGoalProgress(totalEur);

    } catch(e) { console.error(e); }
}

function updateGoalProgress(totalEur) {
    const months = userSettings.years * 12;
    const rate = (userSettings.return / 100) / 12;
    const compound = Math.pow(1 + rate, months);
    const remaining = userSettings.target - (totalEur * compound);
    const monthlyNeeded = remaining > 0 ? remaining / ((compound - 1) / rate) : 0;

    document.getElementById('goal-progress-bar').style.width = `${Math.min((totalEur/userSettings.target)*100, 100)}%`;
    const canAfford = userSettings.salary >= monthlyNeeded;
    document.getElementById('calculator-result').innerHTML = `
        <div class="status-msg ${canAfford ? 'status-good' : 'status-bad'}">
            <h2 style="margin:0">€${monthlyNeeded.toLocaleString(undefined, {maximumFractionDigits:0})} / mo</h2>
            <p>Required to reach €${userSettings.target.toLocaleString()}</p>
        </div>`;
}

function save() {
    localStorage.setItem('mySavings', JSON.stringify(mySavings));
    localStorage.setItem('myDebts', JSON.stringify(myDebts));
    localStorage.setItem('myStocks', JSON.stringify(myStocks));
    location.reload();
}

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
    if(type === 'stock') {
        myStocks[idx].shares = parseFloat(document.getElementById('upd-1').value);
        myStocks[idx].avgPrice = parseFloat(document.getElementById('upd-2').value);
    } else if(type === 'savings') {
        mySavings[idx].name = document.getElementById('upd-name').value;
        mySavings[idx].amount = parseFloat(document.getElementById('upd-1').value);
    } else if(type === 'debt') {
        myDebts[idx].name = document.getElementById('upd-name').value;
        myDebts[idx].amount = parseFloat(document.getElementById('upd-1').value);
    }
    save();
}

window.deleteItem = (idx, type) => { if(confirm("Delete?")) { if(type==='stock') myStocks.splice(idx,1); save(); }};
