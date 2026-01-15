/** * WEALTH TRACKER - CORE LOGIC
 * Powered by ExchangeRate-API
 */

const FX_API_KEY = '393a43661559351810312743';

// 1. DATA INITIALIZATION (Load from Browser Storage)
let mySavings = JSON.parse(localStorage.getItem('mySavings')) || [];
let myStocks = JSON.parse(localStorage.getItem('myStocks')) || [];
let myDebts = JSON.parse(localStorage.getItem('myDebts')) || [];
let userSettings = JSON.parse(localStorage.getItem('userSettings')) || { 
    target: 500000, 
    years: 10, 
    return: 7, 
    salary: 0, 
    mpf: 0 
};

// 2. DOM CONTENT LOADED
// This ensures the code waits for the HTML to be ready before looking for IDs
window.addEventListener('DOMContentLoaded', () => {
    // Fill inputs with saved settings
    document.getElementById('target-goal').value = userSettings.target;
    document.getElementById('years-to-goal').value = userSettings.years;
    document.getElementById('annual-return').value = userSettings.return;
    document.getElementById('monthly-salary').value = userSettings.salary;
    document.getElementById('mpf-amount').value = userSettings.mpf;
    
    // Start the calculation engine
    initDashboard(); 
    
    // Setup Button Listeners
    setupListeners();
});

// 3. EVENT LISTENERS
function setupListeners() {
    // Save Goal Settings & Income
    document.getElementById('save-settings-btn').addEventListener('click', () => {
        userSettings.target = parseFloat(document.getElementById('target-goal').value) || 0;
        userSettings.years = parseFloat(document.getElementById('years-to-goal').value) || 0;
        userSettings.return = parseFloat(document.getElementById('annual-return').value) || 0;
        userSettings.salary = parseFloat(document.getElementById('monthly-salary').value) || 0;
        userSettings.mpf = parseFloat(document.getElementById('mpf-amount').value) || 0;
        
        localStorage.setItem('userSettings', JSON.stringify(userSettings));
        alert("Settings Updated!");
        location.reload(); 
    });

    // Add Bank Account
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

    // Add Debt
    document.getElementById('debt-form').addEventListener('submit', (e) => {
        e.preventDefault();
        myDebts.push({
            name: document.getElementById('card-name').value,
            amount: parseFloat(document.getElementById('card-amount').value)
        });
        localStorage.setItem('myDebts', JSON.stringify(myDebts));
        location.reload();
    });

    // Add Stock
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

    // Reset All Data
    document.getElementById('reset-btn').addEventListener('click', () => {
        if(confirm("DANGER: This will wipe ALL your financial records from this browser. Continue?")) {
            localStorage.clear();
            location.reload();
        }
    });
}

// 4. GLOBAL DELETE FUNCTION
// Attached to 'window' so the HTML can trigger it from anywhere
window.deleteItem = function(index, type) {
    if (type === 'savings') mySavings.splice(index, 1);
    if (type === 'debt') myDebts.splice(index, 1);
    if (type === 'stock') myStocks.splice(index, 1);
    
    localStorage.setItem('mySavings', JSON.stringify(mySavings));
    localStorage.setItem('myDebts', JSON.stringify(myDebts));
    localStorage.setItem('myStocks', JSON.stringify(myStocks));
    location.reload();
};

// 5. THE CALCULATION ENGINE
async function initDashboard() {
    try {
        console.log("Fetching live exchange rates...");
        const response = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API_KEY}/latest/EUR`);
        const data = await response.json();
        
        if (data.result !== "success") throw new Error("API Key Invalid or Limit Reached");

        const rates = data.conversion_rates;
        let totalNetWorthEur = 0;

        // Assets: Savings
        const list = document.getElementById('savings-list');
        list.innerHTML = ''; // Clear previous content

        mySavings.forEach((acc, i) => {
            const valInEur = acc.amount / rates[acc.currency];
            totalNetWorthEur += valInEur;
            list.innerHTML += `
                <div class="account-row">
                    <span>${acc.name} (${acc.currency})</span>
                    <span>${acc.amount.toLocaleString()} 
                        <button onclick="deleteItem(${i}, 'savings')" style="width:auto; padding:2px 8px; margin-left:10px; background:#fb7185; color:white;">X</button>
                    </span>
                </div>`;
        });

        // Assets: MPF (HKD to EUR)
        const mpfEur = userSettings.mpf / rates.HKD;
        totalNetWorthEur += mpfEur;
        if(userSettings.mpf > 0) {
            list.innerHTML += `<div class="account-row" style="color: #facc15"><span>MPF Pension (HKD)</span><span>${userSettings.mpf.toLocaleString()}</span></div>`;
        }

        // Liabilities: Debts (Assuming HKD)
        if(myDebts.length > 0) list.innerHTML += `<label>Debts (HKD)</label>`;
        myDebts.forEach((debt, i) => {
            const debtEur = debt.amount / rates.HKD;
            totalNetWorthEur -= debtEur;
            list.innerHTML += `
                <div class="debt-row">
                    <span>${debt.name}</span>
                    <span>-${debt.amount.toLocaleString()} 
                        <button onclick="deleteItem(${i}, 'debt')" style="width:auto; padding:2px 8px; margin-left:10px; background:#fb7185; color:white;">X</button>
                    </span>
                </div>`;
        });

        // Assets: Stocks (Simulating $245 live price)
        const stockBody = document.getElementById('stock-body');
        stockBody.innerHTML = '';
        myStocks.forEach((s, i) => {
            const livePriceUsd = 245; 
            const currentUsdVal = s.shares * livePriceUsd;
            const profitUsd = currentUsdVal - (s.shares * s.avgPrice);
            totalNetWorthEur += (currentUsdVal / rates.USD);
            
            stockBody.innerHTML += `
                <tr>
                    <td>${s.symbol} <button onclick="deleteItem(${i}, 'stock')" style="width:auto; padding:1px 5px; background:none; color:#fb7185; border:1px solid #fb7185;">X</button></td>
                    <td>$${currentUsdVal.toLocaleString()}</td>
                    <td style="color:${profitUsd >= 0 ? '#4ade80' : '#fb7185'}">$${profitUsd.toFixed(0)}</td>
                </tr>`;
        });

        // Update Totals
        document.getElementById('total-net-worth').innerText = `€${totalNetWorthEur.toLocaleString(undefined, {maximumFractionDigits:0})}`;
        
        // Progress Bar
        const progress = Math.min((totalNetWorthEur / userSettings.target) * 100, 100);
        document.getElementById('goal-progress-bar').style.width = `${progress}%`;

        // Monthly Required Logic (Compound Interest)
        const months = userSettings.years * 12;
        const monthlyRate = (userSettings.return / 100) / 12;
        const compoundFactor = Math.pow(1 + monthlyRate, months);
        const remainingGoal = userSettings.target - (totalNetWorthEur * compoundFactor);
        const monthlyNeeded = remainingGoal > 0 ? remainingGoal / ((compoundFactor - 1) / monthlyRate) : 0;

        const canAfford = userSettings.salary >= monthlyNeeded;
        document.getElementById('calculator-result').innerHTML = `
            <div class="status-msg ${canAfford ? 'status-good' : 'status-bad'}">
                <h2 style="margin:0">€${monthlyNeeded.toLocaleString(undefined, {maximumFractionDigits:0})} / month</h2>
                <p style="margin:5px 0 0 0;">Savings required for €${userSettings.target.toLocaleString()}. ${canAfford ? 'Covered by salary.' : 'Salary deficit.'}</p>
            </div>
        `;

    } catch (err) {
        console.error("Dashboard calculation failed:", err);
        document.getElementById('total-net-worth').innerText = "Offline";
    }
}
