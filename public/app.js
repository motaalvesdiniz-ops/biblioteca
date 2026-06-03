/**
 * app.js — Cliente de busca do acervo IUSDATA / Koha
 */

'use strict';

// ─── Estado local da busca ───
let currentQuery = '';
let currentPage = 1;
let currentLimit = 15;

// Filtros avançados
let advancedFilters = {
  title: '',
  author: '',
  subject: '',
  year: '',
  mfn: '',
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

  // Se houver uma busca válida na URL, executa. Senão, inicia em branco.
  if (isSearchValid()) {
    performSearch();
  } else {
    showEmptyState();
  }
});

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

// ─── Execução da Busca ───
async function performSearch() {
  if (!isSearchValid()) {
    showValidationError();
    return;
  }

  resetView();
  document.getElementById('loading-box').style.display = 'block';

  // Garante a exibição do grid com barra lateral de filtros facetados
  const sidebar = document.getElementById('sidebar-facets');
  if (sidebar) sidebar.style.display = 'block';
  
  const container = document.querySelector('.main-container');
  if (container) {
    container.style.gridTemplateColumns = '280px 1fr';
  }

  // Constrói URL com parâmetros
  const params = new URLSearchParams();
  params.append('page', currentPage);
  params.append('limit', currentLimit);

  // Parâmetro de busca geral ou específica
  if (currentQuery) {
    params.append('q', currentQuery);
  } else {
    if (advancedFilters.title) params.append('title', advancedFilters.title);
    if (advancedFilters.author) params.append('author', advancedFilters.author);
    if (advancedFilters.subject) params.append('subject', advancedFilters.subject);
    if (advancedFilters.mfn) params.append('mfn', advancedFilters.mfn);
    if (advancedFilters.year) params.append('year', advancedFilters.year);
    if (advancedFilters.lang) params.append('lang', advancedFilters.lang);
  }

  // Filtros facetados adicionados na lateral
  if (activeFacets.year) params.append('year', activeFacets.year);
  if (activeFacets.subject) params.append('subject', activeFacets.subject);
  if (activeFacets.lang) params.append('lang', activeFacets.lang);

  try {
    const res = await fetch(`/api/search?${params.toString()}`);
    if (!res.ok) throw new Error('Erro de resposta do servidor');
    
    const data = await res.json();
    renderResults(data);
  } catch (err) {
    console.error(err);
    showErrorState();
  }
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
    // Limpa o input visual também
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
  
  codeEl.textContent = 'Carregando ficha MARCXML...';
  modal.classList.add('open');

  try {
    const res = await fetch(`/api/record/${mfn}/koha`);
    if (!res.ok) throw new Error('Não foi possível carregar o XML');
    const xml = await res.text();
    codeEl.textContent = xml;
    
    document.getElementById('btn-download-record-xml').onclick = () => {
      downloadMarcXml(mfn);
    };
  } catch (err) {
    codeEl.textContent = 'Erro ao carregar os dados: ' + err.message;
  }
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
  window.open(`/api/record/${mfn}/koha`, '_blank');
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

function showErrorState() {
  document.getElementById('loading-box').style.display = 'none';
  alert('Ocorreu um erro ao comunicar com a API de busca. Verifique se o servidor local do site está ativo.');
}

// ─── Lógica do Dropdown e Exportação ───
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

function getSearchQueryString() {
  const params = new URLSearchParams();
  
  if (currentQuery) {
    params.append('q', currentQuery);
  } else {
    if (advancedFilters.title) params.append('title', advancedFilters.title);
    if (advancedFilters.author) params.append('author', advancedFilters.author);
    if (advancedFilters.subject) params.append('subject', advancedFilters.subject);
    if (advancedFilters.mfn) params.append('mfn', advancedFilters.mfn);
    
    // Prioriza filtros de faceta se houver
    const yearVal = activeFacets.year || advancedFilters.year;
    if (yearVal) params.append('year', yearVal);
    
    const langVal = activeFacets.lang || advancedFilters.lang;
    if (langVal) params.append('lang', langVal);
  }

  // Permite filtros adicionais de faceta para busca geral ou avançada
  if (currentQuery) {
    if (activeFacets.year) params.append('year', activeFacets.year);
    if (activeFacets.subject) params.append('subject', activeFacets.subject);
    if (activeFacets.lang) params.append('lang', activeFacets.lang);
  } else {
    if (activeFacets.subject) params.append('subject', activeFacets.subject);
  }
  
  return params.toString();
}

function exportResults(format) {
  const qs = getSearchQueryString();
  window.open(`/api/export?format=${format}&${qs}`, '_blank');
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
