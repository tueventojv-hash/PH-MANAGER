(function () {
  'use strict';
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('is-open', !open);
    });
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) { toggle.setAttribute('aria-expanded', 'false'); nav.classList.remove('is-open'); }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        toggle.setAttribute('aria-expanded', 'false'); nav.classList.remove('is-open'); toggle.focus();
      }
    });
  }
  document.querySelectorAll('[data-config-link]').forEach(function (link) {
    const value = window.SITE_LINKS && window.SITE_LINKS[link.dataset.configLink];
    if (typeof value !== 'string' || !value.trim()) return;
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'https:' || url.username || url.password) return;
      link.href = url.href; link.rel = 'noopener noreferrer'; link.target = '_blank'; link.hidden = false;
    } catch (_) { /* El botón permanece oculto si la dirección no es válida. */ }
  });
  const form = document.getElementById('contact-form');
  if (!form) return;
  const result = document.getElementById('contact-result');
  const preview = document.getElementById('contact-preview');
  const mail = document.getElementById('contact-mail');
  const status = document.getElementById('contact-status');
  form.addEventListener('input', function () { result.hidden = true; mail.removeAttribute('href'); status.textContent = ''; });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const name = document.getElementById('contact-name').value.trim();
    const email = document.getElementById('contact-email').value.trim();
    const topic = document.getElementById('contact-topic').value;
    const message = document.getElementById('contact-message').value.trim();
    if (!name || message.length < 12 || /[\r\n]/.test(name + email)) {
      status.textContent = 'Revisa tu nombre y escribe una consulta de al menos 12 caracteres.'; return;
    }
    const body = 'Hola, Julio.\n\nMi nombre es ' + name + '.\nMi correo: ' + email + '\nMe interesa: ' + topic + '\n\n' + message + '\n\nMensaje preparado desde Conjunto PH.';
    preview.textContent = body;
    mail.href = 'mailto:tueventojv@gmail.com?subject=' + encodeURIComponent('Conjunto PH · ' + topic) + '&body=' + encodeURIComponent(body);
    result.hidden = false; status.textContent = 'Borrador preparado. Abre tu correo para revisarlo y enviarlo.';
  });
})();
