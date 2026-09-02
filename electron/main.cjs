const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: "Document & Archive Management System"
  });

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  mainWindow.loadURL(startUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend() {
  if (process.env.ELECTRON_START_URL) return; // Skip in dev mode

  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'database', 'app.db');
  const storagePath = path.join(userDataPath, 'storage');

  const serverPath = path.join(__dirname, '../backend/server.js');
  if (require('fs').existsSync(serverPath)) {
    serverProcess = spawn('node', [serverPath], {
      env: { 
        ...process.env, 
        NODE_ENV: 'production',
        DB_PATH: dbPath,
        STORAGE_PATH: storagePath
      }
    });

    serverProcess.stdout.on('data', (data) => console.log(`Backend: ${data}`));
    serverProcess.stderr.on('data', (data) => console.error(`Backend Error: ${data}`));
  }
}

app.on('ready', () => {
  startBackend();
  createWindow();
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
