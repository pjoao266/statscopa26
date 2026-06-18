import { gotScraping } from 'got-scraping';
import fs from 'fs/promises';
import path from 'path';

const HEADERS = { "x-requested-with": "4d5955" };
const DADOS_DIR = "dados";
const TOURNAMENT_ID = 16;
const SEASON_ID = 58210;

async function fetchJson(url) {
    const response = await gotScraping(url, { headers: HEADERS, responseType: 'json' });
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

async function getMatches() {
    let page = 0;
    const validMatches = [];
    console.log("Buscando jogos...");
    while (true) {
        const url = `https://api.sofascore.com/api/v1/unique-tournament/${TOURNAMENT_ID}/season/${SEASON_ID}/events/last/${page}`;
        try {
            const data = await fetchJson(url);
            for (const ev of data.events || []) {
                const statusDesc = ev.status?.description;
                if (statusDesc !== 'Not started') {
                    validMatches.push({
                        match_id: ev.id,
                        home: ev.homeTeam?.name,
                        away: ev.awayTeam?.name,
                        home_score: ev.homeScore?.current || 0,
                        away_score: ev.awayScore?.current || 0,
                        status: statusDesc
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
    const matchGoals = [];
    const playerMatchStats = {};

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
                playerMatchStats[pId] = { match_id: matchId, player_id: pId, player_name: shot.player?.name, xg: 0.0, xa: 0.0, rating: null };
            }
            if (shot.xg !== undefined) {
                playerMatchStats[pId].xg += shot.xg;
            }
            if (shot.shotType === 'goal') {
                shotsByTimePlayer[`${shot.time}_${pId}`] = shot;
            }
        }
    }

    // 2. INCIDENTS
    let incidentsData = [];
    try {
        const incData = await fetchJson(`https://api.sofascore.com/api/v1/event/${matchId}/incidents`);
        incidentsData = incData.incidents || [];
    } catch (e) {}

    const goalIncidents = incidentsData.filter(inc => inc.incidentType === 'goal');
    goalIncidents.sort((a, b) => (a.time || 0) - (b.time || 0));

    let homeScoreTracked = 0;
    let awayScoreTracked = 0;
    const homeGoalsList = [];
    const awayGoalsList = [];

    for (const inc of goalIncidents) {
        const time = inc.time;
        const added = inc.addedTime;
        const minuteStr = formatMinute(time, added);

        const jogadorGol = inc.player || {};
        const jogadorAssist = inc.assist1 || {};
        const scorerId = jogadorGol.id;

        const isHome = inc.isHome !== false;
        const isOwnGoal = inc.incidentClass === 'ownGoal';

        const scorerTeamPrev = isHome ? homeScoreTracked : awayScoreTracked;
        const concedingTeamPrev = isHome ? awayScoreTracked : homeScoreTracked;

        if (isHome) homeScoreTracked++;
        else awayScoreTracked++;

        const scorerTeamGoals = isHome ? homeScoreTracked : awayScoreTracked;
        const concedingTeamGoals = isHome ? awayScoreTracked : homeScoreTracked;

        let impact = "";
        let isTie = false;

        if (scorerTeamPrev === concedingTeamPrev) {
            impact = "Lideranca";
        } else if (scorerTeamGoals === concedingTeamGoals) {
            impact = "Empate";
            isTie = true;
        } else if (scorerTeamPrev > concedingTeamPrev) {
            impact = "Ampliar";
        } else {
            impact = "Diminuir";
        }

        const shotMatch = shotsByTimePlayer[`${time}_${scorerId}`];
        let goalType = "Bola rolando";
        let boxLocation = "Dentro da area";

        if (shotMatch) {
            const situation = shotMatch.situation || '';
            if (situation === 'penalty' || inc.incidentClass === 'penalty') {
                goalType = "Penalti";
            } else if (situation === 'free-kick') {
                goalType = "Falta";
            }
            const xCoord = shotMatch.playerCoordinates?.x || 0;
            if (xCoord > 16.5) boxLocation = "Fora da area";
        } else {
            if (inc.incidentClass === 'penalty') goalType = "Penalti";
            else if (isOwnGoal) goalType = "Gol contra";
        }

        const golInfo = {
            match_id: matchId,
            minute: minuteStr,
            scorer_id: scorerId || null,
            scorer_name: jogadorGol.name || null,
            assist_id: jogadorAssist.id || null,
            assist_name: jogadorAssist.name || null,
            goal_type: goalType,
            box_location: boxLocation,
            impact: impact,
            is_tie: isTie,
            is_home: isHome,
            is_own_goal: isOwnGoal
        };

        matchGoals.push(golInfo);
        if (isHome) homeGoalsList.push(golInfo);
        else awayGoalsList.push(golInfo);
    }

    let winner = null;
    let winningGoalIndex = -1;
    if (homeScoreTracked > awayScoreTracked) {
        winner = 'home';
        winningGoalIndex = awayScoreTracked;
    } else if (awayScoreTracked > homeScoreTracked) {
        winner = 'away';
        winningGoalIndex = homeScoreTracked;
    }

    for (let i = 0; i < homeGoalsList.length; i++) {
        homeGoalsList[i].is_winning_goal = (winner === 'home' && i === winningGoalIndex);
    }
    for (let i = 0; i < awayGoalsList.length; i++) {
        awayGoalsList[i].is_winning_goal = (winner === 'away' && i === winningGoalIndex);
    }

    // 3. LINEUPS
    try {
        const lineupsData = await fetchJson(`https://api.sofascore.com/api/v1/event/${matchId}/lineups`);
        const allPlayers = (lineupsData.home?.players || []).concat(lineupsData.away?.players || []);

        for (const p of allPlayers) {
            const pId = p.player?.id;
            const pName = p.player?.name;
            const xa = p.statistics?.expectedAssists || 0.0;
            const rating = p.statistics?.rating || null; // Capturar a nota

            if (pId) {
                if (!playerMatchStats[pId]) {
                    playerMatchStats[pId] = { match_id: matchId, player_id: pId, player_name: pName, xg: 0.0, xa: 0.0, rating: null };
                }
                playerMatchStats[pId].xa = xa;
                if (rating !== null) {
                    playerMatchStats[pId].rating = rating;
                }
            }
        }
    } catch (e) {}

    // Filtrar quem tem xg, xa ou nota (rating)
    const statsList = Object.values(playerMatchStats).filter(s => s.xg > 0 || s.xa > 0 || s.rating !== null);
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

// Se o arquivo for executado diretamente pelo Node, roda o scraper.
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runScraper().catch(console.error);
}
