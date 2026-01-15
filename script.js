const FX_API_KEY = '393a43661559351810312743';

// LOAD DATA
let mySavings = JSON.parse(localStorage.getItem('mySavings')) || [];
let myStocks = JSON.parse(localStorage.getItem('myStocks')) || [];
let userSettings = JSON.parse(localStorage.getItem('userSettings')) || { 
    target: 500000, 
    years: 10, 
    return: 7, 
    salary: 3000 
};

// INITIALIZE INPUTS
document.getElementById('target-goal').value = userSettings.target;
document.getElementById('years-to-goal').value = userSettings.years;
document.getElementById('annual-return').value = userSettings.return;
document.getElementById('monthly-salary').value = userSettings.salary;

// SAVE SETTINGS
document.getElementById('save-settings-btn').addEventListener('click', () => {
    userSettings = {
        target: parseFloat(document.getElementById('target-goal').value),
        years: parseFloat(document.getElementById('years-to-goal').value),
        return: parseFloat(document.getElementById('annual-return').value),
        salary: parseFloat(document.getElementById('monthly-salary').value)
    };
    localStorage.setItem('userSettings', JSON.stringify(userSettings));
    location.reload();
});

// FORM HANDLERS (Same as before)
document.getElementById('bank-form').addEventListener('submit', (e) => {
    e.preventDefault();
    mySavings.push({
        name: document.getElementById('bank-name').value,
        amount: parseFloat(document.getElementById('bank-amount').value),
        currency: document.getElementById('bank-currency').value
    });
    localStorage.setItem('mySavings', JSON.stringify(mySavings));
    location.reload();
});

document.getElementById('stock-form').addEventListener('submit', (e) => {
    e.preventDefault();
    myStocks.push({
        symbol: document.getElementById('stock-ticker').value.toUpperCase(),
        shares: parseFloat(document.getElementById('stock-shares').value),
        avgPrice: parseFloat(document.getElementById('stock-buy-price').value)
    });
    localStorage.setItem('myStocks', JSON.stringify(myStocks));
    location.reload();
});

function clearAllData() {
    if(confirm("Permanently delete your private records?")) {
        localStorage.clear();
        location.reload();
    }
}

async function init() {
    const res = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API_KEY}/latest/EUR`);
    const data = await res.json();
    const rates = data.conversion_rates;
    let totalEur = 0;

    // Accounts
    const list = document.getElementById('savings-list');
    mySavings.forEach(acc => {
        const val = acc.amount / rates[acc.currency];
        totalEur += val;
        list.innerHTML += `<div class="account-row"><span>${acc.name}</span><strong>${acc.amount} ${acc.currency}</strong></div>`;
    });

    // Stocks
    const stockBody = document.getElementById('stock-body');
    myStocks.forEach(s => {
        const livePrice = 240; // Simulated
        const currentValUsd = s.shares * livePrice;
        const profit = currentValUsd - (s.shares * s.avgPrice);
        totalEur += (currentValUsd / rates.USD);
        stockBody.innerHTML += `<tr><td>${s.symbol}</td><td>$${currentValUsd.toFixed(0)}</td><td class="${profit >= 0 ? 'profit-pos' : 'profit-neg'}">$${profit.toFixed(0)}</td></tr>`;
    });

    document.getElementById('total-net-worth').innerText = `€${totalEur.toLocaleString(undefined, {maximumFractionDigits:0})}`;
    
    // CALCULATOR LOGIC
    const months = userSettings.years * 12;
    const monthlyRate = (userSettings.return / 100) / 12;
    const compound = Math.pow(1 + monthlyRate, months);
    const remaining = userSettings.target - (totalEur * compound);
    const monthlyNeeded = remaining > 0 ? remaining / ((compound - 1) / monthlyRate) : 0;

    // Progress Bar
    document.getElementById('goal-progress-bar').style.width = `${Math.min((totalEur/userSettings.target)*100, 100)}%`;

    // Salary Comparison
    const canAfford = userSettings.salary >= monthlyNeeded;
    const statusClass = canAfford ? 'status-good' : 'status-bad';
    const statusText = canAfford 
        ? `✓ Your salary covers this (Surplus: €${(userSettings.salary - monthlyNeeded).toFixed(0)})` 
        : `⚠ Your salary is €${(monthlyNeeded - userSettings.salary).toFixed(0)} short of this goal.`;

    document.getElementById('calculator-result').innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <h2 style="color:var(--success); margin:0;">€${monthlyNeeded.toLocaleString(undefined, {maximumFractionDigits:0})} / month</h2>
                <p style="margin:5px 0 0 0;">Savings required for €${userSettings.target.toLocaleString()}</p>
            </div>
            <div class="status-msg ${statusClass}">${statusText}</div>
        </div>
    `;
}

init();
