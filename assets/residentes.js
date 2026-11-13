(function () {
  'use strict';

  var MAX_CONTEXT_BYTES = 10 * 1024;
  var CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
  var EMAIL = /^[^\s@<>;,"()[\]\\]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
  var sequence = 0;

  function init() {
    var ids = ['portal-empty', 'portal-context', 'context-property', 'context-unit', 'resident-form', 'resident-name', 'resident-email', 'resident-phone', 'resident-consent', 'portal-status', 'request-ready', 'request-download', 'request-mail', 'request-summary'];
    var nodes = {};
    ids.forEach(function (id) { nodes[id] = document.getElementById(id); });
    if (ids.some(function (id) { return !nodes[id]; })) return;

    var form = nodes['resident-form'];
    var context = null;
    var prepared = null;
    var serialized = '';
    var filename = '';
    form.noValidate = true;
    nodes['resident-name'].maxLength = 160;
    nodes['resident-email'].maxLength = 254;
    nodes['resident-phone'].maxLength = 40;

    function status(message, state) {
      nodes['portal-status'].textContent = message;
      nodes['portal-status'].dataset.state = state || 'info';
    }

    function invalidate() {
      prepared = null;
      serialized = '';
      filename = '';
      nodes['request-ready'].hidden = true;
      nodes['request-download'].disabled = true;
      nodes['request-summary'].textContent = '';
      nodes['request-mail'].hidden = true;
      nodes['request-mail'].removeAttribute('href');
    }

    function cleanString(value, label, maximum, required) {
      if (typeof value !== 'string') throw new Error('El campo ' + label + ' del enlace no es válido. Solicita un enlace nuevo.');
      if (CONTROL_CHARACTERS.test(value)) throw new Error('El campo ' + label + ' contiene caracteres no permitidos.');
      var result = value.trim();
      if ((required && !result) || result.length > maximum) throw new Error('El campo ' + label + ' no tiene una longitud válida.');
      return result;
    }

    function parseContext() {
      var hash = window.location.hash || '';
      if (!hash) throw new Error('Solicita a tu administrador el enlace de tu vivienda para completar esta actualización.');
      if (hash.length >= MAX_CONTEXT_BYTES || hash.indexOf('#datos-') !== 0) throw new Error('Este enlace de actualización no es válido. Solicita uno nuevo a tu administrador.');
      var encoded = hash.slice(7);
      if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) throw new Error('El enlace está incompleto o contiene datos no válidos. Solicita uno nuevo.');
      var binary;
      var value;
      try {
        var base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
        base64 += '='.repeat((4 - base64.length % 4) % 4);
        binary = window.atob(base64);
        if (binary.length >= MAX_CONTEXT_BYTES) throw new Error('size');
        var bytes = Uint8Array.from(binary, function (character) { return character.charCodeAt(0); });
        value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      } catch (error) {
        throw new Error('No se pudo leer el enlace de actualización. Solicita a tu administrador un enlace nuevo.');
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('El enlace no contiene una vivienda válida.');
      var result = {
        propertyId: cleanString(value.propertyId, 'copropiedad', 160, true),
        unitId: cleanString(value.unitId, 'vivienda', 160, true),
        propertyName: cleanString(value.propertyName, 'nombre de copropiedad', 160, true),
        unitCode: cleanString(value.unitCode, 'código de vivienda', 160, true),
        adminEmail: cleanString(value.adminEmail === undefined ? '' : value.adminEmail, 'correo del administrador', 254, false)
      };
      if (result.adminEmail && !EMAIL.test(result.adminEmail)) throw new Error('El enlace contiene un correo de administrador no válido. Solicita un enlace corregido.');
      return result;
    }

    function loadContext() {
      invalidate();
      context = null;
      form.reset();
      clearErrors();
      nodes['portal-empty'].hidden = false;
      nodes['portal-context'].hidden = true;
      nodes['context-property'].textContent = '';
      nodes['context-unit'].textContent = '';
      try {
        context = parseContext();
        nodes['context-property'].textContent = context.propertyName;
        nodes['context-unit'].textContent = context.unitCode;
        nodes['portal-empty'].hidden = true;
        nodes['portal-context'].hidden = false;
        status('Comprueba tu copropiedad y vivienda antes de completar tus datos.');
      } catch (error) {
        status(error.message, 'error');
      }
    }

    function clearErrors() {
      ['resident-name', 'resident-email', 'resident-phone', 'resident-consent'].forEach(function (id) {
        nodes[id].removeAttribute('aria-invalid');
      });
    }

    function invalidField(id, message) {
      var error = new Error(message);
      error.field = nodes[id];
      throw error;
    }

    function field(id, label, maximum) {
      var raw = nodes[id].value;
      if (typeof raw !== 'string') invalidField(id, 'Revisa el campo ' + label + '.');
      if (CONTROL_CHARACTERS.test(raw)) invalidField(id, 'El campo ' + label + ' contiene caracteres no permitidos.');
      var value = raw.trim();
      if (value.length > maximum) invalidField(id, 'El campo ' + label + ' admite hasta ' + maximum + ' caracteres.');
      return value;
    }

    function requestId() {
      try {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
          var bytes = window.crypto.getRandomValues(new Uint8Array(16));
          return 'sol-' + Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
        }
      } catch (error) { /* El identificador local no es una credencial de acceso. */ }
      sequence += 1;
      return 'sol-' + Date.now().toString(36) + '-' + sequence.toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    }

    function download() {
      if (!prepared || !serialized) {
        status('Completa el formulario y prepara la solicitud antes de descargarla.', 'error');
        return false;
      }
      var objectUrl = '';
      var anchor = null;
      try {
        var blob = new Blob([serialized], { type: 'application/json;charset=utf-8' });
        objectUrl = window.URL.createObjectURL(blob);
        anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.hidden = true;
        document.body.appendChild(anchor);
        anchor.click();
        return true;
      } catch (error) {
        status('El archivo está preparado, pero no se pudo iniciar la descarga. Pulsa «Descargar de nuevo» para intentarlo otra vez.', 'error');
        return false;
      } finally {
        if (anchor) anchor.remove();
        if (objectUrl) window.setTimeout(function () { window.URL.revokeObjectURL(objectUrl); }, 1000);
      }
    }

    function prepareMail() {
      if (!context.adminEmail) return;
      var subject = 'Actualización de datos · vivienda ' + context.unitCode;
      var body = 'Hola,\n\nDeseo actualizar mis datos de la vivienda ' + context.unitCode + ', en ' + context.propertyName + '.\n\nArchivo que debo adjuntar antes de enviar: ' + filename + '.\n\nGracias.';
      nodes['request-mail'].href = 'mailto:' + encodeURIComponent(context.adminEmail) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      nodes['request-mail'].hidden = false;
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      invalidate();
      clearErrors();
      try {
        if (!context) throw new Error('Necesitas un enlace válido de tu vivienda antes de preparar una solicitud.');
        var name = field('resident-name', 'nombre', 160);
        var email = field('resident-email', 'correo', 254);
        var phone = field('resident-phone', 'teléfono', 40);
        if (!name) invalidField('resident-name', 'Escribe tu nombre para que el administrador pueda identificar la solicitud.');
        if (email && !EMAIL.test(email)) invalidField('resident-email', 'Escribe un correo válido, por ejemplo nombre@dominio.com.');
        if (!email && !phone) invalidField('resident-email', 'Incluye al menos un correo o un teléfono de contacto.');
        if (!nodes['resident-consent'].checked) invalidField('resident-consent', 'Confirma la autorización antes de preparar la solicitud.');
        nodes['resident-name'].value = name;
        nodes['resident-email'].value = email;
        nodes['resident-phone'].value = phone;
        prepared = {
          kind: 'conjunto-ph-resident-update',
          version: 1,
          requestId: requestId(),
          propertyId: context.propertyId,
          unitId: context.unitId,
          name: name,
          email: email,
          phone: phone,
          submittedAt: new Date().toISOString()
        };
        serialized = JSON.stringify(prepared, null, 2);
        filename = 'actualizacion-residente-' + prepared.submittedAt.slice(0, 10) + '-' + prepared.requestId + '.json';
        nodes['request-summary'].textContent = 'Copropiedad: ' + context.propertyName + '\nVivienda: ' + context.unitCode + '\nNombre: ' + name + '\nCorreo: ' + (email || 'No indicado') + '\nTeléfono: ' + (phone || 'No indicado');
        nodes['request-ready'].hidden = false;
        nodes['request-download'].disabled = false;
        prepareMail();
        if (download()) status('Archivo listo. Revisa tus descargas o pulsa «Descargar de nuevo». Para enviarlo, adjúntalo al correo de tu administrador.', 'success');
      } catch (error) {
        invalidate();
        status(error.message, 'error');
        if (error.field) {
          error.field.setAttribute('aria-invalid', 'true');
          error.field.focus();
        }
      }
    });

    function onEdit(event) {
      var hadRequest = Boolean(prepared);
      invalidate();
      if (event.target && typeof event.target.removeAttribute === 'function') event.target.removeAttribute('aria-invalid');
      if (hadRequest) status('Has cambiado los datos. Prepara de nuevo la solicitud para descargar la versión actualizada.');
    }
    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);
    form.addEventListener('reset', invalidate);
    nodes['request-download'].addEventListener('click', function (event) {
      event.preventDefault();
      if (download()) status('Archivo listo. Revisa las descargas de tu navegador.', 'success');
    });
    window.addEventListener('hashchange', loadContext);
    loadContext();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
