/* ===== Mundo em Foco - Article Page JS ===== */
(function () {
  'use strict';

  const BASE_URL = 'https://mundoflownoticias.com.br/';
  const DATA_URL = 'data/articles.json';

  const CATEGORIES = {
    tecnologia: 'Tecnologia',
    politica: 'Pol\u00edtica',
    economia: 'Economia',
    seguranca: 'Seguran\u00e7a',
    internacional: 'Internacional',
    negocios: 'Neg\u00f3cios',
    geral: 'Geral'
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    setupUI();
    const slug = new URLSearchParams(window.location.search).get('id');
    if (!slug) return showError();

    const articles = await loadArticles();
    const article = articles.find(a => a.slug === slug);
    if (!article) return showError();

    renderArticle(article);
    renderRelated(article, articles);
    renderPopular(articles);
    updateSEO(article);
    setupShare(article);
  }

  function setupUI() {
    const yearEl = document.getElementById('currentYear');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    const toggle = document.getElementById('menuToggle');
    const nav = document.getElementById('mainNav');
    if (toggle && nav) {
      toggle.addEventListener('click', () => nav.classList.toggle('open'));
    }

    const searchBtn = document.getElementById('searchBtn');
    const searchInput = document.getElementById('searchInput');
    if (searchBtn && searchInput) {
      const doSearch = () => {
        const q = searchInput.value.trim();
        if (q) window.location.href = `index.html?q=${encodeURIComponent(q)}`;
      };
      searchBtn.addEventListener('click', doSearch);
      searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') doSearch(); });
    }
  }

  async function loadArticles() {
    try {
      const resp = await fetch(DATA_URL);
      if (!resp.ok) throw new Error('Failed');
      const data = await resp.json();
      data.sort((a, b) => new Date(b.date) - new Date(a.date));
      return data;
    } catch {
      return [];
    }
  }

  function renderArticle(article) {
    const catName = CATEGORIES[article.category] || article.category;

    // Header
    const catEl = document.getElementById('articleCategory');
    if (catEl) catEl.textContent = catName;

    const titleEl = document.getElementById('articleTitle');
    if (titleEl) titleEl.textContent = article.title;

    const dateEl = document.getElementById('articleDate');
    if (dateEl) {
      dateEl.textContent = formatDate(article.date);
      dateEl.setAttribute('datetime', article.date);
    }

    const authorEl = document.getElementById('authorName');
    if (authorEl) authorEl.textContent = article.author || 'Renan Meneses';

    const sourceEl = document.getElementById('articleSource');
    if (sourceEl) sourceEl.textContent = article.source || 'Mundo em Foco';

    const readTimeEl = document.getElementById('articleReadTime');
    if (readTimeEl) readTimeEl.textContent = article.readTime || calcReadTime(article.body) + ' min de leitura';

    // Body - article.body is HTML
    const bodyEl = document.getElementById('articleBody');
    if (bodyEl) bodyEl.innerHTML = article.body || '<p>Conte\u00fado n\u00e3o dispon\u00edvel.</p>';

    // Tags
    const tagsEl = document.getElementById('articleTags');
    if (tagsEl && article.tags && article.tags.length) {
      tagsEl.innerHTML = article.tags.map(t =>
        `<a href="index.html?q=${encodeURIComponent(t)}" class="tag">${t}</a>`
      ).join('');
    }

    // Source link
    const srcLink = document.getElementById('originalSourceLink');
    if (srcLink && article.sourceUrl) {
      srcLink.href = article.sourceUrl;
    } else if (srcLink) {
      srcLink.style.display = 'none';
    }

    // Breadcrumb
    const bcCat = document.getElementById('breadcrumbCategory');
    const bcCatName = document.getElementById('breadcrumbCatName');
    const bcTitle = document.getElementById('breadcrumbTitle');
    if (bcCat) bcCat.querySelector('a').href = `categoria.html?cat=${article.category}`;
    if (bcCatName) bcCatName.textContent = catName;
    if (bcTitle) bcTitle.textContent = truncate(article.title, 60);
  }

  function updateSEO(article) {
    const url = `${BASE_URL}artigo.html?id=${article.slug}`;
    const desc = article.excerpt || truncate(stripHtml(article.body || ''), 160);
    const catName = CATEGORIES[article.category] || article.category;

    document.title = `${article.title} - Mundo em Foco`;
    setMeta('metaDescription', desc);
    setMeta('metaKeywords', (article.tags || []).join(', ') + ', not\u00edcias, ' + catName);
    setAttr('canonicalLink', 'href', url);

    // OG
    setMeta('ogTitle', article.title);
    setMeta('ogDescription', desc);
    setAttr('ogUrl', 'content', url);
    if (article.image) setAttr('ogImage', 'content', article.image);
    setAttr('ogPublished', 'content', article.date);
    setAttr('ogSection', 'content', catName);

    // Twitter
    setMeta('twTitle', article.title);
    setMeta('twDescription', desc);
    if (article.image) setAttr('twImage', 'content', article.image);

    // Page title
    const ptEl = document.getElementById('pageTitle');
    if (ptEl) ptEl.textContent = `${article.title} - Mundo em Foco`;

    // Article Schema
    const schemaEl = document.getElementById('articleSchema');
    if (schemaEl) {
      schemaEl.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: article.title,
        description: desc,
        datePublished: article.date,
        dateModified: article.dateModified || article.date,
        author: {
          '@type': 'Person',
          name: article.author || 'Renan Meneses',
          url: 'https://mundoflownoticias.com.br/sobre.html'
        },
        publisher: {
          '@type': 'Organization',
          name: 'Mundo em Foco',
          logo: { '@type': 'ImageObject', url: BASE_URL + 'img/logo.png' }
        },
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        image: article.image || BASE_URL + 'img/default-article.png',
        articleSection: catName,
        keywords: (article.tags || []).join(', ')
      });
    }
  }

  function setupShare(article) {
    const url = encodeURIComponent(`${BASE_URL}artigo.html?id=${article.slug}`);
    const title = encodeURIComponent(article.title);
    const fullUrl = `${BASE_URL}artigo.html?id=${article.slug}`;

    setAttr('shareWhatsapp', 'href', `https://wa.me/?text=${title}%20${url}`);
    setAttr('shareFacebook', 'href', `https://www.facebook.com/sharer/sharer.php?u=${url}`);
    setAttr('shareTwitter', 'href', `https://twitter.com/intent/tweet?text=${title}&url=${url}`);
    setAttr('shareTelegram', 'href', `https://t.me/share/url?url=${url}&text=${title}`);

    const copyBtn = document.getElementById('copyLink');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(fullUrl).then(() => {
          copyBtn.textContent = 'Copiado!';
          setTimeout(() => { copyBtn.textContent = 'Copiar Link'; }, 2000);
        });
      });
    }
  }

  function renderRelated(article, all) {
    const container = document.getElementById('relatedArticles');
    if (!container) return;

    const related = all
      .filter(a => a.slug !== article.slug && a.category === article.category)
      .slice(0, 5);

    if (!related.length) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem">Nenhuma not\u00edcia relacionada.</p>';
      return;
    }

    container.innerHTML = related.map(a => `
      <div class="related-item">
        <a href="artigo.html?id=${a.slug}">
          <h4>${escapeHtml(a.title)}</h4>
        </a>
        <span class="related-date">${formatDate(a.date)}</span>
      </div>`).join('');
  }

  function renderPopular(all) {
    const container = document.getElementById('popularArticles');
    if (!container) return;

    const popular = all.slice(0, 5);
    container.innerHTML = popular.map(a => `
      <div class="related-item">
        <a href="artigo.html?id=${a.slug}">
          <h4>${escapeHtml(a.title)}</h4>
        </a>
        <span class="related-date">${formatDate(a.date)}</span>
      </div>`).join('');
  }

  function showError() {
    const body = document.getElementById('articleBody');
    if (body) {
      body.innerHTML = `
        <div class="error-page">
          <h2>404</h2>
          <p>Artigo n\u00e3o encontrado.</p>
          <a href="index.html" style="color:var(--accent)">Voltar para a p\u00e1gina inicial</a>
        </div>`;
    }
    const title = document.getElementById('articleTitle');
    if (title) title.textContent = 'Artigo n\u00e3o encontrado';
  }

  // Helpers
  function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function calcReadTime(html) {
    const text = stripHtml(html || '');
    return Math.max(1, Math.ceil(text.split(/\s+/).length / 200));
  }

  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || '';
  }

  function truncate(str, len) {
    return str.length > len ? str.substring(0, len) + '\u2026' : str;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function setMeta(id, value) {
    const el = document.getElementById(id);
    if (el) el.setAttribute('content', value);
  }

  function setAttr(id, attr, value) {
    const el = document.getElementById(id);
    if (el) el.setAttribute(attr, value);
  }
})();
