/**
 * ============================================================================
 * MOTOR CLASIFICADOR Y PARSER DE MENSAJES (REGLA DE LAS 6:00 PM)
 * ============================================================================
 * - Todos los pendientes inician en AMARILLO ('Media').
 * - Si pasan de las 6:00 PM (18:00 hrs), se marcan automáticamente como URGENTES ('Alta').
 */

const SISTEMAS_KEYWORDS = [
  'servidor', 'red', 'internet', 'wifi', 'wi-fi', 'compaq', 'contpaq', 'impresora',
  'zebra', 'computadora', 'pc', 'laptop', 'sistema', 'correo', 'outlook', 'gmail',
  'erp', 'sql', 'licencia', 'ip', 'switch', 'router', 'facturación', 'facturacion',
  'terminal', 'timeout', 'vpn', 'teclado', 'mouse', 'monitor', 'pantalla', 'windows',
  'office', 'excel', 'antivirus', 'formateo', 'cable de red', 'ethernet'
];

const CLIENTES_KEYWORDS = [
  'cliente', 'clientes', 'prospecto', 'pedido', 'comprador', 'venta', 'ventas',
  'orden de compra', 'distribuidor', 'entregar a cliente', 'sucursal', 'cotizame', 'cotízame'
];

/**
 * Evalúa si la hora extraída del mensaje o la hora actual del sistema
 * ya pasa de las 6:00 de la tarde (18:00 hrs).
 */
function isAfterSixPm(extractedTimeStr) {
  const now = new Date();
  if (now.getHours() >= 18) {
    return true;
  }

  if (!extractedTimeStr) return false;
  const lower = String(extractedTimeStr).toLowerCase().trim();

  // Buscar hora y minutos: ej. "6:05 p.m.", "18:30", "7:15 pm"
  const match = lower.match(/(\d{1,2}):(\d{2})/);
  if (!match) return false;

  let hour = parseInt(match[1], 10);
  const isPm = lower.includes('p.m') || lower.includes('pm') || lower.includes('p. m');
  const isAm = lower.includes('a.m') || lower.includes('am') || lower.includes('a. m');

  if (isPm && hour < 12) {
    hour += 12;
  } else if (isAm && hour === 12) {
    hour = 0;
  }

  return hour >= 18;
}

function parseWhatsAppAndRawTextLocal(rawInput) {
  const raw = (rawInput || '').trim();
  let sender = 'Sin especificar';
  let cleanText = raw;

  const nowTime = new Date().toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true });
  const nowDate = new Date().toLocaleDateString('es-MX');
  let dateTimeFormatted = `[${nowTime}, ${nowDate}]`;
  let extractedTime = nowTime;
  let extractedDate = nowDate;

  const waBracketRegex = /^\[([^\]]+)\]\s*([^:]{1,60}):\s*([\s\S]+)$/;
  const waDashRegex = /^(\d{1,2}\/\d{1,2}\/\d{2,4},?\s*[^\n-]+?)\s*-\s*([^:]{1,60}):\s*([\s\S]+)$/;
  const simpleSenderRegex = /^(?:De:\s*)?([A-Za-zÁÉÍÓÚáéíóúÑñ0-9 .()_-]{2,45}):\s+([\s\S]+)$/;

  const m1 = raw.match(waBracketRegex);
  const m2 = raw.match(waDashRegex);
  const m3 = raw.match(simpleSenderRegex);

  if (m1) {
    const bracketInside = m1[1].trim();
    dateTimeFormatted = `[${bracketInside}]`;
    const metaParts = bracketInside.split(',');
    if (metaParts.length >= 2) {
      const p0 = metaParts[0].trim();
      const p1 = metaParts.slice(1).join(',').trim();
      if (p0.includes(':')) {
        extractedTime = p0;
        extractedDate = p1;
      } else {
        extractedDate = p0;
        extractedTime = p1;
      }
    }
    sender = m1[2].trim();
    cleanText = m1[3].trim();
  } else if (m2) {
    const dtInside = m2[1].trim();
    dateTimeFormatted = `[${dtInside}]`;
    extractedTime = dtInside;
    sender = m2[2].trim();
    cleanText = m2[3].trim();
  } else if (m3) {
    sender = m3[1].trim();
    cleanText = m3[2].trim();
  }

  const lower = cleanText.toLowerCase();

  // Clasificación dinámica según las opciones del usuario
  const availableAreas = (window.AppState && window.AppState.settings && Array.isArray(window.AppState.settings.areas))
    ? window.AppState.settings.areas
    : ['Refacciones', 'Sistemas'];

  const currentFilterArea = window.AppState && window.AppState.filters && window.AppState.filters.area;
  let area = (currentFilterArea && currentFilterArea !== 'all' && availableAreas.includes(currentFilterArea))
    ? currentFilterArea
    : (availableAreas[0] || 'General');

  if (!currentFilterArea || currentFilterArea === 'all') {
    let matchedCustom = false;
    for (const a of availableAreas) {
      if (lower.includes(a.toLowerCase())) {
        area = a;
        matchedCustom = true;
        break;
      }
    }
    if (!matchedCustom) {
      const sistOption = availableAreas.find(a => a.toLowerCase().includes('sistema'));
      const cliOption = availableAreas.find(a => a.toLowerCase().includes('client'));
      if (sistOption && SISTEMAS_KEYWORDS.some(kw => lower.includes(kw))) {
        area = sistOption;
      } else if (cliOption && CLIENTES_KEYWORDS.some(kw => lower.includes(kw))) {
        area = cliOption;
      }
    }
  }

  // REGLA DE NEGOCIO:
  // Todos los pendientes están en AMARILLO ('Media'), pero si pasan de las 6:00 PM son URGENTES ('Alta')
  const urgency = isAfterSixPm(extractedTime) ? 'Alta' : 'Media';

  return {
    sender,
    text: cleanText,
    area,
    urgency,
    dateTimeFormatted,
    timestamp: extractedTime,
    date: extractedDate
  };
}

async function parseMessageSmart(rawText, apiKey) {
  const localResult = parseWhatsAppAndRawTextLocal(rawText);
  const key = (apiKey || '').trim();

  if (!key) return localResult;

  const availableAreas = (window.AppState && window.AppState.settings && Array.isArray(window.AppState.settings.areas))
    ? window.AppState.settings.areas
    : ['Refacciones', 'Sistemas'];

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Extrae en formato JSON los datos de este mensaje. Opciones de área disponibles: [${availableAreas.join(', ')}]. Campos requeridos: {"sender": string, "text": string, "area": string}. Mensaje: ${rawText}`
          }]
        }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (!response.ok) return localResult;
    const data = await response.json();
    const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonText) return localResult;

    const parsedAI = JSON.parse(jsonText);
    const validArea = availableAreas.includes(parsedAI.area) ? parsedAI.area : localResult.area;

    return {
      ...localResult,
      sender: parsedAI.sender || localResult.sender,
      text: parsedAI.text || localResult.text,
      area: validArea
    };
  } catch (err) {
    return localResult;
  }
}

window.AppParser = {
  parseWhatsAppAndRawTextLocal,
  parseMessageSmart,
  isAfterSixPm
};
