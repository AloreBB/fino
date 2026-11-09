// Illustrative demo with invented figures; mirrors the app's quincena totals rules.
(function () {
  const buttons = [...document.querySelectorAll('.moves button')];
  const totals = document.querySelector('.totals');
  const format = (cents) => {
    const value = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.abs(cents) / 100);
    return `${cents < 0 ? '-' : ''}$ ${value}`;
  };
  const set = (id, cents) => {
    const el = document.getElementById(id);
    el.textContent = format(cents);
    el.classList.toggle('negative', cents < 0);
  };
  function render() {
    const income = Number(totals.dataset.income);
    const amounts = buttons.map((b) => Number(b.dataset.cents));
    const expenses = amounts.reduce((sum, a) => sum + a, 0);
    const paid = buttons.reduce((sum, b, i) => sum + (b.getAttribute('aria-pressed') === 'true' ? amounts[i] : 0), 0);
    set('t-income', income);
    set('t-expenses', expenses);
    set('t-paid', paid);
    set('t-balance', income - paid);
    set('t-left', income - expenses);
  }
  buttons.forEach((b) => {
    b.querySelector('.amount').textContent = format(Number(b.dataset.cents));
    b.addEventListener('click', () => {
      b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
      render();
    });
  });
  render();

  // One page-load moment: the highlighter marks the paid rows in order, showing what a tap does.
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    buttons
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .forEach((b, i) => {
        b.animate(
          [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
          { pseudoElement: '::before', duration: 420, delay: 300 + i * 160, easing: 'cubic-bezier(0.77, 0, 0.175, 1)', fill: 'backwards' },
        );
      });
  }
})();
