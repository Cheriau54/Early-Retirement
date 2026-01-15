const FX_API_KEY = '393a43661559351810312743';

// 1. DATA INITIALIZATION
let mySavings = JSON.parse(localStorage.getItem('mySavings')) || [];
let myStocks = JSON.parse(localStorage.getItem('myStocks')) || [];
let myDebts = JSON.parse(localStorage.getItem('myDebts')) || [];
let userSettings = JSON.parse(localStorage.getItem('userSettings')) || { 
    target: 500000, years: 10, return: 7, salary: 0, mpf: 0 
};

// Fill inputs on screen from saved memory
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('target-goal').value = userSettings.target;
    document.getElementById('years-to-goal').value = userSettings.years;
    document.getElementById('annual-return').value = userSettings.return;
    document.getElementById('monthly-salary').value = userSettings.salary;
    document.getElementById('mpf-amount').value = userSettings.mpf;
    
    initDashboard(); // Run the currency math immediately
});

// 2. BUTTON HANDLERS
document.getElementById('save-settings-btn').addEventListener('click', () => {
    userSettings.target = parseFloat(document.getElementById('target-goal').value) || 0;
    userSettings.years = parseFloat(document.getElementById('years-to-goal').value) || 0;
    userSettings.return = parseFloat(document.getElementById('annual-return').value) || 0;
    userSettings.salary = parseFloat(document.getElementById('monthly-salary').value) || 0;
    userSettings.mpf = parseFloat(document.getElementById('mpf-amount').value) || 0;
    
    localStorage.setItem('userSettings', JSON.stringify(userSettings));
    alert("Settings Saved!");
    location.reload(); 
});

document.getElementById('bank-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const newEntry = {
        name: document.getElementById('bank-name').value,
        amount: parseFloat(document.getElementById('bank-amount').value),
        currency: document.getElementById('bank-currency').value
    };
    mySavings.push(newEntry);
    localStorage.setItem('mySavings', JSON.stringify(mySavings));
    location.reload();
});

document.getElementById('debt-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const newDebt = {
        name: document.getElementById('card-name').value,
        amount: parseFloat(document.getElementById('card-amount').value)
    };
    myDebts.push(newDebt);
    localStorage.setItem('myDebts', JSON.stringify(myDebts));
    location.reload();
});

document.getElementById('stock-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const newStock = {
        symbol: document.getElementById('stock-ticker').value.toUpperCase(),
        shares: parseFloat(document.getElementById('stock-shares').value),
        avgPrice: parseFloat(document.getElementById('stock-buy-price').value)
    };
    myStocks.push(newStock);
    localStorage.setItem('myStocks', JSON.stringify(myStocks));
    location.reload();
});

document.getElementById('reset-btn').addEventListener('click', () => {
    if(confirm("Are you sure you want to delete all local data?")) {
        localStorage.clear();
        location.reload();
    }
});

// 3. THE MATH ENGINE
async function initDashboard() {
    try {
        const response = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API_KEY}/latest/EUR`);
        const data = await response.json();
        
        if (data.result === "error") {
            alert("API Key error. Check your ExchangeRate-API dashboard.");
            return;
        }

        const rates = data.conversion_rates;
        let totalNetWorthEur = 0;

        // Clear display before rendering
        const list = document.getElementById('savings-list');
        list.innerHTML = '';
        const stockBody = document.getElementById('stock-body');
        stockBody.innerHTML = '';

        // Calculate Bank Accounts (Dynamics: amount / rate = EUR)
        mySavings.forEach(acc => {
            const amountInEur = acc.amount / rates[acc.currency];
            totalNetWorthEur += amountInEur;
            list.innerHTML += `<div class="account-row"><span>${acc.name}</span><strong>${acc.amount.toLocaleString()} ${acc.currency}</strong></div>`;
        });

        // Calculate MPF (HKD to EUR)
        const mpfInEur = (userSettings.mpf || 0) / rates.HKD;
        totalNetWorthEur += mpfInEur;
        if(userSettings.mpf > 0) {
            list.innerHTML += `<div class="account-row" style="color: #facc15"><span>MPF Pension</span><strong>${userSettings.mpf.toLocaleString()} HKD</strong></div>`;
        }

        // Subtract Debts (HKD to EUR)
        myDebts.forEach(debt => {
            const debtInEur = debt.amount / rates.HKD;
            totalNetWorthEur -= debtInEur;
            list.innerHTML += `<div class="debt-row"><span>${debt.name}</span><strong>- ${debt.amount.toLocaleString()} HKD</strong></div>`;
        });

        // Calculate Stocks (USD to EUR)
        myStocks.forEach(s => {
            const livePriceUsd = 245; // Placeholder for live price
            const currentTotalUsd = s.shares * livePriceUsd;
            const profitUsd = currentTotalUsd - (s.shares * s.avgPrice);
            totalNetWorthEur += (currentTotalUsd / rates.USD);
            
            stockBody.innerHTML += `<tr>
                <td>${s.symbol}</td>
                <td>$${currentTotalUsd.toLocaleString()}</td>
                <td style="color:${profitUsd >= 0 ? '#4ade80' : '#fb7185'}">$${profitUsd.toFixed(0)}</td>
            </tr>`;
        });

        // Update Total Display
        document.getElementById('total-net-worth').innerText = `€${totalNetWorthEur.toLocaleString(undefined, {maximumFractionDigits:0})}`;

        // Goal Math
        const target = userSettings.target || 500000;
        const years = userSettings.years || 10;
        const rate = (userSettings.return || 7) / 100;
        
        const months = years * 12;
        const monthlyRate = rate / 12;
        const compoundFactor = Math.pow(1 + monthlyRate, months);
        const remaining = target - (totalNetWorthEur * compoundFactor);
        const monthlyNeeded = remaining > 0 ? remaining / ((compoundFactor - 1) / monthlyRate) : 0;

        // Progress Bar
        const progressPercent = Math.min((totalNetWorthEur / target) * 100, 100);
        document.getElementById('goal-progress-bar').style.width = `${progressPercent}%`;

        // Comparison Result
        const salary = userSettings.salary || 0;
        const canAfford = salary >= monthlyNeeded;
        document.getElementById('calculator-result').innerHTML = `
            <div class="status-msg ${canAfford ? 'status-good' : 'status-bad'}">
                <h2 style="margin:0">€${monthlyNeeded.toLocaleString(undefined, {maximumFractionDigits:0})} / month</h2>
                <p style="margin:5px 0 0 0;">Savings required to hit goal. ${canAfford ? 'Covered by salary.' : 'Exceeds current salary.'}</p>
            </div>
        `;

    } catch (error) {
        console.error("Critical Error:", error);
    }
}
