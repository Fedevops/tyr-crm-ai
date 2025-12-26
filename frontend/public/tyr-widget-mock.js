/**
 * TYR Live Pulse Widget Mock
 * Script simulado para testar o rastreamento de visitantes
 * 
 * Para usar em desenvolvimento, adicione este script em uma página HTML:
 * <script src="/tyr-widget-mock.js"></script>
 */

(function() {
  'use strict';

  const API_URL = 'http://localhost:8000';
  const TENANT_ID = 1; // Em produção, isso viria da configuração do widget

  // Gerar visitor_id único
  const visitorId = 'visitor_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  // Localizações simuladas (lat, lng, city, country)
  const locations = [
    { lat: -23.5505, lng: -46.6333, city: 'São Paulo', country: 'Brasil' },
    { lat: -22.9068, lng: -43.1729, city: 'Rio de Janeiro', country: 'Brasil' },
    { lat: -19.9167, lng: -43.9345, city: 'Belo Horizonte', country: 'Brasil' },
    { lat: -30.0346, lng: -51.2177, city: 'Porto Alegre', country: 'Brasil' },
    { lat: -25.4284, lng: -49.2733, city: 'Curitiba', country: 'Brasil' },
    { lat: 40.7128, lng: -74.0060, city: 'New York', country: 'USA' },
    { lat: 51.5074, lng: -0.1278, city: 'London', country: 'UK' },
    { lat: 48.8566, lng: 2.3522, city: 'Paris', country: 'France' },
  ];

  // Selecionar localização aleatória
  const location = locations[Math.floor(Math.random() * locations.length)];

  // Simular IP
  const ip = '192.168.' + Math.floor(Math.random() * 255) + '.' + Math.floor(Math.random() * 255);

  // Páginas simuladas
  const pages = [
    '/',
    '/about',
    '/products',
    '/contact',
    '/pricing',
    '/blog',
  ];

  let currentPage = pages[Math.floor(Math.random() * pages.length)];
  let duration = 0;
  let heartbeatInterval = null;
  let pageChangeInterval = null;

  // Registrar visitante
  async function registerVisitor() {
    try {
      const response = await fetch(`${API_URL}/api/live-pulse/visitors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          visitor_id: visitorId,
          ip: ip,
          latitude: location.lat,
          longitude: location.lng,
          city: location.city,
          country: location.country,
          current_page: currentPage,
        }),
      });

      if (response.ok) {
        console.log('[TYR Widget] Visitante registrado:', visitorId);
        startHeartbeat();
        simulatePageChanges();
      }
    } catch (error) {
      console.error('[TYR Widget] Erro ao registrar visitante:', error);
    }
  }

  // Heartbeat - atualizar atividade periodicamente
  function startHeartbeat() {
    heartbeatInterval = setInterval(async () => {
      duration += 5;
      try {
        await fetch(`${API_URL}/api/live-pulse/visitors/${visitorId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            current_page: currentPage,
          }),
        });
      } catch (error) {
        console.error('[TYR Widget] Erro no heartbeat:', error);
      }
    }, 5000); // A cada 5 segundos
  }

  // Simular mudanças de página
  function simulatePageChanges() {
    pageChangeInterval = setInterval(() => {
      if (Math.random() > 0.7) { // 30% de chance de mudar de página
        currentPage = pages[Math.floor(Math.random() * pages.length)];
        console.log('[TYR Widget] Página alterada para:', currentPage);
      }
    }, 15000); // A cada 15 segundos
  }

  // Inicializar quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerVisitor);
  } else {
    registerVisitor();
  }

  // Limpar intervalos quando a página for fechada
  window.addEventListener('beforeunload', () => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (pageChangeInterval) clearInterval(pageChangeInterval);
  });

  // Expor funções globais para debug
  window.TYRWidget = {
    visitorId: visitorId,
    location: location,
    currentPage: currentPage,
    stop: () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (pageChangeInterval) clearInterval(pageChangeInterval);
    },
  };

  console.log('[TYR Widget] Widget inicializado. Visitor ID:', visitorId);
})();

