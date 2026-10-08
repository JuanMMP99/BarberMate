/**
 * Barber - Sistema de Gestión de Citas para Barbería
 * CRM para barbería con Google Sheets como base de datos
 */

const SHEET_NAME = 'Citas';

// Límites de longitud para evitar abuso
const FIELD_LIMITS = {
  cliente: 100,
  telefono: 20,
  servicio: 100,
  barbero: 100,
  notas: 500,
  servicios: 2000
};

// Ventana de tiempo (minutos) para bloquear solicitudes duplicadas del mismo teléfono
const RATE_LIMIT_MINUTES = 5;

/* ==========================================================================
   MÓDULO DE ADMINISTRACIÓN (PANEL PRIVADO)
   ========================================================================== */
const USERS_SHEET_NAME = 'Usuarios';
const SESSION_DURATION_SECONDS = 21600; // 6 horas
const ESTADOS_VALIDOS = ['Pendiente', 'Confirmada', 'En Progreso', 'Completada', 'Cancelada'];

// Datos de marca
const BRAND_NAME = 'Barber';
const BRAND_PHONE = '52 951 499 0142';

// Respaldo semanal
const BACKUP_FOLDER_NAME = 'Respaldos CRM - Barber';
const MAX_BACKUPS_TO_KEEP = 12;

/* ==========================================================================
   UTILIDADES
   ========================================================================== */

/**
 * Sanea un valor antes de escribirlo en la hoja:
 * - Convierte a texto y recorta espacios
 * - Antepone un apóstrofe si el valor empieza con =, +, -, @ para evitar inyección de fórmulas
 * - Trunca a una longitud máxima
 */
function sanitizeForSheet(value, maxLength) {
  if (value === null || value === undefined) return '';
  let str = String(value).trim();
  if (/^[=+\-@]/.test(str)) {
    str = "'" + str;
  }
  if (maxLength && str.length > maxLength) {
    str = str.substring(0, maxLength);
  }
  return str;
}

/**
 * Valida que un teléfono tenga entre 10 y 15 dígitos (solo números)
 */
function isValidPhone(telefono) {
  const digits = String(telefono || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Revisa si ya existe una solicitud reciente del mismo teléfono
 * (protección básica anti-spam / doble envío accidental)
 */
function hasRecentDuplicateRequest(telefono) {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  const digits = String(telefono || '').replace(/\D/g, '');
  const cutoff = new Date(Date.now() - RATE_LIMIT_MINUTES * 60 * 1000);

  for (let i = values.length - 1; i >= 1; i--) {
    const rowPhoneDigits = String(values[i][1] || '').replace(/\D/g, '');
    const rowTimestamp = values[i][10];
    if (rowPhoneDigits && rowPhoneDigits === digits && rowTimestamp) {
      const ts = new Date(rowTimestamp);
      if (!isNaN(ts.getTime()) && ts > cutoff) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Normaliza cualquier valor de fecha al formato YYYY-MM-DD
 */
function normalizeDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const str = String(val).trim();
  if (str.includes('T')) {
    return str.split('T')[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return str;
}

/**
 * Normaliza cualquier valor de hora al formato HH:mm
 */
function normalizeTime(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'HH:mm');
  }
  let str = String(val).trim();
  const parts = str.split(':');
  if (parts.length >= 2) {
    let h = parts[0].padStart(2, '0');
    let m = parts[1].padStart(2, '0');
    return `${h}:${m}`;
  }
  return str;
}

/**
 * Construye la respuesta JSON
 */
function buildResponse(data, success = true) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: success ? 'success' : 'error',
      data: data
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ==========================================================================
   MANEJO DE SOLICITUDES HTTP
   ========================================================================== */

/**
 * Maneja las solicitudes GET
 */
function doGet(e) {
  try {
    // Verificar si es la URL del panel administrativo
    const adminDeploymentUrl = PropertiesService.getScriptProperties().getProperty('ADMIN_DEPLOYMENT_URL');
    const currentUrl = ScriptApp.getService().getUrl();

    if (adminDeploymentUrl && currentUrl === adminDeploymentUrl) {
      return HtmlService.createHtmlOutputFromFile('Admin')
        .setTitle('Panel Administrativo - Barber')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    if (!e || !e.parameter) {
      return buildResponse({
        error: 'Solicitud inválida. Se requieren parámetros.',
        help: 'Usa ?action=testConnection'
      }, false);
    }

    const action = e.parameter.action;

    if (!action) {
      return buildResponse({
        message: 'API de Barber funcionando correctamente',
        actions: ['testConnection']
      }, true);
    }

    switch (action) {
      case 'testConnection':
        return buildResponse({ message: 'Conexión exitosa' }, true);
      default:
        return buildResponse({
          error: 'Acción no válida',
          actions: ['testConnection']
        }, false);
    }
  } catch (error) {
    console.error('Error en doGet:', error);
    return buildResponse({
      error: error.toString(),
      stack: error.stack
    }, false);
  }
}

/**
 * Maneja las solicitudes POST
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return buildResponse({
        error: 'Solicitud POST inválida. Se requiere JSON en el cuerpo.'
      }, false);
    }

    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    const data = request.data;

    if (!action) {
      return buildResponse({
        error: 'Se requiere el campo "action" en la solicitud'
      }, false);
    }

    switch (action) {
      case 'crearPedido':
        return handleCrearCita(data);
      default:
        return buildResponse({
          error: 'Acción POST no válida',
          actions: ['crearPedido']
        }, false);
    }
  } catch (error) {
    console.error('Error en doPost:', error);
    return buildResponse({
      error: error.toString(),
      stack: error.stack
    }, false);
  }
}

/* ==========================================================================
   GESTIÓN DE CITAS
   ========================================================================== */

/**
 * Obtiene o crea la hoja de citas
 */
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = [
      'Cliente',
      'Teléfono',
      'Servicio',
      'Barbero',
      'FechaCita',
      'HoraCita',
      'Notas',
      'Servicios',
      'Total',
      'Estado',
      'Timestamp',
      'UUID'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Crea una nueva cita y envía notificación por correo electrónico
 */
function handleCrearCita(data) {
  const required = ['cliente', 'telefono', 'servicio', 'fechaCita', 'horaCita'];
  const missing = required.filter(field => data[field] === undefined || data[field] === null || data[field] === '');

  if (missing.length > 0) {
    return buildResponse({
      error: 'Faltan campos requeridos',
      missing: missing,
      required: required
    }, false);
  }

  // Sanear y truncar cada campo
  const cliente = sanitizeForSheet(data.cliente, FIELD_LIMITS.cliente);
  const telefono = sanitizeForSheet(data.telefono, FIELD_LIMITS.telefono);
  const servicio = sanitizeForSheet(data.servicio, FIELD_LIMITS.servicio);
  const barbero = sanitizeForSheet(data.barbero || 'cualquiera', FIELD_LIMITS.barbero);
  const notas = sanitizeForSheet(data.notas || '', FIELD_LIMITS.notas);
  const fechaCita = normalizeDate(data.fechaCita);
  const horaCita = normalizeTime(data.horaCita);
  const estado = 'Pendiente';

  if (!isValidPhone(telefono)) {
    return buildResponse({ error: 'El teléfono debe tener entre 10 y 15 dígitos' }, false);
  }

  // Protección anti-spam
  if (hasRecentDuplicateRequest(telefono)) {
    return buildResponse({
      error: 'Ya recibimos una cita reciente con este teléfono. Espera unos minutos antes de intentar de nuevo.'
    }, false);
  }

  // Procesar servicios
  let serviciosArr = [];
  try {
    serviciosArr = Array.isArray(data.servicios) ? data.servicios : JSON.parse(data.servicios || '[]');
  } catch (err) {
    return buildResponse({ error: 'Formato de servicios inválido' }, false);
  }

  if (!serviciosArr || serviciosArr.length === 0) {
    return buildResponse({ error: 'Debe seleccionar al menos un servicio' }, false);
  }

  const serviciosJson = sanitizeForSheet(JSON.stringify(serviciosArr), FIELD_LIMITS.servicios);
  const total = Number(data.total) || 0;

  // Guardar cita en la hoja
  const sheet = getSheet();
  const nextRow = sheet.getLastRow() + 1;

  const rowData = [
    cliente,
    "'" + telefono,
    servicio,
    barbero,
    fechaCita,
    horaCita,
    notas,
    serviciosJson,
    total,
    estado,
    new Date().toISOString(),
    Utilities.getUuid()
  ];

  sheet.getRange(nextRow, 1, 1, rowData.length).setValues([rowData]);

  // =========================================================================
  // 📧 ENVÍO DE NOTIFICACIÓN POR CORREO
  // =========================================================================
  try {
    const emailDestino = 'tu-correo@gmail.com'; // 👈 Reemplaza con tu correo
    const asunto = `💈 Nueva Cita: ${cliente} - ${fechaCita}`;

    const listaServicios = serviciosArr
      .map(s => `${s.quantity}x ${s.name} ($${s.price * s.quantity} MXN)`)
      .join('<br>');

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; border: 1px solid #c9a84c; padding: 20px; border-radius: 8px;">
        <h2 style="color: #c9a84c; border-bottom: 2px solid #c9a84c; padding-bottom: 8px;">💈 Nueva Cita en Barber</h2>
        <p>Se ha registrado una nueva cita con los siguientes detalles:</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Cliente:</td><td style="padding: 8px;">${cliente}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Teléfono:</td><td style="padding: 8px;">${telefono}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Servicio:</td><td style="padding: 8px;">${servicio}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Barbero:</td><td style="padding: 8px;">${barbero}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Fecha:</td><td style="padding: 8px;">${fechaCita} a las ${horaCita} hrs</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Servicios:</td><td style="padding: 8px;">${listaServicios}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Total:</td><td style="padding: 8px;"><strong>$${total.toLocaleString()} MXN</strong></td></tr>
          <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Notas:</td><td style="padding: 8px;">${notas || '—'}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Estatus:</td><td style="padding: 8px;"><span style="background-color: #ffeaa7; padding: 3px 8px; border-radius: 4px; font-weight: bold;">${estado}</span></td></tr>
        </table>
      </div>
    `;

    MailApp.sendEmail({
      to: emailDestino,
      subject: asunto,
      htmlBody: htmlBody
    });
  } catch (e) {
    console.error('Error al enviar la notificación por correo:', e);
  }
  // =========================================================================

  return buildResponse({
    success: true,
    message: 'Cita registrada correctamente',
    data: {
      cliente,
      telefono,
      servicio,
      barbero,
      fecha: fechaCita,
      hora: horaCita,
      total,
      estado
    }
  }, true);
}

/**
 * Función de prueba para verificar la conexión
 */
function testConnection() {
  try {
    const sheet = getSheet();
    const lastRow = sheet.getLastRow();

    Logger.log('✅ Conexión exitosa a la hoja de cálculo');
    Logger.log(`📊 Citas registradas: ${lastRow - 1}`);

    return buildResponse({
      message: 'Conexión exitosa',
      citasRegistradas: lastRow - 1,
      sheetName: SHEET_NAME
    }, true);
  } catch (error) {
    Logger.log('❌ Error:', error);
    return buildResponse({
      error: error.toString()
    }, false);
  }
}

/**
 * Obtiene URL de pruebas
 */
function getTestUrl() {
  const url = ScriptApp.getService().getUrl();
  return url + '?action=testConnection';
}

/**
 * Configura cuál URL de despliegue queda dedicada al panel administrativo.
 * Ejecútala UNA VEZ manualmente desde el editor.
 */
function configurarUrlAdmin() {
  // 🔧 EDITA ESTE VALOR ANTES DE EJECUTAR: pega aquí la URL de tu implementación
  // dedicada al panel (la segunda que crees, distinta de la de la API pública).
  const urlDelPanelAdmin = 'https://script.google.com/macros/s/AKfycbyfBlfl2xd7qr2YSy-au8EQe6y8clfqoYijfzh1PTBCPOtyWq0JG5vN8daUbWXpz0bHbg/exec';

  PropertiesService.getScriptProperties().setProperty('ADMIN_DEPLOYMENT_URL', urlDelPanelAdmin.trim());
  Logger.log('✅ URL del panel administrativo configurada: ' + urlDelPanelAdmin.trim());
}

/* ==========================================================================
   AUTENTICACIÓN Y SESIONES DEL PANEL ADMINISTRATIVO
   ========================================================================== */

/**
 * Obtiene (o crea) la hoja oculta de usuarios administrativos.
 * Nunca se expone vía la API pública; solo se usa dentro de este módulo.
 */
function getUsersSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(USERS_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET_NAME);
    const headers = ['Nombre', 'Email', 'PasswordHash', 'Salt', 'Rol', 'Activo', 'FechaCreacion'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.hideSheet();
  }

  return sheet;
}

function generarSalt_() {
  return Utilities.getUuid();
}

function hashPassword_(password, salt) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password) + String(salt), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(raw);
}

function findUserByEmail_(email) {
  const sheet = getUsersSheet_();
  const values = sheet.getDataRange().getValues();
  const target = String(email || '').trim().toLowerCase();

  for (let i = 1; i < values.length; i++) {
    const rowEmail = String(values[i][1] || '').trim().toLowerCase();
    if (rowEmail && rowEmail === target) {
      return {
        rowIndex: i + 1,
        nombre: values[i][0],
        email: values[i][1],
        passwordHash: values[i][2],
        salt: values[i][3],
        rol: values[i][4],
        activo: values[i][5] === true || values[i][5] === 'TRUE'
      };
    }
  }
  return null;
}

function crearOActualizarUsuario_(nombre, email, passwordPlano, rol, activo) {
  const sheet = getUsersSheet_();
  const salt = generarSalt_();
  const hash = hashPassword_(passwordPlano, salt);
  const existente = findUserByEmail_(email);

  if (existente) {
    sheet.getRange(existente.rowIndex, 1, 1, 6).setValues([[nombre, email, hash, salt, rol, activo]]);
  } else {
    sheet.appendRow([nombre, email, hash, salt, rol, activo, new Date().toISOString()]);
  }
}

/**
 * Configuración inicial: crea el primer usuario administrador.
 * Solo funciona UNA vez (protegido por una bandera en Propiedades del Script).
 * Ejecútala manualmente desde el editor de Apps Script.
 */
function crearPrimerAdmin() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SETUP_COMPLETE') === 'true') {
    throw new Error('La configuración inicial ya se completó. Usa el panel para crear más usuarios.');
  }

  // 🔧 EDITA ESTOS TRES VALORES ANTES DE EJECUTAR:
  const nombre = 'Barber Admin';
  const email = 'admin@Barber.com';
  const passwordPlano = 'admin123';

  crearOActualizarUsuario_(nombre, email, passwordPlano, 'admin', true);
  props.setProperty('SETUP_COMPLETE', 'true');
  Logger.log('Usuario administrador creado: ' + email + ' — ¡cambia la contraseña por defecto desde el panel!');
}

/**
 * Crea o actualiza usuarios adicionales del panel. Requiere sesión de un admin existente.
 */
function crearUsuarioAdmin(token, nombre, email, passwordPlano, rol) {
  const session = validateToken_(token);
  if (session.rol !== 'admin') {
    throw new Error('No tienes permisos para crear usuarios');
  }
  if (!nombre || !email || !passwordPlano) {
    throw new Error('Nombre, correo y contraseña son obligatorios');
  }
  const rolFinal = rol === 'admin' ? 'admin' : 'staff';
  crearOActualizarUsuario_(nombre.trim(), email.trim(), passwordPlano, rolFinal, true);
  return { success: true };
}

function createSessionToken_(email, nombre, rol) {
  const token = Utilities.getUuid();
  const cache = CacheService.getScriptCache();
  cache.put('session_' + token, JSON.stringify({ email, nombre, rol }), SESSION_DURATION_SECONDS);
  return token;
}

/**
 * Valida un token de sesión. Lanza un error si no es válido o expiró.
 * Todas las funciones del panel que exponen o modifican datos deben llamarla primero.
 */
function validateToken_(token) {
  if (!token) {
    throw new Error('Sesión no válida. Inicia sesión nuevamente.');
  }
  const cache = CacheService.getScriptCache();
  const payload = cache.get('session_' + token);
  if (!payload) {
    throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
  }
  return JSON.parse(payload);
}

/**
 * Inicio de sesión con correo y contraseña.
 */
function loginWithPassword(email, password) {
  const user = findUserByEmail_(email);
  if (!user || !user.activo) {
    throw new Error('Correo o contraseña incorrectos');
  }
  const hash = hashPassword_(password, user.salt);
  if (hash !== user.passwordHash) {
    throw new Error('Correo o contraseña incorrectos');
  }
  const token = createSessionToken_(user.email, user.nombre, user.rol);
  return { token: token, nombre: user.nombre, email: user.email, rol: user.rol };
}

/**
 * Intento de inicio de sesión automático con la cuenta de Google activa.
 */
function checkGoogleSession() {
  try {
    const email = Session.getActiveUser().getEmail();
    if (!email) return { authenticated: false };

    const user = findUserByEmail_(email);
    if (user && user.activo) {
      const token = createSessionToken_(user.email, user.nombre, user.rol);
      return { authenticated: true, token: token, nombre: user.nombre, email: user.email };
    }
    return { authenticated: false };
  } catch (err) {
    return { authenticated: false };
  }
}

function logout(token) {
  if (token) {
    CacheService.getScriptCache().remove('session_' + token);
  }
  return true;
}

function resetearSetup() {
  PropertiesService.getScriptProperties().deleteProperty('SETUP_COMPLETE');
  Logger.log('✅ Permiso de configuración restablecido correctamente.');
}

/* ==========================================================================
   FUNCIONES DEL PANEL: CITAS
   ========================================================================== */

/**
 * Busca la fila de una cita por su UUID.
 */
function getCitaRowByUuid_(uuid) {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][11]) === String(uuid)) {
      return { rowIndex: i + 1, row: values[i] };
    }
  }
  return null;
}

/**
 * Devuelve todas las citas (más recientes primero), con filtros opcionales.
 * filtros = { estado, fechaDesde, fechaHasta, busqueda }
 */
function adminGetCitas(token, filtros) {
  validateToken_(token);
  filtros = filtros || {};

  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  const displayValues = sheet.getDataRange().getDisplayValues();

  const citas = [];
  for (let i = 1; i < values.length; i++) {
    const rowVal = values[i];
    const rowDisp = displayValues[i];
    if (!rowVal[11]) continue; // sin UUID, fila vacía

    let servicios = [];
    try { servicios = JSON.parse(rowVal[7] || '[]'); } catch (e) { servicios = []; }

    const cita = {
      cliente: String(rowDisp[0] || ''),
      telefono: String(rowDisp[1] || ''),
      servicio: String(rowDisp[2] || ''),
      barbero: String(rowDisp[3] || 'cualquiera'),
      fechaCita: normalizeDate(rowVal[4] || rowDisp[4]),
      horaCita: normalizeTime(rowVal[5] || rowDisp[5]),
      notas: String(rowDisp[6] || ''),
      servicios: servicios,
      total: Number(rowVal[8]) || 0,
      estado: String(rowDisp[9] || 'Pendiente'),
      timestamp: rowVal[10],
      uuid: String(rowVal[11] || ''),
      rowIndex: i + 1
    };

    // Aplicar filtros
    if (filtros.estado && filtros.estado !== 'all' && cita.estado !== filtros.estado) continue;
    if (filtros.fechaDesde && cita.fechaCita < filtros.fechaDesde) continue;
    if (filtros.fechaHasta && cita.fechaCita > filtros.fechaHasta) continue;
    if (filtros.busqueda) {
      const q = String(filtros.busqueda).toLowerCase();
      const haystack = (cita.cliente + ' ' + cita.telefono + ' ' + cita.servicio).toLowerCase();
      if (!haystack.includes(q)) continue;
    }

    citas.push(cita);
  }

  citas.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return citas;
}

/**
 * Actualiza el estado de una cita.
 */
function adminActualizarEstadoCita(token, uuid, nuevoEstado) {
  validateToken_(token);
  if (ESTADOS_VALIDOS.indexOf(nuevoEstado) === -1) {
    throw new Error('Estado no válido');
  }
  const found = getCitaRowByUuid_(uuid);
  if (!found) throw new Error('No se encontró la cita');

  getSheet().getRange(found.rowIndex, 10).setValue(nuevoEstado);
  return { success: true };
}

/**
 * Crea una cita manualmente desde el panel.
 */
function adminCrearCitaManual(token, data) {
  validateToken_(token);
  const response = handleCrearCita(data);
  const parsed = JSON.parse(response.getContent());
  if (parsed.status === 'error') {
    throw new Error(parsed.data.error || 'No se pudo crear la cita');
  }
  return parsed.data;
}

/**
 * Elimina una cita (uso restringido a administradores).
 */
function adminEliminarCita(token, uuid) {
  const session = validateToken_(token);
  if (session.rol !== 'admin') {
    throw new Error('No tienes permisos para eliminar citas');
  }
  const found = getCitaRowByUuid_(uuid);
  if (!found) throw new Error('No se encontró la cita');
  getSheet().deleteRow(found.rowIndex);
  return { success: true };
}

/* ==========================================================================
   FUNCIONES DEL PANEL: DASHBOARD
   ========================================================================== */

function adminGetDashboard(token) {
  validateToken_(token);

  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  const displayValues = sheet.getDataRange().getDisplayValues();
  const tz = Session.getScriptTimeZone();
  const todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  const hoy = new Date(todayStr + 'T00:00:00');
  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() - hoy.getDay());
  const inicioSemanaStr = Utilities.formatDate(inicioSemana, tz, 'yyyy-MM-dd');

  const porEstado = {};
  const porServicio = {};
  let total = 0;
  let ventasTotales = 0;
  let citasHoy = 0;
  let citasSemana = 0;
  let ventasSemana = 0;

  for (let i = 1; i < values.length; i++) {
    const rowVal = values[i];
    const rowDisp = displayValues[i];
    if (!rowVal[11]) continue;

    total += 1;
    const montoTotal = Number(rowVal[8]) || 0;
    ventasTotales += montoTotal;

    const estado = String(rowDisp[9] || 'Pendiente');
    porEstado[estado] = (porEstado[estado] || 0) + 1;

    const servicio = String(rowDisp[2] || '');
    porServicio[servicio] = (porServicio[servicio] || 0) + 1;

    const fechaCita = normalizeDate(rowVal[4] || rowDisp[4]);
    if (fechaCita === todayStr) citasHoy += 1;

    const fechaRegistro = normalizeDate(rowVal[10]);
    if (fechaRegistro >= inicioSemanaStr) {
      citasSemana += 1;
      ventasSemana += montoTotal;
    }
  }

  return { total, ventasTotales, citasHoy, citasSemana, ventasSemana, porEstado, porServicio };
}

/* ==========================================================================
   FUNCIONES DEL PANEL: CLIENTES
   ========================================================================== */

function adminGetClientes(token) {
  validateToken_(token);

  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  const displayValues = sheet.getDataRange().getDisplayValues();

  const clientesMap = {};

  for (let i = 1; i < values.length; i++) {
    const rowVal = values[i];
    const rowDisp = displayValues[i];
    if (!rowVal[11]) continue;

    const telefono = String(rowDisp[1] || '').trim();
    if (!telefono) continue;

    const total = Number(rowVal[8]) || 0;
    const fechaCita = normalizeDate(rowVal[4] || rowDisp[4]);

    if (!clientesMap[telefono]) {
      clientesMap[telefono] = {
        nombre: String(rowDisp[0] || ''),
        telefono: telefono,
        citas: 0,
        totalGastado: 0,
        ultimaCita: fechaCita
      };
    }

    const c = clientesMap[telefono];
    c.citas += 1;
    c.totalGastado += total;
    if (fechaCita > c.ultimaCita) c.ultimaCita = fechaCita;
  }

  return Object.values(clientesMap).sort((a, b) => b.totalGastado - a.totalGastado);
}

/* ==========================================================================
   EXPORTAR COMPROBANTE DE CITA A PDF
   ========================================================================== */

function adminExportCitaPDF(token, uuid) {
  validateToken_(token);

  const found = getCitaRowByUuid_(uuid);
  if (!found) throw new Error('No se encontró la cita');

  const displayRow = getSheet().getRange(found.rowIndex, 1, 1, 12).getDisplayValues()[0];
  let servicios = [];
  try { servicios = JSON.parse(getSheet().getRange(found.rowIndex, 8).getValue() || '[]'); } catch (e) { servicios = []; }

  const cita = {
    cliente: displayRow[0] || 'Sin nombre',
    telefono: displayRow[1] || '',
    servicio: displayRow[2] || '',
    barbero: displayRow[3] || 'Cualquier barbero',
    fecha: normalizeDate(displayRow[4]),
    hora: normalizeTime(displayRow[5]),
    notas: displayRow[6] || '—',
    total: displayRow[8] || '0',
    estado: displayRow[9] || 'Pendiente'
  };

  const doc = DocumentApp.create('Comprobante de Cita - ' + cita.cliente + ' - ' + cita.fecha);
  const body = doc.getBody();
  body.setMarginTop(50).setMarginBottom(50).setMarginLeft(50).setMarginRight(50);

  body.appendParagraph(BRAND_NAME).setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph('Comprobante de Cita').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendHorizontalRule();

  const filas = [
    ['Cliente', cita.cliente],
    ['Teléfono', cita.telefono],
    ['Servicio', cita.servicio],
    ['Barbero', cita.barbero],
    ['Fecha de Cita', cita.fecha],
    ['Hora de Cita', cita.hora],
    ['Total', '$' + cita.total + ' MXN'],
    ['Notas', cita.notas],
    ['Estatus', cita.estado]
  ];

  const table = body.appendTable(filas);
  for (let i = 0; i < filas.length; i++) {
    const labelCell = table.getRow(i).getCell(0);
    labelCell.editAsText().setBold(true);
    labelCell.setWidth(140);
  }

  body.appendParagraph(' ');
  body.appendParagraph('Servicios').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  const filasServicios = servicios.map(s => [s.name, String(s.quantity), '$' + (s.price * s.quantity) + ' MXN']);
  filasServicios.unshift(['Servicio', 'Cantidad', 'Subtotal']);
  const tablaServicios = body.appendTable(filasServicios);
  tablaServicios.getRow(0).editAsText().setBold(true);

  body.appendParagraph(' ');
  body.appendParagraph('Total: $' + cita.total + ' MXN').setBold(true);

  body.appendParagraph(' ');
  body.appendParagraph('📱 ' + BRAND_PHONE).setFontSize(9);
  body.appendParagraph('Generado el ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'))
    .setItalic(true)
    .setFontSize(9);

  doc.saveAndClose();

  const pdfBlob = DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF);
  const base64 = Utilities.base64Encode(pdfBlob.getBytes());

  DriveApp.getFileById(doc.getId()).setTrashed(true);

  const nombreArchivo = 'Cita_' + cita.cliente.replace(/[^a-zA-Z0-9]+/g, '_') + '_' + cita.fecha + '.pdf';

  return {
    base64: base64,
    filename: nombreArchivo,
    mimeType: 'application/pdf'
  };
}

/* ==========================================================================
   RESPALDO SEMANAL DE LA HOJA DE CITAS A EXCEL (.xlsx)
   ========================================================================== */

function getOrCreateBackupFolder_() {
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

function limpiarRespaldosAntiguos_(folder) {
  const archivos = [];
  const it = folder.getFilesByType(MimeType.MICROSOFT_EXCEL);
  while (it.hasNext()) archivos.push(it.next());

  archivos.sort((a, b) => b.getDateCreated().getTime() - a.getDateCreated().getTime());

  for (let i = MAX_BACKUPS_TO_KEEP; i < archivos.length; i++) {
    archivos[i].setTrashed(true);
  }
}

/**
 * Exporta SOLO la hoja de Citas a un archivo .xlsx
 * dentro de una carpeta de Drive dedicada.
 */
function backupCitasSemanal() {
  const sourceSheet = getSheet();

  const tempSS = SpreadsheetApp.create('Respaldo temporal - Citas - ' + new Date().toISOString());
  const copiaCitas = sourceSheet.copyTo(tempSS);
  copiaCitas.setName('Citas');

  const hojaPorDefecto = tempSS.getSheets().find(s => s.getSheetId() !== copiaCitas.getSheetId());
  if (hojaPorDefecto) tempSS.deleteSheet(hojaPorDefecto);

  SpreadsheetApp.flush();

  const url = 'https://docs.google.com/spreadsheets/d/' + tempSS.getId() + '/export?format=xlsx';
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  });

  const nombreArchivo = 'Citas_Respaldo_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + '.xlsx';
  const blob = response.getBlob().setName(nombreArchivo);

  const folder = getOrCreateBackupFolder_();
  const file = folder.createFile(blob);

  DriveApp.getFileById(tempSS.getId()).setTrashed(true);

  const props = PropertiesService.getScriptProperties();
  props.setProperty('LAST_BACKUP_DATE', new Date().toISOString());
  props.setProperty('LAST_BACKUP_URL', file.getUrl());

  limpiarRespaldosAntiguos_(folder);

  const base64 = Utilities.base64Encode(blob.getBytes());

  return {
    fileId: file.getId(),
    fileName: file.getName(),
    url: file.getUrl(),
    base64: base64,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
}

/**
 * Instala el disparador semanal (cada lunes ~2:00 AM).
 * Ejecútala UNA VEZ manualmente desde el editor de Apps Script.
 */
function instalarTriggerRespaldoSemanal() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'backupCitasSemanal') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('backupCitasSemanal')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(2)
    .create();

  Logger.log('✅ Respaldo automático instalado: cada lunes alrededor de las 2:00 AM.');
}

/**
 * Info del último respaldo, para mostrar en el panel.
 */
function adminGetBackupInfo(token) {
  validateToken_(token);
  const props = PropertiesService.getScriptProperties();
  return {
    lastBackupDate: props.getProperty('LAST_BACKUP_DATE') || null,
    lastBackupUrl: props.getProperty('LAST_BACKUP_URL') || null
  };
}

/**
 * Permite generar un respaldo manualmente desde el panel.
 */
function adminForzarRespaldo(token) {
  validateToken_(token);
  return backupCitasSemanal();
}