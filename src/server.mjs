import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { runScraper } from './scraper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, '..')));

// Endpoint para fornecer os dados já cacheados (JSON)
app.get('/api/data', async (req, res) => {  })

// Endpoint para forçar a rodar o scraper manualmente, se necessário
app.post('/api/sync', async (req, res) => {
    try {
        console.log("Iniciando sync manual...");
        await runScraper();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Inicialização: Rodar o scraper e subir o servidor
app.listen(PORT, async () => {
    console.log(`Servidor rodando na porta http://localhost:${PORT}`);
    console.log('Iniciando o scraper para garantir dados atualizados...');
    try {
        await runScraper();
    } catch (e) {
        console.error('Erro no scraper ao iniciar:', e);
    }
});
