// ============================================================
// Barber - SERVICIOS
// Catálogo (datos sin cambios) + render con el nuevo diseño
// ============================================================

const SERVICIOS = [
  { id: "s001", name: "Corte Clásico", price: 300, category: "Cortes", description: "Corte tradicional con tijera y máquina.", duration: "45 min", image: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=400&q=80" },
  { id: "s002", name: "Corte + Barba", price: 500, category: "Combo", description: "Combo completo de corte y arreglo de barba.", duration: "60 min", image: "https://images.unsplash.com/photo-1599351431205-1df8c6a1c57e?auto=format&fit=crop&w=400&q=80" },
  { id: "s003", name: "Arreglo de Barba", price: 250, category: "Barba", description: "Perfilado, recorte y cuidado de barba.", duration: "30 min", image: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=400&q=80" },
  { id: "s004", name: "Afeitado Clásico", price: 350, category: "Barba", description: "Afeitado con navaja y toallas calientes.", duration: "40 min", image: "https://images.unsplash.com/photo-1599351431205-1df8c6a1c57e?auto=format&fit=crop&w=400&q=80" },
  { id: "s005", name: "Corte Infantil", price: 250, category: "Cortes", description: "Corte especial para los más pequeños.", duration: "30 min", image: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=400&q=80" },
  { id: "s006", name: "Styling", price: 200, category: "Cortes", description: "Peinado y styling con productos de calidad.", duration: "20 min", image: "https://images.unsplash.com/photo-1599351431205-1df8c6a1c57e?auto=format&fit=crop&w=400&q=80" }
];

// Íconos del diseño (extraídos de Figma) para las tarjetas del inicio
const SERVICE_ICONS = ["img/service-1.png", "img/service-2.png", "img/service-3.png", "img/service-4.png"];

// ------------------------------------------------------------
// Tarjeta del INICIO: ícono + nombre + precio (4 destacados)
// ------------------------------------------------------------
function serviceIconCard(s, index) {
  return `
    <div class="col-sm-6 col-lg-3">
      <div class="service-icon-card">
        <img class="icon" src="${SERVICE_ICONS[index % SERVICE_ICONS.length]}" alt="" loading="lazy" />
        <h4>${s.name}</h4>
        <p>${s.description}</p>
        <div class="price">$${s.price} MXN</div>
        <div class="duration"><i class="bi bi-clock me-1"></i>${s.duration}</div>
        <button class="btn btn-gold" onclick="reservarServicio('${s.id}')">Reservar</button>
      </div>
    </div>`;
}

// ------------------------------------------------------------
// Tarjeta del CATÁLOGO: con imagen
// ------------------------------------------------------------
function serviceImageCard(s) {
  return `
    <div class="col-sm-6 col-xl-4">
      <div class="service-card">
        <img src="${s.image}" alt="${s.name}" loading="lazy" />
        <div class="card-body">
          <div>
            <div class="category-tag">${s.category}</div>
            <div class="service-name">${s.name}</div>
            <p class="service-desc">${s.description}</p>
          </div>
          <div class="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
            <div>
              <div class="service-price">$${s.price} MXN</div>
              <div class="service-duration"><i class="bi bi-clock me-1"></i>${s.duration}</div>
            </div>
            <button class="btn btn-gold px-3 py-2" onclick="reservarServicio('${s.id}')">
              <i class="bi bi-calendar-plus me-1"></i> Reservar
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

function renderServices() {
  const home = document.getElementById('servicesContainer');
  if (home) {
    home.innerHTML = SERVICIOS.slice(0, 4).map(serviceIconCard).join('');
  }

  const catalog = document.getElementById('catalog-container');
  if (catalog) {
    populateCategories();
    applyFilters();
  }
}

// ------------------------------------------------------------
// Filtros del catálogo (servicios.html)
// ------------------------------------------------------------
function populateCategories() {
  const select = document.getElementById('categoryFilter');
  if (!select || select.options.length > 1) return;
  [...new Set(SERVICIOS.map(s => s.category))].forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
}

function applyFilters() {
  const catalog = document.getElementById('catalog-container');
  if (!catalog) return;

  const select = document.getElementById('categoryFilter');
  const category = select ? select.value : 'all';
  const list = category === 'all' ? SERVICIOS : SERVICIOS.filter(s => s.category === category);

  catalog.innerHTML = list.map(serviceImageCard).join('');

  const countEl = document.getElementById('serviceCount');
  if (countEl) countEl.textContent = list.length;

  const noResults = document.getElementById('noResults');
  if (noResults) noResults.classList.toggle('d-none', list.length > 0);
}

function resetFilters() {
  const select = document.getElementById('categoryFilter');
  if (select) select.value = 'all';
  applyFilters();
}

document.addEventListener('DOMContentLoaded', () => {
  renderServices();
  console.log('✅ Servicios renderizados correctamente');
});
