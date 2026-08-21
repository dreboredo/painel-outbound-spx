import React, { useEffect, useState, useRef } from 'react';
import * as htmlToImage from 'html-to-image';
import mascoteImg from './assets/shopito.png';
import { supabase } from './lib/supabase';
import { 
  RefreshCw, Filter, Truck, Clock, Package, Layers, 
  RotateCcw, ChevronDown, Check, Home, Search, Box, 
  FileText, X, Camera, Sun, Moon, Send
} from 'lucide-react';

// =====================================================================
// DESIGN TOKENS - PALETA SHOPEE & REGRAS
// =====================================================================

const CPT_WINDOW_MINUTES = 120;
const AGING_ALERT_MINUTES = 240;

const SHOPEE_PALETTE = {
  orange: '#EE4D2D',
  red: '#B50220',
  navy: '#0D274C',
  blue: '#004AB5',
  lightBlue: '#1665C4',
  cyan: '#218E7E',
  yellow: '#E5A300',
  grayBg: '#F1F2F3',
  grayBorder: '#E9EBED',
  grayText: '#A1A8B4',
  darkText: '#0D274C',
};

const STATUS_SCALE = [
  { max: 33, text: '#218E7E', bg: 'rgba(33, 142, 126, 0.15)', border: '#218E7E' },
  { max: 66, text: '#E5A300', bg: 'rgba(229, 163, 0, 0.18)', border: '#E5A300' },
  { max: Infinity, text: '#B50220', bg: 'rgba(181, 2, 32, 0.22)', border: '#B50220' }
];

const NEUTRAL_THEME = { text: '#94A3B8', border: '#E2E8F0', bg: 'transparent' };

function getStatusTheme(pct) {
  return STATUS_SCALE.find(s => pct <= s.max);
}

function parseAgingMinutes(agingStr) {
  if (!agingStr || agingStr.trim() === '-' || agingStr.trim() === '') return 0;
  
  const str = agingStr.trim().toLowerCase();
  let totalMinutos = 0;

  const matchDias = /(\d+)\s*d/i.exec(str);
  if (matchDias) {
    totalMinutos += (parseInt(matchDias[1], 10) || 0) * 24 * 60;
  }

  const matchHoras = /(\d+)\s*h/i.exec(str);
  if (matchHoras) {
    totalMinutos += (parseInt(matchHoras[1], 10) || 0) * 60;
  }

  const matchMinutos = /(\d+)\s*m/i.exec(str);
  if (matchMinutos) {
    totalMinutos += parseInt(matchMinutos[1], 10) || 0;
  }

  return totalMinutos;
}

function getAgingTheme(agingStr) {
  const minutes = parseAgingMinutes(agingStr);
  const pct = Math.min((minutes / AGING_ALERT_MINUTES) * 100, 100);
  return getStatusTheme(pct);
}

function getCptTheme(cptTimeString, horaAtual) {
  if (!cptTimeString || cptTimeString === '-' || !cptTimeString.includes(':')) return NEUTRAL_THEME;

  const [h, m] = cptTimeString.split(':').map(Number);
  const cptDate = new Date(horaAtual);
  cptDate.setHours(h, m, 0, 0);

  const diffMinutes = (cptDate - horaAtual) / (1000 * 60);

  if (diffMinutes >= 75) return STATUS_SCALE[0];
  if (diffMinutes > 30) return STATUS_SCALE[1];

  return STATUS_SCALE[2];
}

function getDynamicGradient(pct, mirrored = false) {
  const green = 'rgba(33, 142, 126, 0.25)';
  const yellow = 'rgba(229, 163, 0, 0.25)';
  const red = 'rgba(181, 2, 32, 0.25)';

  if (pct <= 33) {
    return green;
  } else if (pct <= 66) {
    return mirrored
      ? `linear-gradient(90deg, ${green} 0%, ${yellow} 100%)`
      : `linear-gradient(270deg, ${green} 0%, ${yellow} 100%)`;
  } else {
    return mirrored
      ? `linear-gradient(90deg, ${green} 0%, ${yellow} 50%, ${red} 100%)`
      : `linear-gradient(270deg, ${green} 0%, ${yellow} 50%, ${red} 100%)`;
  }
}

// =====================================================================
// HELPER PARA PARSEAR TIMESTAMPTZ COMO HORÁRIO LOCAL "LITERAL"
// O Supabase grava os timestamps com sufixo +00 (UTC), mas os valores já
// representam o horário local (Brasil). Se usarmos `new Date(tsString)`
// direto, o navegador converte de UTC para o fuso local e desloca o
// horário (ex: -3h), quebrando exibição, classificação de turno e de
// data operacional. Por isso extraímos os componentes literais da string
// e montamos um Date "local" com eles, ignorando o offset informado.
// =====================================================================

function parseTimestamptzAsLocal(tsString) {
  if (!tsString) return null;

  const match = String(tsString).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) {
    const fallback = new Date(tsString);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  const [, ano, mes, dia, hora, minuto, segundo] = match;
  const dateObj = new Date(
    parseInt(ano, 10),
    parseInt(mes, 10) - 1,
    parseInt(dia, 10),
    parseInt(hora, 10),
    parseInt(minuto, 10),
    parseInt(segundo, 10)
  );

  return isNaN(dateObj.getTime()) ? null : dateObj;
}

// =====================================================================
// HELPER PARA IDENTIFICAÇÃO DE TURNO BASEADO NO CPT REALIZADO
// =====================================================================

function getTurnoFromCptRealizado(tsString) {
  const dateObj = parseTimestamptzAsLocal(tsString);
  if (!dateObj) return null;

  const hours = dateObj.getHours();

  if (hours >= 6 && hours < 14) {
    return 'T1';
  } else if (hours >= 14 && hours < 22) {
    return 'T2';
  } else {
    return 'T3';
  }
}

// =====================================================================
// HELPER PARA CALCULAR A DATA OPERAÇÃO (CORTES ÀS 06H00)
// Operação Comercial: 06:00:00 do dia X até 05:59:59 do dia X+1
// =====================================================================

function formatLocalDateStr(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDataOperacao(tsString) {
  const dateObj = parseTimestamptzAsLocal(tsString);
  if (!dateObj) return null;

  const copy = new Date(dateObj);
  if (copy.getHours() < 6) {
    copy.setDate(copy.getDate() - 1);
  }
  return formatLocalDateStr(copy);
}

function getFilterDateStr(offsetDays = 0) {
  const now = new Date();
  if (now.getHours() < 6) {
    now.setDate(now.getDate() - 1);
  }
  now.setDate(now.getDate() - offsetDays);
  return formatLocalDateStr(now);
}

// =====================================================================
// PARSERS E TRATAMENTO DE STRING/DATA/TIMESTAMPTZ
// =====================================================================

function parseNumeroRua(val) {
  if (!val) return 0;
  const str = String(val);
  const match = str.match(/\d+/g);
  if (match && match.length > 0) {
    return parseInt(match[match.length - 1], 10);
  }
  return 0;
}

function parseCptToDate(cptTimestampStr) {
  if (!cptTimestampStr || cptTimestampStr === '-') return null;

  const partes = cptTimestampStr.split('|');
  const targetStr = partes[partes.length - 1].trim();

  const match = targetStr.match(/(\d{2})-(\d{2})(\d{2}):(\d{2})/);
  if (match) {
    const [_, dia, mes, hora, minuto] = match;
    const anoAtual = new Date().getFullYear();
    return new Date(anoAtual, parseInt(mes, 10) - 1, parseInt(dia, 10), parseInt(hora, 10), parseInt(minuto, 10));
  }

  return null;
}

function extractLastTime(cptTimestampStr) {
  const dateObj = parseCptToDate(cptTimestampStr);
  if (dateObj && !isNaN(dateObj.getTime())) {
    const h = String(dateObj.getHours()).padStart(2, '0');
    const m = String(dateObj.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return '-';
}

function formatTimestamptzToTime(tsString, includeSeconds = false) {
  const dateObj = parseTimestamptzAsLocal(tsString);
  if (!dateObj) return '-';
  const h = String(dateObj.getHours()).padStart(2, '0');
  const m = String(dateObj.getMinutes()).padStart(2, '0');
  if (!includeSeconds) return `${h}:${m}`;
  const s = String(dateObj.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function limparNomeDestino(str) {
  if (!str) return '';

  const tratarUnico = (item) => {
    let clean = String(item).trim();

    clean = clean.replace(/\[?\d*\]?SoC[_\s]ES[_\s]Viana/gi, '').trim();
    clean = clean.replace(/\[.*?\]/g, '').trim();
    clean = clean.replace(/[_]+/g, ' ').trim();
    clean = clean.replace(/(Gravataí)\s*\d+/gi, '$1').trim();
    clean = clean.replace(/\s+\d+\s*$/g, '').trim();

    return clean;
  };

  const partes = String(str).split('|').map(tratarUnico).filter(Boolean);
  return partes.join(', ');
}

function parseDestinosRua(val) {
  if (!val) return { exibicao: 'Sem Destino', lista: [] };

  const exibicaoLimpa = limparNomeDestino(val);
  const lista = exibicaoLimpa.split(',').map(s => s.trim()).filter(Boolean);

  if (lista.length === 0) {
    return { exibicao: 'Sem Destino', lista: [] };
  }

  return {
    exibicao: exibicaoLimpa,
    lista: lista
  };
}

function normalizarDestinoComposto(destinoStr) {
  if (!destinoStr || destinoStr === 'Sem Destino') return 'Sem Destino';
  return destinoStr
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join(', ');
}

// =====================================================================
// COMPONENTE PRINCIPAL
// =====================================================================

export default function App() {
  const [ruas, setRuas] = useState([]);
  const [cptsList, setCptsList] = useState([]);
  const [docasList, setDocasList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ultimaSinc, setUltimaSinc] = useState('');
  
  const [selectedDestinos, setSelectedDestinos] = useState([]);
  const [selectedRuas, setSelectedRuas] = useState([]);
  const [selectedUnitizadores, setSelectedUnitizadores] = useState([]);
  
  const [horaAtual, setHoraAtual] = useState(new Date());
  const [ordenacao, setOrdenacao] = useState('numero');

  const [showReportModal, setShowReportModal] = useState(false);
  const [showExpedidosModal, setShowExpedidosModal] = useState(false);

  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : false;
  });

  const toggleDarkMode = () => {
    setDarkMode(prev => {
      const next = !prev;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  const opcoesUnitizadores = ['Gaiola', 'Scuttle'];

  useEffect(() => {
    fetchAllData();

    const clockTimer = setInterval(() => setHoraAtual(new Date()), 1000);
    const autoRefreshTimer = setInterval(() => {
      fetchAllData();
    }, 10 * 60 * 1000);

    return () => {
      clearInterval(clockTimer);
      clearInterval(autoRefreshTimer);
    };
  }, []);

  async function fetchUltimaSync() {
    const { data, error } = await supabase
      .from('stage_out_ruas')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0 && data[0].updated_at) {
      const dataAtual = new Date(data[0].updated_at);
      const h = String(dataAtual.getHours()).padStart(2, '0');
      const m = String(dataAtual.getMinutes()).padStart(2, '0');
      const s = String(dataAtual.getSeconds()).padStart(2, '0');

      setUltimaSinc(`${h}:${m}:${s}`);
    }
  }

  async function fetchAllData() {
    setLoading(true);

    await Promise.all([
      fetchRuas(),
      fetchTrips(),
      fetchUltimaSync()
    ]);

    setLoading(false);
  }

  async function fetchRuas() {
    const { data, error } = await supabase
      .from('stage_out_ruas')
      .select('*');

    if (!error && data && data.length > 0) {
      const ruasValidas = data.filter(r => {
        const st = String(r.status || '').trim().toLowerCase();
        return st !== 'unavailable';
      });

      const ruasFormatadas = ruasValidas.map(r => {
        const numRua = parseNumeroRua(r.numero_rua);
        const { exibicao, lista } = parseDestinosRua(r.destino);
        const cap = Number(r.capacidade_total) || 0;
        const gaiolas = Number(r.qtd_gaiolas) || 0;
        const scuttles = Number(r.qtd_scuttles) || 0;
        const totalOc = r.total_ocupado !== undefined && r.total_ocupado !== null 
          ? Number(r.total_ocupado) 
          : (gaiolas + scuttles);

        return {
          ...r,
          numero_rua_num: numRua,
          numero_rua_str: String(numRua).padStart(3, '0'),
          destino_exibicao: exibicao,
          destinos_lista: lista,
          capacidade_total: cap,
          qtd_gaiolas: gaiolas,
          qtd_scuttles: scuttles,
          total_ocupado: totalOc
        };
      });

      setRuas(ruasFormatadas);
    } else {
      setRuas([]);
    }
  }

  async function fetchTrips() {
    const { data, error } = await supabase
      .from('trips_cpt')
      .select('*');

    if (!error && data && data.length > 0) {
      const cptsMapeados = data
        .filter(item => String(item.status || '').trim().toLowerCase() !== 'loading')
        .map(item => {
          const dateObj = parseCptToDate(item.cpt_timestamp);
          const horaCpt = extractLastTime(item.cpt_timestamp);
          const destinoLimpo = limparNomeDestino(item.station);
          const pcts = item.pedidos_embalados ? Number(item.pedidos_embalados).toLocaleString('pt-BR') : '0';
          const tipoVeic = item.tipo_veiculo ? String(item.tipo_veiculo).trim() : '-';

          return {
            id: item.id,
            destino: destinoLimpo || 'N/A',
            cpt: horaCpt,
            cptDate: dateObj,
            pacotes: pcts,
            tipoVeiculo: tipoVeic,
            status: item.status
          };
        })
        .filter(item => item.cptDate !== null)
        .sort((a, b) => a.cptDate - b.cptDate)
        .slice(0, 6);

      setCptsList(cptsMapeados);

      const docasAlvo = ['OUT79', 'OUT80', 'OUT81', 'OUT82', 'OUT83', 'OUT84'];
      
      const docasMapeadas = docasAlvo.map(docaId => {
        const tripDoca = data.find(t => String(t.doca_saida || '').toUpperCase().includes(docaId));
        
        if (tripDoca) {
          const numCarregados = Number(tripDoca.pedidos_carregados) || 0;
          const carregadosStr = numCarregados > 0 
            ? `${numCarregados.toLocaleString('pt-BR')} pcts` 
            : '-';

          return {
            id: docaId,
            ativa: true,
            veiculo: limparNomeDestino(tripDoca.station) || tripDoca.tipo_veiculo || 'DOCADO',
            cpt: extractLastTime(tripDoca.cpt_timestamp),
            pedidosCarregados: carregadosStr
          };
        } else {
          return {
            id: docaId,
            ativa: false,
            veiculo: '-',
            cpt: '-',
            pedidosCarregados: '-'
          };
        }
      });

      setDocasList(docasMapeadas);
    }
  }

  const opcoesRuas = Array.from({ length: 58 }, (_, i) => i + 1)
    .filter(n => n !== 57)
    .map(n => String(n).padStart(3, '0'));

  const destinosUnicos = Array.from(
    new Set(ruas.flatMap(r => r.destinos_lista))
  ).filter(Boolean).sort();

  const handleResetFilters = () => {
    setSelectedDestinos([]);
    setSelectedRuas([]);
    setSelectedUnitizadores([]);
  };

  const hasActiveFilters = selectedDestinos.length > 0 || selectedRuas.length > 0 || selectedUnitizadores.length > 0;

  const ruasFiltradasPorDestinoERua = ruas.filter(r => {
    const matchDestino = selectedDestinos.length === 0 || 
      r.destinos_lista.some(dest => selectedDestinos.includes(dest));
    const matchRua = selectedRuas.length === 0 || selectedRuas.includes(r.numero_rua_str);
    return matchDestino && matchRua;
  });

  const capacidadeTotal = ruasFiltradasPorDestinoERua.reduce((acc, r) => acc + r.capacidade_total, 0);
  const totalGaiolas = ruasFiltradasPorDestinoERua.reduce((acc, r) => acc + r.qtd_gaiolas, 0);
  const totalScuttles = ruasFiltradasPorDestinoERua.reduce((acc, r) => acc + r.qtd_scuttles, 0);
  const totalOcupado = ruasFiltradasPorDestinoERua.reduce((acc, r) => acc + r.total_ocupado, 0);
  const pctOcupadaNum = capacidadeTotal > 0 ? (totalOcupado / capacidadeTotal) * 100 : 0;
  const ruasLivresCount = ruasFiltradasPorDestinoERua.filter(r => r.total_ocupado === 0).length;

  const calculaMetricasRua = (rua) => {
    const exibeGaiola = selectedUnitizadores.length === 0 || selectedUnitizadores.includes('Gaiola');
    const exibeScuttle = selectedUnitizadores.length === 0 || selectedUnitizadores.includes('Scuttle');

    const cap = rua.capacidade_total;

    let ocupado = 0;
    if (exibeGaiola) ocupado += rua.qtd_gaiolas;
    if (exibeScuttle) ocupado += rua.qtd_scuttles;

    return { cap, ocupado };
  };

  const sortRuas = (list) => {
    return [...list].sort((a, b) => {
      const metricA = calculaMetricasRua(a);
      const metricB = calculaMetricasRua(b);
      const pctA = metricA.cap > 0 ? (metricA.ocupado / metricA.cap) : 0;
      const pctB = metricB.cap > 0 ? (metricB.ocupado / metricB.cap) : 0;
      const agingA = parseAgingMinutes(a.aging_formatado);
      const agingB = parseAgingMinutes(b.aging_formatado);

      if (ordenacao === 'aging') {
        if (agingB !== agingA) return agingB - agingA;
        return a.numero_rua_num - b.numero_rua_num;
      }

      if (ordenacao === 'ocupacao') {
        if (pctB !== pctA) return pctB - pctA;
        return a.numero_rua_num - b.numero_rua_num;
      }

      return a.numero_rua_num - b.numero_rua_num;
    });
  };

  const ruasPares = sortRuas(ruasFiltradasPorDestinoERua.filter(r => r.numero_rua_num % 2 === 0));
  const ruasImpares = sortRuas(ruasFiltradasPorDestinoERua.filter(r => r.numero_rua_num % 2 !== 0));

  const reportDestinos = React.useMemo(() => {
    const mapa = {};

    ruas.forEach(r => {
      const destOriginal = r.destino_exibicao || 'Sem Destino';
      const destNormalizado = normalizarDestinoComposto(destOriginal);

      if (!mapa[destNormalizado]) {
        mapa[destNormalizado] = { gaiolas: 0, scuttles: 0, total: 0 };
      }
      mapa[destNormalizado].gaiolas += r.qtd_gaiolas;
      mapa[destNormalizado].scuttles += r.qtd_scuttles;
      mapa[destNormalizado].total += r.total_ocupado;
    });

    return Object.entries(mapa)
      .map(([destino, stats]) => ({ destino, ...stats }))
      .filter(item => item.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [ruas]);

  return (
    <div className={`min-h-screen p-4 md:p-6 space-y-5 transition-colors duration-200 font-sans ${
      darkMode ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-800'
    }`}>
      
      {/* CABEÇALHO */}
      <header className={`p-4 rounded-xl border shadow-sm space-y-3 ${
        darkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <img 
              src={mascoteImg} 
              alt="Mascote Shopee" 
              className="h-12 w-auto object-contain" 
            />
            <h1 className={`text-2xl font-black tracking-wider uppercase font-mono ${
              darkMode ? 'text-white' : ''
            }`} style={{ color: darkMode ? undefined : SHOPEE_PALETTE.navy }}>
              Overview Ruas <span className={darkMode ? 'text-slate-600' : 'text-slate-300'}>/</span> Stage Out
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            
            <MultiSelectDropdown
              label="Destinos"
              options={destinosUnicos}
              selected={selectedDestinos}
              setSelected={setSelectedDestinos}
              icon={Filter}
              darkMode={darkMode}
              hasTypeFilter={true}
            />

            <MultiSelectDropdown
              label="Ruas"
              options={opcoesRuas}
              selected={selectedRuas}
              setSelected={setSelectedRuas}
              icon={Home}
              darkMode={darkMode}
            />

            <MultiSelectDropdown
              label="Unitizador"
              options={opcoesUnitizadores}
              selected={selectedUnitizadores}
              setSelected={setSelectedUnitizadores}
              icon={Box}
              darkMode={darkMode}
            />

            <button
              onClick={handleResetFilters}
              disabled={!hasActiveFilters}
              className={`flex items-center gap-1.5 px-3 rounded-lg text-xs font-bold transition h-[38px] ${
                hasActiveFilters
                  ? darkMode 
                    ? 'bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer shadow-sm'
                    : 'bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer shadow-sm'
                  : darkMode
                    ? 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
            >
              <RotateCcw size={14} />
              Limpar
            </button>

            <button
              onClick={fetchAllData}
              className="flex items-center gap-1.5 text-white font-bold px-4 rounded-lg text-xs transition cursor-pointer shadow h-[38px] hover:opacity-90"
              style={{ backgroundColor: SHOPEE_PALETTE.orange }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>

          </div>
        </div>

        <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 text-xs pt-3 border-t ${
          darkMode ? 'text-slate-400 border-slate-700' : 'text-slate-500 border-slate-200'
        }`}>
          <p className="font-medium">Monitoramento Operacional em Tempo Real</p>
          
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={toggleDarkMode}
              title={darkMode ? "Alternar para Modo Claro" : "Alternar para Modo Escuro"}
              className={`flex items-center gap-1.5 px-3 h-[32px] rounded-md text-xs font-bold transition-all cursor-pointer shadow-sm border ${
                darkMode
                  ? 'bg-slate-700 hover:bg-slate-600 text-yellow-400 border-slate-600'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {darkMode ? (
                <>
                  <Sun size={14} className="text-yellow-400" />
                  <span>Modo Claro</span>
                </>
              ) : (
                <>
                  <Moon size={14} className="text-slate-600" />
                  <span>Modo Escuro</span>
                </>
              )}
            </button>

            <button
              onClick={() => setShowReportModal(true)}
              className="flex items-center gap-1.5 px-3 h-[32px] bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs rounded-md shadow-sm transition-all cursor-pointer"
            >
              <FileText size={14} />
              <span>Report Hora a Hora</span>
            </button>

            <div className={`flex items-center gap-1.5 px-2.5 h-[32px] rounded-md border font-mono font-bold text-xs shadow-sm ${
              darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'
            }`}>
              <Clock size={13} className="animate-pulse" style={{ color: SHOPEE_PALETTE.orange }} />
              <span>{horaAtual.toLocaleTimeString('pt-BR')}</span>
            </div>

            {ultimaSinc && (
              <div className={`flex items-center font-mono text-[11px] px-2.5 h-[32px] rounded-md font-semibold ${
                darkMode ? 'bg-slate-700/80 text-slate-300' : 'bg-slate-200/60 text-slate-600'
              }`}>
                Última sync: {ultimaSinc}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* CARDS KPIS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Capacidade Total" value={capacidadeTotal} color={darkMode ? '#60A5FA' : SHOPEE_PALETTE.navy} darkMode={darkMode} />
        <KpiCard label="Gaiolas" value={totalGaiolas} color="#8B5CF6" icon={Package} darkMode={darkMode} />
        <KpiCard label="Scuttles" value={totalScuttles} color="#0284C7" icon={Layers} darkMode={darkMode} />
        <KpiCard label="Total Ocupado" value={totalOcupado} color={darkMode ? '#38BDF8' : SHOPEE_PALETTE.blue} darkMode={darkMode} />
        <KpiCard label="% Ocupada" value={`${pctOcupadaNum.toFixed(2)}%`} color={getStatusTheme(pctOcupadaNum).text} darkMode={darkMode} />
        <KpiCard label="Ruas Livres" value={ruasLivresCount} color={SHOPEE_PALETTE.cyan} icon={Home} highlight darkMode={darkMode} />
      </div>

      {/* CPTS E DOCAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
        <section className={`p-4 rounded-xl border flex flex-col gap-3 shadow-sm ${
          darkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-2 font-bold uppercase text-xs" style={{ color: darkMode ? '#38BDF8' : SHOPEE_PALETTE.blue }}>
            <Clock size={16} />
            <span>Próximos CPTs</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {cptsList.length > 0 ? (
              cptsList.map((item) => <CptCard key={item.id} item={item} darkMode={darkMode} />)
            ) : (
              <div className="col-span-6 text-center text-slate-400 py-3">Sem CPTs disponíveis</div>
            )}
          </div>
        </section>

        <section className={`p-4 rounded-xl border flex flex-col gap-3 shadow-sm ${
          darkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center justify-between font-bold uppercase text-xs">
            <div className="flex items-center gap-2" style={{ color: SHOPEE_PALETTE.cyan }}>
              <Truck size={16} />
              <span>Docas / Veículos Docados</span>
            </div>

            <button
              onClick={() => setShowExpedidosModal(true)}
              className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-[11px] rounded-lg shadow transition cursor-pointer"
            >
              <Send size={13} />
              <span>Veículos Expedidos</span>
            </button>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {docasList.length > 0 ? (
              docasList.map((doca) => <DocaCard key={doca.id} doca={doca} horaAtual={horaAtual} darkMode={darkMode} />)
            ) : (
              <div className="col-span-6 text-center text-slate-400 py-3">Sem Docas ativas</div>
            )}
          </div>
        </section>
      </div>

      {/* GRID DAS RUAS */}
      <div className="pt-2 space-y-4">
        <div className="flex items-center justify-center gap-4 w-full">
          <div className={`h-[1px] flex-1 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
          <h2 className={`text-sm font-black tracking-widest uppercase px-5 py-1.5 rounded-full border shadow-sm ${
            darkMode ? 'bg-slate-800 text-slate-100 border-slate-700' : 'bg-slate-100 text-slate-800 border-slate-300'
          }`}>
            Stage Out — Ruas
          </h2>
          <div className={`h-[1px] flex-1 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
        </div>

        <div className="flex items-center justify-between px-2 text-xs">
          <div className={`font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Pares
          </div>

          <div className={`flex items-center justify-center gap-1.5 p-1 rounded-lg border ${
            darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              onClick={() => setOrdenacao('numero')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer text-xs ${
                ordenacao === 'numero'
                  ? darkMode ? 'bg-slate-700 text-white font-black shadow-sm' : 'bg-white text-slate-900 font-black shadow-sm'
                  : darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Número
            </button>

            <button
              onClick={() => setOrdenacao('aging')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer text-xs ${
                ordenacao === 'aging'
                  ? darkMode ? 'bg-slate-700 text-white font-black shadow-sm' : 'bg-white text-slate-900 font-black shadow-sm'
                  : darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Aging
            </button>

            <button
              onClick={() => setOrdenacao('ocupacao')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer text-xs ${
                ordenacao === 'ocupacao'
                  ? darkMode ? 'bg-slate-700 text-white font-black shadow-sm' : 'bg-white text-slate-900 font-black shadow-sm'
                  : darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ocupação
            </button>
          </div>

          <div className={`font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Ímpares
          </div>
        </div>

        {ruasFiltradasPorDestinoERua.length === 0 ? (
          <div className={`text-center text-sm py-12 border border-dashed rounded-xl ${
            darkMode ? 'border-slate-700 bg-slate-800/50 text-slate-400' : 'border-slate-300 bg-slate-50 text-slate-500'
          }`}>
            Nenhuma rua encontrada para os filtros selecionados.
          </div>
        ) : (
          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className={`hidden lg:block absolute inset-y-0 left-1/2 -translate-x-1/2 w-px border-l border-dashed ${
              darkMode ? 'border-slate-700' : 'border-slate-300'
            }`} />

            <div className="space-y-2.5">
              {ruasPares.length === 0 ? (
                <div className="text-xs text-slate-400 italic px-1 py-4 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                  Nenhuma rua par encontrada.
                </div>
              ) : (
                ruasPares.map((rua, idx) => (
                  <RuaCard key={rua.id || `par-${idx}`} rua={rua} calculaMetricasRua={calculaMetricasRua} darkMode={darkMode} />
                ))
              )}
            </div>

            <div className="space-y-2.5">
              {ruasImpares.length === 0 ? (
                <div className="text-xs text-slate-400 italic px-1 py-4 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                  Nenhuma rua ímpar encontrada.
                </div>
              ) : (
                ruasImpares.map((rua, idx) => (
                  <RuaCard key={rua.id || `impar-${idx}`} rua={rua} mirrored calculaMetricasRua={calculaMetricasRua} darkMode={darkMode} />
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {showReportModal && (
        <ReportModal
          onClose={() => setShowReportModal(false)}
          capacidadeTotal={capacidadeTotal}
          totalOcupado={totalOcupado}
          pctOcupada={pctOcupadaNum}
          reportDestinos={reportDestinos}
          darkMode={darkMode}
        />
      )}

      {showExpedidosModal && (
        <ExpedidosModal
          onClose={() => setShowExpedidosModal(false)}
          darkMode={darkMode}
        />
      )}
    </div>
  );
}

// =====================================================================
// MODAL DE VEÍCULOS EXPEDIDOS
// =====================================================================

function ExpedidosModal({ onClose, darkMode }) {
  const [tripsCompleted, setTripsCompleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTurnos, setSelectedTurnos] = useState([]);
  const [selectedDataFilter, setSelectedDataFilter] = useState('HOJE'); 

  const [selectedTrip, setSelectedTrip] = useState(null);

  useEffect(() => {
    fetchTripsCompleted();
  }, []);

  async function fetchTripsCompleted() {
    setLoading(true);
    const { data, error } = await supabase
      .from('trips_completed')
      .select('*')
      .not('cpt_realizado', 'is', null)
      .order('cpt_realizado', { ascending: false });

    if (!error && data) {
      setTripsCompleted(data);
      if (data.length > 0) {
        setSelectedTrip(data[0]);
      }
    } else {
      setTripsCompleted([]);
    }
    setLoading(false);
  }

  const toggleTurno = (turno) => {
    if (turno === 'TODOS') {
      setSelectedTurnos([]);
      return;
    }

    if (selectedTurnos.includes(turno)) {
      setSelectedTurnos(selectedTurnos.filter(t => t !== turno));
    } else {
      setSelectedTurnos([...selectedTurnos, turno]);
    }
  };

  const filteredTrips = tripsCompleted
    .filter(trip => {
      if (selectedTurnos.length > 0) {
        const turnoCalculado = getTurnoFromCptRealizado(trip.cpt_realizado) || String(trip.turno || '').toUpperCase();
        if (!selectedTurnos.includes(turnoCalculado)) return false;
      }

      const refDateStr = trip.cpt_realizado;
      if (!refDateStr) return false;

      const tripOpDate = getDataOperacao(refDateStr);
      if (!tripOpDate) return false;

      if (selectedDataFilter === 'HOJE') {
        if (tripOpDate !== getFilterDateStr(0)) return false;
      } else if (selectedDataFilter === 'D-1') {
        if (tripOpDate !== getFilterDateStr(1)) return false;
      } else if (selectedDataFilter === 'D-2') {
        if (tripOpDate !== getFilterDateStr(2)) return false;
      } else if (selectedDataFilter === 'TODOS') {
        // "Todos" deve considerar apenas a janela dos últimos 3 dias operacionais
        // (Hoje, D-1 e D-2), já que a base possui registros mais antigos que não
        // devem entrar nesse filtro.
        const janelaValida = [getFilterDateStr(0), getFilterDateStr(1), getFilterDateStr(2)];
        if (!janelaValida.includes(tripOpDate)) return false;
      }

      return true;
    })
    .sort((a, b) => {
      // Mantém o agrupamento por data operacional (mais recente primeiro) e,
      // dentro de cada data, ordena do CPT realizado mais recente para o
      // primeiro CPT realizado do dia.
      const dateA = getDataOperacao(a.cpt_realizado);
      const dateB = getDataOperacao(b.cpt_realizado);

      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }

      const tsA = parseTimestamptzAsLocal(a.cpt_realizado);
      const tsB = parseTimestamptzAsLocal(b.cpt_realizado);
      return (tsB?.getTime() || 0) - (tsA?.getTime() || 0);
    });

  const totalPacotesExpedidos = filteredTrips.reduce((acc, t) => acc + (Number(t.pacotes) || 0), 0);
  const totalCarrosExpedidos = filteredTrips.length;
  const sprValue = totalCarrosExpedidos > 0 
    ? (totalPacotesExpedidos / totalCarrosExpedidos).toFixed(0) 
    : 0;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className={`w-full max-w-4xl rounded-2xl shadow-2xl border overflow-hidden flex flex-col my-8 transition-colors ${
        darkMode ? 'bg-slate-800 text-slate-100 border-slate-700' : 'bg-white text-slate-800 border-slate-200'
      }`}>
        
        {/* CABEÇALHO DA MODAL */}
        <div className={`p-4 border-b flex items-center justify-between shrink-0 ${
          darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-2">
            <Send className="text-emerald-500" size={20} />
            <h3 className="text-lg font-black uppercase font-mono tracking-wider">
              Veículos Expedidos
            </h3>
          </div>

          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border shadow-md font-mono ${
              darkMode ? 'bg-slate-900/90 border-slate-700' : 'bg-white border-slate-200'
            }`}>
              <div className="flex flex-col text-right">
                <span className="text-xs font-black text-slate-400 uppercase tracking-wider">SPR (Pacotes/Carro)</span>
                <span className="text-base font-black text-orange-500">
                  {Number(sprValue).toLocaleString('pt-BR')} <span className="text-xs text-slate-400 font-semibold">({totalPacotesExpedidos.toLocaleString('pt-BR')} pcts / {totalCarrosExpedidos} carros)</span>
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
              }`}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* CORPO DA MODAL */}
        <div className="px-4 md:px-6 pb-4 md:pb-6 space-y-4">
          <div className="border-b py-3 border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                Data:
              </span>
              <div className="flex items-center gap-1">
                {[
                  { id: 'HOJE', label: 'HOJE' },
                  { id: 'D-1', label: 'D-1' },
                  { id: 'D-2', label: 'D-2' },
                  { id: 'TODOS', label: 'TODOS' }
                ].map(df => (
                  <button
                    key={df.id}
                    onClick={() => setSelectedDataFilter(df.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      selectedDataFilter === df.id
                        ? 'bg-blue-600 text-white shadow-sm'
                        : darkMode
                        ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {df.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                Turno:
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleTurno('TODOS')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    selectedTurnos.length === 0
                      ? 'bg-orange-500 text-white shadow-sm'
                      : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  TODOS
                </button>

                {['T1', 'T2', 'T3'].map(turno => {
                  const isSelected = selectedTurnos.includes(turno);
                  return (
                    <button
                      key={turno}
                      onClick={() => toggleTurno(turno)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                        isSelected
                          ? 'bg-orange-500 text-white shadow-sm'
                          : darkMode
                          ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span>{turno}</span>
                      {isSelected && <Check size={12} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* TABELA DE EXPEDIÇÕES */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="w-full font-mono text-sm max-h-60 overflow-y-auto">
              <div className={`grid grid-cols-12 uppercase font-bold border-b py-2.5 px-3 items-center sticky top-0 z-10 ${
                darkMode ? 'bg-slate-900/95 border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}>
                <div className="col-span-3 text-center">LT</div>
                <div className="col-span-4 text-center">Destino</div>
                <div className="col-span-3 text-center">CPT Realizado</div>
                <div className="col-span-2 text-center">CPT</div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {loading ? (
                  <div className="py-8 text-center text-slate-400">
                    Carregando dados de expedição...
                  </div>
                ) : filteredTrips.length === 0 ? (
                  <div className="py-8 text-center text-slate-400">
                    Nenhum veículo expedido encontrado para os filtros selecionados.
                  </div>
                ) : (
                  filteredTrips.map((trip) => {
                    const isSelected = selectedTrip?.id_lt === trip.id_lt;

                    const cptRealizadoDate = parseTimestamptzAsLocal(trip.cpt_realizado);
                    const cptPlannedDate = parseTimestamptzAsLocal(trip.cpt);
                    const isCptLate = cptRealizadoDate && cptPlannedDate && cptRealizadoDate >= cptPlannedDate;

                    return (
                      <div
                        key={trip.id_lt}
                        onClick={() => setSelectedTrip(isSelected ? null : trip)}
                        className={`grid grid-cols-12 py-2.5 px-3 cursor-pointer transition-colors items-center ${
                          isSelected
                            ? darkMode
                              ? 'bg-slate-700/80 font-bold'
                              : 'bg-orange-50 font-bold'
                            : darkMode
                            ? 'hover:bg-slate-700/40'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="col-span-3 text-orange-500 font-bold truncate px-2 text-center">{trip.id_lt}</div>
                        <div className="col-span-4 text-center truncate px-2">{limparNomeDestino(trip.destino) || 'N/A'}</div>
                        <div className={`col-span-3 text-center font-bold ${isCptLate ? 'text-red-500' : 'text-emerald-500'}`}>
                          {formatTimestamptzToTime(trip.cpt_realizado, true)}
                        </div>
                        <div className="col-span-2 text-center font-bold text-slate-400">
                          {formatTimestamptzToTime(trip.cpt)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* CARD DE DETALHES DA VIAGEM SELECIONADA */}
          {selectedTrip && (
            <div className={`mt-4 p-4 rounded-xl border space-y-3 animate-in fade-in duration-200 ${
              darkMode ? 'bg-slate-900/80 border-slate-700' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between border-b pb-2 border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-sm text-orange-500">
                    {selectedTrip.id_lt}
                  </span>
                  {selectedTrip.tipo_veiculo && (
                    <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                      {selectedTrip.tipo_veiculo}
                    </span>
                  )}
                </div>
                <span className="font-mono font-bold text-sm text-slate-500 dark:text-slate-400">
                  {selectedTrip.pacotes || 0} PACOTES
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center font-mono">
                <div className={`p-2 rounded border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className="text-xs text-slate-400 uppercase font-sans font-semibold">Destino</div>
                  <div className="font-bold text-sm truncate" title={limparNomeDestino(selectedTrip.destino)}>
                    {limparNomeDestino(selectedTrip.destino) || '-'}
                  </div>
                </div>
                <div className={`p-2 rounded border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className="text-xs text-slate-400 uppercase font-sans font-semibold">Placa</div>
                  <div className="font-bold text-sm">{selectedTrip.placa || '-'}</div>
                </div>
                <div className={`p-2 rounded border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className="text-xs text-slate-400 uppercase font-sans font-semibold">Sacas</div>
                  <div className="font-bold text-sm">{selectedTrip.sacas || 0}</div>
                </div>
                <div className={`p-2 rounded border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className="text-xs text-slate-400 uppercase font-sans font-semibold">Scuttles</div>
                  <div className="font-bold text-sm">{selectedTrip.scuttles || 0}</div>
                </div>
                <div className={`p-2 rounded border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className="text-xs text-slate-400 uppercase font-sans font-semibold">Pallets</div>
                  <div className="font-bold text-sm">{selectedTrip.pallets || 0}</div>
                </div>
                <div className={`p-2 rounded border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className="text-xs text-slate-400 uppercase font-sans font-semibold">VOL</div>
                  <div className="font-bold text-sm">{selectedTrip.vol || 0}</div>
                </div>
              </div>

              {(() => {
                const etaRealizedDate = parseTimestamptzAsLocal(selectedTrip.eta_realizado);
                const etaPlannedDate = parseTimestamptzAsLocal(selectedTrip.eta);
                const isEtaLate = etaRealizedDate && etaPlannedDate && etaRealizedDate >= etaPlannedDate;

                const cptRealizedDate = parseTimestamptzAsLocal(selectedTrip.cpt_realizado);
                const cptPlannedDate = parseTimestamptzAsLocal(selectedTrip.cpt);
                const isCptLate = cptRealizedDate && cptPlannedDate && cptRealizedDate >= cptPlannedDate;

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
                    <div className={`p-2 rounded border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                      <div className="text-xs text-slate-400 uppercase font-sans font-semibold">ETA</div>
                      <div className="font-bold text-sm">{formatTimestamptzToTime(selectedTrip.eta)}</div>
                    </div>

                    <div className={`p-2 rounded border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                      <div className="text-xs text-slate-400 uppercase font-sans font-semibold">ETA Realizado</div>
                      <div className={`font-bold text-sm ${isEtaLate ? 'text-red-500' : 'text-blue-500'}`}>
                        {formatTimestamptzToTime(selectedTrip.eta_realizado)}
                      </div>
                    </div>

                    <div className={`p-2 rounded border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                      <div className="text-xs text-slate-400 uppercase font-sans font-semibold">CPT</div>
                      <div className="font-bold text-sm">{formatTimestamptzToTime(selectedTrip.cpt)}</div>
                    </div>

                    <div className={`p-2 rounded border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                      <div className="text-xs text-slate-400 uppercase font-sans font-semibold">CPT Realizado</div>
                      <div className={`font-bold text-sm ${isCptLate ? 'text-red-500' : 'text-emerald-500'}`}>
                        {formatTimestamptzToTime(selectedTrip.cpt_realizado)}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// MODAL DE REPORT
// =====================================================================

function ReportModal({ onClose, capacidadeTotal, totalOcupado, pctOcupada, reportDestinos, darkMode }) {
  const pctLivre = (100 - pctOcupada).toFixed(2);
  const [copied, setCopied] = useState(false);
  const [capturing, setCapturing] = useState(false);
  
  const printAreaRef = useRef(null);

  const handleCopyPrint = async () => {
    if (!printAreaRef.current) return;
    setCapturing(true);

    try {
      const blob = await htmlToImage.toBlob(printAreaRef.current, {
        quality: 0.95,
        backgroundColor: darkMode ? '#0F172A' : '#FFFFFF',
        pixelRatio: 2,
      });

      if (!blob) {
        alert("Não foi possível gerar a imagem.");
        setCapturing(false);
        return;
      }

      let sucesso = false;

      if (navigator.clipboard && window.ClipboardItem) {
        try {
          const data = [new ClipboardItem({ 'image/png': blob })];
          await navigator.clipboard.write(data);
          sucesso = true;
        } catch (err) {
          console.warn('Bloqueio de clipboard, iniciando download...', err);
        }
      }

      if (!sucesso) {
        const link = document.createElement('a');
        link.download = `Report_Stage_Out_${new Date().toISOString().slice(0, 10)}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
      }

      setCopied(true);
      setCapturing(false);
      setTimeout(() => setCopied(false), 3000);

    } catch (error) {
      console.error('Erro ao tirar o print:', error);
      alert('Erro ao tirar print: ' + error.message);
      setCapturing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className={`w-full max-w-4xl rounded-2xl shadow-2xl border overflow-hidden flex flex-col my-8 transition-colors ${
        darkMode ? 'bg-slate-900 text-slate-100 border-slate-700' : 'bg-white text-slate-800 border-slate-200'
      }`}>
        <div className={`p-3 border-b flex items-center justify-between shrink-0 ${
          darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
        }`}>
          <button
            onClick={onClose}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
              darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-200' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
            }`}
          >
            <X size={16} />
            <span>Voltar ao Dashboard</span>
          </button>

          <h3 className="text-base md:text-lg font-black uppercase font-mono text-orange-500 tracking-wider">
            OVERVIEW RUAS — STAGE OUT (REPORT)
          </h3>

          <button
            onClick={handleCopyPrint}
            disabled={capturing}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold text-xs shadow-sm transition cursor-pointer ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-orange-500 hover:bg-orange-600 text-white'
            }`}
          >
            {copied ? <Check size={16} /> : <Camera size={16} />}
            <span>
              {capturing
                ? 'Gerando Print...'
                : copied
                ? 'Print Copiado!'
                : 'Copiar Print'}
            </span>
          </button>
        </div>

        <div ref={printAreaRef} className={`p-4 transition-colors ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-800'}`}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
            <div className={`md:col-span-1 border rounded-lg overflow-hidden shadow-sm text-xs font-mono font-bold ${
              darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="bg-orange-500 text-white py-2 px-2 text-center font-black font-sans uppercase text-[11px] tracking-wider whitespace-nowrap">
                RESUMO GERAL
              </div>
              <div className={`divide-y ${darkMode ? 'divide-slate-700' : 'divide-slate-200'}`}>
                <div className="py-2 px-2 flex justify-between items-center text-[11px]">
                  <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>CAPACIDADE</span>
                  <span className={`font-black ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>{capacidadeTotal}</span>
                </div>
                <div className="py-2 px-2 flex justify-between items-center text-[11px]">
                  <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>OCUPADO</span>
                  <span className={`font-black ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>{totalOcupado}</span>
                </div>
                <div className={`py-2 px-2 flex justify-between items-center text-[11px] ${
                  darkMode ? 'bg-amber-950/40' : 'bg-amber-50'
                }`}>
                  <span className={darkMode ? 'text-amber-400' : 'text-amber-800'}>% OCUPADA</span>
                  <span className={`font-black ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>{pctOcupada.toFixed(2)}%</span>
                </div>
                <div className={`py-2 px-2 flex justify-between items-center text-[11px] ${
                  darkMode ? 'bg-emerald-950/40' : 'bg-emerald-50'
                }`}>
                  <span className={darkMode ? 'text-emerald-400' : 'text-emerald-800'}>% LIVRE</span>
                  <span className={`font-black ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>{pctLivre}%</span>
                </div>
              </div>
            </div>

            <div className={`md:col-span-3 border rounded-lg overflow-hidden text-xs shadow-sm ${
              darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'
            }`}>
              <div className="bg-orange-500 text-white py-2 px-3 font-black font-sans uppercase text-[11px] tracking-wider flex justify-between items-center">
                <span>DESTINO</span>
                <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
                  <span className="w-14 text-center whitespace-nowrap">GAIOLAS</span>
                  <span className="w-14 text-center whitespace-nowrap">SCUTTLES</span>
                  <span className="w-24 text-center whitespace-nowrap">OCUPAÇÃO TOTAL</span>
                </div>
              </div>

              <div>
                {reportDestinos.length === 0 ? (
                  <div className="text-center text-slate-400 py-6">
                    Nenhum destino ocupado no momento.
                  </div>
                ) : (
                  <div className={`divide-y ${darkMode ? 'divide-slate-700/60' : 'divide-slate-100'}`}>
                    {reportDestinos.map((item, idx) => (
                      <div 
                        key={idx} 
                        className={`flex justify-between items-center py-1.5 px-3 transition ${
                          darkMode ? 'hover:bg-slate-700/40' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span className={`font-bold pr-2 leading-snug ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          {item.destino}
                        </span>
                        
                        <div className="flex items-center gap-3 font-mono text-center shrink-0">
                          <span className={`w-14 font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{item.gaiolas}</span>
                          <span className={`w-14 font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{item.scuttles}</span>
                          <span className={`w-24 font-black rounded py-0.5 px-1 text-center border ${
                            darkMode 
                              ? 'bg-amber-950/60 text-amber-300 border-amber-800' 
                              : 'bg-orange-50 text-slate-900 border-orange-200'
                          }`}>
                            {item.total}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// COMPONENTES AUXILIARES
// =====================================================================

function MultiSelectDropdown({ label, options, selected, setSelected, icon: Icon, darkMode, hasTypeFilter = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => {
    return String(opt).toLowerCase().includes(searchTerm.toLowerCase());
  });

  const toggleOption = (opt) => {
    if (selected.includes(opt)) {
      setSelected(selected.filter(item => item !== opt));
    } else {
      setSelected([...selected, opt]);
    }
  };

  const toggleSelectAll = () => {
    if (selected.length === options.length) {
      setSelected([]);
    } else {
      setSelected([...options]);
    }
  };

  const selectGroup = (type) => {
    let groupItems = [];
    if (type === 'SOC') {
      groupItems = options.filter(o => String(o).toUpperCase().includes('SOC'));
    } else if (type === 'XPT') {
      groupItems = options.filter(o => String(o).toUpperCase().includes('XPT'));
    } else if (type === 'HUB') {
      groupItems = options.filter(o => {
        const u = String(o).toUpperCase();
        return u.includes('HUB') || u.includes('LM HUB');
      });
    }

    const allGroupSelected = groupItems.every(item => selected.includes(item));

    if (allGroupSelected) {
      setSelected(selected.filter(item => !groupItems.includes(item)));
    } else {
      const uniqueNew = Array.from(new Set([...selected, ...groupItems]));
      setSelected(uniqueNew);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 rounded-lg border text-xs h-[38px] shadow-sm font-semibold cursor-pointer ${
          darkMode
            ? 'bg-slate-800 border-slate-700 hover:border-slate-600 text-slate-200'
            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
        }`}
      >
        {Icon && <Icon size={14} style={{ color: SHOPEE_PALETTE.orange }} />}
        <span>
          {selected.length === 0
            ? `Todos (${label})`
            : `${label}: ${selected.length} selecionado(s)`}
        </span>
        <ChevronDown size={14} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
      </button>

      {isOpen && (
        <div className={`absolute right-0 mt-1 w-68 rounded-xl border shadow-xl z-50 p-2 text-xs max-h-88 flex flex-col space-y-1.5 ${
          darkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'
        }`}>
          {options.length > 5 && (
            <div className="relative px-1 pt-1 pb-0.5">
              <Search size={13} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder={`Pesquisar ${label.toLowerCase()}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-7 pr-2 py-1.5 border rounded-lg text-xs outline-none ${
                  darkMode 
                    ? 'bg-slate-900 border-slate-700 focus:border-orange-500 text-slate-200' 
                    : 'bg-slate-50 border-slate-200 focus:border-orange-500 focus:bg-white text-slate-700'
                }`}
              />
            </div>
          )}

          <div
            onClick={toggleSelectAll}
            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer font-bold border-b shrink-0 ${
              darkMode 
                ? 'hover:bg-slate-700 border-slate-700 text-slate-200' 
                : 'hover:bg-slate-100 border-slate-100 text-slate-800'
            }`}
          >
            <div className={`w-4 h-4 rounded border flex items-center justify-center ${
              selected.length === options.length 
                ? 'bg-orange-500 border-orange-500 text-white' 
                : darkMode ? 'border-slate-600' : 'border-slate-300'
            }`}>
              {selected.length === options.length && <Check size={12} />}
            </div>
            <span>Selecionar Todos</span>
          </div>

          {hasTypeFilter && (
            <div className={`flex items-center justify-between gap-1 p-1 rounded-lg border shrink-0 ${
              darkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'
            }`}>
              {['HUB', 'SOC', 'XPT'].map((type) => {
                const groupItems = options.filter(o => {
                  const u = String(o).toUpperCase();
                  if (type === 'HUB') return u.includes('HUB') || u.includes('LM HUB');
                  return u.includes(type);
                });
                const isAllSelected = groupItems.length > 0 && groupItems.every(i => selected.includes(i));

                return (
                  <button
                    key={type}
                    onClick={() => selectGroup(type)}
                    className={`flex-1 py-1 px-1.5 rounded text-[11px] font-black tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      isAllSelected
                        ? 'bg-orange-500 text-white shadow-sm'
                        : darkMode
                        ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <span>{type}</span>
                    {isAllSelected && <Check size={11} />}
                  </button>
                );
              })}
            </div>
          )}

          <div className="overflow-y-auto space-y-0.5 max-h-48 pr-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => {
                const isChecked = selected.includes(opt);
                return (
                  <div
                    key={opt}
                    onClick={() => toggleOption(opt)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer font-medium ${
                      darkMode ? 'hover:bg-slate-700/60 text-slate-200' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      isChecked 
                        ? 'bg-orange-500 border-orange-500 text-white' 
                        : darkMode ? 'border-slate-600' : 'border-slate-300'
                    }`}>
                      {isChecked && <Check size={12} />}
                    </div>
                    <span className="truncate">{opt}</span>
                  </div>
                );
              })
            ) : (
              <div className="text-center text-slate-400 py-3 text-[11px]">Nenhum item encontrado</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, color, icon: Icon, highlight = false, darkMode }) {
  return (
    <div className={`p-3.5 rounded-xl border flex flex-col justify-between shadow-sm transition-all ${
      highlight 
        ? darkMode ? 'bg-teal-950/30 border-teal-800' : 'bg-teal-50/50 border-teal-200'
        : darkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-slate-50 border-slate-200'
    }`}>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={14} style={{ color }} />}
        <span className={`text-[11px] font-bold uppercase tracking-wider truncate ${
          darkMode ? 'text-slate-400' : 'text-slate-500'
        }`}>{label}</span>
      </div>
      <span className="text-3xl font-black font-mono mt-1" style={{ color }}>{value}</span>
    </div>
  );
}

function CptCard({ item, darkMode }) {
  const isArrived = String(item.status || '').trim().toLowerCase() === 'arrived';

  return (
    <div 
      className={`border p-2 rounded-lg text-center flex flex-col items-center justify-center gap-1.5 shadow-sm transition-all min-h-[96px] ${
        isArrived 
          ? darkMode ? 'bg-blue-950/40 border-blue-600' : 'bg-blue-50/80 border-[#1665C4]' 
          : darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}
    >
      <span className={`font-bold text-xs tracking-wide truncate w-full ${darkMode ? 'text-slate-200' : 'text-slate-800'}`} title={item.destino}>
        {item.destino}
      </span>
      <span 
        className="font-mono font-black text-xs leading-none" 
        style={{ color: isArrived ? (darkMode ? '#60A5FA' : SHOPEE_PALETTE.lightBlue) : (darkMode ? '#38BDF8' : SHOPEE_PALETTE.blue) }}
      >
        {item.cpt}
      </span>
      <span className={`text-[10px] font-semibold truncate w-full ${darkMode ? 'text-slate-300' : 'text-slate-600'}`} title={item.tipoVeiculo}>
        {item.tipoVeiculo}
      </span>
      <span className="text-[10px] font-medium text-slate-400 truncate w-full">
        {item.pacotes.includes('pcts') ? item.pacotes : `${item.pacotes} pcts`}
      </span>
    </div>
  );
}

function DocaCard({ doca, horaAtual, darkMode }) {
  const cptTheme = doca.ativa ? getCptTheme(doca.cpt, horaAtual) : NEUTRAL_THEME;

  return (
    <div 
      className="p-2 rounded-lg text-center flex flex-col items-center justify-center gap-1.5 transition-all shadow-sm border-2 min-h-[96px]"
      style={{
        backgroundColor: doca.ativa ? cptTheme.bg : (darkMode ? '#1E293B' : '#F1F2F3'),
        borderColor: doca.ativa ? cptTheme.border : (darkMode ? '#334155' : '#E2E8F0'),
      }}
    >
      <div className="flex items-center justify-center gap-1.5 font-mono font-bold text-xs">
        <span 
          className="w-2 h-2 rounded-full animate-pulse shadow-sm shrink-0"
          style={{
            backgroundColor: doca.ativa ? cptTheme.text : '#CBD5E1',
          }} 
        />
        <span 
          className="font-black"
          style={{ color: doca.ativa ? cptTheme.text : (darkMode ? '#94A3B8' : '#64748B') }}
        >
          {doca.id}
        </span>
      </div>

      <span className={`font-bold text-xs tracking-wide truncate w-full ${
        doca.ativa 
          ? (darkMode ? 'text-slate-100' : 'text-slate-800') 
          : 'text-slate-400'
      }`} title={doca.veiculo}>
        {doca.ativa ? doca.veiculo : '-'}
      </span>

      <span className={`font-mono font-bold text-xs leading-none ${doca.ativa ? '' : 'text-slate-400'}`} style={{ color: doca.ativa ? cptTheme.text : undefined }}>
        {doca.ativa ? doca.cpt : '-'}
      </span>

      <span className={`text-[10px] font-medium truncate w-full ${
        doca.ativa 
          ? (darkMode ? 'text-slate-300' : 'text-slate-600') 
          : 'text-slate-400'
      }`}>
        {doca.ativa ? doca.pedidosCarregados : '-'}
      </span>
    </div>
  );
}

function RuaCard({ rua, mirrored = false, calculaMetricasRua, darkMode }) {
  const { cap, ocupado } = calculaMetricasRua(rua);
  const pct = cap > 0 ? (ocupado / cap) * 100 : 0;
  
  const numStr = rua.numero_rua_str;
  const theme = getStatusTheme(pct);
  const agingTheme = getAgingTheme(rua.aging_formatado);

  const numero = (
    <div className={`font-mono font-black text-xs md:text-sm w-12 text-center shrink-0 py-2.5 rounded-lg border shadow-sm ${
      darkMode 
        ? 'bg-slate-800 text-slate-100 border-slate-700' 
        : 'bg-slate-100 text-slate-800 border-slate-300'
    }`}>
      {numStr}
    </div>
  );

  const dynamicBackground = getDynamicGradient(pct, mirrored);

  const barra = (
    <div className={`flex-1 border rounded-xl p-3 relative overflow-hidden shadow-sm ${
      darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'
    }`}>
      <div
        className={`absolute top-0 bottom-0 transition-all duration-500 ease-out z-0 ${
          mirrored ? 'border-r-2' : 'border-l-2'
        }`}
        style={{
          [mirrored ? 'left' : 'right']: 0,
          width: `${Math.min(pct, 100)}%`,
          background: dynamicBackground,
          borderColor: theme.border,
        }}
      />

      <div className={`relative z-10 flex items-center justify-between gap-3 w-full ${mirrored ? '' : 'flex-row-reverse'}`}>
        <span className={`font-black tracking-wide text-xs md:text-sm truncate flex-1 ${
          darkMode ? 'text-slate-100' : 'text-slate-900'
        } ${mirrored ? 'text-left' : 'text-right'}`}>
          {rua.destino_exibicao}
        </span>

        <div className={`flex items-center gap-3.5 shrink-0 font-mono text-xs ${mirrored ? '' : 'flex-row-reverse'}`}>
          <span className="font-bold" style={{ color: agingTheme.text }}>
            {rua.aging_formatado || '0h 00min'}
          </span>

          <span className={`font-bold min-w-[35px] text-center ${
            darkMode ? 'text-slate-200' : 'text-slate-700'
          }`}>
            {ocupado}/{cap}
          </span>

          <span className="font-black text-sm min-w-[40px] text-right" style={{ color: theme.text }}>
            {pct.toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      {mirrored ? <>{numero}{barra}</> : <>{barra}{numero}</>}
    </div>
  );
}
