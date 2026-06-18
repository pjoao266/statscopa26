import json
import csv
import datetime
import concurrent.futures
import os
from curl_cffi import requests

HEADERS = {"x-requested-with": "4d5955"}
DADOS_DIR = "dados"

def calculate_age(timestamp):
    if not timestamp:
        return None
    dob = datetime.datetime.fromtimestamp(timestamp)
    today = datetime.datetime.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

def format_minute(time, added_time):
    if added_time:
        return f"{time}+{added_time}"
    return str(time)

def get_matches(tournament_id, season_id):
    page = 0
    valid_matches = []
    
    print("Buscando jogos...")
    while True:
        url = f"https://api.sofascore.com/api/v1/unique-tournament/{tournament_id}/season/{season_id}/events/last/{page}"
        resp = requests.get(url, impersonate="chrome", headers=HEADERS)
        if resp.status_code != 200:
            break
            
        data = resp.json()
        for ev in data.get('events', []):
            status_desc = ev.get('status', {}).get('description')
            if status_desc != 'Not started':
                valid_matches.append({
                    'match_id': ev.get('id'),
                    'home': ev.get('homeTeam', {}).get('name'),
                    'away': ev.get('awayTeam', {}).get('name'),
                    'home_score': ev.get('homeScore', {}).get('current', 0),
                    'away_score': ev.get('awayScore', {}).get('current', 0),
                    'status': status_desc
                })
        
        if not data.get('hasNextPage', False):
            break
        page += 1
        
    return valid_matches

def fetch_player_info(player_id, session=None):
    req_obj = session if session else requests
    url = f"https://api.sofascore.com/api/v1/player/{player_id}"
    resp = req_obj.get(url, impersonate="chrome", headers=HEADERS)
    if resp.status_code == 200:
        p = resp.json().get('player', {})
        team = p.get('team', {})
        
        league = None
        if team.get('primaryUniqueTournament'):
            league = team['primaryUniqueTournament'].get('name')
        elif team.get('tournament') and team['tournament'].get('uniqueTournament'):
            league = team['tournament']['uniqueTournament'].get('name')
            
        return {
            'player_id': str(player_id),
            'name': p.get('name'),
            'age': calculate_age(p.get('dateOfBirthTimestamp')),
            'height': p.get('height'),
            'weight': p.get('weight'),
            'club': team.get('name'),
            'club_country': team.get('country', {}).get('name'),
            'club_league': league
        }
    return None

def process_match(match, players_cache):
    match_id = match['match_id']
    match_goals = []
    player_match_stats = {}
    
    # 1. Obter SHOTMAP primeiro para cruzar com INCIDENTS
    url_shotmap = f"https://api.sofascore.com/api/v1/event/{match_id}/shotmap"
    resp_shots = requests.get(url_shotmap, impersonate="chrome", headers=HEADERS)
    shots_data = resp_shots.json().get('shotmap', []) if resp_shots.status_code == 200 else []
    
    # Pre-processar shotmap
    shots_by_time_player = {}
    for shot in shots_data:
        p_id = shot.get('player', {}).get('id')
        if p_id:
            if p_id not in player_match_stats:
                player_match_stats[p_id] = {'match_id': match_id, 'player_id': p_id, 'player_name': shot.get('player', {}).get('name'), 'xg': 0.0, 'xa': 0.0}
            if 'xg' in shot:
                player_match_stats[p_id]['xg'] += shot['xg']
            
            if shot.get('shotType') == 'goal':
                time = shot.get('time')
                shots_by_time_player[f"{time}_{p_id}"] = shot

    # 2. INCIDENTS (Gols e Minutos exatos)
    url_incidents = f"https://api.sofascore.com/api/v1/event/{match_id}/incidents"
    resp_inc = requests.get(url_incidents, impersonate="chrome", headers=HEADERS)
    incidents_data = resp_inc.json().get('incidents', []) if resp_inc.status_code == 200 else []
    
    goal_incidents = [inc for inc in incidents_data if inc.get('incidentType') == 'goal']
    goal_incidents.sort(key=lambda x: x.get('time', 0))

    home_score_tracked = 0
    away_score_tracked = 0
    
    home_goals_list = []
    away_goals_list = []

    for inc in goal_incidents:
        time = inc.get('time')
        added = inc.get('addedTime')
        minute_str = format_minute(time, added)
        
        jogador_gol = inc.get('player', {})
        jogador_assist = inc.get('assist1', {})
        scorer_id = jogador_gol.get('id')
        
        is_home = inc.get('isHome', True)
        is_own_goal = (inc.get('incidentClass') == 'ownGoal')
        
        scorer_team_prev = home_score_tracked if is_home else away_score_tracked
        conceding_team_prev = away_score_tracked if is_home else home_score_tracked
        
        if is_home:
            home_score_tracked += 1
        else:
            away_score_tracked += 1
            
        scorer_team_goals = home_score_tracked if is_home else away_score_tracked
        conceding_team_goals = away_score_tracked if is_home else home_score_tracked
        
        impact = ""
        is_tie = False
        if scorer_team_prev == conceding_team_prev:
            impact = "Lideranca"
        elif scorer_team_goals == conceding_team_goals:
            impact = "Empate"
            is_tie = True
        elif scorer_team_prev > conceding_team_prev:
            impact = "Ampliar"
        else:
            impact = "Diminuir"
            
        shot_match = shots_by_time_player.get(f"{time}_{scorer_id}")
        goal_type = "Bola rolando"
        box_location = "Dentro da area"
        
        if shot_match:
            situation = shot_match.get('situation', '')
            if situation == 'penalty' or inc.get('incidentClass') == 'penalty':
                goal_type = "Penalti"
            elif situation == 'free-kick':
                goal_type = "Falta"
            
            x_coord = shot_match.get('playerCoordinates', {}).get('x', 0)
            if x_coord > 16.5:
                box_location = "Fora da area"
        else:
            if inc.get('incidentClass') == 'penalty':
                goal_type = "Penalti"
            elif is_own_goal:
                goal_type = "Gol contra"
                
        gol_info = {
            'match_id': match_id,
            'minute': minute_str,
            'scorer_id': scorer_id,
            'scorer_name': jogador_gol.get('name'),
            'assist_id': jogador_assist.get('id') if jogador_assist else None,
            'assist_name': jogador_assist.get('name') if jogador_assist else None,
            'goal_type': goal_type,
            'box_location': box_location,
            'impact': impact,
            'is_tie': is_tie,
            'is_home': is_home,
            'is_own_goal': is_own_goal
        }
        match_goals.append(gol_info)
        if is_home:
            home_goals_list.append(gol_info)
        else:
            away_goals_list.append(gol_info)
            
    # Marcar o gol da vitoria
    winner = None
    winning_goal_index = -1
    if home_score_tracked > away_score_tracked:
        winner = 'home'
        winning_goal_index = away_score_tracked
    elif away_score_tracked > home_score_tracked:
        winner = 'away'
        winning_goal_index = home_score_tracked

    for i, g in enumerate(home_goals_list):
        g['is_winning_goal'] = (winner == 'home' and i == winning_goal_index)
    for i, g in enumerate(away_goals_list):
        g['is_winning_goal'] = (winner == 'away' and i == winning_goal_index)

    # 3. LINEUPS (xA e carregar jogadores)
    url_lineups = f"https://api.sofascore.com/api/v1/event/{match_id}/lineups"
    resp_lineups = requests.get(url_lineups, impersonate="chrome", headers=HEADERS)
    if resp_lineups.status_code == 200:
        data = resp_lineups.json()
        all_players = data.get('home', {}).get('players', []) + data.get('away', {}).get('players', [])
        
        for p in all_players:
            p_id = p.get('player', {}).get('id')
            p_name = p.get('player', {}).get('name')
            xa = p.get('statistics', {}).get('expectedAssists', 0.0)
            
            if p_id:
                if p_id not in player_match_stats:
                    player_match_stats[p_id] = {'match_id': match_id, 'player_id': p_id, 'player_name': p_name, 'xg': 0.0, 'xa': 0.0}
                player_match_stats[p_id]['xa'] = xa

    stats_list = [stat for stat in player_match_stats.values() if stat['xg'] > 0 or stat['xa'] > 0]
    
    return match_goals, stats_list

def fetch_all_teams_and_players(tournament_id, season_id):
    teams_url = f"https://api.sofascore.com/api/v1/unique-tournament/{tournament_id}/season/{season_id}/teams"
    resp = requests.get(teams_url, impersonate="chrome", headers=HEADERS)
    all_player_ids = set()
    
    if resp.status_code == 200:
        teams = resp.json().get('teams', [])
        print(f"Encontrados {len(teams)} times no torneio.")
        for team in teams:
            team_id = team.get('id')
            url_players = f"https://api.sofascore.com/api/v1/team/{team_id}/players"
            resp_p = requests.get(url_players, impersonate="chrome", headers=HEADERS)
            if resp_p.status_code == 200:
                players = resp_p.json().get('players', [])
                for p in players:
                    pid = p.get('player', {}).get('id')
                    if pid:
                        all_player_ids.add(str(pid))
    return all_player_ids

def save_to_csv(filename, data, fieldnames):
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)

def main():
    os.makedirs(DADOS_DIR, exist_ok=True)
    tournament_id = 16
    season_id = 58210 # 2026 World Cup
    json_path = os.path.join(DADOS_DIR, "copa_2026_dados.json")
    
    # 1. Carregar info existente para n atualizar sempre
    existing_data = {"matches": [], "goals": [], "player_match_stats": [], "players_info": []}
    if os.path.exists(json_path):
        with open(json_path, 'r', encoding='utf-8') as f:
            existing_data = json.load(f)
            
    players_cache = {str(p['player_id']): p for p in existing_data.get('players_info', [])}
    print(f"Jogadores cacheados em disco: {len(players_cache)}")

    # 2. Obter todos os jogadores de todas as selecoes
    print("Buscando todos os jogadores das selecoes listadas...")
    all_tournament_player_ids = fetch_all_teams_and_players(tournament_id, season_id)
    print(f"Total de jogadores vinculados as selecoes: {len(all_tournament_player_ids)}")
    
    missing_players = all_tournament_player_ids - set(players_cache.keys())
    
    if missing_players:
        print(f"Buscando perfil de {len(missing_players)} novos jogadores...")
        session = requests.Session()
        def fetch_wrap(pid):
            return fetch_player_info(pid, session)

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            future_to_pid = {executor.submit(fetch_wrap, pid): pid for pid in missing_players}
            for i, future in enumerate(concurrent.futures.as_completed(future_to_pid)):
                pid = future_to_pid[future]
                try:
                    data = future.result()
                    if data:
                        players_cache[str(pid)] = data
                    if (i+1) % 50 == 0:
                        print(f"Baixados {i+1}/{len(missing_players)} perfis...")
                except Exception as exc:
                    print(f"Erro ao buscar jogador {pid}: {exc}")

    # 3. Processar Jogos de Forma Incremental
    matches = get_matches(tournament_id, season_id)
    print(f"Total de {len(matches)} jogos iniciados/encerrados.")
    
    # Montar caches baseados no json
    ended_matches_cache = {m['match_id']: m for m in existing_data.get('matches', []) if m['status'] == 'Ended'}
    
    all_goals = []
    all_stats = []
    
    # Aproveitar dados dos jogos finalizados já cacheados
    for g in existing_data.get('goals', []):
        if g['match_id'] in ended_matches_cache:
            all_goals.append(g)
            
    for st in existing_data.get('player_match_stats', []):
        if st['match_id'] in ended_matches_cache:
            all_stats.append(st)

    print("\nProcessando novos jogos (Gols, xG, xA, Impacto)...")
    for i, match in enumerate(matches):
        m_id = match['match_id']
        
        # Pular se o jogo já terminou e já temos os dados cacheados
        if m_id in ended_matches_cache and match['status'] == 'Ended':
            print(f"[{i+1}/{len(matches)}] {match['home']} vs {match['away']} (PULADO - já cacheado)")
            continue
            
        print(f"[{i+1}/{len(matches)}] Processando {match['home']} vs {match['away']}...")
        gols, stats = process_match(match, players_cache)
        all_goals.extend(gols)
        all_stats.extend(stats)

    # 4. Calcular Pontos dos Jogadores
    player_points = {}
    for pid in players_cache.keys():
        player_points[pid] = {'player_id': pid, 'player_name': players_cache[pid].get('name', 'Unknown'), 'points': 0}

    for g in all_goals:
        # Se for gol contra, ninguem ganha pontos!
        if g.get('is_own_goal'):
            continue
            
        pid = str(g.get('scorer_id'))
        if not pid or pid == 'None':
            continue
        if pid not in player_points:
            player_points[pid] = {'player_id': pid, 'player_name': g.get('scorer_name'), 'points': 0}
            
        pts = 0
        if g.get('is_winning_goal'):
            pts += 3
        if g.get('is_tie'):
            pts += 1
            
        player_points[pid]['points'] += pts
        
    points_list = [p for p in player_points.values() if p['points'] > 0]
    points_list.sort(key=lambda x: x['points'], reverse=True)

    # Preparar csv de gols
    goals_csv_data = []
    for g in all_goals:
        clean_g = g.copy()
        clean_g.pop('is_tie', None)
        clean_g.pop('is_winning_goal', None)
        clean_g.pop('is_home', None)
        goals_csv_data.append(clean_g)

    # Salvar JSON consolidado
    print("\nSalvando JSON e CSVs...")
    full_data = {
        "matches": matches,
        "goals": all_goals,
        "player_match_stats": all_stats,
        "players_info": list(players_cache.values()),
        "player_points": points_list
    }
    with open(json_path, "w", encoding='utf-8') as f:
        json.dump(full_data, f, ensure_ascii=False, indent=2)

    save_to_csv(os.path.join(DADOS_DIR, "matches.csv"), matches, ['match_id', 'home', 'away', 'home_score', 'away_score', 'status'])
    save_to_csv(os.path.join(DADOS_DIR, "goals.csv"), goals_csv_data, ['match_id', 'minute', 'scorer_id', 'scorer_name', 'assist_id', 'assist_name', 'goal_type', 'box_location', 'impact', 'is_own_goal'])
    save_to_csv(os.path.join(DADOS_DIR, "player_match_stats.csv"), all_stats, ['match_id', 'player_id', 'player_name', 'xg', 'xa'])
    
    players_info_list = list(players_cache.values())
    save_to_csv(os.path.join(DADOS_DIR, "players_info.csv"), players_info_list, ['player_id', 'name', 'age', 'height', 'weight', 'club', 'club_country', 'club_league'])
    save_to_csv(os.path.join(DADOS_DIR, "player_points.csv"), points_list, ['player_id', 'player_name', 'points'])
    
    print("\nProcesso concluído com sucesso!")

if __name__ == "__main__":
    main()
