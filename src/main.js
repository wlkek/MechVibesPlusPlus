// Modules to control application life and create native browser window
const { app, BrowserWindow, Tray, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const StartupHandler = require('./utils/startup_handler');
const ListenHandler = require('./utils/listen_handler');
const KeyupHandler = require('./utils/keyup_handler');
const MouseHandler = require('./utils/mouse_handler');
const RandomHandler = require('./utils/random_handler');
const i18n = require('./i18n');
const Store = require('electron-store');
const store = new Store();

const SYSTRAY_ICON = path.join(__dirname, '/assets/system-tray-icon.png');
const home_dir = app.getPath('home');
const keyboardcustom_dir = path.join(home_dir, '/mechvibes_custom');
const mousecustom_dir = path.join(home_dir, '/mousevibes_custom');

var win;
var tray = null;
global.app_version = app.getVersion();
global.keyboardcustom_dir = keyboardcustom_dir;
global.mousecustom_dir = mousecustom_dir;
fs.ensureDirSync(keyboardcustom_dir);
fs.ensureDirSync(mousecustom_dir);

const savedLocale = store.get('mechvibes-locale') || 'en';
i18n.setLocale(savedLocale);

function buildContextMenu(startup_handler, listen_handler, keyup_handler, mouse_handler, random_handler) {
  return Menu.buildFromTemplate([
    {
      label: i18n.t('tray.appName'),
      click: function () {
        win.show();
      },
    },
    {
      label: i18n.t('tray.editor'),
      click: function () {
        openEditorWindow();
      },
    },
    {
      label: i18n.t('tray.keyboardCustomFolder'),
      click: function () {
        shell.openItem(keyboardcustom_dir);
      },
    },
    {
      label: i18n.t('tray.mouseCustomFolder'),
      click: function () {
        shell.openItem(mousecustom_dir);
      },
    },
    {
      label: i18n.t('tray.openDevtools'),
      click: function () {
        win.openDevTools();
        win.webContents.openDevTools();
      },
    },
    {
      label: i18n.t('tray.refreshSoundpacks'),
      click: function () {
        win.webContents.send('refresh')
      },
    },
    {
      label: i18n.t('tray.mute'),
      type: 'checkbox',
      checked: listen_handler.is_muted,
      click: function () {
        listen_handler.toggle();
        win.webContents.send('muted', listen_handler.is_muted);
      },
    },
    {
      label: i18n.t('tray.keyupSounds'),
      type: 'checkbox',
      checked: keyup_handler.is_keyup,
      click: function () {
        keyup_handler.toggle();
        win.webContents.send('theKeyup', keyup_handler.is_keyup);
      },
    },
    {
      label: i18n.t('tray.mouseSounds'),
      type: 'checkbox',
      checked: mouse_handler.is_mousesounds,
      click: function () {
        mouse_handler.toggle();
        win.webContents.send('MouseSounds', mouse_handler.is_mousesounds);
      },
    },
    {
      label: i18n.t('tray.randomSounds'),
      type: 'checkbox',
      checked: random_handler.is_random,
      click: function () {
        random_handler.toggle();
        win.webContents.send('RandomSoundEnable', random_handler.is_random);
      },
    },
    {
      label: i18n.t('tray.enableAtStartup'),
      type: 'checkbox',
      checked: startup_handler.is_enabled,
      click: function () {
        startup_handler.toggle();
      },
    },
    {
      label: i18n.t('tray.language'),
      submenu: i18n.getAvailableLocales().map((locale) => ({
        label: locale === 'en' ? 'English' : '中文',
        type: 'radio',
        checked: i18n.getLocale() === locale,
        click: function () {
          i18n.setLocale(locale);
          store.set('mechvibes-locale', locale);
          tray.setContextMenu(buildContextMenu(startup_handler, listen_handler, keyup_handler, mouse_handler, random_handler));
          win.webContents.send('locale-changed', locale);
          if (editor_window) {
            editor_window.webContents.send('locale-changed', locale);
          }
        },
      })),
    },
    {
      label: i18n.t('tray.quit'),
      click: function () {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);
}

function createWindow(show = true) {
  win = new BrowserWindow({
    width: 450,
    height: 730,
    webSecurity: false,
    webPreferences: {
      preload: path.join(__dirname, 'app.js'),
      contextIsolation: false,
      nodeIntegration: true,
    },
    show,
  });

  win.removeMenu();

  win.loadFile('./src/app.html');

  win.on('closed', function () {
    win = null;
  });

  win.on('minimize', function (event) {
    if (process.platform === 'darwin') {
      app.dock.hide();
    }
    event.preventDefault();
    win.hide();
  });

  win.on('close', function (event) {
    if (!app.isQuiting) {
      if (process.platform === 'darwin') {
        app.dock.hide();
      }
      event.preventDefault();
      win.hide();
    }
    return false;
  });

  return win;
}

const gotTheLock = app.requestSingleInstanceLock();
app.on('second-instance', () => {
  if (win) {
    win.show();
    win.focus();
  }
});

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) {
        win.restore();
      }
      win.show();
      win.focus();
    }
  });

  app.on('ready', () => {
    win = createWindow(true);

    tray = new Tray(SYSTRAY_ICON);

    tray.setToolTip('MechvibesPlusPlus');

    const startup_handler = new StartupHandler(app);
    const listen_handler = new ListenHandler(app);
    const keyup_handler = new KeyupHandler(app);
    const mouse_handler = new MouseHandler(app);
    const random_handler = new RandomHandler(app);

    tray.setContextMenu(buildContextMenu(startup_handler, listen_handler, keyup_handler, mouse_handler, random_handler));

    tray.on('double-click', () => {
      win.show();
    });

    if (process.platform == 'darwin') {
      const { powerMonitor } = require('electron');
      powerMonitor.on('shutdown', () => {
        app.quit();
      });
    }
  });
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (win === null) createWindow();
});

app.on('quit', () => {
  app.quit();
});

var editor_window = null;

function openEditorWindow() {
  if (editor_window) {
    editor_window.focus();
    return;
  }

  editor_window = new BrowserWindow({
    width: 1200,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
    },
  });

  editor_window.loadFile('./src/editor.html');

  editor_window.on('closed', function () {
    editor_window = null;
  });
}
