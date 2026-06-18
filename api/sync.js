export default async function handler(req, res) {
    // 1. Configurar cabeçalhos CORS para permitir que o seu GitHub Pages acesse esta API
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Em produção, pode trocar o '*' pelo link do seu GitHub Pages
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Tratar a requisição de validação (Preflight) que o navegador faz automaticamente
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Bloquear qualquer método que não seja POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    // 2. Configurações para acionar o GitHub Actions
    const TOKEN = process.env.GITHUB_TOKEN; // Será puxado com segurança da Vercel
    const OWNER = 'pjoao266';
    const REPO = 'statscopa26'; // Confirme se o nome do repositório está idêntico
    const WORKFLOW_ID = 'scraper.yml';

    const url = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`;

    try {
        const githubResponse = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'Vercel-Serverless-Sync'
            },
            body: JSON.stringify({
                ref: 'main' // Executa o robô na branch principal
            })
        });

        // O GitHub responde com 204 quando aceita o comando com sucesso
        if (githubResponse.status === 204) {
            return res.status(200).json({ success: true, message: "Sincronização iniciada no GitHub Actions!" });
        } else {
            const erroTexto = await githubResponse.text();
            return res.status(500).json({ error: "Falha ao acionar o GitHub", details: erroTexto });
        }

    } catch (error) {
        return res.status(500).json({ error: "Erro interno no servidor", details: error.message });
    }
}