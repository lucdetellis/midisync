/*
  MIDIsync
  Copyright 2022 Luc DeTellis
*/

global.VERSION = '0.1.0';
global.BUILD = '221223';

global.DEBUG = false;
global.DEBUG_OPEN_DEV_TOOLS = false;

// TODO: test on arm64
// TODO: use electron-unhandled?
// TODO: success message fast fade out opacity
// TODO: in new advanced mode: channel = alias to a cuelist #

/* ================================================= */
/*  LOCAL CONSTANTS                                  */
/* ================================================= */

const DEFAULT_SETTINGS = {
  inputPortID: 0,
  outputPortID: 0,
  inputPortName: '',
  outputPortName: '',
  channel: 1,
  mode: 0,
  deviceID: 0,
  cuelist: 1
};

const WINDOW_BG_COLOR = '#282C33';

const TROUBLESHOOTING_GUIDE_URL = 'about:blank'; // TODO

const IS_MAC = (process.platform === 'darwin');

/* ================================================= */
/*  NODE MODULES                                     */
/* ================================================= */

const fs = require('fs');
const path = require('path');
const url = require('url');

/* ================================================= */
/*  npm MODULES                                      */
/* ================================================= */

global.log = require('npmlog');

const Store = require('electron-store');
const midi = require('@julusian/midi');
const msc = require('./midi-show-control');

/* ================================================= */
/*  STARTUP LOG                                      */
/* ================================================= */

console.log('----------------');
console.log('--  MIDIsync  --');
console.log('----------------');

// Log copyright
log.info('Copyright', '2022 Luc DeTellis');

// Log server version and Node version
log.info('Version', `${VERSION} (${BUILD}) [Node ${process.version}]`);

// Warn if debug mode is enabled
if (DEBUG) {
  log.warn('DEBUG MODE', 'Verbose logging enabled');
}

/* ================================================= */
/*  GLOBAL UTILITY                                   */
/* ================================================= */

// (none currently)

/* ================================================= */
/*  ELECTRON                                         */
/* ================================================= */

const { app, Menu, BrowserWindow, dialog, ipcMain, shell } = require('electron');

app.setName('MIDIsync');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

/* ======================== */
/*  APP LISTENERS           */
/* ======================== */

// Some APIs can only be used after this event occurs
app.on('ready', function () {
  updatePortLists();

  restoreSettings();
  updateSettingsFromRestart();

  setupAppMenu();

  createMainWindow();
});

// Quit when all windows are closed
app.on('window-all-closed', function () {
  app.quit();
});

// Close all MIDI ports when the app is quit
app.on('will-quit', function () {
  closeAllPorts();
});

/* ======================== */
/*  MAIN WINDOW             */
/* ======================== */

const createMainWindow = function () {
  let winOptions = {
    title: 'MIDIsync',
    width: 1024,
    height: 768,
    minWidth: 650,
    minHeight: 700,
    center: true,
    fullscreenable: false,
    acceptFirstMouse: false,
    disableAutoHideCursor: true,
    transparent: false,
    backgroundColor: WINDOW_BG_COLOR,
    darkTheme: true,
    vibrancy: 'dark',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: DEBUG
    }
  };

  // Create the browser window
  global.mainWindow = new BrowserWindow(winOptions);

  // Load the main window html page
  mainWindow.loadFile(path.join(__dirname, 'window/main.html'));

  // Open the DevTools if specified
  if (DEBUG_OPEN_DEV_TOOLS) {
    mainWindow.webContents.openDevTools();
  }

  // Confirm before quit (before main window closes)
  mainWindow.on('close', function (event) {
    let resButtonIndex = dialog.showMessageBoxSync(this, {
      type: 'question',
      title: 'Confirm',
      buttons: ['Quit', 'Cancel'],
      message: 'Are you sure you want to quit?'
    });

    if (resButtonIndex === 1) {
      event.preventDefault();
    }
  });
};

/* ======================== */
/*  MENU BAR                */
/* ======================== */

// Ref: https://www.electronjs.org/docs/latest/api/menu#examples

let menuTemplate = [
  // App
  ...(IS_MAC ? [{
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideothers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }] : []),

  // Settings
  {
    label: 'Settings',
    submenu: [
      /*{
        label: 'Placeholder Checkbox',
        type: 'checkbox',
        click: (menuItem, browserWindow, event) => {
          console.log(menuItem.checked);
        }
      }*/
    ]
  },

  // Edit
  {
    label: 'Edit',
    submenu: [
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectall' }
    ]
  },

  // View
  {
    label: 'View',
    submenu: [
    ]
  },

  // Window
  {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(IS_MAC ? [
        { type: 'separator' },
        { role: 'front' },
      ] : [
        { role: 'close' }
      ])
    ]
  },

  // Help
  {
    role: 'help',
    submenu: [
      {
        label: 'Troubleshooting Guide',
        click: async () => {
          await shell.openExternal(TROUBLESHOOTING_GUIDE_URL);
        }
      }
    ]
  }
];

const setupAppMenu = function () {
  // Set the menu item as checked
  //menuTemplate[2].submenu[0].checked = settingsState.placeholder;

  // Enable DevTools menu toggle in debug mode
  if (DEBUG) {
    menuTemplate.find(m => m.label === 'Settings').submenu.push({
      role: 'toggleDevTools'
    });
  }

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
};

/* ================================================= */
/*  USER SETTINGS STORAGE                            */
/* ================================================= */

// Initialize the storage module
const store = new Store();

// This variable will hold the current state of user settings
let settingsState = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

const saveSettings = function () {
  // Save the current state of settings to storage
  store.set('settings', settingsState);

  if (DEBUG) log.info('store', 'Settings saved');
};

const restoreSettings = function () {
  // Get the most recent saved settings from storage
  let savedSettings = store.get('settings');

  // Port IDs
  settingsState.inputPortID = parseInt(savedSettings?.inputPortID) || DEFAULT_SETTINGS.inputPortID;
  settingsState.outputPortID = parseInt(savedSettings?.outputPortID) || DEFAULT_SETTINGS.outputPortID;

  // Port names
  settingsState.inputPortName = savedSettings?.inputPortName || DEFAULT_SETTINGS.inputPortName;
  settingsState.outputPortName = savedSettings?.outputPortName || DEFAULT_SETTINGS.outputPortName;

  // MIDI channel
  settingsState.channel = parseInt(savedSettings?.channel) || DEFAULT_SETTINGS.channel;

  // App mode
  settingsState.mode = parseInt(savedSettings?.mode) || DEFAULT_SETTINGS.mode;

  // MIDI Show Control settings
  settingsState.deviceID = parseInt(savedSettings?.deviceID) || DEFAULT_SETTINGS.deviceID;
  settingsState.cuelist = parseInt(savedSettings?.cuelist) || DEFAULT_SETTINGS.cuelist;

  if (DEBUG) log.info('store', 'Settings restored');
};

const updateSettings = function (newSettings) {
  // Port IDs
  settingsState.inputPortID = parseInt(newSettings?.inputPortID) || DEFAULT_SETTINGS.inputPortID;
  settingsState.outputPortID = parseInt(newSettings?.outputPortID) || DEFAULT_SETTINGS.outputPortID;

  // Port names
  let inputPortName = inputPortList[newSettings?.inputPortID];
  let outputPortName = outputPortList[newSettings?.outputPortID];

  settingsState.inputPortName = inputPortName || '';
  settingsState.outputPortName = outputPortName || '';

  // MIDI channel
  settingsState.channel = parseInt(newSettings?.channel) || DEFAULT_SETTINGS.channel;

  // App mode
  settingsState.mode = parseInt(newSettings?.mode) || DEFAULT_SETTINGS.mode;

  // MIDI Show Control settings
  settingsState.deviceID = parseInt(newSettings?.deviceID) || DEFAULT_SETTINGS.deviceID;
  settingsState.cuelist = parseInt(newSettings?.cuelist) || DEFAULT_SETTINGS.cuelist;

  if (DEBUG) log.info('store', 'Settings updated');

  // Save and apply the settings on the back-end
  saveSettings();
  applySettings();

  // Display the settings on the front-end
  displaySettings();
};

// Update settings from window
ipcMain.on('update-settings', function (event, newSettings) {
  const showError = (message) => mainWindow.webContents.send('show-message', 'error', message);

  if (newSettings.inputPortID < 0) return showError('invalid-input-port');
  if (newSettings.outputPortID < 0) return showError('invalid-output-port');
  if (newSettings.channel < 1 || newSettings.channel > 16) return showError('channel-outofrange');
  if (newSettings.mode < 0 || newSettings.mode > 1) return showError('invalid-mode');
  if (newSettings.deviceID < 0 || newSettings.deviceID > 111) return showError('deviceid-outofrange');
  if (newSettings.cuelist < 1 || newSettings.cuelist > 99999) return showError('cuelist-outofrange');

  updateSettings(newSettings);

  mainWindow.webContents.send('show-message', 'success', 'settings-updated');
});

const displaySettings = function () {
  updatePortLists();

  mainWindow.webContents.send('display-settings', settingsState, {
    inputPortList,
    outputPortList
  });
};

// Window has requested the current settings
ipcMain.on('request-settings', function (event) {
  displaySettings();
});

const applySettings = function () {
  // Update the MIDI input and output ports with the current settings
  changeInputPort(settingsState.inputPortID);
  changeOutputPort(settingsState.outputPortID);
};

const updateSettingsFromRestart = function () {
  // Locate the saved MIDI input port from its name
  let newInputPortID = 0;

  inputPortList.forEach((name, id) => {
    if (name === settingsState.inputPortName) {
      newInputPortID = id;
    }
  });

  // Replace the ID in case it has changed
  settingsState.inputPortID = newInputPortID;

  // Locate the saved MIDI output port from its name
  let newOutputPortID = 0;

  outputPortList.forEach((name, id) => {
    if (name === settingsState.outputPortName) {
      newOutputPortID = id;
    }
  });

  // Replace the ID in case it has changed
  settingsState.outputPortID = newOutputPortID;

  applySettings();
};

/* ================================================= */
/*  CORE MIDI PROCESSING                             */
/* ================================================= */

const onMIDIMessage = function (time, msg) {
  let channel = msg[0] - 143;
  let note = msg[1];
  let velocity = msg[2];

  if (DEBUG) {
    log.info('MIDI In', {channel, note, velocity});
  }

  let deviceID = settingsState.deviceID;
  if (deviceID < 0) deviceID = 'all'; // Broadcast to all Device IDs
  // FUTURE TODO: implement in UI and client

  // Simple -- Cue # 1-127
  if (settingsState.mode === 0) {
    if (channel === settingsState.channel && note === 0) {
      let cue = velocity;

      if (cue > 0) {
        let messageObj = {
          deviceId: deviceID,
          commandFormat: 'lighting.general',
          command: 'go',
          cue: cue.toString(),
          cueList: settingsState.cuelist.toString()
        };

        if (DEBUG) {
          log.info('MSC Out', messageObj);
        }

        let message = msc.buildMessage(messageObj);
        output.sendMessage(message);
      }
    }
  }

  // Advanced -- Cue # 1-999
  else if (settingsState.mode === 1) {
    if (channel === settingsState.channel && note <= 9 && velocity <= 99) {
      let cue = velocity + (note * 100);

      if (cue > 0) {
        let messageObj = {
          deviceId: deviceID,
          commandFormat: 'lighting.general',
          command: 'go',
          cue: cue.toString(),
          cueList: settingsState.cuelist.toString()
        };

        if (DEBUG) {
          log.info('MSC Out', messageObj);
        }

        let message = msc.buildMessage(messageObj);
        output.sendMessage(message);
      }
    }
  }
};

/* ================================================= */
/*  MIDI                                             */
/* ================================================= */

let inputPort = null; // Input port ID (null if no port)
let inputPortList = []; // String list of all input ports

let outputPort = null; // Output port ID (null if no port)
let outputPortList = []; // String list of all output ports

let input = null; // MIDI Input object
let output = null; // MIDI Output object

const handleMIDIPortError = function (errCode) {
  let errDesc = 'Unknown Error';

  if (errCode === 301) {
    let inPortName = settingsState.inputPortName || '(no port)';

    errDesc = `Can't open connection to the Input MIDI Port "${inPortName}".`;

  } else if (errCode === 302) {
    let outPortName = settingsState.outputPortName || '(no port)';

    errDesc = `Can't open connection to Output MIDI Port "${outPortName}".`;
  }

  errDesc += 'This is most likely because the MIDI device has been unplugged.';

  dialog.showMessageBoxSync({
    type: 'error',
    title: 'MIDI Error',
    buttons: ['OK'],
    message: `MIDI Error \n\n${errDesc} (Code ${errCode})`
  });
};

// Update the port list
const updatePortLists = function () {
  // Empty port lists
  inputPortList = [];
  outputPortList = [];

  // Create ports if not already created
  if (input === null) {
    input = new midi.Input();
  }
  if (output === null) {
    output = new midi.Output();
  }

  // Input

  // Get the total number of ports
  let inputPortCount = input.getPortCount();

  // Loop through all the ports
  for (let id = 0; id < inputPortCount; id++) {
    // Get the port name for this port
    let portName = input.getPortName(id);
    
    // Add this port to the array as a string (index=portID)
    inputPortList.push(portName);
  }

  // Output

  // Get the total number of ports
  let outputPortCount = output.getPortCount();

  // Loop through all the ports
  for (let id = 0; id < outputPortCount; id++) {
    // Get the port name for this port
    let portName = output.getPortName(id);
    
    // Add this port to the array as a string (index=portID)
    outputPortList.push(portName);
  }
};

// Change the input port
const changeInputPort = function (portID) {
  if (DEBUG) {
    log.info('MIDI', 'Changing port: IN=' + portID);
  }

  // If we currently have an open port,
  if (typeof inputPort === 'number') {
    // close the port.
    input.closePort();
  }

  // Create a new input
  input = new midi.Input();

  try {
    // Open the port supplied in the argument portID
    input.openPort(portID);

    // Update the current port
    inputPort = portID;

    // Attach the listener
    input.on('message', onMIDIMessage);
  } catch(e) {
    log.error('MIDI', e);

    handleMIDIPortError(301);
  }
}

// Change the output port
const changeOutputPort = function (portID) {
  if (DEBUG) {
    log.info('MIDI', 'Changing port: OUT=' + portID);
  }

  // If we currently have an open port,
  if (typeof outputPort === 'number') {
    // close the port.
    output.closePort();
  }

  // Create a new output
  output = new midi.Output();

  try {
    // Open the port supplied in the argument portID
    output.openPort(portID);

    // Update the current port
    outputPort = portID;
  } catch(e) {
    log.error('MIDI', e);

    handleMIDIPortError(302);
  }
}

const closeAllPorts = function () {
  // If we currently have an open port,
  if (typeof inputPort === 'number') {
    // close the port.
    input.closePort();
  }

  // If we currently have an open port,
  if (typeof outputPort === 'number') {
    // close the port.
    output.closePort();
  }
};
