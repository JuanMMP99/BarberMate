// ============================================================
// BARBERMATE - APP.JS
// Lógica principal del frontend (modo "reserva directa")
// ============================================================

// ------------------------------------------------------------
// CARRITO (comentado - no se usa por ahora, se deja para el futuro)
// ------------------------------------------------------------
/*
let cart = JSON.parse(localStorage.getItem('barbermate_cart')) || [];

function addToCart(serviceId) { ... }
function updateQuantity(serviceId, delta) { ... }
function removeFromCart(serviceId) { ... }
function clearCart() { ... }
function saveCart() { ... }
function updateCartUI() { ... }
*/

// ------------------------------------------------------------
// Estado actual de la reserva
// ------------------------------------------------------------
let orderModalObj = null;
let servicioActual = null;   // { id, name, price, ... }
let barberoActual = 'cualquiera';

// ============================================================
// INICIALIZACIÓN
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Iniciando BarberMate App...");

  const modalElem = document.getElementById('orderModal');
  if (modalElem) {
    orderModalObj = new bootstrap.Modal(modalElem, {
      backdrop: 'static',
      keyboard: false
    });
  }

  setMinDeliveryDate();
  setupWhatsAppWidget();
  setupFormHandler();
  setupFechaHoraListeners();

  console.log("✅ BarberMate App inicializada");
});

// ============================================================
// FECHA MÍNIMA
// ============================================================
function setMinDeliveryDate() {
  const dateInput = document.getElementById("deliveryDate");
  if (!dateInput) return;
  const todayStr = new Date().toISOString().split('T')[0];
  dateInput.setAttribute('min', todayStr);
}

// ============================================================
// RESERVA DIRECTA (reemplaza a addToCart)
// ------------------------------------------------------------
// Se llama desde los botones "Reservar" de las tarjetas.
// serviceId: id del servicio en SERVICIOS
// ============================================================
function reservarServicio(serviceId) {
  if (typeof SERVICIOS === 'undefined') {
    alert("Error: El catálogo de servicios no está disponible.");
    return;
  }

  const service = SERVICIOS.find(s => s.id === serviceId);
  if (!service) {
    console.error("❌ Servicio no encontrado:", serviceId);
    return;
  }

  servicioActual = service;
  openCheckoutModal(service);
}

// ============================================================
// MODAL DE CHECKOUT
// ============================================================
function openCheckoutModal(service) {
  // Rellenar el resumen con el servicio elegido
  const itemsList = document.getElementById("checkout-items-list");
  const totalPrice = document.getElementById("checkout-total-price");

  if (itemsList) {
    itemsList.innerHTML = `
      <li>
        <span>1x ${service.name}</span>
        <span>$${service.price.toLocaleString('es-MX')} MXN</span>
      </li>
    `;
  }
  if (totalPrice) {
    totalPrice.innerText = `$${service.price.toLocaleString('es-MX')} MXN`;
  }

  // Mostrar el servicio en el campo de solo lectura
  const servicioInput = document.getElementById("serviceTypeDisplay");
  if (servicioInput) servicioInput.value = `${service.name} - $${service.price} MXN`;

  // Guardar el nombre del servicio en un input hidden para enviar al backend
  const servicioHidden = document.getElementById("serviceType");
  if (servicioHidden) servicioHidden.value = service.name;

  // Limpiar selector de hora
  const horaSelect = document.getElementById("deliveryTime");
  if (horaSelect) {
    horaSelect.innerHTML = '<option value="">Selecciona primero la fecha</option>';
  }

  // Reset barbero
  const barberSelect = document.getElementById("barberSelect");
  if (barberSelect) barberSelect.value = 'cualquiera';
  barberoActual = 'cualquiera';

  if (orderModalObj) orderModalObj.show();
}

// ============================================================
// LISTENERS DE FECHA Y BARBERO → cargar horas disponibles
// ============================================================
function setupFechaHoraListeners() {
  const fechaInput = document.getElementById("deliveryDate");
  const barberSelect = document.getElementById("barberSelect");

  if (fechaInput) {
    fechaInput.addEventListener("change", cargarHorasDisponibles);
  }
  if (barberSelect) {
    barberSelect.addEventListener("change", () => {
      barberoActual = barberSelect.value;
      if (fechaInput && fechaInput.value) cargarHorasDisponibles();
    });
  }
}

async function cargarHorasDisponibles() {
  const fecha = document.getElementById("deliveryDate")?.value;
  const horaSelect = document.getElementById("deliveryTime");
  if (!fecha || !horaSelect) return;

  horaSelect.innerHTML = '<option value="">Cargando horarios...</option>';
  horaSelect.disabled = true;

  try {
    const data = await API.getHorasDisponibles(fecha, barberoActual);
    const slots = data.slots || [];

    if (slots.length === 0) {
      horaSelect.innerHTML = '<option value="">No hay horarios disponibles ese día</option>';
      return;
    }

    horaSelect.innerHTML = '<option value="">Selecciona una hora</option>' +
      slots.map(h => `<option value="${h}">${h} hrs</option>`).join('');
    horaSelect.disabled = false;
  } catch (err) {
    console.error("❌ Error al cargar horarios:", err);
    horaSelect.innerHTML = '<option value="">Error al cargar horarios</option>';
  }
}

// ============================================================
// FORMULARIO
// ============================================================
function setupFormHandler() {
  const orderForm = document.getElementById("orderForm");
  if (!orderForm) return;

  orderForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Honeypot
    const honeypot = document.getElementById("formWebsite")?.value;
    if (honeypot) {
      console.warn("⚠️ Spam detectado.");
      return;
    }

    const submitBtn = document.getElementById("orderSubmitBtn");
    const spinner = document.getElementById("orderSubmitSpinner");
    const btnText = document.getElementById("orderSubmitText");

    if (submitBtn) submitBtn.disabled = true;
    if (spinner) spinner.classList.remove("d-none");
    if (btnText) btnText.innerHTML = "Confirmando cita...";

    try {
      if (!servicioActual) throw new Error("No hay servicio seleccionado");

      const orderData = {
        cliente: document.getElementById("buyerName")?.value.trim(),
        telefono: document.getElementById("buyerPhone")?.value.trim(),
        servicio: servicioActual.name,
        barbero: document.getElementById("barberSelect")?.value || "cualquiera",
        fechaCita: document.getElementById("deliveryDate")?.value,
        horaCita: document.getElementById("deliveryTime")?.value,
        notas: "",
        // El backend espera un array de servicios con {id, name, price, quantity}
        servicios: [{
          id: servicioActual.id,
          name: servicioActual.name,
          price: servicioActual.price,
          quantity: 1
        }],
        total: servicioActual.price
      };

      if (!orderData.horaCita) throw new Error("Selecciona una hora disponible");

      await API.crearPedido(orderData);

      if (orderModalObj) orderModalObj.hide();
      showSuccessModal();
      orderForm.reset();
      servicioActual = null;

      console.log("✅ Cita registrada exitosamente");

    } catch (error) {
      console.error("❌ Error:", error);
      alert("Ocurrió un inconveniente: " + error.message);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (spinner) spinner.classList.add("d-none");
      if (btnText) btnText.innerHTML = 'Confirmar Cita';
    }
  });
}

// ============================================================
// MODAL DE ÉXITO
// ============================================================
function showSuccessModal() {
  const modal = document.getElementById("successOrderModal");
  if (modal) new bootstrap.Modal(modal).show();
}

// ============================================================
// WHATSAPP WIDGET (se mantiene igual)
// ============================================================
function setupWhatsAppWidget() {
  const trigger = document.getElementById("wa-main-trigger");
  const popup = document.getElementById("wa-popup");
  const closeBtn = document.getElementById("close-popup");
  const widgetBtn = document.getElementById("wa-widget-btn");

  if (!trigger || !popup) return;

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    popup.classList.toggle("show");
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      popup.classList.remove("show");
    });
  }

  document.addEventListener("click", (e) => {
    if (!popup.contains(e.target) && e.target !== trigger) {
      popup.classList.remove("show");
    }
  });

  if (widgetBtn) {
    const phone = CONFIG?.business?.phone || "529514990142";
    widgetBtn.href = `https://wa.me/${phone}?text=${encodeURIComponent('💈 ¡Hola! Me gustaría agendar una cita en BarberMate.')}`;
  }
}

// ============================================================
// Compatibilidad: si algún HTML viejo llama a addToCart, redirige a reservarServicio
// ============================================================
function addToCart(serviceId) {
  reservarServicio(serviceId);
}