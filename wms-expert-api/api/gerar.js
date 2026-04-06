// Localizado em wms-expert-api/api/gerar.js
const { gerarChaveFinal } = require('../utils/keygen');

module.exports = async (req, res) => {
    // Habilita o CORS para que seu sistema Delphi ou o Painel Web consigam consultar
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { hwid, validade } = req.query;

    if (!hwid || !validade) {
        return res.status(400).json({ 
            error: 'Parâmetros insuficientes.',
            exemplo: '/gerar-chave?hwid=ABC-123&validade=25/05/2026' 
        });
    }

    try {
        const chave = gerarChaveFinal(hwid, validade);
        return res.status(200).json({ 
            sucesso: true,
            chave_gerada: chave,
            hwid_origem: hwid,
            expira_em: validade
        });
    } catch (error) {
        return res.status(500).json({ error: 'Erro interno no motor de chaves.' });
    }
};
