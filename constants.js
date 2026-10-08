const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbx0fmG1PYBIREwHKpLFb6B9sUPCwaeLvmT7EHO9FRtP1Lc5lxP_TOwTrmBcWJaFegVf/exec',

  business: {
    name: "Barber",
    phone: "529514990142",
    address: "Centro Histórico, 68000 Oaxaca de Juárez, Oax.",
    schedule: "Lunes a Sábado: 9:00 AM - 9:00 PM | Domingo: 10:00 AM - 6:00 PM",
    map: {
      query: "Centro Histórico, Oaxaca de Juárez, Oax.",
      directionsUrl: "https://www.google.com/maps/search/?api=1&query=Centro+Hist%C3%B3rico+Oaxaca+de+Ju%C3%A1rez"
    },
    socials: {
      facebook: "https://facebook.com/#",
      instagram: "https://instagram.com/#"
    }
  },

  // Horarios de atención para generar slots (24h, minutos)
  horario: {
    semana: { inicio: "09:00", fin: "21:00" },   // Lun-Sáb
    domingo: { inicio: "10:00", fin: "18:00" }
  },

  topAlert: {
    text: "✂️ ¡Bienvenido a Barber! Agenda tu cita y obtén un 10% de descuento en tu primer corte."
  },

  navbar: {
    links: [
      { name: "Inicio", url: "index.html" },
      { name: "Servicios", url: "servicios.html" },
      { name: "Equipo", url: "index.html#equipo" },
      { name: "Ubicación", url: "index.html#ubicacion" }
    ]
  }
};