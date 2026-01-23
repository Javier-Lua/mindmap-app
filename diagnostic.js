#!/usr/bin/env node

/**
 * Diagnostic Script for Messy Notes
 * 
 * Run this from the project root:
 * node diagnostic.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Messy Notes Diagnostic Tool\n');

// Check 1: Environment files
console.log('📄 Checking environment files...');

const frontendEnv = path.join(__dirname, 'frontend', '.env');
const backendEnv = path.join(__dirname, 'backend', '.env');

if (fs.existsSync(frontendEnv)) {
  const content = fs.readFileSync(frontendEnv, 'utf8');
  console.log('✅ frontend/.env exists');
  
  if (content.includes('VITE_API_URL')) {
    const match = content.match(/VITE_API_URL=(.+)/);
    const url = match ? match[1].trim() : 'NOT FOUND';
    
    if (url.includes('/api')) {
      console.log('❌ VITE_API_URL should NOT include /api');
      console.log(`   Current: ${url}`);
      console.log(`   Should be: http://localhost:3001`);
    } else if (url === 'http://localhost:3001') {
      console.log('✅ VITE_API_URL is correct');
    } else {
      console.log(`⚠️  VITE_API_URL is: ${url}`);
      console.log(`   Expected: http://localhost:3001`);
    }
  } else {
    console.log('⚠️  VITE_API_URL not found in .env');
    console.log('   Add: VITE_API_URL=http://localhost:3001');
  }
} else {
  console.log('❌ frontend/.env not found');
  console.log('   Create it with: VITE_API_URL=http://localhost:3001');
}

console.log('');

if (fs.existsSync(backendEnv)) {
  const content = fs.readFileSync(backendEnv, 'utf8');
  console.log('✅ backend/.env exists');
  
  const checks = [
    { key: 'DATABASE_URL', critical: true },
    { key: 'JWT_SECRET', critical: true },
    { key: 'GOOGLE_CLIENT_ID', critical: true },
    { key: 'GOOGLE_CLIENT_SECRET', critical: true },
    { key: 'FRONTEND_URL', critical: true, expected: 'http://localhost:5173' },
    { key: 'BACKEND_URL', critical: true, expected: 'http://localhost:3001' }
  ];
  
  checks.forEach(({ key, critical, expected }) => {
    if (content.includes(key)) {
      if (expected) {
        const match = content.match(new RegExp(`${key}=(.+)`));
        const value = match ? match[1].trim() : '';
        if (value === expected) {
          console.log(`✅ ${key} is correct`);
        } else {
          console.log(`⚠️  ${key}=${value}`);
          console.log(`   Expected: ${expected}`);
        }
      } else {
        console.log(`✅ ${key} is set`);
      }
    } else {
      console.log(`${critical ? '❌' : '⚠️'} ${key} not found`);
    }
  });
} else {
  console.log('❌ backend/.env not found');
}

console.log('\n📦 Checking package.json files...');

// Check package.json
const frontendPkg = path.join(__dirname, 'frontend', 'package.json');
const backendPkg = path.join(__dirname, 'backend', 'package.json');

if (fs.existsSync(frontendPkg)) {
  console.log('✅ frontend/package.json exists');
} else {
  console.log('❌ frontend/package.json not found');
}

if (fs.existsSync(backendPkg)) {
  console.log('✅ backend/package.json exists');
} else {
  console.log('❌ backend/package.json not found');
}

console.log('\n📁 Checking node_modules...');

const frontendModules = path.join(__dirname, 'frontend', 'node_modules');
const backendModules = path.join(__dirname, 'backend', 'node_modules');

if (fs.existsSync(frontendModules)) {
  console.log('✅ frontend/node_modules exists');
} else {
  console.log('❌ frontend/node_modules not found - run: cd frontend && npm install');
}

if (fs.existsSync(backendModules)) {
  console.log('✅ backend/node_modules exists');
} else {
  console.log('❌ backend/node_modules not found - run: cd backend && npm install');
}

console.log('\n🔌 Testing localhost ports...');

const net = require('net');

function checkPort(port, name) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`✅ Port ${port} is in use (${name} is running)`);
        resolve(true);
      } else {
        console.log(`❌ Port ${port} error: ${err.message}`);
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      server.close();
      console.log(`⚠️  Port ${port} is available (${name} is NOT running)`);
      resolve(false);
    });
    
    server.listen(port);
  });
}

(async () => {
  await checkPort(3001, 'Backend');
  await checkPort(5173, 'Frontend');
  
  console.log('\n📋 Summary & Next Steps:\n');
  
  console.log('1. Make sure both servers are running:');
  console.log('   Backend:  cd backend && npm start');
  console.log('   Frontend: cd frontend && npm run dev\n');
  
  console.log('2. Clear browser cache:');
  console.log('   - Open DevTools (F12)');
  console.log('   - Application → Clear storage → Clear site data');
  console.log('   - Hard refresh (Ctrl+Shift+R)\n');
  
  console.log('3. Check browser console for errors\n');
  
  console.log('4. Verify API calls in Network tab:');
  console.log('   - Should see: http://localhost:3001/api/me');
  console.log('   - NOT: http://localhost:3001/me\n');
  
  console.log('✅ If all checks pass, the issue is likely:');
  console.log('   - Stale browser cache (clear it)');
  console.log('   - Cookie not being set (check CORS settings)');
  console.log('   - Need to restart servers');
})();