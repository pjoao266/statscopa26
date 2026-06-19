document.addEventListener('DOMContentLoaded', () => {
    let appData = null;

    const badge = document.getElementById('loading-badge');
    const btnRefresh = document.getElementById('btn-refresh');
    const themeToggle = document.getElementById('theme-toggle');

    // ==========================================
    // 1. TEMA E UTILITÁRIOS GERAIS
    // ==========================================
    let isDark = true;
    themeToggle.addEventListener('click', () => {
        isDark = !isDark;
        document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
        themeToggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    });

    function isoParaEmojiBandeira(codigoIso) {
        if (!codigoIso || codigoIso.length !== 2) return '';
        const codigoMaiusculo = codigoIso.toUpperCase();
        return String.fromCodePoint(
            codigoMaiusculo.codePointAt(0) + 127397,
            codigoMaiusculo.codePointAt(1) + 127397
        );
    }

    function formatPlayerName(info) {
        if (!info) return 'Desconhecido';
        const name = info.name || 'Desconhecido';
        const alpha2 = info.country?.alpha2 || '';

        if (!alpha2 || alpha2.toLowerCase() === 'seleção') {
            return name;
        }

        let flagHtml = '';
        if (alpha2.toUpperCase() === 'EN') {
            flagHtml = `<img src="https://flagcdn.com/16x12/gb-eng.png" class="ms-1 shadow-sm" style="width: 14px; height: 10px; vertical-align: middle; margin-top: -2px;">`;
        } else {
            const emoji = isoParaEmojiBandeira(alpha2);
            flagHtml = `<span class="flag-emoji ms-1" style="font-size: 1.1em;">${emoji}</span>`;
        }

        return `${name} ${flagHtml}`.trim();
    }

    function obterImagemSegura(urlSofascore) {
        return urlSofascore;
    }

    // ==========================================
    // 2. INICIALIZAÇÃO E FETCH DOS DADOS
    // ==========================================
    fetchData();

    btnRefresh.addEventListener('click', async () => {
        btnRefresh.disabled = true;
        badge.style.display = 'inline-block';
        badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Sincronizando...';
        
        try {
            const urlVercel = 'https://statscopa26.vercel.app/api/sync';
            const res = await fetch(urlVercel, { method: 'POST' });
            if(res.ok) badge.innerHTML = '🤖 Robô acionado! Atualize a página em 1 min.';
            else badge.innerHTML = '❌ Erro ao acionar o robô';
        } catch (e) {
            badge.innerHTML = '❌ Erro de conexão';
        } finally {
            btnRefresh.disabled = false;
        }
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
                setTimeout(fetchData, 5000); 
            }
        } catch (e) {
            console.error("Erro ao buscar dados", e);
            setTimeout(fetchData, 5000);
        }
    }

    function renderAll() {
        renderBingo(appData);
        populateCountries(appData);
        renderStats(appData);
        renderRanking(appData);
        initBest11Filters(appData); // Inicializa filtros e renderiza o campo
    }

    // ==========================================
    // 3. LÓGICA DO BINGO DOS MINUTOS
    // ==========================================
    let bingoModalInst = null;
    
// ==========================================
// 3. LÓGICA DO BINGO DOS MINUTOS (ATUALIZADA)
// ==========================================
    function renderBingo(data) {
        const grid = document.getElementById('bingo-grid');
        grid.innerHTML = '';
        
        const firstHalfMap = {};
        const secondHalfMap = {};

        // 1º Tempo: do 0 ao 45 e acréscimos
        for(let i=0; i<=45; i++) firstHalfMap[i.toString()] = [];
        for(let i=1; i<=10; i++) firstHalfMap[`45+${i}`] = [];
        
        // 2º Tempo: do 46 ao 90 e acréscimos
        for(let i=46; i<=90; i++) secondHalfMap[i.toString()] = [];
        for(let i=1; i<=10; i++) secondHalfMap[`90+${i}`] = [];

        data.goals.forEach(g => {
            const m = g.minute;
            if(firstHalfMap[m] !== undefined) firstHalfMap[m].push(g);
            else if(secondHalfMap[m] !== undefined) secondHalfMap[m].push(g);
        });

        const totalRegulares = 91; // Agora conta do 0 ao 90 (91 minutos totais)
        let filledRegulares = 0;

        const renderHalf = (map, title) => {
            // Criar o Título de Separação Visual
            const sectionTitle = document.createElement('h5');
            sectionTitle.className = "bingo-section-title";
            sectionTitle.innerHTML = title;
            grid.appendChild(sectionTitle);

            // Lógica de Ordenação Segura
            const keys = Object.keys(map).sort((a, b) => {
                const baseA = parseInt(a);
                const baseB = parseInt(b);
                if (baseA !== baseB) return baseA - baseB;
                
                const isPlusA = a.includes('+');
                const isPlusB = b.includes('+');
                if (!isPlusA && isPlusB) return -1;
                if (isPlusA && !isPlusB) return 1;
                
                const extraA = isPlusA ? parseInt(a.split('+')[1]) : 0;
                const extraB = isPlusB ? parseInt(b.split('+')[1]) : 0;
                return extraA - extraB;
            });

            keys.forEach(min => {
                const goalsArray = map[min];
                const count = goalsArray.length;
                const isRegular = !min.includes('+') && parseInt(min) >= 0 && parseInt(min) <= 90;
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
        };

        // Renderiza primeiro o 1º tempo, depois o 2º tempo (isso já impede o 46 de se misturar)
        renderHalf(firstHalfMap, '');
        renderHalf(secondHalfMap, '');

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

    // ==========================================
    // 4. ESTATÍSTICAS (AGRUPAMENTOS)
    // ==========================================
    let playersModalInst = null;
    let modalSortCol = null;
    let modalSortDir = null;
    let currentModalGroupItem = null;

    document.getElementById('stats-filter')?.addEventListener('change', () => { if(appData) renderStats(appData); });
    document.getElementById('stats-sort')?.addEventListener('change', () => { if(appData) renderStats(appData); });

    document.querySelectorAll('#modal-players-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-sort');
            if (modalSortCol === col) {
                if (modalSortDir === 'desc') modalSortDir = 'asc';
                else if (modalSortDir === 'asc') { modalSortDir = null; modalSortCol = null; }
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

        const playersMap = {};
        data.players_info.forEach(p => { playersMap[p.player_id] = p; });

        const playerStats = {};
        Object.keys(playersMap).forEach(pid => {
            playerStats[pid] = { info: playersMap[pid], goals: 0, assists: 0, ratings: [], xg: 0, xa: 0 };
        });

        data.goals.forEach(g => {
            if(!g.is_own_goal && playerStats[g.scorer_id]) playerStats[g.scorer_id].goals++;
            if(g.assist_id && playerStats[g.assist_id]) playerStats[g.assist_id].assists++;
        });

        data.player_match_stats.forEach(st => {
            if(playerStats[st.player_id]) {
                if(st.rating) playerStats[st.player_id].ratings.push(st.rating);
                if(st.xg) playerStats[st.player_id].xg += st.xg;
                if(st.xa) playerStats[st.player_id].xa += st.xa;
            }
        });

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
                imgUrl = p.country.alpha2 ? `https://img.sofascore.com/api/v1/country/${p.country.alpha2}/flag` : null;
            }

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

        list.sort((a,b) => {
            if (sortBy === 'goals') return b.goals - a.goals || b.avgRating - a.avgRating;
            if (sortBy === 'assists') return b.assists - a.assists || b.avgRating - a.avgRating;
            if (sortBy === 'rating') return b.avgRating - a.avgRating || b.goals - a.goals;
            if (sortBy === 'xg') return b.xg - a.xg || b.avgRating - a.avgRating;
            if (sortBy === 'xa') return b.xa - a.xa || b.avgRating - a.avgRating;
            return 0;
        });

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
            tr.addEventListener('click', () => showPlayersModal(item));
            tbody.appendChild(tr);
        });

        const cardsContainer = document.getElementById('top-stats-cards');
        cardsContainer.innerHTML = '';
        list.slice(0, 3).forEach((item, index) => {
            let imgHtml = item.img ? `<img src="${obterImagemSegura(item.img)}" class="top-card-img me-3" onerror="this.style.display='none'">` : '<div class="top-card-img me-3 bg-secondary d-flex align-items-center justify-content-center"><i class="fa-solid fa-users text-dark"></i></div>';
            if(filter === 'age' || filter === 'height') imgHtml = '<div class="top-card-img me-3 bg-warning d-flex align-items-center justify-content-center"><i class="fa-solid fa-chart-simple text-dark"></i></div>';
            
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
        modalSortCol = null;
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
                if (modalSortCol === 'rating') {
                    valA = a.avgRating;
                    valB = b.avgRating;
                }
                return modalSortDir === 'desc' ? valB - valA : valA - valB;
            });
        } else {
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

    // ==========================================
    // 5. RANKING GERAL E FILTROS DE PAÍS
    // ==========================================
    let countriesPopulated = false;
    function populateCountries(data) {
        if (countriesPopulated) return;
        const countryFilter = document.getElementById('ranking-countries-filter');
        if (!countryFilter) return;

        const countries = new Set();
        data.players_info.forEach(p => { if (p.country.name) countries.add(p.country.name); });

        Array.from(countries).sort().forEach(country => {
            const option = document.createElement('option');
            option.value = country; 
            option.textContent = country;
            countryFilter.appendChild(option);
        });
        countriesPopulated = true;
    }

    const countryFilterEl = document.getElementById('ranking-countries-filter');
    if (countryFilterEl) {
        countryFilterEl.addEventListener('change', () => { if (appData) renderRanking(appData); });
    }

    const searchInputEl = document.getElementById('ranking-search');
    if (searchInputEl) {
        searchInputEl.addEventListener('input', () => { if (appData) renderRanking(appData); });
    }

    function renderRanking(data) {
        const selectedCountry = document.getElementById('ranking-countries-filter')?.value || '';
        const searchQuery = document.getElementById('ranking-search')?.value.trim().toLowerCase() || '';

        const playersMap = {};
        data.players_info.forEach(p => { playersMap[p.player_id] = p; });

        const pStats = {};
        Object.keys(playersMap).forEach(pid => {
            pStats[pid] = { id: pid, info: playersMap[pid], goals: 0, assists: 0, xg: 0, xa: 0, ratings: [] };
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

        let playerList = Object.values(pStats).map(ps => {
            ps.avgRating = ps.ratings.length > 0 ? ps.ratings.reduce((a,b)=>a+b,0)/ps.ratings.length : 0;
            return ps;
        });

        if (selectedCountry && selectedCountry !== 'Todos') {
            playerList = playerList.filter(ps => (ps.info.country?.name || '') === selectedCountry);
        }

        if (searchQuery) {
            playerList = playerList.filter(ps => {
                const playerName = (ps.info.name || '').toLowerCase();
                return playerName.includes(searchQuery);
            });
        }
        
        const renderGrid = (gridId, list, mapFunction) => {
            const grid = document.getElementById(gridId);
            if (list.length === 0) {
                grid.innerHTML = `
                    <div class="col-12 text-center py-5">
                        <i class="fa-solid fa-user-slash mb-3 text-secondary" style="font-size: 3rem; opacity: 0.5;"></i>
                        <h5 class="text-muted fw-bold">Nenhum jogador encontrado</h5>
                        <p class="text-secondary small">Tente ajustar os filtros ou a pesquisa.</p>
                    </div>
                `;
            } else {
                grid.innerHTML = list.slice(0, 50).map(mapFunction).join('');
            }
        };

        const pointsMap = {};
        data.player_points.forEach(pp => { pointsMap[pp.player_id] = pp.points; });

        const mvpList = [...playerList].filter(ps => pointsMap[ps.id] > 0);
        mvpList.sort((a,b) => {
            const ptA = pointsMap[a.id] || 0;
            const ptB = pointsMap[b.id] || 0;
            if (ptB !== ptA) return ptB - ptA;
            return b.avgRating - a.avgRating;
        });
        
        renderGrid('ranking-grid', mvpList, (ps, i) => {
            const pts = pointsMap[ps.id];
            return generateCardHtml(ps, i, `${pts} pts`, `<i class="fa-solid fa-star text-warning" style="font-size:0.9em;"></i> ${ps.avgRating.toFixed(2)}`);
        });

        const golsList = [...playerList].filter(ps => ps.goals > 0).sort((a,b) => b.goals - a.goals || b.avgRating - a.avgRating);
        renderGrid('ranking-gols-grid', golsList, (ps, i) => generateCardHtml(ps, i, `${ps.goals} Gols`));

        const astList = [...playerList].filter(ps => ps.assists > 0).sort((a,b) => b.assists - a.assists || b.avgRating - a.avgRating);
        renderGrid('ranking-assists-grid', astList, (ps, i) => generateCardHtml(ps, i, `${ps.assists} Assists`));

        const xgList = [...playerList].filter(ps => ps.xg > 0).sort((a,b) => b.xg - a.xg || b.avgRating - a.avgRating);
        renderGrid('ranking-xg-grid', xgList, (ps, i) => generateCardHtml(ps, i, `${ps.xg.toFixed(2)} xG`));

        const xaList = [...playerList].filter(ps => ps.xa > 0).sort((a,b) => b.xa - a.xa || b.avgRating - a.avgRating);
        renderGrid('ranking-xa-grid', xaList, (ps, i) => generateCardHtml(ps, i, `${ps.xa.toFixed(2)} xAst`));
        
        const ratingList = [...playerList].filter(ps => ps.avgRating > 0).sort((a,b) => b.avgRating - a.avgRating);
        renderGrid('ranking-rating-grid', ratingList, (ps, i) => generateCardHtml(ps, i, `${ps.avgRating.toFixed(2)}`));
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

    // ==========================================
    // 6. SELEÇÃO IDEAL (CAMPO / BEST 11)
    // ==========================================
    const elStage = document.getElementById('select-round-stage');
    const elRound = document.getElementById('select-round-name');
    const elMatch = document.getElementById('select-match');
    const elFormation = document.getElementById('select-formation');

    function initBest11Filters(data) {
        if(!elStage) return;

        const stages = [...new Set(data.matches.map(m => m.roundStage).filter(Boolean))];
        
        elStage.innerHTML = '<option value="all">Todas as Fases</option>';
        stages.forEach(stage => {
            elStage.innerHTML += `<option value="${stage}">${stage}</option>`;
        });

        elStage.addEventListener('change', () => {
            updateRoundDropdown(data);
            updateMatchDropdown(data);
            renderBest11(data);
        });

        elRound.addEventListener('change', () => {
            updateMatchDropdown(data);
            renderBest11(data);
        });

        elMatch.addEventListener('change', () => renderBest11(data));
        elFormation.addEventListener('change', () => renderBest11(data));
        
        updateRoundDropdown(data);
        updateMatchDropdown(data);
        renderBest11(data);
    }

    function updateRoundDropdown(data) {
        const stageFilter = elStage.value;
        let validMatches = data.matches.filter(m => m.status === 'Ended');
        
        if (stageFilter !== 'all') {
            validMatches = validMatches.filter(m => m.roundStage === stageFilter);
        }

        const rounds = [...new Set(validMatches.map(m => m.round).filter(Boolean))];
        elRound.innerHTML = '<option value="all">Todas as Rodadas</option>';
        rounds.forEach(r => {
            elRound.innerHTML += `<option value="${r}">${r}</option>`;
        });
    }

    function updateMatchDropdown(data) {
        const stageFilter = elStage.value;
        const roundFilter = elRound.value;
        let validMatches = data.matches.filter(m => m.status === 'Ended');

        if (stageFilter !== 'all') validMatches = validMatches.filter(m => m.roundStage === stageFilter);
        if (roundFilter !== 'all') validMatches = validMatches.filter(m => String(m.round) === String(roundFilter));

        elMatch.innerHTML = '<option value="all">Todos os Jogos</option>';
        validMatches.forEach(m => {
            elMatch.innerHTML += `<option value="${m.match_id}">${m.home} x ${m.away}</option>`;
        });
    }

    const formationTemplates = {
        '4-3-3': [
            { role: 'GL', x: 50, y: 92 }, { role: 'LD', x: 85, y: 70 },
            { role: 'ZAG', x: 65, y: 80 }, { role: 'ZAG', x: 35, y: 80 },
            { role: 'LE', x: 15, y: 70 }, { role: 'VOL', x: 50, y: 55 },
            { role: 'MC', x: 70, y: 40 }, { role: 'MC', x: 30, y: 40 }, 
            { role: 'PD', x: 80, y: 15 }, { role: 'CA', x: 50, y: 10 },
            { role: 'PE', x: 20, y: 15 }
        ],
        '4-4-2': [
            { role: 'GL', x: 50, y: 92 }, { role: 'LD', x: 85, y: 75 },
            { role: 'ZAG', x: 65, y: 80 }, { role: 'ZAG', x: 35, y: 80 },
            { role: 'LE', x: 15, y: 75 }, { role: 'MD', x: 85, y: 45 },
            { role: 'MC', x: 60, y: 50 }, { role: 'MC', x: 40, y: 50 },
            { role: 'ME', x: 15, y: 45 }, { role: 'CA', x: 60, y: 15 },
            { role: 'CA', x: 40, y: 15 }
        ],
        '3-5-2': [
            { role: 'GL', x: 50, y: 92 }, { role: 'ZAG', x: 75, y: 80 },
            { role: 'ZAG', x: 50, y: 82 }, { role: 'ZAG', x: 25, y: 80 },
            { role: 'MD', x: 90, y: 50 }, { role: 'VOL', x: 50, y: 60 },
            { role: 'MC', x: 65, y: 40 }, { role: 'MC', x: 35, y: 40 },
            { role: 'ME', x: 10, y: 50 }, { role: 'CA', x: 60, y: 15 },
            { role: 'CA', x: 40, y: 15 }
        ]
    };

    const positionFallbacks = {
        'GL': ['GL'], 'LD': ['LD'], 'LE': ['LE'],
        'ZAG': ['ZAG'], 'VOL': ['VOL', 'MC'], 'MC': ['MC', 'VOL', 'MEI', 'MD', 'ME'],
        'MEI': ['MEI', 'MC', 'PE', 'PD', 'ME', 'MD'], 'MD': ['MD', 'PD', 'ME', 'PE'], 'ME': ['ME', 'PE', 'MD', 'PD'],
        'PD': ['PD', 'CA', 'MD', 'PE', 'ME'], 'PE': ['PE', 'CA', 'ME', 'MD', 'PE'], 'CA': ['CA', 'PE', 'PD', 'ME', 'MD']
    };

    function renderBest11(data) {
        if (!data || !data.player_match_stats) return;

        const stageFilter = elStage.value;
        const roundFilter = elRound.value;
        const matchFilter = elMatch.value;
        const formationKey = elFormation.value;
        const pitch = document.getElementById('pitch-players');
        
        if(!pitch) return;
        pitch.innerHTML = ''; 

        // Descobrir quais matches são permitidos baseado nos filtros
        let allowedMatchesIds = data.matches.filter(m => m.status === 'Ended');
        if (stageFilter !== 'all') allowedMatchesIds = allowedMatchesIds.filter(m => m.roundStage === stageFilter);
        if (roundFilter !== 'all') allowedMatchesIds = allowedMatchesIds.filter(m => String(m.round) === String(roundFilter));
        if (matchFilter !== 'all') allowedMatchesIds = allowedMatchesIds.filter(m => String(m.match_id) === String(matchFilter));
        
        const validMatchIds = allowedMatchesIds.map(m => m.match_id);

        // Extrai atuações isoladas de cada partida que passou no filtro
        let rawFiltered = [...data.player_match_stats].filter(p => p.rating != null && validMatchIds.includes(p.match_id));
        
        // Agrupar por jogador para tirar a MÉDIA e descobrir a posição mais jogada neste recorte
        const playerAgg = {};
        rawFiltered.forEach(p => {
            if (!playerAgg[p.player_id]) {
                playerAgg[p.player_id] = {
                    player_id: p.player_id,
                    player_name: p.player_name,
                    ratings: [],
                    positions: {}
                };
            }
            playerAgg[p.player_id].ratings.push(p.rating);
            
            const pos = p.detailed_position;
            if (pos) {
                playerAgg[p.player_id].positions[pos] = (playerAgg[p.player_id].positions[pos] || 0) + 1;
            }
        });

        // Constrói a lista final onde cada jogador tem apenas UMA nota (a média)
        let filteredPlayers = [];
        for (const pid in playerAgg) {
            const agg = playerAgg[pid];
            // Média real do jogador nos jogos filtrados
            const avgRating = agg.ratings.reduce((a,b) => a+b, 0) / agg.ratings.length;
            
            // Qual posição ele jogou mais vezes neste recorte?
            let bestPos = null;
            let maxCount = 0;
            for (const pos in agg.positions) {
                if (agg.positions[pos] > maxCount) {
                    maxCount = agg.positions[pos];
                    bestPos = pos;
                }
            }

            filteredPlayers.push({
                player_id: pid,
                player_name: agg.player_name,
                rating: avgRating,
                detailed_position: bestPos
            });
        }

        // Ordenar os jogadores pela MÉDIA da nota, da maior para a menor
        filteredPlayers.sort((a, b) => b.rating - a.rating);

        const template = formationTemplates[formationKey];
        if (!template) return;

        const playersMap = {};
        data.players_info.forEach(p => { playersMap[p.player_id] = p; });

        const selectedPlayersIds = new Set();
        const best11 = [];

        for (const slot of template) {
            const requiredRole = slot.role;
            const acceptedRoles = positionFallbacks[requiredRole] || [requiredRole];
            
            // Procura o jogador com melhor MÉDIA que se encaixa na vaga
            const bestPlayerForSlot = filteredPlayers.find(p => 
                acceptedRoles.includes(p.detailed_position) && !selectedPlayersIds.has(p.player_id)
            );

            if (bestPlayerForSlot) {
                selectedPlayersIds.add(bestPlayerForSlot.player_id);
                best11.push({ player: bestPlayerForSlot, slot: slot });
            }
        }

        // Renderiza no Campo
        best11.forEach(item => {
            const p = item.player;
            const s = item.slot;
            const info = playersMap[p.player_id] || {};
            
            const imgUrl = `https://img.sofascore.com/api/v1/player/${p.player_id}/image`;
            const nameWithFlag = formatPlayerName(info);
            const shortName = (info.name || p.player_name || 'Desconhecido').split(' ').slice(-1)[0]; 

            const marker = document.createElement('div');
            marker.className = 'player-marker';
            marker.style.left = `${s.x}%`;
            marker.style.top = `${s.y}%`;

            marker.innerHTML = `
                <div class="position-badge">${p.detailed_position}</div>
                <img src="${obterImagemSegura(imgUrl)}" class="player-photo" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' fill=\\'none\\' viewBox=\\'0 0 24 24\\' stroke=\\'%23666\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'2\\' d=\\'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z\\'/></svg>'">
                <div class="player-info">
                    <span class="short-name">${shortName}</span>
                    <span class="full-name" style="display: none;">${nameWithFlag}</span>
                </div>
                <div class="player-rating">${p.rating.toFixed(2)}</div>
            `;
            
            pitch.appendChild(marker);
        });
    }

}); // Fim do DOMContentLoaded