// ============================================================
// Barber - API
// Comunicación con Google Apps Script
// ============================================================

const API = {
  /**
   * Envía un JSON al backend con POST (evita preflight CORS usando text/plain)
   */
  async post(action, data) {
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, data })
    });

    if (!res.ok) throw new Error('Error de red: ' + res.status);
    const json = await res.json();

    if (json.status !== 'success') {
      throw new Error(json.data?.error || 'Error en el servidor');
    }
    return json.data;
  },

  /**
   * Petición GET con parámetros en query string
   */
  async get(params) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${CONFIG.API_URL}?${qs}`, {
      method: 'GET',
      mode: 'cors',
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('Error de red: ' + res.status);
    const json = await res.json();
    if (json.status !== 'success') {
      throw new Error(json.data?.error || 'Error en el servidor');
    }
    return json.data;
  },

  /**
   * Crea una cita nueva
   */
  async crearPedido(orderData) {
    return this.post('crearPedido', orderData);
  },

  /**
   * Obtiene las horas disponibles para una fecha y barbero
   * @param {string} fecha - YYYY-MM-DD
   * @param {string} barbero - "cualquiera" o nombre del barbero
   * @returns {Promise<{slots: string[], ocupadas: string[]}>}
   */
  async getHorasDisponibles(fecha, barbero) {
    return this.get({
      action: 'horasDisponibles',
      fecha: fecha,
      barbero: barbero || 'cualquiera'
    });
  }
};