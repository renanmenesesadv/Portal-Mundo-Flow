/**
 * ============================================================
 * WORKFLOW N8N - Blog Noticias Mundo - Auto Publisher
 * ============================================================
 *
 * COMO USAR:
 * 1. Abra seu n8n (https://app.n8n.cloud ou local)
 * 2. Antes de importar, crie as credenciais:
 *    - "GitHub API": Personal Access Token com scope "repo"
 *    - "OpenAI API": Sua API key da OpenAI
 * 3. Importe este codigo via n8n MCP ou cole no editor
 * 4. Preencha os placeholders (usuario e repo GitHub)
 * 5. Ative o workflow
 *
 * FLUXO:
 * Schedule (2h) -> Busca RSS -> Extrai Noticias -> Gera Artigo IA ->
 * Processa JSON -> Le GitHub -> Merge -> Commit no GitHub
 * ============================================================
 */

import { workflow, node, trigger, sticky, placeholder, newCredential, expr, languageModel } from '@n8n/workflow-sdk';

// ===== 1. SCHEDULE TRIGGER - Executa a cada 2 horas =====
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

// ===== 2. FETCH RADAR HUB - Busca noticias do site fonte =====
const fetchRadarHub = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Buscar Radar Hub',
    parameters: {
      method: 'GET',
      url: 'https://renanmenesesadv.github.io/radar-rn-hub/',
      options: {
        response: {
          response: {
            responseFormat: 'text',
            outputPropertyName: 'data'
          }
        }
      }
    },
    position: [480, 300]
  },
  output: [{ data: '<html>...</html>' }]
});

// ===== 3. EXTRAIR NOTICIAS - Code node para parsear HTML e extrair feeds =====
const extractNews = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Extrair Noticias do HTML',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
// Busca diretamente os feeds RSS mais relevantes (mesmas fontes do Radar Hub)
const feeds = [
  { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.metropoles.com/feed'), source: 'Metropoles', category: 'geral', region: 'nacional' },
  { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.poder360.com.br/feed/'), source: 'Poder360', category: 'politica', region: 'nacional' },
  { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://feeds.bbci.co.uk/portuguese/rss.xml'), source: 'BBC Brasil', category: 'internacional', region: 'internacional' },
  { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://rss.nytimes.com/services/xml/rss/nyt/World.xml'), source: 'NY Times', category: 'internacional', region: 'internacional' },
  { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.infomoney.com.br/feed/'), source: 'InfoMoney', category: 'economia', region: 'nacional' },
  { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.jota.info/feed'), source: 'JOTA', category: 'politica', region: 'nacional' },
  { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://feeds.bbci.co.uk/news/world/rss.xml'), source: 'BBC World', category: 'internacional', region: 'internacional' }
];

const results = [];

for (const feed of feeds) {
  try {
    const response = await $helpers.httpRequest({
      method: 'GET',
      url: feed.url,
      timeout: 15000
    });

    const items = response.split('<item>').slice(1, 6);

    for (const item of items) {
      const getTag = (tag) => {
        const match = item.match(new RegExp('<' + tag + '>(.*?)</' + tag + '>', 's'));
        if (match) return match[1].replace(/<!\\[CDATA\\[|\\]\\]>/g, '').trim();
        return '';
      };

      const title = getTag('title');
      const link = getTag('link') || getTag('guid');
      const description = getTag('description').replace(/<[^>]*>/g, '').substring(0, 250);
      const pubDate = getTag('pubDate');

      if (title && title.length > 10) {
        results.push({
          json: {
            title,
            link,
            description,
            pubDate,
            source: feed.source,
            category: feed.category,
            region: feed.region
          }
        });
      }
    }
  } catch (e) {
    // Skip failed feeds
  }
}

// Selecionar 5 noticias variadas (1 por fonte, mais recentes primeiro)
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

return selected.length > 0 ? selected : [{ json: { error: 'Nenhuma noticia encontrada' } }];
`
    },
    position: [720, 300]
  },
  output: [{ title: 'Noticia exemplo', link: 'https://example.com', description: 'Desc', pubDate: '2026-03-29', source: 'Metropoles', category: 'geral', region: 'nacional' }]
});

// ===== 4. LLM - Gerar artigo otimizado SEO =====
const openAiModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.3,
  config: {
    name: 'OpenAI GPT',
    parameters: {
      model: { __rl: true, mode: 'list', value: 'gpt-4o-mini' },
      options: {
        temperature: 0.7,
        maxTokens: 2000
      }
    },
    credentials: { openAiApi: newCredential('OpenAI API') },
    position: [960, 500]
  }
});

const generateArticle = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: {
    name: 'Gerar Artigo SEO',
    parameters: {
      promptType: 'define',
      text: expr('Voce e um jornalista digital especializado em SEO e monetizacao com AdSense. ' +
        'Com base na noticia abaixo, crie um artigo COMPLETO e ORIGINAL em portugues brasileiro.\n\n' +
        'NOTICIA FONTE:\n' +
        'Titulo: {{ $json.title }}\n' +
        'Descricao: {{ $json.description }}\n' +
        'Fonte: {{ $json.source }}\n' +
        'Categoria: {{ $json.category }}\n' +
        'Link original: {{ $json.link }}\n\n' +
        'INSTRUCOES OBRIGATORIAS:\n' +
        '1. Crie um titulo SEO atraente (60-70 caracteres)\n' +
        '2. Escreva um resumo (excerpt) de 150-160 caracteres\n' +
        '3. Crie o corpo do artigo em HTML com h2, h3, paragrafos, listas\n' +
        '4. Minimo 400 palavras, maximo 800\n' +
        '5. Use palavras-chave naturalmente\n' +
        '6. Gere 5 tags relevantes\n' +
        '7. Gere um slug SEO-friendly (ex: economia-brasil-cresce-2026)\n\n' +
        'RESPONDA EXCLUSIVAMENTE neste formato JSON (sem markdown, sem ```json):\n' +
        '{\n' +
        '  "title": "Titulo SEO aqui",\n' +
        '  "slug": "slug-seo-aqui",\n' +
        '  "excerpt": "Resumo curto aqui",\n' +
        '  "body": "<h2>Subtitulo</h2><p>Paragrafo...</p>",\n' +
        '  "category": "{{ $json.category }}",\n' +
        '  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],\n' +
        '  "source": "{{ $json.source }}",\n' +
        '  "sourceUrl": "{{ $json.link }}"\n' +
        '}')
    },
    subnodes: { model: openAiModel },
    position: [960, 300]
  },
  output: [{ text: '{"title":"Artigo","slug":"artigo","excerpt":"Resumo","body":"<p>Corpo</p>","category":"geral","tags":["tag1"],"source":"Fonte","sourceUrl":"https://example.com"}' }]
});

// ===== 5. PROCESSAR RESPOSTA - Parsear JSON do LLM =====
const processArticle = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Processar Artigo Gerado',
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
    const slug = article.slug || article.title.toLowerCase()
      .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      .substring(0, 60);

    results.push({
      json: {
        title: article.title || 'Sem titulo',
        slug: slug + '-' + Date.now().toString(36),
        excerpt: article.excerpt || '',
        body: article.body || '',
        category: article.category || 'geral',
        tags: article.tags || [],
        source: article.source || '',
        sourceUrl: article.sourceUrl || '',
        date: now,
        dateModified: now,
        readTime: Math.max(2, Math.ceil((article.body || '').split(' ').length / 200)) + ' min',
        image: ''
      }
    });
  } catch (e) {
    // Skip invalid articles
  }
}

return results.length > 0 ? results : [{ json: { error: 'Nenhum artigo processado' } }];
`
    },
    position: [1200, 300]
  },
  output: [{ title: 'Artigo SEO', slug: 'artigo-seo-abc123', excerpt: 'Resumo', body: '<p>Corpo</p>', category: 'geral', tags: ['tag1'], source: 'Fonte', sourceUrl: 'https://example.com', date: '2026-03-29T00:00:00.000Z', readTime: '3 min', image: '' }]
});

// ===== 6. LER ARTICLES.JSON ATUAL DO GITHUB =====
const getArticlesJson = node({
  type: 'n8n-nodes-base.github',
  version: 1.1,
  config: {
    name: 'Ler articles.json',
    parameters: {
      resource: 'file',
      operation: 'get',
      owner: { __rl: true, mode: 'name', value: placeholder('Seu usuario GitHub (ex: renanmenesesadv)') },
      repository: { __rl: true, mode: 'name', value: placeholder('Nome do repo (ex: blog-noticias-mundo)') },
      filePath: 'data/articles.json',
      asBinaryProperty: false
    },
    credentials: { githubApi: newCredential('GitHub API') },
    onError: 'continueErrorOutput',
    position: [1440, 300]
  },
  output: [{ content: '[]' }]
});

// ===== 7. MERGE ARTIGOS =====
const mergeArticles = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Merge Artigos Novos + Existentes',
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
    } catch (e) {
      existingArticles = [];
    }
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

// ===== 8. ATUALIZAR ARTICLES.JSON NO GITHUB =====
const updateArticlesJson = node({
  type: 'n8n-nodes-base.github',
  version: 1.1,
  config: {
    name: 'Atualizar articles.json',
    parameters: {
      resource: 'file',
      operation: 'edit',
      owner: { __rl: true, mode: 'name', value: placeholder('Seu usuario GitHub (ex: renanmenesesadv)') },
      repository: { __rl: true, mode: 'name', value: placeholder('Nome do repo (ex: blog-noticias-mundo)') },
      filePath: 'data/articles.json',
      fileContent: expr('{{ $json.articlesJson }}'),
      commitMessage: expr('Atualizar artigos - {{ $json.newCount }} novos (total: {{ $json.articleCount }})')
    },
    credentials: { githubApi: newCredential('GitHub API') },
    position: [1920, 300]
  },
  output: [{ commit: { sha: 'abc123' } }]
});

// ===== STICKY NOTES =====
const noteConfig = sticky('## Configuracao Necessaria\n\n1. **GitHub API**: Crie credencial com Personal Access Token (repo scope)\n2. **OpenAI API**: Adicione sua API key\n3. **Placeholders**: Preencha usuario e repositorio GitHub\n4. **GitHub Pages**: Ative no repositorio para publicar o blog', [scheduleTrigger], { color: 4 });

const noteFlow = sticky('## Fluxo do Workflow\n\n1. Schedule Trigger (2h em 2h)\n2. Busca feeds RSS via proxy CORS\n3. Seleciona 5 noticias variadas\n4. Gera artigo SEO com IA (GPT-4o-mini)\n5. Processa e valida JSON\n6. Le articles.json atual do GitHub\n7. Merge novos + existentes\n8. Commit automatico no repo', [generateArticle], { color: 6 });

// ===== WORKFLOW =====
export default workflow('blog-noticias-mundo', 'Blog Noticias Mundo - Auto Publisher')
  .add(scheduleTrigger)
  .to(fetchRadarHub)
  .to(extractNews)
  .to(generateArticle)
  .to(processArticle)
  .to(getArticlesJson)
  .to(mergeArticles)
  .to(updateArticlesJson);
