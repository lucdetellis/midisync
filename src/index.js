/*
  MIDIsync
  Copyright 2022 Luc DeTellis
*/

global.VERSION = '0.1.0';
global.BUILD = '221223';

global.DEBUG = false;
global.DEBUG_OPEN_DEV_TOOLS = false;

// TODO: Success message fast fade out opacity
// TODO: In new advanced mode: Channel = alias to a cuelist #

/* ================================================= */
/*  GLOBAL CONSTANTS                                 */
/* ================================================= */

global.isMac = (process.platform === 'darwin');

/* ================================================= */
/*  LOCAL CONSTANTS                                  */
/* ================================================= */

const DATA_FILE = '/settings.json'; // TODO: find key/value or settings storage

const TROUBLESHOOTING_GUIDE_URL = 'about:blank'; // TODO

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

const {
  app,
  Menu,
  BrowserWindow,
  dialog
} = require('electron');

app.setName('MIDIsync');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

/* ======================== */
/*  APP LISTENERS           */
/* ======================== */

// Some APIs can only be used after this event occurs
app.on('ready', () => {
  updatePortLists();

  restoreDataFile(() => {
    updateSettingsFromRestart();

    setupAppMenu();

    createMainWindow({
      darkMode: settings.darkMode
    });
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  app.quit();
});

// Close all MIDI ports when the app is quit
app.on('will-quit', () => {
  closeAllPorts();
});

/* ======================== */
/*  MAIN WINDOW             */
/* ======================== */

function createMainWindow (winConfig) {
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
    backgroundColor: lightModeBGColor,
    darkTheme: false,
    vibrancy: 'light',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    }
  };

  if (winConfig.darkMode) {
    winOptions.backgroundColor = darkModeBGColor;
    winOptions.darkTheme = true;
    winOptions.vibrancy = 'dark';
  }

  // Create the browser window
  global.mainWindow = new BrowserWindow(winOptions);

  // Load the main window html page
  mainWindow.loadFile(path.join(__dirname, 'window/main.html'));

  // Open the DevTools if specified
  if (DEBUG_OPEN_DEV_TOOLS) {
    mainWindow.webContents.openDevTools();
  }

  /* Main Window Listeners */

  // Confirm before quit (before main window closes)
  mainWindow.on('close', function (event) {
    let confirmation = dialog.showMessageBox(this, {
      type: 'question',
      title: 'Confirm',
      buttons: ['Quit', 'Cancel'],
      message: 'Are you sure you want to quit?'
    });

    if (confirmation === 1) {
      event.preventDefault();
    }
  });
}

/* ======================== */
/*  MENU BAR                */
/* ======================== */

let menuTemplate = [
  // App
  ...(isMac ? [{
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

  // Settings
  {
    label: 'Settings',
    submenu: [
      {
        label: 'Dark Theme',
        type: 'checkbox',
        click: (menuItem, browserWindow, event) => {
          changeDarkMode(menuItem.checked);
        }
      }
    ]
  },

  // Window
  {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(isMac ? [
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
          const { shell } = require('electron');
          await shell.openExternal(TROUBLESHOOTING_GUIDE_URL);
        }
      }
    ]
  }
];

function setupAppMenu () {
  // Update the 3rd Menu (Settings) and the 1st SubMenu (Dark Theme)
  menuTemplate[2].submenu[0].checked = settings.darkMode;

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

/* ======================== */
/*  DARK MODE               */
/* ======================== */

let lightModeBGColor = '#A4A6AA';
let darkModeBGColor = '#282C33';

function changeDarkMode (enabled) {
  settings.darkMode = enabled;

  mainWindow.setBackgroundColor(enabled ? darkModeBGColor : lightModeBGColor);
  mainWindow.setVibrancy(enabled ? 'dark' : 'light');

  updateDarkModeSetting(enabled);

  mainWindow.reload();
};

/* ================================================= */
/*  DATA FILE                                        */
/* ================================================= */

let settings = {
  inputPortID: 0,
  outputPortID: 0,
  inputPortName: '',
  outputPortName: '',
  channel: 1,
  mode: 0,
  deviceID: 0,
  cuelist: 1,
  darkMode: false
};

const handleCorruption = function (errCode) {
  let errorMsg = `Unfortunately, the settings file has become corrupt (Code ${errCode}). Please delete and re-install the MIDIsync app.`;

  setTimeout(() => {
    app.quit();
  }, 1);

  throw new Error(errorMsg);
};

let saveDataFile = function () {
  let filePath = path.join(__dirname, DATA_FILE);

  let json = {
    settings
  };
  json = JSON.stringify(json);

  fs.writeFile(filePath, json, function (err) {
    if (err) {
      log.error('fs', err);
      return handleCorruption(801);
    } else {
      if (DEBUG) log.info('fs', 'Data file saved');
    }
  });
};

let restoreDataFile = function (callback) {
  let filePath = path.join(__dirname, DATA_FILE);

  fs.exists(filePath, function (exists) {
    if (exists) {

      fs.readFile(filePath, function (err, json) {
        if (err) {
          log.error('fs', err);
          return handleCorruption(802);
        } else {

          try {
            json = JSON.parse(json.toString());
          } catch(e) {
            log.error('json', e);
            return handleCorruption(601);
          }

          try {
            settings.inputPortID = parseInt(json.settings.inputPortID);
            settings.outputPortID = parseInt(json.settings.outputPortID);

            settings.inputPortName = json.settings.inputPortName || '';
            settings.outputPortName = json.settings.outputPortName || '';

            settings.channel = parseInt(json.settings.channel);
            settings.mode = parseInt(json.settings.mode);

            settings.deviceID = parseInt(json.settings.deviceID);
            settings.cuelist = parseInt(json.settings.cuelist);

            settings.darkMode = Boolean(json.settings.darkMode);

            if (!Number.isInteger(settings.inputPortID)) throw new Error('inputPortID not int');
            if (!Number.isInteger(settings.outputPortID)) throw new Error('outputPortID not int');

            if (!Number.isInteger(settings.channel)) throw new Error('channel not int');
            if (!Number.isInteger(settings.mode)) throw new Error('mode not int');

            if (!Number.isInteger(settings.deviceID)) throw new Error('deviceID not int');
            if (!Number.isInteger(settings.cuelist)) throw new Error('cuelist not int');
          } catch(e) {
            log.error('json parse', e);
            return handleCorruption(602);
          }

          if (DEBUG) log.info('fs', 'Data file restored');
          callback();
        }
      });

    } else {
      log.info('fs', 'Data file not found: ' + DATA_FILE);
      saveDataFile();
      callback();
    }
  });
};

/* ================================================= */
/*  CORE MIDI PROCESSING                             */
/* ================================================= */

var onMIDIMessage = function (time, msg) {
  var channel = msg[0] - 143;
  var note = msg[1];
  var velocity = msg[2];

  if (DEBUG) {
    log.info('MIDI In', {channel, note, velocity});
  }

  var deviceID = settings.deviceID;
  if (deviceID < 0) deviceID = 'all'; // Broadcast to all Device IDs
  // FUTURE TODO: Implement in UI and client

  // Simple -- Cue # 1-127
  if (settings.mode === 0) {
    if (channel === settings.channel && note === 0) {
      var cue = velocity;

      if (cue > 0) {
        var messageObj = {
          deviceId: deviceID,
          commandFormat: 'lighting.general',
          command: 'go',
          cue: cue.toString(),
          cueList: settings.cuelist.toString()
        };

        if (DEBUG) {
          log.info('MSC Out', messageObj);
        }

        var message = msc.buildMessage(messageObj);
        output.sendMessage(message);
      }
    }
  }

  // Advanced -- Cue # 1-999
  else if (settings.mode === 1) {
    if (channel === settings.channel && note <= 9 && velocity <= 99) {
      var cue = velocity + (note * 100);

      if (cue > 0) {
        var messageObj = {
          deviceId: deviceID,
          commandFormat: 'lighting.general',
          command: 'go',
          cue: cue.toString(),
          cueList: settings.cuelist.toString()
        };

        if (DEBUG) {
          log.info('MSC Out', messageObj);
        }

        var message = msc.buildMessage(messageObj);
        output.sendMessage(message);
      }
    }
  }
};

/* ================================================= */
/*  MIDI                                             */
/* ================================================= */

var inputPort = null; // Input port ID (null if no port)
var inputPortList = []; // String list of all input ports

var outputPort = null; // Output port ID (null if no port)
var outputPortList = []; // String list of all output ports

var input = null; // MIDI Input object
var output = null; // MIDI Output object

var handleMIDIPortError = function (errCode) {
  let errDesc = `Unknown Error`;
  if (errCode === 301) {
    let inPortName = settings.inputPortName || '(no port)';
    errDesc =  `Can't open connection to the Input MIDI Port "${inPortName}". This is most likely because the MIDI device has been unplugged.`;
  } else if (errCode === 302) {
    let outPortName = settings.outputPortName || '(no port)';
    errDesc =  `Can't open connection to Output MIDI Port "${outPortName}". This is most likely because the MIDI device has been unplugged.`;
  }

  let resp = dialog.showMessageBox({
    type: 'error',
    title: 'MIDI Error',
    buttons: ['OK'],
    message: `MIDI Error \n\n${errDesc} (Code ${errCode})`
  });
};

// Update the port list
var updatePortLists = function () {
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
  var portCount = input.getPortCount();

  // Loop through all the ports
  for (var id=0; id<portCount; id++) {
    // Get the port name for this port
    var portName = input.getPortName(id);
    
    // Add this port to the array as a string (index=portID)
    inputPortList.push(portName);
  }

  // Output

  // Get the total number of ports
  var portCount = output.getPortCount();

  // Loop through all the ports
  for (var id=0; id<portCount; id++) {
    // Get the port name for this port
    var portName = output.getPortName(id);
    
    // Add this port to the array as a string (index=portID)
    outputPortList.push(portName);
  }

  return {
    inputPortList,
    outputPortList
  };
};

// Change the input port
var changeInputPort = function (portID) {
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
var changeOutputPort = function (portID) {
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

var closeAllPorts = function () {
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

/* ================================================= */
/*  APP LOGIC                                        */
/* ================================================= */

var applySettings = function () {
  changeInputPort(settings.inputPortID);
  changeOutputPort(settings.outputPortID);
};

var updateSettingsFromRestart = function () {
  var newInputPortID = 0;
  inputPortList.forEach(function (name, id) {
    if (name === settings.inputPortName) {
      newInputPortID = id;
    }
  });
  settings.inputPortID = newInputPortID;

  var newOutputPortID = 0;
  outputPortList.forEach(function (name, id) {
    if (name === settings.outputPortName) {
      newOutputPortID = id;
    }
  });
  settings.outputPortID = newOutputPortID;

  applySettings();
};

var updateSettings = function (newSettings) {
  // No need to validate with parseInt here,
  //  it already has been validated in /update-settings

  settings.inputPortID = newSettings.inputPortID;
  settings.outputPortID = newSettings.outputPortID;

  var inputPortName = inputPortList[newSettings.inputPortID];
  var outputPortName = outputPortList[newSettings.outputPortID];

  settings.inputPortName = inputPortName;
  settings.outputPortName = outputPortName;

  settings.channel = newSettings.channel;
  settings.mode = newSettings.mode;

  settings.deviceID = newSettings.deviceID;
  settings.cuelist = newSettings.cuelist;

  saveDataFile();
  applySettings();
};

var updateDarkModeSetting = function (enabled) {
  settings.darkMode = enabled;

  saveDataFile();
  applySettings();
};

/* ================================================= */
/*  OLD ROUTES                                       */
/* ================================================= */

/*server.get(['/'+WEBAUTH_SECRET, '/web'], function (req, res, next) {
  // Get the latest MIDI port lists
  var portLists = updatePortLists();

  // Match the port name to the current port ID
  var inList = [];
  portLists.inputPortList.forEach(function (name, id) {
    inList.push({
      id: id,
      name: name,
      selected: (id === settings.inputPortID)
    });
  });

  // Match the port name to the current port ID
  var outList = [];
  portLists.outputPortList.forEach(function (name, id) {
    outList.push({
      id: id,
      name: name,
      selected: (id === settings.outputPortID)
    });
  });

  // Mode array for HTML select element
  var modes = [
    { id: 0, name: 'Simple', selected: (settings.mode === 0) }, // Cue # 1-127
    { id: 1, name: 'Advanced', selected: (settings.mode === 1) } // Cue # 1-999
  ];

  // Success / Error messages
  var success = false;
  var error = null;
  if (req.query.s == 1) success = true;

  var restartMsg = 'Sorry, try restarting MIDIsync.';
  if (req.query.e == 1) error = 'Invalid Input MIDI Port. ' + restartMsg;
  if (req.query.e == 2) error = 'Invalid Ouput MIDI Port. ' + restartMsg;
  if (req.query.e == 6) error = 'Invalid Mode. ' + restartMsg;
  if (req.query.e == 10) error = 'Invalid input. ' + restartMsg;

  if (req.query.e == 3) error = 'Channel must be between 1 and 16';
  if (req.query.e == 4) error = 'Device ID must be between 0 and 111';
  if (req.query.e == 5) error = 'Cuelist must be between 1 and 99999';

  // Secret ('web' if not Electron)
  var secret = req.path.replace('/', '');

  // Render main.html
  res.render('main', {
    darkMode: settings.darkMode,
    success,
    error,
    secret: secret,
    inputPorts: inList,
    outputPorts: outList,
    channel: settings.channel,
    modes: modes,
    deviceID: settings.deviceID,
    cuelist: settings.cuelist,
    modeSimple: (settings.mode === 0),
    modeAdvanced: (settings.mode === 1)
  });
});

server.post('/update-settings', function (req, res, next) {
  var urlPath = '/web';
  if (req.body.secret === WEBAUTH_SECRET) {
    urlPath = '/'+WEBAUTH_SECRET;
  }

  try {
    var inputPortID = parseInt(req.body.inputPortID);
    var outputPortID = parseInt(req.body.outputPortID);
    var channel = parseInt(req.body.channel);
    var mode = parseInt(req.body.mode);
    var deviceID = parseInt(req.body.deviceID);
    var cuelist = parseInt(req.body.cuelist);

    if (isNaN(inputPortID)) inputPortID = 0;
    if (isNaN(outputPortID)) outputPortID = 0;
    if (isNaN(channel)) channel = 1;
    if (isNaN(mode)) mode = 0;
    if (isNaN(deviceID)) deviceID = 0;
    if (isNaN(cuelist)) cuelist = 1;
  } catch(e) {
    return res.redirect(urlPath + '?e=10');
  }

  if (inputPortID < 0) return res.redirect(urlPath + '?e=1');
  if (outputPortID < 0) return res.redirect(urlPath + '?e=2');
  if (channel < 1 || channel > 16) return res.redirect(urlPath + '?e=3');
  if (mode < 0 || mode > 1) return res.redirect(urlPath + '?e=6');
  if (deviceID < 0 || deviceID > 111) return res.redirect(urlPath + '?e=4');
  if (cuelist < 1 || cuelist > 99999) return res.redirect(urlPath + '?e=5');

  updateSettings({
    inputPortID,
    outputPortID,
    channel,
    mode,
    deviceID,
    cuelist
  });

  res.redirect(urlPath + '?s=1');
});*/
