const db = require('./src/database');

async function testarFluxo() {
  try {
    // 1. Limpar e Inserir Atendentes
    await db.query('DELETE FROM logs_mensagens; DELETE FROM atendimentos; DELETE FROM atendentes;');
    
    const carlos = await db.query(
      'INSERT INTO atendentes (nome, nivel) VALUES ($1, $2) RETURNING id', 
      ['Carlos', 1]
    );
    const yuri = await db.query(
      'INSERT INTO atendentes (nome, nivel) VALUES ($1, $2) RETURNING id', 
      ['Yuri', 2]
    );

    console.log(`✅ Atendentes criados: Carlos (ID ${carlos.rows[0].id}) e Yuri (ID ${yuri.rows[0].id})`);

    // 2. Simular início de atendimento
    const atendimento = await db.query(
      'INSERT INTO atendimentos (cliente_whatsapp, atendente_id, status) VALUES ($1, $2, $3) RETURNING id',
      ['5511999999999', carlos.rows[0].id, 'em_curso']
    );

    console.log(`✅ Atendimento iniciado com Carlos. ID: ${atendimento.rows[0].id}`);

    // 3. Simular Log de Mensagem
    await db.query(
      'INSERT INTO logs_mensagens (atendimento_id, remetente, mensagem) VALUES ($1, $2, $3)',
      [atendimento.rows[0].id, 'cliente', 'Preciso de ajuda com meu WMS!']
    );

    console.log('✅ Log de mensagem gravado com sucesso!');
    
  } catch (err) {
    console.error('❌ Erro no teste:', err);
  } finally {
    process.exit();
  }
}

testarFluxo();