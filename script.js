const FX_API_KEY = process.env.API_KEY || '393a43661559351810312743';
const GOAL_AMOUNT = 500000;

// Load data from browser storage or start empty
let mySavings = JSON.parse(localStorage.getItem('mySavings')) || [];
let myStocks = JSON.parse(localStorage.getItem('myStocks')) || [];

// Handle Bank Form Submission
document.getElementById('bank-form').addEventListener('submit', (e) => {
  e.preventDefault();
  mySavings.push({
    name: document.getElementById('bank-name').value,
    amount: parseFloat(document.getElementById('bank-amount').value),
    currency: document.getElementById('bank-currency').value
  });
  saveAndRefresh();
});

// Handle Stock Form Submission
document.getElementById('stock-form').addEventListener('submit', (e) => {
  e.preventDefault();
  myStocks.push({
    symbol: document.getElementById('stock-ticker').value.toUpperCase(),
    shares: parseFloat(document.getElementById('stock-shares').value),
    avgPrice: parseFloat(document.getElementById('stock-buy-price').value)
  });
  saveAndRefresh();
});

function saveAndRefresh() {
  localStorage.setItem('mySavings', JSON.stringify(mySavings));
  localStorage.setItem('myStocks', JSON.stringify(myStocks));
  location.reload(); // Refresh to update all math
}

function clearData() {
  if(confirm("Delete all data?")) {
    localStorage.clear();
    location.reload();
  }
}

async function initDashboard() {
  const response = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API_KEY}/latest/EUR`);
  const data = await response.json();
  const rates = data.conversion_rates;
  let totalNetWorthEur = 0;

  // Render Savings
  const savingsContainer = document.getElementById('savings-list');
  mySavings.forEach(acc => {
    const rateToEur = 1 / rates[acc.currency];
    const eurVal = acc.amount * rateToEur;
    totalNetWorthEur += eurVal;
    savingsContainer.innerHTML += `<div class="account-row"><span>${acc.name}</span><strong>${acc.amount.toLocaleString()} ${acc.currency}</strong></div>`;
  });

  // Render Stocks (Demo Price: $240)
  const stockBody = document.getElementById('stock-body');
  myStocks.forEach(stock => {
    const livePriceUsd = 240; 
    const currentValUsd = stock.shares * livePriceUsd;
    const profitUsd = currentValUsd - (stock.shares * stock.avgPrice);
    totalNetWorthEur += (currentValUsd / rates.USD);

    stockBody.innerHTML += `<tr><td>${stock.symbol}</td><td>$${currentValUsd.toLocaleString()}</td><td class="${profitUsd >= 0 ? 'profit-pos' : 'profit-neg'}">$${profitUsd.toFixed(2)}</td></tr>`;
  });

  document.getElementById('total-net-worth').innerText = `€${totalNetWorthEur.toLocaleString()}`;
  const progress = (totalNetWorthEur / GOAL_AMOUNT) * 100;
  document.getElementById('goal-progress-bar').style.width = `${Math.min(progress, 100)}%`;
  document.getElementById('goal-text').innerText = `${progress.toFixed(1)}% to your goal!`;
}

initDashboard();
