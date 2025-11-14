const express = require('express');
const axios = require('axios');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
app.use(cors());
app.use(express.json());

const SIEG_TOKEN = 'eL9W6THKlsxCRvNJrgDa3mlt4ICSHw7dtTey5K_zvVE'; // Token que você forneceu
const SIEG_BASE_URL = 'https://api.sieg.com/api/v1';

// ============================================
// BUSCAR NOTAS (LOTE)
// ============================================
app.post('/buscar-notas', async (req, res) => {
  try {
    const { cnpjCliente, numeroNota, produto, dataInicio, dataFim } = req.body;

    if (!cnpjCliente) {
      return res.status(400).json({ error: 'CNPJ do cliente é obrigatório' });
    }

    // Buscar XMLs em lote da SIEG
    const response = await axios.post(
      `${SIEG_BASE_URL}/cofre/download-lote`,
      {
        cnpj: cnpjCliente,
        dataInicio: dataInicio || '2024-01-01',
        dataFim: dataFim || new Date().toISOString().split('T')[0],
        tipo: 'NFE'
      },
      {
        headers: {
          Authorization: `Bearer ${SIEG_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Processar XMLs e filtrar
    const notas = response.data.map(xml => parseXML(xml)); // Função para parsear XML
    
    // Filtrar por número da nota ou produto (se fornecido)
    let notasFiltradas = notas;
    if (numeroNota) {
      notasFiltradas = notasFiltradas.filter(n => n.numero.includes(numeroNota));
    }
    if (produto) {
      notasFiltradas = notasFiltradas.filter(n => 
        n.produtos.some(p => 
          p.descricao.toLowerCase().includes(produto.toLowerCase()) ||
          p.codigo.includes(produto)
        )
      );
    }

    res.json({ notas: notasFiltradas });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar notas na SIEG' });
  }
});

// ============================================
// DETALHES DE UMA NOTA ESPECÍFICA
// ============================================
app.get('/nota/:chave', async (req, res) => {
  try {
    const { chave } = req.params;
    const cnpjCliente = req.query.cnpjCliente;

    if (!cnpjCliente) {
      return res.status(400).json({ error: 'CNPJ do cliente é obrigatório' });
    }

    // Baixar XML da nota específica
    const response = await axios.get(
      `${SIEG_BASE_URL}/cofre/download/${chave}`,
      {
        headers: {
          Authorization: `Bearer ${SIEG_TOKEN}`
        }
      }
    );

    const notaData = parseXML(response.data); // Parsear XML

    // Validar segurança: nota pertence ao cliente?
    const cnpjDest = notaData.destinatario.cnpj.replace(/\D/g, '');
    const cnpjEmit = notaData.emitente.cnpj.replace(/\D/g, '');
    const cnpjClienteLimpo = cnpjCliente.replace(/\D/g, '');

    if (cnpjDest !== cnpjClienteLimpo && cnpjEmit !== cnpjClienteLimpo) {
      return res.status(403).json({ error: 'Nota não pertence a este cliente' });
    }

    // Extrair dados para o simulador
    const dadosSimulador = {
      valorVenda: notaData.valorTotal,
      aliquotaICMS: notaData.icms?.aliquota || 19,
      aliquotaPIS: notaData.pis?.aliquota || 1.65,
      aliquotaCOFINS: notaData.cofins?.aliquota || 7.6,
      ipi: notaData.ipi?.valor || 0,
      frete: notaData.frete || 0,
      ufOrigem: notaData.emitente.uf,
      ufDestino: notaData.destinatario.uf,
      destinatario: notaData.destinatario.tipo // 'pf' ou 'pj_revenda'
    };

    res.json(dadosSimulador);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar nota na SIEG' });
  }
});

// ============================================
// GERAR PDF DA NOTA (usando API SIEG)
// ============================================
app.get('/nota/:chave/pdf', async (req, res) => {
  try {
    const { chave } = req.params;
    const cnpjCliente = req.query.cnpjCliente;

    if (!cnpjCliente) {
      return res.status(400).json({ error: 'CNPJ do cliente é obrigatório' });
    }

    // Usar endpoint da SIEG para gerar DANFE
    const response = await axios.get(
      `${SIEG_BASE_URL}/cofre/danfe/${chave}`,
      {
        headers: {
          Authorization: `Bearer ${SIEG_TOKEN}`
        },
        responseType: 'arraybuffer' // PDF binário
      }
    );

    // Retornar PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="NF-${chave.substring(25, 34)}.pdf"`);
    res.send(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar PDF da nota' });
  }
});

// Função auxiliar para parsear XML (simplificada)
function parseXML(xmlString) {
  // Aqui você usaria uma lib como 'xml2js' ou 'fast-xml-parser'
  // Exemplo simplificado:
  return {
    chave: '...',
    numero: '12345',
    serie: '1',
    dataEmissao: '2025-01-15',
    valorTotal: 1500.00,
    emitente: { nome: 'Empresa X', cnpj: '00000000000000', uf: 'SP' },
    destinatario: { nome: 'Cliente Y', cnpj: '11111111111111', uf: 'RJ', tipo: 'pj_revenda' },
    produtos: [
      { codigo: 'PROD001', descricao: 'Produto A', quantidade: 10, valorUnitario: 150, valorTotal: 1500 }
    ],
    icms: { aliquota: 18 },
    pis: { aliquota: 1.65 },
    cofins: { aliquota: 7.6 },
    ipi: { valor: 0 },
    frete: 50
  };
}

app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});
