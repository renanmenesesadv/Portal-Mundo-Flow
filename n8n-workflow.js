/**
 * ============================================================
 * WORKFLOW N8N - Mundo Flow Notícias - Auto Publisher v3
 * ============================================================
 * Motor: Claude Sonnet 4.5 (Anthropic)
 * Imagens: Extraidas das fontes originais com creditos
 * Conteudo: Reescrito com voz editorial propria do portal
 * SEO: Keywords primaria + suporte geradas pelo Claude
 *
 * MELHORIAS v3:
 * - Structured Output Parser (JSON confiavel)
 * - Accumulator pattern (metadados preservados atraves do LLM)
 * - Validacao antes de publicar
 * - Retry automatico no Claude (3 tentativas)
 * - Author assignment por categoria
 * - Merge corrigido (bifurcacao via staticData)
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
  } catch (e) { /* skip feed */ }
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

return selected.length > 0 ? selected : [{ json: { error: 'Nenhuma noticia encontrada nos feeds' } }];
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

  if (data.image) {
    data.imageCredit = 'Foto: ' + data.source;
    results.push({ json: data });
    continue;
  }

  try {
    const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(data.link);
    const html = await $helpers.httpRequest({ method: 'GET', url: proxyUrl, timeout: 10000 });

    const ogMatch = html.match(/property="og:image"[^>]*content="([^"]+)"/i) ||
                     html.match(/content="([^"]+)"[^>]*property="og:image"/i);
    if (ogMatch) {
      data.image = ogMatch[1];
      data.imageCredit = 'Foto: Reproducao/' + data.source;
    }

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

// ===== 4. SALVAR METADADOS (Accumulator - preserva dados atraves do LLM) =====
const saveMetadata = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Salvar Metadados (Accumulator)',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const data = $getWorkflowStaticData('global');
const items = $input.all();

// Armazena metadados por URL da fonte (chave unica)
data.articleMetadata = {};

for (const item of items) {
  const key = item.json.link || '';
  if (key) {
    data.articleMetadata[key] = {
      image: item.json.image || '',
      imageCredit: item.json.imageCredit || '',
      source: item.json.source || '',
      category: item.json.category || '',
      link: item.json.link || '',
      pubDate: item.json.pubDate || ''
    };
  }
}

return items;
`
    },
    position: [960, 300]
  },
  output: [{ title: 'Noticia', link: 'https://example.com', source: 'Metropoles', image: 'https://example.com/og.jpg', imageCredit: 'Foto: Reproducao/Metropoles' }]
});

// ===== 5. CLAUDE LLM =====
const claudeModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  version: 1.3,
  config: {
    name: 'Claude Sonnet',
    parameters: {
      model: { __rl: true, mode: 'list', value: 'claude-sonnet-4-5-20250929', cachedResultName: 'Claude Sonnet 4.5' },
      options: {
        maxTokensToSample: 3000,
        temperature: 0.7
      }
    },
    credentials: { anthropicApi: newCredential('Anthropic Claude') },
    position: [1200, 600]
  }
});

// ===== 6. STRUCTURED OUTPUT PARSER (garante JSON valido) =====
const articleParser = node({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: {
    name: 'Article Parser',
    parameters: {
      jsonSchemaExample: JSON.stringify({
        title: "Titulo SEO atraente 55-65 caracteres",
        slug: "slug-seo-sem-acentos-max-60-chars",
        excerpt: "Resumo provocativo 140-155 caracteres que faca o leitor querer ler",
        body: "<h2>Subtitulo contextual</h2><p>Paragrafo de abertura forte...</p><h2>O que esperar</h2><p>Perspectiva...</p>",
        category: "politica",
        tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
        source: "BBC Brasil",
        sourceUrl: "https://example.com/artigo-original",
        primaryKeyword: "palavra-chave-principal-seo",
        supportingKeywords: ["keyword-apoio-1", "keyword-apoio-2", "keyword-apoio-3"]
      })
    },
    position: [1380, 600]
  }
});

// ===== 7. CLAUDE - Reescrever artigo com voz propria + SEO =====
const generateArticle = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 2.2,
  config: {
    name: 'Reescrever com Voz do Portal',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    parameters: {
      promptType: 'define',
      text: expr(
        'NOTICIA DE REFERENCIA (fonte: {{ $json.source }}):\n' +
        'Titulo original: {{ $json.title }}\n' +
        'Resumo: {{ $json.description }}\n' +
        'Categoria: {{ $json.category }}\n' +
        'Link fonte: {{ $json.link }}\n\n' +
        'Reescreva esta noticia seguindo as diretrizes editoriais do sistema.'
      ),
      hasOutputParser: true,
      options: {
        systemMessage:
          'Voce e o redator-chefe do portal "Mundo Flow Noticias", um site de noticias brasileiro com linguagem propria: ' +
          'acessivel, direta, levemente opinativa quando pertinente, e sempre contextualizando os fatos para o leitor brasileiro.\n\n' +
          'DIRETRIZES EDITORIAIS:\n' +
          '- Reescreva COMPLETAMENTE. Nao copie frases da fonte original\n' +
          '- Adicione CONTEXTO: por que isso importa para o brasileiro?\n' +
          '- Use linguagem acessivel mas profissional, como se explicasse para um amigo inteligente\n' +
          '- Inclua uma analise breve ou perspectiva no final ("O que esperar")\n' +
          '- Subtitulos devem ser informativos, nao genericos\n' +
          '- Paragrafos curtos (2-3 frases) para facilitar leitura em celular\n' +
          '- Se for noticia internacional, SEMPRE contextualize o impacto no Brasil\n\n' +
          'REGRAS SEO:\n' +
          '- Identifique a palavra-chave principal (primaryKeyword) que um usuario buscaria no Google\n' +
          '- Identifique 3 palavras-chave de apoio (supportingKeywords) relacionadas\n' +
          '- O titulo DEVE conter a primaryKeyword naturalmente\n' +
          '- Use as keywords no body de forma natural, nunca forcada\n' +
          '- Titulo SEO: 55-65 caracteres, voz propria, nao copie o original\n' +
          '- Excerpt: 140-155 caracteres, provocativo, que faca o leitor querer ler\n\n' +
          'REGRAS DO BODY HTML:\n' +
          '- Use tags <h2> para subtitulos e <p> para paragrafos\n' +
          '- Minimo 3 subtitulos (h2) para estruturar o artigo\n' +
          '- Ultimo subtitulo deve ser "O que esperar" com perspectiva/analise\n' +
          '- Tamanho ideal: 400-600 palavras no body\n\n' +
          'IMPORTANTE:\n' +
          '- O campo "source" deve ser exatamente o nome da fonte recebida\n' +
          '- O campo "sourceUrl" deve ser exatamente o link da fonte recebida\n' +
          '- O campo "category" deve ser exatamente a categoria recebida\n' +
          '- O campo "slug" deve ser sem acentos, apenas letras minusculas, numeros e hifens\n' +
          '- O campo "tags" deve conter exatamente 5 tags relevantes em portugues'
      }
    },
    subnodes: { model: claudeModel, outputParser: articleParser },
    position: [1200, 300]
  },
  output: [{ output: { title: 'Artigo', slug: 'artigo', excerpt: 'Resumo', body: '<p>Corpo</p>', category: 'geral', tags: ['tag1'], source: 'Fonte', sourceUrl: 'https://example.com', primaryKeyword: 'keyword', supportingKeywords: ['kw1'] } }]
});

// ===== 8. MONTAR ARTIGO FINAL (restaura metadados + valida + formata) =====
const buildArticle = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Montar e Validar Artigo Final',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const data = $getWorkflowStaticData('global');
const metadata = data.articleMetadata || {};
const items = $input.all();
const results = [];

// Mapa de autores por categoria
const authorMap = {
  politica: 'Renan Meneses',
  economia: 'Renan Meneses',
  tecnologia: 'Renan Meneses',
  negocios: 'Renan Meneses',
  internacional: 'Ana Claudia Barbalho',
  seguranca: 'Ana Claudia Barbalho',
  geral: 'Ana Claudia Barbalho'
};

for (const item of items) {
  try {
    // O output parser garante JSON valido em item.json.output
    const article = item.json.output || item.json;

    // === VALIDACAO ===
    if (!article.title || article.title.length < 10) continue;
    if (!article.body || article.body.length < 100) continue;
    if (!article.slug) continue;
    if (!article.source) continue;

    const now = new Date().toISOString();

    // Slug unico com timestamp
    const baseSlug = (article.slug || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      .substring(0, 60);
    const slug = baseSlug + '-' + Date.now().toString(36);

    // === RESTAURAR METADADOS DO ACCUMULATOR ===
    const meta = metadata[article.sourceUrl] || {};
    const image = meta.image || '';
    const imageCredit = meta.imageCredit || '';

    // Inserir imagem com credito no corpo
    let body = article.body || '';
    if (image && imageCredit) {
      body = '<figure><img src="' + image + '" alt="' + (article.title || '').replace(/"/g, '') + '" loading="lazy"><figcaption>' + imageCredit + '</figcaption></figure>' + body;
    }

    // Atribuicao de fonte no final
    body += '<p class="article-attribution"><em>Com informacoes de ' + (article.source || 'agencias') + '. Reportagem reescrita e contextualizada pela equipe Mundo Flow Noticias.</em></p>';

    // Author baseado na categoria
    const category = article.category || 'geral';
    const author = authorMap[category] || 'Redacao Mundo Flow';

    results.push({
      json: {
        title: article.title,
        slug: slug,
        excerpt: article.excerpt || '',
        body: body,
        category: category,
        tags: Array.isArray(article.tags) ? article.tags.slice(0, 5) : [],
        source: article.source || '',
        sourceUrl: article.sourceUrl || '',
        author: author,
        date: now,
        dateModified: now,
        readTime: Math.max(2, Math.ceil(body.replace(/<[^>]*>/g, '').split(/\\s+/).length / 200)) + ' min',
        image: image,
        imageCredit: imageCredit,
        primaryKeyword: article.primaryKeyword || '',
        supportingKeywords: article.supportingKeywords || []
      }
    });
  } catch (e) {
    // Artigo invalido, pula
  }
}

if (results.length === 0) {
  return [{ json: { error: 'Nenhum artigo passou na validacao', totalRecebidos: items.length } }];
}

return results;
`
    },
    position: [1500, 300]
  },
  output: [{ title: 'Artigo', slug: 'artigo-abc123', body: '<figure>...</figure><p>Corpo</p>', category: 'geral', author: 'Renan Meneses', image: 'https://img.com/x.jpg', imageCredit: 'Foto: Reproducao/Fonte', date: '2026-03-29T00:00:00Z', readTime: '3 min' }]
});

// ===== 9. GUARDAR ARTIGOS NOVOS NO STATIC DATA (antes do GitHub sobrescrever) =====
const storeNewArticles = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Guardar Artigos Novos',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const data = $getWorkflowStaticData('global');
const items = $input.all();

// Filtra apenas artigos validos (sem campo error)
const validArticles = items
  .map(i => i.json)
  .filter(a => a.title && a.slug && !a.error);

// Guarda no staticData para o merge recuperar depois
data.newArticles = validArticles;

// Passa adiante para o proximo node (GitHub read)
return items;
`
    },
    position: [1740, 300]
  },
  output: [{ title: 'Artigo', slug: 'artigo-abc123' }]
});

// ===== 10. LER ARTICLES.JSON DO GITHUB =====
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
    position: [1980, 300]
  },
  output: [{ content: 'W10=' }]
});

// ===== 11. MERGE: ARTIGOS NOVOS (staticData) + EXISTENTES (GitHub) =====
const mergeArticles = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Merge Artigos (sem duplicatas)',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const data = $getWorkflowStaticData('global');
const items = $input.all();

// === ARTIGOS NOVOS: recuperar do staticData (preservados da bifurcacao) ===
const newArticles = data.newArticles || [];

// === ARTIGOS EXISTENTES: decodificar do GitHub ===
let existingArticles = [];
for (const item of items) {
  if (item.json.content) {
    try {
      const decoded = Buffer.from(item.json.content, 'base64').toString('utf-8');
      existingArticles = JSON.parse(decoded);
      if (!Array.isArray(existingArticles)) existingArticles = [];
    } catch (e) {
      existingArticles = [];
    }
    break;
  }
}

// === MERGE: sem duplicatas por slug ===
const existingSlugs = new Set(existingArticles.map(a => a.slug));

// Tambem checa por titulo similar para evitar mesma noticia com slug diferente
const existingTitles = new Set(
  existingArticles.map(a => (a.title || '').toLowerCase().substring(0, 40))
);

const uniqueNew = newArticles.filter(a => {
  if (existingSlugs.has(a.slug)) return false;
  const titleKey = (a.title || '').toLowerCase().substring(0, 40);
  if (existingTitles.has(titleKey)) return false;
  return true;
});

// Novos primeiro (mais recentes no topo), maximo 300 artigos
const allArticles = [...uniqueNew, ...existingArticles].slice(0, 300);

// Limpar staticData
delete data.newArticles;
delete data.articleMetadata;

if (uniqueNew.length === 0) {
  return [{ json: {
    articlesJson: JSON.stringify(allArticles, null, 2),
    articleCount: allArticles.length,
    newCount: 0,
    skipped: true,
    message: 'Nenhum artigo novo (todos duplicados)'
  }}];
}

return [{
  json: {
    articlesJson: JSON.stringify(allArticles, null, 2),
    articleCount: allArticles.length,
    newCount: uniqueNew.length,
    skipped: false
  }
}];
`
    },
    position: [2220, 300]
  },
  output: [{ articlesJson: '[]', articleCount: 0, newCount: 0, skipped: false }]
});

// ===== 12. COMMIT NO GITHUB =====
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
      commitMessage: expr('Publicar {{ $json.newCount }} artigos - Mundo Flow Noticias (total: {{ $json.articleCount }})')
    },
    credentials: { githubApi: newCredential('GitHub Personal Token') },
    position: [2460, 300]
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

const noteBugs = sticky(
  '## Melhorias v3\\n\\n' +
  '**Bugs corrigidos:**\\n' +
  '- Metadados (imagem/credito) preservados via Accumulator pattern\\n' +
  '- Artigos novos nao se perdem mais no GitHub read (staticData)\\n' +
  '- Deduplicacao por slug + titulo similar\\n\\n' +
  '**Novidades:**\\n' +
  '- Structured Output Parser → JSON sempre valido\\n' +
  '- Retry automatico (3x) se Claude falhar\\n' +
  '- Validacao: titulo, body, slug obrigatorios\\n' +
  '- Author atribuido por categoria\\n' +
  '- SEO keywords integradas (primaryKeyword + supporting)\\n' +
  '- Limite aumentado para 300 artigos',
  [generateArticle], { color: 6 }
);

const noteFlow = sticky(
  '## Fluxo v3\\n\\n' +
  '1. Busca 9 feeds RSS\\n' +
  '2. Extrai imagens (RSS + og:image)\\n' +
  '3. **Salva metadados** no Accumulator\\n' +
  '4. Claude reescreve + gera SEO keywords\\n' +
  '5. **Restaura metadados** + valida artigo\\n' +
  '6. **Guarda artigos** no staticData\\n' +
  '7. Le articles.json do GitHub\\n' +
  '8. **Merge inteligente** (staticData + GitHub)\\n' +
  '9. Commit no GitHub Pages',
  [mergeArticles], { color: 2 }
);

// ===== WORKFLOW =====
export default workflow('mundo-em-foco-publisher-v3', 'Mundo Flow Noticias - Auto Publisher v3')
  .add(scheduleTrigger)
  .to(extractNews)
  .to(fetchSourceImage)
  .to(saveMetadata)
  .to(generateArticle)
  .to(buildArticle)
  .to(storeNewArticles)
  .to(getArticlesJson)
  .to(mergeArticles)
  .to(updateGitHub);
