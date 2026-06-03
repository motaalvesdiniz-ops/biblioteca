/**
 * server.js (standalone search server)
 * Servidor exclusivo para busca bibliográfica e ficha MARCXML (Koha)
 */

'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'records.jsonl');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 3838; // Usando porta 3838 para não conflitar com scraper (3737)

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Memória para busca rápida
let allRecords = [];
function loadRecordsIntoMemory() {
  const DATA_GZ_FILE = path.join(DATA_DIR, 'records.jsonl.gz');

  if (!fs.existsSync(DATA_FILE) && !fs.existsSync(DATA_GZ_FILE)) {
    console.log(`[Aviso] Arquivo de dados não encontrado em: ${DATA_FILE} ou ${DATA_GZ_FILE}.`);
    allRecords = [];
    return;
  }
  try {
    const start = Date.now();
    let content;
    
    if (fs.existsSync(DATA_GZ_FILE)) {
      const gzBuffer = fs.readFileSync(DATA_GZ_FILE);
      content = zlib.gunzipSync(gzBuffer).toString('utf-8');
      console.log(`[Busca] Carregando registros compactados a partir de records.jsonl.gz.`);
    } else {
      content = fs.readFileSync(DATA_FILE, 'utf-8');
      console.log(`[Busca] Carregando registros descompactados a partir de records.jsonl.`);
    }

    allRecords = content.split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    console.log(`[Busca] ${allRecords.length} registros carregados na memória em ${Date.now() - start}ms.`);
  } catch (err) {
    console.error('[Busca] Erro ao carregar registros:', err.message);
  }
}

// Carrega ao iniciar
loadRecordsIntoMemory();

// API de busca com suporte a filtros facetados e filtros específicos
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  const author = (req.query.author || '').toLowerCase().trim();
  const title = (req.query.title || '').toLowerCase().trim();
  const subject = (req.query.subject || '').toLowerCase().trim();
  const year = (req.query.year || '').trim();
  const lang = (req.query.lang || '').toUpperCase().trim();
  const mfn = padMfn(req.query.mfn);

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
    // Filtros combinados do formulário avançado
    if (title) {
      filtered = filtered.filter(r => r.titulo && r.titulo.toLowerCase().includes(title));
    }
    if (author) {
      filtered = filtered.filter(r => r.autor && r.autor.toLowerCase().includes(author));
    }
    if (subject) {
      filtered = filtered.filter(r => r.assunto && r.assunto.toLowerCase().includes(subject));
    }
    if (year) {
      filtered = filtered.filter(r => r.ano && String(r.ano) === year);
    }
    if (mfn) {
      filtered = filtered.filter(r => r.mfn && String(r.mfn) === mfn);
    }
  }

  // Filtro lateral adicional de idioma
  if (lang) {
    filtered = filtered.filter(r => r.idioma && r.idioma.toUpperCase() === lang);
  }

  // Gera estatísticas/facetas para os filtros laterais
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

  // Limita facetas principais a top 15 para não sobrecarregar
  const limitFacets = (obj, max = 15) => {
    return Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, max)
      .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {});
  };

  const total = filtered.length;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 15;
  const startIdx = (page - 1) * limit;
  const paginated = filtered.slice(startIdx, startIdx + limit);

  res.json({
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    facets: {
      years: limitFacets(facets.years, 15),
      languages: limitFacets(facets.languages, 8),
      subjects: limitFacets(facets.subjects, 15)
    },
    results: paginated
  });
});

// Endpoint para retornar o MARCXML de um registro individual
app.get('/api/record/:mfn/koha', (req, res) => {
  const mfn = req.params.mfn;
  const record = allRecords.find(r => String(r.mfn) === String(mfn));
  if (!record) {
    return res.status(404).json({ error: 'Registro não encontrado' });
  }
  
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<collection xmlns="http://www.loc.gov/MARC21/slim"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xsi:schemaLocation="http://www.loc.gov/MARC21/slim http://www.loc.gov/standards/marcxml/schema/MARC21slim.xsd">
${convertToMarcXml(record)}
</collection>`;
  res.send(xml);
});

// Endpoint para exportação filtrada dos resultados de busca
app.get('/api/export', (req, res) => {
  if (!fs.existsSync(DATA_FILE)) {
    return res.status(404).json({ error: 'Nenhum dado disponível' });
  }
  try {
    const q = (req.query.q || '').toLowerCase().trim();
    const author = (req.query.author || '').toLowerCase().trim();
    const title = (req.query.title || '').toLowerCase().trim();
    const subject = (req.query.subject || '').toLowerCase().trim();
    const year = (req.query.year || '').trim();
    const lang = (req.query.lang || '').toUpperCase().trim();
    const mfn = padMfn(req.query.mfn);
    const format = (req.query.format || 'json').toLowerCase();

    let filtered = allRecords;

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
      if (title) {
        filtered = filtered.filter(r => r.titulo && r.titulo.toLowerCase().includes(title));
      }
      if (author) {
        filtered = filtered.filter(r => r.autor && r.autor.toLowerCase().includes(author));
      }
      if (subject) {
        filtered = filtered.filter(r => r.assunto && r.assunto.toLowerCase().includes(subject));
      }
      if (year) {
        filtered = filtered.filter(r => r.ano && String(r.ano) === year);
      }
      if (mfn) {
        filtered = filtered.filter(r => r.mfn && String(r.mfn) === mfn);
      }
    }

    if (lang) {
      filtered = filtered.filter(r => r.idioma && r.idioma.toUpperCase() === lang);
    }

    // Limita exportações gigantes a 10.000 para estabilidade do navegador
    const exportLimit = 10000;
    const records = filtered.slice(0, exportLimit);

    if (format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename="iusdata_export.json"');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.json(records);
    } else if (format === 'xml') {
      res.setHeader('Content-Disposition', 'attachment; filename="iusdata_export.xml"');
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.write('<?xml version="1.0" encoding="UTF-8"?>\n');
      res.write('<collection xmlns="http://www.loc.gov/MARC21/slim"\n');
      res.write('            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n');
      res.write('            xsi:schemaLocation="http://www.loc.gov/MARC21/slim http://www.loc.gov/standards/marcxml/schema/MARC21slim.xsd">\n');
      
      for (const record of records) {
        res.write(convertToMarcXml(record) + '\n');
      }
      
      res.write('</collection>\n');
      return res.end();
    } else if (format === 'pdf') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const html = renderPrintHtml(records, { q, title, author, subject, year, lang });
      return res.send(html);
    }

    res.status(400).send('Formato de exportação inválido');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function renderPrintHtml(records, filters) {
  const filterDesc = [];
  if (filters.q) filterDesc.push(`Geral: "${filters.q}"`);
  if (filters.title) filterDesc.push(`Título: "${filters.title}"`);
  if (filters.author) filterDesc.push(`Autor: "${filters.author}"`);
  if (filters.subject) filterDesc.push(`Assunto: "${filters.subject}"`);
  if (filters.year) filterDesc.push(`Ano: "${filters.year}"`);
  if (filters.lang) filterDesc.push(`Idioma: "${filters.lang}"`);
  
  const filterStr = filterDesc.length > 0 ? filterDesc.join(', ') : 'Todos os registros';

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
        <div class="item-title">${escapeXml(r.titulo || r.rawText || '—')}</div>
        ${r.autor ? `<div class="item-author">Autor: ${escapeXml(r.autor)}</div>` : ''}
        ${r.periodico ? `
          <div class="item-source">
            Periódico: <strong>${escapeXml(r.periodico)}</strong> ${r.local ? `(${escapeXml(r.local)})` : ''} ${detailsStr ? `— ${escapeXml(detailsStr)}` : ''}
          </div>
        ` : ''}
        ${r.assunto ? `<div class="item-subjects">Assuntos: ${escapeXml(r.assunto)}</div>` : ''}
      </div>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório de Pesquisa Bibliográfica - FDUSP</title>
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
      font-size: 15pt;
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
      font-size: 11.5pt;
      font-weight: bold;
      margin-bottom: 3px;
    }
    .item-author, .item-source, .item-subjects {
      font-size: 9.5pt;
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
      <div class="print-subtitle">Filtros: ${escapeXml(filterStr)} | Total: ${records.length} registros</div>
    </div>
    <div class="print-meta">
      Gerado em: ${new Date().toLocaleDateString('pt-BR')}<br>
      Ficha Catalográfica Koha (IUSDATA)
    </div>
  </div>
  
  <div class="print-list">
    ${listHtml}
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>`;
}

function padMfn(mfnVal) {
  if (!mfnVal) return '';
  const trimmed = String(mfnVal).trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed.padStart(5, '0');
  }
  return trimmed;
}

// Helpers para conversão MARCXML (Koha)
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

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

// Serve a página principal
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n📚 Portal de Pesquisa Koha rodando em http://localhost:${PORT}`);
  console.log(`📁 Dados carregados de: ${DATA_FILE}\n`);
});
