/*
  MIDIsync
  Copyright 2022 Luc DeTellis
*/

window.$ = function (id) { return document.getElementById(id); };

window.selectInput = function (element) {
  try {

    if (typeof element === 'string' && $(element) && $(element).nodeType === 1) {
      element = $(element);
    } else if (typeof this === 'object' && this.nodeType === 1) {
      element = this;
    }

    if (typeof element !== 'object' || element.nodeType !== 1) {
      console.error(element + ' is not an element');
      return false;
    }

    setTimeout(function() {
      element.focus();
      element.select();
      element.setSelectionRange(0, element.value.length);
    }, 0);

    return true;

  } catch(e) {
    return false;
  }
};
