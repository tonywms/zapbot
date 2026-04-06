const { Pool } = require('pg');
require('dotenv').config();

// Configuração do Pool de conexões
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  max: 20, // máximo de conexões simultâneas
  idleTimeoutMillis: 30000, // tempo para fechar conexão ociosa
});

// Função para executar queries (Facilita o uso nos outros arquivos)
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Query executada:', { text, duration, rows: res.rowCount });
    return res;
  } catch (err) {
    console.error('Erro na Query:', err);
    throw err;
  }
};

// Teste de conexão inicial
pool.on('connect', () => {
  console.log('🐘 Conectado ao PostgreSQL com sucesso!');
});

module.exports = {
  query,
  pool
};