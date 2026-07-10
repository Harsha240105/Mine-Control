import fetch from 'node-fetch';

async function test() {
  const loginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'minecontrol' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;

  // 1. Get initial config
  const get1 = await fetch('http://localhost:3001/api/discord', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('GET 1:', await get1.json());

  // 2. Save token
  const post1 = await fetch('http://localhost:3001/api/discord', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bot_token: 'test_token_123', text_channel_id: '123' })
  });
  console.log('POST 1:', await post1.json());

  // 3. Get config again
  const get2 = await fetch('http://localhost:3001/api/discord', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('GET 2:', await get2.json());
}

test();
