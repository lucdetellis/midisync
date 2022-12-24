/*
  MIDIsync
  Copyright 2022 Luc DeTellis
*/

window.addEventListener('load', function () {

  var urlWithoutQuery = (window.location.origin + window.location.pathname);

  //================

  $('channel').on('focus', selectInput);
  $('deviceID').on('focus', selectInput);
  $('cuelist').on('focus', selectInput);

  //================

  $('submit-btn').on('click', function () {
    $('update-settings').submit(); // NOTE: cannot disable buttons, .submit() sometimes fails
  });

  $('cancel-btn').on('click', function () {
    window.location.replace(urlWithoutQuery);
  });

  //================

  if ($('success') || $('error')) {
    $('message').style.visibility = 'visible';
  }

  setTimeout(function () {
    if ($('success')) {
      $('message').style.visibility = 'hidden';
      window.history.replaceState({}, document.title, urlWithoutQuery);
    }
  }, 2000);

  //================

});
