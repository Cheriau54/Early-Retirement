const FX_API_KEY = '393a43661559351810312743';

// 1. DATA INITIALIZATION
let mySavings = JSON.parse(localStorage.getItem('mySavings')) || [];
let myStocks = JSON.parse(localStorage.getItem('myStocks')) || [];
let myDebts = JSON.parse(localStorage.getItem('myDebts')) || [];
let userSettings = JSON.parse(localStorage.getItem('userSettings')) || { 
    target: 500000, years: 10, return: 7, salary: 0, mpf: 0 
};

// Fill inputs with saved settings
document.getElementById('target-goal').value = userSettings.target;
document.getElementById('years-to-goal').value = userSettings.years;
document.getElementById('annual-return').value = userSettings.return;
document.getElementById('monthly-salary').value = userSettings.salary;
document.getElementById('mpf-amount').value = userSettings.mpf;

// 2. EVENT LISTENERS
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

document.getElementById('debt-form').addEventListener('submit', (e) => {
    e.preventDefault();
    myDebts.push({
        name: document.getElementById('card-name').value,
        amount: parseFloat(document.getElementById('card-amount').value)
    });
    localStorage.setItem('myDebts', JSON.stringify(myDebts));
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
    if(confirm("Delete all your private financial records from this browser?")) {
        localStorage.clear();
        location.reload();
    }
}

// 3. CORE CALCULATIONS
async function init() {
    try {
        const res = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API_KEY}/latest/EUR`);
        const data = await res.json();
        const rates = data.conversion_rates;
        let totalNetWorthEur = 0;

        // Assets: Bank Accounts
        const list = document.getElementById('savings-list');
        mySavings.forEach(acc => {
            const valEur = acc.amount / rates[acc.currency];
            totalNetWorthEur += valEur;
            list.innerHTML += `<div class="account-row"><span>${acc.name}</span><strong>${acc.amount.toLocaleString()} ${acc.currency}</strong></div>`;
        });

        // Assets: MPF (HKD to EUR)
        const mpfInEur = userSettings.mpf / rates.HKD;
        totalNetWorthEur += mpfInEur;
        list.innerHTML += `<div class="account-row" style="color: #facc15"><span>MPF Pension</span><strong>${userSettings.mpf.toLocaleString()} HKD</strong></div>`;

        // Liabilities: Credit Card Debts (Assumed HKD)
        if(myDebts.length > 0) list.innerHTML += `<label>Debts</label>`;
        myDebts.forEach(debt => {
            const debtEur = debt.amount / rates.HKD;
            totalNetWorthEur -= debtEur;
            list.innerHTML += `<div class="debt-row"><span>${debt.name}</span><strong>- ${debt.amount.toLocaleString()} HKD</strong></div>`;
        });

        // Assets: Stocks (Using fixed mock price for stability, can be upgraded to live)
        const stockBody = document.getElementById('stock-body');
        myStocks.forEach(s => {
            const livePriceUsd = 245; 
            const currentUsdVal = s.shares * livePriceUsd;
            const profitUsd = currentUsdVal - (s.shares * s.avgPrice);
            totalNetWorthEur += (currentUsdVal / rates.USD);
            stockBody.innerHTML += `<tr><td>${s.symbol}</td><td>$${currentUsdVal.toLocaleString()}</td><td style="color:${profitUsd >= 0 ? 'var(--success)' : 'var(--danger)'}">$${profitUsd.toFixed(0)}</td></tr>`;
        });

        // UI Updates
        document.getElementById('total-net-worth').innerText = `€${totalNetWorthEur.toLocaleString(undefined, {maximumFractionDigits:0})}`;
        
        // Planner Logic
        const months = userSettings.years * 12;
        const monthlyRate = (userSettings.return / 100) / 12;
        const compound = Math.pow(1 + monthlyRate, months);
        const remainingGoal = userSettings.target - (totalNetWorthEur * compound);
        const monthlyNeeded = remainingGoal > 0 ? remainingGoal / ((compound - 1) / monthlyRate) : 0;

        document.getElementById('goal-progress-bar').style.width = `${Math.min((totalNetWorthEur/userSettings.target)*100, 100)}%`;
        
        const canAfford = userSettings.salary >= monthlyNeeded;
        document.getElementById('calculator-result').innerHTML = `
            <div class="status-msg ${canAfford ? 'status-good' : 'status-bad'}">
                <h2 style="margin:0">€${monthlyNeeded.toLocaleString(undefined, {maximumFractionDigits:0})} / month</h2>
                <p style="margin:5px 0 0 0;">Savings required. ${canAfford ? 'Your salary covers this.' : 'Salary deficit detected.'}</p>
            </div>
        `;

    } catch (err) {
        console.error("Dashboard failed to load rates.", err);
    }
}

init();
