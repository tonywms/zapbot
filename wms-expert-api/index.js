const express = require('express');
const cors = require('cors');
const { gerarChaveFinal } = require('./utils/keygen');

const app = express();
app.use(cors());
app.use(express.json());

// Rota principal para gerar a chave
app.post('/api/gerar', (req, res) => {
    const { hwid, data } = req.body;

    if (!hwid || !data) {
        return res.status(400).json({ error: "Hardware ID e Data são obrigatórios." });
    }

    const chave = gerarChaveFinal(hwid, data);
    
    if (!chave) {
        return res.status(400).json({ error: "Formato de Hardware ID inválido." });
    }

    res.json({ chave });
});

// Rota de teste para ver se a API está online
app.get('/', (req, res) => {
    res.send('API Gerador WMS Expert Online');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});