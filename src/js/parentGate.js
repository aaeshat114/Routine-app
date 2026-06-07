// ==========================================
// Parent Gate (Prime Number Logic)
// ==========================================
function isPrime(num) {
  for(let i = 2, s = Math.sqrt(num); i <= s; i++) if(num % i === 0) return false;
  return num > 1;
}

export function generateGate() {
  const grid = document.getElementById('gate-grid');
  grid.innerHTML = '';
  const primes = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43];
  const nonPrimes = [9, 12, 14, 15, 16, 18, 20, 21, 22, 24, 25, 26, 27, 28];
  const targetPrime = primes[Math.floor(Math.random() * primes.length)];
  let options = [targetPrime];
  while(options.length < 9) {
    const np = nonPrimes[Math.floor(Math.random() * nonPrimes.length)];
    if (!options.includes(np)) options.push(np);
  }
  options.sort(() => Math.random() - 0.5);
  
  options.forEach(num => {
    const btn = document.createElement('button');
    btn.textContent = num;
    btn.onclick = () => {
      if (num === targetPrime) {
        document.getElementById('modal-gate').classList.add('hidden');
        window.dispatchEvent(new CustomEvent('gatePassed'));
      } else {
        generateGate(); 
      }
    };
    grid.appendChild(btn);
  });
}
