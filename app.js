/**
 * app.js — Cliente de busca estática do acervo IUSDATA / Koha
 * Toda a busca, processamento e exportações ocorrem 100% no navegador (Client-Side).
 */

'use strict';

// ─── Estado local da busca ───
let allRecords = [];
let currentFilteredRecords = [];

let currentQuery = '';
let currentPage = 1;
let currentLimit = 15;

// Filtros avançados
let advancedFilters = {
  title: '',
  author: '',
  subject: '',
  mfn: '',
  year: '',
  lang: ''
};

// Filtros facetados ativos (barra lateral)
let activeFacets = {
  year: null,
  subject: null,
  lang: null
};

// ─── Inicialização ───
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  
  // Preenche filtros a partir da URL se existirem
  const qParam = params.get('q');
  if (qParam) {
    document.getElementById('search-input').value = qParam;
    currentQuery = qParam;
  }
  
  const titleParam = params.get('title');
  if (titleParam) {
    document.getElementById('search-title').value = titleParam;
    advancedFilters.title = titleParam;
  }
  
  const authorParam = params.get('author');
  if (authorParam) {
    document.getElementById('search-author').value = authorParam;
    advancedFilters.author = authorParam;
  }
  
  const subjectParam = params.get('subject');
  if (subjectParam) {
    document.getElementById('search-subject').value = subjectParam;
    advancedFilters.subject = subjectParam;
  }
  
  const mfnParam = params.get('mfn');
  if (mfnParam) {
    let mfnVal = mfnParam.trim();
    if (/^\d+$/.test(mfnVal)) {
      mfnVal = mfnVal.padStart(5, '0');
    }
    document.getElementById('search-mfn').value = mfnVal;
    advancedFilters.mfn = mfnVal;
  }
  
  const yearParam = params.get('year');
  if (yearParam) {
    document.getElementById('search-year').value = yearParam;
    advancedFilters.year = yearParam;
  }
  
  const langParam = params.get('lang');
  if (langParam) {
    document.getElementById('search-lang').value = langParam;
    advancedFilters.lang = langParam;
  }

  // Verifica/exibe botão de limpar
  const btnClear = document.getElementById('btn-clear');
  const hasAnyQuery = currentQuery || advancedFilters.title || advancedFilters.author || advancedFilters.subject || advancedFilters.mfn || advancedFilters.year;
  if (btnClear) btnClear.style.display = hasAnyQuery ? 'block' : 'none';

  // Carrega o acervo a partir do gzip
  loadDatabase();
});

// ─── Carregamento da Base de Dados Gzip ───
async function loadDatabase() {
  resetView();
  const loadingBox = document.getElementById('loading-box');
  if (loadingBox) {
    loadingBox.style.display = 'block';
    loadingBox.querySelector('p').textContent = 'Carregando acervo bibliográfico (16MB)...';
  }

  try {
    const start = Date.now();
    const res = await fetch('data/records.jsonl.gz');
    if (!res.ok) throw new Error('Não foi possível carregar o arquivo records.jsonl.gz. Certifique-se de que ele está na pasta data/.');

    const arrayBuffer = await res.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    
    // Descompressão usando fflate CDN
    const decompressed = fflate.gunzipSync(uint8);
    const text = new TextDecoder('utf-8').decode(decompressed);

    allRecords = text.split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);

    console.log(`[Banco] ${allRecords.length} registros carregados no cliente em ${Date.now() - start}ms.`);
    
    if (loadingBox) loadingBox.style.display = 'none';

    // Se a busca inicial na URL for válida, processa
    if (isSearchValid()) {
      performSearch();
    } else {
      showEmptyState();
    }
  } catch (err) {
    console.error(err);
    if (loadingBox) {
      loadingBox.innerHTML = `
        <div style="color:var(--accent-red); font-size:2.5rem; margin-bottom:1rem;">⚠️</div>
        <h3 style="color:var(--accent-red); font-family:var(--font-title); font-size:1.4rem; margin-bottom:0.5rem;">Erro ao Inicializar</h3>
        <p style="font-size:0.85rem; color:var(--text-secondary); max-width:500px; margin:0 auto;">${err.message}</p>
      `;
    }
  }
}

// ─── Manipuladores de busca ───
function handleSearchSubmit(event) {
  event.preventDefault();
  
  // Atualiza termos de busca dos campos HTML
  currentQuery = document.getElementById('search-input').value.trim();
  advancedFilters.title = document.getElementById('search-title').value.trim();
  advancedFilters.author = document.getElementById('search-author').value.trim();
  advancedFilters.subject = document.getElementById('search-subject').value.trim();
  
  let mfnVal = document.getElementById('search-mfn').value.trim();
  if (mfnVal && /^\d+$/.test(mfnVal)) {
    mfnVal = mfnVal.padStart(5, '0');
    document.getElementById('search-mfn').value = mfnVal;
  }
  advancedFilters.mfn = mfnVal;
  
  advancedFilters.year = document.getElementById('search-year').value.trim();
  advancedFilters.lang = document.getElementById('search-lang').value;
  
  currentPage = 1;
  
  // Limpa facetas ao fazer nova pesquisa manual
  activeFacets = { year: null, subject: null, lang: null };
  
  // Exibe/oculta botão de limpar busca
  const btnClear = document.getElementById('btn-clear');
  const hasAnyQuery = currentQuery || advancedFilters.title || advancedFilters.author || advancedFilters.subject || advancedFilters.mfn || advancedFilters.year;
  
  if (btnClear) {
    btnClear.style.display = hasAnyQuery ? 'block' : 'none';
  }

  performSearch();
}

function clearSearch() {
  // Limpa campos visuais
  document.getElementById('search-input').value = '';
  document.getElementById('search-title').value = '';
  document.getElementById('search-author').value = '';
  document.getElementById('search-subject').value = '';
  document.getElementById('search-mfn').value = '';
  document.getElementById('search-year').value = '';
  document.getElementById('search-lang').value = '';
  
  const btnClear = document.getElementById('btn-clear');
  if (btnClear) btnClear.style.display = 'none';
  
  currentQuery = '';
  advancedFilters = { title: '', author: '', subject: '', mfn: '', year: '', lang: '' };
  activeFacets = { year: null, subject: null, lang: null };
  currentPage = 1;
  
  showEmptyState();
}

function resetView() {
  document.getElementById('empty-box').style.display = 'none';
  document.getElementById('loading-box').style.display = 'none';
  document.getElementById('results-list').innerHTML = '';
  document.getElementById('pagination').style.display = 'none';
  document.getElementById('results-meta').style.display = 'none';
  document.getElementById('active-filters').style.display = 'none';
}

// ─── Execução da Busca Local ───
async function performSearch() {
  if (!isSearchValid()) {
    showValidationError();
    return;
  }

  resetView();
  document.getElementById('loading-box').style.display = 'block';
  document.getElementById('loading-box').querySelector('p').textContent = 'Processando busca...';

  // Executa de forma assíncrona sutil para não travar a UI no carregamento
  setTimeout(() => {
    const q = currentQuery.toLowerCase().trim();
    const title = advancedFilters.title.toLowerCase().trim();
    const author = advancedFilters.author.toLowerCase().trim();
    const subject = advancedFilters.subject.toLowerCase().trim();
    const mfn = advancedFilters.mfn.trim();
    const year = advancedFilters.year.trim();
    const lang = (activeFacets.lang || advancedFilters.lang || '').toUpperCase().trim();
    const activeYear = activeFacets.year;
    const activeSubject = activeFacets.subject;

    let filtered = allRecords;

    // Busca geral ou filtros detalhados
    if (q) {
      filtered = filtered.filter(r => {
        return (r.titulo && r.titulo.toLowerCase().includes(q)) ||
               (r.autor && r.autor.toLowerCase().includes(q)) ||
               (r.assunto && r.assunto.toLowerCase().includes(q)) ||
               (r.periodico && r.periodico.toLowerCase().includes(q)) ||
               (r.mfn && String(r.mfn).includes(q)) ||
               (r.ano && String(r.ano).includes(q));
      });
    } else {
      if (title) filtered = filtered.filter(r => r.titulo && r.titulo.toLowerCase().includes(title));
      if (author) filtered = filtered.filter(r => r.autor && r.autor.toLowerCase().includes(author));
      if (subject) filtered = filtered.filter(r => r.assunto && r.assunto.toLowerCase().includes(subject));
      if (year) filtered = filtered.filter(r => r.ano && String(r.ano) === year);
      if (mfn) filtered = filtered.filter(r => r.mfn && String(r.mfn) === mfn);
    }

    // Filtros adicionais (facetados e idiomas)
    if (lang) {
      filtered = filtered.filter(r => r.idioma && r.idioma.toUpperCase() === lang);
    }
    if (activeYear) {
      filtered = filtered.filter(r => r.ano && String(r.ano) === activeYear);
    }
    if (activeSubject) {
      filtered = filtered.filter(r => {
        if (!r.assunto) return false;
        const subs = r.assunto.split(';').map(s => s.trim().toLowerCase());
        return subs.includes(activeSubject.toLowerCase());
      });
    }

    // Cacheia filtrados para a exportação
    currentFilteredRecords = filtered;

    // Estatísticas e facetas para filtros laterais
    const facets = {
      years: {},
      languages: {},
      subjects: {}
    };

    filtered.forEach(r => {
      if (r.ano) facets.years[r.ano] = (facets.years[r.ano] || 0) + 1;
      if (r.idioma) facets.languages[r.idioma] = (facets.languages[r.idioma] || 0) + 1;
      if (r.assunto) {
        const subs = r.assunto.split(';').map(s => s.trim()).filter(Boolean);
        subs.forEach(s => {
          facets.subjects[s] = (facets.subjects[s] || 0) + 1;
        });
      }
    });

    const limitFacets = (obj, max = 15) => {
      return Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, max)
        .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {});
    };

    const total = filtered.length;
    const startIdx = (currentPage - 1) * currentLimit;
    const paginated = filtered.slice(startIdx, startIdx + currentLimit);

    // Garante a exibição do grid com barra lateral de filtros facetados
    const sidebar = document.getElementById('sidebar-facets');
    if (sidebar) sidebar.style.display = 'block';
    
    const container = document.querySelector('.main-container');
    if (container) {
      container.style.gridTemplateColumns = '280px 1fr';
    }

    renderResults({
      total,
      page: currentPage,
      limit: currentLimit,
      pages: Math.ceil(total / currentLimit),
      facets: {
        years: limitFacets(facets.years, 15),
        languages: limitFacets(facets.languages, 8),
        subjects: limitFacets(facets.subjects, 15)
      },
      results: paginated
    });
  }, 30);
}

// ─── Renderização dos Resultados ───
function renderResults(data) {
  document.getElementById('loading-box').style.display = 'none';

  // Se não retornou nada
  if (data.total === 0) {
    document.getElementById('empty-box').style.display = 'block';
    document.getElementById('results-meta').style.display = 'flex';
    document.getElementById('results-count').textContent = 'Nenhum registro encontrado';
    const expContainer = document.getElementById('export-results-container');
    if (expContainer) expContainer.style.display = 'none';
    renderActiveFiltersPanel();
    return;
  }

  // Ativa painel de contadores e metadados
  document.getElementById('results-meta').style.display = 'flex';
  document.getElementById('results-count').textContent = `Encontrados ${fmtNum(data.total)} registros`;
  const expContainer = document.getElementById('export-results-container');
  if (expContainer) expContainer.style.display = 'block';

  // Renderiza a lista de cartões bibliográficos
  const listEl = document.getElementById('results-list');
  listEl.innerHTML = data.results.map(r => renderBibCard(r)).join('');

  // Renderiza paginação
  renderPagination(data.page, data.pages);

  // Renderiza painel lateral de facetas
  renderFacets(data.facets);

  // Renderiza filtros ativos
  renderActiveFiltersPanel();
}

function renderBibCard(r) {
  let details = [];
  if (r.volume) details.push(`v. ${r.volume}`);
  if (r.numero) details.push(`n. ${r.numero}`);
  if (r.paginas) details.push(`p. ${r.paginas}`);
  const detailsStr = details.length > 0 ? details.join(', ') : '';

  // Tags de assunto
  const subjects = r.assunto ? r.assunto.split(';').map(s => s.trim()).filter(Boolean) : [];
  const subjectsHtml = subjects.slice(0, 5).map(s => `
    <span class="bib-tag bib-tag-subject" onclick="filterByFacet('subject', '${escapeAttribute(s)}')">${escapeHtml(s)}</span>
  `).join('');

  return `
    <div class="bib-card" data-mfn="${r.mfn}">
      <div class="bib-header">
        <span class="bib-mfn">MFN ${r.mfn}</span>
        <div class="bib-tags">
          ${r.idioma ? `<span class="bib-tag" onclick="filterByFacet('lang', '${r.idioma}')">${escapeHtml(r.idioma)}</span>` : ''}
          ${r.ano ? `<span class="bib-tag" onclick="filterByFacet('year', '${r.ano}')">${escapeHtml(r.ano)}</span>` : ''}
        </div>
      </div>
      <h3 class="bib-title">${escapeHtml(r.titulo || r.rawText || '—')}</h3>
      ${r.autor ? `<div class="bib-author">por ${escapeHtml(r.autor)}</div>` : ''}
      
      ${r.periodico ? `
        <div class="bib-source">
          Publicado em: <span class="bib-periodico">${escapeHtml(r.periodico)}</span>
          ${r.local ? `(${escapeHtml(r.local)})` : ''}
          ${detailsStr ? `— <span class="bib-details">${escapeHtml(detailsStr)}</span>` : ''}
        </div>
      ` : ''}

      ${subjectsHtml ? `<div class="bib-metadata">${subjectsHtml}</div>` : ''}

      <div class="bib-actions">
        <button class="btn btn-sm-secondary" onclick="viewMarcXml('${r.mfn}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12" style="vertical-align:-1px; margin-right:3px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Ficha MARCXML
        </button>
        <button class="btn btn-sm-primary" onclick="downloadMarcXml('${r.mfn}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12" style="vertical-align:-1px; margin-right:3px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar Koha
        </button>
      </div>
    </div>`;
}

// ─── Renderização das Facetas / Filtros ───
function renderFacets(facets) {
  // Anos
  const yearsEl = document.getElementById('facet-years');
  yearsEl.innerHTML = renderFacetBlock('year', facets.years);

  // Assuntos
  const subsEl = document.getElementById('facet-subjects');
  subsEl.innerHTML = renderFacetBlock('subject', facets.subjects);

  // Idiomas
  const langEl = document.getElementById('facet-languages');
  langEl.innerHTML = renderFacetBlock('lang', facets.languages);
}

function renderFacetBlock(type, facetObj) {
  if (!facetObj || Object.keys(facetObj).length === 0) {
    return '<div class="facet-empty" style="font-size:0.72rem; color:var(--text-muted); padding:0.25rem;">Nenhum disponível</div>';
  }

  return Object.entries(facetObj).map(([key, val]) => {
    const isSelected = activeFacets[type] === key;
    return `
      <div class="facet-item ${isSelected ? 'selected' : ''}" onclick="filterByFacet('${type}', '${escapeAttribute(key)}')">
        <span>${escapeHtml(key)}</span>
        <span class="facet-count">${fmtNum(val)}</span>
      </div>`;
  }).join('');
}

function renderActiveFiltersPanel() {
  const container = document.getElementById('active-filters');
  
  // Combina filtros avançados + facetas para exibição
  const items = [];
  const labels = { year: 'Ano', subject: 'Assunto', lang: 'Idioma' };
  
  // Facetas
  Object.entries(activeFacets).forEach(([k, v]) => {
    if (v !== null) {
      items.push({ type: 'facet', key: k, label: `${labels[k]}: ${v}` });
    }
  });

  // Filtros Avançados
  if (advancedFilters.title) items.push({ type: 'adv', key: 'title', label: `Título: ${advancedFilters.title}` });
  if (advancedFilters.author) items.push({ type: 'adv', key: 'author', label: `Autor: ${advancedFilters.author}` });
  if (advancedFilters.subject) items.push({ type: 'adv', key: 'subject', label: `Assunto: ${advancedFilters.subject}` });
  if (advancedFilters.mfn) items.push({ type: 'adv', key: 'mfn', label: `MFN: ${advancedFilters.mfn}` });
  if (advancedFilters.year) items.push({ type: 'adv', key: 'year', label: `Ano: ${advancedFilters.year}` });
  if (advancedFilters.lang) items.push({ type: 'adv', key: 'lang', label: `Idioma: ${advancedFilters.lang}` });

  if (items.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  container.innerHTML = `
    <div style="font-size: 0.68rem; font-weight:700; text-transform:uppercase; color:var(--text-secondary); margin-bottom: 0.35rem;">Filtros Ativos:</div>
    <div style="display:flex; flex-wrap:wrap; gap:0.2rem;">
      ${items.map(item => `
        <span class="active-filter-tag">
          ${escapeHtml(item.label)}
          <button onclick="removeFilter('${item.type}', '${item.key}')">&times;</button>
        </span>
      `).join('')}
    </div>`;
}

// ─── Ações de Filtros ───
function filterByFacet(type, value) {
  if (activeFacets[type] === value) {
    activeFacets[type] = null;
  } else {
    activeFacets[type] = value;
  }
  currentPage = 1;
  performSearch();
}

function removeFilter(type, key) {
  if (type === 'facet') {
    activeFacets[key] = null;
  } else if (type === 'adv') {
    advancedFilters[key] = '';
    const el = document.getElementById(`search-${key}`);
    if (el) el.value = '';
  }
  currentPage = 1;
  performSearch();
}

function resetFilters() {
  activeFacets = { year: null, subject: null, lang: null };
  advancedFilters = { title: '', author: '', subject: '', mfn: '', year: '', lang: '' };
  
  // Limpa os inputs visuais
  document.getElementById('search-title').value = '';
  document.getElementById('search-author').value = '';
  document.getElementById('search-subject').value = '';
  document.getElementById('search-mfn').value = '';
  document.getElementById('search-year').value = '';
  document.getElementById('search-lang').value = '';
  
  currentPage = 1;
  
  showEmptyState();
}

// ─── Paginação ───
function renderPagination(current, total) {
  const container = document.getElementById('pagination');
  if (total <= 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  let html = '';

  html += `<button class="page-btn" ${current === 1 ? 'disabled' : ''} onclick="changePage(${current - 1})" aria-label="Página anterior">&lt;</button>`;

  const range = [];
  const rangeWidth = 2;
  
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - rangeWidth && i <= current + rangeWidth)) {
      range.push(i);
    }
  }

  let l;
  for (let i of range) {
    if (l) {
      if (i - l === 2) {
        html += `<span style="padding: 0 0.25rem; font-size:0.8rem; color:var(--text-muted);">...</span>`;
      } else if (i - l > 2) {
        html += `<span style="padding: 0 0.25rem; font-size:0.8rem; color:var(--text-muted);">...</span>`;
      }
    }
    html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
    l = i;
  }

  html += `<button class="page-btn" ${current === total ? 'disabled' : ''} onclick="changePage(${current + 1})" aria-label="Próxima página">&gt;</button>`;

  container.innerHTML = html;
}

function changePage(page) {
  currentPage = page;
  performSearch();
  window.scrollTo({ top: 320, behavior: 'smooth' });
}

// ─── Modal Ficha MARC XML ───
let currentModalMfn = null;

async function viewMarcXml(mfn) {
  currentModalMfn = mfn;
  const modal = document.getElementById('marc-modal');
  const codeEl = document.getElementById('marc-xml-code');
  
  codeEl.textContent = 'Gerando ficha MARCXML...';
  modal.classList.add('open');

  const record = allRecords.find(r => String(r.mfn) === String(mfn));
  if (!record) {
    codeEl.textContent = 'Erro: Registro não encontrado no acervo.';
    return;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<collection xmlns="http://www.loc.gov/MARC21/slim"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xsi:schemaLocation="http://www.loc.gov/MARC21/slim http://www.loc.gov/standards/marcxml/schema/MARC21slim.xsd">
${convertToMarcXml(record)}
</collection>`;

  codeEl.textContent = xml;
  
  document.getElementById('btn-download-record-xml').onclick = () => {
    downloadMarcXml(mfn);
  };
}

function closeMarcModal() {
  document.getElementById('marc-modal').classList.remove('open');
  currentModalMfn = null;
}

function copyMarcXml() {
  const codeText = document.getElementById('marc-xml-code').textContent;
  navigator.clipboard.writeText(codeText)
    .then(() => alert('XML copiado para a área de transferência!'))
    .catch(err => alert('Erro ao copiar XML: ' + err.message));
}

function downloadMarcXml(mfn) {
  const record = allRecords.find(r => String(r.mfn) === String(mfn));
  if (!record) return;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<collection xmlns="http://www.loc.gov/MARC21/slim"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xsi:schemaLocation="http://www.loc.gov/MARC21/slim http://www.loc.gov/standards/marcxml/schema/MARC21slim.xsd">
${convertToMarcXml(record)}
</collection>`;
  
  downloadBlob(xml, `mfn_${mfn}.xml`, 'application/xml;charset=utf-8');
}

function downloadBlob(content, filename, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Lógica do Dropdown e Exportação Local ───
function toggleExportDropdown(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('export-results-container');
  if (dropdown) dropdown.classList.toggle('open');
}

function triggerExport(format, event) {
  if (event) event.preventDefault();
  
  const dropdown = document.getElementById('export-results-container');
  if (dropdown) dropdown.classList.remove('open');
  
  exportResults(format);
}

function exportResults(format) {
  if (currentFilteredRecords.length === 0) {
    alert('Nenhum resultado filtrado para exportar.');
    return;
  }

  if (format === 'json') {
    const jsonStr = JSON.stringify(currentFilteredRecords, null, 2);
    downloadBlob(jsonStr, 'iusdata_export.json', 'application/json;charset=utf-8');
  } else if (format === 'xml') {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<collection xmlns="http://www.loc.gov/MARC21/slim"\n';
    xml += '            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n';
    xml += '            xsi:schemaLocation="http://www.loc.gov/MARC21/slim http://www.loc.gov/standards/marcxml/schema/MARC21slim.xsd">\n';
    
    // Limita exportações gigantes a 10.000 para estabilidade do navegador
    const records = currentFilteredRecords.slice(0, 10000);
    for (const r of records) {
      xml += convertToMarcXml(r) + '\n';
    }
    xml += '</collection>\n';
    downloadBlob(xml, 'iusdata_export.xml', 'application/xml;charset=utf-8');
  } else if (format === 'pdf') {
    exportPdfLocal();
  }
}

function exportPdfLocal() {
  // Limita exportações gigantes a 1000 itens para o PDF não quebrar o print do browser
  const records = currentFilteredRecords.slice(0, 1000);
  const filterDesc = [];
  if (currentQuery) filterDesc.push(`Geral: "${currentQuery}"`);
  if (advancedFilters.title) filterDesc.push(`Título: "${advancedFilters.title}"`);
  if (advancedFilters.author) filterDesc.push(`Autor: "${advancedFilters.author}"`);
  if (advancedFilters.subject) filterDesc.push(`Assunto: "${advancedFilters.subject}"`);
  if (advancedFilters.year) filterDesc.push(`Ano: "${advancedFilters.year}"`);
  if (advancedFilters.mfn) filterDesc.push(`MFN: "${advancedFilters.mfn}"`);
  if (activeFacets.lang || advancedFilters.lang) filterDesc.push(`Idioma: "${activeFacets.lang || advancedFilters.lang}"`);
  
  const filterStr = filterDesc.length > 0 ? filterDesc.join(', ') : 'Todos os registros';
  
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Por favor, ative os pop-ups para visualizar o relatório de impressão.');
    return;
  }
  
  const listHtml = records.map((r, i) => {
    let details = [];
    if (r.volume) details.push(`v. ${r.volume}`);
    if (r.numero) details.push(`n. ${r.numero}`);
    if (r.paginas) details.push(`p. ${r.paginas}`);
    const detailsStr = details.length > 0 ? details.join(', ') : '';

    return `
      <div class="print-item">
        <div class="item-header">
          <span class="item-num">#${i + 1} (MFN ${r.mfn})</span>
          <span class="item-lang-year">${r.idioma || ''} ${r.ano ? `| ${r.ano}` : ''}</span>
        </div>
        <div class="item-title">${escapeHtml(r.titulo || r.rawText || '—')}</div>
        ${r.autor ? `<div class="item-author">Autor: ${escapeHtml(r.autor)}</div>` : ''}
        ${r.periodico ? `
          <div class="item-source">
            Periódico: <strong>${escapeHtml(r.periodico)}</strong> ${r.local ? `(${escapeHtml(r.local)})` : ''} ${detailsStr ? `— ${escapeHtml(detailsStr)}` : ''}
          </div>
        ` : ''}
        ${r.assunto ? `<div class="item-subjects">Assuntos: ${escapeHtml(r.assunto)}</div>` : ''}
      </div>
    `;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório de Pesquisa - FDUSP</title>
  <style>
    body {
      font-family: 'Times New Roman', Georgia, serif;
      color: #000;
      line-height: 1.4;
      padding: 1.5cm 1cm;
      font-size: 10.5pt;
    }
    .print-header {
      border-bottom: 2px solid #000;
      padding-bottom: 0.5rem;
      margin-bottom: 1cm;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .print-title {
      font-size: 14pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    .print-subtitle {
      font-size: 8.5pt;
      color: #444;
      margin-top: 5px;
    }
    .print-meta {
      text-align: right;
      font-size: 8.5pt;
    }
    .print-item {
      margin-bottom: 0.8cm;
      page-break-inside: avoid;
    }
    .item-header {
      display: flex;
      justify-content: space-between;
      font-size: 8.5pt;
      color: #555;
      border-bottom: 1px dashed #ccc;
      padding-bottom: 2px;
      margin-bottom: 4px;
    }
    .item-title {
      font-size: 11pt;
      font-weight: bold;
      margin-bottom: 3px;
    }
    .item-author, .item-source, .item-subjects {
      font-size: 9pt;
      margin-top: 2px;
    }
    @media print {
      @page {
        size: A4;
        margin: 2cm 1.5cm;
      }
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="print-header">
    <div>
      <div class="print-title">Biblioteca da Faculdade de Direito da USP</div>
      <div class="print-subtitle">Filtros: ${escapeHtml(filterStr)} | Total: ${records.length} registros</div>
    </div>
    <div class="print-meta">
      Gerado em: ${new Date().toLocaleDateString('pt-BR')}<br>
      Ficha Catalográfica Koha (IUSDATA)
    </div>
  </div>
  
  <div class="print-list">
    ${listHtml}
  </div>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
  
  setTimeout(() => {
    printWindow.print();
  }, 500);
}

// Fecha o dropdown se clicar em qualquer lugar fora dele
document.addEventListener('click', (event) => {
  const dropdown = document.getElementById('export-results-container');
  if (dropdown && !dropdown.contains(event.target)) {
    dropdown.classList.remove('open');
  }
});

// ─── Auxiliares de Validação e Estados de Busca ───
function isSearchValid() {
  const q = document.getElementById('search-input').value.trim();
  const title = document.getElementById('search-title').value.trim();
  const author = document.getElementById('search-author').value.trim();
  const subject = document.getElementById('search-subject').value.trim();
  const mfn = document.getElementById('search-mfn').value.trim();
  const year = document.getElementById('search-year').value.trim();
  
  // Exige pelo menos 3 caracteres nos campos textuais/ano OR pelo menos 1 número/caractere no MFN
  return (q.length >= 3) ||
         (title.length >= 3) ||
         (author.length >= 3) ||
         (subject.length >= 3) ||
         (year.length >= 3) ||
         (mfn.length >= 1);
}

function showEmptyState() {
  resetView();
  
  // Oculta sidebar facetada
  const sidebar = document.getElementById('sidebar-facets');
  if (sidebar) sidebar.style.display = 'none';
  
  const container = document.querySelector('.main-container');
  if (container) {
    container.style.gridTemplateColumns = '1fr';
  }

  const resultsList = document.getElementById('results-list');
  if (resultsList) resultsList.innerHTML = '';
}

function showValidationError() {
  resetView();
  
  // Oculta sidebar facetada
  const sidebar = document.getElementById('sidebar-facets');
  if (sidebar) sidebar.style.display = 'none';
  
  const container = document.querySelector('.main-container');
  if (container) {
    container.style.gridTemplateColumns = '1fr';
  }

  const resultsList = document.getElementById('results-list');
  resultsList.innerHTML = `
    <div class="welcome-box" style="border-left: 4.5px solid var(--accent-red);">
      <div class="welcome-icon" style="color: var(--accent-red);">⚠️</div>
      <h3 style="color: var(--accent-red);">Busca Não Realizada</h3>
      <p>Preencha pelo menos um dos filtros de busca (Busca Geral, Título, Autor, Assunto ou Ano) com no mínimo <strong>3 caracteres</strong>, ou preencha o campo <strong>MFN</strong> com o número do código desejado. Buscas vazias ou genéricas não são permitidas.</p>
    </div>
  `;
}

// Helpers de Geração MARCXML para Koha no cliente
function convertToMarcXml(record) {
  const parts = [];
  parts.push('  <record>');
  parts.push('    <leader>00000nam a2200000i 4500</leader>');
  
  if (record.mfn) {
    parts.push(`    <controlfield tag="001">${escapeXml(record.mfn)}</controlfield>`);
  }
  
  const dateStr = new Date().toISOString().slice(2, 8).replace(/-/g, '');
  const yearStr = record.ano && /^\d{4}$/.test(record.ano) ? record.ano : '    ';
  const langStr = record.idioma && record.idioma.length === 3 ? record.idioma.toLowerCase() : 'por';
  const f008 = `${dateStr}s${yearStr}    br |||||||||||||||${langStr} d`;
  parts.push(`    <controlfield tag="008">${f008}</controlfield>`);
  
  if (record.autor) {
    parts.push('    <datafield tag="100" ind1="1" ind2=" ">');
    parts.push(`      <subfield code="a">${escapeXml(record.autor)}</subfield>`);
    parts.push('    </datafield>');
  }
  
  parts.push('    <datafield tag="245" ind1="1" ind2="0">');
  parts.push(`      <subfield code="a">${escapeXml(record.titulo)}</subfield>`);
  if (record.autor) {
    parts.push(`      <subfield code="c">${escapeXml(record.autor)}</subfield>`);
  }
  parts.push('    </datafield>');
  
  if (record.local || record.ano) {
    parts.push('    <datafield tag="260" ind1=" " ind2=" ">');
    if (record.local) parts.push(`      <subfield code="a">${escapeXml(record.local)}</subfield>`);
    if (record.ano) parts.push(`      <subfield code="c">${escapeXml(record.ano)}</subfield>`);
    parts.push('    </datafield>');
  }
  
  if (record.paginas) {
    parts.push('    <datafield tag="300" ind1=" " ind2=" ">');
    parts.push(`      <subfield code="a">${escapeXml(record.paginas)}</subfield>`);
    parts.push('    </datafield>');
  }
  
  if (record.assunto) {
    const subjects = record.assunto.split(';').map(s => s.trim()).filter(Boolean);
    for (const s of subjects) {
      parts.push('    <datafield tag="650" ind1=" " ind2="4">');
      parts.push(`      <subfield code="a">${escapeXml(s)}</subfield>`);
      parts.push('    </datafield>');
    }
  }
  
  if (record.periodico) {
    parts.push('    <datafield tag="773" ind1="0" ind2="8">');
    parts.push(`      <subfield code="t">${escapeXml(record.periodico)}</subfield>`);
    let detail = '';
    if (record.volume) detail += `v. ${record.volume}, `;
    if (record.numero) detail += `n. ${record.numero}, `;
    if (record.paginas) detail += `p. ${record.paginas}`;
    detail = detail.trim().replace(/,$/, '');
    if (detail) parts.push(`      <subfield code="g">${escapeXml(detail)}</subfield>`);
    parts.push('    </datafield>');
  }
  
  if (record.biblioteca) {
    parts.push('    <datafield tag="852" ind1=" " ind2=" ">');
    parts.push(`      <subfield code="b">${escapeXml(record.biblioteca)}</subfield>`);
    parts.push('    </datafield>');
  }
  
  parts.push('  </record>');
  return parts.join('\n');
}

// ─── Utils ───
function fmtNum(n) {
  return (n || 0).toLocaleString('pt-BR');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttribute(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'");
}
