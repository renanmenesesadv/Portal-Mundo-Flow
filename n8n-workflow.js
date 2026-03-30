/**
 * ============================================================
 * WORKFLOW N8N - Mundo Flow Notícias - Auto Publisher v2
 * ============================================================
 * Motor: Claude Sonnet 4.5 (Anthropic)
 * Imagens: Extraidas das fontes originais com creditos
 * Conteudo: Reescrito com voz editorial propria do portal
 *
 * SETUP:
 * 1. Crie credencial "Anthropic Claude" no n8n (sua API key)
 * 2. Crie credencial "GitHub Personal Token" (scope: repo)
 * 3. Importe este arquivo no n8n
 * 4. Preencha os placeholders amarelos
 * 5. Ative o workflow
 * ============================================================
 */

import { workflow, node, trigger, sticky, placeholder, newCredential, expr, languageModel } from '@n8n/workflow-sdk';

// ===== 1. SCHEDULE TRIGGER - A cada 2 horas =====
const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'A cada 2 horas',
    parameters: {
      rule: {
        interval: [{
          field: 'hours',
          hoursInterval: 2
        }]
      }
    },
    position: [240, 300]
  },
  output: [{}]
});

// ===== 2. BUSCAR FEEDS RSS =====
const extractNews = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Buscar e Extrair Noticias dos Feeds',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const feeds = [
  { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.metropoles.com/feed'), source: 'Metropoles', category: 'geral' },
  { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.poder360.com.br/feed/'), source: 'Poder360', category: 'politica' },
  { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://feeds.bbci.co.uk/portuguese/rss.xml'), source: 'BBC Brasil', category: 'internacional' },
  { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://rss.nytimes.com/services/xml/rss/nyt/World.xml'), source: 'NY Times', category: 'internacional' },
  { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.infomoney.com.br/feed/'), source: 'InfoMoney', category: 'economia' },
  { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.jota.info/feed'), source: 'JOTA', category: 'politica' },
  { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://feeds.bbci.co.uk/news/world/rss.xml'), source: 'BBC World', category: 'internacional' },
  { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.cnnbrasil.com.br/feed/'), source: 'CNN Brasil', category: 'geral' },
  { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://exame.com/feed/'), source: 'Exame', category: 'negocios' }
];

const results = [];

for (const feed of feeds) {
  try {
    const response = await $helpers.httpRequest({ method: 'GET', url: feed.url, timeout: 15000 });
    const items = response.split('<item>').slice(1, 6);

    for (const item of items) {
      const getTag = (tag) => {
        const match = item.match(new RegExp('<' + tag + '[^>]*>(.*?)</' + tag + '>', 's'));
        if (match) return match[1].replace(/<!\\[CDATA\\[|\\]\\]>/g, '').trim();
        return '';
      };

      const title = getTag('title');
      const link = getTag('link') || getTag('guid');
      const description = getTag('description').replace(/<[^>]*>/g, '').substring(0, 300);
      const pubDate = getTag('pubDate');

      // Extrair imagem do feed (media:content, enclosure, ou img no description)
      let image = '';
      const mediaMatch = item.match(/url="(https?:\\/\\/[^"]+\\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
      if (mediaMatch) image = mediaMatch[1];
      if (!image) {
        const imgMatch = item.match(/src="(https?:\\/\\/[^"]+\\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
        if (imgMatch) image = imgMatch[1];
      }
      if (!image) {
        const encMatch = item.match(/<enclosure[^>]+url="(https?:\\/\\/[^"]+)"/i);
        if (encMatch) image = encMatch[1];
      }

      if (title && title.length > 10) {
        results.push({
          json: { title, link, description, pubDate, source: feed.source, category: feed.category, image }
        });
      }
    }
  } catch (e) { /* skip */ }
}

// Selecionar 5 noticias variadas (1 por fonte, mais recentes)
const selected = [];
const usedSources = new Set();
const sorted = results.sort((a, b) => new Date(b.json.pubDate) - new Date(a.json.pubDate));

for (const item of sorted) {
  if (selected.length >= 5) break;
  if (!usedSources.has(item.json.source)) {
    usedSources.add(item.json.source);
    selected.push(item);
  }
}

return selected.length > 0 ? selected : [{ json: { error: 'Nenhuma noticia' } }];
`
    },
    position: [480, 300]
  },
  output: [{ title: 'Noticia', link: 'https://example.com', description: 'Desc', pubDate: '2026-03-29', source: 'Metropoles', category: 'geral', image: 'https://example.com/img.jpg' }]
});

// ===== 3. BUSCAR IMAGEM OG DA FONTE (fallback) =====
const fetchSourceImage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Buscar Imagem Original da Fonte',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const items = $input.all();
const results = [];

for (const item of items) {
  const data = { ...item.json };

  // Se ja tem imagem do RSS, usa ela
  if (data.image) {
    data.imageCredit = 'Foto: ' + data.source;
    results.push({ json: data });
    continue;
  }

  // Senao, tenta buscar og:image da pagina original
  try {
    const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(data.link);
    const html = await $helpers.httpRequest({ method: 'GET', url: proxyUrl, timeout: 10000 });

    // Buscar og:image
    const ogMatch = html.match(/property="og:image"[^>]*content="([^"]+)"/i) ||
                     html.match(/content="([^"]+)"[^>]*property="og:image"/i);
    if (ogMatch) {
      data.image = ogMatch[1];
      data.imageCredit = 'Foto: Reproducao/' + data.source;
    }

    // Buscar twitter:image como fallback
    if (!data.image) {
      const twMatch = html.match(/name="twitter:image"[^>]*content="([^"]+)"/i);
      if (twMatch) {
        data.image = twMatch[1];
        data.imageCredit = 'Foto: Reproducao/' + data.source;
      }
    }
  } catch (e) { /* sem imagem */ }

  if (!data.image) {
    data.image = '';
    data.imageCredit = '';
  }

  results.push({ json: data });
}

return results;
`
    },
    position: [720, 300]
  },
  output: [{ title: 'Noticia', link: 'https://example.com', description: 'Desc', source: 'Metropoles', category: 'geral', image: 'https://example.com/og.jpg', imageCredit: 'Foto: Reproducao/Metropoles' }]
});

// ===== 4. CLAUDE - Reescrever artigo com voz propria =====
const claudeModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  version: 1.3,
  config: {
    name: 'Claude Sonnet',
    parameters: {
      model: { __rl: true, mode: 'list', value: 'claude-sonnet-4-5-20250929', cachedResultName: 'Claude Sonnet 4.5' },
      options: {
        maxTokensToSample: 3000,
        temperature: 0.75
      }
    },
    credentials: { anthropicApi: newCredential('Anthropic Claude') },
    position: [960, 500]
  }
});

const generateArticle = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: {
    name: 'Reescrever com Voz do Portal',
    parameters: {
      promptType: 'define',
      text: expr(
        'Voce e o redator-chefe do portal "Mundo Flow Notícias", um site de noticias brasileiro com linguagem propria: ' +
        'acessivel, direta, levemente opinativa quando pertinente, e sempre contextualizando os fatos para o leitor brasileiro. ' +
        'Voce NAO replica noticias - voce REESCREVE com analise, contexto e a voz editorial unica do Mundo Flow Notícias.\n\n' +
        'NOTICIA DE REFERENCIA (fonte: {{ $json.source }}):\n' +
        'Titulo original: {{ $json.title }}\n' +
        'Resumo: {{ $json.description }}\n' +
        'Categoria: {{ $json.category }}\n' +
        'Link fonte: {{ $json.link }}\n' +
        'Credito imagem: {{ $json.imageCredit }}\n\n' +
        'DIRETRIZES EDITORIAIS DO MUNDO EM FOCO:\n' +
        '- Reescreva COMPLETAMENTE. Nao copie frases da fonte original\n' +
        '- Adicione CONTEXTO: por que isso importa para o brasileiro?\n' +
        '- Use linguagem acessivel mas profissional, como se explicasse para um amigo inteligente\n' +
        '- Inclua uma analise breve ou perspectiva no final ("O que esperar")\n' +
        '- Subtitulos devem ser informativos, nao genericos\n' +
        '- Paragrafos curtos (2-3 frases) para facilitar leitura em celular\n' +
        '- Se for noticia internacional, SEMPRE contextualize o impacto no Brasil\n' +
        '- Palavras-chave SEO devem aparecer naturalmente, nunca forcadas\n\n' +
        'FORMATO DE RESPOSTA (JSON puro, sem markdown):\n' +
        '{\n' +
        '  "title": "Titulo SEO atraente 55-65 chars, voz propria, nao copie o original",\n' +
        '  "slug": "slug-seo-sem-acentos-max-60-chars",\n' +
        '  "excerpt": "Resumo provocativo 140-155 chars que faca o leitor querer ler",\n' +
        '  "body": "<h2>Subtitulo contextual</h2><p>Paragrafo de abertura forte...</p><h2>Outro subtitulo</h2><p>Analise...</p><h2>O que esperar</h2><p>Perspectiva...</p>",\n' +
        '  "category": "{{ $json.category }}",\n' +
        '  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],\n' +
        '  "source": "{{ $json.source }}",\n' +
        '  "sourceUrl": "{{ $json.link }}"\n' +
        '}'
      )
    },
    subnodes: { model: claudeModel },
    position: [960, 300]
  },
  output: [{ text: '{"title":"Artigo","slug":"artigo","excerpt":"Resumo","body":"<p>Corpo</p>","category":"geral","tags":["tag1"],"source":"Fonte","sourceUrl":"https://example.com"}' }]
});

// ===== 5. PROCESSAR ARTIGO + IMAGEM =====
const processArticle = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Montar Artigo Final com Imagem e Creditos',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const items = $input.all();
const results = [];

for (const item of items) {
  try {
    const raw = item.json.text || item.json.output || JSON.stringify(item.json);

    let cleaned = raw.replace(/\\\`\\\`\\\`json\\n?|\\n?\\\`\\\`\\\`/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }

    const article = JSON.parse(cleaned);
    const now = new Date().toISOString();

    // Slug unico
    const baseSlug = (article.slug || article.title || 'artigo').toLowerCase()
      .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      .substring(0, 60);

    // Recuperar imagem e credito
    const image = item.json.image || '';
    const imageCredit = item.json.imageCredit || '';

    // Inserir imagem com credito no corpo
    let body = article.body || '';
    if (image && imageCredit) {
      body = '<figure><img src="' + image + '" alt="' + (article.title || '').replace(/"/g, '') + '" loading="lazy"><figcaption>' + imageCredit + '</figcaption></figure>' + body;
    }

    // Atribuicao de fonte no final
    body += '<p class="article-attribution"><em>Com informacoes de ' + (article.source || 'agencias') + '. Reportagem reescrita e contextualizada pela equipe Mundo Flow Notícias.</em></p>';

    results.push({
      json: {
        title: article.title || 'Sem titulo',
        slug: baseSlug + '-' + Date.now().toString(36),
        excerpt: article.excerpt || '',
        body: body,
        category: article.category || 'geral',
        tags: article.tags || [],
        source: article.source || '',
        sourceUrl: article.sourceUrl || '',
        date: now,
        dateModified: now,
        readTime: Math.max(2, Math.ceil(body.replace(/<[^>]*>/g, '').split(/\\s+/).length / 200)) + ' min',
        image: image,
        imageCredit: imageCredit
      }
    });
  } catch (e) { /* skip */ }
}

return results.length > 0 ? results : [{ json: { error: 'Nenhum artigo processado' } }];
`
    },
    position: [1200, 300]
  },
  output: [{ title: 'Artigo', slug: 'artigo-abc', body: '<figure>...</figure><p>Corpo</p>', category: 'geral', image: 'https://img.com/x.jpg', imageCredit: 'Foto: Reproducao/Fonte', date: '2026-03-29T00:00:00Z', readTime: '3 min' }]
});

// ===== 6. LER ARTICLES.JSON DO GITHUB =====
const getArticlesJson = node({
  type: 'n8n-nodes-base.github',
  version: 1.1,
  config: {
    name: 'Ler articles.json do GitHub',
    parameters: {
      resource: 'file',
      operation: 'get',
      owner: { __rl: true, mode: 'name', value: placeholder('renanmenesesadv') },
      repository: { __rl: true, mode: 'name', value: placeholder('Portal-Mundo-Flow') },
      filePath: 'data/articles.json',
      asBinaryProperty: false
    },
    credentials: { githubApi: newCredential('GitHub Personal Token') },
    onError: 'continueErrorOutput',
    position: [1440, 300]
  },
  output: [{ content: 'W10=' }]
});

// ===== 7. MERGE NOVOS + EXISTENTES =====
const mergeArticles = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Merge Artigos (sem duplicatas)',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const items = $input.all();
let existingArticles = [];
let newArticles = [];

for (const item of items) {
  if (item.json.content) {
    try {
      const decoded = Buffer.from(item.json.content, 'base64').toString('utf-8');
      existingArticles = JSON.parse(decoded);
    } catch (e) { existingArticles = []; }
  } else if (item.json.title && item.json.slug) {
    newArticles.push(item.json);
  }
}

const existingSlugs = new Set(existingArticles.map(a => a.slug));
const uniqueNew = newArticles.filter(a => !existingSlugs.has(a.slug));
const allArticles = [...uniqueNew, ...existingArticles].slice(0, 200);

return [{
  json: {
    articlesJson: JSON.stringify(allArticles, null, 2),
    articleCount: allArticles.length,
    newCount: uniqueNew.length
  }
}];
`
    },
    position: [1680, 300]
  },
  output: [{ articlesJson: '[]', articleCount: 0, newCount: 0 }]
});

// ===== 8. COMMIT NO GITHUB =====
const updateGitHub = node({
  type: 'n8n-nodes-base.github',
  version: 1.1,
  config: {
    name: 'Publicar no GitHub Pages',
    parameters: {
      resource: 'file',
      operation: 'edit',
      owner: { __rl: true, mode: 'name', value: placeholder('renanmenesesadv') },
      repository: { __rl: true, mode: 'name', value: placeholder('Portal-Mundo-Flow') },
      filePath: 'data/articles.json',
      fileContent: expr('{{ $json.articlesJson }}'),
      commitMessage: expr('Publicar {{ $json.newCount }} artigos - Mundo Flow Notícias (total: {{ $json.articleCount }})')
    },
    credentials: { githubApi: newCredential('GitHub Personal Token') },
    position: [1920, 300]
  },
  output: [{ commit: { sha: 'abc123' } }]
});

// ===== STICKY NOTES =====
const noteSetup = sticky(
  '## Setup Inicial\\n\\n' +
  '1. Crie credencial **Anthropic Claude** com sua API key\\n' +
  '2. Crie credencial **GitHub Personal Token** (scope: repo)\\n' +
  '3. Preencha os placeholders amarelos com seu usuario/repo\\n' +
  '4. Ative o workflow!',
  [scheduleTrigger], { color: 4 }
);

const noteFlow = sticky(
  '## Como Funciona\\n\\n' +
  '1. Busca 9 feeds RSS (Metropoles, Poder360, BBC, NYT, CNN, InfoMoney...)\\n' +
  '2. Extrai imagens originais (RSS + og:image da fonte)\\n' +
  '3. Claude reescreve com voz propria do Mundo Flow Notícias\\n' +
  '4. Adiciona credito de imagem + atribuicao de fonte\\n' +
  '5. Merge com artigos existentes + commit no GitHub\\n' +
  '6. GitHub Pages publica automaticamente',
  [generateArticle], { color: 6 }
);

// ===== WORKFLOW =====
export default workflow('mundo-em-foco-publisher', 'Mundo Flow Notícias - Auto Publisher')
  .add(scheduleTrigger)
  .to(extractNews)
  .to(fetchSourceImage)
  .to(generateArticle)
  .to(processArticle)
  .to(getArticlesJson)
  .to(mergeArticles)
  .to(updateGitHub);
