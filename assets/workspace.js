/* Conjunto PH · interfaz local. Los datos y las reglas pertenecen a PHStore. */
(function () {
  'use strict';

  var store = window.PHStore;
  var $ = function (id) { return document.getElementById(id); };
  var content = $('module-content');
  var VIEWS = {
    overview: { hash: 'resumen', title: 'Resumen', description: 'Un lugar para organizar el día a día de tu conjunto.' },
    properties: { hash: 'copropiedades', title: 'Copropiedades', description: 'Registra cada conjunto, su administración y el seguimiento de su licencia.' },
    units: { hash: 'viviendas', title: 'Viviendas y residentes', description: 'Cada vivienda, con su contacto principal y un formulario para actualizar sus datos.' },
    parcels: { hash: 'paqueteria', title: 'Paquetería', description: 'De la recepción a la entrega: mantén cada paquete bajo control.' },
    accesses: { hash: 'accesos', title: 'Accesos', description: 'Registra las entradas y salidas de visitantes de la copropiedad activa.' },
    expenses: { hash: 'gastos', title: 'Gastos', description: 'Consulta cuánto se ha pagado y qué valores siguen pendientes.' },
    maintenance: { hash: 'mantenimiento', title: 'Mantenimiento', description: 'Ordena las tareas, sus responsables y las fechas de seguimiento.' },
    assemblies: { hash: 'asambleas', title: 'Asambleas', description: 'Prepara una consulta y registra su conteo manual, vivienda por vivienda.' },
    backups: { hash: 'copias', title: 'Copias y solicitudes', description: 'Conserva tus registros y revisa las actualizaciones enviadas por residentes.' }
  };
  var ENTITY_LABELS = { properties: 'Copropiedades', units: 'Viviendas', parcels: 'Paquetes', accesses: 'Accesos', expenses: 'Gastos', maintenance: 'Mantenimientos', assemblies: 'Asambleas', votes: 'Votos registrados' };
  var STATES = {
    properties: { pending: ['Por revisar', 'amber'], approved: ['Aprobado · local', 'green'], suspended: ['Suspendido · local', 'red'] },
    parcels: { pending: ['Por entregar', 'amber'], delivered: ['Entregado', 'green'] },
    expenses: { pending: ['Pendiente', 'amber'], paid: ['Pagado', 'green'] },
    maintenance: { pending: ['Pendiente', 'amber'], in_progress: ['En proceso', 'blue'], done: ['Terminado', 'green'] },
    assemblies: { draft: ['Borrador', 'muted'], open: ['Abierta', 'blue'], closed: ['Cerrada', 'green'] },
    accesses: { inside: ['En el conjunto', 'blue'], outside: ['Salida registrada', 'muted'] }
  };
  var ICONS = {
    plus: 'M12 5v14M5 12h14',
    building: 'M5 21V5l7-3 7 3v16M3 21h18M9 8h1m4 0h1M9 12h1m4 0h1M10 21v-5h4v5',
    home: 'm3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7',
    parcel: 'm3 7 9-4 9 4v11l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v11M7 5l10 4',
    access: 'M14 4h6v16h-6M3 12h12m-4-4 4 4-4 4',
    money: 'M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 5h6M9 12h6M9 16h2',
    tool: 'M14 5a5 5 0 0 0-6 6l-5 5a2.8 2.8 0 0 0 4 4l5-5a5 5 0 0 0 7-6l-4 3-3-3 2-4Z',
    vote: 'M3 10h18v11H3V10Zm4 0 5-7 5 7M9 15l2 2 4-4',
    download: 'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',
    upload: 'M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5',
    check: 'm5 12 4 4L19 6',
    search: 'M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
    message: 'M21 4H3v13h5l4 4 4-4h5V4ZM7 8h10M7 12h7',
    arrow: 'M5 12h14m-5-5 5 5-5 5'
  };
  var state = { view: 'overview', propertyId: '', search: '', filter: 'all', assemblyId: '', editor: null, confirm: null, activeDialog: null, dialogReturnFocus: null, backupPreview: null, requestPreview: null, renderEpoch: 0, toastTimer: null };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function icon(name, className) {
    var wrap = el('span', className || 'icon');
    wrap.setAttribute('aria-hidden', 'true');
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[name] || ICONS.building);
    svg.append(path); wrap.append(svg);
    return wrap;
  }
  function button(label, action, className, actionName) {
    var node = el('button', className || 'button', label);
    node.type = 'button';
    if (actionName) node.setAttribute('data-action', actionName);
    if (action) node.addEventListener('click', action);
    return node;
  }
  function link(label, href, className) { var a = el('a', className, label); a.href = href; return a; }
  function withIcon(node, name) { node.prepend(icon(name)); return node; }
  function norm(value) { return String(value || '').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function textValue(value, fallback) { return value === '' || value === null || value === undefined ? (fallback || 'Sin registrar') : String(value); }
  function nowLocal() {
    try {
      var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      var values = {}; parts.forEach(function (part) { values[part.type] = part.value; });
      return values.year + '-' + values.month + '-' + values.day + 'T' + values.hour + ':' + values.minute;
    } catch (_) { var date = new Date(Date.now() - 5 * 60 * 60 * 1000); return date.toISOString().slice(0, 16); }
  }
  function today() { return nowLocal().slice(0, 10); }
  function dateText(value, includeTime) {
    if (!value) return 'Sin fecha';
    var day = value.slice(0, 10).split('-');
    if (day.length !== 3) return value;
    var result = day[2] + '/' + day[1] + '/' + day[0];
    if (includeTime && value.length >= 16) result += ' · ' + value.slice(11, 16);
    return result;
  }
  function money(cents) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100); }
  function unitLabel(id) { var row = store.get('units', id); return row ? row.code : 'Vivienda no disponible'; }
  function property() { return state.propertyId ? store.get('properties', state.propertyId) : null; }
  function rows(type) { return store.list(type, state.propertyId); }
  function badge(type, value) { var item = STATES[type][value] || [value, 'muted']; return el('span', 'badge ' + item[1], item[0]); }
  function mainCell(main, detail) { var node = el('div'); node.append(el('span', 'main-cell', main)); if (detail) node.append(el('span', 'sub-cell', detail)); return node; }
  function showError(error) { $('notice-text').textContent = error && error.message ? error.message : String(error); $('notice').classList.add('error'); $('notice').hidden = false; $('notice').focus({ preventScroll: false }); }
  function clearError() { $('notice').hidden = true; $('notice-text').textContent = ''; }
  function announce(message) {
    $('toast').textContent = message; $('toast').hidden = false;
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () { $('toast').hidden = true; }, 5500);
  }
  function run(action) { clearError(); try { return action(); } catch (error) { showError(error); return null; } }
  function saveNotice(message) { renderAll(); announce(message); }
  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var anchor = link('', url); anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  function exportBackup() { run(function () { download('conjunto-ph-copia-' + today() + '.json', store.exportBackup()); announce('Copia descargada. Consérvala en una ubicación de confianza.'); }); }
  function exportCSV(type) { run(function () { download('conjunto-ph-' + type + '-' + today() + '.csv', store.exportCSV(type, type === 'properties' ? undefined : state.propertyId), 'text/csv;charset=utf-8'); announce('Archivo CSV descargado.'); }); }
  function emptyState(title, description, iconName, label, action, compact) {
    var panel = el('section', compact ? 'empty-state compact' : 'empty-state');
    panel.append(icon(iconName, 'empty-icon'), el('h2', '', title), el('p', '', description));
    if (label) panel.append(button(label, action, 'button', 'empty-action'));
    return panel;
  }
  function requireProperty() {
    if (property()) return true;
    content.append(emptyState('Primero, registra tu conjunto.', 'Cada vivienda, gasto y tarea quedará asociado a una copropiedad. Empieza con su nombre y los datos de administración.', 'building', 'Registrar una copropiedad', function () { openEditor('properties'); }));
    return false;
  }
  function closeMenu() { $('sidebar').classList.remove('is-open'); $('menu-toggle').setAttribute('aria-expanded', 'false'); }
  function navigate(view, updateHash) {
    if (!VIEWS[view]) return;
    state.view = view; state.search = ''; state.filter = 'all'; state.backupPreview = null; state.requestPreview = null;
    clearError(); closeMenu(); renderAll();
    if (updateHash !== false && window.history && window.history.replaceState) window.history.replaceState(null, '', '#' + VIEWS[view].hash);
    $('main').focus({ preventScroll: true });
  }
  function syncSelection() {
    var all = store.list('properties');
    if (!all.some(function (p) { return p.id === state.propertyId; })) state.propertyId = all.length ? all[0].id : '';
    $('property-select').replaceChildren();
    if (!all.length) { var empty = el('option', '', 'Todavía no hay conjuntos'); empty.value = ''; $('property-select').append(empty); }
    all.forEach(function (item) { var option = el('option', '', item.name); option.value = item.id; $('property-select').append(option); });
    $('property-select').value = state.propertyId;
    $('property-select').disabled = !all.length;
  }
  function renderStorageStatus() {
    var status = store.status();
    $('storage-notice').hidden = status.persistenceAvailable && !status.rejectedStoredData;
    $('storage-message').textContent = status.message;
  }
  function renderAll() {
    state.renderEpoch += 1;
    syncSelection(); renderStorageStatus();
    document.querySelectorAll('[data-view]').forEach(function (item) { var active = item.dataset.view === state.view; item.classList.toggle('active', active); if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current'); });
    $('view-title').textContent = VIEWS[state.view].title;
    $('view-description').textContent = VIEWS[state.view].description;
    $('view-eyebrow').textContent = state.view === 'properties' || state.view === 'backups' ? 'ADMINISTRACIÓN LOCAL' : 'PANEL DE GESTIÓN';
    content.replaceChildren();
    if (state.view === 'overview') renderOverview();
    else if (state.view === 'properties') renderProperties();
    else if (state.view === 'backups') renderBackups();
    else if (state.view === 'assemblies') renderAssemblies();
    else renderListModule(state.view);
  }

  function architecture() {
    var art = el('div', 'welcome-architecture'); art.setAttribute('aria-hidden', 'true');
    ['short', 'tall', ''].forEach(function (className, buildingIndex) { var building = el('div', 'building ' + className); for (var i = 0; i < (buildingIndex === 1 ? 10 : 6); i += 1) building.append(el('span', i % 3 === 0 ? 'lit' : '')); art.append(building); });
    art.append(el('span', 'architecture-label', 'TU COMUNIDAD, EN ORDEN'));
    return art;
  }
  function metric(label, value, note, iconName, isMoney) {
    var card = el('div', 'metric'); var top = el('div', 'metric-top'); top.append(el('span', 'metric-label', label), icon(iconName, 'metric-icon'));
    card.append(top, el('strong', 'metric-value' + (isMoney ? ' money' : ''), value), el('span', 'metric-note', note));
    return card;
  }
  function panelHeading(title, description, action) {
    var heading = el('div', 'panel-heading'); var text = el('div'); text.append(el('h2', '', title)); if (description) text.append(el('p', '', description)); heading.append(text); if (action) heading.append(action); return heading;
  }
  function quickAction(title, subtitle, iconName, action) {
    var node = button('', action, 'quick-action'); var text = el('span'); text.append(el('strong', '', title), el('small', '', subtitle)); node.append(icon(iconName), text, el('span', 'arrow', '→')); return node;
  }
  function renderOverview() {
    var current = property();
    if (!current) {
      var welcome = el('section', 'welcome-panel'); var message = el('div');
      message.append(el('p', 'eyebrow', 'TODO COMIENZA CON TU CONJUNTO'), el('h2', '', 'Menos pendientes. Más claridad.'), el('p', '', 'Reúne la información de tu copropiedad y construye una forma más sencilla de administrarla, paso a paso.'), withIcon(button('Registrar mi primer conjunto', function () { openEditor('properties'); }, 'button', 'first-property'), 'plus'));
      welcome.append(message, architecture()); content.append(welcome);
      var steps = el('div', 'start-steps');
      [
        ['01', 'Define tu conjunto', 'Guarda su nombre, ciudad y contacto de administración. Podrás añadir más copropiedades después.', 'Registrar conjunto', function () { openEditor('properties'); }],
        ['02', 'Conecta cada vivienda', 'Organiza los contactos y prepara el formulario para solicitar una actualización de sus datos.', 'Ver viviendas', function () { navigate('units'); }],
        ['03', 'Ordena la operación', 'Lleva los registros diarios y descarga copias para conservar tu trabajo.', 'Conocer las copias', function () { navigate('backups'); }]
      ].forEach(function (step) { var card = el('section', 'start-step'); card.append(el('span', 'step-number', step[0]), el('h3', '', step[1]), el('p', '', step[2]), button(step[3], step[4], 'text-button')); steps.append(card); });
      content.append(steps);
      var note = el('p', 'inline-note section-gap', 'Tu espacio comienza vacío. Los registros se guardan en este navegador y no se sincronizan entre dispositivos. '); note.append(link('Conoce cómo funciona esta versión.', 'servicios.html#alcance')); content.append(note);
      return;
    }
    var summary = store.summary(current.id);
    var strip = el('section', 'context-strip'); var info = el('div'); info.append(el('h2', '', current.name), el('p', '', [current.city || 'Ciudad sin registrar', current.adminName ? 'Administra: ' + current.adminName : 'Administrador por registrar'].join(' · ')));
    var status = el('div'); status.append(badge('properties', current.status), el('p', 'tiny-note', current.licenseEnd ? 'Licencia local hasta ' + dateText(current.licenseEnd) + (summary.licenseExpired ? ' · fecha vencida' : '') : 'Sin fecha de licencia registrada')); strip.append(info, status); content.append(strip);
    var metrics = el('div', 'metrics'); metrics.append(metric('Viviendas', summary.units, summary.residents + ' con contacto principal', 'home'), metric('Paquetes por entregar', summary.parcelsPending, 'En esta copropiedad', 'parcel'), metric('Visitantes dentro', summary.accessesInside, 'Entradas sin salida registrada', 'access'), metric('Gastos pendientes', money(summary.expensesPendingCents), 'Valores registrados en COP', 'money', true)); content.append(metrics);
    var grid = el('div', 'overview-grid'); var attention = el('section', 'panel'); attention.append(panelHeading('Lo que sigue', 'Pendientes de la copropiedad activa'));
    var pending = [];
    rows('parcels').filter(function (p) { return p.status === 'pending'; }).slice(0, 2).forEach(function (p) { pending.push({ title: 'Paquete para ' + unitLabel(p.unitId), detail: 'Recibido el ' + dateText(p.receivedAt) + (p.carrier ? ' · ' + p.carrier : ''), icon: 'parcel', view: 'parcels' }); });
    rows('maintenance').filter(function (m) { return m.status !== 'done'; }).sort(function (a, b) { return a.dueDate.localeCompare(b.dueDate); }).slice(0, 3).forEach(function (m) { pending.push({ title: m.title, detail: (m.dueDate < today() ? 'Fecha vencida: ' : 'Programado: ') + dateText(m.dueDate), icon: 'tool', view: 'maintenance' }); });
    if (!pending.length) { var mini = el('div', 'mini-empty'); mini.append(icon('check'), el('h3', '', 'Sin pendientes registrados'), el('p', '', 'Aquí aparecerán los paquetes por entregar y los mantenimientos pendientes.')); attention.append(mini); }
    else { var list = el('ul', 'activity-list'); pending.forEach(function (item) { var li = el('li', 'activity-item'); var text = el('div'); text.append(el('strong', '', item.title), el('p', '', item.detail)); li.append(icon(item.icon), text, button('Ver', function () { navigate(item.view); }, 'text-button')); list.append(li); }); attention.append(list); }
    var quick = el('section', 'panel'); quick.append(panelHeading('A un paso', 'Acciones para avanzar hoy')); var actions = el('div', 'quick-actions');
    actions.append(quickAction('Registrar una vivienda', 'Añade el contacto principal', 'home', function () { openEditor('units'); }), quickAction('Recibir un paquete', 'Asócialo con su vivienda', 'parcel', function () { if (!rows('units').length) navigate('parcels'); else openEditor('parcels'); }), quickAction('Registrar un gasto', 'Anota el concepto y su valor', 'money', function () { openEditor('expenses'); }), quickAction('Descargar una copia', 'Conserva todos tus registros', 'download', exportBackup)); quick.append(actions); grid.append(attention, quick); content.append(grid);
    var bottom = el('div', 'overview-grid section-gap'); var finance = el('section', 'panel'); finance.append(panelHeading('Vista de gastos', 'Suma de los registros de este conjunto', button('Ver gastos', function () { navigate('expenses'); }, 'text-button')));
    [['Total registrado', summary.expensesTotalCents], ['Pagado', summary.expensesPaidCents], ['Pendiente', summary.expensesPendingCents]].forEach(function (pair) { var line = el('div', 'summary-pair'); line.append(el('span', '', pair[0]), el('strong', '', money(pair[1]))); finance.append(line); });
    if (summary.expensesTotalCents > 0) { var track = el('div', 'finance-track'); track.setAttribute('aria-hidden', 'true'); var paid = el('span'); paid.style.width = (summary.expensesPaidCents / summary.expensesTotalCents * 100) + '%'; track.append(paid); finance.append(track); }
    finance.append(el('p', 'tiny-note', 'Registro operativo de gastos en COP. Los valores aparecen cuando los ingresas.'));
    var community = el('section', 'panel'); community.append(panelHeading('Tu comunidad, al día', 'Información útil para el próximo paso'));
    var pair1 = el('div', 'summary-pair'); pair1.append(el('span', '', 'Mantenimientos abiertos'), el('strong', '', summary.maintenancePending)); var pair2 = el('div', 'summary-pair'); pair2.append(el('span', '', 'Consultas abiertas'), el('strong', '', summary.assembliesOpen)); community.append(pair1, pair2, button('Revisar solicitudes de residentes', function () { navigate('backups'); }, 'button secondary small'), el('p', 'tiny-note section-gap', 'Las solicitudes se revisan antes de actualizar un contacto. El envío del archivo se realiza de forma manual.')); bottom.append(finance, community); content.append(bottom);
  }

  function toolbar(filters, onChange) {
    var bar = el('div', 'toolbar'); var search = el('div', 'search-box'); var searchId = 'record-search';
    var label = el('label', 'sr-only', 'Buscar en ' + VIEWS[state.view].title); label.setAttribute('for', searchId);
    var input = el('input'); input.id = searchId; input.type = 'search'; input.value = state.search; input.placeholder = 'Buscar en estos registros'; input.setAttribute('autocomplete', 'off');
    search.append(label, icon('search').firstElementChild, input); bar.append(search);
    input.addEventListener('input', function () { state.search = input.value; onChange(); });
    if (filters) { var filterLabel = el('label', 'sr-only', 'Filtrar por estado'); filterLabel.setAttribute('for', 'record-filter'); var select = el('select'); select.id = 'record-filter'; [['all', 'Todos los estados']].concat(filters).forEach(function (item) { var option = el('option', '', item[1]); option.value = item[0]; select.append(option); }); select.value = state.filter; select.addEventListener('change', function () { state.filter = select.value; onChange(); }); bar.append(filterLabel, select); }
    return bar;
  }
  function filtered(data, statusFunction) {
    var query = norm(state.search);
    return data.filter(function (record) { var text = Object.keys(record).filter(function (key) { return ['id', 'createdAt', 'updatedAt', 'propertyId'].indexOf(key) < 0; }).map(function (key) { return key === 'unitId' ? unitLabel(record[key]) : typeof record[key] === 'string' || typeof record[key] === 'number' ? String(record[key]) : ''; }).join(' '); return (!query || norm(text).includes(query)) && (state.filter === 'all' || statusFunction(record) === state.filter); });
  }
  function listFooter(shown, total) { var footer = el('div', 'table-footer'); footer.append(el('span', '', shown + ' de ' + total + ' registros'), el('span', '', state.view === 'properties' ? 'Copropiedades guardadas en este navegador' : 'Solo la copropiedad activa')); return footer; }
  function noResults() { return emptyState('No encontramos coincidencias.', 'Prueba con otro nombre, referencia o estado. Puedes limpiar la búsqueda para volver a ver todos los registros.', 'search', 'Limpiar filtros', function () { state.search = ''; state.filter = 'all'; renderAll(); }, true); }
  function moduleIntro(description, entity, label, disabled) {
    var intro = el('div', 'module-intro'); intro.append(el('p', '', description)); var actions = el('div', 'actions');
    var csv = withIcon(button('Exportar CSV', function () { exportCSV(entity); }, 'button secondary', 'export-csv'), 'download'); csv.disabled = !(entity === 'properties' ? store.list(entity) : rows(entity)).length;
    var create = withIcon(button(label, function () { openEditor(entity); }, 'button', 'create-' + entity), 'plus'); create.disabled = !!disabled;
    actions.append(csv, create); intro.append(actions); return intro;
  }
  function renderProperties() {
    var data = store.list('properties');
    content.append(moduleIntro('Puedes gestionar varios conjuntos. Selecciona uno para trabajar con sus viviendas y registros.', 'properties', 'Registrar conjunto'));
    var note = el('p', 'inline-note', 'Los estados y fechas de licencia son un registro administrativo local. Una aprobación aquí no activa una licencia remota ni crea permisos de acceso. '); note.append(link('Ver alcance.', 'servicios.html#alcance')); content.append(note);
    if (!data.length) { content.append(emptyState('El primer conjunto abre el camino.', 'Registra su nombre y el contacto de administración. Después podrás organizar viviendas, visitas y gastos en su propio espacio.', 'building', 'Registrar mi primer conjunto', function () { openEditor('properties'); })); return; }
    var counts = el('div', 'small-metrics'); [['pending', 'por revisar'], ['approved', 'aprobados localmente'], ['suspended', 'suspendidos localmente']].forEach(function (pair) { var item = el('div'); item.append(el('strong', '', data.filter(function (p) { return p.status === pair[0]; }).length), el('span', '', pair[1])); counts.append(item); }); content.append(counts);
    var shell = el('section', 'table-shell'); var results = el('div'); results.id = 'record-results';
    function update() {
      results.replaceChildren(); var visible = filtered(data, function (p) { return p.status; });
      if (!visible.length) results.append(noResults());
      else { var grid = el('div', 'property-grid'); visible.forEach(function (record) {
        var card = el('article', 'property-card' + (record.id === state.propertyId ? ' selected' : '')); card.setAttribute('data-record-id', record.id);
        var heading = el('div', 'property-card-heading'); var info = el('div'); info.append(el('h2', '', record.name), el('p', '', record.city || 'Ciudad sin registrar')); heading.append(el('span', 'property-monogram', record.name.slice(0, 1).toLocaleUpperCase('es')), info); card.append(heading, badge('properties', record.status));
        var facts = el('dl', 'property-facts'); [['Administración', record.adminName || 'Por registrar'], ['Correo', record.adminEmail || 'Por registrar'], ['Licencia local', record.licenseEnd ? dateText(record.licenseEnd) + (record.licenseEnd < today() ? ' · vencida' : '') : 'Sin fecha'], ['Viviendas', store.list('units', record.id).length]].forEach(function (pair) { var line = el('div'); line.append(el('dt', '', pair[0]), el('dd', '', pair[1])); facts.append(line); }); card.append(facts);
        var actions = el('div', 'property-card-actions');
        if (record.id === state.propertyId) actions.append(el('span', 'selected-label', 'Trabajando en este conjunto'));
        else actions.append(button('Seleccionar', function () { selectProperty(record.id); announce('Copropiedad activa: ' + record.name + '.'); }, 'button secondary small', 'select-property'));
        actions.append(button('Editar', function () { openEditor('properties', record.id); }, 'text-button', 'edit'), button('Eliminar', function () { deleteRecord('properties', record); }, 'text-button danger', 'delete')); card.append(actions); grid.append(card);
      }); results.append(grid); }
      results.append(listFooter(visible.length, data.length));
    }
    shell.append(toolbar([['pending', 'Por revisar'], ['approved', 'Aprobados · local'], ['suspended', 'Suspendidos · local']], update), results); content.append(shell); update();
  }

  var LISTS = {
    units: { icon: 'home', add: 'Registrar vivienda', intro: 'El código de vivienda debe ser único dentro de este conjunto. El contacto principal es opcional.', empty: 'Una vivienda, un punto de partida.', emptyText: 'Añade el código de cada casa o apartamento. Puedes registrar su contacto principal ahora o actualizarlo más adelante.', headers: ['Vivienda', 'Contacto principal', 'Coeficiente', 'Acciones'] },
    parcels: { icon: 'parcel', add: 'Recibir paquete', intro: 'Selecciona la vivienda de destino y registra la fecha de recepción. Al entregarlo, añade la fecha de entrega.', empty: 'La paquetería empieza en recepción.', emptyText: 'Registra un paquete para saber a qué vivienda pertenece y mantener visible su estado hasta la entrega.', headers: ['Vivienda', 'Paquete', 'Recibido', 'Estado', 'Acciones'], filters: [['pending', 'Por entregar'], ['delivered', 'Entregados']] },
    accesses: { icon: 'access', add: 'Registrar entrada', intro: 'Las fechas y horas se registran con referencia a Colombia. La salida queda pendiente hasta que la anotes.', empty: 'Cada visita, con su registro.', emptyText: 'Anota la vivienda, el visitante y la hora de entrada. Después podrás registrar su salida.', headers: ['Visitante', 'Vivienda', 'Entrada / salida', 'Estado', 'Acciones'], filters: [['inside', 'En el conjunto'], ['outside', 'Con salida registrada']] },
    expenses: { icon: 'money', add: 'Registrar gasto', intro: 'Anota los valores en pesos colombianos, sin separadores de miles. Puedes marcar cada gasto como pendiente o pagado.', empty: 'Pon los gastos en orden.', emptyText: 'Registra un concepto, su fecha y su valor. Los totales se calcularán con los gastos que guardes aquí.', headers: ['Concepto', 'Fecha', 'Valor · COP', 'Estado', 'Acciones'], filters: [['pending', 'Pendientes'], ['paid', 'Pagados']] },
    maintenance: { icon: 'tool', add: 'Programar tarea', intro: 'Una fecha clara y un estado actualizado ayudan a dar seguimiento a cada mantenimiento.', empty: 'Un conjunto que se cuida.', emptyText: 'Programa el primer mantenimiento, asigna un proveedor si ya lo tienes y revisa su avance desde aquí.', headers: ['Tarea', 'Responsable / proveedor', 'Fecha prevista', 'Estado', 'Acciones'], filters: [['pending', 'Pendientes'], ['in_progress', 'En proceso'], ['done', 'Terminados']] }
  };
  function createDataTable(type, headers, data, makeCells) {
    var scroll = el('div', 'table-scroll'); scroll.tabIndex = 0; scroll.setAttribute('aria-label', 'Tabla de ' + ENTITY_LABELS[type].toLocaleLowerCase('es') + '. En pantallas pequeñas puedes desplazarla horizontalmente.');
    var table = el('table', 'data-table'); table.setAttribute('data-entity', type); table.append(el('caption', '', ENTITY_LABELS[type] + ' de la copropiedad activa'));
    var thead = el('thead'); var headRow = el('tr'); headers.forEach(function (heading) { var th = el('th', '', heading); th.setAttribute('scope', 'col'); headRow.append(th); }); thead.append(headRow); table.append(thead);
    var body = el('tbody'); data.forEach(function (record) { var tr = el('tr'); tr.setAttribute('data-record-id', record.id); makeCells(record).forEach(function (value) { var td = el('td'); if (value && value.nodeType) td.append(value); else td.textContent = value === undefined || value === null ? '' : String(value); tr.append(td); }); body.append(tr); }); table.append(body); scroll.append(table); return scroll;
  }
  function rowActions(type, record, extra) {
    var actions = el('div', 'row-actions'); if (extra) extra.forEach(function (node) { actions.append(node); });
    actions.append(button('Editar', function () { openEditor(type, record.id); }, 'text-button', 'edit'), button('Eliminar', function () { deleteRecord(type, record); }, 'text-button danger', 'delete'));
    return actions;
  }
  function cellsFor(type, record) {
    if (type === 'units') {
      var contact = mainCell(record.name || 'Contacto pendiente', record.email || ''); if (record.phone) contact.append(el('span', 'sub-cell', record.phone));
      return [mainCell(record.code), contact, record.coefficient === null ? 'Sin registrar' : record.coefficient + ' %', rowActions(type, record, [button('Formulario', function () { openResidentLink(record); }, 'text-button', 'resident-form')])];
    }
    if (type === 'parcels') {
      var parcelState = el('div'); parcelState.append(badge(type, record.status)); if (record.deliveredAt) parcelState.append(el('span', 'sub-cell', dateText(record.deliveredAt)));
      var parcelActions = record.status === 'pending' ? [button('Entregar', function () { openEditor(type, record.id, { status: 'delivered', deliveredAt: today() }); }, 'text-button', 'deliver')] : [];
      return [mainCell(unitLabel(record.unitId)), mainCell(record.carrier || 'Sin transportadora', record.reference || 'Sin referencia'), dateText(record.receivedAt), parcelState, rowActions(type, record, parcelActions)];
    }
    if (type === 'accesses') {
      var accessActions = !record.exitedAt ? [button('Registrar salida', function () { openEditor(type, record.id, { exitedAt: nowLocal() }); }, 'text-button', 'exit')] : [];
      return [mainCell(record.visitor, record.reason), unitLabel(record.unitId), mainCell(dateText(record.enteredAt, true), record.exitedAt ? 'Salida: ' + dateText(record.exitedAt, true) : 'Salida pendiente'), badge(type, record.exitedAt ? 'outside' : 'inside'), rowActions(type, record, accessActions)];
    }
    if (type === 'expenses') { var amount = el('strong', 'numeric', money(record.amountCents)); return [mainCell(record.concept, record.category), dateText(record.date), amount, badge(type, record.status), rowActions(type, record)]; }
    var due = mainCell(dateText(record.dueDate)); if (record.status !== 'done' && record.dueDate < today()) due.append(el('span', 'sub-cell', 'Fecha vencida'));
    return [mainCell(record.title), record.provider || 'Por asignar', due, badge(type, record.status), rowActions(type, record)];
  }
  function renderListModule(type) {
    if (!requireProperty()) return;
    var config = LISTS[type]; var data = rows(type); var needsUnit = (type === 'parcels' || type === 'accesses') && !rows('units').length;
    content.append(moduleIntro(config.intro, type, config.add, needsUnit));
    if (type === 'expenses') {
      var summary = store.summary(state.propertyId); var metrics = el('div', 'small-metrics'); [['Total registrado', summary.expensesTotalCents], ['Pagado', summary.expensesPaidCents], ['Pendiente', summary.expensesPendingCents]].forEach(function (pair) { var item = el('div'); item.append(el('strong', '', money(pair[1])), el('span', '', pair[0])); metrics.append(item); }); content.append(metrics);
    }
    if (needsUnit) { content.append(emptyState('Antes, añade una vivienda.', 'Este registro necesita una vivienda de destino dentro del conjunto activo. Añádela y vuelve a este módulo para continuar.', 'home', 'Ir a viviendas', function () { navigate('units'); })); return; }
    if (!data.length) { content.append(emptyState(config.empty, config.emptyText, config.icon, config.add, function () { openEditor(type); })); return; }
    var shell = el('section', 'table-shell'); var results = el('div'); results.id = 'record-results';
    function update() { results.replaceChildren(); var visible = filtered(data, function (record) { return type === 'accesses' ? record.exitedAt ? 'outside' : 'inside' : record.status; }); if (visible.length) results.append(createDataTable(type, config.headers, visible.slice().reverse(), function (record) { return cellsFor(type, record); })); else results.append(noResults()); results.append(listFooter(visible.length, data.length)); }
    shell.append(toolbar(config.filters, update), results); content.append(shell); update();
    if (type === 'units') content.append(el('p', 'tiny-note section-gap', 'El coeficiente se conserva como dato informativo. El formulario de actualización es público y sus solicitudes requieren revisión manual.'));
  }

  var FIELD_SCHEMAS = {
    properties: [
      { name: 'name', label: 'Nombre de la copropiedad', required: true, max: 160, full: true, placeholder: 'Nombre del conjunto residencial' },
      { name: 'city', label: 'Ciudad', max: 120, placeholder: 'Ciudad o municipio' },
      { name: 'adminName', label: 'Nombre de quien administra', max: 160 },
      { name: 'adminEmail', label: 'Correo de administración', type: 'email', max: 254, full: true, help: 'Se usará como referencia de contacto en el formulario de residentes.' },
      { name: 'status', label: 'Estado del registro local', type: 'select', options: [['pending', 'Por revisar'], ['approved', 'Aprobado · registro local'], ['suspended', 'Suspendido · registro local']], value: 'pending' },
      { name: 'licenseEnd', label: 'Licencia local hasta', type: 'date', help: 'Fecha de seguimiento; no activa una licencia remota.' }
    ],
    units: [
      { name: 'code', label: 'Código de vivienda', required: true, max: 60, placeholder: 'Ej. Torre A · 201' },
      { name: 'coefficient', label: 'Coeficiente (%) · opcional', type: 'number', min: '0.000001', maxNumber: '100', step: '0.000001', help: 'Dato informativo, hasta seis decimales.' },
      { name: 'name', label: 'Nombre del contacto principal', max: 160, full: true },
      { name: 'email', label: 'Correo electrónico', type: 'email', max: 254 },
      { name: 'phone', label: 'Teléfono', type: 'tel', max: 40 }
    ],
    parcels: [
      { name: 'unitId', label: 'Vivienda de destino', type: 'unit', required: true, full: true },
      { name: 'carrier', label: 'Transportadora · opcional', max: 120 },
      { name: 'reference', label: 'Referencia · opcional', max: 160 },
      { name: 'receivedAt', label: 'Fecha de recepción', type: 'date', required: true, value: today },
      { name: 'status', label: 'Estado del paquete', type: 'select', options: [['pending', 'Por entregar'], ['delivered', 'Entregado']], value: 'pending' },
      { name: 'deliveredAt', label: 'Fecha de entrega', type: 'date', full: true }
    ],
    accesses: [
      { name: 'unitId', label: 'Vivienda de destino', type: 'unit', required: true },
      { name: 'visitor', label: 'Nombre del visitante', required: true, max: 160 },
      { name: 'reason', label: 'Motivo de la visita · opcional', type: 'textarea', max: 400, full: true },
      { name: 'enteredAt', label: 'Entrada · hora de Colombia', type: 'datetime-local', required: true, value: nowLocal },
      { name: 'exitedAt', label: 'Salida · hora de Colombia', type: 'datetime-local', help: 'Déjala vacía si la visita sigue dentro.' }
    ],
    expenses: [
      { name: 'concept', label: 'Concepto del gasto', required: true, max: 200, full: true },
      { name: 'date', label: 'Fecha', type: 'date', required: true, value: today },
      { name: 'category', label: 'Categoría', max: 100, placeholder: 'Ej. Servicios, limpieza, reparación' },
      { name: 'amount', label: 'Valor en pesos colombianos', type: 'number', required: true, min: '0.01', maxNumber: '1000000000', step: '0.01', help: 'Sin separadores de miles. Máximo dos decimales.' },
      { name: 'status', label: 'Estado del gasto', type: 'select', options: [['pending', 'Pendiente'], ['paid', 'Pagado']], value: 'pending' }
    ],
    maintenance: [
      { name: 'title', label: 'Tarea de mantenimiento', required: true, max: 200, full: true },
      { name: 'provider', label: 'Responsable o proveedor · opcional', max: 160, full: true },
      { name: 'dueDate', label: 'Fecha prevista', type: 'date', required: true, value: today },
      { name: 'status', label: 'Estado de la tarea', type: 'select', options: [['pending', 'Pendiente'], ['in_progress', 'En proceso'], ['done', 'Terminado']], value: 'pending' }
    ],
    assemblies: [
      { name: 'title', label: 'Nombre de la asamblea o consulta', required: true, max: 200, full: true },
      { name: 'date', label: 'Fecha prevista', type: 'date', required: true, value: today },
      { name: 'question', label: 'Pregunta a consultar', type: 'textarea', required: true, max: 500, full: true },
      { name: 'options', label: 'Opciones de respuesta', type: 'textarea', required: true, max: 965, full: true, help: 'Escribe una opción por línea. Incluye entre 2 y 6 opciones diferentes, de hasta 160 caracteres cada una.', placeholder: 'Una opción por línea' }
    ]
  };
  var SINGULAR = { properties: 'copropiedad', units: 'vivienda', parcels: 'paquete', accesses: 'acceso', expenses: 'gasto', maintenance: 'mantenimiento', assemblies: 'asamblea' };
  function addField(def, value, parent) {
    var field = el('div', 'field' + (def.full ? ' full' : '')); field.id = 'field-wrap-' + def.name;
    var label = el('label', '', def.label); var id = 'field-' + def.name; label.setAttribute('for', id); if (def.required) { var required = el('span', 'required-mark', '*'); required.setAttribute('aria-hidden', 'true'); label.append(required); }
    var input;
    if (def.type === 'select' || def.type === 'unit') {
      input = el('select'); var options = def.type === 'unit' ? [['', 'Selecciona una vivienda']].concat(rows('units').map(function (unit) { return [unit.id, unit.code]; })) : def.options;
      options.forEach(function (pair) { var option = el('option', '', pair[1]); option.value = pair[0]; input.append(option); });
    } else if (def.type === 'textarea') input = el('textarea');
    else { input = el('input'); input.type = def.type || 'text'; }
    input.id = id; input.name = def.name; input.value = value === null || value === undefined ? '' : String(value);
    if (def.required) input.required = true;
    if (def.max) input.maxLength = def.max;
    if (def.min) input.min = def.min;
    if (def.maxNumber) input.max = def.maxNumber;
    if (def.step) input.step = def.step;
    if (def.placeholder) input.placeholder = def.placeholder;
    if (def.type === 'date') { input.min = '1900-01-01'; input.max = '2200-12-31'; }
    if (def.type === 'datetime-local') { input.min = '1900-01-01T00:00'; input.max = '2200-12-31T23:59'; input.step = '60'; }
    if (def.name === 'amount' || def.name === 'coefficient') input.setAttribute('inputmode', 'decimal');
    if (state.editor && state.editor.id && def.name === 'unitId') input.disabled = true;
    field.append(label, input);
    if (def.help) { var help = el('p', 'field-help', def.help); help.id = id + '-help'; input.setAttribute('aria-describedby', help.id); field.append(help); }
    parent.append(field); return input;
  }
  function openDialog(id) {
    var dialog = $(id); state.dialogReturnFocus = document.activeElement; state.activeDialog = id;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else { dialog.setAttribute('open', ''); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.classList.add('fallback-open'); document.body.classList.add('modal-fallback-open'); }
    var focus = dialog.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled])') || dialog.querySelector('button'); if (focus) focus.focus();
  }
  function closeDialog(id) {
    var dialog = $(id);
    if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
    dialog.classList.remove('fallback-open'); document.body.classList.remove('modal-fallback-open');
    if (state.activeDialog === id) state.activeDialog = null;
    var previous = state.dialogReturnFocus; state.dialogReturnFocus = null;
    if (previous && previous.isConnected !== false && typeof previous.focus === 'function') previous.focus(); else $('main').focus({ preventScroll: true });
  }
  function syncParcelForm() {
    if (!state.editor || state.editor.type !== 'parcels') return;
    var delivered = $('field-status').value === 'delivered'; $('field-wrap-deliveredAt').hidden = !delivered; $('field-deliveredAt').required = delivered;
    if (delivered && !$('field-deliveredAt').value) $('field-deliveredAt').value = today();
  }
  function openEditor(type, id, preset) {
    run(function () {
      if (type !== 'properties' && !property()) throw new Error('Primero registra una copropiedad.');
      var record = id ? store.get(type, id) : null;
      if (id && !record) throw new Error('Este registro ya no existe.');
      if (record && type !== 'properties' && record.propertyId !== state.propertyId) throw new Error('El registro no pertenece a la copropiedad activa.');
      if (type === 'assemblies' && record && record.state !== 'draft') throw new Error('La pregunta y sus opciones se conservan desde que se abre la consulta.');
      state.editor = { type: type, id: id || '', propertyId: state.propertyId, record: record };
      $('editor-dialog').setAttribute('data-entity', type); $('editor-title').textContent = (id ? 'Editar ' : 'Registrar ') + SINGULAR[type]; $('editor-eyebrow').textContent = id ? 'ACTUALIZAR REGISTRO' : 'NUEVO REGISTRO';
      $('editor-description').textContent = type === 'properties' ? 'Los campos con * son obligatorios. El estado y la licencia se registran de forma local.' : type === 'assemblies' ? 'Se guardará como borrador. Revisa la pregunta y las opciones antes de abrir la consulta; después quedarán fijas.' : 'Copropiedad: ' + property().name + '. Los campos con * son obligatorios.';
      $('editor-submit').textContent = id ? 'Guardar cambios' : type === 'assemblies' ? 'Guardar borrador' : 'Guardar registro'; $('editor-error').hidden = true; $('editor-error').textContent = ''; $('editor-fields').replaceChildren();
      FIELD_SCHEMAS[type].forEach(function (def) { var value = record ? record[def.name] : typeof def.value === 'function' ? def.value() : def.value || ''; if (def.name === 'options' && record) value = record.options.map(function (option) { return option.label; }).join('\n'); if (preset && Object.prototype.hasOwnProperty.call(preset, def.name)) value = preset[def.name]; addField(def, value, $('editor-fields')); });
      if (type === 'parcels') { $('field-status').addEventListener('change', syncParcelForm); syncParcelForm(); }
      openDialog('editor-dialog');
    });
  }
  function submitEditor(event) {
    event.preventDefault();
    if (!state.editor || !$('editor-form').reportValidity()) return;
    $('editor-error').hidden = true;
    try {
      var edit = state.editor; var data = {};
      FIELD_SCHEMAS[edit.type].forEach(function (def) { data[def.name] = $('field-' + def.name).value; });
      if (edit.type !== 'properties') data.propertyId = edit.propertyId;
      if (edit.type === 'parcels' && data.status !== 'delivered') data.deliveredAt = '';
      if (edit.type === 'assemblies') {
        data.options = data.options.split(/\r?\n/).map(function (label) { return label.trim(); }).filter(Boolean).map(function (label) { var previous = edit.record && edit.record.options.find(function (item) { return item.label === label; }); return previous ? { id: previous.id, label: label } : label; });
        data.state = 'draft';
      }
      var saved = edit.id ? store.update(edit.type, edit.id, data) : store.create(edit.type, data);
      if (edit.type === 'properties' && !edit.id) state.propertyId = saved.id;
      if (edit.type === 'assemblies') state.assemblyId = saved.id;
      var label = edit.id ? 'Cambios guardados.' : 'Registro guardado.';
      state.search = ''; state.filter = 'all'; state.editor = null; closeDialog('editor-dialog'); saveNotice(label);
    } catch (error) { $('editor-error').textContent = error.message || String(error); $('editor-error').hidden = false; $('editor-error').focus(); }
  }
  function confirmAction(title, message, label, action, destructive) {
    state.confirm = action; $('confirm-title').textContent = title; $('confirm-message').textContent = message; $('confirm-submit').textContent = label || 'Confirmar'; $('confirm-submit').className = 'button' + (destructive ? ' danger' : ''); $('confirm-error').hidden = true; $('confirm-error').textContent = ''; openDialog('confirm-dialog');
  }
  function deleteRecord(type, record) {
    var label = record.name || record.code || record.title || record.concept || record.visitor || record.reference || SINGULAR[type];
    confirmAction('Eliminar ' + SINGULAR[type], 'Vas a eliminar «' + label + '». Esta acción no se puede deshacer desde el panel. Si el registro tiene datos asociados, primero tendrás que resolverlos.', 'Eliminar registro', function () { store.remove(type, record.id); if (state.assemblyId === record.id) state.assemblyId = ''; saveNotice('Registro eliminado.'); }, true);
  }
  function selectProperty(id) {
    if (!store.get('properties', id)) return;
    state.propertyId = id; state.search = ''; state.filter = 'all'; state.assemblyId = ''; state.requestPreview = null; state.backupPreview = null; clearError(); renderAll();
  }
  function base64url(value) { var bytes = new TextEncoder().encode(value); var binary = ''; bytes.forEach(function (byte) { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function openResidentLink(unit) {
    run(function () {
      var current = property(); if (!current || unit.propertyId !== current.id) throw new Error('La vivienda no pertenece a la copropiedad activa.');
      var context = { propertyId: current.id, unitId: unit.id, propertyName: current.name, unitCode: unit.code };
      if (current.adminEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(current.adminEmail)) context.adminEmail = current.adminEmail;
      var url = new URL('residentes.html', window.location.href); url.hash = 'datos-' + base64url(JSON.stringify(context));
      var published = url.protocol === 'https:' || url.protocol === 'http:';
      $('resident-title').textContent = 'Formulario · ' + unit.code;
      $('resident-link').value = url.href; $('open-resident-link').href = url.href; $('copy-resident-link').disabled = !published;
      $('resident-link-help').textContent = published ? 'El enlace contiene el conjunto y el código de vivienda. No incluye el nombre, correo ni teléfono del residente.' : 'Estás abriendo archivos locales. Publica la carpeta en Netlify y abre el panel desde su dirección web para copiar un enlace que otras personas puedan abrir. Aquí puedes revisar el formulario local.';
      $('open-resident-link').textContent = published ? 'Abrir formulario ↗' : 'Revisar formulario local ↗'; openDialog('resident-dialog');
    });
  }

  function assemblyTransition(record, next) {
    var opening = next === 'open';
    confirmAction(opening ? 'Abrir consulta' : 'Cerrar consulta', opening ? 'Al abrir «' + record.title + '», su pregunta y opciones quedarán fijas. Podrás registrar manualmente un voto por vivienda del conjunto.' : 'Al cerrar «' + record.title + '», ya no se admitirán registros de votos ni se podrá reabrir. El conteo quedará disponible para consulta.', opening ? 'Abrir consulta' : 'Cerrar consulta', function () { store.update('assemblies', record.id, { state: next }); state.assemblyId = record.id; saveNotice(opening ? 'Consulta abierta para registro manual.' : 'Consulta cerrada.'); });
  }
  function renderAssemblies() {
    if (!requireProperty()) return;
    content.append(moduleIntro('Crea primero un borrador. Cuando la pregunta esté lista, abre el registro manual de respuestas.', 'assemblies', 'Crear asamblea'));
    content.append(el('p', 'inline-note', 'Conteo manual interno: una respuesta por vivienda. Esta versión no autentica a los votantes, no recibe votos remotos ni certifica quórum o validez legal.'));
    var data = rows('assemblies');
    if (!data.length) { content.append(emptyState('Una pregunta clara, una mejor decisión.', 'Prepara la consulta con entre dos y seis opciones. Podrás revisar el borrador antes de abrir el registro manual de votos.', 'vote', 'Crear mi primera asamblea', function () { openEditor('assemblies'); })); return; }
    if (!data.some(function (a) { return a.id === state.assemblyId; })) state.assemblyId = data[data.length - 1].id;
    var shell = el('section', 'table-shell'); var results = el('div'); results.id = 'record-results';
    function update() {
      results.replaceChildren(); var visible = filtered(data, function (record) { return record.state; });
      if (visible.length) results.append(createDataTable('assemblies', ['Asamblea / consulta', 'Fecha', 'Estado', 'Acciones'], visible.slice().reverse(), function (record) {
        var actions = el('div', 'row-actions'); actions.append(button(state.assemblyId === record.id ? 'Viendo conteo' : 'Ver conteo', function () { state.assemblyId = record.id; renderAll(); var detail = $('assembly-detail'); if (detail) detail.focus({ preventScroll: false }); }, 'text-button', 'assembly-detail'));
        if (record.state === 'draft') actions.append(button('Editar', function () { openEditor('assemblies', record.id); }, 'text-button', 'edit'), button('Abrir', function () { assemblyTransition(record, 'open'); }, 'text-button', 'assembly-open'));
        if (record.state === 'open') actions.append(button('Cerrar', function () { assemblyTransition(record, 'closed'); }, 'text-button', 'assembly-close'));
        actions.append(button('Eliminar', function () { deleteRecord('assemblies', record); }, 'text-button danger', 'delete'));
        return [mainCell(record.title, record.options.length + ' opciones de respuesta'), dateText(record.date), badge('assemblies', record.state), actions];
      })); else results.append(noResults()); results.append(listFooter(visible.length, data.length));
    }
    shell.append(toolbar([['draft', 'Borradores'], ['open', 'Abiertas'], ['closed', 'Cerradas']], update), results); content.append(shell); update();
    renderAssemblyDetail(store.get('assemblies', state.assemblyId));
  }
  function renderAssemblyDetail(assembly) {
    var result = store.getAssemblyResults(assembly.id); var section = el('section', 'assembly-detail'); section.id = 'assembly-detail'; section.tabIndex = -1;
    var heading = el('div', 'panel-heading'); var title = el('div'); title.append(el('p', 'eyebrow', 'CONSULTA SELECCIONADA'), el('h2', '', assembly.title)); heading.append(title, button('Exportar votos del conjunto', function () { exportCSV('votes'); }, 'button secondary small', 'export-votes')); section.append(heading);
    var grid = el('div', 'assembly-grid'); var detail = el('div', 'panel'); var context = el('div', 'assembly-context'); context.append(badge('assemblies', assembly.state), el('span', '', dateText(assembly.date)), el('span', '', 'Conteo manual interno')); detail.append(context, el('h3', 'assembly-question', assembly.question));
    var votes = el('div', 'vote-list'); result.options.forEach(function (option) { var item = el('div'); var label = el('div', 'vote-result-label'); label.append(el('span', '', option.label), el('strong', '', option.count + (option.count === 1 ? ' voto' : ' votos'))); var track = el('div', 'vote-bar'); track.setAttribute('aria-hidden', 'true'); var fill = el('span'); fill.style.width = (result.totalVotes ? option.count / result.totalVotes * 100 : 0) + '%'; track.append(fill); item.append(label, track); votes.append(item); }); detail.append(votes);
    var summary = el('div', 'vote-summary'); summary.append(el('strong', '', result.totalVotes), el('span', '', 'votos registrados · ' + result.eligibleUnits + ' viviendas en el conjunto')); detail.append(summary, el('p', 'tiny-note', 'Las barras muestran la distribución de los votos registrados. No representan un cálculo de quórum ni ponderación por coeficientes.'));
    var voting = el('section', 'panel'); voting.append(panelHeading('Registrar una respuesta', 'Anotación realizada por la administración'));
    var votedIds = new Set(rows('votes').filter(function (vote) { return vote.assemblyId === assembly.id; }).map(function (vote) { return vote.unitId; })); var available = rows('units').filter(function (unit) { return !votedIds.has(unit.id); });
    if (assembly.state !== 'open') voting.append(el('p', 'vote-closed', assembly.state === 'draft' ? 'La consulta sigue en borrador. Revisa sus opciones y ábrela desde la lista cuando esté lista para registrar respuestas.' : 'La consulta está cerrada. El conteo queda disponible para revisión y exportación.'));
    else if (!rows('units').length) voting.append(el('p', 'vote-closed', 'Primero registra las viviendas de este conjunto para poder anotar sus respuestas.'), button('Ir a viviendas', function () { navigate('units'); }, 'button secondary small'));
    else if (!available.length) voting.append(el('p', 'vote-closed', 'Todas las viviendas registradas tienen una respuesta en esta consulta. Puedes revisar el conteo o cerrar la consulta.'));
    else {
      var form = el('form', 'vote-form'); form.id = 'vote-form';
      var unitField = el('div', 'field'); var unitLabelNode = el('label', '', 'Vivienda'); unitLabelNode.setAttribute('for', 'vote-unit'); var unitSelect = el('select'); unitSelect.id = 'vote-unit'; unitSelect.name = 'unitId'; unitSelect.required = true;
      [['', 'Selecciona la vivienda']].concat(available.map(function (unit) { return [unit.id, unit.code]; })).forEach(function (pair) { var option = el('option', '', pair[1]); option.value = pair[0]; unitSelect.append(option); }); unitField.append(unitLabelNode, unitSelect);
      var optionField = el('div', 'field'); var optionLabel = el('label', '', 'Respuesta a registrar'); optionLabel.setAttribute('for', 'vote-option'); var optionSelect = el('select'); optionSelect.id = 'vote-option'; optionSelect.name = 'optionId'; optionSelect.required = true;
      [['', 'Selecciona una respuesta']].concat(assembly.options.map(function (option) { return [option.id, option.label]; })).forEach(function (pair) { var option = el('option', '', pair[1]); option.value = pair[0]; optionSelect.append(option); }); optionField.append(optionLabel, optionSelect);
      var submit = el('button', 'button', 'Revisar y registrar voto'); submit.type = 'submit'; form.append(unitField, optionField, el('p', 'tiny-note', 'Confirma la respuesta con la persona correspondiente. Una vez registrada, no se podrá editar ni eliminar.'), submit);
      form.addEventListener('submit', function (event) {
        event.preventDefault(); if (!form.reportValidity()) return;
        var option = assembly.options.find(function (item) { return item.id === optionSelect.value; }); var unit = store.get('units', unitSelect.value);
        if (!option || !unit || unit.propertyId !== state.propertyId) { showError(new Error('Selecciona una vivienda y una respuesta válidas.')); return; }
        var voteInput = { assemblyId: assembly.id, unitId: unit.id, optionId: option.id };
        confirmAction('Confirmar respuesta manual', 'Vivienda «' + unit.code + '». Respuesta: «' + option.label + '». Se registrará una única respuesta para esta vivienda y no se podrá editar ni eliminar.', 'Registrar voto', function () { store.castVote(voteInput); saveNotice('Respuesta registrada en el conteo interno.'); });
      }); voting.append(form);
    }
    grid.append(detail, voting); section.append(grid); content.append(section);
  }

  function fileField(id, labelText, helpText) {
    var field = el('div', 'field'); var label = el('label', '', labelText); label.setAttribute('for', id); var input = el('input'); input.type = 'file'; input.id = id; input.accept = '.json,application/json'; var help = el('p', 'field-help', helpText); help.id = id + '-help'; input.setAttribute('aria-describedby', help.id); field.append(label, input, help); return field;
  }
  async function readJSONFile(id, maximum) {
    var input = $(id); var file = input && input.files && input.files[0];
    if (!file) throw new Error('Selecciona primero un archivo JSON.');
    if (file.size > maximum) throw new Error('El archivo supera el tamaño permitido de ' + (maximum >= 1024 * 1024 ? maximum / 1024 / 1024 + ' MB.' : maximum / 1024 + ' KB.'));
    var text = await file.text();
    if (text.length > maximum) throw new Error('El archivo es demasiado grande.');
    return { text: text, filename: file.name };
  }
  async function previewBackupFile() {
    clearError(); var epoch = state.renderEpoch;
    try { var file = await readJSONFile('backup-file', 5 * 1024 * 1024); if (epoch !== state.renderEpoch || state.view !== 'backups') return; var preview = store.previewBackup(file.text); state.backupPreview = { text: file.text, filename: file.filename, preview: preview }; state.requestPreview = null; renderAll(); announce('Copia revisada. Comprueba el contenido antes de restaurarla.'); }
    catch (error) { if (epoch === state.renderEpoch) showError(error); }
  }
  async function previewRequestFile() {
    clearError(); var epoch = state.renderEpoch; var propertyId = state.propertyId;
    try {
      if (!property()) throw new Error('Selecciona o registra la copropiedad antes de revisar una solicitud.');
      var file = await readJSONFile('request-file', 32 * 1024); if (epoch !== state.renderEpoch || state.view !== 'backups') return;
      var preview = store.previewResidentUpdate(file.text);
      if (preview.property.id !== propertyId) throw new Error('Esta solicitud no pertenece a la copropiedad activa. Selecciona el conjunto correspondiente y vuelve a revisar el archivo.');
      state.requestPreview = { text: file.text, filename: file.filename, preview: preview }; state.backupPreview = null; renderAll(); announce('Solicitud lista para revisión. Verifica la identidad del remitente antes de aplicarla.');
    } catch (error) { if (epoch === state.renderEpoch) showError(error); }
  }
  function renderBackups() {
    var grid = el('div', 'backup-grid'); var snapshot = store.snapshot();
    var exportCard = el('section', 'panel backup-card'); exportCard.append(icon('download', 'panel-icon'), el('h2', '', 'Una copia de tu trabajo'), el('p', '', 'Descarga un archivo JSON con todas las copropiedades y sus registros. Consérvalo antes de cambiar de equipo, limpiar el navegador o restaurar una copia.'), withIcon(button('Descargar copia completa', exportBackup, 'button', 'export-backup'), 'download'));
    var stats = el('div', 'backup-stats'); [['properties', 'copropiedades'], ['units', 'viviendas'], ['votes', 'votos']].forEach(function (pair) { var span = el('span'); span.append(el('strong', '', snapshot[pair[0]].length + ' '), el('span', '', pair[1])); stats.append(span); }); exportCard.append(stats, el('p', 'tiny-note', 'Incluye los datos de contacto que hayas guardado. Conserva el archivo y compártelo solo con quien corresponda.'));
    var importCard = el('section', 'panel backup-card'); importCard.append(icon('upload', 'panel-icon'), el('h2', '', 'Restaurar una copia'), el('p', '', 'Primero revisaremos el archivo. Si confirmas la restauración, su contenido sustituirá todos los registros actuales de este navegador.'), fileField('backup-file', 'Archivo de copia · JSON', 'Solo copias exportadas desde Conjunto PH. Tamaño máximo: 5 MB.'), button('Revisar copia', previewBackupFile, 'button secondary', 'preview-backup'));
    if (state.backupPreview) renderBackupPreview(importCard);
    var requestCard = el('section', 'panel backup-card wide'); requestCard.append(icon('message', 'panel-icon'), el('h2', '', 'Solicitudes de residentes'), el('p', '', 'Importa el archivo que el residente descargó desde su formulario. Revisa el conjunto, la vivienda y los cambios, y confirma su identidad antes de actualizar el contacto.'));
    var current = property(); requestCard.append(el('p', 'inline-note', current ? 'Copropiedad activa: ' + current.name + '. Solo se revisarán solicitudes de este conjunto.' : 'Registra primero una copropiedad y sus viviendas para poder revisar solicitudes.'));
    requestCard.append(fileField('request-file', 'Solicitud de actualización · JSON', 'Selecciona una solicitud descargada desde el formulario de residentes. Tamaño máximo: 32 KB.'));
    var review = button('Revisar solicitud', previewRequestFile, 'button secondary', 'preview-request'); review.disabled = !current; requestCard.append(review);
    if (state.requestPreview) renderRequestPreview(requestCard);
    grid.append(exportCard, importCard, requestCard); content.append(grid);
    var note = el('p', 'tiny-note section-gap', 'Las copias y solicitudes se intercambian como archivos. No hay sincronización automática entre navegadores ni conexión a un servidor de usuarios. '); note.append(link('Consulta el alcance y la siguiente etapa del proyecto.', 'servicios.html#alcance')); content.append(note);
  }
  function renderBackupPreview(parent) {
    var saved = state.backupPreview; var preview = el('div', 'import-preview'); preview.id = 'backup-preview'; preview.append(el('h3', '', 'Contenido de la copia'), el('p', '', saved.filename), el('p', '', 'Exportada el ' + dateText(saved.preview.exportedAt, true) + ' UTC'));
    var counts = el('div', 'preview-counts'); Object.keys(ENTITY_LABELS).forEach(function (type) { var item = el('div'); item.append(el('span', '', ENTITY_LABELS[type]), el('strong', '', saved.preview.counts[type] || 0)); counts.append(item); }); preview.append(counts, el('p', '', 'La restauración reemplaza también los conjuntos que no estén incluidos en este archivo. Descarga una copia actual si necesitas conservarlos.'));
    preview.append(button('Restaurar esta copia', function () {
      confirmAction('Reemplazar los registros actuales', 'Se restaurará «' + saved.filename + '» con ' + saved.preview.total + ' registros. Todas las copropiedades y datos actuales se sustituirán por esta copia. Comprueba que has conservado una copia actual si la necesitas.', 'Restaurar y reemplazar', function () { store.importBackup(saved.text); state.propertyId = ''; state.assemblyId = ''; state.backupPreview = null; state.requestPreview = null; saveNotice('Copia restaurada. Revisa la copropiedad activa antes de continuar.'); }, true);
    }, 'button', 'restore-backup'));
    parent.append(preview);
  }
  function renderRequestPreview(parent) {
    var saved = state.requestPreview; var data = saved.preview; var preview = el('div', 'import-preview'); preview.id = 'request-preview';
    preview.append(el('h3', '', data.property.name + ' · ' + data.unit.code), el('p', '', 'Solicitud: ' + saved.filename), el('p', '', 'Fecha indicada por el remitente: ' + dateText(data.submittedAt, true) + ' UTC'));
    var scroll = el('div', 'resident-preview-scroll'); var table = el('table', 'comparison'); var head = el('thead'); var headRow = el('tr'); ['Campo', 'Registro actual', 'Solicitud recibida'].forEach(function (label) { var th = el('th', '', label); th.setAttribute('scope', 'col'); headRow.append(th); }); head.append(headRow); table.append(head); var body = el('tbody');
    [['name', 'Nombre'], ['email', 'Correo'], ['phone', 'Teléfono']].forEach(function (pair) { var tr = el('tr'); var label = el('th', '', pair[1]); label.setAttribute('scope', 'row'); tr.append(label, el('td', '', textValue(data.unit[pair[0]], 'Vacío')), el('td', '', textValue(data.changes[pair[0]], 'Vacío · se borrará el dato actual'))); body.append(tr); }); table.append(body); scroll.append(table); preview.append(scroll);
    var approval = el('label', 'check-label'); var checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.id = 'request-verified'; approval.append(checkbox, el('span', '', 'He verificado la identidad del remitente y revisado los datos. Entiendo que los campos vacíos reemplazarán los valores anteriores.')); preview.append(approval);
    var apply = button('Aplicar actualización', function () {
      if (!checkbox.checked) { showError(new Error('Confirma que verificaste la identidad del remitente y revisaste sus datos.')); checkbox.focus(); return; }
      if (state.propertyId !== data.property.id) { showError(new Error('La copropiedad activa cambió. Vuelve a revisar la solicitud.')); return; }
      confirmAction('Actualizar contacto de la vivienda', 'Se reemplazarán el nombre, correo y teléfono del contacto principal de «' + data.unit.code + '» en «' + data.property.name + '» con los datos revisados. La solicitud no verifica por sí misma la identidad de la persona.', 'Confirmar actualización', function () { store.applyResidentUpdate(saved.text); state.requestPreview = null; saveNotice('Contacto actualizado. Esta solicitud queda marcada como aplicada.'); });
    }, 'button', 'apply-request'); apply.disabled = true; checkbox.addEventListener('change', function () { apply.disabled = !checkbox.checked; }); preview.append(apply); parent.append(preview);
  }

  if (!store) { content.replaceChildren(emptyState('No pudimos iniciar el panel.', 'Comprueba que la carpeta contiene assets/store.js y assets/workspace.js. Conserva todos los archivos juntos al publicar el sitio.', 'tool')); $('property-select').disabled = true; return; }
  document.querySelectorAll('[data-view]').forEach(function (item) { item.addEventListener('click', function () { navigate(item.dataset.view); }); });
  $('property-select').addEventListener('change', function () { selectProperty($('property-select').value); });
  $('menu-toggle').addEventListener('click', function () { var open = !$('sidebar').classList.contains('is-open'); $('sidebar').classList.toggle('is-open', open); $('menu-toggle').setAttribute('aria-expanded', String(open)); if (open) $('menu-close').focus(); });
  $('menu-close').addEventListener('click', function () { closeMenu(); $('menu-toggle').focus(); });
  $('notice-close').addEventListener('click', clearError); $('storage-backup').addEventListener('click', exportBackup);
  $('editor-form').addEventListener('submit', submitEditor);
  document.querySelectorAll('[data-close]').forEach(function (node) { node.addEventListener('click', function () { closeDialog(node.dataset.close); }); });
  ['editor-dialog', 'confirm-dialog', 'resident-dialog'].forEach(function (id) { $(id).addEventListener('cancel', function (event) { event.preventDefault(); closeDialog(id); }); });
  $('confirm-form').addEventListener('submit', function (event) { event.preventDefault(); if (!state.confirm) return; try { state.confirm(); state.confirm = null; closeDialog('confirm-dialog'); } catch (error) { $('confirm-error').textContent = error.message || String(error); $('confirm-error').hidden = false; $('confirm-error').focus(); } });
  $('copy-resident-link').addEventListener('click', async function () {
    if ($('copy-resident-link').disabled) return;
    var input = $('resident-link');
    try { if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('No clipboard'); await navigator.clipboard.writeText(input.value); $('resident-link-help').textContent = 'Enlace copiado. Puedes compartirlo para solicitar la actualización.'; }
    catch (_) { input.focus(); input.select(); $('resident-link-help').textContent = 'El enlace está seleccionado. Usa la opción Copiar de tu dispositivo o Ctrl/Cmd + C.'; }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      if (state.activeDialog) { event.preventDefault(); closeDialog(state.activeDialog); }
      else if ($('sidebar').classList.contains('is-open')) { closeMenu(); $('menu-toggle').focus(); }
    }
    if (event.key === 'Tab' && state.activeDialog) {
      var dialog = $(state.activeDialog); var focusable = Array.from(dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')).filter(function (node) { return !node.hidden && !node.closest('[hidden]'); });
      if (!focusable.length) return; var first = focusable[0]; var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener('hashchange', function () { var hash = window.location.hash.replace(/^#/, ''); var view = Object.keys(VIEWS).find(function (key) { return VIEWS[key].hash === hash; }); if (view) navigate(view, false); });
  var initialHash = window.location.hash.replace(/^#/, ''); var initialView = Object.keys(VIEWS).find(function (key) { return VIEWS[key].hash === initialHash; }); if (initialView) state.view = initialView;
  run(renderAll);
})();
