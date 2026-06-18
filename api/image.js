import { gotScraping } from 'got-scraping';

export default async function handler(req, res) {
    // Permite que o seu GitHub Pages chame esse endpoint de imagens
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    // Pega a URL real da imagem enviada por parâmetro
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    const proxyUrl = process.env.PROXY_URL || undefined;
    console.log(proxyUrl)
    try {
        // Faz a requisição camuflada para o Sofascore buscando a imagem
        const response = await gotScraping({
            url: url,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                "Referer": "https://www.sofascore.com/",
                "Origin": "https://www.sofascore.com"
            },
            proxyUrl: proxyUrl,
            responseType: 'buffer' // Crucial: avisa o Node que o retorno é um arquivo binário (imagem)
        });

        // Repassa o formato exato da imagem (image/png, image/jpeg, etc) obtido do Sofascore
        const contentType = response.headers['content-type'] || 'image/png';
        res.setHeader('Content-Type', contentType);

        // Desempenho: Guarda a imagem no cache por 1 dia para não estourar a cota do seu proxy Webshare
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');

        // Envia o arquivo binário direto para o navegador do usuário
        return res.status(200).send(response.body);

    } catch (error) {
        console.error('Erro ao burlar imagem do Sofascore:', error.message);
        return res.status(500).json({ error: 'Erro ao processar imagem' });
    }
}