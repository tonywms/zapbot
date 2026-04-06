const { handleMessage } = require('./src/handlers/messageHandler');

// Simulação de um objeto "client" do WhatsApp
const clientMock = {
    sendMessage: async (to, msg) => {
        console.log(`\n[BOT ENVIANDO PARA ${to}]:\n${msg}\n`);
    }
};

// Simulação de uma mensagem vinda do seu número
const msgMock = {
    from: '5585997935916@c.us',
    body: '1', // Testando a opção 1 do menu
    hasMedia: false,
    fromMe: false,
    isGroupMsg: false,
    timestamp: Math.floor(Date.now() / 1000) + 10 // Forçando ser "nova"
};

const bootTime = Math.floor(Date.now() / 1000);

console.log("--- INICIANDO TESTE DE LOGICA ---");
handleMessage(clientMock, msgMock, bootTime)
    .then(() => console.log("--- TESTE FINALIZADO ---"))
    .catch(err => console.error(err));