/* ===== Mundo em Foco - Main JS ===== */
(function () {
  'use strict';

  const CONFIG = {
    articlesPerPage: 12,
    dataUrl: 'data/articles.json',
    categories: {
      tecnologia: { name: 'Tecnologia', icon: '💻' },
      politica: { name: 'Política', icon: '🏛' },
      economia: { name: 'Economia', icon: '📊' },
      seguranca: { name: 'Segurança', icon: '🔒' },
      internacional: { name: 'Internacional', icon: '🌍' },
      negocios: { name: 'Negócios', icon: '💼' },
      geral: { name: 'Geral', icon: '📰' }
    }
  };

  let allArticles = [];
  let displayedCount = 0;

  // ===== Init =====
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    setupUI();
    await loadArticles();
    renderPage();
  }

  // ===== UI Setup =====
  function setupUI() {
    // Year
    const yearEl = document.getElementById('currentYear');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // Mobile menu
    const toggle = document.getElementById('menuToggle');
    const nav = document.getElementById('mainNav');
    if (toggle && nav) {
      toggle.addEventListener('click', () => nav.classList.toggle('open'));
    }

    // Search
    const searchBtn = document.getElementById('searchBtn');
    const searchInput = document.getElementById('searchInput');
    if (searchBtn && searchInput) {
      const doSearch = () => {
        const q = searchInput.value.trim();
        if (q) window.location.href = `index.html?q=${encodeURIComponent(q)}`;
      };
      searchBtn.addEventListener('click', doSearch);
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doSearch();
      });
    }

    // Load more
    const loadMore = document.getElementById('loadMoreBtn');
    if (loadMore) {
      loadMore.addEventListener('click', () => {
        renderNewsGrid();
      });
    }

    // Cookie banner
    if (!localStorage.getItem('cookieConsent')) {
      showCookieBanner();
    }
  }

  // ===== Data Loading =====
  async function loadArticles() {
    try {
      const resp = await fetch(CONFIG.dataUrl);
      if (!resp.ok) throw new Error('Failed to load articles');
      allArticles = await resp.json();
      // Sort by date descending
      allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (e) {
      console.warn('No articles yet:', e.message);
      allArticles = [];
    }
  }

  // ===== Render =====
  function renderPage() {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');

    let articles = allArticles;

    if (query) {
      const q = query.toLowerCase();
      articles = allArticles.filter(a =>
        a.title.toLowerCase().includes(q) ||
        (a.excerpt && a.excerpt.toLowerCase().includes(q)) ||
        (a.tags && a.tags.some(t => t.toLowerCase().includes(q)))
      );
      const title = document.querySelector('.section-title');
      if (title) title.textContent = `Resultados para "${query}"`;
    }

    renderBreakingNews(articles.slice(0, 5));
    renderFeatured(articles[0]);
    displayedCount = 0;
    renderNewsGrid(articles);
    renderCategories(allArticles);
  }

  function renderBreakingNews(articles) {
    const ticker = document.getElementById('tickerContent');
    const wrap = document.getElementById('breakingNews');
    if (!ticker || !wrap || !articles.length) {
      if (wrap) wrap.classList.add('hidden');
      return;
    }
    const html = articles.map(a =>
      `<a href="artigo.html?id=${a.slug}">${a.title}</a>`
    ).join('');
    ticker.innerHTML = html + html; // duplicate for seamless loop
  }

  function renderFeatured(article) {
    const section = document.getElementById('featuredSection');
    if (!section || !article) return;

    const catInfo = CONFIG.categories[article.category] || { name: article.category, icon: '📰' };
    const imgHtml = article.image
      ? `<img class="featured-img" src="${article.image}" alt="${escapeHtml(article.title)}" loading="lazy">`
      : `<div class="featured-img card-placeholder">${catInfo.icon}</div>`;
    const creditHtml = article.imageCredit ? `<span style="position:absolute;bottom:60px;right:16px;background:rgba(0,0,0,.7);color:#fff;font-size:.65rem;padding:2px 8px;border-radius:3px;z-index:3">${escapeHtml(article.imageCredit)}</span>` : '';

    section.innerHTML = `
      <a href="artigo.html?id=${article.slug}" class="featured-card">
        ${imgHtml}
        <div class="featured-overlay">
          <span class="featured-category">${catInfo.name}</span>
          <h2 class="featured-title">${escapeHtml(article.title)}</h2>
          <p class="featured-excerpt">${escapeHtml(article.excerpt || '')}</p>
          <span class="featured-date">${formatDate(article.date)}</span>
        </div>
        ${creditHtml}
      </a>`;
  }

  function renderNewsGrid(filteredArticles) {
    const grid = document.getElementById('newsGrid');
    const loadMore = document.getElementById('loadMoreBtn');
    if (!grid) return;

    const articles = filteredArticles || allArticles;
    const batch = articles.slice(displayedCount, displayedCount + CONFIG.articlesPerPage);
    displayedCount += batch.length;

    if (!batch.length && displayedCount === 0) {
      grid.innerHTML = '<p class="loading-spinner">Nenhuma notícia encontrada. Em breve teremos conteúdo!</p>';
      if (loadMore) loadMore.style.display = 'none';
      return;
    }

    const html = batch.map(a => {
      const catInfo = CONFIG.categories[a.category] || { name: a.category, icon: '📰' };
      const imgHtml = a.image
        ? `<div class="card-img-wrap"><img class="card-img" src="${a.image}" alt="${escapeHtml(a.title)}" loading="lazy">${a.imageCredit ? `<span class="card-img-credit">${escapeHtml(a.imageCredit)}</span>` : ''}</div>`
        : `<div class="card-placeholder">${catInfo.icon}</div>`;

      return `
        <div class="news-card">
          <a href="artigo.html?id=${a.slug}">
            ${imgHtml}
            <div class="card-body">
              <span class="card-category">${catInfo.name}</span>
              <h3 class="card-title">${escapeHtml(a.title)}</h3>
              <p class="card-excerpt">${escapeHtml(truncate(a.excerpt || '', 120))}</p>
              <div class="card-meta">
                <span>Por Renan Meneses</span>
                <span>${formatDate(a.date)}</span>
              </div>
            </div>
          </a>
        </div>`;
    }).join('');

    grid.insertAdjacentHTML('beforeend', html);

    if (loadMore) {
      loadMore.style.display = displayedCount >= articles.length ? 'none' : 'inline-block';
    }
  }

  function renderCategories(articles) {
    const container = document.getElementById('categoryColumns');
    if (!container) return;

    const grouped = {};
    articles.forEach(a => {
      if (!grouped[a.category]) grouped[a.category] = [];
      if (grouped[a.category].length < 5) grouped[a.category].push(a);
    });

    let html = '';
    for (const [cat, items] of Object.entries(grouped)) {
      const catInfo = CONFIG.categories[cat] || { name: cat };
      html += `
        <div class="category-block">
          <h3><a href="categoria.html?cat=${cat}">${catInfo.icon || ''} ${catInfo.name}</a></h3>
          ${items.map(a => `
            <div class="cat-item">
              <a href="artigo.html?id=${a.slug}">${escapeHtml(a.title)}</a>
              <span class="cat-date">${formatDate(a.date)}</span>
            </div>`).join('')}
        </div>`;
    }
    container.innerHTML = html;
  }

  // ===== Cookie Banner =====
  function showCookieBanner() {
    const banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.innerHTML = `
      <span>Este site usa cookies para melhorar sua experiência e exibir anúncios personalizados.
      Consulte nossa <a href="politica-privacidade.html">Política de Privacidade</a>.</span>
      <button id="acceptCookies">Aceitar</button>`;
    document.body.appendChild(banner);
    document.getElementById('acceptCookies').addEventListener('click', () => {
      localStorage.setItem('cookieConsent', 'true');
      banner.classList.add('hidden');
    });
  }

  // ===== Helpers =====
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function truncate(str, len) {
    return str.length > len ? str.substring(0, len) + '…' : str;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
