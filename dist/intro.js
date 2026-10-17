/* Presentation only. One timeline controls CSS and cleanup. */
(() => {
  'use strict';
  const url = new URL(location.href);
  if (!url.searchParams.has('launch')) return;
  url.searchParams.delete('launch');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  const timing = { hold: 5000, cover: 900, pages: 3400, reveal: 600, assetWait: 2500 };
  const total = timing.hold + timing.cover + timing.pages + timing.reveal;
  // Keep the original 1,000 identities, then paginate them at the larger size.
  const formulaFontSize = 15.3;
  const formulaLineHeight = 26;
  const sup = value => String(value).replace(/[0-9-]/g, c => '⁰¹²³⁴⁵⁶⁷⁸⁹'['0123456789'.indexOf(c)] || '⁻');
  const formulasForPage = page => {
    const n = page + 2,
      m = n + 1,
      q = n * n;
    const formulas = [
      `d/dx (x${sup(n)}) = ${n}x${sup(n - 1)};     d²/dx² (x${sup(n)}) = ${n * (n - 1)}x${sup(n - 2)}`,
      `∫ x${sup(n)} dx = x${sup(m)}/${m} + C;     ∫₀¹ x${sup(n)} dx = 1/${m}`,
      `d/dx e${sup(n) + 'ˣ'} = ${n}e${sup(n) + 'ˣ'};     ∫ e${sup(n) + 'ˣ'} dx = e${sup(n) + 'ˣ'}/${n} + C`,
      `d/dx sin(${n}x) = ${n} cos(${n}x);     d/dx cos(${n}x) = −${n} sin(${n}x)`,
      `∫ sin(${n}x) dx = −cos(${n}x)/${n} + C;     ∫ cos(${n}x) dx = sin(${n}x)/${n} + C`,
      `d/dx ln(${n}x) = 1/x;     d/dx ln(x${sup(n)}) = ${n}/x     (x > 0)`,
      `d/dx (1 + x)${sup(n)} = ${n}(1 + x)${sup(n - 1)}`,
      `d/dx (x² + ${n})${sup(m)} = ${2 * m}x(x² + ${n})${sup(n)}`,
      `∫₀¹ (1 − x)${sup(n)} dx = 1/${m};     ∫₀${sup(n)} x dx = ${q}/2`,
      `∫₀∞ e${sup(-n) + 'ˣ'} dx = 1/${n};     ∫₀∞ x e${sup(-n) + 'ˣ'} dx = 1/${q}`,
      `Σ(k=0…∞) (x/${n})ᵏ = ${n}/(${n} − x),     |x| < ${n}`,
      `Σ(k=1…∞) k(x/${n})ᵏ = ${n}x/(${n} − x)²,     |x| < ${n}`,
      `e${sup(n) + 'ˣ'} = Σ(k=0…∞) (${n}x)ᵏ/k!`,
      `sin(${n}x) = Σ(k=0…∞) (−1)ᵏ(${n}x)²ᵏ⁺¹/(2k + 1)!`,
      `cos(${n}x) = Σ(k=0…∞) (−1)ᵏ(${n}x)²ᵏ/(2k)!`,
      `ln(1 + x/${n}) = Σ(k=1…∞) (−1)ᵏ⁺¹(x/${n})ᵏ/k,     |x| < ${n}`,
      `Σ(k=1…${n}) k = ${n * m}/2;     Σ(k=1…${n}) k² = ${n * m * (2 * n + 1)}/6`,
      `Σ(k=1…${n}) k³ = (${n * m}/2)²;     Σ(k=0…${n}) C(${n}, k) = 2${sup(n)}`,
      `(a + b)${sup(n)} = Σ(k=0…${n}) C(${n}, k) a${sup(n) + '⁻ᵏ'} bᵏ`,
      `C(${m}, k) = C(${n}, k) + C(${n}, k − 1)`,
      `Γ(${m}) = ${n}!;     B(${n}, 1) = 1/${n}`,
      `∫₀¹ x${sup(n - 1)}(1 − x) dx = 1/${n * m}`,
      `∫₀∞ x${sup(n - 1)}e⁻ˣ dx = ${n - 1}!`,
      `∫₋∞∞ e${sup(-n) + 'ˣ²'} dx = √(π/${n})`,
      `∫₋∞∞ x²e${sup(-n) + 'ˣ²'} dx = √π/(2·${n}√${n})`,
      `sin²(${n}θ) + cos²(${n}θ) = 1;     tan(${n}θ) = sin(${n}θ)/cos(${n}θ)`,
      `sin(${2 * n}θ) = 2 sin(${n}θ) cos(${n}θ)`,
      `cos(${2 * n}θ) = cos²(${n}θ) − sin²(${n}θ)`,
      `e${sup(n) + 'ⁱθ'} = cos(${n}θ) + i sin(${n}θ)`,
      `(cos θ + i sin θ)${sup(n)} = cos(${n}θ) + i sin(${n}θ)`,
      `z${sup(n)} = 1  ⇒  zₖ = e^(2πik/${n}),     k = 0,…,${n - 1}`,
      `y′ + ${n}y = 0  ⇒  y(x) = Ce${sup(-n) + 'ˣ'}`,
      `y″ + ${q}y = 0  ⇒  y(x) = A cos(${n}x) + B sin(${n}x)`,
      `y″ − ${q}y = 0  ⇒  y(x) = Ae${sup(n) + 'ˣ'} + Be${sup(-n) + 'ˣ'}`,
      `ℒ{e${sup(-n) + 'ᵗ'}}(s) = 1/(s + ${n}),     s > −${n}`,
      `ℒ{sin(${n}t)}(s) = ${n}/(s² + ${q}),     s > 0`,
      `ℒ{cos(${n}t)}(s) = s/(s² + ${q}),     s > 0`,
      `ℒ{t${sup(n)}}(s) = ${n}!/s${sup(m)},     s > 0`,
      `det(${n}I₂) = ${q};     tr(${n}I₂) = ${2 * n};     (${n}I₂)⁻¹ = I₂/${n}`,
      `A = diag(${n}, ${m})  ⇒  det A = ${n * m},     tr A = ${n + m}`,
      `X ~ Bin(${n}, p)  ⇒  E[X] = ${n}p,     Var(X) = ${n}p(1 − p)`,
      `X ~ Pois(${n})  ⇒  P(X = k) = e${sup(-n)}${n}ᵏ/k!`,
      `X ~ Exp(${n})  ⇒  E[X] = 1/${n},     Var(X) = 1/${q}`,
      `E[${n}X + ${m}] = ${n}E[X] + ${m};     Var(${n}X) = ${q}Var(X)`,
      `Cov(${n}X, ${m}Y) = ${n * m}Cov(X, Y)`,
      `X₁,…,X${n} iid  ⇒  Var((X₁ + ⋯ + X${n})/${n}) = σ²/${n}`,
      `∇(x² + ${n}y²) = (2x, ${2 * n}y);     ∇²(x² + ${n}y²) = ${2 + 2 * n}`,
      `f(x,y) = x${sup(n)}y  ⇒  ∂f/∂x = ${n}x${sup(n - 1)}y,     ∂f/∂y = x${sup(n)}`,
      `x² + y² = ${q}  ⇒  A = ${q}π,     L = ${2 * n}π`,
      `∫[0, 2π] sin(${n}x) dx = 0;     ∫[0, 2π] cos²(${n}x) dx = π`
    ];
    // Rotate the sequence so adjacent pages have different visual arrangements.
    const offset = (page * 7) % formulas.length;
    return formulas.slice(offset).concat(formulas.slice(0, offset));
  };
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `${formulaFontSize}px "Cambria Math", "Times New Roman", serif`;
  const wrapFormula = formula => {
    const lines = [];
    for (const clause of formula.split(/(?<=;)\s*/)) {
      let line = '';
      for (const word of clause.split(/\s+/)) {
        const candidate = line ? line + ' ' + word : word;
        if (line && measure.measureText(candidate).width + candidate.length * 0.1 > 344) {
          lines.push(line);
          line = word;
        } else line = candidate;
      }
      if (line) lines.push(line);
    }
    return lines;
  };
  const formulaPages = [];
  let pageLines = [],
    usedRows = 0;
  for (let sourcePage = 0; sourcePage < 20; sourcePage++) {
    for (const formula of formulasForPage(sourcePage)) {
      // Retain punctuation when splitting paired identities onto separate lines.
      const lines = wrapFormula(formula);
      if (usedRows + lines.length > 28) {
        formulaPages.push(pageLines);
        pageLines = [];
        usedRows = 0;
      }
      pageLines.push({ formula, lines });
      usedRows += lines.length;
    }
  }
  if (pageLines.length) formulaPages.push(pageLines);
  const leafCount = Math.ceil(formulaPages.length / 2);
  const drawFormulas = (face, page) => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 400 800');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('intro-formulas');
    let row = 0;
    (formulaPages[page] || []).forEach(({ formula, lines }) => {
      const text = document.createElementNS(ns, 'text');
      text.dataset.formula = formula;
      for (const line of lines) {
        const span = document.createElementNS(ns, 'tspan');
        span.setAttribute('x', '28');
        span.setAttribute('y', String(42 + row * formulaLineHeight));
        span.textContent = line;
        text.append(span);
        row++;
      }
      svg.append(text);
    });
    face.append(svg);
  };

  const root = document.documentElement;
  root.classList.add('book-opening');
  let timer,
    finished = false,
    previousFocus;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    root.classList.remove('book-opening');
    document.querySelector('#book-intro')?.remove();
    document.querySelectorAll('[data-intro-inert]').forEach(el => {
      el.inert = false;
      el.removeAttribute('data-intro-inert');
    });
    document.removeEventListener('keydown', onKey);
    if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus({ preventScroll: true });
  };
  const onKey = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      finish();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      document.querySelector('.intro-skip')?.focus();
    }
  };
  const preload = src =>
    new Promise(resolve => {
      const img = new Image();
      let settled = false;
      const done = ok => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        resolve(ok);
      };
      const deadline = setTimeout(() => done(false), timing.assetWait);
      img.onload = async () => {
        try {
          await img.decode();
          done(true);
        } catch (_) {
          done(false);
        }
      };
      img.onerror = () => done(false);
      img.src = src;
    });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Fetch as soon as this head script runs, before building the intro DOM.
  const assetsReady = reduced
    ? Promise.resolve([])
    : Promise.all([preload('/intro-cover-v2.png'), preload('/intro-spine-v2.png')]);
  const fontReady = () =>
    new Promise(resolve => {
      const deadline = setTimeout(() => resolve(false), timing.assetWait);
      document.fonts.load('29px Quintessential').then(
        fonts => {
          clearTimeout(deadline);
          resolve(fonts.length > 0);
        },
        () => {
          clearTimeout(deadline);
          resolve(false);
        }
      );
    });
  timer = setTimeout(finish, total + timing.assetWait + 3000);
  document.addEventListener(
    'DOMContentLoaded',
    async () => {
      if (finished) return;
      if (reduced) {
        finish();
        return;
      }
      try {
        const overlay = document.createElement('section');
        overlay.id = 'book-intro';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute(
          'aria-label',
          'The life you seek is hidden inside the discipline you avoid. Opening your Daily Book.'
        );
        overlay.innerHTML = `<div class="intro-light" aria-hidden="true"></div><div class="intro-stage" aria-hidden="true"><div class="intro-book"><div class="intro-back"></div><div class="intro-block"></div><div class="intro-spine"></div><div class="intro-leaf intro-final"><span>Daily</span><small>ONE DAY AT A TIME</small></div>${Array.from({ length: leafCount }, (_, i) => `<div class="intro-leaf intro-leaf-${i}"><div class="intro-page-face intro-page-front"></div><div class="intro-page-face intro-page-back"></div></div>`).join('')}<div class="intro-cover"><div class="intro-cover-front"><p>The life you seek<br>is hidden inside<br>the discipline<br>you avoid.</p></div><div class="intro-cover-inside"></div></div></div></div><button class="intro-skip" type="button">Skip <span aria-hidden="true">→</span></button>`;
        const vars = {
          '--intro-hold': timing.hold,
          '--intro-cover-duration': timing.cover,
          '--intro-reveal-at': total - timing.reveal,
          '--intro-reveal-duration': timing.reveal
        };
        for (const [key, value] of Object.entries(vars)) overlay.style.setProperty(key, value + 'ms');
        overlay.querySelectorAll('.intro-leaf:not(.intro-final)').forEach((el, i) => {
          const progress = i / (leafCount - 1);
          const pageSpeed = timing.pages / 1700;
          el.style.setProperty('--leaf-at', timing.hold + timing.cover + (1 - progress) * 1460 * pageSpeed + 'ms');
          el.style.setProperty('--leaf-duration', (240 + progress * 460) * pageSpeed + 'ms');
          // DOM order is bottom-to-top: the last sheet turns first.
          const page = leafCount - 1 - i;
          for (const [side, atlas] of [
            ['front', 'a'],
            ['back', 'b']
          ]) {
            const face = el.querySelector('.intro-page-' + side);
            const facePage = page + (side === 'back' ? leafCount : 0);
            face.dataset.mathPage = String(facePage + 1);
            drawFormulas(face, facePage);
          }
        });
        previousFocus = document.activeElement;
        for (const el of document.body.children) {
          if (!el.inert && !['SCRIPT', 'STYLE'].includes(el.tagName)) {
            el.inert = true;
            el.setAttribute('data-intro-inert', '');
          }
        }
        document.body.append(overlay);
        overlay.querySelector('button').addEventListener('click', finish);
        overlay.querySelector('button').focus({ preventScroll: true });
        document.addEventListener('keydown', onKey);
        const [loaded, fontLoaded] = await Promise.all([assetsReady, fontReady()]);
        if (finished) return;
        // Never expose an incomplete book, including when an asset fails or times out.
        if (!loaded.every(Boolean) || !fontLoaded) {
          finish();
          return;
        }
        overlay.classList.add('intro-cover-loaded', 'intro-spine-loaded', 'intro-math-loaded');
        if (finished) return;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (finished) return;
            overlay.classList.add('intro-playing');
            overlay.dataset.startedAt = String(performance.now());
            clearTimeout(timer);
            timer = setTimeout(finish, total);
          })
        );
      } catch (_) {
        finish();
      }
    },
    { once: true }
  );
})();
