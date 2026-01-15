const FX_API_KEY = '393a43661559351810312743';

// LOAD DATA
let mySavings = JSON.parse(localStorage.getItem('mySavings')) || [];
let myStocks = JSON.parse(localStorage.getItem('myStocks')) || [];
let myDebts = JSON.parse(localStorage.getItem('myDebts')) || [];
let userSettings = JSON.parse(localStorage.getItem('userSettings')) || { 
    target: 500000, years: 10, return: 7, salary: 3000, mpf: 0 
};

// INITIALIZE INPUTS
document.getElementById('mpf-amount').value = userSettings.mpf;

// SAVE SETTINGS (Including MPF)
document.getElementById('save-settings-btn').addEventListener('click', () => {
    userSettings = {
        target: parseFloat(document.getElementById('target-goal').value),
        years: parseFloat(document.getElementById('years-to-goal').value),
        return: parseFloat(document.getElementById('annual-return').value),
        salary: parseFloat(document.getElementById('monthly-salary').value),
        mpf: parseFloat(document.getElementById('mpf-amount').value)
    };
    localStorage.setItem('userSettings', JSON.stringify(userSettings));
    location.reload();
});

// ADD DEBT HANDLER
document.getElementById('debt-form').addEventListener('submit', (e) => {
    e.preventDefault();
    myDebts.push({
        name: document.getElementById('card-name').value,
        amount: parseFloat(document.getElementById('card-amount').value)
    });
    localStorage.setItem('myDebts', JSON.stringify(myDebts));
    location.reload();
});

// (Keep your existing Bank and Stock form handlers here)

async function init() {
    const res = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API_KEY}/latest/EUR`);
    const data = await res.json();
    const rates = data.conversion_rates;
    let totalEur = 0;

    const list = document.getElementById('savings-list');
    list.innerHTML = '';

    // 1. Calculate Savings
    mySavings.forEach(acc => {
        const val = acc.amount / rates[acc.currency];
        totalEur += val;
        list.innerHTML += `<div class="account-row"><span>${acc.name}</span><strong>${acc.amount.toLocaleString()} ${acc.currency}</strong></div>`;
    });

    // 2. Add MPF (HKD to EUR)
    const mpfEur = userSettings.mpf / rates.HKD;
    totalEur += mpfEur;
    list.innerHTML += `<div class="account-row mpf-row"><span>MPF Pension</span><strong>${userSettings.mpf.toLocaleString()} HKD</strong></div>`;

    // 3. Subtract Debts
    list.innerHTML += `<hr><h3>Debts</h3>`;
    myDebts.forEach(debt => {
        totalEur -= (debt.amount / rates.HKD); // Assuming CC are in HKD, change rates.HKD if they are EUR
        list.innerHTML += `<div class="debt-row"><span>${debt.name}</span><strong>- ${debt.amount.toLocaleString()} HKD</strong></div>`;
    });

    // 4. Stocks (Simulated live price $240)
    const stockBody = document.getElementById('stock-body');
    myStocks.forEach(s => {
        const livePrice = 240; 
        const currentValUsd = s.shares * livePrice;
        totalEur += (currentValUsd / rates.USD);
        stockBody.innerHTML += `<tr><td>${s.symbol}</td><td>$${currentValUsd.toLocaleString()}</td><td>$${(currentValUsd - (s.shares * s.avgPrice)).toFixed(0)}</td></tr>`;
    });

    // UPDATE UI
    document.getElementById('total-net-worth').innerText = `€${totalEur.toLocaleString(undefined, {maximumFractionDigits:0})}`;
    
    // RE-CALCULATE GOAL (Using updated Net Worth)
    const months = userSettings.years * 12;
    const monthlyRate = (userSettings.return / 100) / 12;
    const compound = Math.pow(1 + monthlyRate, months);
    const remaining = userSettings.target - (totalEur * compound);
    const monthlyNeeded = remaining > 0 ? remaining / ((compound - 1) / monthlyRate) : 0;

    document.getElementById('goal-progress-bar').style.width = `${Math.min((totalEur/userSettings.target)*100, 100)}%`;
    document.getElementById('calculator-result').innerHTML = `<h2>€${monthlyNeeded.toLocaleString(undefined, {maximumFractionDigits:0})} / mo</h2><p>Savings needed for goal</p>`;
}

init();
