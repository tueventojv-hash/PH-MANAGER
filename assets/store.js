/* Conjunto PH · almacén local, sin red ni autenticación · esquema 1. */
(function (root) {
  'use strict';

  var VERSION = 1;
  var STORAGE_KEY = 'ibero:julio:conjunto-ph:v1';
  var BACKUP_KIND = 'conjunto-ph-backup';
  var REQUEST_KIND = 'conjunto-ph-resident-update';
  var MAX_BYTES = 5 * 1024 * 1024;
  var MAX_RECORDS = 10000;
  var MAX_AMOUNT_CENTS = 100000000000;
  var ENTITIES = ['properties', 'units', 'parcels', 'accesses', 'expenses', 'maintenance', 'assemblies', 'votes'];
  var DATA_KEYS = ENTITIES.concat(['appliedResidentRequests']);
  var PREFIXES = { properties: 'prop', units: 'unit', parcels: 'pkg', accesses: 'access', expenses: 'expense', maintenance: 'maint', assemblies: 'assembly', votes: 'vote' };
  var FIELDS = {
    properties: ['name', 'city', 'adminName', 'adminEmail', 'status', 'licenseEnd'],
    units: ['propertyId', 'code', 'coefficient', 'name', 'email', 'phone'],
    parcels: ['propertyId', 'unitId', 'carrier', 'reference', 'receivedAt', 'deliveredAt', 'status'],
    accesses: ['propertyId', 'unitId', 'visitor', 'reason', 'enteredAt', 'exitedAt'],
    expenses: ['propertyId', 'date', 'concept', 'category', 'amount', 'amountCents', 'status'],
    maintenance: ['propertyId', 'title', 'provider', 'dueDate', 'status'],
    assemblies: ['propertyId', 'title', 'date', 'question', 'options', 'state'],
    votes: ['propertyId', 'assemblyId', 'unitId', 'optionId', 'recordedAt']
  };
  var COMMON_FIELDS = ['id', 'createdAt', 'updatedAt'];
  var sequence = 0;
  var storage = null;
  var persistent = false;
  var rejectedStoredData = false;
  var storageMessage = '';
  var state = emptyState();

  function fail(message) { throw new Error(message); }
  function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function plain(value) { return value !== null && Object.prototype.toString.call(value) === '[object Object]'; }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function emptyState() {
    var result = {};
    DATA_KEYS.forEach(function (key) { result[key] = []; });
    return result;
  }
  function entity(type) {
    if (ENTITIES.indexOf(type) < 0) fail('El tipo de registro no existe.');
    return type;
  }
  function row(context, type, id) {
    return context[type].find(function (item) { return item.id === id; }) || null;
  }
  function text(value, label, required, max) {
    if (value === undefined || value === null) value = '';
    if (typeof value !== 'string') fail(label + ': escribe un texto válido.');
    var result = value.trim();
    if (required && !result) fail(label + ': este campo es obligatorio.');
    if (result.length > (max || 160)) fail(label + ': el texto es demasiado largo.');
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) fail(label + ': contiene caracteres no válidos.');
    return result;
  }
  function identifier(value, label) {
    var result = text(value, label || 'Identificador', true, 100);
    if (!/^[A-Za-z0-9_-]+$/.test(result)) fail((label || 'Identificador') + ': formato no válido.');
    return result;
  }
  function choice(value, values, fallback, label) {
    var result = value === undefined || value === '' ? fallback : value;
    if (values.indexOf(result) < 0) fail(label + ': selecciona un estado válido.');
    return result;
  }
  function email(value, label) {
    var result = text(value, label || 'Correo electrónico', false, 254);
    if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail((label || 'Correo electrónico') + ': revisa el formato.');
    return result;
  }
  function date(value, label, optional) {
    if (optional && (value === '' || value === undefined || value === null)) return '';
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(label + ': usa una fecha válida (AAAA-MM-DD).');
    var parts = value.split('-').map(Number);
    var parsed = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (parts[0] < 1900 || parts[0] > 2200 || parsed.getUTCFullYear() !== parts[0] || parsed.getUTCMonth() + 1 !== parts[1] || parsed.getUTCDate() !== parts[2]) fail(label + ': la fecha no existe o está fuera del rango 1900–2200.');
    return value;
  }
  function datetime(value, label, optional) {
    if (optional && (value === '' || value === undefined || value === null)) return '';
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) fail(label + ': usa fecha y hora completas.');
    date(value.slice(0, 10), label, false);
    if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59) fail(label + ': la hora no es válida.');
    return value;
  }
  function timestamp(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) fail(label + ': el registro necesita una fecha ISO completa.');
    date(value.slice(0, 10), label, false);
    var parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) fail(label + ': la fecha y hora no son válidas.');
    return value;
  }
  function now() { return new Date().toISOString(); }
  function today() {
    try {
      var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      var values = {};
      parts.forEach(function (part) { values[part.type] = part.value; });
      return values.year + '-' + values.month + '-' + values.day;
    } catch (_) { return new Date().toISOString().slice(0, 10); }
  }
  function newId(prefix, context) {
    var result;
    do {
      sequence += 1;
      var suffix = root.crypto && typeof root.crypto.randomUUID === 'function'
        ? root.crypto.randomUUID()
        : Date.now().toString(36) + '-' + sequence.toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      result = prefix + '_' + suffix;
    } while (ENTITIES.some(function (type) { return row(context, type, result); }));
    return result;
  }
  function amountCents(value) {
    if (typeof value !== 'number' && typeof value !== 'string') fail('Valor del gasto: escribe un número mayor que cero.');
    if (typeof value === 'number' && !Number.isFinite(value)) fail('Valor del gasto: el número no es válido.');
    var raw = String(value).trim();
    if (!/^\d{1,10}(?:[.,]\d{1,2})?$/.test(raw)) fail('Valor del gasto: usa hasta dos decimales y no incluyas separadores de miles.');
    var parts = raw.replace(',', '.').split('.');
    var cents = Number(parts[0]) * 100 + Number(((parts[1] || '') + '00').slice(0, 2));
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_AMOUNT_CENTS) fail('Valor del gasto: debe estar entre $0,01 y $1.000.000.000 COP.');
    return cents;
  }
  function coefficient(value) {
    if (value === '' || value === undefined || value === null) return null;
    if (typeof value !== 'string' && typeof value !== 'number') fail('Coeficiente: escribe un número mayor que cero y hasta 100.');
    var raw = String(value).trim().replace(',', '.');
    if (!/^\d+(?:\.\d{1,6})?$/.test(raw)) fail('Coeficiente: usa un número con hasta seis decimales.');
    var result = Number(raw);
    if (!Number.isFinite(result) || result <= 0 || result > 100) fail('Coeficiente: debe ser mayor que cero y hasta 100.');
    return result;
  }
  function validateFields(type, input) {
    if (!plain(input)) fail('El registro debe ser un objeto.');
    Object.keys(input).forEach(function (key) {
      if (COMMON_FIELDS.concat(FIELDS[type]).indexOf(key) < 0) fail('Campo no reconocido en ' + type + ': ' + key + '.');
    });
  }
  function normalizedCode(code) { return code.replace(/\s+/g, ' ').toLocaleLowerCase('es'); }
  function propertyReference(input, context) {
    var id = identifier(input.propertyId, 'Copropiedad');
    if (!row(context, 'properties', id)) fail('La copropiedad indicada no existe.');
    return id;
  }
  function unitReference(input, context, propertyId) {
    var id = identifier(input.unitId, 'Vivienda');
    var unit = row(context, 'units', id);
    if (!unit || unit.propertyId !== propertyId) fail('La vivienda debe existir y pertenecer a esta copropiedad.');
    return id;
  }
  function metadata(type, input, context, mode, previous) {
    if (mode === 'restore') {
      var created = timestamp(input.createdAt, 'Fecha de creación');
      var updated = timestamp(input.updatedAt, 'Fecha de actualización');
      if (updated < created) fail('La actualización no puede ser anterior a la creación.');
      return { id: identifier(input.id), createdAt: created, updatedAt: updated };
    }
    var instant = now();
    if (previous) return { id: previous.id, createdAt: previous.createdAt, updatedAt: instant < previous.updatedAt ? previous.updatedAt : instant };
    return { id: newId(PREFIXES[type], context), createdAt: instant, updatedAt: instant };
  }
  function normalizeOptions(values, context, restoring) {
    if (!Array.isArray(values) || values.length < 2 || values.length > 6) fail('La votación necesita entre 2 y 6 opciones.');
    var labels = new Set();
    var ids = new Set();
    return values.map(function (value) {
      if (restoring && !plain(value)) fail('El respaldo debe conservar el identificador de cada opción.');
      var label = text(typeof value === 'string' ? value : value && value.label, 'Opción', true, 160);
      if (restoring && !value.id) fail('El respaldo no incluye el identificador de una opción.');
      var id = plain(value) && value.id ? identifier(value.id, 'Opción') : newId('option', context);
      if (plain(value)) Object.keys(value).forEach(function (key) { if (key !== 'id' && key !== 'label') fail('La opción contiene campos no reconocidos.'); });
      var match = label.toLocaleLowerCase('es').replace(/\s+/g, ' ');
      if (labels.has(match) || ids.has(id)) fail('Las opciones de la votación deben ser diferentes.');
      labels.add(match); ids.add(id);
      return { id: id, label: label };
    });
  }
  function normalize(type, input, context, mode, previous) {
    validateFields(type, input);
    var result = metadata(type, input, context, mode, previous);
    if (type !== 'properties' && type !== 'votes') result.propertyId = propertyReference(input, context);
    if (type === 'properties') {
      result.name = text(input.name, 'Nombre de la copropiedad', true, 160);
      result.city = text(input.city, 'Ciudad', false, 120);
      result.adminName = text(input.adminName, 'Administrador', false, 160);
      result.adminEmail = email(input.adminEmail, 'Correo del administrador');
      result.status = choice(input.status, ['pending', 'approved', 'suspended'], 'pending', 'Registro de la copropiedad');
      result.licenseEnd = date(input.licenseEnd, 'Vencimiento de licencia', true);
    } else if (type === 'units') {
      result.code = text(input.code, 'Código de vivienda', true, 60);
      if (context.units.some(function (unit) { return unit.id !== result.id && unit.propertyId === result.propertyId && normalizedCode(unit.code) === normalizedCode(result.code); })) fail('Ya existe una vivienda con ese código en esta copropiedad.');
      result.coefficient = coefficient(input.coefficient);
      result.name = text(input.name, 'Nombre del contacto', false, 160);
      result.email = email(input.email);
      result.phone = text(input.phone, 'Teléfono', false, 40);
    } else if (type === 'parcels') {
      result.unitId = unitReference(input, context, result.propertyId);
      result.carrier = text(input.carrier, 'Transportadora', false, 120);
      result.reference = text(input.reference, 'Referencia del paquete', false, 160);
      result.receivedAt = date(input.receivedAt, 'Fecha de recepción', false);
      result.status = choice(input.status, ['pending', 'delivered'], 'pending', 'Paquetería');
      result.deliveredAt = date(input.deliveredAt, 'Fecha de entrega', result.status !== 'delivered');
      if (result.status === 'pending' && result.deliveredAt) fail('Un paquete pendiente no puede tener fecha de entrega.');
      if (result.deliveredAt && result.deliveredAt < result.receivedAt) fail('La entrega no puede ser anterior a la recepción.');
    } else if (type === 'accesses') {
      result.unitId = unitReference(input, context, result.propertyId);
      result.visitor = text(input.visitor, 'Visitante', true, 160);
      result.reason = text(input.reason, 'Motivo de la visita', false, 400);
      result.enteredAt = datetime(input.enteredAt, 'Entrada', false);
      result.exitedAt = datetime(input.exitedAt, 'Salida', true);
      if (result.exitedAt && result.exitedAt < result.enteredAt) fail('La salida no puede ser anterior a la entrada.');
    } else if (type === 'expenses') {
      result.date = date(input.date, 'Fecha del gasto', false);
      result.concept = text(input.concept, 'Concepto del gasto', true, 200);
      result.category = text(input.category, 'Categoría del gasto', false, 100) || 'General';
      result.amountCents = amountCents(input.amount);
      result.amount = result.amountCents / 100;
      if (mode === 'restore' && (!Number.isSafeInteger(input.amountCents) || input.amountCents !== result.amountCents)) fail('El valor y los centavos del gasto no coinciden en el respaldo.');
      result.status = choice(input.status, ['pending', 'paid'], 'pending', 'Gasto');
    } else if (type === 'maintenance') {
      result.title = text(input.title, 'Mantenimiento', true, 200);
      result.provider = text(input.provider, 'Proveedor', false, 160);
      result.dueDate = date(input.dueDate, 'Fecha programada', false);
      result.status = choice(input.status, ['pending', 'in_progress', 'done'], 'pending', 'Mantenimiento');
    } else if (type === 'assemblies') {
      result.title = text(input.title, 'Asamblea', true, 200);
      result.date = date(input.date, 'Fecha de la asamblea', false);
      result.question = text(input.question, 'Pregunta de la votación', true, 600);
      result.options = normalizeOptions(input.options, context, mode === 'restore');
      result.state = choice(input.state, ['draft', 'open', 'closed'], 'draft', 'Asamblea');
      if (previous) {
        var transitions = { draft: ['draft', 'open', 'closed'], open: ['open', 'closed'], closed: ['closed'] };
        if (transitions[previous.state].indexOf(result.state) < 0) fail('Una asamblea abierta no vuelve a borrador y una cerrada no se reabre.');
        if (previous.state !== 'draft' && ['title', 'date', 'question', 'options'].some(function (key) { return JSON.stringify(result[key]) !== JSON.stringify(previous[key]); })) fail('La pregunta, las opciones y el contexto se conservan desde la apertura de la asamblea.');
      }
    } else if (type === 'votes') {
      result.assemblyId = identifier(input.assemblyId, 'Asamblea');
      var assembly = row(context, 'assemblies', result.assemblyId);
      if (!assembly) fail('La asamblea indicada no existe.');
      if (assembly.state === 'draft' || (mode !== 'restore' && assembly.state !== 'open')) fail('Solo puedes registrar votos en una asamblea abierta.');
      result.propertyId = assembly.propertyId;
      if (input.propertyId !== undefined && input.propertyId !== result.propertyId) fail('El voto no corresponde a esta copropiedad.');
      result.unitId = unitReference(input, context, result.propertyId);
      result.optionId = identifier(input.optionId, 'Opción elegida');
      if (!assembly.options.some(function (option) { return option.id === result.optionId; })) fail('La opción elegida no pertenece a esta votación.');
      if (context.votes.some(function (vote) { return vote.id !== result.id && vote.assemblyId === result.assemblyId && vote.unitId === result.unitId; })) fail('Esta vivienda ya tiene un voto registrado en la asamblea.');
      result.recordedAt = mode === 'restore' ? timestamp(input.recordedAt, 'Fecha del voto') : result.createdAt;
    }
    return result;
  }
  function countRecords(data) {
    return ENTITIES.reduce(function (total, type) { return total + data[type].length; }, 0);
  }
  function byteLength(value) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
    var bytes = 0;
    for (var index = 0; index < value.length; index += 1) {
      var code = value.charCodeAt(index);
      if (code < 128) bytes += 1;
      else if (code < 2048) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) { bytes += 4; index += 1; }
      else bytes += 3;
    }
    return bytes;
  }
  function parseInput(input, limit, label) {
    var serialized;
    try { serialized = typeof input === 'string' ? input.replace(/^\uFEFF/, '') : JSON.stringify(input); }
    catch (_) { fail(label + ': no se pudo leer el archivo JSON.'); }
    if (typeof serialized !== 'string' || serialized.length > limit || byteLength(serialized) > limit) fail(label + ': el archivo excede el tamaño permitido.');
    try { return JSON.parse(serialized); }
    catch (_) { fail(label + ': el archivo JSON está incompleto o no es válido.'); }
  }
  function validateBackup(input) {
    var envelope = parseInput(input, MAX_BYTES, 'Respaldo');
    if (!plain(envelope) || envelope.kind !== BACKUP_KIND || envelope.version !== VERSION) fail('El archivo no es un respaldo de Conjunto PH versión 1.');
    var exportedAt = timestamp(envelope.exportedAt, 'Fecha del respaldo');
    if (!plain(envelope.data)) fail('El respaldo no contiene un estado de datos válido.');
    Object.keys(envelope.data).forEach(function (key) { if (DATA_KEYS.indexOf(key) < 0) fail('El respaldo contiene una colección desconocida: ' + key + '.'); });
    DATA_KEYS.forEach(function (key) { if (!Array.isArray(envelope.data[key])) fail('Falta la colección ' + key + ' en el respaldo.'); });
    if (countRecords(envelope.data) > MAX_RECORDS || envelope.data.appliedResidentRequests.length > MAX_RECORDS) fail('El respaldo supera el límite de 10.000 registros o solicitudes.');
    var candidate = emptyState();
    var identifiers = new Set();
    ENTITIES.forEach(function (type) {
      envelope.data[type].forEach(function (inputRow) {
        var record = normalize(type, inputRow, candidate, 'restore');
        if (identifiers.has(record.id)) fail('El respaldo tiene identificadores de registro duplicados.');
        identifiers.add(record.id);
        candidate[type].push(record);
      });
    });
    var requests = new Set();
    envelope.data.appliedResidentRequests.forEach(function (id) {
      var normalized = identifier(id, 'Solicitud aplicada');
      if (requests.has(normalized)) fail('El respaldo tiene solicitudes aplicadas duplicadas.');
      requests.add(normalized); candidate.appliedResidentRequests.push(normalized);
    });
    return { data: candidate, exportedAt: exportedAt };
  }
  function envelopeFor(data) { return { kind: BACKUP_KIND, version: VERSION, exportedAt: now(), data: data }; }
  function persistenceFailure() {
    persistent = false;
    storageMessage = 'El navegador no permite guardar los cambios. Esta sesión continúa en memoria; descarga un respaldo antes de cerrar.';
  }
  function persist(data, recover) {
    if (rejectedStoredData && !recover) {
      persistent = false;
      return;
    }
    try {
      if (!storage) storage = root.localStorage;
      if (!storage || typeof storage.setItem !== 'function') throw new Error('Sin almacenamiento');
      storage.setItem(STORAGE_KEY, JSON.stringify(envelopeFor(data)));
      persistent = true;
      rejectedStoredData = false;
      storageMessage = 'Guardado local en este navegador. Descarga respaldos periódicos.';
    } catch (_) { persistenceFailure(); }
  }
  function commit(candidate, recover) {
    if (countRecords(candidate) > MAX_RECORDS) fail('Se alcanzó el límite de 10.000 registros. Exporta un respaldo y depura registros que ya no necesites.');
    var serialized = JSON.stringify(envelopeFor(candidate));
    if (byteLength(serialized) > MAX_BYTES) fail('Los datos superan el límite de 5 MB. Exporta un respaldo y reduce los registros antes de continuar.');
    state = candidate;
    persist(state, Boolean(recover));
  }
  function scoped(type, propertyId) {
    entity(type);
    if (propertyId === undefined) return state[type];
    if (propertyId === null || propertyId === '') return [];
    identifier(propertyId, 'Copropiedad');
    return state[type].filter(function (item) { return (type === 'properties' ? item.id : item.propertyId) === propertyId; });
  }
  function create(type, data) {
    entity(type);
    if (countRecords(state) >= MAX_RECORDS) fail('Se alcanzó el límite de 10.000 registros.');
    if (!plain(data)) fail('El registro debe ser un objeto.');
    if (COMMON_FIELDS.some(function (field) { return own(data, field); })) fail('Los identificadores y las fechas de registro los asigna Conjunto PH.');
    var candidate = copy(state);
    var result = normalize(type, data, candidate, 'create');
    candidate[type].push(result);
    commit(candidate);
    return copy(result);
  }
  function update(type, id, patch) {
    entity(type);
    identifier(id);
    if (type === 'votes') fail('Los votos registrados no se editan.');
    var previous = row(state, type, id);
    if (!previous) fail('El registro que deseas actualizar ya no existe.');
    if (!plain(patch)) fail('Los cambios deben ser un objeto.');
    validateFields(type, patch);
    ['id', 'createdAt', 'updatedAt', 'propertyId', 'unitId', 'assemblyId'].forEach(function (key) {
      if (own(patch, key) && patch[key] !== previous[key]) fail('No puedes cambiar la referencia o fecha protegida: ' + key + '.');
    });
    var candidate = copy(state);
    var merged = Object.assign({}, previous, patch);
    var result = normalize(type, merged, candidate, 'update', previous);
    candidate[type] = candidate[type].map(function (item) { return item.id === id ? result : item; });
    commit(candidate);
    return copy(result);
  }
  function remove(type, id) {
    entity(type);
    identifier(id);
    if (type === 'votes') fail('Los votos registrados no se eliminan.');
    if (!row(state, type, id)) fail('El registro que deseas eliminar ya no existe.');
    if (type === 'properties' && ENTITIES.some(function (other) { return other !== 'properties' && state[other].some(function (item) { return item.propertyId === id; }); })) fail('La copropiedad tiene registros asociados. Revísalos antes de eliminarla.');
    if (type === 'units' && ['parcels', 'accesses', 'votes'].some(function (other) { return state[other].some(function (item) { return item.unitId === id; }); })) fail('La vivienda tiene paquetería, accesos o votos asociados; no se puede eliminar.');
    if (type === 'assemblies' && state.votes.some(function (item) { return item.assemblyId === id; })) fail('La asamblea tiene votos registrados y no se puede eliminar.');
    var candidate = copy(state);
    candidate[type] = candidate[type].filter(function (item) { return item.id !== id; });
    commit(candidate);
    return true;
  }
  function backupPreview(validated) {
    var counts = {};
    ENTITIES.forEach(function (type) { counts[type] = validated.data[type].length; });
    counts.appliedResidentRequests = validated.data.appliedResidentRequests.length;
    return { counts: counts, total: countRecords(validated.data), exportedAt: validated.exportedAt };
  }
  function residentPreview(input) {
    var payload = parseInput(input, 32768, 'Solicitud del residente');
    if (!plain(payload) || payload.kind !== REQUEST_KIND || payload.version !== VERSION) fail('El archivo no es una solicitud de actualización de Conjunto PH versión 1.');
    var allowed = ['kind', 'version', 'requestId', 'propertyId', 'unitId', 'name', 'email', 'phone', 'submittedAt'];
    Object.keys(payload).forEach(function (key) { if (allowed.indexOf(key) < 0) fail('La solicitud contiene un campo no permitido: ' + key + '.'); });
    var requestId = identifier(payload.requestId, 'Solicitud');
    if (state.appliedResidentRequests.indexOf(requestId) >= 0) fail('Esta solicitud ya se aplicó.');
    var propertyId = propertyReference(payload, state);
    var unitId = unitReference(payload, state, propertyId);
    ['name', 'email', 'phone'].forEach(function (field) { if (!own(payload, field)) fail('La solicitud está incompleta: falta ' + field + '.'); });
    var changes = { name: text(payload.name, 'Nombre del contacto', true, 160), email: email(payload.email), phone: text(payload.phone, 'Teléfono', false, 40) };
    return { requestId: requestId, property: copy(row(state, 'properties', propertyId)), unit: copy(row(state, 'units', unitId)), changes: changes, submittedAt: timestamp(payload.submittedAt, 'Fecha de la solicitud') };
  }
  function applyResidentUpdate(input) {
    var preview = residentPreview(input);
    if (state.appliedResidentRequests.length >= MAX_RECORDS) fail('Se alcanzó el límite de solicitudes guardadas. Conserva un respaldo antes de archivar este registro.');
    var candidate = copy(state);
    var unit = normalize('units', Object.assign({}, preview.unit, preview.changes), candidate, 'update', preview.unit);
    candidate.units = candidate.units.map(function (item) { return item.id === unit.id ? unit : item; });
    candidate.appliedResidentRequests.push(preview.requestId);
    commit(candidate);
    return copy(unit);
  }
  function results(assemblyId) {
    identifier(assemblyId, 'Asamblea');
    var assembly = row(state, 'assemblies', assemblyId);
    if (!assembly) fail('La asamblea indicada no existe.');
    var votes = state.votes.filter(function (vote) { return vote.assemblyId === assemblyId; });
    return {
      assembly: copy(assembly), totalVotes: votes.length,
      eligibleUnits: state.units.filter(function (unit) { return unit.propertyId === assembly.propertyId; }).length,
      options: assembly.options.map(function (option) { return { id: option.id, label: option.label, count: votes.filter(function (vote) { return vote.optionId === option.id; }).length }; })
    };
  }
  function summary(propertyId) {
    if (propertyId !== undefined && propertyId !== null && propertyId !== '') {
      identifier(propertyId, 'Copropiedad');
      if (!row(state, 'properties', propertyId)) fail('La copropiedad indicada no existe.');
    }
    var selected = {};
    var counts = {};
    ENTITIES.forEach(function (type) { selected[type] = scoped(type, propertyId); counts[type] = selected[type].length; });
    var pending = selected.expenses.filter(function (expense) { return expense.status === 'pending'; });
    var paid = selected.expenses.filter(function (expense) { return expense.status === 'paid'; });
    var sum = function (items) { return items.reduce(function (total, item) { return total + item.amountCents; }, 0); };
    var pendingCents = sum(pending);
    var paidCents = sum(paid);
    var currentDay = today();
    return {
      propertyId: propertyId || null, units: counts.units,
      residents: selected.units.filter(function (unit) { return Boolean(unit.name || unit.email || unit.phone); }).length,
      parcelsPending: selected.parcels.filter(function (parcel) { return parcel.status === 'pending'; }).length,
      accessesInside: selected.accesses.filter(function (access) { return !access.exitedAt; }).length,
      expensesPending: pending.length,
      expensesPaidCents: paidCents, expensesPendingCents: pendingCents, expensesTotalCents: paidCents + pendingCents,
      expensesPaidAmount: paidCents / 100, expensesPendingAmount: pendingCents / 100, expensesTotalAmount: (paidCents + pendingCents) / 100,
      maintenancePending: selected.maintenance.filter(function (item) { return item.status !== 'done'; }).length,
      maintenanceOverdue: selected.maintenance.filter(function (item) { return item.status !== 'done' && item.dueDate < currentDay; }).length,
      assembliesOpen: selected.assemblies.filter(function (assembly) { return assembly.state === 'open'; }).length,
      licenseExpired: selected.properties.some(function (property) { return Boolean(property.licenseEnd && property.licenseEnd < currentDay); }),
      counts: counts
    };
  }
  function csvCell(value) {
    var isNumber = typeof value === 'number';
    var string = value === null || value === undefined ? '' : String(value);
    if (!isNumber && (/^[\s\uFEFF]*[=+\-@]/.test(string) || /^[\t\r\n]/.test(string))) string = "'" + string;
    return '"' + string.replace(/"/g, '""') + '"';
  }
  function exportCSV(type, propertyId) {
    entity(type);
    var columns = ['id'].concat(FIELDS[type]).concat(['createdAt', 'updatedAt']);
    var lines = [columns.map(csvCell).join(',')];
    scoped(type, propertyId).forEach(function (record) {
      lines.push(columns.map(function (key) {
        var value = key === 'options' ? record.options.map(function (option) { return option.label; }).join(' | ') : record[key];
        return csvCell(value);
      }).join(','));
    });
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }
  function initialize() {
    try {
      storage = root.localStorage;
      if (!storage || typeof storage.getItem !== 'function') throw new Error('Sin almacenamiento');
      var raw = storage.getItem(STORAGE_KEY);
      if (raw !== null && raw !== undefined && raw !== '') {
        try { state = validateBackup(raw).data; }
        catch (_) {
          rejectedStoredData = true;
          persistent = false;
          storageMessage = 'Los datos guardados no pudieron validarse. Se conservaron sin modificar; esta sesión está vacía y trabaja en memoria. Restaura un respaldo válido para recuperar el guardado.';
          return;
        }
      }
      var probeKey = STORAGE_KEY + ':probe';
      storage.setItem(probeKey, '1');
      storage.removeItem(probeKey);
      persistent = true;
      storageMessage = 'Guardado local en este navegador. Descarga respaldos periódicos.';
    } catch (_) { persistenceFailure(); }
  }

  initialize();
  var api = {
    version: VERSION,
    list: function (type, propertyId) { return copy(scoped(type, propertyId)); },
    get: function (type, id) { entity(type); identifier(id); var found = row(state, type, id); return found ? copy(found) : null; },
    create: create, update: update, remove: remove, summary: summary,
    snapshot: function () { return copy(state); },
    exportBackup: function () { return JSON.stringify(envelopeFor(state)); },
    previewBackup: function (input) { return backupPreview(validateBackup(input)); },
    validateBackup: function (input) { return backupPreview(validateBackup(input)); },
    importBackup: function (input) { var validated = validateBackup(input); commit(validated.data, true); return backupPreview(validated); },
    exportCSV: exportCSV, previewResidentUpdate: residentPreview, applyResidentUpdate: applyResidentUpdate,
    castVote: function (data) { return create('votes', data); },
    getAssemblyResults: results,
    today: today,
    status: function () { return { persistenceAvailable: persistent, message: storageMessage, rejectedStoredData: rejectedStoredData, storageKey: STORAGE_KEY }; }
  };
  Object.defineProperty(api, 'persistenceAvailable', { enumerable: true, get: function () { return persistent; } });
  root.PHStore = Object.freeze(api);
}(typeof window !== 'undefined' ? window : globalThis));
