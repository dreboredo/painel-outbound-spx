import React, { useEffect, useState, useRef } from 'react';
import * as htmlToImage from 'html-to-image';
import mascoteImg from './assets/shopito.png'; // ajuste o caminho se necessário
import { supabase } from './lib/supabase';
import { RefreshCw, Filter, Truck, Clock, Package, Layers, RotateCcw, ChevronDown, Check, Home, Search, Box, FileText, X, Camera } from 'lucide-react';

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
// PARSERS E TRATAMENTO DE STRING/DATA
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

function limparNomeDestino(str) {
  if (!str) return '';

  const tratarUnico = (item) => {
    let clean = String(item).trim();

    clean = clean.replace(/\[?\d*\]?SoC[_\s]ES[_\s]Viana/gi, '').trim();
    clean = clean.replace(/\[.*?\]/g, '').trim();
    clean = clean.replace(/[_]+/g, ' ').trim();
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
    <div className="min-h-screen p-4 md:p-6 space-y-5 bg-white text-slate-800 font-sans">
      
      {/* CABEÇALHO */}
      <header className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <img 
              src={mascoteImg} 
              alt="Mascote Shopee" 
              className="h-12 w-auto object-contain" 
            />
            <h1 className="text-2xl font-black tracking-wider uppercase font-mono" style={{ color: SHOPEE_PALETTE.navy }}>
              Overview Ruas <span className="text-slate-300">/</span> Stage Out
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            
            <MultiSelectDropdown
              label="Destinos"
              options={destinosUnicos}
              selected={selectedDestinos}
              setSelected={setSelectedDestinos}
              icon={Filter}
            />

            <MultiSelectDropdown
              label="Ruas"
              options={opcoesRuas}
              selected={selectedRuas}
              setSelected={setSelectedRuas}
              icon={Home}
            />

            <MultiSelectDropdown
              label="Unitizador"
              options={opcoesUnitizadores}
              selected={selectedUnitizadores}
              setSelected={setSelectedUnitizadores}
              icon={Box}
            />

            <button
              onClick={handleResetFilters}
              disabled={!hasActiveFilters}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition h-[38px] ${
                hasActiveFilters
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer shadow-sm'
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

        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-200">
          <p>Monitoramento Operacional em Tempo Real</p>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowReportModal(true)}
              className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs rounded-md shadow-sm transition-all cursor-pointer"
            >
              <FileText size={14} />
              <span>Report Hora a Hora</span>
            </button>

            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-md border border-slate-200 font-mono font-bold text-xs shadow-sm text-slate-700">
              <Clock size={13} className="animate-pulse" style={{ color: SHOPEE_PALETTE.orange }} />
              <span>{horaAtual.toLocaleTimeString('pt-BR')}</span>
            </div>

            {ultimaSinc && (
              <span className="font-mono text-[11px] bg-slate-200/60 px-2 py-0.5 rounded">
                Última sync: {ultimaSinc}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* CARDS KPIS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Capacidade Total" value={capacidadeTotal} color={SHOPEE_PALETTE.navy} />
        <KpiCard label="Gaiolas" value={totalGaiolas} color="#8B5CF6" icon={Package} />
        <KpiCard label="Scuttles" value={totalScuttles} color="#0284C7" icon={Layers} />
        <KpiCard label="Total Ocupado" value={totalOcupado} color={SHOPEE_PALETTE.blue} />
        <KpiCard label="% Ocupada" value={`${pctOcupadaNum.toFixed(2)}%`} color={getStatusTheme(pctOcupadaNum).text} />
        <KpiCard label="Ruas Livres" value={ruasLivresCount} color={SHOPEE_PALETTE.cyan} icon={Home} highlight />
      </div>

      {/* CPTS E DOCAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
        <section className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center gap-2 font-bold uppercase text-xs" style={{ color: SHOPEE_PALETTE.blue }}>
            <Clock size={16} />
            <span>Próximos CPTs</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {cptsList.length > 0 ? (
              cptsList.map((item) => <CptCard key={item.id} item={item} />)
            ) : (
              <div className="col-span-6 text-center text-slate-400 py-3">Sem CPTs disponíveis</div>
            )}
          </div>
        </section>

        <section className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center gap-2 font-bold uppercase text-xs" style={{ color: SHOPEE_PALETTE.cyan }}>
            <Truck size={16} />
            <span>Docas / Veículos Docados</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {docasList.length > 0 ? (
              docasList.map((doca) => <DocaCard key={doca.id} doca={doca} horaAtual={horaAtual} />)
            ) : (
              <div className="col-span-6 text-center text-slate-400 py-3">Sem Docas ativas</div>
            )}
          </div>
        </section>
      </div>

      {/* GRID DAS RUAS */}
      <div className="pt-2 space-y-4">
        <div className="flex items-center justify-center gap-4 w-full">
          <div className="h-[1px] bg-slate-200 flex-1" />
          <h2 className="text-sm font-black tracking-widest uppercase bg-slate-100 text-slate-800 px-5 py-1.5 rounded-full border border-slate-300 shadow-sm">
            Stage Out — Ruas
          </h2>
          <div className="h-[1px] bg-slate-200 flex-1" />
        </div>

        <div className="flex items-center justify-between px-2 text-xs">
          <div className="font-bold text-slate-500 uppercase tracking-wider">
            Pares
          </div>

          <div className="flex items-center justify-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setOrdenacao('numero')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer text-xs ${
                ordenacao === 'numero'
                  ? 'bg-white text-slate-900 font-black shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Número
            </button>

            <button
              onClick={() => setOrdenacao('aging')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer text-xs ${
                ordenacao === 'aging'
                  ? 'bg-white text-slate-900 font-black shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Aging
            </button>

            <button
              onClick={() => setOrdenacao('ocupacao')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer text-xs ${
                ordenacao === 'ocupacao'
                  ? 'bg-white text-slate-900 font-black shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ocupação
            </button>
          </div>

          <div className="font-bold text-slate-500 uppercase tracking-wider">
            Ímpares
          </div>
        </div>

        {ruasFiltradasPorDestinoERua.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-12 border border-dashed border-slate-300 rounded-xl bg-slate-50">
            Nenhuma rua encontrada para os filtros selecionados.
          </div>
        ) : (
          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="hidden lg:block absolute inset-y-0 left-1/2 -translate-x-1/2 w-px border-l border-dashed border-slate-300" />

            <div className="space-y-2.5">
              {ruasPares.length === 0 ? (
                <div className="text-xs text-slate-400 italic px-1 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                  Nenhuma rua par encontrada.
                </div>
              ) : (
                ruasPares.map((rua, idx) => (
                  <RuaCard key={rua.id || `par-${idx}`} rua={rua} calculaMetricasRua={calculaMetricasRua} />
                ))
              )}
            </div>

            <div className="space-y-2.5">
              {ruasImpares.length === 0 ? (
                <div className="text-xs text-slate-400 italic px-1 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                  Nenhuma rua ímpar encontrada.
                </div>
              ) : (
                ruasImpares.map((rua, idx) => (
                  <RuaCard key={rua.id || `impar-${idx}`} rua={rua} mirrored calculaMetricasRua={calculaMetricasRua} />
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL REPORT HORA A HORA */}
      {showReportModal && (
        <ReportModal
          onClose={() => setShowReportModal(false)}
          capacidadeTotal={capacidadeTotal}
          totalOcupado={totalOcupado}
          pctOcupada={pctOcupadaNum}
          reportDestinos={reportDestinos}
        />
      )}
    </div>
  );
}

// =====================================================================
// MODAL DE REPORT (LAYOUT AJUSTADO: RESUMO MENOR E CABEÇALHO EM 1 LINHA)
// =====================================================================

function ReportModal({ onClose, capacidadeTotal, totalOcupado, pctOcupada, reportDestinos }) {
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
        backgroundColor: '#FFFFFF',
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
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-8">
        
        {/* CABEÇALHO DO MODAL */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition cursor-pointer"
          >
            <X size={16} />
            <span>Voltar ao Dashboard</span>
          </button>

          <h3 className="text-base md:text-lg font-black uppercase font-mono text-orange-600 tracking-wider">
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

        {/* ÁREA CAPTURADA PELO PRINT */}
        <div ref={printAreaRef} className="p-4 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
            
            {/* CARDS ESQUERDA (RESUMO GERAL MENOR - 1 COLUNA DE 4) */}
            <div className="md:col-span-1 border border-slate-200 rounded-lg overflow-hidden bg-slate-50 shadow-sm text-xs font-mono font-bold">
              <div className="bg-orange-500 text-white py-2 px-2 text-center font-black font-sans uppercase text-[11px] tracking-wider whitespace-nowrap">
                RESUMO GERAL
              </div>
              <div className="divide-y divide-slate-200">
                <div className="py-2 px-2 flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">CAPACIDADE</span>
                  <span className="text-slate-900 font-black">{capacidadeTotal}</span>
                </div>
                <div className="py-2 px-2 flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">OCUPADO</span>
                  <span className="text-slate-900 font-black">{totalOcupado}</span>
                </div>
                <div className="py-2 px-2 flex justify-between items-center bg-amber-50 text-[11px]">
                  <span className="text-amber-800">% OCUPADA</span>
                  <span className="text-amber-700 font-black">{pctOcupada.toFixed(2)}%</span>
                </div>
                <div className="py-2 px-2 flex justify-between items-center bg-emerald-50 text-[11px]">
                  <span className="text-emerald-800">% LIVRE</span>
                  <span className="text-emerald-700 font-black">{pctLivre}%</span>
                </div>
              </div>
            </div>

            {/* TABELA DIREITA (AMPLIADA - 3 COLUNAS DE 4) */}
            <div className="md:col-span-3 border border-slate-200 rounded-lg overflow-hidden bg-white text-xs shadow-sm">
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
                  <div className="divide-y divide-slate-100">
                    {reportDestinos.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center py-1.5 px-3 hover:bg-slate-50 transition">
                        <span className="font-bold text-slate-800 pr-2 leading-snug">
                          {item.destino}
                        </span>
                        
                        <div className="flex items-center gap-3 font-mono text-center shrink-0">
                          <span className="w-14 text-slate-600 font-semibold">{item.gaiolas}</span>
                          <span className="w-14 text-slate-600 font-semibold">{item.scuttles}</span>
                          <span className="w-24 font-black text-slate-900 bg-orange-50 border border-orange-200 rounded py-0.5 px-1 text-center">
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
// OUTROS COMPONENTES AUXILIARES
// =====================================================================

function MultiSelectDropdown({ label, options, selected, setSelected, icon: Icon }) {
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

  const filteredOptions = options.filter(opt =>
    String(opt).toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs h-[38px] shadow-sm hover:border-slate-300 cursor-pointer text-slate-700 font-semibold"
      >
        {Icon && <Icon size={14} style={{ color: SHOPEE_PALETTE.orange }} />}
        <span>
          {selected.length === 0
            ? `Todos (${label})`
            : `${label}: ${selected.length} selecionado(s)`}
        </span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-64 bg-white rounded-xl border border-slate-200 shadow-xl z-50 p-2 text-xs max-h-80 flex flex-col space-y-1.5">
          {options.length > 5 && (
            <div className="relative px-1 pt-1 pb-0.5">
              <Search size={13} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder={`Pesquisar ${label.toLowerCase()}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-orange-500 focus:bg-white text-slate-700"
              />
            </div>
          )}

          <div
            onClick={toggleSelectAll}
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer font-bold border-b border-slate-100 text-slate-800 shrink-0"
          >
            <div className={`w-4 h-4 rounded border flex items-center justify-center ${selected.length === options.length ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-300'}`}>
              {selected.length === options.length && <Check size={12} />}
            </div>
            <span>Selecionar Todos</span>
          </div>

          <div className="overflow-y-auto space-y-0.5 max-h-48 pr-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => {
                const isChecked = selected.includes(opt);
                return (
                  <div
                    key={opt}
                    onClick={() => toggleOption(opt)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-slate-700 font-medium"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-300'}`}>
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

function KpiCard({ label, value, color, icon: Icon, highlight = false }) {
  return (
    <div className={`p-3.5 rounded-xl border flex flex-col justify-between shadow-sm transition-all ${
      highlight ? 'bg-teal-50/50 border-teal-200' : 'bg-slate-50 border-slate-200'
    }`}>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={14} style={{ color }} />}
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate">{label}</span>
      </div>
      <span className="text-3xl font-black font-mono mt-1" style={{ color }}>{value}</span>
    </div>
  );
}

function CptCard({ item }) {
  const isArrived = String(item.status || '').trim().toLowerCase() === 'arrived';

  return (
    <div 
      className={`border p-2 rounded-lg text-center flex flex-col items-center justify-center gap-1.5 shadow-sm transition-all min-h-[96px] ${
        isArrived 
          ? 'bg-blue-50/80 border-[#1665C4]' 
          : 'bg-white border-slate-200'
      }`}
    >
      <span className="font-bold text-slate-800 text-xs tracking-wide truncate w-full" title={item.destino}>
        {item.destino}
      </span>
      <span 
        className="font-mono font-black text-xs leading-none" 
        style={{ color: isArrived ? SHOPEE_PALETTE.lightBlue : SHOPEE_PALETTE.blue }}
      >
        {item.cpt}
      </span>
      <span className="text-[10px] font-semibold text-slate-600 truncate w-full" title={item.tipoVeiculo}>
        {item.tipoVeiculo}
      </span>
      <span className="text-[10px] font-medium text-slate-400 truncate w-full">
        {item.pacotes.includes('pcts') ? item.pacotes : `${item.pacotes} pcts`}
      </span>
    </div>
  );
}

function DocaCard({ doca, horaAtual }) {
  const cptTheme = doca.ativa ? getCptTheme(doca.cpt, horaAtual) : NEUTRAL_THEME;

  return (
    <div 
      className="p-2 rounded-lg text-center flex flex-col items-center justify-center gap-1.5 transition-all shadow-sm border-2 min-h-[96px]"
      style={{
        backgroundColor: doca.ativa ? cptTheme.bg : '#F1F2F3',
        borderColor: doca.ativa ? cptTheme.border : '#E2E8F0',
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
          style={{ color: doca.ativa ? cptTheme.text : '#64748B' }}
        >
          {doca.id}
        </span>
      </div>

      <span className={`font-bold text-xs tracking-wide truncate w-full ${doca.ativa ? 'text-slate-800' : 'text-slate-400'}`} title={doca.veiculo}>
        {doca.ativa ? doca.veiculo : '-'}
      </span>

      <span className={`font-mono font-bold text-xs leading-none ${doca.ativa ? '' : 'text-slate-400'}`} style={{ color: doca.ativa ? cptTheme.text : undefined }}>
        {doca.ativa ? doca.cpt : '-'}
      </span>

      <span className={`text-[10px] font-medium truncate w-full ${doca.ativa ? 'text-slate-600' : 'text-slate-400'}`}>
        {doca.ativa ? doca.pedidosCarregados : '-'}
      </span>
    </div>
  );
}

function RuaCard({ rua, mirrored = false, calculaMetricasRua }) {
  const { cap, ocupado } = calculaMetricasRua(rua);
  const pct = cap > 0 ? (ocupado / cap) * 100 : 0;
  
  const numStr = rua.numero_rua_str;
  const theme = getStatusTheme(pct);
  const agingTheme = getAgingTheme(rua.aging_formatado);

  const numero = (
    <div className="font-mono text-slate-800 font-black text-xs md:text-sm w-12 text-center shrink-0 bg-slate-100 border border-slate-300 py-2.5 rounded-lg shadow-sm">
      {numStr}
    </div>
  );

  const dynamicBackground = getDynamicGradient(pct, mirrored);

  const barra = (
    <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3 relative overflow-hidden shadow-sm">
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
        <span className={`font-black tracking-wide text-xs md:text-sm truncate flex-1 text-slate-900 ${mirrored ? 'text-left' : 'text-right'}`}>
          {rua.destino_exibicao}
        </span>

        <div className={`flex items-center gap-3.5 shrink-0 font-mono text-xs ${mirrored ? '' : 'flex-row-reverse'}`}>
          <span className="font-bold" style={{ color: agingTheme.text }}>
            {rua.aging_formatado || '0h 00min'}
          </span>

          <span className="text-slate-700 font-bold min-w-[35px] text-center">
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
