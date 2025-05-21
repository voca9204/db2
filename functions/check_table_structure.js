const mariadb = require('mariadb');

async function main() {
  let conn;
  try {
    conn = await mariadb.createConnection({
      host: '211.248.190.46',
      user: 'hermes',
      password: 'mcygicng!022',
      database: 'hermes'
    });
    
    // players 테이블 구조 확인
    console.log('=== PLAYERS 테이블 구조 ===');
    const playersColumns = await conn.query('DESCRIBE players');
    console.log(playersColumns);
    
    // game_scores 테이블 구조 확인
    console.log('\n=== GAME_SCORES 테이블 구조 ===');
    const gameScoresColumns = await conn.query('DESCRIBE game_scores');
    console.log(gameScoresColumns);
    
    // 샘플 데이터 확인 - players
    console.log('\n=== PLAYERS 샘플 데이터 ===');
    const playersSample = await conn.query('SELECT * FROM players LIMIT 3');
    console.log(JSON.stringify(playersSample, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    
    // 샘플 데이터 확인 - game_scores
    console.log('\n=== GAME_SCORES 샘플 데이터 ===');
    const gameScoresSample = await conn.query('SELECT * FROM game_scores LIMIT 3');
    console.log(JSON.stringify(gameScoresSample, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    
    // 조인 관계 확인 - players와 game_scores
    console.log('\n=== 조인 관계 테스트 - p.id = gs.userId ===');
    const joinTest1 = await conn.query(`
      SELECT COUNT(*) as count
      FROM players p
      JOIN game_scores gs ON p.id = gs.userId
    `);
    console.log(`결과 건수: ${joinTest1[0].count}`);
    
    console.log('\n=== 조인 관계 테스트 - p.userId = gs.userId ===');
    const joinTest2 = await conn.query(`
      SELECT COUNT(*) as count
      FROM players p
      JOIN game_scores gs ON p.userId = gs.userId
    `);
    console.log(`결과 건수: ${joinTest2[0].count}`);
    
    // 실제 조인된 데이터 확인
    console.log('\n=== p.id = gs.userId 조인 샘플 ===');
    const joinSample1 = await conn.query(`
      SELECT p.id as player_id, p.userId as player_userId, gs.userId as gs_userId
      FROM players p
      JOIN game_scores gs ON p.id = gs.userId
      LIMIT 3
    `);
    console.log(JSON.stringify(joinSample1, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    
    console.log('\n=== p.userId = gs.userId 조인 샘플 ===');
    const joinSample2 = await conn.query(`
      SELECT p.id as player_id, p.userId as player_userId, gs.userId as gs_userId
      FROM players p
      JOIN game_scores gs ON p.userId = gs.userId
      LIMIT 3
    `);
    console.log(JSON.stringify(joinSample2, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    
  } catch (err) {
    console.error('Error executing query:', err);
  } finally {
    if (conn) conn.close();
  }
}

main();
