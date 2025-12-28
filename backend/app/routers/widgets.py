from fastapi import APIRouter, Request, HTTPException, status, Query, Depends
from fastapi.responses import Response
from pathlib import Path
from sqlmodel import Session, select
from app.database import get_session
from app.models import Form, FormField, FormFieldType

router = APIRouter()

@router.get("/widgets/tyr-live-pulse.js")
async def get_live_pulse_widget(request: Request):
    """Serve o script do widget Live Pulse"""
    # Widget JavaScript completo
    widget_code = """
(function() {
  'use strict';

  console.log('[TYR Widget] Script carregado');

  // Verificar se já foi carregado
  if (window.TYRLivePulse) {
    console.log('[TYR Widget] Já foi carregado anteriormente');
    return;
  }

  // Configuração padrão
  const defaultConfig = {
    apiUrl: 'http://localhost:8000',
    tenantId: 1,
    position: 'bottom-right',
    primaryColor: '#3b82f6',
    buttonText: 'Fale Conosco',
  };

  // Mesclar com configuração fornecida
  const config = window.TYR_CONFIG ? { ...defaultConfig, ...window.TYR_CONFIG } : defaultConfig;

  // Gerar visitor_id único
  function getVisitorId() {
    let visitorId = localStorage.getItem('tyr_visitor_id');
    if (!visitorId) {
      visitorId = 'visitor_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('tyr_visitor_id', visitorId);
    }
    return visitorId;
  }

  // Obter localização aproximada (simulada)
  function getLocation() {
    // Em produção, usar serviço de geolocalização real
    const locations = [
      { lat: -23.5505, lng: -46.6333, city: 'São Paulo', country: 'Brasil' },
      { lat: -22.9068, lng: -43.1729, city: 'Rio de Janeiro', country: 'Brasil' },
      { lat: -19.9167, lng: -43.9345, city: 'Belo Horizonte', country: 'Brasil' },
      { lat: 40.7128, lng: -74.0060, city: 'New York', country: 'USA' },
      { lat: 51.5074, lng: -0.1278, city: 'London', country: 'UK' },
    ];
    return locations[Math.floor(Math.random() * locations.length)];
  }

  // Obter IP (simulado)
  function getIP() {
    return '192.168.' + Math.floor(Math.random() * 255) + '.' + Math.floor(Math.random() * 255);
  }

  const visitorId = getVisitorId();
  const location = getLocation();
  const ip = getIP();
  let currentPage = window.location.pathname;
  let duration = 0;
  let startTime = Date.now();
  let pagesVisited = [currentPage]; // Rastrear páginas visitadas
  let heartbeatInterval = null;
  let pageChangeInterval = null;
  let ws = null;
  let chatOpen = false;
  let visitorName = '';
  let visitorEmail = '';
  let chatInitiated = false;
  let reportSent = false;

  // Registrar visitante
  async function registerVisitor() {
    try {
      console.log('[TYR Widget] Registrando visitante:', visitorId, 'Tenant:', config.tenantId);
      const url = config.apiUrl + '/api/live-pulse/visitors?tenant_id=' + config.tenantId;
      console.log('[TYR Widget] URL:', url);
      
      const response = await fetch(url, {
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

      console.log('[TYR Widget] Resposta do servidor:', response.status, response.statusText);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[TYR Widget] Visitante registrado com sucesso:', data);
        startHeartbeat();
        trackPageChanges();
      } else {
        const errorText = await response.text();
        console.error('[TYR Widget] Erro ao registrar visitante:', response.status, errorText);
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
        await fetch(config.apiUrl + '/api/live-pulse/visitors/' + visitorId + '?tenant_id=' + config.tenantId, {
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
    }, 5000);
  }

  // Rastrear mudanças de página
  function trackPageChanges() {
    let lastPage = currentPage;
    pageChangeInterval = setInterval(() => {
      if (window.location.pathname !== lastPage) {
        lastPage = window.location.pathname;
        currentPage = lastPage;
        // Adicionar página à lista se ainda não estiver
        if (!pagesVisited.includes(currentPage)) {
          pagesVisited.push(currentPage);
        }
      }
    }, 1000);
  }

  // Enviar relatório quando visitante sair
  async function sendVisitReport() {
    if (reportSent) return; // Evitar envio duplicado
    reportSent = true;

    try {
      const totalDuration = Math.floor((Date.now() - startTime) / 1000);
      
      await fetch(config.apiUrl + '/api/live-pulse/visitors/' + visitorId + '/report?tenant_id=' + config.tenantId, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          visitor_id: visitorId,
          pages_visited: pagesVisited,
          total_duration: totalDuration,
          chat_initiated: chatInitiated,
        }),
      });
      console.log('[TYR Widget] Relatório de visita enviado');
    } catch (error) {
      console.error('[TYR Widget] Erro ao enviar relatório:', error);
    }
  }

  // Criar widget de chat
  function createChatWidget() {
    console.log('[TYR Widget] Criando widget de chat...');
    const widget = document.createElement('div');
    widget.id = 'tyr-chat-widget';
    widget.style.cssText = `
      position: fixed;
      ${config.position === 'bottom-right' ? 'right: 20px;' : 'left: 20px;'}
      bottom: 20px;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      pointer-events: none;
    `;

    // Botão flutuante
    const button = document.createElement('button');
    button.id = 'tyr-chat-button';
    button.textContent = config.buttonText;
    button.style.cssText = `
      background: ${config.primaryColor};
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 25px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: transform 0.2s;
      pointer-events: auto;
    `;
    button.onmouseover = () => button.style.transform = 'scale(1.05)';
    button.onmouseout = () => button.style.transform = 'scale(1)';
    button.onclick = toggleChat;

    widget.appendChild(button);

    // Janela de chat
    const chatWindow = document.createElement('div');
    chatWindow.id = 'tyr-chat-window';
    chatWindow.style.cssText = `
      display: none;
      position: fixed;
      ${config.position === 'bottom-right' ? 'right: 20px;' : 'left: 20px;'}
      bottom: 80px;
      width: 350px;
      max-height: calc(100vh - 100px);
      height: 500px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      flex-direction: column;
      z-index: 10000;
      overflow: hidden;
      pointer-events: auto;
      touch-action: auto;
    `;

    // Header do chat
    const header = document.createElement('div');
    header.style.cssText = `
      background: ${config.primaryColor};
      color: white;
      padding: 16px;
      border-radius: 12px 12px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    header.innerHTML = `
      <div>
        <div style="font-weight: 600;">Atendimento</div>
        <div style="font-size: 12px; opacity: 0.9;">Online agora</div>
      </div>
      <button id="tyr-chat-close" style="background: none; border: none; color: white; cursor: pointer; font-size: 20px;">×</button>
    `;
    header.querySelector('#tyr-chat-close').onclick = toggleChat;

    // Área de mensagens
    const messagesArea = document.createElement('div');
    messagesArea.id = 'tyr-messages';
    messagesArea.style.cssText = `
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 16px;
      background: #f5f5f5;
      min-height: 0;
    `;

    // Formulário inicial (captura de lead)
    const formArea = document.createElement('div');
    formArea.id = 'tyr-form-area';
    formArea.style.cssText = `
      padding: 16px;
      background: white;
    `;
    formArea.innerHTML = `
      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">Nome</label>
        <input type="text" id="tyr-name" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
      </div>
      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">Email</label>
        <input type="email" id="tyr-email" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
      </div>
      <button id="tyr-start-chat" style="width: 100%; padding: 10px; background: ${config.primaryColor}; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">Iniciar Conversa</button>
    `;

    // Input de mensagem (aparece após iniciar chat)
    const inputArea = document.createElement('div');
    inputArea.id = 'tyr-input-area';
    inputArea.style.cssText = `
      display: none;
      padding: 16px;
      border-top: 1px solid #eee;
      background: white;
      border-radius: 0 0 12px 12px;
    `;
    inputArea.innerHTML = `
      <div style="display: flex; gap: 8px;">
        <input type="text" id="tyr-message-input" placeholder="Digite sua mensagem..." style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 20px; outline: none;">
        <button id="tyr-send-button" style="background: ${config.primaryColor}; color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer;">Enviar</button>
      </div>
    `;

    chatWindow.appendChild(header);
    chatWindow.appendChild(messagesArea);
    chatWindow.appendChild(formArea);
    chatWindow.appendChild(inputArea);

    widget.appendChild(chatWindow);
    document.body.appendChild(widget);
    console.log('[TYR Widget] Widget adicionado ao DOM');

    // Event listeners
    document.getElementById('tyr-start-chat').onclick = startChat;
    document.getElementById('tyr-send-button').onclick = sendMessage;
    document.getElementById('tyr-message-input').onkeypress = (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    };
    console.log('[TYR Widget] Event listeners configurados');
  }

  function toggleChat() {
    chatOpen = !chatOpen;
    const chatWindow = document.getElementById('tyr-chat-window');
    const button = document.getElementById('tyr-chat-button');
    
    if (chatOpen) {
      chatWindow.style.display = 'flex';
      button.style.display = 'none';
    } else {
      chatWindow.style.display = 'none';
      button.style.display = 'block';
    }
  }

  async function startChat() {
    const nameInput = document.getElementById('tyr-name');
    const emailInput = document.getElementById('tyr-email');
    
    visitorName = nameInput.value.trim();
    visitorEmail = emailInput.value.trim();

    if (!visitorName || !visitorEmail) {
      alert('Por favor, preencha nome e email');
      return;
    }

    // Atualizar visitante com nome e email
    try {
      await fetch(config.apiUrl + '/api/live-pulse/visitors/' + visitorId + '?tenant_id=' + config.tenantId, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: visitorName,
          email: visitorEmail,
        }),
      });
    } catch (error) {
      console.error('[TYR Widget] Erro ao atualizar visitante:', error);
    }

    // Esconder formulário e mostrar input de mensagem
    document.getElementById('tyr-form-area').style.display = 'none';
    document.getElementById('tyr-input-area').style.display = 'block';

    // Marcar que chat foi iniciado
    chatInitiated = true;

    // Conectar WebSocket
    connectWebSocket();

    // Adicionar mensagem de boas-vindas
    addMessage('Sistema', 'Olá! Como posso ajudá-lo hoje?', 'system');
  }

  function connectWebSocket() {
    const wsUrl = config.apiUrl.replace('http://', 'ws://').replace('https://', 'wss://');
    ws = new WebSocket(wsUrl + '/api/live-pulse/ws/visitors/' + visitorId + '?tenant_id=' + config.tenantId);

    ws.onopen = () => {
      console.log('[TYR Widget] WebSocket conectado');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'message') {
        addMessage('Operador', data.message, 'operator');
      }
    };

    ws.onerror = (error) => {
      console.error('[TYR Widget] Erro no WebSocket:', error);
    };

    ws.onclose = () => {
      console.log('[TYR Widget] WebSocket desconectado');
      // Tentar reconectar após 3 segundos
      setTimeout(connectWebSocket, 3000);
    };
  }

  function sendMessage() {
    const input = document.getElementById('tyr-message-input');
    const message = input.value.trim();

    if (!message) return;

    // Adicionar mensagem localmente
    addMessage(message, 'visitor');

    // Enviar via WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'message',
        message: message,
      }));
    }

    input.value = '';
  }

  function addMessage(sender, text, type) {
    const messagesArea = document.getElementById('tyr-messages');
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
      margin-bottom: 12px;
      display: flex;
      ${type === 'visitor' ? 'justify-content: flex-end;' : 'justify-content: flex-start;'}
    `;

    const bubble = document.createElement('div');
    bubble.style.cssText = `
      max-width: 70%;
      padding: 10px 14px;
      border-radius: 18px;
      font-size: 14px;
      ${type === 'visitor' 
        ? 'background: ' + config.primaryColor + '; color: white;' 
        : type === 'system'
        ? 'background: #e0e0e0; color: #666; font-style: italic;'
        : 'background: white; color: #333;'}
    `;
    bubble.innerHTML = `
      <div style="font-weight: 600; font-size: 12px; margin-bottom: 4px; opacity: 0.8;">${sender}</div>
      <div>${text}</div>
    `;

    messageDiv.appendChild(bubble);
    messagesArea.appendChild(messageDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  // API pública
  window.TYRLivePulse = {
    init: function(customConfig) {
      console.log('[TYR Widget] Inicializando com config:', customConfig);
      if (customConfig) {
        Object.assign(config, customConfig);
      }
      console.log('[TYR Widget] Config final:', config);
      registerVisitor();
      createChatWidget();
    },
    open: toggleChat,
    close: toggleChat,
  };
  
  console.log('[TYR Widget] API TYRLivePulse registrada');

  // Auto-inicializar se TYR_CONFIG estiver disponível
  if (window.TYR_CONFIG) {
    console.log('[TYR Widget] TYR_CONFIG encontrado, inicializando...', window.TYR_CONFIG);
    window.TYRLivePulse.init(window.TYR_CONFIG);
  } else {
    console.warn('[TYR Widget] TYR_CONFIG não encontrado. O widget não será inicializado automaticamente.');
    console.log('[TYR Widget] Para inicializar manualmente, defina window.TYR_CONFIG e chame window.TYRLivePulse.init()');
  }

  // Enviar relatório quando visitante sair
  window.addEventListener('beforeunload', function() {
    sendVisitReport();
  });

  // Também enviar quando a página ficar oculta (mobile)
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      sendVisitReport();
    }
  });
})();
"""
    
    # Adicionar headers CORS específicos para widgets (permitir qualquer origem)
    origin = request.headers.get("origin")
    headers = {
        "Content-Type": "application/javascript",
    }
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        headers["Access-Control-Allow-Headers"] = "*"
    else:
        # Se não houver origin (arquivo local), permitir qualquer origem
        headers["Access-Control-Allow-Origin"] = "*"
    
    return Response(content=widget_code, media_type="application/javascript", headers=headers)


@router.get("/widgets/tyr-form.js")
async def get_form_widget(
    request: Request,
    form_id: int = Query(..., description="ID do formulário"),
    session: Session = Depends(get_session)
):
    """Serve o script do widget de formulário"""
    # Buscar formulário
    form = session.get(Form, form_id)
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found"
        )
    
    if not form.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Form is not active"
        )
    
    # Buscar campos do formulário
    fields = session.exec(
        select(FormField).where(FormField.form_id == form.id)
        .order_by(FormField.order)
    ).all()
    
    # Gerar HTML do formulário
    form_fields_html = ""
    for field in fields:
        field_id = f"tyr-form-field-{field.id}"
        required_attr = "required" if field.required else ""
        placeholder_attr = f'placeholder="{field.placeholder}"' if field.placeholder else ""
        
        if field.field_type == FormFieldType.TEXT:
            form_fields_html += f"""
        <div class="tyr-form-field">
          <label for="{field_id}">{field.label}{" *" if field.required else ""}</label>
          <input type="text" id="{field_id}" name="{field.name}" {required_attr} {placeholder_attr}>
        </div>
      """
        elif field.field_type == FormFieldType.EMAIL:
            form_fields_html += f"""
        <div class="tyr-form-field">
          <label for="{field_id}">{field.label}{" *" if field.required else ""}</label>
          <input type="email" id="{field_id}" name="{field.name}" {required_attr} {placeholder_attr}>
        </div>
      """
        elif field.field_type == FormFieldType.PHONE:
            form_fields_html += f"""
        <div class="tyr-form-field">
          <label for="{field_id}">{field.label}{" *" if field.required else ""}</label>
          <input type="tel" id="{field_id}" name="{field.name}" {required_attr} {placeholder_attr}>
        </div>
      """
        elif field.field_type == FormFieldType.TEXTAREA:
            form_fields_html += f"""
        <div class="tyr-form-field">
          <label for="{field_id}">{field.label}{" *" if field.required else ""}</label>
          <textarea id="{field_id}" name="{field.name}" rows="4" {required_attr} {placeholder_attr}></textarea>
        </div>
      """
        elif field.field_type == FormFieldType.SELECT:
            options_html = ""
            if field.options:
                for option in field.options:
                    options_html += f'<option value="{option}">{option}</option>'
            form_fields_html += f"""
        <div class="tyr-form-field">
          <label for="{field_id}">{field.label}{" *" if field.required else ""}</label>
          <select id="{field_id}" name="{field.name}" {required_attr}>
            <option value="">Selecione...</option>
            {options_html}
          </select>
        </div>
      """
        elif field.field_type == FormFieldType.NUMBER:
            form_fields_html += f"""
        <div class="tyr-form-field">
          <label for="{field_id}">{field.label}{" *" if field.required else ""}</label>
          <input type="number" id="{field_id}" name="{field.name}" {required_attr} {placeholder_attr}>
        </div>
      """
        elif field.field_type == FormFieldType.DATE:
            form_fields_html += f"""
        <div class="tyr-form-field">
          <label for="{field_id}">{field.label}{" *" if field.required else ""}</label>
          <input type="date" id="{field_id}" name="{field.name}" {required_attr}>
        </div>
      """
        elif field.field_type == FormFieldType.CHECKBOX:
            form_fields_html += f"""
        <div class="tyr-form-field">
          <label>
            <input type="checkbox" id="{field_id}" name="{field.name}" value="1" {required_attr}>
            {field.label}
          </label>
        </div>
      """
    
    # Widget JavaScript completo
    widget_code = f"""
(function() {{
  'use strict';
  
  console.log('[TYR Form Widget] Script carregado para formulário {form.id}');
  
  // Verificar se já foi carregado
  if (window.TYRForm_{form.id}) {{
    console.log('[TYR Form Widget] Já foi carregado anteriormente');
    return;
  }}
  
  // Obter API URL do data attribute ou usar padrão
  const scriptTag = document.currentScript || document.querySelector('script[data-form-id="{form.id}"]');
  const apiUrl = scriptTag?.getAttribute('data-api-url') || 'http://localhost:8000';
  
  // Criar container do formulário
  function createForm() {{
    const container = document.createElement('div');
    container.id = 'tyr-form-container-{form.id}';
    container.className = 'tyr-form-container';
    container.innerHTML = `
      <style>
        .tyr-form-container {{
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 600px;
          margin: 0 auto;
          padding: 24px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
        .tyr-form-field {{
          margin-bottom: 16px;
        }}
        .tyr-form-field label {{
          display: block;
          font-weight: 500;
          margin-bottom: 6px;
          color: #333;
          font-size: 14px;
        }}
        .tyr-form-field input,
        .tyr-form-field textarea,
        .tyr-form-field select {{
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          box-sizing: border-box;
          font-family: inherit;
        }}
        .tyr-form-field input:focus,
        .tyr-form-field textarea:focus,
        .tyr-form-field select:focus {{
          outline: none;
          border-color: {form.button_color};
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }}
        .tyr-form-submit {{
          width: 100%;
          padding: 12px;
          background: {form.button_color};
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }}
        .tyr-form-submit:hover {{
          opacity: 0.9;
        }}
        .tyr-form-submit:disabled {{
          opacity: 0.6;
          cursor: not-allowed;
        }}
        .tyr-form-message {{
          padding: 12px;
          border-radius: 4px;
          margin-bottom: 16px;
          display: none;
        }}
        .tyr-form-message.success {{
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }}
        .tyr-form-message.error {{
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }}
      </style>
      <div class="tyr-form-message" id="tyr-form-message-{form.id}"></div>
      <form id="tyr-form-{form.id}">
        {form_fields_html}
        <button type="submit" class="tyr-form-submit">{form.button_text}</button>
      </form>
    `;
    
    // Inserir após o script tag ou no body
    if (scriptTag && scriptTag.parentNode) {{
      scriptTag.parentNode.insertBefore(container, scriptTag.nextSibling);
    }} else {{
      document.body.appendChild(container);
    }}
    
    // Adicionar event listener ao formulário
    const formElement = document.getElementById('tyr-form-{form.id}');
    formElement.addEventListener('submit', handleSubmit);
  }}
  
  async function handleSubmit(e) {{
    e.preventDefault();
    
    const formElement = document.getElementById('tyr-form-{form.id}');
    const submitButton = formElement.querySelector('.tyr-form-submit');
    const messageDiv = document.getElementById('tyr-form-message-{form.id}');
    
    // Desabilitar botão
    submitButton.disabled = true;
    submitButton.textContent = 'Enviando...';
    
    // Coletar dados do formulário
    const formData = new FormData(formElement);
    const data = {{}};
    for (const [key, value] of formData.entries()) {{
      data[key] = value;
    }}
    
    try {{
      const response = await fetch(`${{apiUrl}}/api/forms/submit`, {{
        method: 'POST',
        headers: {{
          'Content-Type': 'application/json',
        }},
        body: JSON.stringify({{
          form_id: {form.id},
          data: data
        }})
      }});
      
      const result = await response.json();
      
      if (response.ok && result.success) {{
        // Mostrar mensagem de sucesso
        messageDiv.className = 'tyr-form-message success';
        messageDiv.textContent = '{form.success_message}';
        messageDiv.style.display = 'block';
        
        // Limpar formulário
        formElement.reset();
        
        // Scroll para mensagem
        messageDiv.scrollIntoView({{ behavior: 'smooth', block: 'nearest' }});
      }} else {{
        throw new Error(result.detail || 'Erro ao enviar formulário');
      }}
    }} catch (error) {{
      console.error('[TYR Form Widget] Erro ao enviar formulário:', error);
      messageDiv.className = 'tyr-form-message error';
      messageDiv.textContent = 'Erro ao enviar formulário. Tente novamente.';
      messageDiv.style.display = 'block';
    }} finally {{
      submitButton.disabled = false;
      submitButton.textContent = '{form.button_text}';
    }}
  }}
  
  // API pública
  window.TYRForm_{form.id} = {{
    init: function() {{
      createForm();
    }}
  }};
  
  // Auto-inicializar
  if (document.readyState === 'loading') {{
    document.addEventListener('DOMContentLoaded', createForm);
  }} else {{
    createForm();
  }}
}})();
"""
    
    # Adicionar headers CORS específicos para widgets (permitir qualquer origem)
    origin = request.headers.get("origin")
    headers = {
        "Content-Type": "application/javascript",
    }
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        headers["Access-Control-Allow-Headers"] = "*"
    else:
        headers["Access-Control-Allow-Origin"] = "*"
    
    return Response(content=widget_code, media_type="application/javascript", headers=headers)

