const fs = require('fs');
const path = require('path');
const db = require('../database');
// IMPORTAÇÃO DA LOGICA DO KEYGEN
const { gerarChaveFinal } = require('../../wms-expert-api/utils/keygen');

const mediaDir = path.join(__dirname, '../../media');

// --- FUNÇÃO PARA CALCULAR POSIÇÃO NA FILA ---
async function getPosicaoFila(atendenteId, dataInicio) {
    const res = await db.query(
        "SELECT COUNT(*) FROM atendimentos WHERE atendente_id = $1 AND status = 'aguardando' AND data_inicio <= $2",
        [atendenteId, dataInicio]
    );
    return parseInt(res.rows[0].count);
}

async function gravarLogMensagem(atendimentoId, remetente, texto) {
    await db.query("INSERT INTO logs_mensagens (atendimento_id, remetente, mensagem) VALUES ($1, $2, $3)", [atendimentoId, remetente, texto]);
}

async function handleMessage(client, msg, bootTime) {
    const textoOriginal = msg.body || "";
    const contato = msg.from;

    // ✅ DEFINIDO ANTES DE TUDO (CORREÇÃO DO ERRO)
    // Adicionado o final 2738 para o novo número autorizado
    const isOwner = contato?.includes('97935916') || 
                    contato?.includes('7935916') || 
                    contato?.includes('2738');

    // --- LOG DE ENTRADA ---
    console.log(`\n📩 MENSAGEM: ${textoOriginal} | DE: ${contato}`);

    // ============================================================
    // 🚀 [PRIORIDADE ZERO] DETECTOR DE CHAVE (BOT API)
    // ============================================================
    const textoLimpo = textoOriginal.replace(/[*_`~]/g, '').trim();
    const regexChaveWMS = /^[A-Za-z0-9]{4,10}-[A-Za-z0-9]{4,25}$/;

    // Lógica para detectar se o usuário tentou mandar um código, mas errou o formato
    const pareceHwid = /^[A-Za-z0-9]+$/.test(textoLimpo) && textoLimpo.length >= 7;

    console.log(`[DEBUG] Testando Regex em: "${textoLimpo}" | Resultado: ${regexChaveWMS.test(textoLimpo)}`);

    // Busca o atendimento atual para saber se deve mostrar o erro de código
    const checkAtendimento = await db.query(
        "SELECT atendente_id, categoria FROM atendimentos WHERE (cliente_whatsapp = $1 OR cliente_whatsapp LIKE '%' || $2 || '%') AND status != 'finalizado' LIMIT 1",
        [contato, '97935916']
    );
    const emFluxoAtivacao = checkAtendimento.rows[0]?.atendente_id === 3;

    if (regexChaveWMS.test(textoLimpo) && (!msg.fromMe || isOwner)) {
        process.stdout.write('\x07'); 
        console.log("\x1b[42m\x1b[30m%s\x1b[0m", `[KEYGEN] EXECUTANDO API PARA: ${textoLimpo}`);

        try {
            const dataAlvo = new Date();
            dataAlvo.setDate(dataAlvo.getDate() + 60);
            const dia = String(dataAlvo.getDate()).padStart(2, '0');
            const mes = String(dataAlvo.getMonth() + 1).padStart(2, '0');
            const dataFormatada = `${dia}/${mes}/${dataAlvo.getFullYear()}`;
            
            const chaveGerada = gerarChaveFinal(textoLimpo, dataFormatada);
            
            if (chaveGerada && chaveGerada !== "ERRO_FORMATO") {
                const resposta = `🔑 *LIBERAÇÃO CONCLUÍDA!* \n\n` +
                                 `\`${chaveGerada}\`\n\n` +
                                 `📅 *Validade:* ${dataFormatada}\n\n` +
                                 `*Instrução:* Copie o código acima e cole no seu sistema.`;
                
                await client.sendMessage(contato, resposta);
                await db.query(
                    "UPDATE atendimentos SET status = 'finalizado' WHERE (cliente_whatsapp = $1 OR cliente_whatsapp LIKE '%' || $2 || '%') AND status != 'finalizado'",
                    [contato, '97935916']
                );

                console.log("\x1b[32m%s\x1b[0m", `[SUCCESS] Chave enviada com sucesso!`);
                return; 
            } else if (emFluxoAtivacao) { // SÓ MOSTRA ERRO SE ESTIVER NO MENU INICIAL/ATIVAÇÃO
                await client.sendMessage(contato, "⚠️ *FORMATO INVÁLIDO*\n\nO HWID enviado está incompleto ou sem o hífen. Por favor, copie exatamente como aparece na tela do sistema.");
                return;
            }
        } catch (err) {
            console.error("❌ ERRO NO MOTOR DE CHAVES:", err);
        }
    } else if (pareceHwid && emFluxoAtivacao && (!msg.fromMe || isOwner)) {
        // Se o Regex falhou mas o texto parece um HWID E ele está no fluxo de atendimento inicial
        await client.sendMessage(contato, "❌ *CÓDIGO INCORRETO*\n\nNotei que você enviou um código, mas faltou o hífen ou alguns caracteres.\n\n👉 *Exemplo correto:* `WJML-DVW1` ou `WJMLMDVW-BDDD`.");
        return;
    }

    // ============================================================
    // RESTANTE DO CÓDIGO (MENU E REGRAS)
    // ============================================================
    const comandoBaixa = textoOriginal.toLowerCase().trim();
    if (textoOriginal.includes("Opção inválida. Digite apenas o número")) return;

    if (msg.fromMe === true) {
        const isToSelf = msg.to.includes('97935916') || msg.to.includes('7935916') || msg.to.includes('@lid');
        if (!isToSelf) return;

        const ehOpcaoMenu = /^[0-7]$/.test(textoOriginal.trim());
        const termosFechar = ['encerrar', 'finalizar', 'sair', 'fechar', 'concluir', '0', 'sim', 'não', 'nao', 'oi'];
        if (!ehOpcaoMenu && !termosFechar.includes(comandoBaixa)) return;
    }

    if (contato.includes('@g.us') || contato === 'status@broadcast' || msg.isGroupMsg) return;
    if (!isOwner && !msg.fromMe) return; 
    if (msg.timestamp < bootTime) return;

    let textoLog = textoOriginal;

    try {
        // Re-executa a query para garantir que temos os dados atualizados para o menu
        const res = await db.query(
            "SELECT id, atendente_id, categoria, status, data_inicio FROM atendimentos WHERE (cliente_whatsapp = $1 OR cliente_whatsapp LIKE '%' || $2 || '%') AND status != 'finalizado' LIMIT 1",
            [contato, '97935916']
        );

        let atendimentoId;
        let atendenteAtualId;
        let statusAtual;

        if (res.rows.length === 0 || comandoBaixa === 'oi') {
            if (res.rows.length === 0) {
                const novo = await db.query(
                    "INSERT INTO atendimentos (cliente_whatsapp, atendente_id, status) VALUES ($1, 3, 'em_curso') RETURNING id",
                    [contato]
                );
                atendimentoId = novo.rows[0].id;
            } else {
                atendimentoId = res.rows[0].id;
                await db.query("UPDATE atendimentos SET atendente_id = 3, status = 'em_curso' WHERE id = $1", [atendimentoId]);
            }
            
            const menu = `✨ *Opa! Que alegria ter você aqui!* ✨\n\n` +
                         `Eu sou o *Expert*, seu parceiro de jornada! 🚀\n\n` +
                         `1️⃣  Reportar um *Bug* 🐞\n` +
                         `2️⃣  Solicitar *Customização* ✨\n` +
                         `3️⃣  *Integrações* 🔗\n` +
                         `4️⃣  Falar com o *Comercial* 💰\n` +
                         `5️⃣  *Suporte Técnico* 👨‍💻\n` +
                         `6️⃣  Ativação de *Chaves* 🔑\n` +
                         `7️⃣  Falar com o *Financeiro* 📈\n\n` +
                         `0️⃣  *Encerrar* 👋`;

            await client.sendMessage(contato, menu);
            return;
        }

        atendimentoId = res.rows[0].id;
        atendenteAtualId = res.rows[0].atendente_id;
        statusAtual = res.rows[0].status;
        const dataInicioAtend = res.rows[0].data_inicio;

        if (atendenteAtualId === 1 && (statusAtual === 'em_curso' || statusAtual === 'aguardando')) {
            if (textoLog && !msg.fromMe) await gravarLogMensagem(atendimentoId, contato, textoLog);
            return; 
        }

        if (['encerrar', 'finalizar', 'sair', 'fechar', 'concluir', '0'].includes(comandoBaixa)) {
            await db.query("UPDATE atendimentos SET status = 'finalizado' WHERE id = $1", [atendimentoId]);
            await client.sendMessage(contato, `Atendimento encerrado! ✅`);
            return;
        }

        if (atendenteAtualId === 3) {
            const escolha = textoOriginal.trim();
            const txtSair = `\n\n_(Para sair, digite **0** 😉)_`;

            if (escolha === "6") {
                const passoAPasso = `🔐 *BORA ATIVAR SEU SISTEMA!* 🔑\n\n` +
                                    `1️⃣ Na tela de bloqueio, clique em *Registrar*.\n` +
                                    `2️⃣ Digite seu *CNPJ* e clique em *Registrar*.\n` +
                                    `3️⃣ Copie o *Código Chave* e *COLE AQUI*! 👇` + txtSair;
                await client.sendMessage(contato, passoAPasso);
                return;
            }

            if (escolha === "5") {
                await db.query("UPDATE atendimentos SET atendente_id = 1, categoria = 'Suporte Técnico 👨‍💻', status = 'aguardando', cliente_nome = 'Cliente WhatsApp' WHERE id = $1", [atendimentoId]);
                const posicao = await getPosicaoFila(1, dataInicioAtend);
                await client.sendMessage(contato, `✅ *Suporte Técnico* acionado! Você é o **${posicao}º** na fila do Carlos. 🏃💨` + txtSair);
                return;
            }

            if (escolha === "3") {
                await db.query("UPDATE atendimentos SET atendente_id = 1, categoria = 'Integrações 🔗', status = 'aguardando', cliente_nome = 'Cliente WhatsApp' WHERE id = $1", [atendimentoId]);
                const posicao = await getPosicaoFila(1, dataInicioAtend);
                await client.sendMessage(contato, `✅ *Integrações* registradas! Você é o **${posicao}º** na fila.` + txtSair);
                return;
            }

            if (escolha === "1") return await client.sendMessage(contato, `✅ *Bug*: https://runrun.it/pt-BR/forms/126239` + txtSair);
            if (escolha === "2") return await client.sendMessage(contato, `✅ *Customização*: https://runrun.it/pt-BR/forms/127343` + txtSair);
            if (escolha === "4") return await client.sendMessage(contato, `✅ *Comercial*: https://wa.me/558591350235` + txtSair);
            if (escolha === "7") return await client.sendMessage(contato, `✅ *Financeiro*: https://wa.me/558586413456` + txtSair);
            
            if (comandoBaixa !== 'oi') await client.sendMessage(contato, "⚠️ Escolha de 1 a 7, ou 0 para encerrar.");
            return;
        }

        if (msg.hasMedia) {
            try {
                const media = await msg.downloadMedia();
                const nome = `atend_${atendimentoId}_${Date.now()}.${media.mimetype.split('/')[1].split(';')[0]}`;
                if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
                fs.writeFileSync(path.join(mediaDir, nome), media.data, { encoding: 'base64' });
                textoLog = `[ARQUIVO]: /media/${nome}`;
            } catch (e) { console.error("Erro mídia:", e); }
        }

        if (textoLog && !msg.fromMe) await gravarLogMensagem(atendimentoId, contato, textoLog);

    } catch (err) { 
        console.error("❌ Erro:", err); 
    }
}

module.exports = { handleMessage };