const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { handleMessage } = require('./src/handlers/messageHandler');
const express = require('express'); // Importando o Express
const db = require('./src/database'); // Importando seu banco para os logs da API
const cors = require('cors'); // Importando o CORS para evitar bloqueios entre portas

const app = express();
app.use(cors()); // Liberando acesso para o Painel na porta 3000
app.use(express.json()); // Para o bot entender o JSON que o Vercel vai mandar

const bootTime = Math.floor(Date.now() / 1000);

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        args: ['--no-sandbox', '--disable-setuid-sandbox'], 
        headless: true 
    }
});

// --- PONTE API: Vercel -> Bot -> WhatsApp ---

// 1. ROTA PARA ENVIAR MENSAGENS DO PAINEL
app.post('/api/enviar-mensagem', async (req, res) => {
    const { cliente, mensagem, atendenteNome, atendimentoId } = req.body;

    try {
        if (!cliente || !mensagem) {
            return res.status(400).json({ status: 'erro', msg: 'Dados incompletos' });
        }

        const chatId = cliente.includes('@c.us') ? cliente : `${cliente.replace(/\D/g, '')}@c.us`;

        // O Bot dispara a mensagem identificada para o cliente
        await client.sendMessage(chatId, `*[${atendenteNome}]:* ${mensagem}`);

        // Grava no log do banco que a resposta saiu pelo painel
        await db.query(
            "INSERT INTO logs_mensagens (atendimento_id, remetente, mensagem) VALUES ($1, $2, $3)",
            [atendimentoId, `atendente_${atendenteNome}`, mensagem]
        );

        res.status(200).json({ status: 'sucesso', msg: 'Mensagem enviada com sucesso!' });
    } catch (err) {
        console.error("❌ Erro na Ponte API (Enviar):", err);
        res.status(500).json({ status: 'erro', detalhes: err.message });
    }
});

// 2. ROTA PARA ASSUMIR ATENDIMENTO (O que move a fila no Painel)
app.post('/api/assumir-atendimento', async (req, res) => {
    const { atendimentoId, atendenteId, atendenteNome, clienteWhatsapp, mensagemPersonalizada } = req.body;

    try {
        // Atualiza o atendente no banco e garante que o status esteja correto
        await db.query(
            "UPDATE atendimentos SET atendente_id = $1, status = 'em_curso' WHERE id = $2",
            [atendenteId, atendimentoId]
        );

        // Ajuste para evitar o erro "No LID": limpando caracteres não numéricos
        const cleanNumber = clienteWhatsapp.replace(/\D/g, '');
        const chatId = `${cleanNumber}@c.us`;
        
        const mensagemFinal = mensagemPersonalizada && mensagemPersonalizada.trim() !== "" 
            ? mensagemPersonalizada 
            : `Olá! Sou o *${atendenteNome}* e a partir de agora vou dar continuidade ao seu atendimento. 🤝`;
        
        // Notifica o cliente automaticamente no WhatsApp
        await client.sendMessage(chatId, mensagemFinal);

        // Registra a ação no log do sistema
        await db.query(
            "INSERT INTO logs_mensagens (atendimento_id, remetente, mensagem) VALUES ($1, $2, $3)",
            [atendimentoId, 'sistema', `Atendimento assumido por ${atendenteNome}. Mensagem: ${mensagemFinal}`]
        );

        res.status(200).json({ status: 'sucesso', msg: `Atendimento assumido por ${atendenteNome}` });
    } catch (err) {
        console.error("❌ Erro na Ponte API (Assumir):", err);
        res.status(500).json({ status: 'erro', detalhes: err.message });
    }
});

// 3. ROTA PARA FINALIZAR ATENDIMENTO (Envia avaliação automática)
app.post('/api/finalizar-atendimento', async (req, res) => {
    const { atendimentoId, clienteWhatsapp } = req.body;

    try {
        await db.query(
            "UPDATE atendimentos SET status = 'aguardando_avaliacao' WHERE id = $1",
            [atendimentoId]
        );

        const cleanNumber = clienteWhatsapp.replace(/\D/g, '');
        const chatId = `${cleanNumber}@c.us`;
        
        const msgAvaliacao = `Como você avalia nosso atendimento de hoje? 🤔\n\n` +
                            `Por favor, digite uma nota de *1 a 5*:\n\n` +
                            `1️⃣ - Muito Ruim\n2️⃣ - Ruim\n3️⃣ - Regular\n4️⃣ - Bom\n5️⃣ - Excelente`;

        await client.sendMessage(chatId, msgAvaliacao);

        res.status(200).json({ status: 'sucesso', msg: 'Atendimento finalizado e avaliação enviada.' });
    } catch (err) {
        console.error("❌ Erro na Ponte API (Finalizar):", err);
        res.status(500).json({ status: 'erro', detalhes: err.message });
    }
});

// 4. ROTA PARA BUSCAR O HISTÓRICO DE UM ATENDIMENTO ESPECÍFICO
app.get('/api/historico/:atendimentoId', async (req, res) => {
    const { atendimentoId } = req.params;

    try {
        // Removido o data_envio da busca para evitar o erro de coluna inexistente
        const result = await db.query(
            "SELECT remetente, mensagem FROM logs_mensagens WHERE atendimento_id = $1 ORDER BY id ASC",
            [atendimentoId]
        );
        res.status(200).json(result.rows);
    } catch (err) {
        console.error("❌ Erro ao buscar histórico:", err);
        res.status(500).json({ status: 'erro', detalhes: err.message });
    }
});

// Inicia o servidor da Ponte na porta 3001
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🚀 PONTE API: Ativa na porta ${PORT} (Aguardando comandos do Painel)`);
});

// --- LÓGICA ORIGINAL DO WHATSAPP ---
client.on('qr', (qr) => {
    console.log('--- AGUARDANDO QR CODE ---');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('\n=====================================');
    console.log('✅ ZAPBOT: Sistema Online e Organizado!');
    console.log('=====================================\n');
});

client.on('message_create', async (msg) => {
    await handleMessage(client, msg, bootTime);
});

client.initialize();