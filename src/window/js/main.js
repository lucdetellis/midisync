/*
  MIDIsync
  Copyright 2022 Luc DeTellis
*/

/* ================================================= */
/*  CONSTANTS                                        */
/* ================================================= */

const MESSAGE_HIDE_DELAY = 2000;

const RESTART_MSG = 'Please try restarting MIDIsync';

const MESSAGES = {
  'settings-updated': 'Settings updated',

  'invalid-input-port': `Invalid Input MIDI Port<br>${RESTART_MSG}`,
  'invalid-output-port': `Invalid Ouput MIDI Port<br>${RESTART_MSG}`,
  'invalid-mode': `Invalid Mode<br>${RESTART_MSG}`,

  'channel-outofrange': 'Channel must be between 1 and 16',
  'deviceid-outofrange': 'Device ID must be between 0 and 111',
  'cuelist-outofrange': 'Cuelist must be between 1 and 99999',
};

/* ================================================= */
/*  MESSAGES                                         */
/* ================================================= */

let messageTimeout = null;

const forceHideMessage = function () {
  $('message').classList.remove('show');

  // Prevent any future messages from being hidden
  if (messageTimeout) clearTimeout(messageTimeout);
};

electronAPI.onShowMessage(function (event, type, message) {
  // message can be a message ID or HTML content itself
  let content = MESSAGES[message];
  if (!content) content = message;

  // Display the message
  $('message').innerHTML = content;
  $('message').className = `${type} show`;

  // Hide the message later
  if (messageTimeout) clearTimeout(messageTimeout);

  messageTimeout = setTimeout(() => {
    $('message').classList.remove('show');
  }, MESSAGE_HIDE_DELAY);
});

/* ================================================= */
/*  SETTINGS                                         */
/* ================================================= */

/* ======================== */
/*  DISPLAY SETTINGS        */
/* ======================== */

electronAPI.onDisplaySettings(function (event, settings, portLists) {
  // Match each input port ID to each input port name
  let inOptions = portLists.inputPortList.map((name, id) => ({
    id: id,
    name: name,
    selected: (id === settings.inputPortID)
  }));

  // Match each output port ID to each output port name
  let outOptions = portLists.outputPortList.map((name, id) => ({
    id: id,
    name: name,
    selected: (id === settings.outputPortID)
  }));

  // Render the input ports list
  $('inputPortID').innerHTML = '';

  inOptions.forEach(port => {
    let option = document.createElement('option');
    option.value = port.id;
    option.textContent = port.name;
    option.selected = port.selected;

    $('inputPortID').appendChild(option);
  });

  // Render the output ports list
  $('outputPortID').innerHTML = '';

  outOptions.forEach(port => {
    let option = document.createElement('option');
    option.value = port.id;
    option.textContent = port.name;
    option.selected = port.selected;

    $('outputPortID').appendChild(option);
  });

  // Render numerical inputs
  $('inputPortID').value = settings.inputPortID;
  $('outputPortID').value = settings.outputPortID;

  $('channel').value = settings.channel;
  $('mode').value = settings.mode;

  $('deviceID').value = settings.deviceID;
  $('cuelist').value = settings.cuelist;

  // Render channel in instructions
  let channelElements = document.getElementsByClassName('channel');

  for (let i = 0; i < channelElements.length; i++) {
    channelElements.textContent = settings.channel;
  }

  // Toggle which instruction is showing
  if (settings.mode === 1) {
    document.body.classList.remove('mode0');
    document.body.classList.add('mode1');
  } else {
    document.body.classList.remove('mode1');
    document.body.classList.add('mode0');
  }
});

/* ======================== */
/*  REQUEST SETTINGS        */
/* ======================== */

const requestSettings = function () {
  electronAPI.requestSettings();
};

/* ======================== */
/*  SEND SETTINGS           */
/* ======================== */

const sendSettings = function () {
  let inputPortID = parseInt($('inputPortID').value);
  let outputPortID = parseInt($('outputPortID').value);

  let channel = parseInt($('channel').value);
  let mode = parseInt($('mode').value);

  let deviceID = parseInt($('deviceID').value);
  let cuelist = parseInt($('cuelist').value);

  electronAPI.updateSettings({
    inputPortID,
    outputPortID,

    channel,
    mode,

    deviceID,
    cuelist
  });
};

/* ================================================= */
/*  INIT                                             */
/* ================================================= */

window.addEventListener('load', function () {

  // Add auto-select to inputs
  $('channel').addEventListener('focus', selectInput);
  $('deviceID').addEventListener('focus', selectInput);
  $('cuelist').addEventListener('focus', selectInput);

  // Listeners for settings buttons
  $('send-btn').addEventListener('click', sendSettings);
  $('cancel-btn').addEventListener('click', function () {
    requestSettings();
    forceHideMessage();
  });

  // Request the current settings
  requestSettings();

});
