const db = require('./src/database');

async function reset() {
    try {
        // Remove atendimentos e logs vinculados ao seu número de teste
        await db.query("DELETE FROM logs_mensagens WHERE atendimento_id IN (SELECT id FROM atendimentos WHERE cliente_whatsapp LIKE '%85997935916%')");
        await db.query("DELETE FROM atendimentos WHERE cliente_whatsapp LIKE '%85997935916%'");
        console.log("✅ Banco de dados limpo para o número 85997935916!");
        process.exit();
    } catch (err) {
        console.error("❌ Erro ao limpar banco:", err);
        process.exit(1);
    }
}

reset();