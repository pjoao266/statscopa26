document.addEventListener('DOMContentLoaded', () => {
    let appData = null;

    const badge = document.getElementById('loading-badge');
    const btnRefresh = document.getElementById('btn-refresh');
    const themeToggle = document.getElementById('theme-toggle');

    // Theme logic
    let isDark = true;
    themeToggle.addEventListener('click', () => {
        isDark = !isDark;
        document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
        themeToggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    });

function isoParaEmojiBandeira(codigoIso) {
    if (!codigoIso || codigoIso.length !== 2) return '';
    
    const codigoMaiusculo = codigoIso.toUpperCase();
    
    // Deslocamento mágico do Unicode para Símbolos Indicadores Regionais (127397)
    return String.fromCodePoint(
        codigoMaiusculo.codePointAt(0) + 127397,
        codigoMaiusculo.codePointAt(1) + 127397
    );
}

function formatPlayerName(info) {
    if (!info) return 'Desconhecido';
    const name = info.name || 'Desconhecido';
    
    // Pega o código alpha2 com segurança (usando ? para evitar erro se 'country' não existir)
    const alpha2 = info.country?.alpha2 || '';

    if (!alpha2 || alpha2.toLowerCase() === 'seleção') {
        return name;
    }

    let flagHtml = '';

    // Verifica se é a Inglaterra (Sofascore costuma mandar 'EN' para a Inglaterra)
    if (alpha2.toUpperCase() === 'EN') {
        flagHtml = `<img src="https://flagcdn.com/16x12/gb-eng.png" class="ms-2 shadow-sm" style="width: 16px; height: 12px; vertical-align: middle; margin-top: -2px;">`;
    } else {
        // Para os outros países, converte o alpha2 (ex: 'BR') direto para o emoji
        const emoji = isoParaEmojiBandeira(alpha2);
        flagHtml = `<span class="flag-emoji ms-2">${emoji}</span>`;
    }

    return `${name} &nbsp; ${flagHtml}`.trim();
}

function obterImagemSegura(urlSofascore) {
    const VERCEL_BASE = 'https://statscopa26.vercel.app/api/image';
    // Codifica a URL para evitar problemas com caracteres especiais na query string
    return `${VERCEL_BASE}?url=${encodeURIComponent(urlSofascore)}`;
}
    // Inicializa a aplicação
    fetchData();

    btnRefresh.addEventListener('click', async () => {
        btnRefresh.disabled = true;
        badge.style.display = 'inline-block';
        badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Sincronizando...';
        
        try {
            const urlVercel = 'https://statscopa26.vercel.app/api/sync';
            
            const res = await fetch(urlVercel, { method: 'POST' });
            if(res.ok) {
                badge.innerHTML = '🤖 Robô acionado! Atualize a página em 1 min.';
            } else {
                badge.innerHTML = '❌ Erro ao acionar o robô';
            }
        } catch (e) {
            console.error("Erro no sync", e);
            badge.innerHTML = '❌ Erro de conexão';
        } finally {
            btnRefresh.disabled = false;
        }
    });

    document.getElementById('stats-filter').addEventListener('change', () => {
        if(appData) renderStats(appData);
    });
    
    document.getElementById('stats-sort').addEventListener('change', () => {
        if(appData) renderStats(appData);
    });


    async function fetchData() {
        badge.style.display = 'inline-block';
        try {
            const res = await fetch('dados/copa_2026_dados.json');
            if(res.ok) {
                appData = await res.json();
                badge.style.display = 'none';
                renderAll();
            } else {
                badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation me-1"></i> Aguardando dados...';
                setTimeout(fetchData, 5000); // Tenta novamente em 5s
            }
        } catch (e) {
            console.error("Erro ao buscar dados", e);
            setTimeout(fetchData, 5000);
        }
    }

    function renderAll() {
        renderBingo(appData);
        renderStats(appData);
        renderRanking(appData);
    }

    // --- BINGO LOGIC ---
    let bingoModalInst = null;
    
    function renderBingo(data) {
        const grid = document.getElementById('bingo-grid');
        grid.innerHTML = '';
        
        const minutesMap = {};
        for(let i=0; i<=90; i++) minutesMap[i.toString()] = [];
        for(let i=1; i<=10; i++) minutesMap[`45+${i}`] = [];
        for(let i=1; i<=10; i++) minutesMap[`90+${i}`] = [];

        data.goals.forEach(g => {
            const m = g.minute;
            if(minutesMap[m] !== undefined) {
                minutesMap[m].push(g);
            } else {
                minutesMap[m] = [g]; 
            }
        });

        const totalRegulares = 90;
        let filledRegulares = 0;

        Object.keys(minutesMap).sort((a, b) => {
            const valA = a.includes('+') ? parseInt(a.split('+')[0]) + parseInt(a.split('+')[1])*0.1 : parseInt(a);
            const valB = b.includes('+') ? parseInt(b.split('+')[0]) + parseInt(b.split('+')[1])*0.1 : parseInt(b);
            return valA - valB;
        }).forEach(min => {
            const goalsArray = minutesMap[min];
            const count = goalsArray ? goalsArray.length : 0;
            const isRegular = !min.includes('+') && parseInt(min) > 0 && parseInt(min) <= 90;
            if (isRegular && count > 0) filledRegulares++;

            const box = document.createElement('div');
            box.className = `bingo-box ${count > 0 ? 'active' : ''}`;
            box.innerHTML = `
                <div>${min}'</div>
                <div class="count">${count > 0 ? count + ' gol(s)' : ''}</div>
            `;
            
            if (count > 0) {
                box.addEventListener('click', () => showBingoModal(min, goalsArray, data));
            }
            
            grid.appendChild(box);
        });

        const progress = Math.round((filledRegulares / totalRegulares) * 100);
        const pb = document.getElementById('bingo-progress-bar');
        pb.style.width = `${progress}%`;
        pb.textContent = `${progress}%`;
        
        const faltam = totalRegulares - filledRegulares;
        const statusText = document.getElementById('bingo-status-text');
        if (faltam === 0) {
            statusText.innerHTML = '<span class="text-success"><i class="fa-solid fa-check-circle me-1"></i> Bingo gabaritado!</span>';
        } else {
            statusText.textContent = `Faltam ${faltam} minutos (do tempo regulamentar) para gabaritar!`;
        }
    }

    function getMatchScoreAtMinute(matchId, targetMinuteStr, data) {
        const matchGoals = data.goals.filter(g => g.match_id === matchId);
        const parseMin = (m) => m.includes('+') ? parseInt(m.split('+')[0]) + parseInt(m.split('+')[1])*0.01 : parseInt(m);
        
        matchGoals.sort((a, b) => parseMin(a.minute) - parseMin(b.minute));
        
        let hScore = 0;
        let aScore = 0;
        const targetVal = parseMin(targetMinuteStr);
        
        for (let g of matchGoals) {
            if (parseMin(g.minute) <= targetVal) {
                if (g.is_home) hScore++;
                else aScore++;
            }
        }
        return { hScore, aScore };
    }

    function showBingoModal(min, goalsArray, data) {
        document.getElementById('bingo-modal-min').textContent = min + "'";
        const list = document.getElementById('bingo-modal-list');
        list.innerHTML = '';
        
        const matchesMap = {};
        data.matches.forEach(m => matchesMap[m.match_id] = m);
        const playersMap = {};
        data.players_info.forEach(p => playersMap[p.player_id] = p);
        
        goalsArray.forEach(g => {
            const match = matchesMap[g.match_id];
            if(!match) return;
            
            const scorer = playersMap[g.scorer_id];
            const scorerName = scorer ? formatPlayerName(scorer) : g.scorer_name;
            const currentScore = getMatchScoreAtMinute(g.match_id, min, data);
            const teamScored = g.is_home ? match.home : match.away;
            
            const item = document.createElement('div');
            item.className = 'list-group-item bg-transparent text-body p-3';
            item.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <strong class="text-success"><i class="fa-solid fa-futbol me-2"></i>${scorerName}</strong>
                    <span class="badge bg-secondary">${teamScored}</span>
                </div>
                <div class="small mb-1">
                    <strong>Placar no momento:</strong> ${match.home} ${currentScore.hScore} x ${currentScore.aScore} ${match.away}
                </div>
                <div class="small text-muted">
                    <strong>Placar Final:</strong> ${match.home} ${match.home_score} x ${match.away_score} ${match.away}
                </div>
                ${g.is_own_goal ? '<div class="small text-danger mt-1">Gol contra</div>' : ''}
            `;
            list.appendChild(item);
        });
        
        if(!bingoModalInst) {
            bingoModalInst = new bootstrap.Modal(document.getElementById('bingoModal'));
        }
        bingoModalInst.show();
    }

    // --- STATS LOGIC ---
    let playersModalInst = null;
    
    // Variáveis de estado para ordenação do modal
    let modalSortCol = null;
    let modalSortDir = null; // 'desc', 'asc', ou null
    let currentModalGroupItem = null;

    // Listeners para cabeçalhos do modal
    document.querySelectorAll('#modal-players-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-sort');
            if (modalSortCol === col) {
                if (modalSortDir === 'desc') {
                    modalSortDir = 'asc';
                } else if (modalSortDir === 'asc') {
                    modalSortDir = null;
                    modalSortCol = null;
                }
            } else {
                modalSortCol = col;
                modalSortDir = 'desc';
            }
            renderModalTable();
        });
    });
    
    function renderStats(data) {
        const filter = document.getElementById('stats-filter').value;
        const sortBy = document.getElementById('stats-sort').value;
        const groups = {};

        // Mapeia jogadores
        const playersMap = {};
        data.players_info.forEach(p => { playersMap[p.player_id] = p; });

        // Estrutura para stats POR JOGADOR
        const playerStats = {};
        Object.keys(playersMap).forEach(pid => {
            playerStats[pid] = {
                info: playersMap[pid],
                goals: 0,
                assists: 0,
                ratings: [],
                xg: 0,
                xa: 0
            };
        });

        data.goals.forEach(g => {
            if(!g.is_own_goal && playerStats[g.scorer_id]) {
                playerStats[g.scorer_id].goals++;
            }
            if(g.assist_id && playerStats[g.assist_id]) {
                playerStats[g.assist_id].assists++;
            }
        });

        data.player_match_stats.forEach(st => {
            if(playerStats[st.player_id]) {
                if(st.rating) playerStats[st.player_id].ratings.push(st.rating);
                if(st.xg) playerStats[st.player_id].xg += st.xg;
                if(st.xa) playerStats[st.player_id].xa += st.xa;
            }
        });

        // Agrupamento
        Object.values(playerStats).forEach(ps => {
            const p = ps.info;
            let key = getGroupKey(p, filter);
            if(!key) return;

            let imgUrl = null;
            if (filter === 'league') {
                imgUrl = p.club_league_id ? `https://img.sofascore.com/api/v1/unique-tournament/${p.club_league_id}/image` : null;
            } else if (filter === 'club') {
                imgUrl = p.club_id ? `https://img.sofascore.com/api/v1/team/${p.club_id}/image` : null;
            } else if (filter === 'country'){
                imgUrl = p.country.alpha2 ? `https://img.sofascore.com/api/v1/country/${p.country.alpha2}/flag` : null
            } // Para 'country', deixamos imgUrl como nulo para usar ícone genérico

            if(!groups[key]) {
                groups[key] = { name: key, img: imgUrl, goals: 0, assists: 0, xg: 0, xa: 0, ratings: [], playersCount: 0, players: [] };
            }
            groups[key].playersCount++;
            groups[key].goals += ps.goals;
            groups[key].assists += ps.assists;
            groups[key].xg += ps.xg;
            groups[key].xa += ps.xa;
            groups[key].ratings.push(...ps.ratings);
            
            ps.avgRating = ps.ratings.length > 0 ? ps.ratings.reduce((a,b)=>a+b,0)/ps.ratings.length : 0;
            groups[key].players.push(ps);
        });

        const list = Object.values(groups).map(g => {
            g.avgRating = g.ratings.length > 0 ? (g.ratings.reduce((a,b)=>a+b,0) / g.ratings.length) : 0;
            return g;
        });

        // Ordenação
        list.sort((a,b) => {
            if (sortBy === 'goals') return b.goals - a.goals || b.avgRating - a.avgRating;
            if (sortBy === 'assists') return b.assists - a.assists || b.avgRating - a.avgRating;
            if (sortBy === 'rating') return b.avgRating - a.avgRating || b.goals - a.goals;
            if (sortBy === 'xg') return b.xg - a.xg || b.avgRating - a.avgRating;
            if (sortBy === 'xa') return b.xa - a.xa || b.avgRating - a.avgRating;
            return 0;
        });

        // Render Table
        const tbody = document.querySelector('#stats-table tbody');
        tbody.innerHTML = '';
        list.forEach((item, index) => {
            const tr = document.createElement('tr');
            let imgHtml = item.img ? `<img src="${obterImagemSegura(item.img)}" class="me-2" style="width:24px; height:24px; object-fit:contain; background:#fff; border-radius:4px;" onerror="this.style.display='none'">` : '';
            if(filter === 'age' || filter === 'height') imgHtml = '';

            tr.innerHTML = `
                <td class="text-muted fw-bold">${index + 1}</td>
                <td class="fw-bold">${imgHtml}${item.name} <span class="badge bg-secondary ms-2" style="font-size:0.7em;">${item.playersCount} players</span></td>
                <td class="text-center text-success fw-bold">${item.goals}</td>
                <td class="text-center text-info fw-bold">${item.assists}</td>
                <td class="text-center text-secondary fw-bold">${item.xg.toFixed(2)}</td>
                <td class="text-center text-secondary fw-bold">${item.xa.toFixed(2)}</td>
                <td class="text-center text-warning fw-bold">${item.avgRating ? item.avgRating.toFixed(2) : '-'}</td>
            `;
            
            tr.addEventListener('click', () => {
                showPlayersModal(item);
            });
            
            tbody.appendChild(tr);
        });

        // Render Top 3 Cards
        const cardsContainer = document.getElementById('top-stats-cards');
        cardsContainer.innerHTML = '';
        list.slice(0, 3).forEach((item, index) => {
            let imgHtml = item.img ? `<img src="${obterImagemSegura(item.img)}" class="top-card-img me-3" onerror="this.style.display='none'">` : '<div class="top-card-img me-3 bg-secondary d-flex align-items-center justify-content-center"><i class="fa-solid fa-users text-dark"></i></div>';
            if(filter === 'age' || filter === 'height') imgHtml = '<div class="top-card-img me-3 bg-warning d-flex align-items-center justify-content-center"><i class="fa-solid fa-chart-simple text-dark"></i></div>';
            //if(filter === 'country') imgHtml = '<div class="top-card-img me-3 bg-success d-flex align-items-center justify-content-center"><i class="fa-solid fa-flag text-white"></i></div>';
            
            const medals = ['🥇', '🥈', '🥉'];
            cardsContainer.innerHTML += `
                <div class="col-md-4">
                    <div class="card bg-black border-secondary hover-card h-100 shadow" style="cursor:pointer;" onclick="document.querySelector('#stats-table tbody').children[${index}].click()">
                        <div class="card-body d-flex align-items-center">
                            ${imgHtml}
                            <div>
                                <h6 class="fw-bold mb-1">${medals[index]} ${item.name}</h6>
                                <div class="small text-muted mb-1">
                                    <span class="text-success"><i class="fa-solid fa-futbol me-1"></i>${item.goals}</span> | 
                                    <span class="text-info"><i class="fa-solid fa-handshake me-1"></i>${item.assists}</span> | 
                                    <span class="text-warning"><i class="fa-solid fa-star me-1"></i>${item.avgRating ? item.avgRating.toFixed(1) : '-'}</span>
                                </div>
                                <div class="small text-muted" style="font-size:0.75em;">
                                    <span title="Gols Esperados (xG)">xG: ${item.xg.toFixed(2)}</span> • 
                                    <span title="Assistências Esperadas (xAst)">xAst: ${item.xa.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    function showPlayersModal(groupItem) {
        currentModalGroupItem = groupItem;
        modalSortCol = null; // Reseta a ordenação sempre que abre um novo
        modalSortDir = null;
        
        document.getElementById('playersModalLabel').textContent = `Jogadores: ${groupItem.name}`;
        renderModalTable();

        if(!playersModalInst) {
            playersModalInst = new bootstrap.Modal(document.getElementById('playersModal'));
        }
        playersModalInst.show();
    }

    function renderModalTable() {
        const tbody = document.querySelector('#modal-players-table tbody');
        tbody.innerHTML = '';
        
        // Atualiza os ícones do cabeçalho
        document.querySelectorAll('#modal-players-table th[data-sort]').forEach(th => {
            const icon = th.querySelector('.sort-icon');
            icon.innerHTML = '';
            if (th.getAttribute('data-sort') === modalSortCol) {
                icon.innerHTML = modalSortDir === 'desc' ? '<i class="fa-solid fa-sort-down"></i>' : '<i class="fa-solid fa-sort-up"></i>';
            }
        });

        let players = [...currentModalGroupItem.players];
        
        if (modalSortCol && modalSortDir) {
            players.sort((a,b) => {
                let valA = a[modalSortCol];
                let valB = b[modalSortCol];
                
                // Tratar a chave especial para nota
                if (modalSortCol === 'rating') {
                    valA = a.avgRating;
                    valB = b.avgRating;
                }
                
                if (modalSortDir === 'desc') {
                    return valB - valA;
                } else {
                    return valA - valB;
                }
            });
        } else {
            // Ordenação padrão do combo box original caso não haja clique no modal
            const sortBy = document.getElementById('stats-sort').value;
            players.sort((a,b) => {
                if (sortBy === 'goals') return b.goals - a.goals || b.avgRating - a.avgRating;
                if (sortBy === 'assists') return b.assists - a.assists || b.avgRating - a.avgRating;
                if (sortBy === 'rating') return b.avgRating - a.avgRating || b.goals - a.goals;
                if (sortBy === 'xg') return b.xg - a.xg || b.avgRating - a.avgRating;
                if (sortBy === 'xa') return b.xa - a.xa || b.avgRating - a.avgRating;
                return 0;
            });
        }

        players.forEach(ps => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="fw-bold d-flex align-items-center">
                    <img src="${obterImagemSegura(`https://img.sofascore.com/api/v1/player/${ps.info.player_id}/image`)}" class="me-2" style="width:30px; height:30px; border-radius:50%; object-fit:cover; background:#fff;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' fill=\\'none\\' viewBox=\\'0 0 24 24\\' stroke=\\'%23666\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'2\\' d=\\'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z\\'/></svg>'">
                    ${formatPlayerName(ps.info)}
                </td>
                <td class="text-center text-success">${ps.goals}</td>
                <td class="text-center text-info">${ps.assists}</td>
                <td class="text-center text-secondary">${ps.xg.toFixed(2)}</td>
                <td class="text-center text-secondary">${ps.xa.toFixed(2)}</td>
                <td class="text-center text-warning fw-bold">${ps.avgRating ? ps.avgRating.toFixed(2) : '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function getGroupKey(p, filter) {
        if (filter === 'country') return p.country.name || 'Sem Seleção';
        if (filter === 'league') return p.club_league || 'Sem Liga';
        if (filter === 'club') return p.club || 'Sem Clube';
        if (filter === 'age') {
            if(!p.age) return 'Desconhecido';
            if(p.age <= 21) return 'Até 21 anos';
            if(p.age <= 25) return '22 a 25 anos';
            if(p.age <= 29) return '26 a 29 anos';
            if(p.age <= 33) return '30 a 33 anos';
            return '34+ anos';
        }
        if (filter === 'height') {
            if(!p.height) return 'Desconhecido';
            if(p.height < 170) return '< 1.70m';
            if(p.height < 180) return '1.70m - 1.79m';
            if(p.height < 190) return '1.80m - 1.89m';
            return '1.90m+';
        }
        return null;
    }

    // --- RANKING LOGIC ---
    function renderRanking(data) {
        const playersMap = {};
        data.players_info.forEach(p => { playersMap[p.player_id] = p; });

        const pStats = {};
        Object.keys(playersMap).forEach(pid => {
            pStats[pid] = {
                id: pid,
                info: playersMap[pid],
                goals: 0,
                assists: 0,
                xg: 0,
                xa: 0,
                ratings: []
            };
        });

        data.goals.forEach(g => {
            if(!g.is_own_goal && pStats[g.scorer_id]) pStats[g.scorer_id].goals++;
            if(g.assist_id && pStats[g.assist_id]) pStats[g.assist_id].assists++;
        });

        data.player_match_stats.forEach(st => {
            if(pStats[st.player_id]) {
                if(st.rating) pStats[st.player_id].ratings.push(st.rating);
                if(st.xg) pStats[st.player_id].xg += st.xg;
                if(st.xa) pStats[st.player_id].xa += st.xa;
            }
        });

        const playerList = Object.values(pStats).map(ps => {
            ps.avgRating = ps.ratings.length > 0 ? ps.ratings.reduce((a,b)=>a+b,0)/ps.ratings.length : 0;
            return ps;
        });
        
        // 1. Pontos Gerados (MVP) Ranking
        const pointsMap = {};
        data.player_points.forEach(pp => {
            pointsMap[pp.player_id] = pp.points;
        });

        const mvpList = [...playerList].filter(ps => pointsMap[ps.id] > 0);
        mvpList.sort((a,b) => {
            const ptA = pointsMap[a.id] || 0;
            const ptB = pointsMap[b.id] || 0;
            if (ptB !== ptA) return ptB - ptA;
            return b.avgRating - a.avgRating;
        });
        
        const mvpGrid = document.getElementById('ranking-grid');
        mvpGrid.innerHTML = '';
        if(mvpList.length === 0) {
            mvpGrid.innerHTML = '<div class="col-12 text-center text-muted">Nenhum jogador pontuou ainda.</div>';
        } else {
            mvpList.slice(0, 50).forEach((ps, index) => {
                const pts = pointsMap[ps.id];
                mvpGrid.innerHTML += generateCardHtml(ps, index, `${pts} pts`, `<i class="fa-solid fa-star text-warning" style="font-size:0.9em;"></i> ${ps.avgRating.toFixed(2)}`);
            });
        }

        // 2. Goals Ranking
        const golsList = [...playerList].filter(ps => ps.goals > 0).sort((a,b) => b.goals - a.goals || b.avgRating - a.avgRating);
        document.getElementById('ranking-gols-grid').innerHTML = golsList.slice(0, 50).map((ps, i) => generateCardHtml(ps, i, `${ps.goals} Gols`)).join('');

        // 3. Assists Ranking
        const astList = [...playerList].filter(ps => ps.assists > 0).sort((a,b) => b.assists - a.assists || b.avgRating - a.avgRating);
        document.getElementById('ranking-assists-grid').innerHTML = astList.slice(0, 50).map((ps, i) => generateCardHtml(ps, i, `${ps.assists} Assists`)).join('');

        // 4. xG Ranking
        const xgList = [...playerList].filter(ps => ps.xg > 0).sort((a,b) => b.xg - a.xg || b.avgRating - a.avgRating);
        document.getElementById('ranking-xg-grid').innerHTML = xgList.slice(0, 50).map((ps, i) => generateCardHtml(ps, i, `${ps.xg.toFixed(2)} xG`)).join('');

        // 5. xAst Ranking
        const xaList = [...playerList].filter(ps => ps.xa > 0).sort((a,b) => b.xa - a.xa || b.avgRating - a.avgRating);
        document.getElementById('ranking-xa-grid').innerHTML = xaList.slice(0, 50).map((ps, i) => generateCardHtml(ps, i, `${ps.xa.toFixed(2)} xAst`)).join('');
    }

    function generateCardHtml(ps, index, mainStat, subTextHtml = '') {
        const info = ps.info;
        const imgUrl = `https://img.sofascore.com/api/v1/player/${ps.id}/image`;
        const pos = index + 1;
        
        let posBadge = `<span class="badge bg-secondary ms-auto">#${pos}</span>`;
        if(pos === 1) posBadge = `<span class="badge bg-warning text-dark ms-auto"><i class="fa-solid fa-crown me-1"></i>#1</span>`;
        else if(pos === 2) posBadge = `<span class="badge bg-light text-dark ms-auto">#2</span>`;
        else if(pos === 3) posBadge = `<span class="badge" style="background-color:#cd7f32;">#3</span>`;

        return `
            <div class="col-lg-4 col-md-6">
                <div class="card bg-black border-secondary hover-card h-100 shadow-sm p-3">
                    <div class="d-flex align-items-center">
                        <img src="${obterImagemSegura(imgUrl)}" alt="${info.name || 'Desconhecido'}" class="img-thumbnail-circle me-3" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' fill=\\'none\\' viewBox=\\'0 0 24 24\\' stroke=\\'%23666\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'2\\' d=\\'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z\\'/></svg>'">
                        <div class="flex-grow-1">
                            <h6 class="fw-bold mb-1">${formatPlayerName(info)}</h6>
                            <div class="small text-muted mb-1">${info.club_country || 'Seleção'} • ${info.club || '-'}</div>
                            <div class="text-warning fw-bold"><i class="fa-solid fa-bolt me-1"></i>${mainStat}</div>
                            ${subTextHtml ? `<div class="small mt-1">${subTextHtml}</div>` : ''}
                        </div>
                        ${posBadge}
                    </div>
                </div>
            </div>
        `;
    }
});