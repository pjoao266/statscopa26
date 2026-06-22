import { gotScraping } from 'got-scraping';
import fs from 'fs/promises';
import path from 'path';

//const HEADERS = { "x-requested-with": "4d5955" };
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://www.sofascore.com/",
    "Origin": "https://www.sofascore.com",
    "Connection": "keep-alive",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "Cache-Control": "max-age=0",
    "x-requested-with": "4d5955"
};
const DADOS_DIR = "dados";
const TOURNAMENT_ID = 16;
const SEASON_ID = 58210;

async function checkLiveGamesWithRetry(jwtToken, retries = 10) {
    const BASE_URL = 'https://worldcup26.ir';
    
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`\n⏳ [Tentativa ${i + 1}/${retries}] Verificando API de jogos ao vivo...`);
            
            const gamesResponse = await fetch(`${BASE_URL}/get/games`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${jwtToken}`
                }
            });
            

            if (!gamesResponse.ok) {
                throw new Error(`HTTP Status ${gamesResponse.status}`);
            }

            const gamesData = await gamesResponse.json();
            console.log(`\n{${gamesData}`);
            let live_games = 0;
            let time_game = '';
            
            for (let game of (gamesData.games || [])) {
                time_game = game.time_elapsed ? game.time_elapsed.toLowerCase().replace(/\s+/g, '') : '';

                if (time_game !== 'notstarted' && time_game !== 'finished' && time_game !== '') {
                    live_games++;
                    console.log(`🟢 Jogo em andamento: tempo -> ${time_game}`);
                }
            }
            
            console.log(`✅ Total de jogos ao vivo encontrados: ${live_games}`);
            return live_games > 0; // Retorna true se houver jogo, false se não houver
            
        } catch (error) {
            console.error(`❌ Erro na tentativa ${i + 1}: ${error}`);
            
            if (i === retries - 1) {
                console.error("🛑 Limite máximo de tentativas alcançado. Assumindo que não há jogos ao vivo para evitar falhas em cascata.");
                return false;
            }
            
            // Aguarda 2 segundos antes de tentar de novo para não sobrecarregar a API
            console.log("🔄 Aguardando 2 segundos para tentar novamente...");
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    return false;
}

async function fetchJson(url) {
    // Tenta ler o proxy configurado no GitHub Actions. Se não houver, roda sem proxy (local)
    const proxyUrl = process.env.PROXY_URL || undefined;
    const response = await gotScraping({
        url: url,
        headers: HEADERS,
        responseType: 'json',
        proxyUrl: proxyUrl // <--- O got-scraping usa o proxy através desta propriedade
    });
    return response.body;
}

function calculateAge(timestamp) {
    if (!timestamp) return null;
    const dob = new Date(timestamp * 1000);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
    }
    return age;
}

function formatMinute(time, addedTime) {
    if (addedTime) return `${time}+${addedTime}`;
    return String(time);
}

function classificarPorHeuristica(nominal, x, y) {
    if (nominal === 'G') return 'GL';
    if (x == null || y == null) return nominal;

    if (nominal === 'D') {
        if (y <= 30) return 'LD';
        if (y >= 70) return 'LE';
        return 'ZAG';
    }
    if (nominal === 'M') {
        if (y <= 25) return 'MD';
        if (y >= 75) return 'ME';
        // Centralizados:
        if (x <= 45) return 'VOL';
        if (x <= 60) return 'MC';
        return 'MEI';
    }
    if (nominal === 'F') {
        if (y <= 33) return 'PD';
        if (y >= 67) return 'PE';
        return 'CA';
    }
    return nominal;
}

async function getMatches() {
    let page = 0;
    const validMatches = [];
    console.log("Buscando jogos...");
    while (true) {
        const url = `https://api.sofascore.com/api/v1/unique-tournament/${TOURNAMENT_ID}/season/${SEASON_ID}/events/last/${page}`;
        try {
            let roundStage = ''
            let round = ''
            const data = await fetchJson(url);
            for (const ev of data.events || []) {
                const statusDesc = ev.status?.description;
                if (statusDesc !== 'Not started') {
                    let roundInfo = ev.roundInfo
                    if (roundInfo?.name && roundInfo?.name !== '') {
                        round = roundInfo?.name
                        roundStage = 'Fase Eliminatória'
                    }else{
                        roundStage = 'Fase de Grupos'
                        round = `${roundInfo?.round}ª rodada`
                    }

                    validMatches.push({
                        match_id: ev.id,
                        home: ev.homeTeam?.name,
                        away: ev.awayTeam?.name,
                        home_score: ev.homeScore?.current || 0,
                        away_score: ev.awayScore?.current || 0,
                        status: statusDesc,
                        round: round,
                        roundStage: roundStage
                    });
                }
            }
            if (!data.hasNextPage) break;
            page++;
        } catch (e) {
            break;
        }
    }
    return validMatches;
}

async function fetchPlayerInfo(playerId) {
    const url = `https://api.sofascore.com/api/v1/player/${playerId}`;
    try {
        const data = await fetchJson(url);
        const p = data.player || {};
        const team = p.team || {};
        let league = null;
        let leagueId = null;
        if (team.primaryUniqueTournament) {
            league = team.primaryUniqueTournament.name;
            leagueId = team.primaryUniqueTournament.id;
        } else if (team.tournament && team.tournament.uniqueTournament) {
            league = team.tournament.uniqueTournament.name;
            leagueId = team.tournament.uniqueTournament.id;
        }
        return {
            player_id: String(playerId),
            name: p.name,
            country: p.country,
            age: calculateAge(p.dateOfBirthTimestamp),
            height: p.height,
            weight: p.weight,
            club: team.name,
            club_id: team.id,
            club_country: team.country?.name,
            club_league: league,
            club_league_id: leagueId
        };
    } catch (e) {
        return null;
    }
}

async function processMatch(match, playersCache) {
    const matchId = match.match_id;
    const isEnded = match.status === 'Ended';
    const matchGoals = [];
    const playerMatchStats = {};

    
    let roundData = [];
    try {
        const roundData = await fetchJson(`https://api.sofascore.com/api/v1/event/${matchId}/shotmap`);
        roundInfo = roundData.roundInfo || [];
    } catch (e) {}
    // verificar se roundInfo name existe e é diferente de ''



    // 1. SHOTMAP
    let shotsData = [];
    try {
        const shotmapData = await fetchJson(`https://api.sofascore.com/api/v1/event/${matchId}/shotmap`);
        shotsData = shotmapData.shotmap || [];
    } catch (e) {}

    const shotsByTimePlayer = {};
    for (const shot of shotsData) {
        const pId = shot.player?.id;
        if (pId) {
            if (!playerMatchStats[pId]) {
                playerMatchStats[pId] = { 
                    match_id: matchId, player_id: pId, player_name: shot.player?.name, 
                    xg: 0.0, xa: 0.0, rating: null, nominal_position: null, detailed_position: null, 
                    formation: null, is_starter: false, average_x: null, average_y: null 
                };
            }
            if (shot.xg !== undefined) playerMatchStats[pId].xg += shot.xg;
            if (shot.shotType === 'goal') shotsByTimePlayer[`${shot.time}_${pId}`] = shot;
        }
    }

    // 2. INCIDENTS (Gols)
    let incidentsData = [];
    try {
        const incData = await fetchJson(`https://api.sofascore.com/api/v1/event/${matchId}/incidents`);
        incidentsData = incData.incidents || [];
    } catch (e) {}

    const goalIncidents = incidentsData.filter(inc => inc.incidentType === 'goal').sort((a, b) => (a.time || 0) - (b.time || 0));
    let homeScoreTracked = 0, awayScoreTracked = 0;
    const homeGoalsList = [], awayGoalsList = [];

    for (const inc of goalIncidents) {
        const time = inc.time, added = inc.addedTime;
        const scorerId = inc.player?.id;
        const isHome = inc.isHome !== false;
        
        let impact = "";
        let isTie = false;
        if (isHome) homeScoreTracked++; else awayScoreTracked++;

        const shotMatch = shotsByTimePlayer[`${time}_${scorerId}`];
        let goalType = "Bola rolando", boxLocation = "Dentro da area";
        if (shotMatch) {
            const situation = shotMatch.situation || '';
            if (situation === 'penalty' || inc.incidentClass === 'penalty') goalType = "Penalti";
            else if (situation === 'free-kick') goalType = "Falta";
            if ((shotMatch.playerCoordinates?.x || 0) > 16.5) boxLocation = "Fora da area";
        } else {
            if (inc.incidentClass === 'penalty') goalType = "Penalti";
            else if (inc.incidentClass === 'ownGoal') goalType = "Gol contra";
        }

        const golInfo = {
            match_id: matchId, minute: formatMinute(time, added), scorer_id: scorerId || null,
            scorer_name: inc.player?.name || null, assist_id: inc.assist1?.id || null, goal_type: goalType,
            box_location: boxLocation, is_home: isHome, is_own_goal: inc.incidentClass === 'ownGoal'
        };
        matchGoals.push(golInfo);
        if (isHome) homeGoalsList.push(golInfo); else awayGoalsList.push(golInfo);
    }

    let winner = null, winningGoalIndex = -1;
    if (homeScoreTracked > awayScoreTracked) { winner = 'home'; winningGoalIndex = awayScoreTracked; }
    else if (awayScoreTracked > homeScoreTracked) { winner = 'away'; winningGoalIndex = homeScoreTracked; }

    homeGoalsList.forEach((g, i) => g.is_winning_goal = (winner === 'home' && i === winningGoalIndex));
    awayGoalsList.forEach((g, i) => g.is_winning_goal = (winner === 'away' && i === winningGoalIndex));

    // 3. AVERAGE POSITIONS
    let avgPosMap = {};
    if (isEnded) {
        try {
            const avgPosData = await fetchJson(`https://api.sofascore.com/api/v1/event/${matchId}/average-positions`);
            for (const pos of [...(avgPosData.home || []), ...(avgPosData.away || [])]) {
                if (pos.player?.id) avgPosMap[pos.player.id] = { x: pos.averageX, y: pos.averageY };
            }
        } catch (e) {}
    }

    // 4. LINEUPS & ESTATÍSTICAS
    try {
        const lineupsData = await fetchJson(`https://api.sofascore.com/api/v1/event/${matchId}/lineups`);
        
        const processTeamLineup = (playersList, formation) => {
            if (!playersList) return;

            // Inicializar/Extrair Base Stats
            playersList.forEach(p => {
                const pId = p.player?.id;
                if (!pId) return;
                
                const pos = p.position || p.player?.position || null;
                const isStarter = !p.substitute;
                
                if (!playerMatchStats[pId]) {
                    playerMatchStats[pId] = { 
                        match_id: matchId, player_id: pId, player_name: p.player?.name, 
                        xg: 0.0, xa: 0.0, rating: null, nominal_position: null, detailed_position: null, 
                        formation: null, is_starter: false, average_x: null, average_y: null 
                    };
                }
                
                playerMatchStats[pId].xa = p.statistics?.expectedAssists || 0.0;
                playerMatchStats[pId].rating = p.statistics?.rating || null;
                playerMatchStats[pId].nominal_position = pos;
                playerMatchStats[pId].is_starter = isStarter;
                playerMatchStats[pId].formation = formation;
                
                if (avgPosMap[pId]) {
                    playerMatchStats[pId].average_x = avgPosMap[pId].x;
                    playerMatchStats[pId].average_y = avgPosMap[pId].y;
                }
            });

            // LÓGICA RÍGIDA PARA TITULARES DA EQUIPA
            const starters = playersList.filter(p => !p.substitute).map(p => playerMatchStats[p.player.id]).filter(p => p);
            
            // Agrupar titulares por linha nominal
            const startersG = starters.filter(p => p.nominal_position === 'G');
            const startersD = starters.filter(p => p.nominal_position === 'D').sort((a,b) => (a.average_y || 50) - (b.average_y || 50));
            const startersM = starters.filter(p => p.nominal_position === 'M');
            const startersF = starters.filter(p => p.nominal_position === 'F').sort((a,b) => (a.average_y || 50) - (b.average_y || 50));

            // Atribuir Goleiro
            startersG.forEach(p => p.detailed_position = 'GL');

            // Atribuir Defensores (Regra de Formação)
            if (startersD.length === 4) {
                startersD[0].detailed_position = 'LD';
                startersD[1].detailed_position = 'ZAG';
                startersD[2].detailed_position = 'ZAG';
                startersD[3].detailed_position = 'LE';
            } else if (startersD.length === 3) {
                startersD.forEach(p => p.detailed_position = 'ZAG'); // Ex: 3-5-2
            } else if (startersD.length === 5) {
                startersD[0].detailed_position = 'LD';
                startersD[1].detailed_position = 'ZAG';
                startersD[2].detailed_position = 'ZAG';
                startersD[3].detailed_position = 'ZAG';
                startersD[4].detailed_position = 'LE';
            } else {
                startersD.forEach(p => p.detailed_position = classificarPorHeuristica(p.nominal_position, p.average_x, p.average_y));
            }

            // Atribuir Meias (A heurística lida perfeitamente com VOL/MC/MEI/MD/ME através do X e Y)
            startersM.forEach(p => p.detailed_position = classificarPorHeuristica('M', p.average_x, p.average_y));

            // Atribuir Atacantes
            if (startersF.length === 3) {
                startersF[0].detailed_position = 'PD';
                startersF[1].detailed_position = 'CA';
                startersF[2].detailed_position = 'PE';
            } else if (startersF.length === 2) {
                startersF.forEach(p => p.detailed_position = 'CA');
            } else if (startersF.length === 1) {
                startersF[0].detailed_position = 'CA';
            } else {
                startersF.forEach(p => p.detailed_position = classificarPorHeuristica(p.nominal_position, p.average_x, p.average_y));
            }

            // LÓGICA PARA RESERVAS (Usa heurística baseada no mapa de calor/movimento)
            const subs = playersList.filter(p => p.substitute).map(p => playerMatchStats[p.player.id]).filter(p => p);
            subs.forEach(p => p.detailed_position = classificarPorHeuristica(p.nominal_position, p.average_x, p.average_y));
        };

        processTeamLineup(lineupsData.home?.players, lineupsData.home?.formation);
        processTeamLineup(lineupsData.away?.players, lineupsData.away?.formation);

    } catch (e) {}

    const statsList = Object.values(playerMatchStats).filter(s => 
        s.xg > 0 || s.xa > 0 || s.rating !== null || s.average_x !== null
    );
    
    return { matchGoals, statsList };
}

async function fetchAllTeamsAndPlayers() {
    const allPlayerIds = new Set();
    console.log("Buscando todos os jogadores das selecoes listadas...");
    try {
        const teamsData = await fetchJson(`https://api.sofascore.com/api/v1/unique-tournament/${TOURNAMENT_ID}/season/${SEASON_ID}/teams`);
        const teams = teamsData.teams || [];
        console.log(`Encontrados ${teams.length} times no torneio.`);

        const chunk = 5;
        for (let i = 0; i < teams.length; i += chunk) {
            const batch = teams.slice(i, i + chunk);
            await Promise.all(batch.map(async team => {
                try {
                    const pd = await fetchJson(`https://api.sofascore.com/api/v1/team/${team.id}/players`);
                    for (const p of (pd.players || [])) {
                        if (p.player?.id) allPlayerIds.add(String(p.player.id));
                    }
                } catch (e) {}
            }));
        }
    } catch (e) {
        console.error("Erro ao buscar times:", e.message);
    }
    return Array.from(allPlayerIds);
}

async function asyncPool(poolLimit, array, iteratorFn) {
    const ret = [];
    const executing = [];
    for (const item of array) {
        const p = Promise.resolve().then(() => iteratorFn(item, array));
        ret.push(p);
        if (poolLimit <= array.length) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= poolLimit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(ret);
}

export async function runScraper() {
    await fs.mkdir(DADOS_DIR, { recursive: true });
    const jsonPath = path.join(DADOS_DIR, 'copa_2026_dados.json');

    let existingData = { matches: [], goals: [], player_match_stats: [], players_info: [] };
    try {
        const raw = await fs.readFile(jsonPath, 'utf-8');
        existingData = JSON.parse(raw);
    } catch (e) {
        // file doesn't exist or is invalid
    }

    const playersCache = {};
    for (const p of existingData.players_info || []) {
        playersCache[String(p.player_id)] = p;
    }
    console.log(`Jogadores cacheados no disco: ${Object.keys(playersCache).length}`);

    const allPlayerIds = await fetchAllTeamsAndPlayers();
    console.log(`Total de jogadores vinculados as selecoes: ${allPlayerIds.length}`);

    const missingPlayers = allPlayerIds.filter(id => !playersCache[id]);
    if (missingPlayers.length > 0) {
        console.log(`Buscando perfil de ${missingPlayers.length} novos jogadores...`);
        let count = 0;
        await asyncPool(5, missingPlayers, async (pid) => {
            const data = await fetchPlayerInfo(pid);
            if (data) playersCache[String(pid)] = data;
            count++;
            if (count % 50 === 0) console.log(`Baixados ${count}/${missingPlayers.length} perfis...`);
        });
    }

    const matches = await getMatches();
    console.log(`Total de ${matches.length} jogos iniciados/encerrados.`);

    const endedMatchesCache = {};
    for (const m of existingData.matches || []) {
        if (m.status === 'Ended') endedMatchesCache[m.match_id] = m;
    }

    const allGoals = [];
    const allStats = [];

    for (const g of existingData.goals || []) {
        if (endedMatchesCache[g.match_id]) allGoals.push(g);
    }
    for (const st of existingData.player_match_stats || []) {
        if (endedMatchesCache[st.match_id]) allStats.push(st);
    }

    console.log("\nProcessando novos jogos...");
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const mId = match.match_id;

        if (endedMatchesCache[mId] && match.status === 'Ended') {
            console.log(`[${i + 1}/${matches.length}] ${match.home} vs ${match.away} (PULADO - já cacheado)`);
            continue;
        }

        console.log(`[${i + 1}/${matches.length}] Processando ${match.home} vs ${match.away}...`);
        const res = await processMatch(match, playersCache);
        allGoals.push(...res.matchGoals);
        allStats.push(...res.statsList);
    }

    const playerPoints = {};
    for (const pid of Object.keys(playersCache)) {
        playerPoints[pid] = { player_id: pid, player_name: playersCache[pid].name || 'Unknown', points: 0 };
    }

    for (const g of allGoals) {
        if (g.is_own_goal) continue;

        const pid = String(g.scorer_id);
        if (!pid || pid === 'null' || pid === 'undefined') continue;
        if (!playerPoints[pid]) {
            playerPoints[pid] = { player_id: pid, player_name: g.scorer_name, points: 0 };
        }

        let pts = 0;
        if (g.is_winning_goal) pts += 3;
        if (g.is_tie) pts += 1;

        playerPoints[pid].points += pts;
    }

    const pointsList = Object.values(playerPoints)
        .filter(p => p.points > 0)
        .sort((a, b) => b.points - a.points);

    console.log("\nSalvando JSON...");

    if (matches.length === 0 || Object.keys(playersCache).length === 0) {
        console.error("❌ ERRO: A raspagem falhou ou foi bloqueada. Abortando salvamento para não corromper o cache antigo.");
        return;
    }

    const fullData = {
        matches,
        goals: allGoals,
        player_match_stats: allStats,
        players_info: Object.values(playersCache),
        player_points: pointsList
    };

    await fs.writeFile(jsonPath, JSON.stringify(fullData, null, 2), 'utf-8');
    console.log("Processo JS concluído com sucesso!");
    return fullData;
}

try {
    const JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhMzk1NzYxMGUyMjIyZTdlMzE5OWYwMSIsImlhdCI6MTc4MjE0MjgyNCwiZXhwIjoxNzg5NDAwNDI0fQ.2xRzSFszzg79RVt8Gu38iyWCyYTMofaUUAhBnzchjGU"; // ATENÇÃO: Insira seu token aqui
    
    // 1. Verifica se há jogos rodando antes de acionar o Sofascore
    const temJogoAoVivo = await checkLiveGamesWithRetry(JWT_TOKEN, 10);
    
    if (temJogoAoVivo) {
        console.log("\n🚀 Jogos em andamento detectados! Iniciando raspagem do Sofascore...");
        // Roda a extração usando a rede de proxies configurada
        const dadosFinais = await runScraper();  
    } else {
        console.log("\n⏸️ Nenhum jogo em andamento. O scraper do Sofascore foi pausado.");
    }
    
} catch (error) {
    console.error("❌ Ocorreu um erro crítico durante a execução do script:", error);
}
